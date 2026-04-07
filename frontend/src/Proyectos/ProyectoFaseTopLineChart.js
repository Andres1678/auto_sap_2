import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const DEFAULT_PHASE_ORDER = [
  "DESCUBRIR",
  "PREPARAR",
  "EXPLORAR",
  "REALIZAR",
  "DESPLEGAR",
  "OPERAR",
];

const LINE_COLORS = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#9333ea",
  "#ea580c",
];

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const normKey = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const getHorasRegistro = (r) =>
  toNum(
    r?.horasNum ??
      r?.total_horas ??
      r?.totalHoras ??
      r?.tiempoInvertido ??
      r?.tiempo_invertido ??
      0
  );

const getProyectoId = (r) =>
  String(r?.proyecto_id ?? r?.proyecto?.id ?? "").trim();

const getProyectoNombre = (r) => {
  const codigo = String(r?.proyecto_codigo ?? r?.proyecto?.codigo ?? "").trim();
  const nombre = String(r?.proyecto_nombre ?? r?.proyecto?.nombre ?? "").trim();

  if (codigo && nombre) return `${codigo} - ${nombre}`;
  if (codigo) return codigo;
  if (nombre) return nombre;
  return "SIN PROYECTO";
};

const getFaseNombre = (r) => {
  const directa = String(
    r?.fase_proyecto?.nombre ??
      r?.proyecto_fase ??
      r?.fase_nombre ??
      r?.fase ??
      ""
  ).trim();

  return directa || "SIN FASE";
};

const getPhaseRank = (fase) => {
  const key = normKey(fase);
  const idx = DEFAULT_PHASE_ORDER.indexOf(key);
  return idx === -1 ? 999 : idx;
};

function ProyectoFasesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const visibles = payload
    .filter((p) => Number(p?.value || 0) > 0)
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        minWidth: 260,
        maxWidth: 360,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>

      {visibles.length === 0 ? (
        <div style={{ fontSize: 13 }}>Sin horas registradas en esta fase.</div>
      ) : (
        visibles.map((item) => (
          <div
            key={item.dataKey}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span>{item.name}</span>
            <b>{Number(item.value || 0).toFixed(2)} h</b>
          </div>
        ))
      )}
    </div>
  );
}

export default function ProyectoFasesRegistradasLineChart({
  rows = [],
  title = "Horas por fases registradas del proyecto",
}) {
  const { data, series } = useMemo(() => {
    const arr = Array.isArray(rows) ? rows : [];

    const proyectosMap = new Map();
    const fasesSet = new Set();
    const horasMap = new Map();

    for (const r of arr) {
      const proyectoId = getProyectoId(r);
      if (!proyectoId) continue;

      const proyectoNombre = getProyectoNombre(r);
      const fase = getFaseNombre(r);
      const horas = getHorasRegistro(r);

      if (!fase) continue;

      proyectosMap.set(proyectoId, proyectoNombre);
      fasesSet.add(fase);

      const comboKey = `${proyectoId}__${fase}`;
      horasMap.set(comboKey, toNum(horasMap.get(comboKey)) + horas);
    }

    const fasesOrdenadas = Array.from(fasesSet).sort((a, b) => {
      const ra = getPhaseRank(a);
      const rb = getPhaseRank(b);

      if (ra !== rb) return ra - rb;
      return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
    });

    const proyectosOrdenados = Array.from(proyectosMap.entries())
      .map(([id, name], idx) => ({
        projectId: id,
        seriesKey: `proyecto_${id}`,
        name,
        color: LINE_COLORS[idx % LINE_COLORS.length],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

    const data = fasesOrdenadas.map((fase) => {
      const row = { fase };

      proyectosOrdenados.forEach((p) => {
        const comboKey = `${p.projectId}__${fase}`;
        row[p.seriesKey] = +toNum(horasMap.get(comboKey)).toFixed(2);
      });

      return row;
    });

    return {
      data,
      series: proyectosOrdenados,
    };
  }, [rows]);

  if (!data.length || !series.length) {
    return (
      <div className="phd-card phd-card-chart">
        <div className="phd-card-head">
          <h4>{title}</h4>
        </div>
        <div className="phd-empty">Sin datos con los filtros.</div>
      </div>
    );
  }

  return (
    <div className="phd-card phd-card-chart">
      <div className="phd-card-head">
        <h4>{title}</h4>
        <span className="phd-card-badge">{series.length} proyectos</span>
      </div>

      {series.length > 8 && (
        <div
          style={{
            padding: "0 20px 6px",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          Hay varios proyectos al tiempo; para verlo más claro usa el filtro de proyecto.
        </div>
      )}

      <div className="phd-chartWrap">
        <div className="phd-chartInner">
          <ResponsiveContainer width="100%" height={430}>
            <LineChart data={data} margin={{ top: 20, right: 24, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="fase"
                interval={0}
                angle={-12}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}`} />
              <Tooltip content={<ProyectoFasesTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              {series.map((s) => (
                <Line
                  key={s.seriesKey}
                  type="monotone"
                  dataKey={s.seriesKey}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
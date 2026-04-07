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

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

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
  String(
    r?.proyecto_id ??
      r?.proyecto?.id ??
      ""
  ).trim();

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

  if (directa) return directa;

  return "SIN FASE";
};

function ProyectoFaseTopTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        minWidth: 250,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        <b>Fase top:</b> {row?.faseTop || "—"}
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        <b>Horas proyecto:</b> {Number(row?.horasProyecto || 0).toFixed(2)} h
      </div>
      <div style={{ fontSize: 13 }}>
        <b>Horas fase top:</b> {Number(row?.horasFaseTop || 0).toFixed(2)} h
      </div>
    </div>
  );
}

export default function ProyectoFaseTopLineChart({
  rows = [],
  title = "Proyecto vs fase más trabajada",
  top = 10,
}) {
  const data = useMemo(() => {
    const proyectosMap = new Map();

    for (const r of Array.isArray(rows) ? rows : []) {
      const proyectoId = getProyectoId(r);
      if (!proyectoId) continue;

      const proyectoNombre = getProyectoNombre(r);
      const faseNombre = getFaseNombre(r);
      const horas = getHorasRegistro(r);

      if (!proyectosMap.has(proyectoId)) {
        proyectosMap.set(proyectoId, {
          key: proyectoId,
          name: proyectoNombre,
          horasProyecto: 0,
          fases: new Map(),
        });
      }

      const current = proyectosMap.get(proyectoId);
      current.horasProyecto += horas;
      current.fases.set(
        faseNombre,
        toNum(current.fases.get(faseNombre)) + horas
      );
    }

    return Array.from(proyectosMap.values())
      .map((p) => {
        let faseTop = "SIN FASE";
        let horasFaseTop = 0;

        for (const [fase, horas] of p.fases.entries()) {
          if (horas > horasFaseTop) {
            faseTop = fase;
            horasFaseTop = horas;
          }
        }

        return {
          key: p.key,
          name: p.name,
          horasProyecto: +p.horasProyecto.toFixed(2),
          horasFaseTop: +horasFaseTop.toFixed(2),
          faseTop,
        };
      })
      .sort((a, b) => b.horasProyecto - a.horasProyecto)
      .slice(0, top);
  }, [rows, top]);

  if (!data.length) {
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
        <span className="phd-card-badge">{data.length} proyectos</span>
      </div>

      <div className="phd-chartWrap">
        <div className="phd-chartInner">
          <ResponsiveContainer width="100%" height={430}>
            <LineChart
              data={data}
              margin={{ top: 20, right: 24, left: 10, bottom: 95 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                interval={0}
                angle={-18}
                textAnchor="end"
                height={95}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}`} />
              <Tooltip content={<ProyectoFaseTopTooltip />} />
              <Legend />

              <Line
                type="monotone"
                dataKey="horasProyecto"
                name="Horas del proyecto"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />

              <Line
                type="monotone"
                dataKey="horasFaseTop"
                name="Horas de la fase top"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
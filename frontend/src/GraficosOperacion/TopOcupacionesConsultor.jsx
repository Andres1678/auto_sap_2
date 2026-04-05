
import React, { useEffect, useMemo, useState } from "react";
import { jfetch } from "../lib/api";

const nf = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtHours(v) {
  return `${nf.format(Number(v || 0))} h`;
}

function fmtPct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function safeOcupacionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.ocupaciones)) return payload.ocupaciones;
  return [];
}

function normalizeOcupacion(row) {
  const codigo = normalizeText(
    row?.ocupacion_codigo || row?.codigo || row?.ocupacionCodigo
  );
  const nombre = normalizeText(
    row?.ocupacion_nombre || row?.nombre || row?.ocupacionNombre || row?.ocupacion
  );
  const horas = Number(row?.horas || row?.tiempoInvertido || row?.tiempo || 0);

  const label =
    codigo && nombre
      ? `${codigo} - ${nombre}`
      : nombre || codigo || "SIN OCUPACIÓN";

  return {
    name: label,
    horas,
  };
}

function buildTop(rows, maxItems = 6) {
  const mapa = new Map();

  rows
    .map(normalizeOcupacion)
    .filter((item) => item.horas > 0)
    .forEach((item) => {
      const key = item.name;
      const actual = mapa.get(key) || { name: item.name, horas: 0 };
      actual.horas += Number(item.horas || 0);
      mapa.set(key, actual);
    });

  const base = Array.from(mapa.values()).sort((a, b) => b.horas - a.horas);

  const totalHoras = base.reduce((acc, item) => acc + item.horas, 0);

  if (!base.length || totalHoras <= 0) {
    return { totalHoras: 0, items: [] };
  }

  const visibles = base.slice(0, maxItems);
  const resto = base.slice(maxItems);

  if (resto.length > 0) {
    visibles.push({
      name: "Otros",
      horas: resto.reduce((acc, item) => acc + item.horas, 0),
    });
  }

  return {
    totalHoras,
    items: visibles.map((item) => ({
      ...item,
      pct: totalHoras > 0 ? (item.horas * 100) / totalHoras : 0,
    })),
  };
}

export default function TopOcupacionesConsultorChart({
  consultor,
  equipo,
  mes,
  anio,
  maxItems = 6,
  endpoint = "/capacidad-semanal-ocupaciones",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!consultor || !mes || !anio) {
        setRows([]);
        setError("");
        setLoading(false);
        return;
    }

    let active = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();
        qs.set("mes", String(mes));
        qs.set("anio", String(anio));
        qs.set("consultor", String(consultor));
        if (equipo) qs.set("equipo", String(equipo));

        const res = await jfetch(`${endpoint}?${qs.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        if (!active) return;
        setRows(safeOcupacionRows(json));
      } catch (e) {
        if (!active) return;
        setError(e?.message || "No se pudo cargar el top de ocupaciones");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [consultor, equipo, mes, anio, endpoint]);

  const topData = useMemo(() => buildTop(rows, maxItems), [rows, maxItems]);

  return (
    <aside className="capacidad-ocupaciones-card">
      <div className="ocup-card-head">
        <div>
          <h5>Top ocupaciones</h5>
          <p>{consultor || "Sin consultor"}</p>
        </div>

        <span className="ocup-card-badge">
          {fmtHours(topData.totalHoras)}
        </span>
      </div>

      {loading && (
        <div className="ocup-state">Cargando ocupaciones…</div>
      )}

      {!loading && error && (
        <div className="ocup-state ocup-state-error">{error}</div>
      )}

      {!loading && !error && topData.items.length === 0 && (
        <div className="ocup-state">
          Sin horas por ocupación para este consultor.
        </div>
      )}

      {!loading && !error && topData.items.length > 0 && (
        <div className="ocup-list">
          {topData.items.map((item, index) => (
            <article
              key={`${consultor || "sin-consultor"}-${item.name}-${index}`}
              className="ocup-item"
            >
              <div className="ocup-item-head">
                <span className="ocup-rank">#{index + 1}</span>

                <div className="ocup-main">
                  <strong className="ocup-name" title={item.name}>
                    {item.name}
                  </strong>
                  <span className="ocup-hours">{fmtHours(item.horas)}</span>
                </div>
              </div>

              <div className="ocup-bar">
                <div
                  className="ocup-bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, item.pct))}%` }}
                />
              </div>

              <div className="ocup-foot">
                <span>{fmtPct(item.pct)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

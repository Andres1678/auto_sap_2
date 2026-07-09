import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./PromedioAtencionCoeSap.css";

const EMPTY_FILTERS = {
  q: "",
  sociedad: "",
  anio: "",
  mes: "",
  estadoConsolidado: "",
  modulo: "",
  tipoSolicitud: "",
  responsableEstado: "",
  controlHoras: "",
};

function readStoredUser() {
  try {
    const raw =
      localStorage.getItem("userData") ||
      localStorage.getItem("user") ||
      sessionStorage.getItem("userData") ||
      sessionStorage.getItem("user") ||
      "{}";

    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizePermisos(user) {
  const raw = user?.permisos || user?.user?.permisos || [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((p) => (typeof p === "string" ? p : p?.codigo || p?.code || p?.nombre))
    .filter(Boolean)
    .map((p) => String(p).trim().toUpperCase());
}

function numberText(value, decimals = 2) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";

  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function intText(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("es-CO");
}

function cleanText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function buildQuery(filters) {
  const qs = new URLSearchParams();

  Object.entries(filters || {}).forEach(([key, value]) => {
    const s = String(value ?? "").trim();
    if (!s) return;

    qs.set(key, s);
  });

  return qs.toString();
}

function optionItems(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          value: item.value ?? item.label ?? "",
          label: item.label ?? item.value ?? "",
        };
      }

      return {
        value: item,
        label: item,
      };
    })
    .filter((item) => String(item.value ?? "").trim() !== "");
}

function SimpleSelect({ label, value, options, onChange }) {
  return (
    <label className="coeavg-filter">
      <span>{label}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {optionItems(options).map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({ title, value, sub, tone = "default" }) {
  return (
    <article className={`coeavg-metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}

function AvgBars({ rows }) {
  const max = useMemo(() => {
    const nums = [];

    (rows || []).forEach((row) => {
      nums.push(Number(row.promedioTiempoRespuesta || 0));
      nums.push(Number(row.promedioTiempoResolucion || 0));
      nums.push(Number(row.promedioTiempoCierre || 0));
    });

    return Math.max(...nums, 0);
  }, [rows]);

  return (
    <section className="coeavg-card coeavg-bars-card">
      <div className="coeavg-card-head">
        <div>
          <h2>Comportamiento por periodo</h2>
          <p>Promedios en días calendario por año y mes.</p>
        </div>
      </div>

      <div className="coeavg-period-list">
        {!rows?.length ? (
          <div className="coeavg-empty small">Sin datos para graficar.</div>
        ) : (
          rows.map((row) => {
            const bars = [
              { label: "Respuesta", value: Number(row.promedioTiempoRespuesta || 0) },
              { label: "Resolución", value: Number(row.promedioTiempoResolucion || 0) },
              { label: "Cierre", value: Number(row.promedioTiempoCierre || 0) },
            ];

            return (
              <div className="coeavg-period-row" key={`bar-${row.periodo}`}>
                <div className="coeavg-period-title">
                  <strong>{cleanText(row.periodo)}</strong>
                  <span>{cleanText(row.mesNombre)} • {intText(row.cantidad)} casos</span>
                </div>

                <div className="coeavg-period-bars">
                  {bars.map((bar) => {
                    const pct = max > 0 ? Math.max(4, Math.round((bar.value / max) * 100)) : 0;

                    return (
                      <div className="coeavg-mini-bar" key={`${row.periodo}-${bar.label}`}>
                        <span>{bar.label}</span>
                        <div>
                          <em style={{ width: `${pct}%` }} />
                        </div>
                        <strong>{numberText(bar.value)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default function PromedioAtencionCoeSap() {
  const user = useMemo(() => readStoredUser(), []);
  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState({});
  const [opciones, setOpciones] = useState({});
  const [loading, setLoading] = useState(false);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchPromedios = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/promedio-atencion${qs ? `?${qs}` : ""}`;

      const res = await jfetch(url, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setRows(Array.isArray(data?.data) ? data.data : []);
      setResumen(data?.resumen || {});
      setOpciones(data?.opciones || {});
    } catch (error) {
      console.error("Error promedio atención COE SAP:", error);
      setRows([]);
      setResumen({});

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar promedio de atención",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, appliedFilters]);

  useEffect(() => {
    fetchPromedios();
  }, [fetchPromedios]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  if (!canView) {
    return (
      <div className="coeavg-page">
        <div className="coeavg-access-card">
          <div className="coeavg-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coeavg-page">
      <section className="coeavg-hero">
        <div>
          <span className="coeavg-eyebrow">Promedio de atención</span>
          <h1>Promedio de atención COE SAP Funcional</h1>
          <p>
            Promedios por mes en días calendario: tiempo de respuesta, resolución y cierre.
          </p>
        </div>

        <div className="coeavg-hero-actions">
          <button type="button" className="coeavg-btn light" onClick={fetchPromedios} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </section>

      <section className="coeavg-card coeavg-filters-card">
        <div className="coeavg-card-head">
          <div>
            <h2>Filtros</h2>
            <p>Filtra por sociedad, año, mes, estado, módulo o responsable.</p>
          </div>

          <button type="button" className="coeavg-btn ghost" onClick={clearFilters} disabled={loading}>
            Limpiar
          </button>
        </div>

        <div className="coeavg-filters-grid">
          <label className="coeavg-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="ID, asunto, observaciones, sociedad..."
              onChange={(e) => updateFilter("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>

          <SimpleSelect label="Sociedad" value={filters.sociedad} options={opciones.sociedad} onChange={(v) => updateFilter("sociedad", v)} />
          <SimpleSelect label="Año" value={filters.anio} options={opciones.anio} onChange={(v) => updateFilter("anio", v)} />
          <SimpleSelect label="Mes" value={filters.mes} options={opciones.mes} onChange={(v) => updateFilter("mes", v)} />
          <SimpleSelect label="Estado consolidado" value={filters.estadoConsolidado} options={opciones.estadoConsolidado} onChange={(v) => updateFilter("estadoConsolidado", v)} />
          <SimpleSelect label="Módulo" value={filters.modulo} options={opciones.modulo} onChange={(v) => updateFilter("modulo", v)} />
          <SimpleSelect label="Tipo solicitud" value={filters.tipoSolicitud} options={opciones.tipoSolicitud} onChange={(v) => updateFilter("tipoSolicitud", v)} />
          <SimpleSelect label="Responsable" value={filters.responsableEstado} options={opciones.responsableEstado} onChange={(v) => updateFilter("responsableEstado", v)} />
          <SimpleSelect label="Control horas" value={filters.controlHoras} options={opciones.controlHoras} onChange={(v) => updateFilter("controlHoras", v)} />
        </div>

        <div className="coeavg-actions">
          <button type="button" className="coeavg-btn danger" onClick={applyFilters} disabled={loading}>
            {loading ? "Consultando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="coeavg-btn light" onClick={clearFilters} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      {loading && rows.length === 0 ? (
        <section className="coeavg-card coeavg-loading-card">
          <div className="coeavg-loader" />
          Cargando promedios...
        </section>
      ) : (
        <>
          <section className="coeavg-metrics-grid">
            <MetricCard title="Cantidad casos" value={intText(resumen.cantidad)} sub="Casos filtrados" tone="dark" />
            <MetricCard title="Promedio respuesta" value={`${numberText(resumen.promedioTiempoRespuesta)} días`} sub="Días calendario" tone="info" />
            <MetricCard title="Promedio resolución" value={`${numberText(resumen.promedioTiempoResolucion)} días`} sub="Días calendario" tone="warn" />
            <MetricCard title="Promedio cierre" value={`${numberText(resumen.promedioTiempoCierre)} días`} sub="Días calendario" tone="ok" />
          </section>

          <AvgBars rows={rows} />

          <section className="coeavg-card coeavg-table-card">
            <div className="coeavg-table-head">
              <div>
                <h2>Detalle por año y mes</h2>
                <p>Los valores corresponden a días calendario.</p>
              </div>
            </div>

            <div className="coeavg-table-wrap">
              <table className="coeavg-table">
                <thead>
                  <tr>
                    <th>Año</th>
                    <th>Mes</th>
                    <th>Periodo</th>
                    <th>Cantidad casos</th>
                    <th>Promedio tiempo respuesta</th>
                    <th>Promedio tiempo resolución</th>
                    <th>Promedio tiempo cierre</th>
                  </tr>
                </thead>

                <tbody>
                  {!rows.length ? (
                    <tr>
                      <td colSpan="7" className="coeavg-empty">No hay información para mostrar.</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={`avg-${row.periodo}`}>
                        <td className="center">{cleanText(row.anio)}</td>
                        <td>{cleanText(row.mesNombre)}</td>
                        <td className="mono strong">{cleanText(row.periodo)}</td>
                        <td className="right">{intText(row.cantidad)}</td>
                        <td className="right">{numberText(row.promedioTiempoRespuesta)} días</td>
                        <td className="right">{numberText(row.promedioTiempoResolucion)} días</td>
                        <td className="right">{numberText(row.promedioTiempoCierre)} días</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

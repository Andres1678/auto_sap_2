import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./DashboardClientesCoeSap.css";

const EMPTY_FILTERS = {
  q: "",
  sociedad: "",
  clienteAsociadoNombre: "",
  validarCliente: "",
  anio: "",
  mes: "",
  estadoConsolidado: "",
  estadoPrincipal: "",
  subestado: "",
  validarEstadoControl: "",
  modulo: "",
  tipoSolicitud: "",
  responsableEstado: "",
  controlHoras: "",
  liderClaro: "",
  asignadoA: "",
};

const PIE_COLORS = [
  "#7f63a8",
  "#c94f4f",
  "#5a8cc9",
  "#9abc56",
  "#f2b84b",
  "#4aa889",
  "#b85ca5",
  "#60758f",
];

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

function cleanText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function numberText(value, decimals = 0) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";

  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function moneyText(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "$0";

  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getFilenameFromDisposition(disposition, fallback) {
  const header = disposition || "";
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const normalMatch = header.match(/filename="?([^";]+)"?/i);
  if (normalMatch?.[1]) return normalMatch[1];

  return fallback;
}

async function downloadExcelFile(url, headers, fallbackName) {
  const res = await jfetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {}

    throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const filename = getFilenameFromDisposition(
    res.headers.get("Content-Disposition"),
    fallbackName
  );

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
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
    <label className="coedash-filter">
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
    <article className={`coedash-metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}

function BarList({ title, rows, labelKey, valueKey = "cantidad", emptyText = "Sin datos" }) {
  const max = useMemo(() => {
    const nums = (rows || []).map((r) => Number(r?.[valueKey] || 0));
    return Math.max(...nums, 0);
  }, [rows, valueKey]);

  return (
    <section className="coedash-panel">
      <div className="coedash-panel-head">
        <h2>{title}</h2>
      </div>

      <div className="coedash-bar-list">
        {!rows?.length ? (
          <div className="coedash-empty small">{emptyText}</div>
        ) : (
          rows.map((row, index) => {
            const value = Number(row?.[valueKey] || 0);
            const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;

            return (
              <div key={`${title}-${index}-${row?.[labelKey]}`} className="coedash-bar-row">
                <div className="coedash-bar-info">
                  <span>{cleanText(row?.[labelKey])}</span>
                  <strong>{numberText(value)}</strong>
                </div>
                <div className="coedash-bar-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function PieSvg({ rows, labelKey, valueKey = "cantidad" }) {
  const total = (rows || []).reduce((acc, row) => acc + Number(row?.[valueKey] || 0), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!total) {
    return (
      <div className="coedash-pie-empty">
        <span>Sin datos</span>
      </div>
    );
  }

  return (
    <div className="coedash-pie-layout">
      <svg viewBox="0 0 120 120" className="coedash-pie-svg" aria-label="Gráfico circular">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#eef2f7" strokeWidth="24" />
        {(rows || []).map((row, index) => {
          const value = Number(row?.[valueKey] || 0);
          const dash = (value / total) * circumference;
          const color = PIE_COLORS[index % PIE_COLORS.length];
          const segment = (
            <circle
              key={`${labelKey}-${index}`}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="24"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return segment;
        })}
        <text x="60" y="56" textAnchor="middle" className="coedash-pie-total">{numberText(total)}</text>
        <text x="60" y="72" textAnchor="middle" className="coedash-pie-label">casos</text>
      </svg>

      <div className="coedash-pie-legend">
        {(rows || []).map((row, index) => {
          const value = Number(row?.[valueKey] || 0);
          const pct = total ? Math.round((value / total) * 100) : 0;
          return (
            <div key={`legend-${labelKey}-${index}`}>
              <i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
              <span>{cleanText(row?.[labelKey])}</span>
              <strong>{numberText(value)} · {pct}%</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EstadoGeneralRequerimientos({ data }) {
  const subestados = data?.subestados || [];
  const principales = data?.principales || [];

  return (
    <section className="coedash-panel coedash-wide-panel coedash-excel-card">
      <div className="coedash-panel-head center">
        <h2>Estado general de requerimientos</h2>
        <p>Tabla y gráfico afectados por los filtros globales.</p>
      </div>

      <div className="coedash-excel-grid">
        <div className="coedash-table-wrap small">
          <table className="coedash-table pivot">
            <thead>
              <tr>
                <th>Etiquetas de fila</th>
                <th>Cuenta de ID</th>
              </tr>
            </thead>
            <tbody>
              {!subestados.length ? (
                <tr><td colSpan="2" className="coedash-empty small">Sin datos.</td></tr>
              ) : (
                subestados.map((row, index) => (
                  <tr key={`estado-general-${index}-${row.subestado}`}>
                    <td>{cleanText(row.subestado)}</td>
                    <td className="right strong">{numberText(row.cantidad)}</td>
                  </tr>
                ))
              )}
              <tr className="coedash-total-row">
                <td>Total general</td>
                <td className="right">{numberText(data?.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="coedash-chart-panel">
          <h3>Distribución por estado principal</h3>
          <PieSvg rows={principales} labelKey="estadoPrincipal" />
        </div>

        <div className="coedash-chart-panel">
          <h3>Detalle por subestado</h3>
          <PieSvg rows={subestados} labelKey="subestado" />
        </div>
      </div>
    </section>
  );
}

function RecibidosVsCerrados({ rows }) {
  const max = useMemo(() => {
    const nums = [];
    (rows || []).forEach((row) => {
      nums.push(Number(row.abierto || 0));
      nums.push(Number(row.cerrado || 0));
    });
    return Math.max(...nums, 0);
  }, [rows]);

  return (
    <section className="coedash-panel coedash-wide-panel coedash-excel-card">
      <div className="coedash-panel-head center">
        <h2>Casos recibidos vs cerrados</h2>
        <p>Resumen por módulo.</p>
      </div>

      <div className="coedash-excel-grid two">
        <div className="coedash-table-wrap small">
          <table className="coedash-table pivot">
            <thead>
              <tr>
                <th>Etiquetas de fila</th>
                <th>Abierto</th>
                <th>Cerrado</th>
              </tr>
            </thead>
            <tbody>
              {!rows?.length ? (
                <tr><td colSpan="3" className="coedash-empty small">Sin datos.</td></tr>
              ) : rows.map((row) => (
                <tr key={`rec-vs-cerr-${row.modulo}`}>
                  <td className="mono strong">{cleanText(row.modulo)}</td>
                  <td className="right">{numberText(row.abierto)}</td>
                  <td className="right">{numberText(row.cerrado)}</td>
                </tr>
              ))}
              <tr className="coedash-total-row">
                <td>Total general</td>
                <td className="right">{numberText((rows || []).reduce((a, r) => a + Number(r.abierto || 0), 0))}</td>
                <td className="right">{numberText((rows || []).reduce((a, r) => a + Number(r.cerrado || 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="coedash-chart-panel">
          <h3>Casos recibidos vs cerrados</h3>
          <div className="coedash-column-chart">
            {!rows?.length ? (
              <div className="coedash-empty small">Sin datos para graficar.</div>
            ) : rows.map((row) => {
              const abierto = Number(row.abierto || 0);
              const cerrado = Number(row.cerrado || 0);
              const abiertoPct = max ? Math.max(3, Math.round((abierto / max) * 100)) : 0;
              const cerradoPct = max ? Math.max(3, Math.round((cerrado / max) * 100)) : 0;

              return (
                <div className="coedash-column-group" key={`chart-${row.modulo}`}>
                  <div className="coedash-columns">
                    <span className="open" style={{ height: `${abiertoPct}%` }} title={`Abierto: ${abierto}`} />
                    <span className="closed" style={{ height: `${cerradoPct}%` }} title={`Cerrado: ${cerrado}`} />
                  </div>
                  <small>{cleanText(row.modulo)}</small>
                </div>
              );
            })}
          </div>
          <div className="coedash-chart-legend-inline">
            <span><i className="open" />Abierto</span>
            <span><i className="closed" />Cerrado</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function EstadoEstimacionHoras({ rows }) {
  const totals = useMemo(() => {
    return (rows || []).reduce((acc, row) => {
      acc.totalHorasFuncionales += Number(row.totalHorasFuncionales || 0);
      acc.horasEstimadasAbap += Number(row.horasEstimadasAbap || 0);
      acc.totalHorasEstimadas += Number(row.totalHorasEstimadas || 0);
      return acc;
    }, { totalHorasFuncionales: 0, horasEstimadasAbap: 0, totalHorasEstimadas: 0 });
  }, [rows]);

  return (
    <section className="coedash-panel coedash-wide-panel coedash-estimacion-card">
      <div className="coedash-panel-head center">
        <h2>Estado estimación y horas</h2>
        <p>Tabla tipo Excel por estado, año, mes e ID.</p>
      </div>

      <div className="coedash-table-wrap">
        <table className="coedash-table estimation">
          <thead>
            <tr>
              <th>Estado estimación</th>
              <th>Año aprobado estimación</th>
              <th>Mes aprobado estimación</th>
              <th>ID</th>
              <th>Suma total horas funcionales</th>
              <th>Suma horas estimadas ABAP</th>
              <th>Suma total horas estimadas</th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr><td colSpan="7" className="coedash-empty small">Sin información de estimación.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`estimacion-${index}-${row.numero}`}>
                <td className="strong">{cleanText(row.estadoEstimacion)}</td>
                <td className="center">{cleanText(row.anioAprobadoEstimacion)}</td>
                <td className="center">{cleanText(row.mesAprobadoEstimacion)}</td>
                <td className="mono">{cleanText(row.numero)}</td>
                <td className="right strong">{numberText(row.totalHorasFuncionales, 2)}</td>
                <td className="right strong">{numberText(row.horasEstimadasAbap, 2)}</td>
                <td className="right strong">{numberText(row.totalHorasEstimadas, 2)}</td>
              </tr>
            ))}
            <tr className="coedash-total-row">
              <td colSpan="4">Total general</td>
              <td className="right">{numberText(totals.totalHorasFuncionales, 2)}</td>
              <td className="right">{numberText(totals.horasEstimadasAbap, 2)}</td>
              <td className="right">{numberText(totals.totalHorasEstimadas, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HorasModuloTable({ rows }) {
  return (
    <section className="coedash-panel coedash-wide-panel">
      <div className="coedash-panel-head">
        <h2>Horas por módulo</h2>
        <p>Estimadas vs ejecutadas según la calificación.</p>
      </div>

      <div className="coedash-table-wrap small">
        <table className="coedash-table">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Horas estimadas</th>
              <th>Horas ejecutadas</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan="4" className="coedash-empty small">Sin horas registradas.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const estimadas = Number(row.estimadas || 0);
                const ejecutadas = Number(row.ejecutadas || 0);

                return (
                  <tr key={`hora-${row.modulo}`}>
                    <td className="mono strong">{cleanText(row.modulo)}</td>
                    <td className="right">{numberText(estimadas, 2)}</td>
                    <td className="right">{numberText(ejecutadas, 2)}</td>
                    <td className="right">{numberText(estimadas - ejecutadas, 2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FacturacionTable({ rows }) {
  return (
    <section className="coedash-panel coedash-wide-panel">
      <div className="coedash-panel-head">
        <h2>OT / Facturación</h2>
        <p>Resumen por estado de facturación de la OT.</p>
      </div>

      <div className="coedash-table-wrap small">
        <table className="coedash-table">
          <thead>
            <tr>
              <th>Estado facturación OT</th>
              <th>Cantidad</th>
              <th>Valor OT</th>
              <th>Horas oferta</th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan="4" className="coedash-empty small">Sin datos de facturación.</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`ot-${index}-${row.estadoFacturacionOt}`}>
                  <td>{cleanText(row.estadoFacturacionOt)}</td>
                  <td className="right">{numberText(row.cantidad)}</td>
                  <td className="right">{moneyText(row.valor)}</td>
                  <td className="right">{numberText(row.horas, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DashboardClientesCoeSap() {
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
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const resumen = payload?.resumen || {};
  const opciones = payload?.opciones || {};

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchDashboard = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/dashboard-clientes${qs ? `?${qs}` : ""}`;

      const res = await jfetch(url, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setPayload(data);
    } catch (error) {
      console.error("Error dashboard clientes COE SAP:", error);
      setPayload(null);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar el dashboard",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, appliedFilters]);

  const descargarExcel = useCallback(async () => {
    setDownloadingExcel(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/dashboard-clientes/export-excel${qs ? `?${qs}` : ""}`;

      await downloadExcelFile(
        url,
        commonHeaders,
        "dashboard_clientes_coe_sap_funcional.xlsx"
      );
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo descargar el Excel",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setDownloadingExcel(false);
    }
  }, [appliedFilters, commonHeaders]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  if (!canView) {
    return (
      <div className="coedash-page">
        <div className="coedash-access-card">
          <div className="coedash-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coedash-page">
      <section className="coedash-hero">
        <div>
          <span className="coedash-eyebrow">Dashboard clientes</span>
          <h1>Dashboard COE SAP Funcional</h1>
          <p>
            Gráficas tipo Excel afectadas por filtros globales: estado general,
            recibidos vs cerrados, estimaciones, horas y facturación.
          </p>
        </div>

        <div className="coedash-hero-actions">
          <button type="button" className="coedash-btn light" onClick={fetchDashboard} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <button type="button" className="coedash-btn danger" onClick={descargarExcel} disabled={loading || downloadingExcel}>
            {downloadingExcel ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>
      </section>

      <section className="coedash-card coedash-filters-card">
        <div className="coedash-card-head">
          <div>
            <h2>Filtros globales</h2>
            <p>Estos filtros afectan todas las gráficas y tablas del dashboard.</p>
          </div>

          <button type="button" className="coedash-btn ghost" onClick={clearFilters} disabled={loading}>
            Limpiar
          </button>
        </div>

        <div className="coedash-filters-grid">
          <label className="coedash-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="ID, asunto, sociedad, observación..."
              onChange={(e) => updateFilter("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>

          <SimpleSelect label="Sociedad" value={filters.sociedad} options={opciones.sociedad} onChange={(v) => updateFilter("sociedad", v)} />
          <SimpleSelect label="Cliente asociado" value={filters.clienteAsociadoNombre} options={opciones.clienteAsociadoNombre} onChange={(v) => updateFilter("clienteAsociadoNombre", v)} />
          <SimpleSelect label="Año creación" value={filters.anio} options={opciones.anio} onChange={(v) => updateFilter("anio", v)} />
          <SimpleSelect label="Mes creación" value={filters.mes} options={opciones.mes} onChange={(v) => updateFilter("mes", v)} />
          <SimpleSelect label="Tipo solicitud" value={filters.tipoSolicitud} options={opciones.tipoSolicitud} onChange={(v) => updateFilter("tipoSolicitud", v)} />
          <SimpleSelect label="Líder Claro" value={filters.liderClaro} options={opciones.liderClaro} onChange={(v) => updateFilter("liderClaro", v)} />
          <SimpleSelect label="Control horas" value={filters.controlHoras} options={opciones.controlHoras} onChange={(v) => updateFilter("controlHoras", v)} />
          <SimpleSelect label="Estado consolidado" value={filters.estadoConsolidado} options={opciones.estadoConsolidado} onChange={(v) => updateFilter("estadoConsolidado", v)} />
          <SimpleSelect label="Estado principal" value={filters.estadoPrincipal} options={opciones.estadoPrincipal} onChange={(v) => updateFilter("estadoPrincipal", v)} />
          <SimpleSelect label="Subestado" value={filters.subestado} options={opciones.subestado} onChange={(v) => updateFilter("subestado", v)} />
          <SimpleSelect label="Módulo" value={filters.modulo} options={opciones.modulo} onChange={(v) => updateFilter("modulo", v)} />
          <SimpleSelect label="Responsable estado" value={filters.responsableEstado} options={opciones.responsableEstado} onChange={(v) => updateFilter("responsableEstado", v)} />
          <SimpleSelect label="Asignado a" value={filters.asignadoA} options={opciones.asignadoA} onChange={(v) => updateFilter("asignadoA", v)} />
        </div>

        <div className="coedash-actions">
          <button type="button" className="coedash-btn danger" onClick={applyFilters} disabled={loading}>
            {loading ? "Consultando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="coedash-btn light" onClick={clearFilters} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      {loading && !payload ? (
        <section className="coedash-card coedash-loading-card">
          <div className="coedash-loader" />
          Cargando dashboard...
        </section>
      ) : (
        <>
          <section className="coedash-metrics-grid">
            <MetricCard title="Total casos" value={numberText(resumen.totalCasos)} sub="Casos filtrados" tone="dark" />
            <MetricCard title="Abiertos" value={numberText(resumen.abiertos)} sub="Sin cerrar / abiertos" tone="warn" />
            <MetricCard title="Cerrados" value={numberText(resumen.cerrados)} sub="Cerrados o solucionados" tone="ok" />
            <MetricCard title="Cruce SM" value={numberText(resumen.conSm)} sub="Casos cruzados SM" tone="info" />
            <MetricCard title="Cruce ITOP" value={numberText(resumen.conItop)} sub="Casos cruzados ITOP" tone="info" />
            <MetricCard title="Solo Excel" value={numberText(resumen.soloExcel)} sub="Sin cruce completo" tone="neutral" />
            <MetricCard title="H. funcionales" value={numberText(resumen.totalHorasFuncionales, 2)} sub="Total funcional" tone="ok" />
            <MetricCard title="H. estimadas" value={numberText(resumen.totalHorasEstimadas, 2)} sub="Total estimado" tone="dark" />
            <MetricCard title="Valor OT" value={moneyText(resumen.valorOt)} sub="Suma valor OT" tone="money" />
          </section>

          <EstadoGeneralRequerimientos data={payload?.estadoGeneralRequerimientos} />
          <RecibidosVsCerrados rows={payload?.casosRecibidosVsCerrados || []} />
          <EstadoEstimacionHoras rows={payload?.estadoEstimacionHoras || []} />

          <section className="coedash-grid-panels">
            <BarList title="Estado principal" rows={payload?.casosPorEstadoPrincipal || []} labelKey="estadoPrincipal" />
            <BarList title="Subestado" rows={payload?.casosPorSubestado || []} labelKey="subestado" />
            <BarList title="Estado original" rows={payload?.casosPorEstado || []} labelKey="estado" />
            <BarList title="Estado consolidado" rows={payload?.casosPorEstadoConsolidado || []} labelKey="estadoConsolidado" />
            <BarList title="Casos por módulo" rows={payload?.casosPorModulo || []} labelKey="modulo" />
            <BarList title="Tipo de solicitud" rows={payload?.casosPorTipoSolicitud || []} labelKey="tipoSolicitud" />
            <BarList title="Responsable estado" rows={payload?.casosPorResponsable || []} labelKey="responsableEstado" />
            <BarList title="Estado estimación" rows={payload?.estimacionesPorEstado || []} labelKey="estadoEstimacion" />
          </section>

          <section className="coedash-grid-panels two">
            <BarList title="Cerrados por mes" rows={payload?.cerradosPorMes || []} labelKey="periodo" />
            <HorasModuloTable rows={payload?.horasPorModulo || []} />
            <FacturacionTable rows={payload?.otFacturacion || []} />
          </section>
        </>
      )}
    </div>
  );
}

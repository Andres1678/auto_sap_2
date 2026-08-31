import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import { jfetch } from "./lib/api";
import "./DashboardClientesCoeSap.css";

function getDefaultFilters() {
  const hoy = new Date();
  const anioActual = String(hoy.getFullYear());
  const mesActual = String(hoy.getMonth() + 1);

  return {
    q: "",

    // El dashboard carga por defecto el mes actual para no consultar toda la base.
    modoPeriodo: "mes",
    anio: anioActual,
    mes: mesActual,
    anioDesde: anioActual,
    mesDesde: mesActual,
    anioHasta: anioActual,
    mesHasta: mesActual,
    fechaDesde: "",
    fechaHasta: "",

    // Filtros propios por gráfica. Estos NO dependen del rango global.
    recibidosAnio: anioActual,
    recibidosMes: mesActual,
    estimacionAnio: anioActual,
    estimacionMes: mesActual,
    estimacionEstado: [],


    sociedad: [],
    clienteAsociadoNombre: [],
    validarCliente: [],
    estadoConsolidado: [],
    estadoPrincipal: [],
    subestado: [],
    validarEstadoControl: [],
    modulo: [],
    tipoSolicitud: [],
    responsableEstado: [],
    controlHoras: [],
    liderClaro: [],
    asignadoA: [],
  };
}

function getDefaultGraphFilters() {
  return {
    graficasSociedad: [],
  };
}

const FILTER_PARAM_MAP = {
  modoPeriodo: "modo_periodo",
  anioDesde: "anio_desde",
  mesDesde: "mes_desde",
  anioHasta: "anio_hasta",
  mesHasta: "mes_hasta",
  fechaDesde: "fecha_desde",
  fechaHasta: "fecha_hasta",
  recibidosAnio: "recibidos_anio",
  recibidosMes: "recibidos_mes",
  estimacionAnio: "estimacion_anio",
  estimacionMes: "estimacion_mes",
  estimacionEstado: "estimacion_estado",
  graficasSociedad: "graficas_sociedad",
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
    const paramKey = FILTER_PARAM_MAP[key] || key;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        const s = String(item ?? "").trim();
        if (s) qs.append(paramKey, s);
      });
      return;
    }

    const s = String(value ?? "").trim();
    if (!s) return;

    qs.set(paramKey, s);
  });

  return qs.toString();
}

function cloneFilters(filters) {
  const source = filters || getDefaultFilters();
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ])
  );
}

function valuesAreEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left.map(String).sort() : [];
    const b = Array.isArray(right) ? right.map(String).sort() : [];
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  return String(left ?? "") === String(right ?? "");
}

function countChangedFilterGroups(filters, defaults) {
  const source = filters || {};
  const base = defaults || {};
  const periodKeys = new Set([
    "modoPeriodo",
    "anio",
    "mes",
    "anioDesde",
    "mesDesde",
    "anioHasta",
    "mesHasta",
    "fechaDesde",
    "fechaHasta",
  ]);

  let count = 0;
  let periodChanged = false;

  Object.keys(base).forEach((key) => {
    if (valuesAreEqual(source[key], base[key])) return;
    if (periodKeys.has(key)) {
      periodChanged = true;
      return;
    }
    count += 1;
  });

  return count + (periodChanged ? 1 : 0);
}

function formatUpdateTime(date) {
  if (!(date instanceof Date)) return "";

  return date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uniqueValues(values) {
  const list = Array.isArray(values) ? values : [];
  return [...new Set(list.map((item) => {
    if (item && typeof item === "object") return String(item.value ?? item.label ?? "").trim();
    return String(item ?? "").trim();
  }).filter(Boolean))];
}

function buildYearOptions(opciones) {
  const currentYear = String(new Date().getFullYear());
  const years = uniqueValues(opciones?.anio);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  return years
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)
    .map((value) => ({ value: String(value), label: String(value) }));
}

function buildMonthOptions(opciones) {
  const base = optionItems(opciones?.mes);
  const months = base.length ? base : [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  return base.length
    ? base.map((item) => ({ value: String(item.value), label: item.label }))
    : months.map((item) => ({ value: String(item.value), label: item.label }));
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

function MultiSelect({ label, value, options, onChange, disabled = false }) {
  const items = optionItems(options);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedMap = new Set(selectedValues.map((item) => String(item)));
  const selectedOptions = items.filter((item) => selectedMap.has(String(item.value)));

  return (
    <label className="coedash-filter coedash-filter-select">
      <span>{label}</span>
      <Select
        className="coedash-rselect"
        classNamePrefix="coedash-rselect"
        isMulti
        isClearable
        isDisabled={disabled}
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        options={items}
        value={selectedOptions}
        placeholder="Todos"
        noOptionsMessage={() => "Sin opciones"}
        onChange={(selected) => {
          const values = Array.isArray(selected) ? selected.map((item) => item.value) : [];
          onChange(values);
        }}
      />
    </label>
  );
}

function PeriodFilters({ filters, opciones, updateFilter, disabled }) {
  const yearOptions = buildYearOptions(opciones);
  const monthOptions = buildMonthOptions(opciones);
  const modo = filters.modoPeriodo || "mes";

  return (
    <div className="coedash-period-box">
      <div className="coedash-period-heading">
        <span className="coedash-period-icon" aria-hidden="true">◷</span>
        <div>
          <strong>Periodo global</strong>
          <small>Selecciona el rango que deseas analizar.</small>
        </div>
      </div>

      <label className="coedash-filter">
        <span>Periodo de consulta</span>
        <select
          value={modo}
          disabled={disabled}
          onChange={(e) => updateFilter("modoPeriodo", e.target.value)}
        >
          <option value="mes">Mes específico</option>
          <option value="rango_meses">Rango de meses</option>
          <option value="rango_dias">Rango de días</option>
        </select>
      </label>

      {modo === "mes" && (
        <>
          <label className="coedash-filter">
            <span>Año</span>
            <select
              value={filters.anio}
              disabled={disabled}
              onChange={(e) => updateFilter("anio", e.target.value)}
            >
              {yearOptions.map((item) => (
                <option key={`anio-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="coedash-filter">
            <span>Mes</span>
            <select
              value={filters.mes}
              disabled={disabled}
              onChange={(e) => updateFilter("mes", e.target.value)}
            >
              {monthOptions.map((item) => (
                <option key={`mes-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {modo === "rango_meses" && (
        <>
          <label className="coedash-filter">
            <span>Año desde</span>
            <select value={filters.anioDesde} disabled={disabled} onChange={(e) => updateFilter("anioDesde", e.target.value)}>
              {yearOptions.map((item) => (
                <option key={`anio-desde-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="coedash-filter">
            <span>Mes desde</span>
            <select value={filters.mesDesde} disabled={disabled} onChange={(e) => updateFilter("mesDesde", e.target.value)}>
              {monthOptions.map((item) => (
                <option key={`mes-desde-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="coedash-filter">
            <span>Año hasta</span>
            <select value={filters.anioHasta} disabled={disabled} onChange={(e) => updateFilter("anioHasta", e.target.value)}>
              {yearOptions.map((item) => (
                <option key={`anio-hasta-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="coedash-filter">
            <span>Mes hasta</span>
            <select value={filters.mesHasta} disabled={disabled} onChange={(e) => updateFilter("mesHasta", e.target.value)}>
              {monthOptions.map((item) => (
                <option key={`mes-hasta-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {modo === "rango_dias" && (
        <>
          <label className="coedash-filter">
            <span>Fecha desde</span>
            <input
              type="date"
              value={filters.fechaDesde}
              disabled={disabled}
              onChange={(e) => updateFilter("fechaDesde", e.target.value)}
            />
          </label>

          <label className="coedash-filter">
            <span>Fecha hasta</span>
            <input
              type="date"
              value={filters.fechaHasta}
              disabled={disabled}
              onChange={(e) => updateFilter("fechaHasta", e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}

function periodoMensualText(periodo) {
  if (!periodo) return "Mes propio";

  const mes = cleanText(periodo.mesNombre);
  const anio = cleanText(periodo.anio);

  if (mes === "—" || anio === "—") return "Mes propio";
  return `${mes} ${anio}`;
}

function GraphMonthFilter({ title, description, anioKey, mesKey, filters, opciones, updateFilter, disabled, children }) {
  const yearOptions = buildYearOptions(opciones);
  const monthOptions = buildMonthOptions(opciones);

  return (
    <div className="coedash-graph-filter-card">
      <div className="coedash-graph-filter-head">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="coedash-graph-filter-fields">
        <label className="coedash-filter">
          <span>Año</span>
          <select
            value={filters[anioKey]}
            disabled={disabled}
            onChange={(e) => updateFilter(anioKey, e.target.value)}
          >
            {yearOptions.map((item) => (
              <option key={`${anioKey}-${item.value}`} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="coedash-filter">
          <span>Mes</span>
          <select
            value={filters[mesKey]}
            disabled={disabled}
            onChange={(e) => updateFilter(mesKey, e.target.value)}
          >
            {monthOptions.map((item) => (
              <option key={`${mesKey}-${item.value}`} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        {children}
      </div>
    </div>
  );
}


function MetricCard({ title, value, sub, tone = "default", icon = "•" }) {
  return (
    <article className={`coedash-metric ${tone}`}>
      <div className="coedash-metric-top">
        <span>{title}</span>
        <i aria-hidden="true">{icon}</i>
      </div>
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
        <p>
          Backlog completo solo para estados principales En curso y Pendiente de cliente.
          Si el caso no tiene subestado, se muestra el estado principal.
        </p>
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

function moduloConsultorTooltipText(row) {
  const consultores = Array.isArray(row?.consultores) ? row.consultores : [];
  const detalle = consultores.length
    ? consultores.map((item) => `${cleanText(item?.consultor)}: ${numberText(item?.cantidad)} caso(s)`).join("\n")
    : "Sin consultores asociados";

  return `${cleanText(row?.modulo)}
Total: ${numberText(row?.cantidad)} caso(s)

${detalle}`;
}

function DistribucionModulosConsultores({ data }) {
  const rows = data?.modulos || [];
  const total = Number(data?.total || 0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!rows.length) {
      setActiveIndex(0);
      return;
    }

    if (activeIndex > rows.length - 1) {
      setActiveIndex(0);
    }
  }, [rows, activeIndex]);

  const activeRow = rows[activeIndex] || rows[0] || null;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <section className="coedash-panel coedash-wide-panel coedash-excel-card">
      <div className="coedash-panel-head center">
        <h2>Distribución por módulos y consultores asignados</h2>
        <p>
          Distribución del mismo backlog controlado por módulo. Si el caso no trae módulo,
          se infiere desde el consultor asignado y sus módulos configurados.
        </p>
      </div>

      {!rows.length ? (
        <div className="coedash-empty">Sin datos para la distribución por módulos.</div>
      ) : (
        <div className="coedash-module-grid">
          <div className="coedash-chart-panel coedash-module-pie-panel">
            <div className="coedash-module-pie-layout">
              <svg viewBox="0 0 180 180" className="coedash-module-pie-svg" aria-label="Distribución por módulos">
                <circle cx="90" cy="90" r={radius} fill="none" stroke="#eef2f7" strokeWidth="30" />
                {rows.map((row, index) => {
                  const value = Number(row?.cantidad || 0);
                  const dash = total ? (value / total) * circumference : 0;
                  const color = PIE_COLORS[index % PIE_COLORS.length];
                  const segment = (
                    <circle
                      key={`modulo-slice-${index}-${row?.modulo}`}
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke={color}
                      strokeWidth="30"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 90 90)"
                      strokeLinecap="butt"
                      className={index === activeIndex ? "active" : ""}
                      onMouseEnter={() => setActiveIndex(index)}
                      title={moduloConsultorTooltipText(row)}
                    />
                  );
                  offset += dash;
                  return segment;
                })}
                <text x="90" y="84" textAnchor="middle" className="coedash-pie-total">{numberText(total)}</text>
                <text x="90" y="104" textAnchor="middle" className="coedash-pie-label">casos</text>
              </svg>

              <div className="coedash-module-note">
                <strong>Backlog por módulo</strong>
                <span>Pasa el mouse por cada color para revisar el detalle.</span>
              </div>
            </div>
          </div>

          <div className="coedash-chart-panel coedash-module-legend-panel">
            <h3>Módulos</h3>
            <div className="coedash-module-legend">
              {rows.map((row, index) => {
                const color = PIE_COLORS[index % PIE_COLORS.length];
                const isActive = index === activeIndex;
                return (
                  <button
                    type="button"
                    key={`modulo-legend-${index}-${row?.modulo}`}
                    className={`coedash-module-legend-row${isActive ? " active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    title={moduloConsultorTooltipText(row)}
                  >
                    <i style={{ background: color }} />
                    <span>{cleanText(row?.modulo)}</span>
                    <strong>{numberText(row?.cantidad)} · {numberText(row?.porcentaje, 2)}%</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="coedash-chart-panel coedash-module-detail-panel">
            <h3>{cleanText(activeRow?.modulo)}</h3>
            <p className="coedash-module-detail-meta">
              Total del módulo: <b>{numberText(activeRow?.cantidad)}</b> caso(s)
              {" · "}
              <b>{numberText(activeRow?.porcentaje, 2)}%</b> del backlog controlado.
            </p>

            <div className="coedash-module-detail-list">
              {!(activeRow?.consultores || []).length ? (
                <div className="coedash-empty small">No hay consultores relacionados.</div>
              ) : (
                (activeRow?.consultores || []).map((item, index) => (
                  <div className="coedash-module-detail-row" key={`consultor-${index}-${item?.consultor}`}>
                    <span>{cleanText(item?.consultor)}</span>
                    <strong>{numberText(item?.cantidad)} caso(s)</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RecibidosVsCerrados({ rows, periodo }) {
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
        <p>
          Mes propio: <b>{periodoMensualText(periodo)}</b>. Abierto/recibido se cuenta por fecha de asignación y cerrado/finalizado por fecha de finalización/cierre o cierre del sistema de gestión.
        </p>
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

function EstadoEstimacionHoras({ rows, periodo }) {
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
        <p>
          Mes actual: <b>{periodoMensualText(periodo)}</b>. Solo responde al filtro propio de sociedad y se calcula por fecha de aprobación de estimación.
        </p>
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
              <th>Suma total horas ABAP</th>
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

  const [filters, setFilters] = useState(() => getDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => getDefaultFilters());

  // Filtro independiente para las dos secciones mensuales.
  // No se actualiza cuando se aplican los filtros globales.
  const [graphFilters, setGraphFilters] = useState(() => getDefaultGraphFilters());
  const [appliedGraphFilters, setAppliedGraphFilters] = useState(() => getDefaultGraphFilters());

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const defaultFilters = useMemo(() => getDefaultFilters(), []);
  const defaultGraphFilters = useMemo(() => getDefaultGraphFilters(), []);

  const activeGlobalFilterCount = useMemo(
    () => countChangedFilterGroups(filters, defaultFilters),
    [filters, defaultFilters]
  );
  const activeGraphFilterCount = useMemo(
    () => countChangedFilterGroups(graphFilters, defaultGraphFilters),
    [graphFilters, defaultGraphFilters]
  );
  const filtersDirty = useMemo(
    () => buildQuery(filters) !== buildQuery(appliedFilters),
    [filters, appliedFilters]
  );
  const graphFiltersDirty = useMemo(
    () => buildQuery(graphFilters) !== buildQuery(appliedGraphFilters),
    [graphFilters, appliedGraphFilters]
  );

  const resumen = payload?.resumen || {};
  const resumenEstadoGeneral = payload?.resumenEstadoGeneral || resumen;
  const opciones = payload?.opciones || {};

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateGraphFilter = (key, value) => {
    setGraphFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchDashboard = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery({
        ...appliedFilters,
        ...appliedGraphFilters,
      });
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
      setLastUpdatedAt(new Date());
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
  }, [canView, commonHeaders, appliedFilters, appliedGraphFilters]);

  const descargarExcel = useCallback(async () => {
    setDownloadingExcel(true);

    try {
      const qs = buildQuery({
        ...appliedFilters,
        ...appliedGraphFilters,
      });
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
  }, [appliedFilters, appliedGraphFilters, commonHeaders]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const applyFilters = () => {
    setAppliedFilters(cloneFilters(filters));
  };

  const clearFilters = () => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    setAppliedFilters(cloneFilters(defaults));
  };

  const applyGraphFilters = () => {
    setAppliedGraphFilters(cloneFilters(graphFilters));
  };

  const clearGraphFilters = () => {
    const defaults = getDefaultGraphFilters();
    setGraphFilters(defaults);
    setAppliedGraphFilters(cloneFilters(defaults));
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
    <div className="coedash-page" aria-busy={loading}>
      <section className="coedash-hero">
        <div className="coedash-hero-copy">
          <span className="coedash-eyebrow">Dashboard clientes</span>
          <h1>Dashboard COE SAP Funcional</h1>
          <p>
            Consulta el backlog, revisa su distribución y analiza el comportamiento mensual desde una sola vista.
          </p>

          <div className="coedash-hero-meta">
            <span>
              <b>{numberText(resumenEstadoGeneral.totalCasos)}</b>
              casos en el backlog
            </span>
            {lastUpdatedAt && (
              <span>
                <b>{formatUpdateTime(lastUpdatedAt)}</b>
                última actualización
              </span>
            )}
          </div>
        </div>

        <div className="coedash-hero-actions">
          <button type="button" className="coedash-btn light" onClick={fetchDashboard} disabled={loading}>
            <span className={`coedash-btn-icon${loading ? " spinning" : ""}`} aria-hidden="true">↻</span>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <button type="button" className="coedash-btn danger" onClick={descargarExcel} disabled={loading || downloadingExcel}>
            <span className="coedash-btn-icon" aria-hidden="true">⇩</span>
            {downloadingExcel ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>
      </section>

      {loading && payload && (
        <div className="coedash-refresh-banner" role="status" aria-live="polite">
          <span className="coedash-loader mini" aria-hidden="true" />
          Actualizando la información sin ocultar los resultados actuales…
        </div>
      )}

      <section className="coedash-card coedash-filters-card">
        <div className="coedash-card-head">
          <div>
            <span className="coedash-section-kicker">Consulta principal</span>
            <h2>Filtros globales</h2>
            <p>
              Ajustan las métricas y el backlog general. Las dos gráficas mensuales conservan su filtro independiente.
            </p>
          </div>

          <div className="coedash-card-tools">
            <span className={`coedash-filter-counter${activeGlobalFilterCount ? " active" : ""}`}>
              {activeGlobalFilterCount
                ? `${activeGlobalFilterCount} filtro${activeGlobalFilterCount === 1 ? "" : "s"} personalizado${activeGlobalFilterCount === 1 ? "" : "s"}`
                : "Periodo actual"}
            </span>
            <button type="button" className="coedash-btn ghost compact" onClick={clearFilters} disabled={loading || (!filtersDirty && activeGlobalFilterCount === 0)}>
              <span className="coedash-btn-icon" aria-hidden="true">×</span>
              Limpiar
            </button>
          </div>
        </div>

        <div className="coedash-filters-grid">
          <PeriodFilters
            filters={filters}
            opciones={opciones}
            updateFilter={updateFilter}
            disabled={loading}
          />

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

          <MultiSelect label="Sociedad" value={filters.sociedad} options={opciones.sociedad} onChange={(v) => updateFilter("sociedad", v)} />
          <MultiSelect label="Cliente asociado" value={filters.clienteAsociadoNombre} options={opciones.clienteAsociadoNombre} onChange={(v) => updateFilter("clienteAsociadoNombre", v)} />
          <MultiSelect label="Validar cliente" value={filters.validarCliente} options={opciones.validarCliente} onChange={(v) => updateFilter("validarCliente", v)} />
          <MultiSelect label="Tipo solicitud" value={filters.tipoSolicitud} options={opciones.tipoSolicitud} onChange={(v) => updateFilter("tipoSolicitud", v)} />
          <MultiSelect label="Líder Claro" value={filters.liderClaro} options={opciones.liderClaro} onChange={(v) => updateFilter("liderClaro", v)} />
          <MultiSelect label="Control horas" value={filters.controlHoras} options={opciones.controlHoras} onChange={(v) => updateFilter("controlHoras", v)} />
          <MultiSelect label="Estado consolidado" value={filters.estadoConsolidado} options={opciones.estadoConsolidado} onChange={(v) => updateFilter("estadoConsolidado", v)} />
          <MultiSelect label="Estado principal" value={filters.estadoPrincipal} options={opciones.estadoPrincipal} onChange={(v) => updateFilter("estadoPrincipal", v)} />
          <MultiSelect label="Subestado" value={filters.subestado} options={opciones.subestado} onChange={(v) => updateFilter("subestado", v)} />
          <MultiSelect label="Validar estado" value={filters.validarEstadoControl} options={opciones.validarEstadoControl} onChange={(v) => updateFilter("validarEstadoControl", v)} />
          <MultiSelect label="Módulo" value={filters.modulo} options={opciones.modulo} onChange={(v) => updateFilter("modulo", v)} />
          <MultiSelect label="Responsable estado" value={filters.responsableEstado} options={opciones.responsableEstado} onChange={(v) => updateFilter("responsableEstado", v)} />
          <MultiSelect label="Asignado a" value={filters.asignadoA} options={opciones.asignadoA} onChange={(v) => updateFilter("asignadoA", v)} />
        </div>

        <div className="coedash-actions coedash-filter-actions">
          <div className="coedash-action-hint">
            <span className={filtersDirty ? "pending" : "saved"} aria-hidden="true" />
            {filtersDirty ? "Tienes cambios pendientes por aplicar." : "Los filtros visibles ya están aplicados."}
          </div>

          <div className="coedash-action-buttons">
            <button type="button" className="coedash-btn light" onClick={clearFilters} disabled={loading || (!filtersDirty && activeGlobalFilterCount === 0)}>
              Restablecer
            </button>
            <button type="button" className="coedash-btn danger" onClick={applyFilters} disabled={loading || !filtersDirty}>
              <span className="coedash-btn-icon" aria-hidden="true">✓</span>
              {loading ? "Consultando..." : "Aplicar filtros"}
            </button>
          </div>
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
            <MetricCard
              title="Backlog total"
              icon="▦"
              value={numberText(resumenEstadoGeneral.totalCasos)}
              sub="En curso + pendiente cliente"
              tone="dark"
            />

            <MetricCard
              title="En curso"
              icon="◔"
              value={numberText(resumenEstadoGeneral.enCurso)}
              sub="Casos activos"
              tone="warn"
            />

            <MetricCard
              title="Pend. cliente"
              icon="◷"
              value={numberText(resumenEstadoGeneral.pendienteCliente)}
              sub="Pendientes por cliente"
              tone="info"
            />

            <MetricCard
              title="Cruce SM"
              icon="SM"
              value={numberText(resumenEstadoGeneral.conSm)}
              sub="Backlog cruzado SM"
              tone="info"
            />

            <MetricCard
              title="Cruce ITOP"
              icon="IT"
              value={numberText(resumenEstadoGeneral.conItop)}
              sub="Backlog cruzado ITOP"
              tone="info"
            />

            <MetricCard
              title="Solo Excel"
              icon="XLS"
              value={numberText(resumenEstadoGeneral.soloExcel)}
              sub="Backlog sin cruce completo"
              tone="neutral"
            />

            <MetricCard
              title="H. funcionales"
              icon="HF"
              value={numberText(resumenEstadoGeneral.totalHorasFuncionales, 2)}
              sub="Total funcional backlog"
              tone="ok"
            />

            <MetricCard
              title="H. estimadas"
              icon="HE"
              value={numberText(resumenEstadoGeneral.totalHorasEstimadas, 2)}
              sub="Total estimado backlog"
              tone="dark"
            />

            <MetricCard
              title="Valor OT"
              icon="$"
              value={moneyText(resumenEstadoGeneral.valorOt)}
              sub="Suma valor OT backlog"
              tone="money"
            />
          </section>

          <EstadoGeneralRequerimientos data={payload?.estadoGeneralRequerimientos} />
          <DistribucionModulosConsultores data={payload?.distribucionModulosConsultores} />

          <section className="coedash-card coedash-graph-filter-section coedash-graph-filter-attached">
            <div className="coedash-graph-filter-title">
              <div>
                <span className="coedash-section-kicker blue">Análisis mensual</span>
                <h2>Filtro propio de gráficas mensuales</h2>
              </div>
              <span className={`coedash-filter-counter blue${activeGraphFilterCount ? " active" : ""}`}>
                {activeGraphFilterCount ? "Sociedad personalizada" : "Todas las sociedades"}
              </span>
              <p>
                Este filtro solo afecta los dos bloques siguientes: Casos recibidos vs cerrados
                y Estado estimación y horas. No cambia las métricas ni las gráficas generales.
              </p>
            </div>

            <div className="coedash-graph-filter-grid single">
              <div className="coedash-graph-filter-card coedash-graph-shared-card">
                <div className="coedash-graph-filter-head">
                  <h3>Sociedad para gráficas mensuales</h3>
                  <p>
                    El periodo se mantiene por defecto en el mes actual.
                    Aplica únicamente a las dos secciones que están debajo de este filtro.
                  </p>
                </div>

                <div className="coedash-graph-filter-fields">
                  <MultiSelect
                    label="Sociedad"
                    value={graphFilters.graficasSociedad}
                    options={opciones.sociedad || []}
                    onChange={(v) => updateGraphFilter("graficasSociedad", v)}
                    disabled={loading}
                  />
                </div>

                <div className="coedash-actions coedash-graph-actions">
                  <div className="coedash-action-hint">
                    <span className={graphFiltersDirty ? "pending" : "saved"} aria-hidden="true" />
                    {graphFiltersDirty ? "Cambio pendiente para estas dos gráficas." : "La sociedad seleccionada ya está aplicada."}
                  </div>
                  <div className="coedash-action-buttons">
                    <button type="button" className="coedash-btn light" onClick={clearGraphFilters} disabled={loading || (!graphFiltersDirty && activeGraphFilterCount === 0)}>
                      Restablecer sociedad
                    </button>
                    <button type="button" className="coedash-btn danger" onClick={applyGraphFilters} disabled={loading || !graphFiltersDirty}>
                      <span className="coedash-btn-icon" aria-hidden="true">✓</span>
                      {loading ? "Consultando..." : "Aplicar a estas gráficas"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <RecibidosVsCerrados rows={payload?.casosRecibidosVsCerrados || []} periodo={payload?.periodosGraficas?.recibidosVsCerrados} />
          <EstadoEstimacionHoras rows={payload?.estadoEstimacionHoras || []} periodo={payload?.periodosGraficas?.estadoEstimacionHoras} />


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

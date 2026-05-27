import React, { useEffect, useMemo, useState } from "react";
import Select, { components } from "react-select";
import { jfetch } from "./lib/api";
import "./DetalleComercial.css";

/* ===================== Helpers ===================== */

const nfMoney = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const MONTH_LABELS = {
  1: "ENERO",
  2: "FEBRERO",
  3: "MARZO",
  4: "ABRIL",
  5: "MAYO",
  6: "JUNIO",
  7: "JULIO",
  8: "AGOSTO",
  9: "SEPTIEMBRE",
  10: "OCTUBRE",
  11: "NOVIEMBRE",
  12: "DICIEMBRE",
};

const ESTADOS_ACTIVOS = new Set(
  [
    "EN PROCESO",
    "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
    "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACIÓN",
    "EN ELABORACION",
    "ENTREGA COMERCIAL",
    "EN ESPERA DEL RFI / RFP",
    "RFI PRESENTADO",
    "SUSPENDIDA",
  ].map(normKeyForMatch)
);

const ESTADOS_CERRADOS = new Set(
  [
    "GANADA",
    "PERDIDA",
    "DECLINADA",
    "PERDIDA - SIN FEEDBACK",
    "RFP PRESENTADO",
  ].map(normKeyForMatch)
);

const EXCLUDE_SET = new Set(
  [
    "OTP",
    "OTE",
    "OTL",
    "PROSPECCION",
    "REGISTRO",
    "PENDIENTE APROBACION SAP",
    "0TP",
    "0TE",
    "0TL",
    "OT",
  ].map(normKeyForMatch)
);

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").trim();
}

function normKeyForMatch(value) {
  let s = normalizeText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  s = s.replace(/\b0TP\b/g, "OTP").replace(/\b0TE\b/g, "OTE").replace(/\b0TL\b/g, "OTL");

  return s;
}

function displayLabel(value) {
  return normalizeText(value).toUpperCase();
}

function isExcludedLabel(value) {
  const key = normKeyForMatch(value);
  if (!key) return false;
  if (EXCLUDE_SET.has(key)) return true;

  for (const item of EXCLUDE_SET) {
    if (key.includes(item)) return true;
  }

  return false;
}

function mostrarEnDashboard(row) {
  const raw =
    row?.mostrar_dashboard ??
    row?.mostrarDashboard ??
    row?.["MOSTRAR EN DASHBOARD"] ??
    "";

  const value = normKeyForMatch(raw);

  return !["NO", "N", "FALSE", "0"].includes(value);
}

function toNumberSmart(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim();

  if (!s) return 0;

  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/COP/gi, "")
    .replace(/USD/gi, "")
    .replace(/[$€£]/g, "");

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";

    s = s.split(thousandSep).join("");

    if (decimalSep === ",") {
      s = s.replace(",", ".");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1) {
      const after = s.slice(lastComma + 1);
      const before = s.slice(0, lastComma).replace(/^[+-]/, "");

      if (after.length === 3 && before.length <= 3) {
        s = s.replace(",", "");
      } else {
        s = s.replace(",", ".");
      }
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (dotCount > 0 && commaCount === 0) {
    if (dotCount === 1) {
      const after = s.slice(lastDot + 1);
      const before = s.slice(0, lastDot).replace(/^[+-]/, "");

      if (after.length === 3 && before.length <= 3) {
        s = s.replace(".", "");
      }
    } else {
      s = s.replace(/\./g, "");
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");

  const n = Number(s);

  return Number.isFinite(n) ? n : 0;
}

function readMoney(row, keys) {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return toNumberSmart(value);
    }
  }

  return 0;
}

function fmtMoney(value) {
  return `$${nfMoney.format(toNumberSmart(value))}`;
}

function toOptions(values = []) {
  const map = new Map();

  values.forEach((value) => {
    const raw = normalizeText(value);
    if (!raw) return;

    const key = normKeyForMatch(raw);

    if (!map.has(key)) {
      map.set(key, {
        value: raw,
        label: displayLabel(raw),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "es", { sensitivity: "base" })
  );
}

function toDateOptions(values = []) {
  return [...new Set(values.filter(Boolean))]
    .sort()
    .map((value) => ({
      value,
      label: value,
    }));
}

function toIsoDate(value) {
  if (!value) return "";

  const s = String(value).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const d = new Date(s);

  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function matchMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = normKeyForMatch(value);

  return selected.some((opt) => normKeyForMatch(opt?.value) === current);
}

function matchDateMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = toIsoDate(value);

  return selected.some((opt) => toIsoDate(opt?.value) === current);
}

function getYearFromRow(row) {
  const raw = String(row?.fecha_creacion ?? "").trim();
  const match = raw.match(/^(\d{4})-/);

  return match?.[1] || "";
}

function getMonthFromRow(row) {
  const raw = String(row?.fecha_creacion ?? "").trim();
  const match = raw.match(/^\d{4}-(\d{2})-/);

  if (!match?.[1]) return "";

  return String(Number(match[1]));
}

function valuesOf(selected = []) {
  return selected.map((item) => item.value);
}

function buildBackendQuery(filters) {
  const params = new URLSearchParams();

  valuesOf(filters.anios).forEach((v) => params.append("anio[]", v));
  valuesOf(filters.meses).forEach((v) => params.append("mes[]", v));
  valuesOf(filters.estadoOT).forEach((v) => params.append("estado_ot[]", v));
  valuesOf(filters.estadoOferta).forEach((v) => params.append("estado_oferta[]", v));

  valuesOf(filters.direccionComercial).forEach((v) =>
    params.append("direccion_comercial[]", v)
  );

  valuesOf(filters.gerenciaComercial).forEach((v) =>
    params.append("gerencia_comercial[]", v)
  );

  valuesOf(filters.calificacion).forEach((v) =>
    params.append("calificacion_oportunidad[]", v)
  );

  valuesOf(filters.fechaActaCierreOT).forEach((v) =>
    params.append("fecha_acta_cierre_ot[]", v)
  );

  const query = params.toString();

  return query ? `?${query}` : "";
}

function buildPivotRows(rows) {
  const parentMap = new Map();

  rows.forEach((row) => {
    const parentRaw =
      row?.direccion_comercial ||
      row?.gerencia_comercial ||
      "SIN DIRECCION COMERCIAL";

    const childRaw = row?.comercial_asignado || "SIN COMERCIAL ASIGNADO";

    const parentKey = normKeyForMatch(parentRaw);
    const childKey = normKeyForMatch(childRaw);

    const otc = readMoney(row, ["otc", "OTC", "otr", "OTR"]);
    const mrc = readMoney(row, ["mrc", "MRC"]);

    if (!parentMap.has(parentKey)) {
      parentMap.set(parentKey, {
        key: parentKey,
        label: displayLabel(parentRaw),
        count: 0,
        otc: 0,
        mrc: 0,
        childrenMap: new Map(),
      });
    }

    const parent = parentMap.get(parentKey);

    parent.count += 1;
    parent.otc += otc;
    parent.mrc += mrc;

    if (!parent.childrenMap.has(childKey)) {
      parent.childrenMap.set(childKey, {
        key: childKey,
        label: displayLabel(childRaw),
        count: 0,
        otc: 0,
        mrc: 0,
      });
    }

    const child = parent.childrenMap.get(childKey);

    child.count += 1;
    child.otc += otc;
    child.mrc += mrc;
  });

  const parents = Array.from(parentMap.values())
    .map((parent) => ({
      ...parent,
      children: Array.from(parent.childrenMap.values()).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;

        return a.label.localeCompare(b.label, "es", {
          sensitivity: "base",
        });
      }),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;

      return a.label.localeCompare(b.label, "es", {
        sensitivity: "base",
      });
    });

  const total = parents.reduce(
    (acc, item) => {
      acc.count += item.count;
      acc.otc += item.otc;
      acc.mrc += item.mrc;
      return acc;
    },
    {
      count: 0,
      otc: 0,
      mrc: 0,
    }
  );

  return {
    parents,
    total,
  };
}

function CheckboxOption(props) {
  return (
    <components.Option {...props}>
      <div className="dcom-rs-option">
        <input type="checkbox" checked={props.isSelected} readOnly />
        <span>{props.label}</span>
      </div>
    </components.Option>
  );
}

const rsStyles = {
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderRadius: 6,
    borderColor: state.isFocused ? "#94a3b8" : "#d1d5db",
    boxShadow: state.isFocused
      ? "0 0 0 3px rgba(148, 163, 184, 0.18)"
      : "none",
    ":hover": {
      borderColor: "#94a3b8",
    },
    fontSize: 12,
  }),
  placeholder: (base) => ({
    ...base,
    color: "#6b7280",
    fontSize: 12,
  }),
  valueContainer: (base) => ({
    ...base,
    maxHeight: 70,
    overflowY: "auto",
  }),
  multiValue: (base) => ({
    ...base,
    background: "#e2e8f0",
    borderRadius: 999,
  }),
  multiValueLabel: (base) => ({
    ...base,
    fontSize: 11,
    fontWeight: 700,
  }),
};

/* ===================== Component ===================== */

export default function DetalleComercial({ onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  const [options, setOptions] = useState({
    anios: [],
    meses: [],
    estadoOT: [],
    estadoOferta: [],
    direccionComercial: [],
    gerenciaComercial: [],
    calificacion: [],
    fechaActaCierreOT: [],
  });

  const [filters, setFilters] = useState({
    anios: [],
    meses: [],
    estadoOT: [],
    estadoOferta: [],
    comercialAsignado: [],
    direccionComercial: [],
    gerenciaComercial: [],
    calificacion: [],
    origenOportunidad: [],
    fechaAdjudicacion: [],
    fechaActaCierreOT: [],
  });

  const [expanded, setExpanded] = useState({});

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const backendQuery = useMemo(() => {
    return buildBackendQuery(filters);
  }, [
    filters.anios,
    filters.meses,
    filters.estadoOT,
    filters.estadoOferta,
    filters.direccionComercial,
    filters.gerenciaComercial,
    filters.calificacion,
    filters.fechaActaCierreOT,
  ]);

  useEffect(() => {
    let active = true;

    async function loadFilters() {
      try {
        const res = await jfetch("/oportunidades/filters");
        const json = await res.json();

        if (!active) return;

        setOptions({
          anios: (json.anios || []).map((year) => ({
            value: String(year),
            label: String(year),
          })),

          meses: (json.meses || []).map((month) => ({
            value: String(month),
            label: MONTH_LABELS[Number(month)] || String(month),
          })),

          estadoOT: toOptions(json.estado_ot || []),
          estadoOferta: toOptions(json.estado_oferta || []),
          direccionComercial: toOptions(json.direccion_comercial || []),
          gerenciaComercial: toOptions(json.gerencia_comercial || []),
          calificacion: toOptions(json.calificacion_oportunidad || []),
          fechaActaCierreOT: toDateOptions(json.fecha_acta_cierre_ot || []),
        });
      } catch (error) {
        console.error("Error cargando filtros Detalle Comercial:", error);
      }
    }

    loadFilters();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadRows() {
      setLoading(true);

      try {
        const res = await jfetch(`/oportunidades${backendQuery}`);
        const json = await res.json();

        if (!active) return;

        setRows(Array.isArray(json) ? json : []);
      } catch (error) {
        console.error("Error cargando Detalle Comercial:", error);

        if (active) {
          setRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRows();

    return () => {
      active = false;
    };
  }, [backendQuery]);

  const dynamicOptions = useMemo(() => {
    return {
      comercialAsignado: toOptions(rows.map((row) => row?.comercial_asignado)),
      origenOportunidad: toOptions(rows.map((row) => row?.origen_oportunidad)),
      fechaAdjudicacion: toDateOptions(
        rows.map((row) => toIsoDate(row?.fecha_aceptacion_oferta)).filter(Boolean)
      ),
    };
  }, [rows]);

  const dataFiltrada = useMemo(() => {
    return (rows || []).filter((row) => {
      if (!mostrarEnDashboard(row)) return false;
      if (isExcludedLabel(row?.estado_oferta)) return false;
      if (isExcludedLabel(row?.resultado_oferta)) return false;

      return (
        matchMulti(getYearFromRow(row), filters.anios) &&
        matchMulti(getMonthFromRow(row), filters.meses) &&
        matchMulti(row?.estado_ot, filters.estadoOT) &&
        matchMulti(row?.estado_oferta, filters.estadoOferta) &&
        matchMulti(row?.comercial_asignado, filters.comercialAsignado) &&
        matchMulti(row?.direccion_comercial, filters.direccionComercial) &&
        matchMulti(row?.gerencia_comercial, filters.gerenciaComercial) &&
        matchMulti(row?.calificacion_oportunidad, filters.calificacion) &&
        matchMulti(row?.origen_oportunidad, filters.origenOportunidad) &&
        matchDateMulti(row?.fecha_aceptacion_oferta, filters.fechaAdjudicacion) &&
        matchDateMulti(row?.fecha_acta_cierre_ot, filters.fechaActaCierreOT)
      );
    });
  }, [rows, filters]);

  const kpis = useMemo(() => {
    let activas = 0;
    let cerradas = 0;
    let ganadas = 0;

    for (const row of dataFiltrada) {
      const estado = normKeyForMatch(row?.estado_oferta);

      if (ESTADOS_ACTIVOS.has(estado)) {
        activas += 1;
      }

      if (ESTADOS_CERRADOS.has(estado)) {
        cerradas += 1;
      }

      if (estado === "GANADA") {
        ganadas += 1;
      }
    }

    const total = activas + cerradas;

    return {
      total,
      activas,
      cerradas,
      porcentajeGanadas: total ? (ganadas / total) * 100 : 0,
    };
  }, [dataFiltrada]);

  const pivot = useMemo(() => {
    return buildPivotRows(dataFiltrada);
  }, [dataFiltrada]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };

      pivot.parents.forEach((parent) => {
        if (typeof next[parent.key] === "undefined") {
          next[parent.key] = true;
        }
      });

      return next;
    });
  }, [pivot.parents]);

  const selectCommon = {
    isMulti: true,
    closeMenuOnSelect: false,
    hideSelectedOptions: false,
    styles: rsStyles,
    menuPortalTarget: portalTarget,
    getOptionValue: (item) => String(item.value),
    getOptionLabel: (item) => String(item.label),
    components: {
      Option: CheckboxOption,
    },
    classNamePrefix: "rs",
  };

  const limpiarFiltros = () => {
    setFilters({
      anios: [],
      meses: [],
      estadoOT: [],
      estadoOferta: [],
      comercialAsignado: [],
      direccionComercial: [],
      gerenciaComercial: [],
      calificacion: [],
      origenOportunidad: [],
      fechaAdjudicacion: [],
      fechaActaCierreOT: [],
    });
  };

  const toggleExpanded = (key) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const tabs = [
    { key: "resumen", label: "Resumen" },
    { key: "win-rate", label: "Win Rate" },
    { key: "detalle-perdidas", label: "Detalle perdidas" },
    { key: "detalle-consultorias", label: "Detalle Consultorias" },
    { key: "detalle-comercial", label: "Detalle Comercial" },
    { key: "detalle-ots", label: "Detalle OTS" },
    { key: "ingreso-cierre-mes", label: "Ingreso por cierre de mes" },
  ];

  return (
    <div className="dcom-wrapper">
      <div className="dcom-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`dcom-tab-btn ${
              tab.key === "detalle-comercial" ? "is-active" : ""
            }`}
            onClick={() => onNavigate?.(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <header className="dcom-header">
        <h1>Consultorías y oportunidades comerciales CoE SAP</h1>
        <div className="dcom-logo">Claro</div>
      </header>

      <div className="dcom-layout">
        <main className="dcom-main">
          {loading && <div className="dcom-loading">Cargando información...</div>}

          <section className="dcom-kpis">
            <div className="dcom-kpi-card">
              <span>Cantidad</span>
              <strong>{kpis.total}</strong>
            </div>

            <div className="dcom-kpi-card">
              <span>Activas</span>
              <strong>{kpis.activas}</strong>
            </div>

            <div className="dcom-kpi-card">
              <span>Cerradas</span>
              <strong>{kpis.cerradas}</strong>
            </div>

            <div className="dcom-kpi-card">
              <span>%Ganadas</span>
              <strong>{kpis.porcentajeGanadas.toFixed(2)} %</strong>
            </div>
          </section>

          <section className="dcom-table-card">
            <div className="dcom-table-scroll">
              <table className="dcom-table">
                <thead>
                  <tr>
                    <th>DIRECCION COMERCIAL</th>
                    <th>Cantidad</th>
                    <th>MRC</th>
                    <th>OTC</th>
                  </tr>
                </thead>

                <tbody>
                  {pivot.parents.length ? (
                    pivot.parents.map((parent) => (
                      <React.Fragment key={parent.key}>
                        <tr className="dcom-parent-row">
                          <td>
                            <button
                              type="button"
                              className="dcom-expand-btn"
                              onClick={() => toggleExpanded(parent.key)}
                            >
                              {expanded[parent.key] ? "⊟" : "⊞"}
                            </button>

                            <span className="dcom-parent-label">{parent.label}</span>
                          </td>

                          <td>{parent.count}</td>
                          <td>{fmtMoney(parent.mrc)}</td>
                          <td>{fmtMoney(parent.otc)}</td>
                        </tr>

                        {expanded[parent.key] &&
                          parent.children.map((child) => (
                            <tr
                              key={`${parent.key}-${child.key}`}
                              className="dcom-child-row"
                            >
                              <td>
                                <span className="dcom-child-indent" />
                                <span>{child.label}</span>
                              </td>

                              <td>{child.count}</td>
                              <td>{fmtMoney(child.mrc)}</td>
                              <td>{fmtMoney(child.otc)}</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="dcom-empty">
                        No hay información para los filtros seleccionados.
                      </td>
                    </tr>
                  )}

                  <tr className="dcom-total-row">
                    <td>Total</td>
                    <td>{pivot.total.count}</td>
                    <td>{fmtMoney(pivot.total.mrc)}</td>
                    <td>{fmtMoney(pivot.total.otc)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="dcom-sidebar">
          <div className="dcom-filter-item">
            <label>Año, Mes</label>

            <div className="dcom-filter-double">
              <Select
                {...selectCommon}
                placeholder="Año"
                options={options.anios}
                value={filters.anios}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, anios: value || [] }))
                }
              />

              <Select
                {...selectCommon}
                placeholder="Mes"
                options={options.meses}
                value={filters.meses}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, meses: value || [] }))
                }
              />
            </div>
          </div>

          <div className="dcom-filter-item">
            <label>ESTADO OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.estadoOT}
              value={filters.estadoOT}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, estadoOT: value || [] }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>ESTADO_OFERTA_GLOBAL</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.estadoOferta}
              value={filters.estadoOferta}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, estadoOferta: value || [] }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>COMERCIAL ASIGNADO</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={dynamicOptions.comercialAsignado}
              value={filters.comercialAsignado}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  comercialAsignado: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>DIRECCION COMERCIAL</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.direccionComercial}
              value={filters.direccionComercial}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  direccionComercial: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>GERENCIA COMERCIAL</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.gerenciaComercial}
              value={filters.gerenciaComercial}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  gerenciaComercial: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>CALIFICACION OPORTUNIDAD</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.calificacion}
              value={filters.calificacion}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  calificacion: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>ORIGEN DE LA OPORTUNIDAD</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={dynamicOptions.origenOportunidad}
              value={filters.origenOportunidad}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  origenOportunidad: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>F. Adjudicación</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={dynamicOptions.fechaAdjudicacion}
              value={filters.fechaAdjudicacion}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  fechaAdjudicacion: value || [],
                }))
              }
            />
          </div>

          <div className="dcom-filter-item">
            <label>FECHA ACTA DE CIERRE Y/O OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.fechaActaCierreOT}
              value={filters.fechaActaCierreOT}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  fechaActaCierreOT: value || [],
                }))
              }
            />
          </div>

          <button type="button" className="dcom-clear-btn" onClick={limpiarFiltros}>
            Borrar todas las segmentaciones
          </button>
        </aside>
      </div>
    </div>
  );
}
import React, { useEffect, useMemo, useState } from "react";
import Select, { components } from "react-select";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./DetallePerdidas.css";

const nfMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nfPercent = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

const MONTH_SHORT = {
  1: "ene",
  2: "feb",
  3: "mar",
  4: "abr",
  5: "may",
  6: "jun",
  7: "jul",
  8: "ago",
  9: "sep",
  10: "oct",
  11: "nov",
  12: "dic",
};

const CATEGORY_COLORS = [
  "#2563eb",
  "#0f766e",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#ca8a04",
  "#059669",
  "#0891b2",
  "#dc2626",
  "#475569",
];

const rsStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 8,
    borderColor: state.isFocused ? "#93c5fd" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, .15)" : "none",
    ":hover": { borderColor: "#93c5fd" },
    fontSize: 12,
    background: "#fff",
  }),
  placeholder: (base) => ({ ...base, color: "#64748b", fontSize: 12, fontWeight: 600 }),
  valueContainer: (base) => ({
    ...base,
    padding: "2px 8px",
    maxHeight: 70,
    overflowY: "auto",
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 6,
    background: "#dbeafe",
    maxWidth: 110,
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#1e3a8a",
    fontSize: 11,
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#1e3a8a",
    ":hover": { background: "#93c5fd", color: "#0f172a" },
  }),
  menuPortal: (base) => ({ ...base, zIndex: 99999 }),
  menu: (base) => ({ ...base, zIndex: 99999, fontSize: 12 }),
  option: (base) => ({ ...base, display: "flex", alignItems: "center", gap: 8 }),
};

function CheckboxOption(props) {
  return (
    <components.Option {...props}>
      <div className="dper-rs-option">
        <input type="checkbox" checked={props.isSelected} readOnly />
        <span>{props.label}</span>
      </div>
    </components.Option>
  );
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").trim();
}

function normKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function displayText(value, fallback = "-") {
  const text = normalizeText(value);
  return text || fallback;
}

function displayUpper(value, fallback = "-") {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : fallback;
}

function toNumberSmart(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim();
  if (!s) return 0;

  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/\b(COP|USD)\b/gi, "")
    .replace(/[$€£]/g, "")
    .replace(/%/g, "");

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("");
    if (decimalSep === ",") s = s.replace(",", ".");
  } else if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1) {
      const after = s.slice(lastComma + 1);
      const before = s.slice(0, lastComma).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(",", "");
      else s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (dotCount > 0 && commaCount === 0) {
    if (dotCount === 1) {
      const after = s.slice(lastDot + 1);
      const before = s.slice(0, lastDot).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(".", "");
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
  return `$ ${nfMoney.format(toNumberSmart(value))}`;
}

function fmtPercent(value) {
  return `${nfPercent.format(value || 0)} %`;
}

function toIsoDate(value) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const ddmmyyyy = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return "-";

  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function getYearFromDate(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 4) : "";
}

function getMonthFromDate(value) {
  const iso = toIsoDate(value);
  return iso ? String(Number(iso.slice(5, 7))) : "";
}

function getFechaBase(row) {
  return (
    row?.fecha_creacion ??
    row?.fecha_asignacion ??
    row?.fecha_cierre_oportunidad ??
    row?.fecha_acta_cierre_ot ??
    ""
  );
}

function getFechaCierreOportunidad(row) {
  return (
    row?.fecha_cierre_oportunidad ??
    row?.fecha_cierre ??
    row?.fecha_acta_cierre_ot ??
    row?.fecha_entrega_oferta_final ??
    ""
  );
}

function mostrarEnDashboard(row) {
  const raw =
    row?.mostrar_dashboard ??
    row?.mostrarDashboard ??
    row?.["MOSTRAR EN DASHBOARD"] ??
    "";

  const value = normKey(raw);
  return !["NO", "N", "FALSE", "0"].includes(value);
}

function isLostOpportunity(row) {
  const estado = normKey(row?.estado_oferta);
  const resultado = normKey(row?.resultado_oferta);

  return (
    estado === "PERDIDA" ||
    estado === "PERDIDA - SIN FEEDBACK" ||
    resultado === "OPORTUNIDAD PERDIDA" ||
    resultado === "OPORTUNIDAD CERRADA"
  );
}

function normalizeMonthValue(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 12 ? String(n) : "";
  }

  const key = normKey(raw);
  const found = Object.entries(MONTH_LABELS).find(([, label]) => normKey(label) === key);

  return found ? String(Number(found[0])) : "";
}

function toOptions(values = []) {
  const map = new Map();

  values.forEach((value) => {
    const raw = normalizeText(value);
    if (!raw) return;

    const key = normKey(raw);
    if (!map.has(key)) {
      map.set(key, { value: raw, label: raw });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    String(a.label).localeCompare(String(b.label), "es", { sensitivity: "base" })
  );
}

function toDateOptions(values = []) {
  return [...new Set(values.map(toIsoDate).filter(Boolean))]
    .sort()
    .map((value) => ({ value, label: value }));
}

function yearOptionsFromRows(rows) {
  return [...new Set((rows || []).map((row) => getYearFromDate(getFechaBase(row))).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
    .map((year) => ({ value: year, label: year }));
}

function monthOptionsFromRows(rows) {
  return [...new Set((rows || []).map((row) => getMonthFromDate(getFechaBase(row))).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
    .map((month) => ({
      value: month,
      label: MONTH_LABELS[Number(month)] || month,
    }));
}

function matchMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;
  const current = normKey(value);
  return selected.some((opt) => normKey(opt?.value) === current);
}

function matchMonthMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = normalizeMonthValue(value);
  if (!current) return false;

  return selected.some((opt) => normalizeMonthValue(opt?.value) === current);
}

function matchDateMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;
  const current = toIsoDate(value);
  return selected.some((opt) => toIsoDate(opt?.value) === current);
}

function valuesOf(selected = []) {
  return selected.map((item) => item.value);
}

function buildBackendQuery(filters) {
  const params = new URLSearchParams();
  const add = (key, values) => valuesOf(values).forEach((value) => params.append(`${key}[]`, value));

  add("direccion_comercial", filters.direccionComercial);
  add("gerencia_comercial", filters.gerenciaComercial);
  add("nombre_cliente", filters.cliente);
  add("estado_oferta", filters.estadoOferta);
  add("resultado_oferta", filters.resultadoOferta);
  add("fecha_acta_cierre_ot", filters.fechaActaCierreOT);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function sumMoney(rows, keys) {
  return (rows || []).reduce((acc, row) => acc + readMoney(row, keys), 0);
}

function buildCommercialRows(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const comercial = displayText(row?.comercial_asignado, "SIN COMERCIAL ASIGNADO");
    const key = normKey(comercial);

    if (!map.has(key)) {
      map.set(key, {
        comercial,
        cantidad: 0,
        otc: 0,
        mrc: 0,
      });
    }

    const item = map.get(key);
    item.cantidad += 1;
    item.otc += readMoney(row, ["otc", "OTC", "otr", "OTR"]);
    item.mrc += readMoney(row, ["mrc", "MRC"]);
  });

  const total = rows.length || 0;

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      participacion: total ? (item.cantidad / total) * 100 : 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.comercial.localeCompare(b.comercial));
}

function buildCategoryRows(rows) {
  const categories = new Map();
  const subcategoryColors = new Map();
  let colorIndex = 0;

  rows.forEach((row) => {
    const categoria = displayUpper(row?.categoria_perdida, "(EN BLANCO)");
    const subcategoria = displayUpper(row?.subcategoria_perdida, "(EN BLANCO)");

    if (!categories.has(categoria)) {
      categories.set(categoria, {
        categoria,
        total: 0,
        subcategorias: new Map(),
      });
    }

    const cat = categories.get(categoria);
    cat.total += 1;

    cat.subcategorias.set(subcategoria, (cat.subcategorias.get(subcategoria) || 0) + 1);

    const colorKey = normKey(subcategoria);
    if (!subcategoryColors.has(colorKey)) {
      subcategoryColors.set(colorKey, CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length]);
      colorIndex += 1;
    }
  });

  return Array.from(categories.values())
    .map((cat) => ({
      categoria: cat.categoria,
      total: cat.total,
      subcategorias: Array.from(cat.subcategorias.entries())
        .map(([label, value]) => ({
          label,
          value,
          color: subcategoryColors.get(normKey(label)),
        }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria));
}

function buildTrendRows(allRows, lostRows) {
  const map = new Map();

  const touch = (row) => {
    const fecha = getFechaBase(row);
    const year = getYearFromDate(fecha);
    const month = getMonthFromDate(fecha);
    if (!year || !month) return null;

    const key = `${year}-${String(month).padStart(2, "0")}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        year,
        month,
        label: `${MONTH_SHORT[Number(month)] || month} ${year}`,
        cantidad: 0,
        perdidas: 0,
      });
    }

    return map.get(key);
  };

  allRows.forEach((row) => {
    const item = touch(row);
    if (item) item.cantidad += 1;
  });

  lostRows.forEach((row) => {
    const item = touch(row);
    if (item) item.perdidas += 1;
  });

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

const DATE_AT_START = /^\s*(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]?\s*/;
const DATE_ANYWHERE = /(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]\s*/g;

function splitDatedEntries(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const out = [];

  for (const line of lines) {
    const parts = [];
    let lastIndex = 0;
    const matches = [...line.matchAll(DATE_ANYWHERE)];

    if (matches.length <= 1) {
      parts.push(line);
    } else {
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index ?? 0;

        if (i === 0 && start !== 0) {
          const pre = line.slice(0, start).trim();
          if (pre) parts.push(pre);
        }

        if (i > 0) {
          const chunk = line.slice(lastIndex, start).trim();
          if (chunk) parts.push(chunk);
        }

        lastIndex = start;
      }

      const tail = line.slice(lastIndex).trim();
      if (tail) parts.push(tail);
    }

    for (const part of parts) {
      const match = part.match(DATE_AT_START);
      if (match) {
        const date = match[1];
        const body = part.replace(DATE_AT_START, "").trim();
        out.push({ date, text: body || "-" });
      } else {
        out.push({ date: null, text: part });
      }
    }
  }

  return out;
}

function renderObservaciones(value) {
  const items = splitDatedEntries(value);

  if (!items.length) return "-";

  return (
    <div className="dper-obs-list">
      {items.map((item, index) => (
        <div key={index} className="dper-obs-item">
          {item.date ? <span className="dper-obs-date">{item.date}</span> : null}
          <span className="dper-obs-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function DetallePerdidas({ onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    anios: [],
    meses: [],
    fechaActaCierreOT: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    comercialAsignado: [],
    categoriaPerdida: [],
    subcategoriaPerdida: [],
    tipoMoneda: [],
  });

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const selectCommon = {
    isMulti: true,
    closeMenuOnSelect: false,
    hideSelectedOptions: false,
    styles: rsStyles,
    menuPortalTarget: portalTarget,
    getOptionValue: (item) => String(item.value),
    getOptionLabel: (item) => String(item.label),
    components: { Option: CheckboxOption },
    classNamePrefix: "react-select",
  };

  const backendQuery = useMemo(() => buildBackendQuery(filters), [
    filters.fechaActaCierreOT,
    filters.direccionComercial,
    filters.gerenciaComercial,
    filters.cliente,
    filters.estadoOferta,
    filters.resultadoOferta,
  ]);

  useEffect(() => {
    let active = true;

    async function loadRows() {
      setLoading(true);

      try {
        const res = await jfetch(`/oportunidades${backendQuery}`);

        if (!res.ok) throw new Error("No se pudo consultar oportunidades");

        const json = await res.json();

        if (!active) return;

        setRows(Array.isArray(json) ? json : []);
      } catch (error) {
        console.error("Error cargando Detalle Pérdidas:", error);
        if (active) setRows([]);
        Swal.fire("Error", "No se pudo consultar el detalle de pérdidas", "error");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRows();

    return () => {
      active = false;
    };
  }, [backendQuery]);

  const baseRows = useMemo(() => {
    return (rows || []).filter(mostrarEnDashboard);
  }, [rows]);

  const options = useMemo(() => {
    return {
      anios: yearOptionsFromRows(baseRows),
      meses: monthOptionsFromRows(baseRows),
      fechaActaCierreOT: toDateOptions(baseRows.map((row) => row?.fecha_acta_cierre_ot)),
      direccionComercial: toOptions(baseRows.map((row) => row?.direccion_comercial)),
      gerenciaComercial: toOptions(baseRows.map((row) => row?.gerencia_comercial)),
      cliente: toOptions(baseRows.map((row) => row?.nombre_cliente)),
      estadoOferta: toOptions(baseRows.map((row) => row?.estado_oferta)),
      resultadoOferta: toOptions(baseRows.map((row) => row?.resultado_oferta)),
      comercialAsignado: toOptions(baseRows.map((row) => row?.comercial_asignado)),
      categoriaPerdida: toOptions(baseRows.filter(isLostOpportunity).map((row) => row?.categoria_perdida || "(En blanco)")),
      subcategoriaPerdida: toOptions(baseRows.filter(isLostOpportunity).map((row) => row?.subcategoria_perdida || "(En blanco)")),
      tipoMoneda: toOptions(baseRows.map((row) => row?.tipo_moneda)),
    };
  }, [baseRows]);

  const filteredAllRows = useMemo(() => {
    return baseRows.filter((row) => {
      const categoria = normalizeText(row?.categoria_perdida) || "(En blanco)";
      const subcategoria = normalizeText(row?.subcategoria_perdida) || "(En blanco)";

      return (
        matchMulti(getYearFromDate(getFechaBase(row)), filters.anios) &&
        matchMonthMulti(getMonthFromDate(getFechaBase(row)), filters.meses) &&
        matchDateMulti(row?.fecha_acta_cierre_ot, filters.fechaActaCierreOT) &&
        matchMulti(row?.direccion_comercial, filters.direccionComercial) &&
        matchMulti(row?.gerencia_comercial, filters.gerenciaComercial) &&
        matchMulti(row?.nombre_cliente, filters.cliente) &&
        matchMulti(row?.estado_oferta, filters.estadoOferta) &&
        matchMulti(row?.resultado_oferta, filters.resultadoOferta) &&
        matchMulti(row?.comercial_asignado, filters.comercialAsignado) &&
        matchMulti(categoria, filters.categoriaPerdida) &&
        matchMulti(subcategoria, filters.subcategoriaPerdida) &&
        matchMulti(row?.tipo_moneda, filters.tipoMoneda)
      );
    });
  }, [baseRows, filters]);

  const lostRows = useMemo(() => filteredAllRows.filter(isLostOpportunity), [filteredAllRows]);

  const kpis = useMemo(() => {
    const total = filteredAllRows.length;
    const perdidas = lostRows.length;
    const porcentaje = total ? (perdidas / total) * 100 : 0;
    const otc = sumMoney(lostRows, ["otc", "OTC", "otr", "OTR"]);
    const mrc = sumMoney(lostRows, ["mrc", "MRC"]);

    return { total, perdidas, porcentaje, otc, mrc };
  }, [filteredAllRows, lostRows]);

  const commercialRows = useMemo(() => buildCommercialRows(lostRows), [lostRows]);

  const commercialTotals = useMemo(() => {
    return {
      cantidad: commercialRows.reduce((acc, item) => acc + item.cantidad, 0),
      otc: commercialRows.reduce((acc, item) => acc + item.otc, 0),
      mrc: commercialRows.reduce((acc, item) => acc + item.mrc, 0),
    };
  }, [commercialRows]);

  const categoryRows = useMemo(() => buildCategoryRows(lostRows), [lostRows]);
  const trendRows = useMemo(() => buildTrendRows(filteredAllRows, lostRows), [filteredAllRows, lostRows]);

  const clearFilters = () => {
    setFilters({
      anios: [],
      meses: [],
      fechaActaCierreOT: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      estadoOferta: [],
      resultadoOferta: [],
      comercialAsignado: [],
      categoriaPerdida: [],
      subcategoriaPerdida: [],
      tipoMoneda: [],
    });
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
    <div className="dper-wrapper">
      <div className="dper-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`dper-tab-btn ${tab.key === "detalle-perdidas" ? "is-active" : ""}`}
            onClick={() => onNavigate?.(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dper-titlebar">
        <div>
          <h2>Consultorías y oportunidades Perdidas CoE SAP</h2>
          <p>Análisis de pérdidas por comercial, categoría, subcategoría y periodo.</p>
        </div>

        {loading && <div className="dper-loading">Cargando información...</div>}
      </div>

      <div className="dper-layout">
        <main className="dper-main">
          <section className="dper-kpi-grid">
            <KpiCard label="Cantidad" value={kpis.total} />
            <KpiCard label="Perdidas" value={kpis.perdidas} danger />
            <KpiCard label="% Perdidas" value={fmtPercent(kpis.porcentaje)} danger />
            <KpiCard label="OTC perdido" value={fmtMoney(kpis.otc)} />
            <KpiCard label="MRC perdido" value={fmtMoney(kpis.mrc)} />
          </section>

          <section className="dper-top-grid">
            <div className="dper-card dper-card-table">
              <div className="dper-card-title">Resumen por comercial asignado</div>
              <div className="dper-table-scroll dper-table-scroll-small">
                <table className="dper-table">
                  <thead>
                    <tr>
                      <th>COMERCIAL ASIGNADO</th>
                      <th>Cantidad</th>
                      <th>%Part</th>
                      <th>MRC</th>
                      <th>OTC</th>
                    </tr>
                  </thead>

                  <tbody>
                    {commercialRows.length ? (
                      commercialRows.map((row) => (
                        <tr key={row.comercial}>
                          <td className="dper-left">{row.comercial}</td>
                          <td>{row.cantidad}</td>
                          <td>{fmtPercent(row.participacion)}</td>
                          <td>{fmtMoney(row.mrc)}</td>
                          <td>{fmtMoney(row.otc)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="dper-empty">
                          Sin información de pérdidas.
                        </td>
                      </tr>
                    )}

                    <tr className="dper-total-row">
                      <td>Total</td>
                      <td>{commercialTotals.cantidad}</td>
                      <td>{commercialTotals.cantidad ? "100,00 %" : "0,00 %"}</td>
                      <td>{fmtMoney(commercialTotals.mrc)}</td>
                      <td>{fmtMoney(commercialTotals.otc)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dper-card">
              <div className="dper-card-title">Cantidad y perdidas por año y mes</div>
              <TrendChart rows={trendRows} />
            </div>
          </section>

          <section className="dper-card">
            <div className="dper-card-title">Cantidad por categoría perdida y subcategoría perdida</div>
            <CategoryStackedBars rows={categoryRows} />
          </section>

          <section className="dper-card">
            <div className="dper-card-title">Detalle de oportunidades perdidas</div>

            <div className="dper-table-scroll dper-detail-scroll">
              <table className="dper-table dper-detail-table">
                <thead>
                  <tr>
                    <th>Nombre Cliente</th>
                    <th>Servicio</th>
                    <th>Fecha</th>
                    <th>F. Cierre Oportunidad</th>
                    <th>Tipo de moneda</th>
                    <th>OTC</th>
                    <th>MRC</th>
                    <th>Comercial</th>
                    <th>Categoría perdida</th>
                    <th>Subcategoría perdida</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>

                <tbody>
                  {lostRows.length ? (
                    lostRows.map((row, index) => (
                      <tr key={row?.id ?? index}>
                        <td className="dper-left">{displayText(row?.nombre_cliente)}</td>
                        <td className="dper-left dper-service-cell">{displayText(row?.servicio)}</td>
                        <td>{formatDate(getFechaBase(row))}</td>
                        <td>{formatDate(getFechaCierreOportunidad(row))}</td>
                        <td>{displayUpper(row?.tipo_moneda, "COP")}</td>
                        <td>{fmtMoney(readMoney(row, ["otc", "OTC", "otr", "OTR"]))}</td>
                        <td>{fmtMoney(readMoney(row, ["mrc", "MRC"]))}</td>
                        <td className="dper-left">{displayText(row?.comercial_asignado)}</td>
                        <td>{displayUpper(row?.categoria_perdida, "(EN BLANCO)")}</td>
                        <td>{displayUpper(row?.subcategoria_perdida, "(EN BLANCO)")}</td>
                        <td className="dper-left dper-obs-cell">{renderObservaciones(row?.observaciones)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="dper-empty">
                        Sin oportunidades perdidas para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="dper-sidebar">
          <FilterSelect
            label="Año"
            selectCommon={selectCommon}
            options={options.anios}
            value={filters.anios}
            onChange={(value) => setFilters((prev) => ({ ...prev, anios: value || [] }))}
          />

          <FilterSelect
            label="Mes"
            selectCommon={selectCommon}
            options={options.meses}
            value={filters.meses}
            onChange={(value) => setFilters((prev) => ({ ...prev, meses: value || [] }))}
          />

          <FilterSelect
            label="Fecha acta de cierre y/o OT"
            selectCommon={selectCommon}
            options={options.fechaActaCierreOT}
            value={filters.fechaActaCierreOT}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, fechaActaCierreOT: value || [] }))
            }
          />

          <FilterSelect
            label="Dirección Comercial"
            selectCommon={selectCommon}
            options={options.direccionComercial}
            value={filters.direccionComercial}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, direccionComercial: value || [] }))
            }
          />

          <FilterSelect
            label="Gerencia Comercial"
            selectCommon={selectCommon}
            options={options.gerenciaComercial}
            value={filters.gerenciaComercial}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, gerenciaComercial: value || [] }))
            }
          />

          <FilterSelect
            label="Nombre Cliente"
            selectCommon={selectCommon}
            options={options.cliente}
            value={filters.cliente}
            onChange={(value) => setFilters((prev) => ({ ...prev, cliente: value || [] }))}
          />

          <FilterSelect
            label="Estado oferta global"
            selectCommon={selectCommon}
            options={options.estadoOferta}
            value={filters.estadoOferta}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, estadoOferta: value || [] }))
            }
          />

          <FilterSelect
            label="Resultado oferta global"
            selectCommon={selectCommon}
            options={options.resultadoOferta}
            value={filters.resultadoOferta}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, resultadoOferta: value || [] }))
            }
          />

          <FilterSelect
            label="Comercial asignado"
            selectCommon={selectCommon}
            options={options.comercialAsignado}
            value={filters.comercialAsignado}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, comercialAsignado: value || [] }))
            }
          />

          <FilterSelect
            label="Categoría perdida"
            selectCommon={selectCommon}
            options={options.categoriaPerdida}
            value={filters.categoriaPerdida}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, categoriaPerdida: value || [] }))
            }
          />

          <FilterSelect
            label="Subcategoría perdida"
            selectCommon={selectCommon}
            options={options.subcategoriaPerdida}
            value={filters.subcategoriaPerdida}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, subcategoriaPerdida: value || [] }))
            }
          />

          <FilterSelect
            label="Tipo de moneda"
            selectCommon={selectCommon}
            options={options.tipoMoneda}
            value={filters.tipoMoneda}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, tipoMoneda: value || [] }))
            }
          />

          <button type="button" className="dper-clear-btn" onClick={clearFilters}>
            Borrar todas las segmentaciones
          </button>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({ label, value, danger = false }) {
  return (
    <div className={`dper-kpi-card ${danger ? "is-danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterSelect({ label, selectCommon, options, value, onChange }) {
  return (
    <div className="dper-filter-item">
      <label>{label}</label>
      <Select
        {...selectCommon}
        placeholder="Todas"
        options={options}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function CategoryStackedBars({ rows }) {
  const max = Math.max(...(rows || []).map((row) => row.total), 1);
  const legend = [];

  (rows || []).forEach((row) => {
    row.subcategorias.forEach((sub) => {
      if (!legend.some((item) => normKey(item.label) === normKey(sub.label))) {
        legend.push({ label: sub.label, color: sub.color });
      }
    });
  });

  return (
    <div className="dper-category-wrap">
      <div className="dper-category-bars">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.categoria} className="dper-category-row">
              <div className="dper-category-label">{row.categoria}</div>

              <div className="dper-category-bar-track">
                <div
                  className="dper-category-bar"
                  style={{ width: `${Math.max((row.total / max) * 100, 4)}%` }}
                >
                  {row.subcategorias.map((sub) => (
                    <div
                      key={sub.label}
                      className="dper-category-segment"
                      style={{
                        width: `${(sub.value / row.total) * 100}%`,
                        background: sub.color,
                      }}
                      title={`${sub.label}: ${sub.value}`}
                    >
                      {sub.value >= 2 ? sub.value : ""}
                    </div>
                  ))}
                </div>

                <span className="dper-category-total">{row.total}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="dper-empty dper-empty-chart">Sin categorías para mostrar.</div>
        )}
      </div>

      <div className="dper-category-legend">
        <div className="dper-legend-title">Subcategoría perdida</div>
        {legend.map((item) => (
          <div key={item.label} className="dper-legend-item">
            <span style={{ background: item.color }} />
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ rows }) {
  const width = 760;
  const height = 245;
  const padding = { top: 26, right: 22, bottom: 58, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...(rows || []).flatMap((row) => [row.cantidad, row.perdidas]), 1);
  const denominator = Math.max((rows || []).length - 1, 1);

  const x = (index) => padding.left + (index / denominator) * innerWidth;
  const y = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  const pathFor = (field) => {
    if (!rows.length) return "";
    return rows.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(row[field])}`).join(" ");
  };

  const ticks = [0, Math.ceil(maxValue / 2), maxValue];

  return (
    <div className="dper-trend-wrap">
      <div className="dper-trend-legend">
        <span className="is-total">Cantidad</span>
        <span className="is-lost">Perdidas</span>
      </div>

      {rows.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="dper-trend-svg" role="img">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(tick)}
                y2={y(tick)}
                className="dper-grid-line"
              />
              <text x={8} y={y(tick) + 4} className="dper-axis-text">
                {tick}
              </text>
            </g>
          ))}

          <path d={pathFor("cantidad")} className="dper-line dper-line-total" />
          <path d={pathFor("perdidas")} className="dper-line dper-line-lost" />

          {rows.map((row, index) => (
            <g key={row.key}>
              <circle cx={x(index)} cy={y(row.cantidad)} r="4" className="dper-dot-total" />
              <circle cx={x(index)} cy={y(row.perdidas)} r="4" className="dper-dot-lost" />

              {(rows.length <= 14 || index % 2 === 0) && (
                <text
                  x={x(index)}
                  y={height - 22}
                  className="dper-axis-text dper-month-label"
                  textAnchor="end"
                  transform={`rotate(-55 ${x(index)} ${height - 22})`}
                >
                  {row.label}
                </text>
              )}

              {row.perdidas > 0 && (
                <text
                  x={x(index)}
                  y={y(row.perdidas) - 8}
                  className="dper-value-text dper-value-lost"
                  textAnchor="middle"
                >
                  {row.perdidas}
                </text>
              )}

              {row.cantidad > 0 && (
                <text
                  x={x(index)}
                  y={y(row.cantidad) - 8}
                  className="dper-value-text"
                  textAnchor="middle"
                >
                  {row.cantidad}
                </text>
              )}
            </g>
          ))}
        </svg>
      ) : (
        <div className="dper-empty dper-empty-chart">Sin datos de tendencia.</div>
      )}
    </div>
  );
}

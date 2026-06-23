import React, { useEffect, useMemo, useState } from "react";
import Select, { components } from "react-select";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./DetalleOTS.css";

const nfMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

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

const CERRADAS_OT = new Set(
  [
    "CERRADA",
    "CERRADAS",
    "CERRADO",
    "CERRADOS",
    "CERRADO CON PAGO",
    "CERRADA CON PAGO",
    "FINALIZADO",
    "FINALIZADA",
    "COMPLETADA",
    "COMPLETADO",
  ].map(normKeyForMatch)
);

const SUSPENDIDAS_OT = new Set(
  [
    "SUSPENDIDA",
    "SUSPENDIDAS",
    "SUSPENDIDO",
    "SUSPENDIDOS",
  ].map(normKeyForMatch)
);

const CANCELADAS_OT = new Set(
  [
    "CANCELADA",
    "CANCELADAS",
    "CANCELADO",
    "CANCELADOS",
  ].map(normKeyForMatch)
);

const EN_PROCESO_OT = new Set(
  [
    "EN PROCESO",
    "EN PROCESO DE EJECUCION",
  ].map(normKeyForMatch)
);

const EN_TRAMITE_OT = new Set(
  [
    "EN TRAMITE",
    "EN TRÁMITE",
  ].map(normKeyForMatch)
);

const rsStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 34,
    borderRadius: 7,
    borderColor: state.isFocused ? "#94a3b8" : "#d1d5db",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(148, 163, 184, .18)" : "none",
    ":hover": { borderColor: "#94a3b8" },
    fontSize: 12,
  }),
  placeholder: (base) => ({ ...base, color: "#64748b", fontSize: 12 }),
  valueContainer: (base) => ({ ...base, padding: "0 8px", maxHeight: 66, overflowY: "auto" }),
  multiValue: (base) => ({ ...base, borderRadius: 999, background: "#e2e8f0" }),
  multiValueLabel: (base) => ({ ...base, fontSize: 11, fontWeight: 800 }),
  menuPortal: (base) => ({ ...base, zIndex: 99999 }),
  menu: (base) => ({ ...base, zIndex: 99999 }),
};

function CheckboxOption(props) {
  return (
    <components.Option {...props}>
      <div className="dots-rs-option">
        <input type="checkbox" checked={props.isSelected} readOnly />
        <span>{props.label}</span>
      </div>
    </components.Option>
  );
}

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

function displayText(value, fallback = "-") {
  const s = normalizeText(value);
  return s || fallback;
}

function displayLabel(value) {
  return normalizeText(value).toUpperCase();
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

function toIsoDate(value) {
  if (!value) return "";

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

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

  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function getNoOT(row) {
  return firstValue(row, [
    "num_ot",
    "no_ot",
    "nro_ot",
    "numero_ot",
    "codigo_ot",
    "orden_trabajo",
    "ot",
    "No OT",
    "NO OT",
  ]);
}

function isNoAplicaValue(value) {
  const normalized = normKeyForMatch(value);

  return [
    "NO APLICA",
    "NO APLICABLE",
    "N/A",
    "NA",
    "N.A",
    "N.A.",
  ].includes(normalized);
}

function isNoOTNoAplica(row) {
  return isNoAplicaValue(getNoOT(row));
}

const ESTADO_OT_KEYS = [
  "estado_ot",
  "estadoOT",
  "estado_proyecto",
  "estadoProyecto",
  "ESTADO OT",
];

function getEstadoOTDirecto(row) {
  return firstValue(row, ESTADO_OT_KEYS);
}

function isEstadoOTNoAplica(row) {
  return isNoAplicaValue(getEstadoOTDirecto(row));
}

function getEstadoOT(row) {
  const estadoDirecto = getEstadoOTDirecto(row);

  if (isEstadoOTNoAplica(row)) {
    return "NO APLICA";
  }

  if (estadoDirecto) {
    return estadoDirecto;
  }

  const estadoOferta = firstValue(row, ["estado_oferta", "estadoOferta", "ESTADO OFERTA"]);
  const resultadoOferta = firstValue(row, [
    "resultado_oferta",
    "resultadoOferta",
    "RESULTADO_OFERTA_GLOBAL",
  ]);

  if (normKeyForMatch(estadoOferta) === "OT" || normKeyForMatch(resultadoOferta) === "OT") {
    return "OT";
  }

  return "";
}

function getFechaCierre(row) {
  return firstValue(row, [
    "fecha_acta_cierre_ot",
    "fecha_cierre",
    "fecha_cierre_oportunidad",
    "fecha_cierre_sm",
    "fecha_entrega_oferta_final",
  ]);
}

function getFechaCompromiso(row) {
  return firstValue(row, [
    "fecha_compromiso",
    "proyeccion_ingreso",
    "fecha_cierre_oportunidad",
    "fecha_creacion",
  ]);
}

function getFechaSuspendida(row) {
  return getFechaCierre(row) || getFechaCompromiso(row) || row?.fecha_creacion || "";
}

function getFechaCancelada(row) {
  return getFechaCierre(row) || getFechaCompromiso(row) || row?.fecha_creacion || "";
}

function getFechaTramite(row) {
  return getFechaCompromiso(row) || getFechaCierre(row) || row?.fecha_creacion || "";
}

function getRelevantDateForFilter(row) {
  const bucket = getOtBucket(row);

  if (bucket === "cerradas") {
    return getFechaCierre(row) || getFechaCompromiso(row) || row?.fecha_creacion || "";
  }

  if (bucket === "suspendidas") {
    return getFechaSuspendida(row);
  }

  if (bucket === "canceladas") {
    return getFechaCancelada(row);
  }

  if (bucket === "tramite") {
    return getFechaTramite(row);
  }

  if (bucket === "proceso") {
    return getFechaCompromiso(row) || getFechaCierre(row) || row?.fecha_creacion || "";
  }

  return getFechaCompromiso(row) || getFechaCierre(row) || row?.fecha_creacion || "";
}

function getYearFromRow(row) {
  const iso = toIsoDate(getRelevantDateForFilter(row));
  return iso ? iso.slice(0, 4) : "";
}

function getMonthFromRow(row) {
  const iso = toIsoDate(getRelevantDateForFilter(row));
  if (!iso) return "";
  return String(Number(iso.slice(5, 7)));
}

function getOtBucket(row) {
  if (isEstadoOTNoAplica(row)) return "otros";

  const estadoN = normKeyForMatch(getEstadoOT(row));

  if (CERRADAS_OT.has(estadoN)) return "cerradas";
  if (SUSPENDIDAS_OT.has(estadoN)) return "suspendidas";
  if (CANCELADAS_OT.has(estadoN)) return "canceladas";
  if (EN_TRAMITE_OT.has(estadoN)) return "tramite";
  if (EN_PROCESO_OT.has(estadoN)) return "proceso";

  if (toIsoDate(getFechaCierre(row))) return "cerradas";
  if (normalizeText(getNoOT(row)) && !isNoOTNoAplica(row)) return "proceso";

  return "otros";
}

function isOTDetailRow(row) {
  if (isEstadoOTNoAplica(row)) return false;
  if (isNoOTNoAplica(row)) return false;

  const noOT = normalizeText(getNoOT(row));
  const estadoOT = normKeyForMatch(getEstadoOT(row));
  const resultado = normKeyForMatch(row?.resultado_oferta);

  return Boolean(
    noOT ||
      estadoOT ||
      resultado === "OT" ||
      toIsoDate(row?.fecha_acta_cierre_ot) ||
      toIsoDate(row?.fecha_compromiso)
  );
}
function normalizeMonthValue(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 12 ? String(n) : "";
  }

  const key = normKeyForMatch(raw);
  const found = Object.entries(MONTH_LABELS).find(([, label]) => normKeyForMatch(label) === key);

  return found ? String(Number(found[0])) : "";
}

function matchMonthMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = normalizeMonthValue(value);
  if (!current) return false;

  return selected.some((opt) => normalizeMonthValue(opt?.value) === current);
}

function yearOptionsFromRows(rows) {
  return [...new Set((rows || []).map(getYearFromRow).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
    .map((year) => ({ value: year, label: year }));
}

function monthOptionsFromRows(rows) {
  return [...new Set((rows || []).map(getMonthFromRow).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
    .map((month) => ({
      value: month,
      label: MONTH_LABELS[Number(month)] || month,
    }));
}

function toOptions(values = []) {
  const map = new Map();

  values.forEach((value) => {
    const raw = normalizeText(value);
    if (!raw) return;

    const key = normKeyForMatch(raw);
    if (!map.has(key)) {
      map.set(key, { value: raw, label: displayLabel(raw) });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    String(a.label).localeCompare(String(b.label), "es", { sensitivity: "base" })
  );
}

function removeNoAplicaValues(values = []) {
  return (Array.isArray(values) ? values : []).filter(
    (value) => normKeyForMatch(value) !== "NO APLICA"
  );
}

function toDateOptions(values = []) {
  return [...new Set(values.map(toIsoDate).filter(Boolean))]
    .sort()
    .map((value) => ({ value, label: value }));
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

function valuesOf(selected = []) {
  return selected.map((item) => item.value);
}

function buildBackendQuery(filters) {
  const params = new URLSearchParams();
  const add = (key, values) => valuesOf(values).forEach((v) => params.append(`${key}[]`, v));

  // No enviamos anio/mes al backend porque el endpoint los aplica sobre fecha_creacion.
  // En Detalle OTS el mes debe salir de la fecha de cierre o compromiso según el estado de la OT.
  add("estado_ot", filters.estadoOT);
  add("direccion_comercial", filters.direccionComercial);
  add("gerencia_comercial", filters.gerenciaComercial);
  add("nombre_cliente", filters.cliente);
  add("fecha_acta_cierre_ot", filters.fechaActaCierreOT);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function getGroupDateValue(row, dateType) {
  if (dateType === "cierre") return getFechaCierre(row);
  if (dateType === "compromiso") return getFechaCompromiso(row);
  if (dateType === "suspendida") return getFechaSuspendida(row);
  if (dateType === "cancelada") return getFechaCancelada(row);
  if (dateType === "tramite") return getFechaTramite(row);
  return "";
}

function getGroupDate(row, dateType) {
  return formatDate(getGroupDateValue(row, dateType));
}

function buildDetalleRows(rows, config) {
  const map = new Map();

  rows.forEach((row) => {
    const fechaRaw = getGroupDateValue(row, config.dateType);
    const fechaIso = toIsoDate(fechaRaw);
    const fecha = formatDate(fechaRaw);
    const nombreCliente = displayText(row?.nombre_cliente, "SIN CLIENTE");
    const servicio = displayText(row?.servicio, "SIN SERVICIO");
    const noOT = displayText(getNoOT(row), "SIN OT");
    const tipoMoneda = displayText(row?.tipo_moneda, "COP").toUpperCase();
    const otc = readMoney(row, ["otc", "OTC", "otr", "OTR"]);
    const mrc = readMoney(row, ["mrc", "MRC"]);

    const keyParts = config.dateType
      ? [fechaIso || fecha, nombreCliente, servicio, noOT, tipoMoneda]
      : [nombreCliente, servicio, noOT, tipoMoneda];

    const key = keyParts.map(normKeyForMatch).join("||");

    if (!map.has(key)) {
      map.set(key, {
        fecha,
        fechaIso,
        nombreCliente,
        servicio,
        noOT,
        tipoMoneda,
        otc: 0,
        mrc: 0,
        cantidad: 0,
      });
    }

    const item = map.get(key);
    item.otc += otc;
    item.mrc += mrc;
    item.cantidad += 1;
  });

  return Array.from(map.values()).sort((a, b) => {
    const fechaA = a.fechaIso || "9999-99-99";
    const fechaB = b.fechaIso || "9999-99-99";

    if (config.dateType && fechaA !== fechaB) return fechaA.localeCompare(fechaB);
    return a.nombreCliente.localeCompare(b.nombreCliente, "es", { sensitivity: "base" });
  });
}

export default function DetalleOTS({ onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    anios: [],
    meses: [],
    estadoOT: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    tipoMoneda: [],
    noOT: [],
    fechaActaCierreOT: [],
  });

  const [options, setOptions] = useState({
    anios: [],
    meses: [],
    estadoOT: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    fechaActaCierreOT: [],
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
    classNamePrefix: "rs",
  };

  const backendQuery = useMemo(() => buildBackendQuery(filters), [
    filters.estadoOT,
    filters.direccionComercial,
    filters.gerenciaComercial,
    filters.cliente,
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
          anios: (json.anios || []).map((year) => ({ value: String(year), label: String(year) })),
          meses: (json.meses || []).map((month) => ({
            value: String(month),
            label: MONTH_LABELS[Number(month)] || String(month),
          })),
          estadoOT: toOptions(removeNoAplicaValues(json.estado_ot || [])),
          direccionComercial: toOptions(json.direccion_comercial || []),
          gerenciaComercial: toOptions(json.gerencia_comercial || []),
          cliente: toOptions(json.nombre_cliente || []),
          fechaActaCierreOT: toDateOptions(json.fecha_acta_cierre_ot || []),
        });
      } catch (error) {
        console.error("Error cargando filtros de Detalle OTS:", error);
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

        if (!res.ok) throw new Error("No se pudo consultar oportunidades");

        const json = await res.json();

        if (!active) return;

        setRows(Array.isArray(json) ? json : []);
      } catch (error) {
        console.error("Error cargando Detalle OTS:", error);
        if (active) setRows([]);
        Swal.fire("Error", "No se pudo consultar el detalle de OTS", "error");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRows();

    return () => {
      active = false;
    };
  }, [backendQuery]);

  const dynamicOptions = useMemo(() => {
    const otRows = (rows || []).filter(isOTDetailRow);

    return {
      anios: yearOptionsFromRows(otRows),
      meses: monthOptionsFromRows(otRows),
      tipoMoneda: toOptions(otRows.map((row) => row?.tipo_moneda)),
      noOT: toOptions(
        otRows
          .map(getNoOT)
          .filter((value) => !isNoAplicaValue(value))
      ),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return (rows || []).filter((row) => {
      if (!isOTDetailRow(row)) return false;

      return (
        matchMulti(getYearFromRow(row), filters.anios) &&
        matchMonthMulti(getMonthFromRow(row), filters.meses) &&
        matchMulti(getEstadoOT(row), filters.estadoOT) &&
        matchMulti(row?.direccion_comercial, filters.direccionComercial) &&
        matchMulti(row?.gerencia_comercial, filters.gerenciaComercial) &&
        matchMulti(row?.nombre_cliente, filters.cliente) &&
        matchMulti(row?.tipo_moneda, filters.tipoMoneda) &&
        matchMulti(getNoOT(row), filters.noOT) &&
        matchDateMulti(row?.fecha_acta_cierre_ot, filters.fechaActaCierreOT)
      );
    });
  }, [rows, filters]);

  const buckets = useMemo(() => {
    const out = {
      cerradas: [],
      suspendidas: [],
      canceladas: [],
      tramite: [],
      proceso: [],
      otros: [],
    };

    filteredRows.forEach((row) => {
      const bucket = getOtBucket(row);
      out[bucket].push(row);
    });

    return out;
  }, [filteredRows]);

  const tablaCerradas = useMemo(
    () => buildDetalleRows(buckets.cerradas, { dateType: "cierre" }),
    [buckets.cerradas]
  );

  const tablaSuspendidas = useMemo(
    () => buildDetalleRows(buckets.suspendidas, { dateType: "suspendida" }),
    [buckets.suspendidas]
  );

  const tablaCanceladas = useMemo(
    () => buildDetalleRows(buckets.canceladas, { dateType: "cancelada" }),
    [buckets.canceladas]
  );

  const tablaTramite = useMemo(
    () => buildDetalleRows(buckets.tramite, { dateType: "tramite" }),
    [buckets.tramite]
  );

  const tablaProceso = useMemo(
    () => buildDetalleRows(buckets.proceso, { dateType: "compromiso" }),
    [buckets.proceso]
  );

  const kpis = useMemo(() => {
    return {
      total: filteredRows.length,
      cerradas: buckets.cerradas.length,
      suspendidas: buckets.suspendidas.length,
      canceladas: buckets.canceladas.length,
      tramite: buckets.tramite.length,
      proceso: buckets.proceso.length,
    };
  }, [filteredRows, buckets]);

  const clearFilters = () => {
    setFilters({
      anios: [],
      meses: [],
      estadoOT: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      tipoMoneda: [],
      noOT: [],
      fechaActaCierreOT: [],
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
    <div className="dots-wrapper">
      <div className="dots-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`dots-tab-btn ${tab.key === "detalle-ots" ? "is-active" : ""}`}
            onClick={() => onNavigate?.(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dots-layout">
        <main className="dots-main">
          {loading && <div className="dots-loading">Cargando detalle de OTS...</div>}

          <section className="dots-kpis">
            <div className="dots-kpi-card">
              <span>Total OTS</span>
              <strong>{kpis.total}</strong>
            </div>
            <div className="dots-kpi-card">
              <span>En proceso</span>
              <strong>{kpis.proceso}</strong>
            </div>
            <div className="dots-kpi-card">
              <span>En trámite</span>
              <strong>{kpis.tramite}</strong>
            </div>
            <div className="dots-kpi-card">
              <span>Suspendidas</span>
              <strong>{kpis.suspendidas}</strong>
            </div>
            <div className="dots-kpi-card">
              <span>Canceladas</span>
              <strong>{kpis.canceladas}</strong>
            </div>
            <div className="dots-kpi-card">
              <span>Cerradas</span>
              <strong>{kpis.cerradas}</strong>
            </div>
          </section>

          <DetalleTable
            title="En proceso"
            rows={tablaProceso}
            firstColumn="FECHA DE COMPROMISO"
            showDate
          />

          <DetalleTable
            title="En trámite"
            rows={tablaTramite}
            firstColumn="FECHA DE COMPROMISO"
            showDate
          />

          <DetalleTable
            title="Suspendida"
            rows={tablaSuspendidas}
            firstColumn="FECHA"
            showDate
          />

          <DetalleTable
            title="Canceladas"
            rows={tablaCanceladas}
            firstColumn="FECHA"
            showDate
          />

          <DetalleTable
            title="Cerradas"
            rows={tablaCerradas}
            firstColumn="FECHA DE CIERRE"
            showDate
          />
        </main>

        <aside className="dots-sidebar">
          <div className="dots-filter-item">
            <label>Año, Mes</label>
            <div className="dots-filter-double">
              <Select
                {...selectCommon}
                placeholder="Año"
                options={dynamicOptions.anios.length ? dynamicOptions.anios : options.anios}
                value={filters.anios}
                onChange={(value) => setFilters((prev) => ({ ...prev, anios: value || [] }))}
              />

              <Select
                {...selectCommon}
                placeholder="Mes"
                options={dynamicOptions.meses.length ? dynamicOptions.meses : options.meses}
                value={filters.meses}
                onChange={(value) => setFilters((prev) => ({ ...prev, meses: value || [] }))}
              />
            </div>
          </div>

          <div className="dots-filter-item">
            <label>ESTADO OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.estadoOT}
              value={filters.estadoOT}
              onChange={(value) => setFilters((prev) => ({ ...prev, estadoOT: value || [] }))}
            />
          </div>

          <div className="dots-filter-item">
            <label>No OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={dynamicOptions.noOT}
              value={filters.noOT}
              onChange={(value) => setFilters((prev) => ({ ...prev, noOT: value || [] }))}
            />
          </div>

          <div className="dots-filter-item">
            <label>Tipo de moneda</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={dynamicOptions.tipoMoneda}
              value={filters.tipoMoneda}
              onChange={(value) => setFilters((prev) => ({ ...prev, tipoMoneda: value || [] }))}
            />
          </div>

          <div className="dots-filter-item">
            <label>Nombre Cliente</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={options.cliente}
              value={filters.cliente}
              onChange={(value) => setFilters((prev) => ({ ...prev, cliente: value || [] }))}
            />
          </div>

          <div className="dots-filter-item">
            <label>Dirección Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.direccionComercial}
              value={filters.direccionComercial}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, direccionComercial: value || [] }))
              }
            />
          </div>

          <div className="dots-filter-item">
            <label>Gerencia Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.gerenciaComercial}
              value={filters.gerenciaComercial}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, gerenciaComercial: value || [] }))
              }
            />
          </div>

          <div className="dots-filter-item">
            <label>Fecha Acta de Cierre y/o OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.fechaActaCierreOT}
              value={filters.fechaActaCierreOT}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, fechaActaCierreOT: value || [] }))
              }
            />
          </div>

          <button type="button" className="dots-clear-btn" onClick={clearFilters}>
            Borrar todas las segmentaciones
          </button>
        </aside>
      </div>
    </div>
  );
}

function DetalleTable({ title, rows, firstColumn, showDate }) {
  return (
    <section className="dots-table-section">
      <h3>{title}</h3>

      <div className="dots-table-scroll">
        <table className="dots-table">
          <thead>
            <tr>
              {showDate && <th>{firstColumn}</th>}
              <th>NOMBRE CLIENTE</th>
              <th>SERVICIO</th>
              <th>No OT</th>
              <th>TIPO DE MONEDA</th>
              <th>Suma de OTC</th>
              <th>Suma de MRC</th>
              <th>CANTIDAD</th>
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {showDate && <td title={row.fecha}>{row.fecha}</td>}
                  <td title={row.nombreCliente}>{row.nombreCliente}</td>
                  <td title={row.servicio}>{row.servicio}</td>
                  <td title={row.noOT}>{row.noOT}</td>
                  <td title={row.tipoMoneda}>{row.tipoMoneda}</td>
                  <td title={fmtMoney(row.otc)}>{fmtMoney(row.otc)}</td>
                  <td title={fmtMoney(row.mrc)}>{fmtMoney(row.mrc)}</td>
                  <td title={String(row.cantidad)}>{row.cantidad}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showDate ? 8 : 7} className="dots-empty">
                  Sin registros para este estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

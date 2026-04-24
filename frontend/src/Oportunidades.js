import React, { useEffect, useMemo, useState, useCallback } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import "./Oportunidades.css";
import { jfetch } from "./lib/api";
import { exportOportunidadesExcel } from "./lib/exportExcelOportunidades";
import ModalCategoriaPerdida from "./ModalCategoriaPerdida";

const NUMERIC_COLS = new Set(["otc", "mrc", "mrc_normalizado", "valor_oferta_claro"]);

const DATE_COLS = new Set([
  "fecha_creacion",
  "fecha_cierre_sm",
  "fecha_entrega_oferta_final",
  "fecha_cierre_oportunidad",
  "fecha_firma_aos",
  "fecha_compromiso",
  "fecha_cierre",
  "proyeccion_ingreso",
]);

const REMOVE_COLS = new Set([
  "semestre",
  "vigencia_propuesta",
  "fecha_aceptacion_oferta",
  "fecha_acta_cierre_ot",
  "tipo_servicio",
  "semestre_ejecucion",
  "publicacion_sharepoint",
]);

const TIPO_CLIENTE_OPTS = ["CORPORATIVO", "INTERCOMPANY"];
const TIPO_SOLICITUD_OPTS = ["INVITACION DIRECTA", "RFI", "RFP"];
const CALIFICACION_OPTS = ["BAJO", "MEDIO", "ALTO"];
const ORIGEN_OPTS = ["AMERICA MOVIL", "CLARO - COLOMBIA", "GLOBAL HITSS", "CLARO PERÚ"];

const ESTADO_OT_OPTS = [
  "CANCELADO",
  "CERRADO",
  "CERRADO SIN PAGO",
  "EN PROCESO",
  "EN TRAMITE",
  "SUSPENDIDO",
  "NO APLICA",
];

const ESTADO_PROYECTO_OPTS = [
  "NO APLICA",
  "NO INICIADO",
  "EN EJECUCION",
  "FINALIZADO",
  "CERRADO SIN PAGO",
  "OT",
  "SUSPENDIDO",
  "CANCELADO",
];

const ESTADO_RESULTADO_BASE = {
  REGISTRO: ["OPORTUNIDAD EN PROCESO"],
  PROSPECCION: ["OPORTUNIDAD EN PROCESO"],
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACIÓN": ["OPORTUNIDAD EN PROCESO"],
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION": ["OPORTUNIDAD EN PROCESO"],
  "PENDIENTE APROBACION SAP": ["PENDIENTE APROBACION SAP"],
  "EN ELABORACION": ["OPORTUNIDAD EN PROCESO"],
  "EN ESPERA DEL RFI / RFP": ["EN ESPERA DEL CLIENTE"],
  "RFI PRESENTADO": ["EN ESPERA DEL CLIENTE"],
  "ENTREGA COMERCIAL": ["OPORTUNIDAD EN PROCESO"],
  GANADA: [
    "BOLSA DE HORAS / CONTINUIDAD DE LA OPERACIÓN",
    "EVOLUTIVO",
    "PROYECTO",
    "VAR",
    "VALORES AGREGADOS",
    "LICENCIAMIENTO",
  ],
  PERDIDA: ["OPORTUNIDAD PERDIDA"],
  "PERDIDA - SIN FEEDBACK": ["OPORTUNIDAD CERRADA"],
  DECLINADA: ["OPORTUNIDAD CERRADA"],
  SUSPENDIDA: ["EN ESPERA DEL CLIENTE"],
  OT: ["OT"],
  "N/A": ["N/A"],
};

const CATEGORIA_SUBCATEGORIA = {
  CLIENTE: ["PRESUPUESTO NO ASIGNADO", "SUSPENDE POR DIRECTRIZ INTERNA"],
  COMPETENCIA: ["MEJOR POSICIONAMIENTO", "CONDICIONES CONTRACTUALES", "PRESENCIA LOCAL"],
  PRECIO: ["TARIFA NO COMPETITIVA", "NO CUMPLE PRESUPUESTO"],
  PRODUCTO: [
    "OTRO PORTAFOLIO DE SOLUCION",
    "PRODUCTO NO SATISFACE LAS NECESIDADES",
    "SOLUCION PROPUESTA NO CUMPLIO",
    "TARIFA NO COMPETITIVA",
  ],
  REASIGNADO: ["SERVICIO DE CLARO EXISTENTE", "REASIGNADO"],
  SEGUIMIENTO: ["COMERCIAL", "CLIENTE NO RESPONDE"],
};

const COLUMN_LABELS = {
  id: "ID OPORTUNIDAD",
  fecha_creacion: "FECHA ASIGNACIÓN",
  anio_creacion_ot: "AÑO CREACIÓN OT",
};

const CLIENTE_COL = "nombre_cliente";
const SERVICIO_COL = "servicio";
const PRC_START_COL = "codigo_prc";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const EMPTY_FILTER_VALUE = "__EMPTY__";

function isNumericCol(col) {
  return NUMERIC_COLS.has(col);
}

function isDateCol(col) {
  return DATE_COLS.has(col);
}

function isObservationsCol(col) {
  return col === "observaciones" || col === "seguimiento_ot";
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").trim();
}

function normalizeForCompare(value) {
  return normalizeText(value).toUpperCase();
}

function toIsoDate(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toExcelDateDDMMYYYY(v) {
  if (!v) return "";

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const yyyy = v.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const s = String(v).trim();

  // Si ya viene dd/mm/yyyy, lo deja igual
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return s;
  }

  // Si viene yyyy-mm-dd, lo convierte sin usar Date para evitar desfases por zona horaria
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}/${mm}/${yyyy}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function prepareRowsForExcel(rows) {
  return (rows || []).map((row) => {
    const out = { ...row };

    DATE_COLS.forEach((col) => {
      if (Object.prototype.hasOwnProperty.call(out, col)) {
        out[col] = out[col] ? toExcelDateDDMMYYYY(out[col]) : "";
      }
    });

    return out;
  });
}

function parseNumberSmart(input) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input === "number") return Number.isFinite(input) ? input : "";

  let s = String(input).trim();
  if (!s) return "";

  s = s.replace(/\s/g, "");
  s = s.replace(/[$€£]/g, "");
  s = s.replace(/%/g, "");
  s = s.replace(/\b(COP|USD)\b/gi, "");

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : "";
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
      const parts = s.split(".");
      const last = parts[parts.length - 1];
      const mid = parts.slice(1, -1);
      const midAll3 = mid.every((p) => p.length === 3);
      const firstOk = parts[0].replace(/^[+-]/, "").length <= 3;
      const looksLikeGrouped = midAll3 && firstOk;

      if (looksLikeGrouped && last.length !== 3) {
        const intPart = parts.slice(0, -1).join("");
        s = intPart + "." + last;
      } else {
        s = s.replace(/\./g, "");
      }
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");
  if (!s || s === "-" || s === "." || s === "-.") return "";

  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function computeMrcNormalizado(source) {
  const otcRaw = source?.otc ?? source?.otr ?? source?.OTR ?? "";
  const mrcRaw = source?.mrc ?? "";

  const otc = parseNumberSmart(otcRaw);
  const mrc = parseNumberSmart(mrcRaw);

  const hasOtc = otc !== "";
  const hasMrc = mrc !== "";

  if (!hasOtc && !hasMrc) return "";

  const otcMensualizado = hasOtc ? otc / 12 : 0;
  const mrcBase = hasMrc ? mrc : 0;

  const total = otcMensualizado + mrcBase;

  return Number(total.toFixed(2));
}

function formatCell(col, value) {
  if (isDateCol(col)) return value ? toIsoDate(value) : "-";
  if (!isNumericCol(col)) return value ?? "-";
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : parseNumberSmart(value);
  if (n === "") return value ?? "-";
  return nf.format(n);
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildEstadoResultadoMap(rows) {
  const map = {};

  Object.entries(ESTADO_RESULTADO_BASE).forEach(([estado, resultados]) => {
    map[estado] = [...new Set((resultados || []).map(normalizeText).filter(Boolean))];
  });

  const estadosForzados = new Set([
    "EN ESPERA DEL RFI / RFP",
    "RFI PRESENTADO",
    "SUSPENDIDA",
  ]);

  (rows || []).forEach((row) => {
    const estado = normalizeText(row?.estado_oferta);
    const resultado = normalizeText(row?.resultado_oferta);

    if (!estado) return;

    if (!map[estado]) map[estado] = [];

    if (estadosForzados.has(estado)) return;

    if (resultado && !map[estado].includes(resultado)) {
      map[estado].push(resultado);
    }
  });

  return Object.fromEntries(
    Object.entries(map).sort((a, b) =>
      a[0].localeCompare(b[0], "es", { sensitivity: "base" })
    )
  );
}

function buildSelectOptionsFromRows(rows, col) {
  const mappedValues = rows.map((r) =>
    isDateCol(col) ? toIsoDate(r?.[col]) : normalizeText(r?.[col])
  );

  const hasEmpty = mappedValues.some((v) => v === "");

  const uniqueNonEmpty = [...new Set(mappedValues.filter((v) => v !== ""))].sort((a, b) =>
    String(a).localeCompare(String(b), "es", { sensitivity: "base" })
  );

  const options = uniqueNonEmpty.map((v) => ({
    label: v,
    value: v,
  }));

  if (hasEmpty && col === "caso_sm") {
    options.unshift({
      label: "(Vacío)",
      value: EMPTY_FILTER_VALUE,
    });
  }

  return options;
}

function toFilterOption(value) {
  return {
    label: value === EMPTY_FILTER_VALUE ? "(Vacío)" : value,
    value,
  };
}

const DATE_AT_START = /^\s*(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]?\s*/;
const DATE_ANYWHERE = /(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]\s*/g;

function normalizeCommentText(v) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitDatedEntries(raw) {
  const text = normalizeCommentText(raw);
  if (!text) return [];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
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

    for (const p of parts) {
      const m = p.match(DATE_AT_START);
      if (m) {
        const date = m[1];
        const body = p.replace(DATE_AT_START, "").trim();
        out.push({ date, text: body || "-" });
      } else {
        out.push({ date: null, text: p });
      }
    }
  }

  return out;
}

function renderLongTextCell(value) {
  const items = splitDatedEntries(value);
  if (!items.length) return "-";

  return (
    <div className="obs-list">
      {items.map((it, idx) => (
        <div key={idx} className="obs-item">
          {it.date ? <span className="obs-date">{it.date}</span> : null}
          <span className="obs-text">{it.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function Oportunidades() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [uniqueValues, setUniqueValues] = useState({});
  const [filters, setFilters] = useState({});
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState({ rowId: null, col: null });
  const [editingContext, setEditingContext] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [estadoResultadoMap, setEstadoResultadoMap] = useState(ESTADO_RESULTADO_BASE);
  const [clientesCatalogo, setClientesCatalogo] = useState([]);
  const [openCategoriaModal, setOpenCategoriaModal] = useState(false);

  const baseColumnOrder = useMemo(
    () => [
      "nombre_cliente",
      "servicio",
      "fecha_creacion",
      "semestre",
      "tipo_cliente",
      "tipo_solicitud",
      "caso_sm",
      "fecha_cierre_sm",
      "salesforce",
      "ultimos_6_meses",
      "ultimo_mes",
      "retraso",
      "estado_oferta",
      "resultado_oferta",
      "calificacion_oportunidad",
      "origen_oportunidad",
      "direccion_comercial",
      "gerencia_comercial",
      "comercial_asignado",
      "consultor_comercial",
      "comercial_asignado_hitss",
      "observaciones",
      "categoria_perdida",
      "subcategoria_perdida",
      "fecha_entrega_oferta_final",
      "vigencia_propuesta",
      "fecha_aceptacion_oferta",
      "tipo_moneda",
      "otc",
      "mrc",
      "mrc_normalizado",
      "valor_oferta_claro",
      "duracion",
      "pais",
      "fecha_cierre_oportunidad",
      "codigo_prc",
      "fecha_firma_aos",
      "pm_asignado_claro",
      "pm_asignado_hitss",
      "descripcion_ot",
      "num_enlace",
      "num_incidente",
      "num_ot",
      "estado_ot",
      "proyeccion_ingreso",
      "fecha_compromiso",
      "fecha_cierre",
      "estado_proyecto",
      "anio_creacion_ot",
      "fecha_acta_cierre_ot",
      "seguimiento_ot",
      "tipo_servicio",
      "semestre_ejecucion",
      "publicacion_sharepoint",
    ],
    []
  );

  const fetchClientesCatalogo = async () => {
    try {
      const res = await jfetch("/clientes");
      const json = await res.json().catch(() => []);

      if (!res.ok || !Array.isArray(json)) {
        setClientesCatalogo([]);
        return;
      }

      setClientesCatalogo(
        json
          .map((c) => normalizeText(c?.nombre_cliente))
          .filter(Boolean)
      );
    } catch {
      setClientesCatalogo([]);
    }
  };

  const columnOrder = useMemo(
    () => baseColumnOrder.filter((c) => !REMOVE_COLS.has(c)),
    [baseColumnOrder]
  );

  const displayColumnOrder = useMemo(() => {
    const reordered = columnOrder.filter(
      (c) => !["num_ot", "num_incidente", "num_enlace"].includes(c)
    );

    const descripcionIndex = reordered.indexOf("descripcion_ot");

    if (descripcionIndex !== -1) {
      reordered.splice(
        descripcionIndex + 1,
        0,
        "num_ot",
        "num_incidente",
        "num_enlace"
      );
    }

    return reordered;
  }, [columnOrder]);

  const tableColumnOrder = useMemo(
    () => ["id", ...displayColumnOrder],
    [displayColumnOrder]
  );

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const clienteSuggestions = useMemo(() => {
    return [...new Set((clientesCatalogo || []).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [clientesCatalogo]);

  const prcStartIndex = useMemo(
    () => tableColumnOrder.indexOf(PRC_START_COL),
    [tableColumnOrder]
  );

  const getColumnClassNames = useCallback(
    (col) => {
      const classes = [];

      if (col === "id") classes.push("sticky-col", "sticky-col-1", "id-col");
      if (col === CLIENTE_COL) classes.push("sticky-col", "sticky-col-2", "cliente-col");
      if (col === SERVICIO_COL) classes.push("sticky-col", "sticky-col-3", "servicio-col", "servicio-wrap-cell");

      if (col === "descripcion_ot") {
        classes.push("descripcion-ot-col", "descripcion-ot-wrap-cell");
      }

      const idx = tableColumnOrder.indexOf(col);
      if (prcStartIndex !== -1 && idx >= prcStartIndex) {
        classes.push("post-prc-col");
      }

      return classes.join(" ");
    },
    [prcStartIndex, tableColumnOrder]
  );

  const handleExportAll = () => {
    if (!data?.length) {
      return Swal.fire("Info", "No hay datos para exportar.", "info");
    }

    exportOportunidadesExcel(
      prepareRowsForExcel(data),
      columnOrder,
      `oportunidades_completo_${todayStamp()}.xlsx`,
      {
        Fuente: "Gestión de Oportunidades",
        Nota: "Exportado desde pantalla",
      }
    );
  };

  const handleExportFiltered = () => {
    if (!filteredData?.length) {
      return Swal.fire("Info", "No hay datos filtrados para exportar.", "info");
    }

    exportOportunidadesExcel(
      prepareRowsForExcel(filteredData),
      columnOrder,
      `oportunidades_filtrado_${todayStamp()}.xlsx`,
      {
        Filtros: JSON.stringify(
          Object.fromEntries(
            Object.entries(filters).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.join(", ") : v,
            ])
          )
        ),
      }
    );
  };

  function normalizeRowFromApi(r) {
    const obj = r || {};
    const otcValue = obj.otc ?? obj.otr ?? obj.OTR ?? "";
    const { otr, OTR, ...rest } = obj;

    return {
      ...rest,
      otc: otcValue,
      mrc_normalizado: computeMrcNormalizado({
        otc: otcValue,
        mrc: rest.mrc,
      }),
      nombre_cliente: normalizeText(rest.nombre_cliente),
      servicio: normalizeText(rest.servicio),
      estado_oferta: normalizeText(rest.estado_oferta),
      resultado_oferta: normalizeText(rest.resultado_oferta),
      categoria_perdida: normalizeText(rest.categoria_perdida),
      subcategoria_perdida: normalizeText(rest.subcategoria_perdida),
    };
  }

  const applyFilters = useCallback((rows, currentFilters) => {
    let result = [...rows];

    Object.entries(currentFilters).forEach(([col, selectedValues]) => {
      if (Array.isArray(selectedValues) && selectedValues.length > 0) {
        result = result.filter((r) => {
          const cell = isDateCol(col) ? toIsoDate(r?.[col]) : normalizeText(r?.[col]);
          const isEmptyCell = cell === "";

          return selectedValues.some((val) => {
            if (val === EMPTY_FILTER_VALUE) {
              return isEmptyCell;
            }
            return normalizeForCompare(val) === normalizeForCompare(cell);
          });
        });
      }
    });

    return result;
  }, []);

  const computeUniqueValues = useCallback(
    (rows, currentFilters = {}) => {
      const uniq = {};

      columnOrder.forEach((col) => {
        const otherFilters = Object.fromEntries(
          Object.entries(currentFilters).filter(([key]) => key !== col)
        );

        const rowsForThisColumn = applyFilters(rows, otherFilters);
        const dynamicOptions = buildSelectOptionsFromRows(rowsForThisColumn, col);
        const selectedOptions = (currentFilters[col] || []).map(toFilterOption);

        const merged = [...dynamicOptions];

        selectedOptions.forEach((selected) => {
          const exists = merged.some(
            (opt) => normalizeForCompare(opt.value) === normalizeForCompare(selected.value)
          );

          if (!exists) {
            merged.unshift(selected);
          }
        });

        uniq[col] = merged;
      });

      return uniq;
    },
    [columnOrder, applyFilters]
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await jfetch("/oportunidades?q=");
      const json = await res.json();

      if (!Array.isArray(json)) {
        setData([]);
        setFilteredData([]);
        setUniqueValues({});
        setEstadoResultadoMap(ESTADO_RESULTADO_BASE);
        return;
      }

      const normalized = json.map(normalizeRowFromApi);
      setData(normalized);
    } catch {
      Swal.fire("Error", "No se pudo cargar la información", "error");
    } finally {
      setLoading(false);
    }
  };

  const toDbPayload = (row) => {
    const out = {};

    for (const col of columnOrder) {
      const v = row?.[col];

      if (isDateCol(col)) {
        out[col] = v ? toIsoDate(v) : null;
        continue;
      }

      if (isNumericCol(col)) {
        if (col === "mrc_normalizado") {
          const calculado = computeMrcNormalizado(row);
          out[col] = calculado === "" ? null : calculado;
        } else {
          const parsed = parseNumberSmart(v);
          out[col] = parsed === "" ? null : parsed;
        }
        continue;
      }

      out[col] = v === undefined || v === null ? null : v;
    }

    return out;
  };

  useEffect(() => {
    fetchData();
    fetchClientesCatalogo();
  }, []);

  useEffect(() => {
    const nextFiltered = applyFilters(data, filters);
    setFilteredData(nextFiltered);
    setUniqueValues(computeUniqueValues(data, filters));
  }, [data, filters, computeUniqueValues]);

  useEffect(() => {
    setEstadoResultadoMap(buildEstadoResultadoMap(data));
  }, [data]);

  const handleUpload = async () => {
    if (!file) return Swal.fire("Seleccione un archivo Excel");

    const form = new FormData();
    form.append("file", file);

    setLoading(true);

    try {
      const res = await jfetch("/oportunidades/import", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));

      Swal.fire({
        icon: res.ok ? "success" : "error",
        title: json.mensaje || "Resultado de carga",
      });

      await fetchData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (column, selectedOptions) => {
    const values = Array.isArray(selectedOptions)
      ? selectedOptions.map((opt) => opt.value)
      : [];

    setFilters((prev) => ({
      ...prev,
      [column]: values,
    }));
  };

  const handleClearFilters = () => {
    setFilters({});
    setEditing({ rowId: null, col: null });
    setEditingContext(null);
  };

  const closeEditing = () => {
    setEditing({ rowId: null, col: null });
    setEditingContext(null);
  };

  const sameId = (a, b) => String(a ?? "") === String(b ?? "");

  const findRowById = (rowId) => data.find((r) => sameId(r?.id, rowId));

  const highlightRow = (rowId) => {
    setTimeout(() => {
      const rows = Array.from(
        document.querySelectorAll(".tabla-oportunidades tbody tr[data-row-id]")
      );
      const rowEl = rows.find((tr) => tr.dataset.rowId === String(rowId ?? ""));

      rowEl?.classList.add("row-success");
      setTimeout(() => rowEl?.classList.remove("row-success"), 1600);
    }, 50);
  };

  const startEdit = (row, col) => {
    if (!row?.id) return;

    if (col === "mrc_normalizado") {
      Swal.fire("Info", "Este campo se calcula automáticamente (OTC/12 + MRC).", "info");
      return;
    }

    setEditing({ rowId: row.id, col });
    setEditingContext({
      id: row.id,
      cliente: row?.nombre_cliente ?? "-",
      servicio: row?.servicio ?? "-",
      col,
    });

    const v = row[col];
    if (isDateCol(col)) setEditValue(toIsoDate(v));
    else if (!isNumericCol(col)) setEditValue(v ?? "");
    else {
      const n = typeof v === "number" ? v : parseNumberSmart(v);
      setEditValue(n === "" ? (v ?? "") : String(n));
    }
  };

  const saveEditMulti = async (rowId, updates) => {
    const row = findRowById(rowId);

    if (!row?.id) {
      closeEditing();
      return;
    }

    try {
      const nextRow = { ...row, ...updates };
      const payload = toDbPayload(nextRow);

      const resp = await jfetch(`/oportunidades/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire("Error", j?.mensaje || j?.error || `HTTP ${resp.status}`, "error");
        closeEditing();
        return;
      }

      setData((prev) =>
        prev.map((r) =>
          sameId(r.id, row.id)
            ? normalizeRowFromApi({ ...r, ...payload })
            : r
        )
      );

      highlightRow(row.id);
      closeEditing();
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
      closeEditing();
    }
  };

  const saveEdit = async (rowId, col, newValue) => {
    const row = findRowById(rowId);

    if (!row?.id) {
      closeEditing();
      return;
    }

    const original = isDateCol(col) ? toIsoDate(row?.[col]) : row?.[col];
    const incoming = isDateCol(col) ? toIsoDate(newValue) : newValue;

    if (String(original ?? "") === String(incoming ?? "")) {
      closeEditing();
      return;
    }

    let coercedValue = incoming;
    if (isNumericCol(col)) coercedValue = parseNumberSmart(incoming);

    await saveEditMulti(row.id, { [col]: coercedValue });
  };

  const editLongText = async (rowId, col) => {
    const row = findRowById(rowId);
    if (!row?.id) return;

    const cliente = row?.nombre_cliente ?? "-";
    const servicio = row?.servicio ?? "-";
    const estadoOferta = row?.estado_oferta ?? "-";
    const current = row?.[col] ?? "";
    const stamp = todayStamp();

    const res = await Swal.fire({
      title: col === "observaciones" ? "Observaciones" : "Seguimiento OT",
      html: `
        <div style="text-align:left;font-size:13px;margin-bottom:8px;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(cliente)}<br/>
          <b>Servicio:</b> ${escapeHtml(servicio)}
          ${
            col === "observaciones"
              ? `<br/><b>Estado oferta:</b>
                <span style="
                  display:inline-block;
                  margin-top:4px;
                  padding:2px 8px;
                  border-radius:10px;
                  background:#eef2ff;
                  color:#3730a3;
                  font-weight:600;
                ">
                  ${escapeHtml(estadoOferta)}
                </span>`
              : ""
          }
        </div>
      `,
      input: "textarea",
      inputValue: current,
      inputAttributes: { style: "min-height:220px" },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      showDenyButton: true,
      denyButtonText: "Agregar entrada semanal",
      preConfirm: (val) => val,
    });

    if (res.isDismissed) return;

    if (res.isDenied) {
      const nextValue = `${current ? current + "\n" : ""}${stamp} - `;
      await saveEdit(row.id, col, nextValue);
      return;
    }

    if (res.isConfirmed) {
      await saveEdit(row.id, col, res.value ?? "");
    }
  };

  const addRow = () => {
    const empty = {};
    columnOrder.forEach((c) => (empty[c] = ""));
    empty.tipo_moneda = "COP";
    setNewRow(empty);
  };

  const saveNewRow = async () => {
    try {
      setLoading(true);
      const payload = toDbPayload(newRow);

      const res = await jfetch("/oportunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        Swal.fire("Error", json?.mensaje || `HTTP ${res.status}`, "error");
        return;
      }

      await fetchData();
      Swal.fire("Guardado", "Nueva fila creada", "success");
      setNewRow(null);
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const renderSelect = (row, col, options) => {
    return (
      <select
        className="cell-input"
        autoFocus
        value={editValue ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          setEditValue(next);
          saveEdit(row.id, col, next);
        }}
        onBlur={closeEditing}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeEditing();
          }
        }}
      >
        <option value="">-</option>
        {options.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
    );
  };

  const renderEditorCell = (row, col) => {
    if (!sameId(editing.rowId, row?.id) || editing.col !== col) return null;

    if (isDateCol(col)) {
      return (
        <input
          className="cell-input"
          type="date"
          autoFocus
          value={toIsoDate(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing({ rowId: null, col: null });
              setEditingContext(null);
            }
          }}
          onBlur={(e) => saveEdit(row.id, col, toIsoDate(e.currentTarget.value))}
        />
      );
    }

    if (col === CLIENTE_COL) {
      return (
        <input
          className="cell-input"
          list="clientes-oportunidades-list"
          autoFocus
          value={editValue ?? ""}
          placeholder="Selecciona o escribe cliente"
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing({ rowId: null, col: null });
              setEditingContext(null);
            }
          }}
          onBlur={(e) => saveEdit(row.id, col, e.currentTarget.value)}
        />
      );
    }

    if (col === "tipo_moneda") {
      return renderSelect(row, col, ["COP", "USD"]);
    }

    if (col === "tipo_cliente") {
      return renderSelect(row, col, TIPO_CLIENTE_OPTS);
    }

    if (col === "tipo_solicitud") {
      return renderSelect(row, col, TIPO_SOLICITUD_OPTS);
    }

    if (col === "calificacion_oportunidad") {
      return renderSelect(row, col, CALIFICACION_OPTS);
    }

    if (col === "origen_oportunidad") {
      return renderSelect(row, col, ORIGEN_OPTS);
    }

    if (col === "estado_ot") {
      return renderSelect(row, col, ESTADO_OT_OPTS);
    }

    if (col === "estado_proyecto") {
      return renderSelect(row, col, ESTADO_PROYECTO_OPTS);
    }

    if (col === "estado_oferta") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const estado = e.target.value;
            const allowed = estadoResultadoMap[estado] || [];
            const autoRes = allowed.length === 1 ? allowed[0] : "";
            const nextResultado = autoRes || row.resultado_oferta || "";

            setEditValue(estado);
            saveEditMulti(row.id, {
              estado_oferta: estado,
              resultado_oferta: nextResultado,
            });
          }}
          onBlur={closeEditing}
        >
          <option value="">-</option>
          {Object.keys(estadoResultadoMap).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "resultado_oferta") {
      const allowed = estadoResultadoMap[row.estado_oferta] || [];
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            setEditValue(next);
            saveEdit(row.id, col, next);
          }}
          onBlur={closeEditing}
        >
          <option value="">-</option>
          {allowed.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "categoria_perdida") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const cat = e.target.value;
            const allowed = CATEGORIA_SUBCATEGORIA[cat] || [];
            const autoSub = allowed.length === 1 ? allowed[0] : "";
            const nextSub = autoSub || row.subcategoria_perdida || "";

            setEditValue(cat);
            saveEditMulti(row.id, {
              categoria_perdida: cat,
              subcategoria_perdida: nextSub,
            });
          }}
          onBlur={closeEditing}
        >
          <option value="">-</option>
          {Object.keys(CATEGORIA_SUBCATEGORIA).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "subcategoria_perdida") {
      const allowed = CATEGORIA_SUBCATEGORIA[row.categoria_perdida] || [];
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            setEditValue(next);
            saveEdit(row.id, col, next);
          }}
          onBlur={closeEditing}
        >
          <option value="">-</option>
          {allowed.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className="cell-input"
        autoFocus
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        inputMode={isNumericCol(col) ? "decimal" : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing({ rowId: null, col: null });
            setEditingContext(null);
          }
        }}
        onBlur={(e) => saveEdit(row.id, col, e.currentTarget.value)}
      />
    );
  };

  const renderNewRowCell = (col) => {
    if (col === "mrc_normalizado") {
      return <span>{formatCell("mrc_normalizado", computeMrcNormalizado(newRow))}</span>;
    }

    if (col === CLIENTE_COL) {
      return (
        <input
          className="cell-input"
          list="clientes-oportunidades-list"
          value={newRow[col] ?? ""}
          placeholder="Selecciona o escribe cliente"
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        />
      );
    }

    if (isDateCol(col)) {
      return (
        <input
          className="cell-input"
          type="date"
          value={toIsoDate(newRow[col])}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        />
      );
    }

    if (col === "tipo_moneda") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
      );
    }

    if (col === "tipo_cliente") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {TIPO_CLIENTE_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "tipo_solicitud") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {TIPO_SOLICITUD_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "calificacion_oportunidad") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {CALIFICACION_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "origen_oportunidad") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {ORIGEN_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "estado_ot") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {ESTADO_OT_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "estado_proyecto") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {ESTADO_PROYECTO_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "estado_oferta") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => {
            const estado = e.target.value;
            const allowed = estadoResultadoMap[estado] || [];
            const auto = allowed.length === 1 ? allowed[0] : "";
            setNewRow((p) => ({
              ...p,
              estado_oferta: estado,
              resultado_oferta: auto || p.resultado_oferta,
            }));
          }}
        >
          <option value="">-</option>
          {Object.keys(estadoResultadoMap).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "resultado_oferta") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {(estadoResultadoMap[newRow.estado_oferta] || []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "categoria_perdida") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => {
            const cat = e.target.value;
            const allowed = CATEGORIA_SUBCATEGORIA[cat] || [];
            const auto = allowed.length === 1 ? allowed[0] : "";
            setNewRow((p) => ({
              ...p,
              categoria_perdida: cat,
              subcategoria_perdida: auto || p.subcategoria_perdida,
            }));
          }}
        >
          <option value="">-</option>
          {Object.keys(CATEGORIA_SUBCATEGORIA).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "subcategoria_perdida") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {(CATEGORIA_SUBCATEGORIA[newRow.categoria_perdida] || []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className="cell-input"
        value={newRow[col] ?? ""}
        inputMode={isNumericCol(col) ? "decimal" : undefined}
        onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        onBlur={(e) => {
          if (!isNumericCol(col)) return;
          const parsed = parseNumberSmart(e.target.value);
          setNewRow((p) => ({ ...p, [col]: parsed === "" ? "" : parsed }));
        }}
      />
    );
  };

  return (
    <div className="oportunidades-wrapper">
      <h2>Gestión de Oportunidades</h2>

      <datalist id="clientes-oportunidades-list">
        {clienteSuggestions.map((cliente) => (
          <option key={cliente} value={cliente} />
        ))}
      </datalist>

      <div className="upload-section">
        <label className="custom-file-upload">
          <i className="fa fa-file-excel"></i> Seleccionar Archivo
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        </label>

        <span className="file-name">{file?.name || "Ningún archivo seleccionado"}</span>

        <button className="upload-btn" onClick={handleUpload} disabled={loading}>
          {loading ? "Cargando..." : "Subir Excel"}
        </button>

        <div className="acciones-exportacion">
          <button
            className="upload-btn"
            onClick={handleExportAll}
            disabled={loading || !data.length}
          >
            Descargar Excel (Completo)
          </button>

          <button
            className="upload-btn"
            onClick={handleExportFiltered}
            disabled={loading || !filteredData.length}
          >
            Descargar Excel (Filtrado)
          </button>

          <button
            className="upload-btn"
            type="button"
            onClick={() => setOpenCategoriaModal(true)}
            disabled={loading}
          >
            Ver Categoría Perdida
          </button>

          <button
            className="clear-filters-btn"
            onClick={handleClearFilters}
            disabled={
              loading ||
              !Object.values(filters).some((vals) => Array.isArray(vals) && vals.length > 0)
            }
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {editingContext && (
        <div className="edit-context-bar">
          <strong>Editando:</strong> {editingContext.cliente} | {editingContext.servicio}
          <span style={{ marginLeft: 10 }}>
            <strong>Campo:</strong> {editingContext.col}
          </span>
        </div>
      )}

      <div className="tabla-scroll">
        <table className="tabla-oportunidades">
          <thead>
            <tr>
              {tableColumnOrder.map((col) => (
                <th key={col} className={getColumnClassNames(col)}>
                  {COLUMN_LABELS[col] || col.replace(/_/g, " ").toUpperCase()}
                </th>
              ))}
              <th>ACCIONES</th>
            </tr>

            <tr className="filtros-columnas">
              {tableColumnOrder.map((col) => (
                <th key={col} className={getColumnClassNames(col)}>
                  {col === "id" ? null : (
                    <Select
                      options={uniqueValues[col] || []}
                      value={(filters[col] || []).map(toFilterOption)}
                      onChange={(opts) => handleFilterChange(col, opts)}
                      placeholder="Filtrar..."
                      className="select-filter"
                      classNamePrefix="react-select"
                      isMulti
                      isClearable
                      closeMenuOnSelect={false}
                      hideSelectedOptions={false}
                      noOptionsMessage={() => "Sin opciones"}
                      menuPortalTarget={portalTarget}
                      styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 99999 }),
                      }}
                    />
                  )}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>

          <tbody>
            {newRow && (
              <tr className="new-row">
                <td className={getColumnClassNames("id")}>-</td>

                {displayColumnOrder.map((col) => (
                  <td
                    key={col}
                    className={[
                      getColumnClassNames(col),
                      col === SERVICIO_COL ? "servicio-wrap-cell" : "",
                    ].join(" ").trim()}
                  >
                    {renderNewRowCell(col)}
                  </td>
                ))}

                <td className="acciones">
                  <button className="btn-save" onClick={saveNewRow} disabled={loading}>
                    Guardar
                  </button>
                  <button className="btn-cancel" onClick={() => setNewRow(null)} disabled={loading}>
                    Cancelar
                  </button>
                </td>
              </tr>
            )}

            {filteredData.map((row, i) => (
              <tr key={row.id ?? i} data-row-id={row.id ?? ""}>
                {tableColumnOrder.map((col) => {
                  const isLong = isObservationsCol(col);

                  return (
                    <td
                      key={col}
                      onDoubleClick={() => {
                        if (col === "id") return;
                        if (isLong) return editLongText(row.id, col);
                        startEdit(row, col);
                      }}
                      className={[
                        getColumnClassNames(col),
                        sameId(editing.rowId, row?.id) && editing.col === col ? "editing" : "",
                        isLong ? "obs-col" : "",
                        col === SERVICIO_COL ? "servicio-wrap-cell" : "",
                      ].join(" ").trim()}
                      title={isLong ? undefined : String(row?.[col] ?? "")}
                    >
                      {col === "id"
                        ? row?.id ?? "-"
                        : sameId(editing.rowId, row?.id) && editing.col === col
                        ? renderEditorCell(row, col)
                        : isLong
                        ? renderLongTextCell(row?.[col])
                        : formatCell(col, row[col])}
                    </td>
                  );
                })}
                <td className="acciones"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="floating-add-btn" onClick={addRow} disabled={loading}>
        +
      </button>

      <ModalCategoriaPerdida
        isOpen={openCategoriaModal}
        onClose={() => setOpenCategoriaModal(false)}
        categoriesMap={CATEGORIA_SUBCATEGORIA}
      />
    </div>
  );
}
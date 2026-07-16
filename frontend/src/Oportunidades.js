import React, { useEffect, useMemo, useState, useCallback } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import "./Oportunidades.css";
import { jfetch } from "./lib/api";
import { exportOportunidadesExcel } from "./lib/exportExcelOportunidades";
import ModalCategoriaPerdida from "./ModalCategoriaPerdida";
import ModalResumenCerradas from "./ModalResumenCerradas";

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
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION": ["OPORTUNIDAD EN PROCESO"],
  "PENDIENTE APROBACION SAP": ["PENDIENTE APROBACION SAP"],
  "EN ELABORACION": ["OPORTUNIDAD EN PROCESO"],
  "EN ESPERA DEL RFI / RFP": ["EN ESPERA DEL CLIENTE"],
  "RFI PRESENTADO": ["EN ESPERA DEL CLIENTE"],
  "ENTREGA COMERCIAL": ["OPORTUNIDAD EN PROCESO"],
  "EJECUCION OPERACION": ["CONSUMO DE BOLSA DE HORAS"],

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
  id: "COD. CONTROL",
  fecha_creacion: "FECHA ASIGNACIÓN",
  anio_creacion_ot: "AÑO CREACIÓN OT",
  mostrar_dashboard: "MOSTRAR EN DASHBOARD",
  num_enlace: "ID ENLACE",
};

const CLIENTE_COL = "nombre_cliente";
const SERVICIO_COL = "servicio";
const PRC_START_COL = "codigo_prc";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const EMPTY_FILTER_VALUE = "__EMPTY__";
const EMPTY_FILTER_LABEL = "(Blanco)";

const MOSTRAR_DASHBOARD_OPTS = ["SI", "NO"];

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

const CATEGORIA_PERDIDA_OPTS = Object.keys(CATEGORIA_SUBCATEGORIA);

const SUBCATEGORIA_PERDIDA_OPTS = [
  ...new Set(Object.values(CATEGORIA_SUBCATEGORIA).flat()),
].sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));

function getCategoriaPerdidaKey(value) {
  const normalized = normalizeForCompare(value);

  return (
    CATEGORIA_PERDIDA_OPTS.find(
      (op) => normalizeForCompare(op) === normalized
    ) || ""
  );
}

function getSubcategoriaPerdidaOptions(categoria) {
  const key = getCategoriaPerdidaKey(categoria);
  const options = key ? CATEGORIA_SUBCATEGORIA[key] : SUBCATEGORIA_PERDIDA_OPTS;

  return [...new Set(options)].sort((a, b) =>
    String(a).localeCompare(String(b), "es", { sensitivity: "base" })
  );
}

function valueInOptions(value, options = []) {
  const normalized = normalizeForCompare(value);
  if (!normalized) return false;

  return options.some((op) => normalizeForCompare(op) === normalized);
}

function isOportunidadPerdida(row) {
  const estado = normalizeForCompare(row?.estado_oferta);
  const resultado = normalizeForCompare(row?.resultado_oferta);

  return (
    estado === "PERDIDA" ||
    estado === "PERDIDA - SIN FEEDBACK" ||
    estado === "DECLINADA" ||
    resultado === "OPORTUNIDAD PERDIDA"
  );
}

function limpiarPerdidaSiNoAplica(row) {
  if (!row) return row;

  if (isOportunidadPerdida(row)) {
    return row;
  }

  return {
    ...row,
    categoria_perdida: "",
    subcategoria_perdida: "",
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  return d <= new Date(y, m, 0).getDate();
}

function parseDatePartsStrict(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return isValidDateParts(y, m, d) ? { y, m, d } : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const base = Date.UTC(1899, 11, 30);
    const millis = base + Math.trunc(value) * 86400000;
    const dte = new Date(millis);
    const y = dte.getUTCFullYear();
    const m = dte.getUTCMonth() + 1;
    const d = dte.getUTCDate();
    return isValidDateParts(y, m, d) ? { y, m, d } : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return isValidDateParts(y, m, d) ? { y, m, d } : null;
  }

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy.map(Number);
    return isValidDateParts(y, m, d) ? { y, m, d } : null;
  }

  return null;
}

function toIsoDate(v) {
  const parts = parseDatePartsStrict(v);
  if (!parts) return "";
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
}

function normalizeDateForPayload(value, col = "fecha") {
  const raw = normalizeText(value);

  if (!raw) return null;

  const iso = toIsoDate(raw);

  if (!iso) {
    throw new Error(`Fecha inválida en ${col}: ${raw}. Usa formato DD/MM/YYYY o YYYY-MM-DD.`);
  }

  return iso;
}

function toDisplayDateDDMMYYYY(v) {
  const parts = parseDatePartsStrict(v);
  if (!parts) return v ? String(v).trim() : "";
  return `${pad2(parts.d)}/${pad2(parts.m)}/${parts.y}`;
}

function toExcelDateDDMMYYYY(v) {
  return toDisplayDateDDMMYYYY(v);
}

function dateIsoToTimestamp(iso) {
  const parts = parseDatePartsStrict(iso);
  if (!parts) return 0;
  return Date.UTC(parts.y, parts.m - 1, parts.d);
}

function prepareRowsForExcel(rows, columns = []) {
  return (rows || []).map((row) => {
    const out = {};

    columns.forEach((col) => {
      let value = row?.[col];

      // ✅ Refuerzo para evitar que FECHA COMPROMISO salga vacía
      if (col === "fecha_compromiso") {
        value =
          row?.fecha_compromiso ??
          row?.fechaCompromiso ??
          row?.["FECHA COMPROMISO"] ??
          "";
      }

      if (col === "proyeccion_ingreso") {
        value =
          row?.proyeccion_ingreso ??
          row?.proyeccionIngreso ??
          row?.["PROYECCION INGRESO"] ??
          "";
      }

      if (col === "fecha_cierre") {
        value =
          row?.fecha_cierre ??
          row?.fechaCierre ??
          row?.["FECHA CIERRE"] ??
          "";
      }

      if (DATE_COLS.has(col)) {
        out[col] = value ? toExcelDateDDMMYYYY(value) : "";
      } else {
        out[col] = value ?? "";
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
  if (isDateCol(col)) {
    return value ? toDisplayDateDDMMYYYY(value) : "-";
  }

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

function getFilterCellValue(row, col) {
  const value = row?.[col];

  if (isDateCol(col)) {
    return toDisplayDateDDMMYYYY(value);
  }

  return normalizeText(value);
}

function buildSelectOptionsFromRows(rows, col) {
  const mappedValues = (rows || []).map((row) => getFilterCellValue(row, col));

  const hasBlank = mappedValues.some((value) => value === "");

  const uniqueNonBlank = [...new Set(mappedValues.filter((value) => value !== ""))].sort(
    (a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" })
  );

  const options = uniqueNonBlank.map((value) => ({
    label: value,
    value,
  }));

  if (hasBlank) {
    options.unshift({
      label: EMPTY_FILTER_LABEL,
      value: EMPTY_FILTER_VALUE,
    });
  }

  return options;
}

function toFilterOption(value) {
  return {
    label: value === EMPTY_FILTER_VALUE ? EMPTY_FILTER_LABEL : value,
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
        const date = toDisplayDateDDMMYYYY(m[1]);
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

function renderMultilineTextCell(value) {
  const text = String(value ?? "");
  if (!normalizeText(text)) return "-";

  return <span className="cell-multiline-text">{text}</span>;
}

function normalizeMostrarDashboard(value) {
  const normalized = normalizeForCompare(value);

  if (!normalized) return "";

  if (["NO", "N", "FALSE", "0"].includes(normalized)) {
    return "NO";
  }

  return "SI";
}

const CLIENT_WITHOUT_NAME = "SIN CLIENTE";
const TIPO_PRINCIPAL = "PRINCIPAL";
const TIPO_SUBOPORTUNIDAD = "SUBOPORTUNIDAD";
const ESTADOS_SUMAN_PRINCIPAL = new Set(["OT", "GANADA"]);
const PRINCIPAL_EDITABLE_COLS = new Set([
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
  "seguimiento_ot",
  "mostrar_dashboard",
]);

const PRINCIPAL_ESTADO_FROM_FIRST_OT_COLS = new Set([
  "estado_oferta",
  "resultado_oferta",
  "estado_ot",
  "estado_proyecto",
]);

const FIRST_OT_TO_PRINCIPAL_SYNC_FIELDS = new Set([
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
  "tipo_moneda",
  "duracion",
  "pais",
  "fecha_cierre_oportunidad",
  "fecha_firma_aos",
  "pm_asignado_claro",
  "pm_asignado_hitss",
  "estado_ot",
  "proyeccion_ingreso",
  "fecha_compromiso",
  "fecha_cierre",
  "estado_proyecto",
  "anio_creacion_ot",
  "seguimiento_ot",
  "mostrar_dashboard",
]);

const ESTADOS_CERRADOS_RESUMEN = new Set([
  "GANADA",
  "OT",
  "PERDIDA",
  "PERDIDA - SIN FEEDBACK",
  "DECLINADA",
  "CERRADA",
  "OPORTUNIDAD CERRADA",
  "OPORTUNIDAD PERDIDA",
]);

function stripAccents(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeClientGroupKey(value) {
  return stripAccents(normalizeText(value || CLIENT_WITHOUT_NAME))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOpportunityServiceKey(value) {
  return stripAccents(normalizeText(value))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTipoOportunidad(value) {
  const normalized = normalizeForCompare(value);

  if (["PRINCIPAL", "PADRE", "MASTER"].includes(normalized)) {
    return TIPO_PRINCIPAL;
  }

  return TIPO_SUBOPORTUNIDAD;
}

function estadoSumaEnPrincipal(row) {
  const estadoOferta = normalizeForCompare(row?.estado_oferta);
  const resultadoOferta = normalizeForCompare(row?.resultado_oferta);

  return (
    ESTADOS_SUMAN_PRINCIPAL.has(estadoOferta) ||
    ESTADOS_SUMAN_PRINCIPAL.has(resultadoOferta)
  );
}

function sumRowsByColumn(rows, col) {
  let hasValue = false;

  const total = (rows || []).reduce((acc, row) => {
    const n = parseNumberSmart(row?.[col]);

    if (n === "") return acc;

    hasValue = true;
    return acc + Number(n);
  }, 0);

  return hasValue ? Number(total.toFixed(2)) : "";
}

function rowHasMoneyValue(row) {
  return (
    parseNumberSmart(row?.otc) !== "" ||
    parseNumberSmart(row?.mrc) !== "" ||
    parseNumberSmart(row?.mrc_normalizado) !== "" ||
    parseNumberSmart(row?.valor_oferta_claro) !== ""
  );
}

function getPrincipalRowsForTotals(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const validRows = safeRows.filter(estadoSumaEnPrincipal);

  if (validRows.length > 0) {
    return {
      rows: validRows,
      modo: "ESTADO_OT_GANADA",
      cantidadValidas: validRows.length,
    };
  }

  const rowsConValores = safeRows.filter(rowHasMoneyValue);

  return {
    rows: rowsConValores,
    modo: rowsConValores.length > 0 ? "VALORES_ASOCIADOS" : "SIN_VALORES",
    cantidadValidas: rowsConValores.length,
  };
}

function getPrincipalTotals(rows) {
  const seleccion = getPrincipalRowsForTotals(rows);
  const rowsParaSumar = seleccion.rows;

  const totalOtc = sumRowsByColumn(rowsParaSumar, "otc");
  const totalMrc = sumRowsByColumn(rowsParaSumar, "mrc");

  const otcNumber = totalOtc === "" ? 0 : Number(totalOtc);
  const mrcNumber = totalMrc === "" ? 0 : Number(totalMrc);

  const mrcNormalizado =
    rowsParaSumar.length > 0 ? Number((mrcNumber + otcNumber / 12).toFixed(2)) : "";

  const valorComercial = sumRowsByColumn(rowsParaSumar, "valor_oferta_claro");

  return {
    totalOtc,
    totalMrc,
    mrcNormalizado,
    valorComercial,
    cantidadValidas: seleccion.cantidadValidas,
    modoSuma: seleccion.modo,
  };
}

function getPrincipalOwnTotals(principalRow) {
  if (!principalRow) {
    return {
      totalOtc: "",
      totalMrc: "",
      mrcNormalizado: "",
      valorComercial: "",
      cantidadValidas: 0,
    };
  }

  const totalOtc = parseNumberSmart(principalRow?.otc);
  const totalMrc = parseNumberSmart(principalRow?.mrc);
  const mrcNormalizadoDirecto = parseNumberSmart(principalRow?.mrc_normalizado);
  const valorComercialDirecto = parseNumberSmart(principalRow?.valor_oferta_claro);

  const otcNumber = totalOtc === "" ? 0 : Number(totalOtc);
  const mrcNumber = totalMrc === "" ? 0 : Number(totalMrc);

  const mrcNormalizado =
    mrcNormalizadoDirecto !== ""
      ? mrcNormalizadoDirecto
      : totalOtc !== "" || totalMrc !== ""
      ? Number((mrcNumber + otcNumber / 12).toFixed(2))
      : "";

  const valorComercial =
    valorComercialDirecto !== ""
      ? valorComercialDirecto
      : totalOtc !== "" || totalMrc !== ""
      ? Number((otcNumber + mrcNumber).toFixed(2))
      : "";

  return {
    totalOtc,
    totalMrc,
    mrcNormalizado,
    valorComercial,
    cantidadValidas: 0,
  };
}

function getEstadoResumen(row) {
  return (
    normalizeText(row?.estado_oferta) ||
    normalizeText(row?.resultado_oferta) ||
    normalizeText(row?.estado_ot) ||
    "-"
  );
}

function isClosedResumenRow(row) {
  const estado = normalizeForCompare(row?.estado_oferta);
  const resultado = normalizeForCompare(row?.resultado_oferta);

  return Boolean(
    toIsoDate(row?.fecha_cierre_oportunidad) ||
      ESTADOS_CERRADOS_RESUMEN.has(estado) ||
      ESTADOS_CERRADOS_RESUMEN.has(resultado) ||
      resultado.includes("CERRADA") ||
      resultado.includes("PERDIDA")
  );
}

function getTotalsForPrincipalGroup(grupo) {
  const rows = grupo?.rows || [];

  if (rows.length > 0) {
    const totals = getPrincipalTotals(rows);

    if (totals.modoSuma !== "SIN_VALORES") {
      return totals;
    }
  }

  return getPrincipalOwnTotals(grupo?.principalRow);
}

function compareOtsAsignadas(a, b) {
  const subA = toPositiveInteger(a?.consecutivo_sub);
  const subB = toPositiveInteger(b?.consecutivo_sub);

  if (subA !== null && subB !== null && subA !== subB) {
    return subA - subB;
  }

  const otA = parseNumberSmart(a?.num_ot);
  const otB = parseNumberSmart(b?.num_ot);

  if (otA !== "" && otB !== "" && otA !== otB) {
    return Number(otA) - Number(otB);
  }

  const fechaA = getFechaAsignacionTimestamp(a);
  const fechaB = getFechaAsignacionTimestamp(b);

  if (fechaA !== fechaB) {
    return fechaB - fechaA;
  }

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "es", {
    numeric: true,
  });
}

function compareSubOportunidades(a, b) {
  const subA = parseNumberSmart(a?.consecutivo_sub);
  const subB = parseNumberSmart(b?.consecutivo_sub);

  if (subA !== "" && subB !== "") return subA - subB;

  const otA = parseNumberSmart(a?.num_ot);
  const otB = parseNumberSmart(b?.num_ot);

  if (otA !== "" && otB !== "") return otA - otB;

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "es", {
    numeric: true,
  });
}

function getUniqueText(rows, col, maxItems = 3) {
  const values = [
    ...new Set(
      (rows || [])
        .map((row) => normalizeText(row?.[col]))
        .filter(Boolean)
    ),
  ];

  if (!values.length) return "-";
  if (values.length <= maxItems) return values.join(" / ");

  return `${values.slice(0, maxItems).join(" / ")} +${values.length - maxItems}`;
}

function toPositiveInteger(value) {
  const parsed = parseNumberSmart(value);
  if (parsed === "") return null;

  const n = Number(parsed);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function getFechaAsignacionValue(row) {
  return (
    row?.fecha_creacion ??
    row?.fecha_asignacion ??
    row?.["FECHA ASIGNACIÓN"] ??
    row?.["FECHA ASIGNACION"] ??
    ""
  );
}

function getFechaAsignacionTimestamp(row) {
  const iso = toIsoDate(getFechaAsignacionValue(row));
  if (!iso) return 0;

  return dateIsoToTimestamp(iso);
}

function compareOportunidadesPorFechaAsignacionDesc(a, b) {
  const fechaA = getFechaAsignacionTimestamp(a);
  const fechaB = getFechaAsignacionTimestamp(b);

  if (fechaA !== fechaB) {
    return fechaB - fechaA;
  }

  return compareSubOportunidades(a, b);
}

function getFechaCierrePrincipalAutomatica(grupo) {
  if (!grupo) return "";

  const primeraAsignadaConFecha =
    (grupo.rows || []).find((row) => normalizeText(row?.fecha_cierre_oportunidad)) || null;

  return (
    primeraAsignadaConFecha?.fecha_cierre_oportunidad ||
    grupo?.principalRow?.fecha_cierre_oportunidad ||
    ""
  );
}

function swapIsoDateDayMonth(isoValue) {
  const iso = toIsoDate(isoValue);
  if (!iso) return "";

  const [yyyy, mm, dd] = iso.split("-").map(Number);

  if (!isValidDateParts(yyyy, dd, mm)) return "";

  return `${yyyy}-${pad2(dd)}-${pad2(mm)}`;
}

function getPrincipalDateValue(grupo, col) {
  if (!grupo || grupo.sinPrincipal || !isDateCol(col)) return "";

  if (col === "fecha_cierre_oportunidad") {
    return getFechaCierrePrincipalAutomatica(grupo);
  }

  const principalValue = grupo?.principalRow?.[col] || "";
  const principalIso = toIsoDate(principalValue);

  if (!principalIso) return "";

  /*
    Protección para datos históricos:
    si la fecha de la principal está con día/mes invertido y una asociada
    tiene exactamente esa fecha corregida, se muestra/exporta la fecha correcta.
    Ejemplo:
      principal: 2025-08-11 => 11/08/2025
      asociada:  2025-11-08 => 08/11/2025
  */
  const principalInvertida = swapIsoDateDayMonth(principalIso);

  if (principalInvertida) {
    const asociadaConFechaCorrecta = (grupo.rows || []).find(
      (row) => toIsoDate(row?.[col]) === principalInvertida
    );

    if (asociadaConFechaCorrecta) {
      return principalInvertida;
    }
  }

  return principalValue;
}

function getPrimeraOtAsignada(grupo) {
  const rows = Array.isArray(grupo?.rows) ? grupo.rows : [];

  return rows.length > 0 ? rows[0] : null;
}

function getPrincipalEstadoValue(grupo, col) {
  if (!grupo || grupo.sinPrincipal) return "";

  if (!PRINCIPAL_ESTADO_FROM_FIRST_OT_COLS.has(col)) {
    return grupo?.principalRow?.[col] ?? "";
  }

  const primeraOt = getPrimeraOtAsignada(grupo);
  const valorPrimeraOt = normalizeText(primeraOt?.[col]);

  if (valorPrimeraOt) {
    return valorPrimeraOt;
  }

  return grupo?.principalRow?.[col] ?? "";
}

function isFirstAssignedOt(row, allRows = []) {
  if (!row?.id || !row?.oportunidad_padre_id) return false;

  const hermanas = (allRows || [])
    .filter((item) => String(item?.oportunidad_padre_id || "") === String(row.oportunidad_padre_id))
    .sort(compareOtsAsignadas);

  return hermanas.length > 0 && sameId(hermanas[0]?.id, row.id);
}

function isAsiCloudRow(row) {
  const texto = [
    row?.servicio,
    row?.descripcion_ot,
    row?.observaciones,
    row?.nombre_cliente,
  ]
    .map((value) =>
      stripAccents(normalizeText(value))
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim()
    )
    .join(" ");

  // Detecta tanto "ASÍ CLOUD / ASI CLOUD" como servicios que vienen solo como "CLOUD - ..."
  return (
    texto.includes("ASI CLOUD") ||
    /(^|\s)CLOUD(\s|$)/.test(texto)
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
  const [expandedClientes, setExpandedClientes] = useState({});
  const [filtroCierreDesde, setFiltroCierreDesde] = useState("");
  const [filtroCierreHasta, setFiltroCierreHasta] = useState("");
  const [openResumenCerradas, setOpenResumenCerradas] = useState(false);

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
      "mostrar_dashboard",
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
    () => [...new Set(baseColumnOrder.filter((c) => !REMOVE_COLS.has(c)))],
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


  const buildExportCompletoAgrupado = () => {
    const metaColumns = [
      "nivel_export",
      "codigo_principal_export",
      "id_principal_export",
      "cliente_principal_export",
      "servicio_principal_export",
      "cantidad_asociadas_export",
      "cantidad_suman_export",
      "relacion_export",
    ];

    const resumenColumns = [
      "codigo_principal_export",
      "id_principal_export",
      "cliente_principal_export",
      "servicio_principal_export",
      "cantidad_asociadas_export",
      "cantidad_suman_export",
      "tipo_moneda",
      "otc",
      "mrc",
      "mrc_normalizado",
      "valor_oferta_claro",
      "fecha_cierre_oportunidad",
    ];

    const exportColumns = [...metaColumns, ...columnOrder];
    const rowsBase = Array.isArray(data) ? data : [];

    const principales = rowsBase.filter(
      (row) => normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL && row?.id
    );

    const principalesPorId = new Map(
      principales.map((principal) => [String(principal.id), principal])
    );

    const hijosPorPrincipal = new Map();
    const sinPrincipal = [];

    rowsBase.forEach((row) => {
      const tipo = normalizeTipoOportunidad(row?.tipo_oportunidad);

      if (tipo === TIPO_PRINCIPAL) return;

      const padreId = row?.oportunidad_padre_id;

      if (padreId && principalesPorId.has(String(padreId))) {
        const key = String(padreId);

        if (!hijosPorPrincipal.has(key)) {
          hijosPorPrincipal.set(key, []);
        }

        hijosPorPrincipal.get(key).push(row);
        return;
      }

      sinPrincipal.push(row);
    });

    const codigoPrincipalCounts = new Map();

    principales.forEach((principal) => {
      const codigo = normalizeText(principal?.codigo_control);
      if (codigo) {
        codigoPrincipalCounts.set(codigo, (codigoPrincipalCounts.get(codigo) || 0) + 1);
      }
    });

    const principalesOrdenadas = [...principales].sort((a, b) => {
      const clienteA = normalizeText(a?.nombre_cliente) || CLIENT_WITHOUT_NAME;
      const clienteB = normalizeText(b?.nombre_cliente) || CLIENT_WITHOUT_NAME;
      const byCliente = clienteA.localeCompare(clienteB, "es", { sensitivity: "base" });
      if (byCliente !== 0) return byCliente;

      const fechaA = getFechaAsignacionTimestamp(a);
      const fechaB = getFechaAsignacionTimestamp(b);
      if (fechaA !== fechaB) return fechaB - fechaA;

      const consecutivoA = toPositiveInteger(a?.consecutivo_principal);
      const consecutivoB = toPositiveInteger(b?.consecutivo_principal);
      if (consecutivoA !== null && consecutivoB !== null && consecutivoA !== consecutivoB) {
        return consecutivoA - consecutivoB;
      }

      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "es", { numeric: true });
    });

    const getCodigoPrincipalExport = (principal, index) => {
      const codigoBackend = normalizeText(principal?.codigo_control);
      const codigoDuplicado = codigoBackend && (codigoPrincipalCounts.get(codigoBackend) || 0) > 1;

      if (codigoBackend && !codigoDuplicado) {
        return codigoBackend;
      }

      return String(
        toPositiveInteger(principal?.consecutivo_principal) ||
          index + 1 ||
          principal?.id ||
          ""
      );
    };

    const exportRows = [];
    const resumenRows = [];

    principalesOrdenadas.forEach((principal, index) => {
      const codigoPrincipal = getCodigoPrincipalExport(principal, index);
      const hijosOrdenados = [...(hijosPorPrincipal.get(String(principal.id)) || [])]
        .sort(compareOtsAsignadas)
        .map((hijo, hijoIndex) => {
          const codigoBackend = normalizeText(hijo?.codigo_control);
          const codigoCalculado = `${codigoPrincipal}.${hijoIndex + 1}`;

          return {
            ...hijo,
            codigo_control:
              codigoBackend && codigoBackend.startsWith(`${codigoPrincipal}.`)
                ? codigoBackend
                : codigoCalculado,
          };
        });

      const hijosQueSuman = hijosOrdenados.filter(estadoSumaEnPrincipal);
      const totals =
        hijosOrdenados.length > 0
          ? getPrincipalTotals(hijosOrdenados)
          : getPrincipalOwnTotals(principal);

      const fechaCierreAutomatica =
        hijosOrdenados.find((row) => normalizeText(row?.fecha_cierre_oportunidad))?.fecha_cierre_oportunidad ||
        principal?.fecha_cierre_oportunidad ||
        "";

      const grupoPrincipalExport = {
        principalRow: principal,
        rows: hijosOrdenados,
        sinPrincipal: false,
      };

      const fechasPrincipalExport = Object.fromEntries(
        [...DATE_COLS].map((dateCol) => [
          dateCol,
          getPrincipalDateValue(grupoPrincipalExport, dateCol),
        ])
      );

      const estadosPrincipalExport = Object.fromEntries(
        [...PRINCIPAL_ESTADO_FROM_FIRST_OT_COLS].map((estadoCol) => [
          estadoCol,
          getPrincipalEstadoValue(grupoPrincipalExport, estadoCol),
        ])
      );

      const principalExport = {
        ...principal,
        ...fechasPrincipalExport,
        ...estadosPrincipalExport,
        nivel_export: "PRINCIPAL",
        codigo_principal_export: codigoPrincipal,
        id_principal_export: principal.id,
        cliente_principal_export: normalizeText(principal?.nombre_cliente) || CLIENT_WITHOUT_NAME,
        servicio_principal_export: normalizeText(principal?.servicio) || "OPORTUNIDAD PRINCIPAL",
        cantidad_asociadas_export: hijosOrdenados.length,
        cantidad_suman_export: hijosQueSuman.length,
        relacion_export: `Principal con ${hijosOrdenados.length} asociada${hijosOrdenados.length === 1 ? "" : "s"}`,
        codigo_control: codigoPrincipal,
        fecha_cierre_oportunidad:
          getPrincipalDateValue(grupoPrincipalExport, "fecha_cierre_oportunidad") ||
          fechaCierreAutomatica ||
          principal?.fecha_cierre_oportunidad ||
          "",
      };

      exportRows.push(principalExport);

      resumenRows.push({
        codigo_principal_export: codigoPrincipal,
        id_principal_export: principal.id,
        cliente_principal_export: normalizeText(principal?.nombre_cliente) || CLIENT_WITHOUT_NAME,
        servicio_principal_export: normalizeText(principal?.servicio) || "OPORTUNIDAD PRINCIPAL",
        cantidad_asociadas_export: hijosOrdenados.length,
        cantidad_suman_export: hijosQueSuman.length,
        tipo_moneda:
          hijosQueSuman.length > 0
            ? getUniqueText(hijosQueSuman, "tipo_moneda", 2)
            : normalizeText(principal?.tipo_moneda),
        otc: totals.totalOtc,
        mrc: totals.totalMrc,
        mrc_normalizado: totals.mrcNormalizado,
        valor_oferta_claro: totals.valorComercial,
        fecha_cierre_oportunidad:
          getPrincipalDateValue(grupoPrincipalExport, "fecha_cierre_oportunidad") ||
          fechaCierreAutomatica,
      });

      hijosOrdenados.forEach((hijo, hijoIndex) => {
        exportRows.push({
          ...hijo,
          nivel_export: "ASOCIADA",
          codigo_principal_export: codigoPrincipal,
          id_principal_export: principal.id,
          cliente_principal_export: normalizeText(principal?.nombre_cliente) || CLIENT_WITHOUT_NAME,
          servicio_principal_export: normalizeText(principal?.servicio) || "OPORTUNIDAD PRINCIPAL",
          cantidad_asociadas_export: "",
          cantidad_suman_export: estadoSumaEnPrincipal(hijo) ? "SI" : "NO",
          relacion_export: `Asociada a principal ${codigoPrincipal}`,
          consecutivo_sub: toPositiveInteger(hijo?.consecutivo_sub) || hijoIndex + 1,
        });
      });
    });

    const sinPrincipalOrdenadas = [...sinPrincipal].sort((a, b) => {
      const clienteA = normalizeText(a?.nombre_cliente) || CLIENT_WITHOUT_NAME;
      const clienteB = normalizeText(b?.nombre_cliente) || CLIENT_WITHOUT_NAME;
      const byCliente = clienteA.localeCompare(clienteB, "es", { sensitivity: "base" });
      if (byCliente !== 0) return byCliente;
      return compareSubOportunidades(a, b);
    });

    sinPrincipalOrdenadas.forEach((row, index) => {
      exportRows.push({
        ...row,
        nivel_export: "SIN PRINCIPAL",
        codigo_principal_export: "SIN PRINCIPAL",
        id_principal_export: "",
        cliente_principal_export: normalizeText(row?.nombre_cliente) || CLIENT_WITHOUT_NAME,
        servicio_principal_export: "SIN PRINCIPAL / PENDIENTE DE ASIGNAR",
        cantidad_asociadas_export: "",
        cantidad_suman_export: estadoSumaEnPrincipal(row) ? "SI" : "NO",
        relacion_export: "No está asociada a una principal",
        codigo_control: normalizeText(row?.codigo_control) || `PENDIENTE.${index + 1}`,
      });
    });

    return {
      rows: exportRows,
      columns: exportColumns,
      resumenRows,
      resumenColumns,
    };
  };

  const handleExportAll = () => {
    if (!data?.length) {
      return Swal.fire("Info", "No hay datos para exportar.", "info");
    }

    const groupedExport = buildExportCompletoAgrupado();

    exportOportunidadesExcel(
      prepareRowsForExcel(groupedExport.rows, groupedExport.columns),
      groupedExport.columns,
      `oportunidades_completo_agrupado_${todayStamp()}.xlsx`,
      {
        Fuente: "Gestión de Oportunidades",
        Nota: "Exportado desde pantalla con relación Principal / Asociadas",
        TotalFilas: groupedExport.rows.length,
      },
      {
        sheetName: "Oportunidades Agrupadas",
        extraSheets: [
          {
            name: "Resumen Principales",
            rows: prepareRowsForExcel(groupedExport.resumenRows, groupedExport.resumenColumns),
            columns: groupedExport.resumenColumns,
          },
        ],
      }
    );
  };

  const handleExportFiltered = () => {
    if (!filteredData?.length) {
      return Swal.fire("Info", "No hay datos filtrados para exportar.", "info");
    }

    exportOportunidadesExcel(
      prepareRowsForExcel(filteredData, columnOrder),
      columnOrder,
      `oportunidades_filtrado_${todayStamp()}.xlsx`,
      {
        Filtros: JSON.stringify(
          Object.fromEntries(
            Object.entries(filters).map(([k, v]) => [
              k,
              Array.isArray(v)
                ? v.map((item) => (item === EMPTY_FILTER_VALUE ? EMPTY_FILTER_LABEL : item)).join(", ")
                : v,
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

    const normalized = {
      ...rest,
      otc: otcValue,

      // ✅ Normalización explícita de fechas OT
      proyeccion_ingreso:
        rest.proyeccion_ingreso ??
        obj.proyeccionIngreso ??
        obj["PROYECCION INGRESO"] ??
        "",

      fecha_compromiso:
        rest.fecha_compromiso ??
        obj.fechaCompromiso ??
        obj["FECHA COMPROMISO"] ??
        "",

      fecha_cierre:
        rest.fecha_cierre ??
        obj.fechaCierre ??
        obj["FECHA CIERRE"] ??
        "",

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
      mostrar_dashboard: normalizeMostrarDashboard(rest.mostrar_dashboard),

      tipo_oportunidad: normalizeTipoOportunidad(rest.tipo_oportunidad),
      oportunidad_padre_id: rest.oportunidad_padre_id ?? null,
      codigo_control: normalizeText(rest.codigo_control),
      consecutivo_principal: rest.consecutivo_principal ?? null,
      consecutivo_sub: rest.consecutivo_sub ?? null,
      cliente_grupo_key:
        normalizeText(rest.cliente_grupo_key) ||
        normalizeClientGroupKey(rest.nombre_cliente),
    };

    return limpiarPerdidaSiNoAplica(normalized);
  }

  const applyFilters = useCallback((rows, currentFilters) => {
    let result = [...rows];

    Object.entries(currentFilters).forEach(([col, selectedValues]) => {
      if (Array.isArray(selectedValues) && selectedValues.length > 0) {
        result = result.filter((row) => {
          const cell = getFilterCellValue(row, col);
          const isBlankCell = cell === "";

          return selectedValues.some((selectedValue) => {
            if (selectedValue === EMPTY_FILTER_VALUE) {
              return isBlankCell;
            }

            return normalizeForCompare(selectedValue) === normalizeForCompare(cell);
          });
        });
      }
    });

    return result;
  }, []);

  const applyTopFilters = useCallback(
    (rows) => {
      if (!filtroCierreDesde && !filtroCierreHasta) {
        return rows || [];
      }

      const matchFechaCierre = (row) => {
        const fechaCierre = toIsoDate(row?.fecha_cierre_oportunidad);

        if (filtroCierreDesde && (!fechaCierre || fechaCierre < filtroCierreDesde)) {
          return false;
        }

        if (filtroCierreHasta && (!fechaCierre || fechaCierre > filtroCierreHasta)) {
          return false;
        }

        return true;
      };

      const principalesQuePasan = new Set(
        (rows || [])
          .filter(
            (row) =>
              normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL &&
              row?.id &&
              matchFechaCierre(row)
          )
          .map((row) => String(row.id))
      );

      return (rows || []).filter((row) => {
        const tipo = normalizeTipoOportunidad(row?.tipo_oportunidad);

        if (tipo === TIPO_PRINCIPAL) {
          return matchFechaCierre(row);
        }

        if (row?.oportunidad_padre_id && principalesQuePasan.has(String(row.oportunidad_padre_id))) {
          return true;
        }

        return matchFechaCierre(row);
      });
    },
    [filtroCierreDesde, filtroCierreHasta]
  );

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
        out[col] = normalizeDateForPayload(v, col);
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
    const nextColumnFiltered = applyFilters(data, filters);
    const nextFiltered = applyTopFilters(nextColumnFiltered);

    setFilteredData(nextFiltered);
    setUniqueValues(computeUniqueValues(data, filters));
  }, [data, filters, computeUniqueValues, applyFilters, applyTopFilters]);

  useEffect(() => {
    setEstadoResultadoMap(buildEstadoResultadoMap(data));
  }, [data]);

  const existePrincipalMismoClienteServicio = useCallback(
    (row, excludeId = null) => {
      const clienteKey = normalizeClientGroupKey(row?.nombre_cliente);
      const servicioKey = normalizeOpportunityServiceKey(row?.servicio);

      if (!clienteKey || !servicioKey) return null;

      return (
        (data || []).find((item) => {
          if (excludeId && String(item?.id) === String(excludeId)) {
            return false;
          }

          return (
            normalizeTipoOportunidad(item?.tipo_oportunidad) === TIPO_PRINCIPAL &&
            normalizeClientGroupKey(item?.nombre_cliente) === clienteKey &&
            normalizeOpportunityServiceKey(item?.servicio) === servicioKey
          );
        }) || null
      );
    },
    [data]
  );

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
    setFiltroCierreDesde("");
    setFiltroCierreHasta("");
    setEditing({ rowId: null, col: null });
    setEditingContext(null);
  };

  const copiarComoPrincipal = async (row) => {
    if (!row?.id) return;

    if (normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL) {
      Swal.fire(
        "No permitido",
        "Esta fila ya es una oportunidad principal. No es necesario copiarla.",
        "info"
      );
      return;
    }

    if (row?.oportunidad_padre_id) {
      Swal.fire(
        "No permitido",
        "Esta OT/suboportunidad ya está asignada a una principal. Para evitar duplicidad, no se puede copiar como principal.",
        "warning"
      );
      return;
    }

    const duplicada = existePrincipalMismoClienteServicio(row, row.id);

    if (duplicada) {
      Swal.fire(
        "Principal existente",
        `Ya existe una oportunidad principal para este cliente y servicio: ${
          duplicada.codigo_control || duplicada.id || ""
        }. No se permite duplicar la información.`,
        "warning"
      );
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Crear principal desde copia",
      html: `
        <div style="text-align:left;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(row?.nombre_cliente || "-")}<br/>
          <b>Servicio:</b> ${escapeHtml(row?.servicio || "-")}<br/><br/>
          Se creará una nueva oportunidad principal copiando esta fila.
          La fila original quedará asignada automáticamente a esa principal.
          <br/><br/>
          La nueva principal conservará los valores comerciales iniciales,
          pero no copiará la información del bloque de OT/Proyecto.
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, crear copia",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${row.id}/copiar-como-principal`, {
        method: "POST",
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire(
          "Error",
          json?.mensaje || json?.error || "No se pudo crear la principal desde la copia",
          "error"
        );
        return;
      }

      const principalId = json?.principal?.id || json?.oportunidad_principal?.id || json?.id;

      await fetchData();

      if (principalId) {
        setExpandedClientes((prev) => ({
          ...prev,
          [`principal-${principalId}`]: true,
        }));
      }

      Swal.fire(
        "Listo",
        "Se creó la oportunidad principal y la fila original quedó asignada.",
        "success"
      );
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const marcarComoPrincipal = async (row) => {
    if (!row?.id) return;

    if (normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL) {
      Swal.fire("Info", "Esta oportunidad ya está marcada como principal.", "info");
      return;
    }

    const duplicada = existePrincipalMismoClienteServicio(row, row.id);

    if (duplicada) {
      Swal.fire(
        "Principal existente",
        `Ya existe una oportunidad principal para el cliente y servicio seleccionados: ${
          duplicada.codigo_control || duplicada.id || ""
        }. Cambia el servicio o usa la principal existente para evitar duplicidad.`,
        "warning"
      );
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Volver oportunidad principal",
      html: `
        <div style="text-align:left;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(row?.nombre_cliente || "-")}<br/>
          <b>Servicio:</b> ${escapeHtml(row?.servicio || "-")}<br/><br/>
          Esta misma fila quedará como oportunidad principal.
          <br/><br/>
          No se creará una copia y no se duplicará la información.
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, volver principal",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${row.id}/marcar-principal`, {
        method: "PUT",
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire(
          "Error",
          json?.mensaje || json?.error || "No se pudo marcar como principal",
          "error"
        );
        return;
      }

      await fetchData();

      setExpandedClientes((prev) => ({
        ...prev,
        [`principal-${row.id}`]: true,
        [`cliente-${normalizeClientGroupKey(row?.nombre_cliente)}`]: true,
      }));

      Swal.fire(
        "Listo",
        "La oportunidad quedó como principal sin copiar la información.",
        "success"
      );
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const eliminarOportunidad = async (row, grupo = null) => {
    if (!row?.id) return;

    const esPrincipal =
      normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL;

    const hijosAsignados = esPrincipal
      ? (grupo?.rows || data.filter((item) => String(item?.oportunidad_padre_id) === String(row.id)))
      : [];

    let modoEliminar = "eliminar_simple";
    let nuevaPrincipalId = null;

    if (esPrincipal && hijosAsignados.length > 0) {
      const clienteKey = normalizeClientGroupKey(row?.nombre_cliente);

      const otrasPrincipales = (data || [])
        .filter((item) => {
          return (
            normalizeTipoOportunidad(item?.tipo_oportunidad) === TIPO_PRINCIPAL &&
            normalizeClientGroupKey(item?.nombre_cliente) === clienteKey &&
            String(item?.id) !== String(row.id)
          );
        })
        .sort((a, b) => {
          const codA = toPositiveInteger(a?.consecutivo_principal) || Number(a?.id || 0);
          const codB = toPositiveInteger(b?.consecutivo_principal) || Number(b?.id || 0);

          if (codA !== codB) return codA - codB;

          return String(a?.servicio || "").localeCompare(String(b?.servicio || ""), "es", {
            sensitivity: "base",
          });
        });

      const inputOptions = {
        eliminar_completo: `Eliminar principal y sus ${hijosAsignados.length} OT/asignación${hijosAsignados.length === 1 ? "" : "es"}`,
        crear_nueva: "Crear nueva principal destino y mover las asignaciones allí",
      };

      if (otrasPrincipales.length > 0) {
        inputOptions.mover_existente = "Mover asignaciones a otra principal existente y eliminar esta";
      }

      const modoResult = await Swal.fire({
        icon: "warning",
        title: "Eliminar oportunidad principal",
        html: `
          <div style="text-align:left;line-height:1.5;">
            <b>Cliente:</b> ${escapeHtml(row?.nombre_cliente || "-")}<br/>
            <b>Principal:</b> ${escapeHtml(row?.servicio || "-")}<br/>
            <b>Asignaciones actuales:</b> ${hijosAsignados.length}<br/><br/>
            Puedes eliminar todo completo o mover las asignaciones a otra principal antes de eliminar esta.
          </div>
        `,
        input: "select",
        inputOptions,
        inputPlaceholder: "Selecciona qué hacer",
        showCancelButton: true,
        confirmButtonText: "Continuar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc2626",
        inputValidator: (value) => {
          if (!value) return "Debes seleccionar una opción.";
          return null;
        },
      });

      if (!modoResult.isConfirmed || !modoResult.value) return;

      modoEliminar = modoResult.value;

      if (modoEliminar === "mover_existente") {
        const principalOptions = Object.fromEntries(
          otrasPrincipales.map((item) => [
            String(item.id),
            `${item.codigo_control || item.consecutivo_principal || item.id} - ${item.servicio || "SIN SERVICIO"}`,
          ])
        );

        const principalResult = await Swal.fire({
          icon: "question",
          title: "Selecciona la principal destino",
          input: "select",
          inputOptions: principalOptions,
          inputPlaceholder: "Oportunidad principal destino",
          showCancelButton: true,
          confirmButtonText: "Mover y eliminar",
          cancelButtonText: "Cancelar",
          confirmButtonColor: "#2563eb",
          inputValidator: (value) => {
            if (!value) return "Debes seleccionar la principal destino.";
            return null;
          },
        });

        if (!principalResult.isConfirmed || !principalResult.value) return;

        nuevaPrincipalId = Number(principalResult.value);
      }
    }

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Confirmar eliminación",
      html: `
        <div style="text-align:left;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(row?.nombre_cliente || "-")}<br/>
          <b>Servicio:</b> ${escapeHtml(row?.servicio || "-")}<br/><br/>
          ${
            modoEliminar === "eliminar_completo"
              ? `<b>Se eliminará la oportunidad principal y también sus ${hijosAsignados.length} OT/asignación${hijosAsignados.length === 1 ? "" : "es"}.</b>`
              : modoEliminar === "mover_existente"
              ? "<b>Las asignaciones se moverán a la principal seleccionada y luego se eliminará esta principal.</b>"
              : modoEliminar === "crear_nueva"
              ? "<b>Se creará una nueva principal destino, se moverán las asignaciones y luego se eliminará esta principal.</b>"
              : "<b>Se eliminará la oportunidad seleccionada.</b>"
          }
          <br/><br/>
          Esta acción no se puede deshacer.
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${row.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: modoEliminar,
          nueva_principal_id: nuevaPrincipalId,
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire(
          "Error",
          json?.mensaje || json?.error || "No se pudo eliminar la oportunidad",
          "error"
        );
        return;
      }

      const destinoId =
        json?.principal_destino?.id ||
        json?.nueva_principal?.id ||
        json?.nueva_principal_id ||
        nuevaPrincipalId;

      await fetchData();

      if (destinoId) {
        setExpandedClientes((prev) => ({
          ...prev,
          [`principal-${destinoId}`]: true,
          [`cliente-${normalizeClientGroupKey(row?.nombre_cliente)}`]: true,
        }));
      }

      Swal.fire(
        "Listo",
        json?.mensaje || "La oportunidad fue eliminada correctamente.",
        "success"
      );
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const asignarAPrincipal = async (row) => {
    if (!row?.id) return;

    const principales = (data || [])
      .filter((item) => {
        return (
          normalizeTipoOportunidad(item?.tipo_oportunidad) === TIPO_PRINCIPAL &&
          normalizeClientGroupKey(item?.nombre_cliente) === normalizeClientGroupKey(row?.nombre_cliente) &&
          String(item?.id) !== String(row?.id)
        );
      })
      .sort((a, b) => {
        const byFecha = compareOportunidadesPorFechaAsignacionDesc(a, b);
        if (byFecha !== 0) return byFecha;

        return String(a?.servicio || "").localeCompare(String(b?.servicio || ""), "es", {
          sensitivity: "base",
        });
      });

    if (!principales.length) {
      Swal.fire(
        "Sin principales",
        "Este cliente no tiene oportunidades principales disponibles. Primero marca una oportunidad como principal.",
        "info"
      );
      return;
    }

    const inputOptions = Object.fromEntries(
      principales.map((item) => [
        String(item.id),
        `${item.codigo_control || item.id} - ${item.servicio || "SIN SERVICIO"}`,
      ])
    );

    const result = await Swal.fire({
      icon: "question",
      title: "Asignar a principal",
      html: `
        <div style="text-align:left;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(row?.nombre_cliente || "-")}<br/>
          <b>OT / oportunidad:</b> ${escapeHtml(row?.servicio || "-")}
        </div>
      `,
      input: "select",
      inputOptions,
      inputPlaceholder: "Selecciona una oportunidad principal",
      showCancelButton: true,
      confirmButtonText: "Asignar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#10b981",
      inputValidator: (value) => {
        if (!value) return "Debes seleccionar una oportunidad principal.";
        return null;
      },
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${row.id}/asignar-principal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oportunidad_padre_id: Number(result.value),
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire("Error", json?.mensaje || "No se pudo asignar la oportunidad", "error");
        return;
      }

      await fetchData();
      setExpandedClientes((prev) => ({
        ...prev,
        [`principal-${result.value}`]: true,
      }));

      Swal.fire("Listo", "La oportunidad fue asignada a la principal.", "success");
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const quitarDePrincipal = async (row) => {
    if (!row?.id) return;

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Quitar de principal",
      text: "La oportunidad quedará sin principal asignada.",
      showCancelButton: true,
      confirmButtonText: "Sí, quitar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${row.id}/quitar-principal`, {
        method: "PUT",
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire("Error", json?.mensaje || "No se pudo quitar la asignación", "error");
        return;
      }

      await fetchData();
      Swal.fire("Listo", "La oportunidad quedó sin principal asignada.", "success");
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const quitarPrincipalAvanzado = async (grupo) => {
    const principal = grupo?.principalRow;

    if (!principal?.id || grupo?.sinPrincipal) return;

    const clienteKey = normalizeClientGroupKey(principal?.nombre_cliente);
    const otrasPrincipales = (data || [])
      .filter((item) => {
        return (
          normalizeTipoOportunidad(item?.tipo_oportunidad) === TIPO_PRINCIPAL &&
          normalizeClientGroupKey(item?.nombre_cliente) === clienteKey &&
          String(item?.id) !== String(principal.id)
        );
      })
      .sort((a, b) => {
        const codA = toPositiveInteger(a?.consecutivo_principal) || Number(a?.id || 0);
        const codB = toPositiveInteger(b?.consecutivo_principal) || Number(b?.id || 0);

        if (codA !== codB) return codA - codB;

        return String(a?.servicio || "").localeCompare(String(b?.servicio || ""), "es", {
          sensitivity: "base",
        });
      });

    const inputOptions = {
      crear_nueva: "Crear nueva principal destino y mover todo allí",
    };

    if (otrasPrincipales.length > 0) {
      inputOptions.mover_existente = "Mover a otra principal existente del mismo cliente";
    }

    const modoResult = await Swal.fire({
      icon: "warning",
      title: "Quitar oportunidad principal",
      html: `
        <div style="text-align:left;line-height:1.5;">
          <b>Cliente:</b> ${escapeHtml(principal?.nombre_cliente || "-")}<br/>
          <b>Principal:</b> ${escapeHtml(principal?.servicio || "-")}<br/>
          <b>OTs asignadas:</b> ${(grupo?.rows || []).length}<br/><br/>
          Las OTs asignadas no se eliminarán ni se perderán. Serán movidas automáticamente al destino seleccionado.
        </div>
      `,
      input: "select",
      inputOptions,
      inputPlaceholder: "Selecciona qué hacer",
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
      inputValidator: (value) => {
        if (!value) return "Debes seleccionar una opción.";
        return null;
      },
    });

    if (!modoResult.isConfirmed || !modoResult.value) return;

    let nuevaPrincipalId = null;

    if (modoResult.value === "mover_existente") {
      const principalOptions = Object.fromEntries(
        otrasPrincipales.map((item) => [
          String(item.id),
          `${item.codigo_control || item.consecutivo_principal || item.id} - ${item.servicio || "SIN SERVICIO"}`,
        ])
      );

      const principalResult = await Swal.fire({
        icon: "question",
        title: "Selecciona la nueva principal",
        input: "select",
        inputOptions: principalOptions,
        inputPlaceholder: "Oportunidad principal destino",
        showCancelButton: true,
        confirmButtonText: "Mover OTs",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#2563eb",
        inputValidator: (value) => {
          if (!value) return "Debes seleccionar la principal destino.";
          return null;
        },
      });

      if (!principalResult.isConfirmed || !principalResult.value) return;
      nuevaPrincipalId = Number(principalResult.value);
    }

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Confirmar cambio",
      html: `
        <div style="text-align:left;line-height:1.5;">
          La oportunidad principal actual dejará de ser principal y quedará como OT/suboportunidad.<br/>
          Todas sus OTs asignadas serán movidas al nuevo destino automáticamente.
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, quitar principal",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
    });

    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);

      const resp = await jfetch(`/oportunidades/${principal.id}/quitar-principal-avanzado`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: modoResult.value,
          nueva_principal_id: nuevaPrincipalId,
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire(
          "Error",
          json?.mensaje || json?.error || "No se pudo quitar la oportunidad principal",
          "error"
        );
        return;
      }

      const destinoId =
        json?.principal_destino?.id ||
        json?.nueva_principal?.id ||
        json?.nueva_principal_id ||
        nuevaPrincipalId;

      await fetchData();

      if (destinoId) {
        setExpandedClientes((prev) => ({
          ...prev,
          [`principal-${destinoId}`]: true,
          [`cliente-${clienteKey}`]: true,
        }));
      }

      Swal.fire(
        "Listo",
        "La principal fue retirada y sus OTs fueron reasignadas correctamente.",
        "success"
      );
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  const closeEditing = () => {
    setEditing({ rowId: null, col: null });
    setEditingContext(null);
  };

  const sameId = (a, b) => String(a ?? "") === String(b ?? "");

  const findRowById = (rowId) => data.find((r) => sameId(r?.id, rowId));

  const getResultadoSeguroPorEstado = useCallback(
    (estado, resultadoActual = "") => {
      const allowed = estadoResultadoMap[estado] || [];

      if (!estado) return "";

      if (valueInOptions(resultadoActual, allowed)) {
        return resultadoActual;
      }

      return allowed.length === 1 ? allowed[0] : "";
    },
    [estadoResultadoMap]
  );

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

    if (col === "valor_oferta_claro") {
      const isSubAsignada =
        normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_SUBOPORTUNIDAD &&
        Boolean(row?.oportunidad_padre_id);

      if (!isSubAsignada) {
        Swal.fire(
          "Info",
          "El valor oferta Claro solo se modifica en las OTs/suboportunidades asignadas a una oportunidad principal.",
          "info"
        );
        return;
      }
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
      const nextRow = limpiarPerdidaSiNoAplica({
        ...row,
        ...updates,
      });
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

      const updatedRow = normalizeRowFromApi({ ...row, ...nextRow, ...payload, ...(j?.oportunidad || {}) });
      const principalSincronizada = j?.principal_sincronizada
        ? normalizeRowFromApi(j.principal_sincronizada)
        : null;

      setData((prev) =>
        prev.map((r) => {
          if (sameId(r.id, row.id)) {
            return updatedRow;
          }

          if (principalSincronizada && sameId(r.id, principalSincronizada.id)) {
            return normalizeRowFromApi({ ...r, ...principalSincronizada });
          }

          return r;
        })
      );

      highlightRow(row.id);

      if (principalSincronizada) {
        highlightRow(principalSincronizada.id);

        if (isFirstAssignedOt(row, data)) {
          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: "Principal sincronizada con la primera OT",
            showConfirmButton: false,
            timer: 1800,
            timerProgressBar: true,
          });
        }
      }

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

    let original = row?.[col];
    let incoming = newValue;

    if (isDateCol(col)) {
      try {
        original = normalizeDateForPayload(row?.[col], col) || "";
        incoming = normalizeDateForPayload(newValue, col) || "";
      } catch (e) {
        Swal.fire("Fecha inválida", e?.message || "La fecha no tiene un formato válido.", "warning");
        closeEditing();
        return;
      }
    }

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
    empty.mostrar_dashboard = "SI";
    setNewRow(empty);
  };

  const saveNewRow = async (crearComoPrincipal = false) => {
    try {
      if (crearComoPrincipal) {
        const duplicada = existePrincipalMismoClienteServicio(newRow);

        if (duplicada) {
          Swal.fire(
            "Principal existente",
            `Ya existe una oportunidad principal para este cliente y servicio: ${
              duplicada.codigo_control || duplicada.id || ""
            }. No se permite crear otra principal igual.`,
            "warning"
          );
          return;
        }
      }

      setLoading(true);
      const cleanedNewRow = limpiarPerdidaSiNoAplica(newRow);
      const payload = toDbPayload(cleanedNewRow);

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

      const nuevaId = json?.id || json?.oportunidad?.id;

      if (crearComoPrincipal && nuevaId) {
        const marcarResp = await jfetch(`/oportunidades/${nuevaId}/marcar-principal`, {
          method: "PUT",
        });

        const marcarJson = await marcarResp.json().catch(() => ({}));

        if (!marcarResp.ok) {
          Swal.fire(
            "Fila creada, pero no quedó principal",
            marcarJson?.mensaje || "La fila se creó, pero no se pudo marcar como principal.",
            "warning"
          );
          await fetchData();
          setNewRow(null);
          return;
        }
      }

      await fetchData();
      Swal.fire(
        "Guardado",
        crearComoPrincipal
          ? "Nueva fila creada y marcada como oportunidad principal"
          : "Nueva fila creada",
        "success"
      );
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

    if (col === SERVICIO_COL) {
      return (
        <textarea
          className="cell-input cell-textarea servicio-editor"
          autoFocus
          value={editValue ?? ""}
          placeholder="Escribe el servicio. Usa Alt + Enter para separar por renglones."
          onFocus={(e) => {
            const len = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(len, len);
          }}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.altKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }

            if (e.key === "Escape") {
              e.preventDefault();
              closeEditing();
            }
          }}
          onBlur={(e) => saveEdit(row.id, col, e.currentTarget.value)}
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

    if (col === "mostrar_dashboard") {
      return renderSelect(row, col, MOSTRAR_DASHBOARD_OPTS);
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
            const nextResultado = getResultadoSeguroPorEstado(
              estado,
              row.resultado_oferta
            );

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
            saveEditMulti(row.id, {
              resultado_oferta: next,
            });
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
        <input
          className="cell-input"
          list="categoria-perdida-list"
          autoFocus
          value={editValue ?? ""}
          placeholder="Selecciona o escribe categoría"
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }

            if (e.key === "Escape") {
              e.preventDefault();
              closeEditing();
            }
          }}
          onBlur={(e) => {
            const categoria = normalizeText(e.currentTarget.value);
            const allowed = getSubcategoriaPerdidaOptions(categoria);
            const subActual = row.subcategoria_perdida || "";

            saveEditMulti(row.id, {
              categoria_perdida: categoria,
              subcategoria_perdida: valueInOptions(subActual, allowed)
                ? subActual
                : "",
            });
          }}
        />
      );
    }


    if (col === "subcategoria_perdida") {
      const allowed = getSubcategoriaPerdidaOptions(row.categoria_perdida);
      const listId = `subcategoria-perdida-list-${row.id}`;

      return (
        <>
          <input
            className="cell-input"
            list={listId}
            autoFocus
            value={editValue ?? ""}
            placeholder="Selecciona o escribe subcategoría"
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }

              if (e.key === "Escape") {
                e.preventDefault();
                closeEditing();
              }
            }}
            onBlur={(e) =>
              saveEditMulti(row.id, {
                subcategoria_perdida: normalizeText(e.currentTarget.value),
              })
            }
          />

          <datalist id={listId}>
            {allowed.map((op) => (
              <option key={op} value={op} />
            ))}
          </datalist>
        </>
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

    if (col === "valor_oferta_claro") {
      return <span className="cell-readonly-hint">Se edita al asignar OT</span>;
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

    if (col === SERVICIO_COL) {
      return (
        <textarea
          className="cell-input cell-textarea servicio-new-editor"
          value={newRow[col] ?? ""}
          placeholder="Escribe el servicio. Usa Alt + Enter para separar por renglones."
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.altKey) {
              e.preventDefault();
            }
          }}
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

    if (col === "mostrar_dashboard") {
      return (
        <select
          className="cell-input"
          value={newRow[col] ?? ""}
          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
        >
          <option value="">-</option>
          {MOSTRAR_DASHBOARD_OPTS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
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
            const nextResultado = getResultadoSeguroPorEstado(
              estado,
              newRow.resultado_oferta
            );

            setNewRow((p) =>
              limpiarPerdidaSiNoAplica({
                ...p,
                estado_oferta: estado,
                resultado_oferta: nextResultado,
              })
            );
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
          onChange={(e) =>
            setNewRow((p) =>
              limpiarPerdidaSiNoAplica({
                ...p,
                resultado_oferta: e.target.value,
              })
            )
          }
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
        <input
          className="cell-input"
          list="categoria-perdida-list"
          value={newRow[col] ?? ""}
          placeholder="Selecciona o escribe categoría"
          onChange={(e) => {
            const categoria = normalizeText(e.target.value);
            const allowed = getSubcategoriaPerdidaOptions(categoria);
            const subActual = newRow.subcategoria_perdida || "";

            setNewRow((p) => ({
              ...p,
              categoria_perdida: categoria,
              subcategoria_perdida: valueInOptions(subActual, allowed)
                ? subActual
                : "",
            }));
          }}
        />
      );
    }


    if (col === "subcategoria_perdida") {
      const allowed = getSubcategoriaPerdidaOptions(newRow.categoria_perdida);

      return (
        <>
          <input
            className="cell-input"
            list="subcategoria-perdida-new-list"
            value={newRow[col] ?? ""}
            placeholder="Selecciona o escribe subcategoría"
            onChange={(e) =>
              setNewRow({
                ...newRow,
                subcategoria_perdida: normalizeText(e.target.value),
              })
            }
          />

          <datalist id="subcategoria-perdida-new-list">
            {allowed.map((op) => (
              <option key={op} value={op} />
            ))}
          </datalist>
        </>
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


  const oportunidadesAgrupadas = useMemo(() => {
    const principales = (data || []).filter(
      (row) => normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL && row?.id
    );

    const codigoPrincipalCounts = new Map();

    principales.forEach((principal) => {
      const codigo = normalizeText(principal?.codigo_control);

      if (codigo) {
        codigoPrincipalCounts.set(codigo, (codigoPrincipalCounts.get(codigo) || 0) + 1);
      }
    });

    const principalesOrdenadasGlobal = [...principales].sort((a, b) => {
      const consecutivoA = toPositiveInteger(a?.consecutivo_principal);
      const consecutivoB = toPositiveInteger(b?.consecutivo_principal);

      if (consecutivoA !== null && consecutivoB !== null && consecutivoA !== consecutivoB) {
        return consecutivoA - consecutivoB;
      }

      const idA = Number(a?.id || 0);
      const idB = Number(b?.id || 0);

      if (idA !== idB) return idA - idB;

      return compareOportunidadesPorFechaAsignacionDesc(a, b);
    });

    const principalVisualConsecutivoMap = new Map();

    principalesOrdenadasGlobal.forEach((principal, index) => {
      principalVisualConsecutivoMap.set(String(principal.id), index + 1);
    });

    const principalesPorId = new Map();
    const gruposPorPrincipal = new Map();
    const sinPrincipalPorCliente = new Map();

    const makeClienteInfo = (row) => {
      const cliente = normalizeText(row?.[CLIENTE_COL]) || CLIENT_WITHOUT_NAME;
      const clienteKey = normalizeClientGroupKey(cliente);

      return { cliente, clienteKey };
    };

    const getCodigoPrincipalSeguro = (principal) => {
      const codigoBackend = normalizeText(principal?.codigo_control);
      const codigoDuplicado = codigoBackend && (codigoPrincipalCounts.get(codigoBackend) || 0) > 1;
      const consecutivoVisual = principalVisualConsecutivoMap.get(String(principal?.id));
      const consecutivoBackend = toPositiveInteger(principal?.consecutivo_principal);

      if (codigoBackend && !codigoDuplicado) {
        return codigoBackend;
      }

      return String(consecutivoVisual || consecutivoBackend || principal?.id || "");
    };

    const ensureGrupoPrincipal = (principal) => {
      if (!principal?.id) return null;

      const { cliente, clienteKey } = makeClienteInfo(principal);
      const key = `principal-${principal.id}`;

      if (!gruposPorPrincipal.has(key)) {
        const numeroPrincipal =
          principalVisualConsecutivoMap.get(String(principal.id)) ||
          toPositiveInteger(principal?.consecutivo_principal) ||
          Number(principal.id) ||
          0;

        const codigoControl = getCodigoPrincipalSeguro(principal);

        gruposPorPrincipal.set(key, {
          key,
          cliente,
          clienteKey,
          principalRow: principal,
          numeroPrincipal,
          codigo_control: codigoControl,
          rows: [],
          sinPrincipal: false,
        });
      }

      return gruposPorPrincipal.get(key);
    };

    principales.forEach((row) => {
      principalesPorId.set(String(row.id), row);
    });

    (filteredData || []).forEach((row) => {
      const tipo = normalizeTipoOportunidad(row?.tipo_oportunidad);
      const padreId = row?.oportunidad_padre_id;

      if (tipo === TIPO_PRINCIPAL) {
        ensureGrupoPrincipal(row);
        return;
      }

      if (padreId && principalesPorId.has(String(padreId))) {
        const principal = principalesPorId.get(String(padreId));
        const grupo = ensureGrupoPrincipal(principal);

        if (grupo) {
          grupo.rows.push(row);
          return;
        }
      }

      const { cliente, clienteKey } = makeClienteInfo(row);
      const key = `sin-principal-${clienteKey}`;

      if (!sinPrincipalPorCliente.has(key)) {
        sinPrincipalPorCliente.set(key, {
          key,
          cliente,
          clienteKey,
          principalRow: null,
          numeroPrincipal: 999999,
          codigo_control: "SIN PRINCIPAL",
          rows: [],
          sinPrincipal: true,
        });
      }

      sinPrincipalPorCliente.get(key).rows.push(row);
    });

    const gruposPrincipales = Array.from(gruposPorPrincipal.values()).map((grupo) => {
      const principalCodigo = grupo.codigo_control || String(grupo.numeroPrincipal || "");

      const rowsOrdenadas = [...grupo.rows]
        .sort(compareOtsAsignadas)
        .map((row, index) => {
          const consecutivoSub = toPositiveInteger(row?.consecutivo_sub) || index + 1;
          const codigoBackend = normalizeText(row?.codigo_control);
          const codigoCalculado = `${principalCodigo}.${consecutivoSub}`;

          return {
            ...row,
            tipo_oportunidad: normalizeTipoOportunidad(row?.tipo_oportunidad),
            codigo_control: codigoBackend && codigoBackend.startsWith(`${principalCodigo}.`)
              ? codigoBackend
              : codigoCalculado,
            consecutivo_principal: grupo.numeroPrincipal,
            consecutivo_sub: consecutivoSub,
          };
        });

      return {
        ...grupo,
        rows: rowsOrdenadas,
        totals: getPrincipalTotals(rowsOrdenadas),
      };
    });

    const gruposSinPrincipal = Array.from(sinPrincipalPorCliente.values()).map((grupo) => {
      const rowsOrdenadas = [...grupo.rows]
        .sort(compareOtsAsignadas)
        .map((row, index) => ({
          ...row,
          tipo_oportunidad: normalizeTipoOportunidad(row?.tipo_oportunidad),
          codigo_control: normalizeText(row?.codigo_control) || `PENDIENTE.${index + 1}`,
        }));

      return {
        ...grupo,
        rows: rowsOrdenadas,
        totals: getPrincipalTotals(rowsOrdenadas),
      };
    });

    return [...gruposPrincipales, ...gruposSinPrincipal].sort((a, b) => {
      const byCliente = a.cliente.localeCompare(b.cliente, "es", { sensitivity: "base" });
      if (byCliente !== 0) return byCliente;

      if (a.sinPrincipal && !b.sinPrincipal) return 1;
      if (!a.sinPrincipal && b.sinPrincipal) return -1;

      const fechaA = dateIsoToTimestamp(toIsoDate(getPrincipalDateValue(a, "fecha_creacion")));
      const fechaB = dateIsoToTimestamp(toIsoDate(getPrincipalDateValue(b, "fecha_creacion")));

      if (fechaA !== fechaB) return fechaB - fechaA;

      return a.numeroPrincipal - b.numeroPrincipal;
    });
  }, [data, filteredData]);

  const clientesAgrupados = useMemo(() => {
    const grouped = new Map();

    oportunidadesAgrupadas.forEach((grupo) => {
      const clienteKey = grupo.clienteKey || normalizeClientGroupKey(grupo.cliente);
      const key = `cliente-${clienteKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          clienteKey,
          cliente: grupo.cliente,
          grupos: [],
        });
      }

      grouped.get(key).grupos.push(grupo);
    });

    return Array.from(grouped.values())
      .map((clienteGrupo) => ({
        ...clienteGrupo,
        totalPrincipales: clienteGrupo.grupos.filter((g) => !g.sinPrincipal).length,
        totalSinPrincipal: clienteGrupo.grupos
          .filter((g) => g.sinPrincipal)
          .reduce((acc, g) => acc + (g.rows?.length || 0), 0),
        totalOts: clienteGrupo.grupos.reduce((acc, g) => acc + (g.rows?.length || 0), 0),
      }))
      .sort((a, b) =>
        a.cliente.localeCompare(b.cliente, "es", { sensitivity: "base" })
      );
  }, [oportunidadesAgrupadas]);

  const resumenCerradas = useMemo(() => {
    const allRows = Array.isArray(data) ? data : [];

    const principales = allRows.filter(
      (row) => normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL
    );

    const principalesPorId = new Map(
      principales.map((row) => [String(row.id), row])
    );

    const hijosPorPrincipal = new Map();

    allRows.forEach((row) => {
      const tipo = normalizeTipoOportunidad(row?.tipo_oportunidad);

      if (tipo === TIPO_PRINCIPAL) return;

      const padreId = row?.oportunidad_padre_id;
      if (!padreId) return;

      const padreKey = String(padreId);
      if (!principalesPorId.has(padreKey)) return;

      if (!hijosPorPrincipal.has(padreKey)) {
        hijosPorPrincipal.set(padreKey, []);
      }

      hijosPorPrincipal.get(padreKey).push(row);
    });

    return principales
      .filter((principal) => isClosedResumenRow(principal))
      .map((principal) => {
        const hijos = [...(hijosPorPrincipal.get(String(principal.id)) || [])].sort(compareOtsAsignadas);
        const rowsQueSuman = hijos.filter(estadoSumaEnPrincipal);
        const totals =
          hijos.length > 0
            ? getPrincipalTotals(hijos)
            : getPrincipalOwnTotals(principal);

        const fechaCierreAutomatica =
          hijos.find((row) => normalizeText(row?.fecha_cierre_oportunidad))?.fecha_cierre_oportunidad ||
          principal?.fecha_cierre_oportunidad ||
          "";

        return {
          id: principal?.id,
          nombre_cliente: normalizeText(principal?.nombre_cliente) || "-",
          servicio: normalizeText(principal?.servicio) || "-",
          estado: getEstadoResumen(principal),
          tipo_moneda:
            rowsQueSuman.length > 0
              ? getUniqueText(rowsQueSuman, "tipo_moneda", 2)
              : normalizeText(principal?.tipo_moneda) || "-",
          otc: totals.totalOtc,
          mrc: totals.totalMrc,
          mrc_normalizado: totals.mrcNormalizado,
          valor_oferta_claro: totals.valorComercial,
          valor: totals.valorComercial,
          fecha_cierre_oportunidad: toIsoDate(fechaCierreAutomatica),
        };
      })
      .sort((a, b) => {
        const fechaA = toIsoDate(a.fecha_cierre_oportunidad);
        const fechaB = toIsoDate(b.fecha_cierre_oportunidad);

        if (fechaA !== fechaB) return fechaB.localeCompare(fechaA);

        return a.nombre_cliente.localeCompare(b.nombre_cliente, "es", {
          sensitivity: "base",
        });
      });
  }, [data]);

  const toggleClienteGroup = useCallback((clienteKey) => {
    setExpandedClientes((prev) => ({
      ...prev,
      [clienteKey]: !prev[clienteKey],
    }));
  }, []);

  const expandAllClienteGroups = () => {
    const expanded = {};

    clientesAgrupados.forEach((clienteGrupo) => {
      expanded[clienteGrupo.key] = true;
      clienteGrupo.grupos.forEach((grupo) => {
        expanded[grupo.key] = true;
      });
    });

    setExpandedClientes(expanded);
  };

  const collapseAllClienteGroups = () => {
    setExpandedClientes({});
  };

  const renderOpportunityRow = (row, i) => (
    <tr
      key={`sub-${row.id ?? i}`}
      data-row-id={row.id ?? ""}
      className={`sub-oportunidad-row ${
        row?.oportunidad_padre_id ? "assigned-sub-row" : "unassigned-sub-row"
      } ${isAsiCloudRow(row) ? "asi-cloud-row" : ""}`}
    >
      {tableColumnOrder.map((col, colIdx) => {
        const isLong = isObservationsCol(col);

        return (
          <td
            key={`${row.id ?? i}-${col}-${colIdx}`}
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
            ]
              .join(" ")
              .trim()}
            title={
              col === "id"
                ? `Código control: ${row?.codigo_control ?? "-"} | ID BD: ${row?.id ?? "-"}`
                : isLong
                ? undefined
                : String(row?.[col] ?? "")
            }
          >
            {col === "id"
              ? row?.codigo_control ?? row?.id ?? "-"
              : sameId(editing.rowId, row?.id) && editing.col === col
              ? renderEditorCell(row, col)
              : isLong
              ? renderLongTextCell(row?.[col])
              : col === SERVICIO_COL
              ? renderMultilineTextCell(row?.[col])
              : formatCell(col, row[col])}
          </td>
        );
      })}

      <td className="acciones">
        <div className="op-actions">
          <button
            type="button"
            className="op-action-btn op-action-main"
            onClick={() => marcarComoPrincipal(row)}
            disabled={loading}
            title="Volver esta misma fila oportunidad principal sin copiar información"
          >
            Hacer principal
          </button>

          <button
            type="button"
            className="op-action-btn op-action-copy"
            onClick={() => copiarComoPrincipal(row)}
            disabled={loading}
            title="Crear una oportunidad principal copiando esta fila"
          >
            Copiar principal
          </button>

          <button
            type="button"
            className="op-action-btn op-action-assign"
            onClick={() => asignarAPrincipal(row)}
            disabled={loading}
            title="Asignar esta OT/suboportunidad a una principal"
          >
            Asignar
          </button>

          {row?.oportunidad_padre_id && (
            <button
              type="button"
              className="op-action-btn op-action-remove"
              onClick={() => quitarDePrincipal(row)}
              disabled={loading}
              title="Quitar esta OT/suboportunidad de la principal"
            >
              Quitar
            </button>
          )}

          <button
            type="button"
            className="op-action-btn op-action-delete"
            onClick={() => eliminarOportunidad(row)}
            disabled={loading}
            title="Eliminar oportunidad duplicada por error"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );

  const renderClienteGroupRow = (clienteGrupo) => {
    const isOpen = !!expandedClientes[clienteGrupo.key];

    return (
      <tr className="cliente-group-row" data-cliente-key={clienteGrupo.key}>
        {tableColumnOrder.map((col, colIdx) => {
          let content = "";

          if (col === "id") {
            content = (
              <div className="principal-id-box cliente-group-toggle-box">
                <button
                  type="button"
                  className="cliente-toggle-btn cliente-group-toggle-btn"
                  onClick={() => toggleClienteGroup(clienteGrupo.key)}
                  title={isOpen ? "Ocultar oportunidades del cliente" : "Ver oportunidades del cliente"}
                >
                  {isOpen ? "−" : "+"}
                </button>
              </div>
            );
          }

          if (col === CLIENTE_COL) {
            content = (
              <div className="cliente-principal-info cliente-group-info">
                <strong>{clienteGrupo.cliente}</strong>
                <span>
                  {clienteGrupo.totalPrincipales} oportunidad{clienteGrupo.totalPrincipales === 1 ? "" : "es"} principal{clienteGrupo.totalPrincipales === 1 ? "" : "es"}
                </span>
                <small>
                  {clienteGrupo.totalOts} OT/suboportunidad{clienteGrupo.totalOts === 1 ? "" : "es"}
                  {clienteGrupo.totalSinPrincipal > 0
                    ? ` · ${clienteGrupo.totalSinPrincipal} sin principal`
                    : ""}
                </small>
              </div>
            );
          }

          if (col === SERVICIO_COL) {
            content = "AGRUPACIÓN DE OPORTUNIDADES DEL CLIENTE";
          }

          return (
            <td
              key={`cliente-group-${clienteGrupo.key}-${col}-${colIdx}`}
              className={[
                getColumnClassNames(col),
                col === SERVICIO_COL ? "servicio-wrap-cell" : "",
              ]
                .join(" ")
                .trim()}
            >
              {content || "-"}
            </td>
          );
        })}

        <td className="acciones">
          <button
            type="button"
            className="cliente-ver-btn cliente-group-ver-btn"
            onClick={() => toggleClienteGroup(clienteGrupo.key)}
          >
            {isOpen ? "Ocultar" : "Ver"}
          </button>
        </td>
      </tr>
    );
  };

  const renderClientePrincipalRow = (grupo) => {
    const isOpen = !!expandedClientes[grupo.key];
    const rowsQueSuman = grupo.rows.filter(estadoSumaEnPrincipal);
    const fechaCierreAutomaticaPrincipal = getFechaCierrePrincipalAutomatica(grupo);
    const tieneHijosAsignados = (grupo.rows || []).length > 0;
    const tieneHijosQueSuman = rowsQueSuman.length > 0;
    const totals = tieneHijosAsignados
      ? grupo.totals
      : getPrincipalOwnTotals(grupo.principalRow);

    return (
      <tr
        key={grupo.key}
        className={`cliente-principal-row ${
          grupo.sinPrincipal ? "sin-principal-row" : "principal-highlight-row"
        }`}
        data-cliente-key={grupo.key}
      >
        {tableColumnOrder.map((col, colIdx) => {
          const isLong = isObservationsCol(col);

          let content = grupo.principalRow && !grupo.sinPrincipal
            ? col === "observaciones"
              ? "-"
              : isLong
              ? renderLongTextCell(grupo.principalRow?.[col])
              : formatCell(col, grupo.principalRow?.[col])
            : "-";

          if (col === "id") {
            content = (
              <div className="principal-id-box">
                <button
                  type="button"
                  className="cliente-toggle-btn"
                  onClick={() => toggleClienteGroup(grupo.key)}
                  title={isOpen ? "Ocultar sub oportunidades" : "Ver sub oportunidades"}
                >
                  {isOpen ? "−" : "+"}
                </button>
                <strong>{grupo.codigo_control}</strong>
              </div>
            );
          }

          if (col === CLIENTE_COL) {
            content = (
              <div className="cliente-principal-info">
                <strong>{grupo.cliente}</strong>
                <span>
                  {grupo.rows.length} sub oportunidad{grupo.rows.length === 1 ? "" : "es"}
                </span>
                <small>
                  {grupo.sinPrincipal
                    ? "Pendientes por asignar a una oportunidad principal"
                    : tieneHijosQueSuman
                    ? `${totals.cantidadValidas} suma${totals.cantidadValidas === 1 ? "" : "n"} por estado OT/GANADA`
                    : tieneHijosAsignados && totals.modoSuma === "VALORES_ASOCIADOS"
                    ? `${totals.cantidadValidas} asociada${totals.cantidadValidas === 1 ? "" : "s"} con valores`
                    : "Valor propio de la principal"}
                </small>
              </div>
            );
          }

          if (col === SERVICIO_COL) {
            content = grupo.sinPrincipal
              ? "SIN PRINCIPAL / PENDIENTES DE ASIGNAR"
              : renderMultilineTextCell(grupo.principalRow?.servicio || "OPORTUNIDAD PRINCIPAL");
          }

          if (col === "estado_oferta") {
            content = grupo.sinPrincipal
              ? "SIN PRINCIPAL"
              : formatCell(col, getPrincipalEstadoValue(grupo, col));
          }

          if (col === "resultado_oferta") {
            content = grupo.sinPrincipal
              ? "-"
              : formatCell(col, getPrincipalEstadoValue(grupo, col));
          }

          if (col === "estado_ot" || col === "estado_proyecto") {
            content = grupo.sinPrincipal
              ? "-"
              : formatCell(col, getPrincipalEstadoValue(grupo, col));
          }

          if (col === "otc") {
            content = totals.totalOtc === "" ? "-" : formatCell("otc", totals.totalOtc);
          }

          if (col === "mrc") {
            content = totals.totalMrc === "" ? "-" : formatCell("mrc", totals.totalMrc);
          }

          if (col === "mrc_normalizado") {
            content =
              totals.mrcNormalizado === ""
                ? "-"
                : formatCell("mrc_normalizado", totals.mrcNormalizado);
          }

          if (col === "valor_oferta_claro") {
            content =
              totals.valorComercial === ""
                ? "-"
                : formatCell("valor_oferta_claro", totals.valorComercial);
          }

          if (isDateCol(col)) {
            const principalDateValue = getPrincipalDateValue(grupo, col);

            content =
              grupo.sinPrincipal || !principalDateValue
                ? "-"
                : toDisplayDateDDMMYYYY(principalDateValue);
          }

          if (col === "num_ot") {
            content = tieneHijosQueSuman
              ? `${rowsQueSuman.length} OT válidas`
              : grupo.principalRow && !grupo.sinPrincipal
              ? formatCell(col, grupo.principalRow?.[col])
              : "-";
          }

          if (
            grupo.principalRow &&
            !grupo.sinPrincipal &&
            PRINCIPAL_EDITABLE_COLS.has(col) &&
            sameId(editing.rowId, grupo.principalRow?.id) &&
            editing.col === col
          ) {
            content = renderEditorCell(grupo.principalRow, col);
          }

          return (
            <td
              key={`principal-${grupo.key}-${col}-${colIdx}`}
              onDoubleClick={() => {
                if (!grupo.principalRow || grupo.sinPrincipal) return;
                if (!PRINCIPAL_EDITABLE_COLS.has(col)) return;
                if (col === "observaciones") return;

                if (isLong) {
                  return editLongText(grupo.principalRow.id, col);
                }

                startEdit(grupo.principalRow, col);
              }}
              className={[
                getColumnClassNames(col),
                isLong ? "obs-col" : "",
                col === SERVICIO_COL ? "servicio-wrap-cell" : "",
                PRINCIPAL_EDITABLE_COLS.has(col) ? "principal-editable-cell" : "",
                sameId(editing.rowId, grupo.principalRow?.id) && editing.col === col ? "editing" : "",
                ["otc", "mrc", "mrc_normalizado", "valor_oferta_claro"].includes(col)
                  ? "principal-total-cell"
                  : "",
              ]
                .join(" ")
                .trim()}
              title={
                PRINCIPAL_EDITABLE_COLS.has(col)
                  ? "Doble clic para editar este campo en la oportunidad principal"
                  : undefined
              }
            >
              {content}
            </td>
          );
        })}

        <td className="acciones">
          <div className="op-actions principal-row-actions">
            <button
              type="button"
              className="cliente-ver-btn"
              onClick={() => toggleClienteGroup(grupo.key)}
            >
              {isOpen ? "Ocultar" : "Ver"}
            </button>

            {!grupo.sinPrincipal && grupo.principalRow?.id && (
              <button
                type="button"
                className="op-action-btn op-action-remove-principal"
                onClick={() => quitarPrincipalAvanzado(grupo)}
                disabled={loading}
                title="Quitar esta oportunidad como principal y reasignar sus OTs"
              >
                Quitar principal
              </button>
            )}

            {!grupo.sinPrincipal && grupo.principalRow?.id && (
              <button
                type="button"
                className="op-action-btn op-action-delete"
                onClick={() => eliminarOportunidad(grupo.principalRow, grupo)}
                disabled={loading}
                title="Eliminar oportunidad principal duplicada por error"
              >
                Eliminar
              </button>
            )}
          </div>
        </td>
      </tr>
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

      <datalist id="categoria-perdida-list">
        {CATEGORIA_PERDIDA_OPTS.map((categoria) => (
          <option key={categoria} value={categoria} />
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

        <div className="top-close-filter-panel">
          <div className="top-close-filter-title">
            Filtro fecha cierre oportunidad
          </div>

          <label>
            Desde
            <input
              type="date"
              value={filtroCierreDesde}
              onChange={(e) => setFiltroCierreDesde(e.target.value)}
            />
          </label>

          <label>
            Hasta
            <input
              type="date"
              value={filtroCierreHasta}
              onChange={(e) => setFiltroCierreHasta(e.target.value)}
            />
          </label>

          {(filtroCierreDesde || filtroCierreHasta) && (
            <button
              type="button"
              className="top-close-filter-clear"
              onClick={() => {
                setFiltroCierreDesde("");
                setFiltroCierreHasta("");
              }}
            >
              Limpiar fecha
            </button>
          )}
        </div>

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
            className="upload-btn"
            type="button"
            onClick={() => setOpenResumenCerradas(true)}
            disabled={loading}
          >
            Resumen cerradas
          </button>

          <button
            className="upload-btn"
            type="button"
            onClick={expandAllClienteGroups}
            disabled={loading || !oportunidadesAgrupadas.length}
          >
            Expandir grupos
          </button>

          <button
            className="clear-filters-btn"
            type="button"
            onClick={collapseAllClienteGroups}
            disabled={loading || !oportunidadesAgrupadas.length}
          >
            Contraer grupos
          </button>

          <button
            className="clear-filters-btn"
            onClick={handleClearFilters}
            disabled={
              loading ||
              (!Object.values(filters).some((vals) => Array.isArray(vals) && vals.length > 0) &&
                !filtroCierreDesde &&
                !filtroCierreHasta)
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
              {tableColumnOrder.map((col, idx) => (
                <th key={`header-${col}-${idx}`} className={getColumnClassNames(col)}>
                  {COLUMN_LABELS[col] || col.replace(/_/g, " ").toUpperCase()}
                </th>
              ))}
              <th>ACCIONES</th>
            </tr>

            <tr className="filtros-columnas">
              {tableColumnOrder.map((col, idx) => (
                <th key={`filter-${col}-${idx}`} className={getColumnClassNames(col)}>
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

                {displayColumnOrder.map((col, idx) => (
                  <td
                    key={`new-${col}-${idx}`}
                    className={[
                      getColumnClassNames(col),
                      col === SERVICIO_COL ? "servicio-wrap-cell" : "",
                    ].join(" ").trim()}
                  >
                    {renderNewRowCell(col)}
                  </td>
                ))}

                <td className="acciones">
                  <button className="btn-save" onClick={() => saveNewRow(false)} disabled={loading}>
                    Guardar
                  </button>
                  <button
                    className="btn-save btn-save-principal"
                    onClick={() => saveNewRow(true)}
                    disabled={loading}
                    title="Crear la fila y marcarla como oportunidad principal sin copiar información"
                  >
                    Guardar principal
                  </button>
                  <button className="btn-cancel" onClick={() => setNewRow(null)} disabled={loading}>
                    Cancelar
                  </button>
                </td>
              </tr>
            )}

            {clientesAgrupados.map((clienteGrupo) => (
              <React.Fragment key={`cliente-${clienteGrupo.key}`}>
                {renderClienteGroupRow(clienteGrupo)}

                {expandedClientes[clienteGrupo.key] &&
                  clienteGrupo.grupos.map((grupo) => (
                    <React.Fragment key={`grupo-${grupo.key}`}>
                      {renderClientePrincipalRow(grupo)}

                      {expandedClientes[grupo.key] &&
                        grupo.rows.map((row, i) => renderOpportunityRow(row, i))}
                    </React.Fragment>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <button className="floating-add-btn" onClick={addRow} disabled={loading}>
        +
      </button>

      <ModalResumenCerradas
        isOpen={openResumenCerradas}
        onClose={() => setOpenResumenCerradas(false)}
        rows={resumenCerradas}
      />

      <ModalCategoriaPerdida
        isOpen={openCategoriaModal}
        onClose={() => setOpenCategoriaModal(false)}
        categoriesMap={CATEGORIA_SUBCATEGORIA}
      />
    </div>
  );
}
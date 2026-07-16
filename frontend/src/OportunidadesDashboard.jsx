import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Select, { components } from "react-select";
import GraficoCantidadGanadas from "./GraficoCantidadGanadas";
import GraficoActivasCerradas from "./GraficoActivasCerradas";
import ResumenCalificacion from "./ResumenCalificacion";
import "./DashboardOportunidades.css";
import { jfetch } from "./lib/api";
import ModalWinRate from "./ModalWinRate";
import ModalDetalleConsultoria from "./ModalDetalleConsultoria";
import DetalleComercial from "./DetalleComercial";
import DetalleOTS from "./DetalleOTS";
import DetallePerdidas from "./DetallePerdidas";

/* ===================== React-Select styles ===================== */
const rsStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 10,
    borderColor: state.isFocused ? "#cbd5e1" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(148, 163, 184, .25)" : "none",
    ":hover": { borderColor: "#cbd5e1" },
    fontSize: 13,
  }),
  valueContainer: (base) => ({ ...base, padding: "0 10px" }),
  multiValue: (base) => ({ ...base, borderRadius: 999 }),
  multiValueLabel: (base) => ({ ...base, fontWeight: 800, fontSize: 12 }),
  placeholder: (base) => ({ ...base, color: "#64748b", fontWeight: 700 }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menu: (base) => ({ ...base, zIndex: 9999 }),
  option: (base) => ({ ...base, display: "flex", alignItems: "center", gap: 10 }),
};

const portalTarget = typeof document !== "undefined" ? document.body : null;

function CheckboxOption(props) {
  const selected = props.isSelected;
  const disabled = props.isDisabled;

  return (
    <components.Option {...props}>
      <span className={`rs-check ${selected ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}>
        {selected ? "✓" : ""}
      </span>
      <span className="rs-label">{props.label}</span>
    </components.Option>
  );
}

/* ===================== Normalizadores de texto ===================== */
function normKeyForMatch(v) {
  let s = String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  s = s.replace(/\b0TP\b/g, "OTP").replace(/\b0TE\b/g, "OTE").replace(/\b0TL\b/g, "OTL");
  return s;
}

function displayLabel(v) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
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

/* ===================== Exclusiones ===================== */
const EXCLUDE_SET = new Set(
  [
    "OTP",
    "OTE",
    "OTL",
    "0TP",
    "0TE",
    "0TL",
    "EJECUCION CONTRACTUAL",
    "N/A",
  ].map(normKeyForMatch)
);

function isExcludedLabel(raw) {
  const k = normKeyForMatch(raw);
  if (!k) return false;
  if (EXCLUDE_SET.has(k)) return true;

  for (const x of EXCLUDE_SET) {
    if (k.includes(x)) return true;
  }

  return false;
}

/* ===================== Money helpers ===================== */
const nfMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function toNumberSmart(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/COP/gi, "")
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

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n) {
  return nfMoney.format(n || 0);
}

function readMoney(row, keys) {
  for (const k of keys) {
    const v = row?.[k];

    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return toNumberSmart(v);
    }
  }

  return 0;
}


/* ===================== Principales / asociadas ===================== */
const TIPO_PRINCIPAL = "PRINCIPAL";
const TIPO_SUBOPORTUNIDAD = "SUBOPORTUNIDAD";
const ESTADOS_SUMAN_PRINCIPAL = new Set(["OT", "GANADA"].map(normKeyForMatch));

function normalizeTipoOportunidad(value) {
  const normalized = normKeyForMatch(value);

  if (["PRINCIPAL", "PADRE", "MASTER"].includes(normalized)) {
    return TIPO_PRINCIPAL;
  }

  return TIPO_SUBOPORTUNIDAD;
}

function estadoSumaEnPrincipal(row) {
  const estadoOferta = normKeyForMatch(row?.estado_oferta);
  const resultadoOferta = normKeyForMatch(row?.resultado_oferta);

  return (
    ESTADOS_SUMAN_PRINCIPAL.has(estadoOferta) ||
    ESTADOS_SUMAN_PRINCIPAL.has(resultadoOferta)
  );
}

function rowHasMoney(row) {
  return (
    readMoney(row, ["otc", "otr", "OTC", "OTR"]) !== 0 ||
    readMoney(row, ["mrc", "MRC"]) !== 0 ||
    readMoney(row, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"]) !== 0
  );
}

function sumMoney(rows, keys) {
  return (rows || []).reduce((acc, row) => acc + readMoney(row, keys), 0);
}

function getAssociatedRowsForTotals(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rowsPorEstado = safeRows.filter(estadoSumaEnPrincipal);

  // Regla principal: suma OT/GANADA.
  if (rowsPorEstado.length > 0) return rowsPorEstado;

  // Respaldo: si ninguna asociada tiene OT/GANADA pero sí tiene valores,
  // también suma para que la principal no quede en blanco en dashboard.
  return safeRows.filter(rowHasMoney);
}

function sortAssociatedRows(a, b) {
  const fechaA = String(a?.fecha_creacion || a?.fecha_asignacion || "");
  const fechaB = String(b?.fecha_creacion || b?.fecha_asignacion || "");

  if (fechaA !== fechaB) return fechaB.localeCompare(fechaA);

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "es", {
    numeric: true,
  });
}

function firstTextFromAssociated(rows, keys) {
  const ordered = [...(rows || [])].sort(sortAssociatedRows);

  for (const row of ordered) {
    for (const key of keys) {
      const value = String(row?.[key] ?? "").trim();
      if (value) return value;
    }
  }

  return "";
}

function getClienteGrupoKey(row) {
  return normKeyForMatch(row?.cliente_grupo_key || row?.nombre_cliente);
}

function buildPrincipalDashboardRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const principales = safeRows.filter(
    (row) => normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL && row?.id
  );

  const principalesPorId = new Map(
    principales.map((principal) => [String(principal.id), principal])
  );

  const principalesPorCliente = new Map();

  principales.forEach((principal) => {
    const clienteKey = getClienteGrupoKey(principal);
    if (!clienteKey) return;
    if (!principalesPorCliente.has(clienteKey)) principalesPorCliente.set(clienteKey, []);
    principalesPorCliente.get(clienteKey).push(principal);
  });

  const hijosPorPrincipal = new Map();
  const hijosSinPrincipalPorCliente = new Map();

  safeRows.forEach((row) => {
    if (normalizeTipoOportunidad(row?.tipo_oportunidad) === TIPO_PRINCIPAL) return;

    const padreId = row?.oportunidad_padre_id;

    if (padreId && principalesPorId.has(String(padreId))) {
      const key = String(padreId);
      if (!hijosPorPrincipal.has(key)) hijosPorPrincipal.set(key, []);
      hijosPorPrincipal.get(key).push(row);
      return;
    }

    const clienteKey = getClienteGrupoKey(row);
    if (!clienteKey) return;

    if (!hijosSinPrincipalPorCliente.has(clienteKey)) hijosSinPrincipalPorCliente.set(clienteKey, []);
    hijosSinPrincipalPorCliente.get(clienteKey).push(row);
  });

  return principales.map((principal) => {
    const clienteKey = getClienteGrupoKey(principal);
    const principalesDelCliente = clienteKey ? principalesPorCliente.get(clienteKey) || [] : [];

    // Si el cliente tiene una sola principal, las OTs sin principal se consolidan ahí
    // para que no desaparezcan del dashboard. Si tiene varias principales, no se asignan
    // automáticamente para evitar mezclar servicios distintos.
    const hijosSinPrincipal = principalesDelCliente.length === 1
      ? hijosSinPrincipalPorCliente.get(clienteKey) || []
      : [];

    const hijos = [
      ...(hijosPorPrincipal.get(String(principal.id)) || []),
      ...hijosSinPrincipal,
    ].sort(sortAssociatedRows);

    const hijosVisibles = hijos.filter(mostrarEnDashboard);

    // Para valores consolidados se usan todas las asociadas del grupo.
    // mostrar_dashboard solo controla si la fila/OT se muestra, no si aporta al total.
    const hijosBase = hijos;
    const primeraOt = hijosBase[0] || null;

    const hijosParaSumar = getAssociatedRowsForTotals(hijosBase);
    const usarHijos = hijosParaSumar.length > 0;

    const otc = usarHijos
      ? sumMoney(hijosParaSumar, ["otc", "otr", "OTC", "OTR"])
      : readMoney(principal, ["otc", "otr", "OTC", "OTR"]);

    const mrc = usarHijos
      ? sumMoney(hijosParaSumar, ["mrc", "MRC"])
      : readMoney(principal, ["mrc", "MRC"]);

    const valorOfertaClaro = usarHijos
      ? sumMoney(hijosParaSumar, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"])
      : readMoney(principal, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"]);

    const mrcNormalizadoDirecto = readMoney(principal, ["mrc_normalizado", "mrcNormalizado", "MRC NORMALIZADO"]);
    const mrcNormalizado = usarHijos
      ? Number((mrc + otc / 12).toFixed(2))
      : mrcNormalizadoDirecto || Number((mrc + otc / 12).toFixed(2));

    const observacionAsociada = firstTextFromAssociated(hijosBase, ["observaciones", "OBSERVACIONES"]);
    const seguimientoAsociado = firstTextFromAssociated(hijosBase, ["seguimiento_ot", "SEGUIMIENTO OT"]);

    const estadoOfertaAsociado = primeraOt?.estado_oferta || "";
    const resultadoOfertaAsociado = primeraOt?.resultado_oferta || "";
    const estadoOtAsociado = primeraOt?.estado_ot || "";
    const estadoProyectoAsociado = primeraOt?.estado_proyecto || "";

    const visiblePorPrincipalOHijo = mostrarEnDashboard(principal) || hijosVisibles.length > 0;

    return {
      ...principal,
      __dashboard_principal_only: true,
      __dashboard_hijos: hijos,
      __dashboard_hijos_visibles: hijosVisibles,
      __dashboard_total_asociadas: hijos.length,
      __dashboard_asociadas_visibles: hijosVisibles.length,
      __dashboard_sin_principal_incluidas: hijosSinPrincipal.length,
      __dashboard_asociadas_suman: hijosParaSumar.length,
      __dashboard_principal_otc_original: readMoney(principal, ["otc", "otr", "OTC", "OTR"]),
      __dashboard_principal_mrc_original: readMoney(principal, ["mrc", "MRC"]),
      __dashboard_principal_valor_oferta_original: readMoney(principal, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"]),
      __dashboard_principal_mrc_normalizado_original: mrcNormalizadoDirecto,
      otc,
      mrc,
      mrc_normalizado: mrcNormalizado,
      valor_oferta_claro: valorOfertaClaro,
      estado_oferta: estadoOfertaAsociado || principal?.estado_oferta || "",
      resultado_oferta: resultadoOfertaAsociado || principal?.resultado_oferta || "",
      estado_ot: estadoOtAsociado || principal?.estado_ot || "",
      estado_proyecto: estadoProyectoAsociado || principal?.estado_proyecto || "",
      mostrar_dashboard: visiblePorPrincipalOHijo ? "SI" : "NO",
      observaciones: observacionAsociada || principal?.observaciones || "",
      seguimiento_ot: seguimientoAsociado || principal?.seguimiento_ot || "",
    };
  });
}

/* ===================== Pivot helpers ===================== */
function sumPivotRows(rows) {
  return (rows || []).reduce(
    (acc, r) => {
      acc.count += r.count || 0;
      acc.otc += r.otc || 0;
      acc.mrc += r.mrc || 0;
      return acc;
    },
    { count: 0, otc: 0, mrc: 0 }
  );
}

function buildPivot(rows, field, { skipBlank = true, excludeKeyFn = null } = {}) {
  const m = new Map();

  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const raw = String(r?.[field] ?? "").replace(/\u00A0/g, " ").trim();

    if (skipBlank && !raw) return;

    const key = normKeyForMatch(raw);
    if (!key) return;

    if (excludeKeyFn && excludeKeyFn(key, raw, r)) return;

    const prev = m.get(key) || {
      label: displayLabel(raw),
      count: 0,
      otc: 0,
      mrc: 0,
    };

    prev.count += 1;
    prev.otc += readMoney(r, ["otc", "otr", "OTC", "OTR"]);
    prev.mrc += readMoney(r, ["mrc", "MRC"]);

    m.set(key, prev);
  });

  const pivotRows = Array.from(m.values()).sort((a, b) => b.count - a.count);

  return { rows: pivotRows };
}

/* ===================== Filtros/query ===================== */
function toOptions(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => ({ value: v, label: String(v) }));
}

function valuesOf(sel) {
  return Array.isArray(sel) ? sel.map((o) => o.value) : [];
}

function toQuery(f) {
  const p = new URLSearchParams();
  const add = (k, arr) => (arr || []).forEach((v) => p.append(`${k}[]`, v));

  add("anio", valuesOf(f.anios));
  add("mes", valuesOf(f.meses));
  add("tipo", valuesOf(f.tipos));

  add("direccion_comercial", valuesOf(f.direccionComercial));
  add("gerencia_comercial", valuesOf(f.gerenciaComercial));
  add("nombre_cliente", valuesOf(f.cliente));

  add("estado_oferta", valuesOf(f.estadoOferta));
  add("resultado_oferta", valuesOf(f.resultadoOferta));

  add("fecha_acta_cierre_ot", valuesOf(f.fechaActaCierreOT));
  add("fecha_cierre_oportunidad", valuesOf(f.fechaCierreOportunidad));

  add("estado_ot", valuesOf(f.estadoOT));
  add("ultimo_mes", valuesOf(f.ultimoMes));
  add("calificacion_oportunidad", valuesOf(f.calificacion));

  const qs = p.toString();

  return qs ? `?${qs}` : "";
}

function selectedNormSet(sel) {
  return new Set(valuesOf(sel).map(normKeyForMatch).filter(Boolean));
}

function selectedRawSet(sel) {
  return new Set(valuesOf(sel).map((v) => String(v ?? "").slice(0, 10)).filter(Boolean));
}

function dashboardGroupRows(row) {
  return [
    row,
    ...((row?.__dashboard_hijos || []).filter(Boolean)),
  ];
}

function groupHasTextValue(row, field, selected) {
  const selectedSet = selectedNormSet(selected);
  if (selectedSet.size === 0) return true;

  return dashboardGroupRows(row).some((item) => {
    const value = normKeyForMatch(item?.[field]);
    return value && selectedSet.has(value);
  });
}

function groupHasDateValue(row, field, selected) {
  const selectedSet = selectedRawSet(selected);
  if (selectedSet.size === 0) return true;

  return dashboardGroupRows(row).some((item) => {
    const value = String(item?.[field] ?? "").slice(0, 10);
    return value && selectedSet.has(value);
  });
}

function groupMatchesYearMonth(row, anios, meses) {
  const years = new Set(valuesOf(anios).map((v) => String(v)));
  const months = new Set(valuesOf(meses).map((v) => String(Number(v))));

  if (years.size === 0 && months.size === 0) return true;

  return dashboardGroupRows(row).some((item) => {
    const iso = String(item?.fecha_creacion ?? "").slice(0, 10);
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;

    const yearOk = years.size === 0 || years.has(String(Number(m[1])));
    const monthOk = months.size === 0 || months.has(String(Number(m[2])));

    return yearOk && monthOk;
  });
}

function groupMatchesTipo(row, tipos) {
  const selected = selectedNormSet(tipos);
  if (selected.size === 0) return true;

  return dashboardGroupRows(row).some((item) => {
    const estado = normKeyForMatch(item?.estado_oferta);
    const resultado = normKeyForMatch(item?.resultado_oferta);

    if (selected.has("GANADA") && (estado === "GANADA" || resultado === "GANADA")) return true;
    if (selected.has("ACTIVA") && ESTADOS_ACTIVOS_N.has(estado)) return true;
    if ((selected.has("CERRADA") || selected.has("CERRADO")) && ESTADOS_CERRADOS_N.has(estado)) return true;

    return false;
  });
}

function matchesDashboardFilters(row, filtros) {
  if (!groupMatchesYearMonth(row, filtros.anios, filtros.meses)) return false;
  if (!groupMatchesTipo(row, filtros.tipos)) return false;

  if (!groupHasTextValue(row, "direccion_comercial", filtros.direccionComercial)) return false;
  if (!groupHasTextValue(row, "gerencia_comercial", filtros.gerenciaComercial)) return false;
  if (!groupHasTextValue(row, "nombre_cliente", filtros.cliente)) return false;

  if (!groupHasTextValue(row, "estado_oferta", filtros.estadoOferta)) return false;
  if (!groupHasTextValue(row, "resultado_oferta", filtros.resultadoOferta)) return false;
  if (!groupHasTextValue(row, "estado_ot", filtros.estadoOT)) return false;
  if (!groupHasTextValue(row, "ultimo_mes", filtros.ultimoMes)) return false;
  if (!groupHasTextValue(row, "calificacion_oportunidad", filtros.calificacion)) return false;

  if (!groupHasDateValue(row, "fecha_acta_cierre_ot", filtros.fechaActaCierreOT)) return false;
  if (!groupHasDateValue(row, "fecha_cierre_oportunidad", filtros.fechaCierreOportunidad)) return false;

  return true;
}

function rowHasTextValue(row, field, selected) {
  const selectedSet = selectedNormSet(selected);
  if (selectedSet.size === 0) return true;

  const value = normKeyForMatch(row?.[field]);
  return value && selectedSet.has(value);
}

function rowHasDateValue(row, field, selected) {
  const selectedSet = selectedRawSet(selected);
  if (selectedSet.size === 0) return true;

  const value = String(row?.[field] ?? "").slice(0, 10);
  return value && selectedSet.has(value);
}

function rowMatchesYearMonth(row, anios, meses) {
  const years = new Set(valuesOf(anios).map((v) => String(v)));
  const months = new Set(valuesOf(meses).map((v) => String(Number(v))));

  if (years.size === 0 && months.size === 0) return true;

  const iso = String(row?.fecha_creacion ?? "").slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;

  const yearOk = years.size === 0 || years.has(String(Number(m[1])));
  const monthOk = months.size === 0 || months.has(String(Number(m[2])));

  return yearOk && monthOk;
}

function rowMatchesTipo(row, tipos) {
  const selected = selectedNormSet(tipos);
  if (selected.size === 0) return true;

  const estado = normKeyForMatch(row?.estado_oferta);
  const resultado = normKeyForMatch(row?.resultado_oferta);

  if (selected.has("GANADA") && (estado === "GANADA" || resultado === "GANADA")) return true;
  if (selected.has("ACTIVA") && ESTADOS_ACTIVOS_N.has(estado)) return true;
  if ((selected.has("CERRADA") || selected.has("CERRADO")) && ESTADOS_CERRADOS_N.has(estado)) return true;

  return false;
}

function rowMatchesDashboardFilters(row, filtros) {
  if (!rowMatchesYearMonth(row, filtros.anios, filtros.meses)) return false;
  if (!rowMatchesTipo(row, filtros.tipos)) return false;

  if (!rowHasTextValue(row, "direccion_comercial", filtros.direccionComercial)) return false;
  if (!rowHasTextValue(row, "gerencia_comercial", filtros.gerenciaComercial)) return false;
  if (!rowHasTextValue(row, "nombre_cliente", filtros.cliente)) return false;

  if (!rowHasTextValue(row, "estado_oferta", filtros.estadoOferta)) return false;
  if (!rowHasTextValue(row, "resultado_oferta", filtros.resultadoOferta)) return false;
  if (!rowHasTextValue(row, "estado_ot", filtros.estadoOT)) return false;
  if (!rowHasTextValue(row, "ultimo_mes", filtros.ultimoMes)) return false;
  if (!rowHasTextValue(row, "calificacion_oportunidad", filtros.calificacion)) return false;

  if (!rowHasDateValue(row, "fecha_acta_cierre_ot", filtros.fechaActaCierreOT)) return false;
  if (!rowHasDateValue(row, "fecha_cierre_oportunidad", filtros.fechaCierreOportunidad)) return false;

  return true;
}

function sameDashboardRowId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function getFilteredDashboardGroupRows(row, filtros) {
  const rows = dashboardGroupRows(row).filter(Boolean);

  // Importante:
  // no se filtra por mostrar_dashboard en las asociadas al recalcular valores.
  // Si la principal es visible, sus OTs asociadas deben aportar al total cuando cumplen los filtros.
  return rows.filter((item) => rowMatchesDashboardFilters(item, filtros));
}

function rebuildDashboardRowForFilters(row, filtros) {
  if (!matchesDashboardFilters(row, filtros)) return null;

  const hijosTotales = [...(row?.__dashboard_hijos || [])].filter(Boolean);
  const principalMatch = rowMatchesDashboardFilters(row, filtros);

  /*
    Regla para que el dashboard cuadre con el Excel de Oportunidades:
    - Si la fila principal consolidada cumple los filtros, se suman TODAS sus OTs asociadas.
      Ejemplo: si la principal aparece por el filtro del periodo, no se debe sacar una OT antigua
      porque hace parte de esa principal.
    - Si la principal no cumple, pero una OT sí cumple el filtro, se suman solo esas OTs filtradas.
  */
  const hijosFiltrados = (
    principalMatch
      ? hijosTotales
      : hijosTotales.filter((item) => rowMatchesDashboardFilters(item, filtros))
  ).sort(sortAssociatedRows);

  const matchingRows = [
    row,
    ...hijosFiltrados,
  ];

  if (!matchingRows.length) return null;

  const hijosParaSumar = getAssociatedRowsForTotals(hijosFiltrados);
  const usarHijos = hijosParaSumar.length > 0;

  const otc = usarHijos
    ? sumMoney(hijosParaSumar, ["otc", "otr", "OTC", "OTR"])
    : readMoney(row, ["otc", "otr", "OTC", "OTR"]);

  const mrc = usarHijos
    ? sumMoney(hijosParaSumar, ["mrc", "MRC"])
    : readMoney(row, ["mrc", "MRC"]);

  const valorOfertaClaro = usarHijos
    ? sumMoney(hijosParaSumar, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"])
    : readMoney(row, ["valor_oferta_claro", "valorOfertaClaro", "VALOR OFERTA CLARO"]);

  const mrcNormalizadoDirecto =
    readMoney(row, ["mrc_normalizado", "mrcNormalizado", "MRC NORMALIZADO"]);

  const mrcNormalizado = usarHijos
    ? Number((mrc + otc / 12).toFixed(2))
    : mrcNormalizadoDirecto || Number((mrc + otc / 12).toFixed(2));

  const primeraOtFiltrada = hijosFiltrados[0] || null;
  const observacionFiltrada = firstTextFromAssociated(hijosFiltrados, ["observaciones", "OBSERVACIONES"]);
  const seguimientoFiltrado = firstTextFromAssociated(hijosFiltrados, ["seguimiento_ot", "SEGUIMIENTO OT"]);

  return {
    ...row,
    __dashboard_hijos_filtrados: hijosFiltrados,
    __dashboard_total_asociadas_filtradas: hijosFiltrados.length,
    __dashboard_asociadas_suman_filtradas: hijosParaSumar.length,
    __dashboard_suma_filtrada: true,
    otc,
    mrc,
    mrc_normalizado: mrcNormalizado,
    valor_oferta_claro: valorOfertaClaro,
    estado_oferta: primeraOtFiltrada?.estado_oferta || row?.estado_oferta || "",
    resultado_oferta: primeraOtFiltrada?.resultado_oferta || row?.resultado_oferta || "",
    estado_ot: primeraOtFiltrada?.estado_ot || row?.estado_ot || "",
    estado_proyecto: primeraOtFiltrada?.estado_proyecto || row?.estado_proyecto || "",
    observaciones: observacionFiltrada || row?.observaciones || "",
    seguimiento_ot: seguimientoFiltrado || row?.seguimiento_ot || "",
  };
}

function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

/* ===================== Sets de KPIs ===================== */
const ESTADOS_ACTIVOS_N = new Set(
  [
    "EN PROCESO",
    "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
    "EN ELABORACION",
    "ENTREGA COMERCIAL",
    "EJECUCION OPERACION",
    "EN ESPERA DEL RFI / RFP",
    "RFI PRESENTADO",
    "SUSPENDIDA",
  ].map(normKeyForMatch)
);

const ESTADOS_CERRADOS_N = new Set(
  [
    "GANADA",
    "OT",
    "PERDIDA",
    "DECLINADA",
    "PERDIDA - SIN FEEDBACK",
    "RFP PRESENTADO",
  ].map(normKeyForMatch)
);

const ESTADO_RESULTADO_FORZADO = {
  "EN ESPERA DEL RFI / RFP": "EN ESPERA DEL CLIENTE",
  "RFI PRESENTADO": "EN ESPERA DEL CLIENTE",
  SUSPENDIDA: "EN ESPERA DEL CLIENTE",
};

const ESTADOS_TOTAL_KPI_N = new Set([...ESTADOS_ACTIVOS_N, ...ESTADOS_CERRADOS_N]);

function buildEstadoBreakdown(rows, allowedStates) {
  const map = new Map();

  for (const op of Array.isArray(rows) ? rows : []) {
    const raw = op?.estado_oferta ?? "";

    if (isExcludedLabel(raw)) continue;

    const estadoN = normKeyForMatch(raw);

    if (allowedStates && !allowedStates.has(estadoN)) continue;

    const prev = map.get(estadoN) || {
      key: estadoN,
      label: displayLabel(raw),
      count: 0,
    };

    prev.count += 1;
    map.set(estadoN, prev);
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label, "es", { sensitivity: "base" })
  );
}

/* ===================== Observaciones ===================== */
const OBS_DATE_TOKEN = /(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/g;

function normObsText(v) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .trim();
}

function splitObservacionesByDate(raw) {
  const text = normObsText(raw);
  if (!text) return [];

  const prepared = text.replace(OBS_DATE_TOKEN, "\n$1");

  const lines = prepared
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];

  for (const line of lines) {
    const m = line.match(
      /^(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]?\s*(.*)$/
    );

    if (m) {
      out.push({ date: m[1], text: (m[2] || "").trim() || "-" });
    } else {
      out.push({ date: null, text: line });
    }
  }

  const merged = [];

  for (const it of out) {
    const last = merged[merged.length - 1];

    if (!it.date && last && last.date) {
      last.text = `${last.text}\n${it.text}`.trim();
    } else {
      merged.push({ ...it });
    }
  }

  return merged;
}

function renderObservacionesCell(value) {
  const items = splitObservacionesByDate(value);

  if (!items.length) return "-";

  return (
    <div className="obs-box">
      {items.map((it, idx) => (
        <div key={idx} className={`obs-item ${it.date ? "has-date" : "no-date"}`}>
          <div className="obs-date">{it.date ? it.date : "SIN FECHA"}</div>

          <div className="obs-text">
            {it.text.split("\n").map((p, i) => (
              <div key={i}>{p}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===================== Component ===================== */
export default function DashboardOportunidades() {
  const [activeTab, setActiveTab] = useState("resumen");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [openWinRateModal, setOpenWinRateModal] = useState(false);
  const [openDetalleConsultoriaModal, setOpenDetalleConsultoriaModal] = useState(false);

  const [filtros, setFiltros] = useState({
    anios: [],
    meses: [],
    tipos: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    fechaActaCierreOT: [],
    fechaCierreOportunidad: [],
    estadoOT: [],
    ultimoMes: [],
    calificacion: [],
  });

  const [opciones, setOpciones] = useState({
    anios: [],
    meses: [],
    tipos: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    fechaActaCierreOT: [],
    fechaCierreOportunidad: [],
    estadoOT: [],
    ultimoMes: [],
    calificacion: [],
  });

  const filtrosDebounced = useDebouncedValue(filtros, 400);

  const dataBase = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const dataDashboard = useMemo(() => {
    return buildPrincipalDashboardRows(dataBase).filter(mostrarEnDashboard);
  }, [dataBase]);

  const dataFiltrada = useMemo(() => {
    return dataDashboard
      .map((op) => rebuildDashboardRowForFilters(op, filtrosDebounced))
      .filter(Boolean)
      .filter(
        (op) =>
          !isExcludedLabel(op?.estado_oferta ?? "") &&
          !isExcludedLabel(op?.resultado_oferta ?? "")
      );
  }, [dataDashboard, filtrosDebounced]);

  function normalizeOportunidadRow(row) {
    const estado = displayLabel(row?.estado_oferta ?? "");
    const resultadoOriginal = displayLabel(row?.resultado_oferta ?? "");
    const resultadoForzado = ESTADO_RESULTADO_FORZADO[estado];

    return {
      ...row,
      estado_oferta: estado || row?.estado_oferta || "",
      resultado_oferta: resultadoForzado || resultadoOriginal || row?.resultado_oferta || "",
    };
  }

  function mergeOptions(base, extras) {
    const map = new Map();

    [...(base || []), ...(extras || []).map((v) => ({ value: v, label: v }))].forEach(
      (opt) => {
        const key = String(opt?.value ?? "").trim();

        if (!key) return;

        if (!map.has(key)) {
          map.set(key, { value: key, label: String(opt?.label ?? key) });
        }
      }
    );

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "es", { sensitivity: "base" })
    );
  }

  const fetchFilters = async () => {
    const res = await jfetch(`/oportunidades/filters`);

    if (!res.ok) throw new Error("filters");

    const json = await res.json();

    setOpciones({
      anios: toOptions(json.anios),
      meses: toOptions(json.meses),
      tipos: toOptions(json.tipos),
      direccionComercial: toOptions(json.direccion_comercial),
      gerenciaComercial: toOptions(json.gerencia_comercial),
      cliente: toOptions(json.nombre_cliente),
      estadoOferta: mergeOptions(toOptions(json.estado_oferta), [
        "EN ESPERA DEL RFI / RFP",
        "RFI PRESENTADO",
        "SUSPENDIDA",
      ]),
      resultadoOferta: mergeOptions(toOptions(json.resultado_oferta), [
        "EN ESPERA DEL CLIENTE",
      ]),
      fechaActaCierreOT: toOptions(json.fecha_acta_cierre_ot),
      fechaCierreOportunidad: toOptions(json.fecha_cierre_oportunidad),
      estadoOT: toOptions(json.estado_ot),
      ultimoMes: toOptions(json.ultimo_mes),
      calificacion: toOptions(json.calificacion_oportunidad),
    });
  };

  const fetchData = async (current) => {
    setLoading(true);

    try {
      // Importante: el dashboard necesita principales + OTs completas.
      // No se mandan filtros al backend porque rompería la relación padre/hijo.
      // Los filtros se aplican después de consolidar las principales en frontend.
      const res = await jfetch(`/oportunidades`);

      if (!res.ok) throw new Error("data");

      const json = await res.json();

      const rows = Array.isArray(json) ? json.map(normalizeOportunidadRow) : [];

      setData(rows);
    } catch (e) {
      Swal.fire("Error", "No se pudo consultar oportunidades", "error");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchFilters();
        await fetchData(filtros);
      } catch (e) {
        Swal.fire("Error", "No se pudo inicializar", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los filtros se aplican localmente sobre la data ya consolidada.
  // No se vuelve a consultar /oportunidades al cambiar filtros para no romper la relación principal/OT.


  const tablaEstadoOferta = useMemo(() => {
    return buildPivot(dataFiltrada, "estado_oferta", {
      excludeKeyFn: (_key, raw) => isExcludedLabel(raw),
    });
  }, [dataFiltrada]);

  const totEstadoOferta = useMemo(() => {
    return sumPivotRows(tablaEstadoOferta.rows);
  }, [tablaEstadoOferta.rows]);

  const tablaResultadoOferta = useMemo(() => {
    return buildPivot(dataFiltrada, "resultado_oferta", {
      excludeKeyFn: (_key, raw, row) =>
        isExcludedLabel(row?.estado_oferta ?? "") || isExcludedLabel(raw),
    });
  }, [dataFiltrada]);

  const totResultadoOferta = useMemo(() => {
    return sumPivotRows(tablaResultadoOferta.rows);
  }, [tablaResultadoOferta.rows]);

  const kpis = useMemo(() => {
    const rows = Array.isArray(dataFiltrada) ? dataFiltrada : [];
    let activas = 0;
    let cerradas = 0;
    let ganadas = 0;

    const GANADA_N = normKeyForMatch("GANADA");

    for (const op of rows) {
      const estadoRaw = op?.estado_oferta ?? "";

      if (isExcludedLabel(estadoRaw)) continue;

      const estadoN = normKeyForMatch(estadoRaw);

      if (ESTADOS_ACTIVOS_N.has(estadoN)) {
        activas++;
      } else if (ESTADOS_CERRADOS_N.has(estadoN)) {
        cerradas++;
      }

      if (estadoN === GANADA_N) {
        ganadas++;
      }
    }

    const total = activas + cerradas;

    return {
      total,
      activas,
      cerradas,
      ganadas,
      porcentajeGanadas: total ? (ganadas / total) * 100 : 0,
    };
  }, [dataFiltrada]);

  const kpiEstadosInfo = useMemo(() => {
    return {
      total: buildEstadoBreakdown(dataFiltrada, ESTADOS_TOTAL_KPI_N),
      activas: buildEstadoBreakdown(dataFiltrada, ESTADOS_ACTIVOS_N),
      cerradas: buildEstadoBreakdown(dataFiltrada, ESTADOS_CERRADOS_N),
    };
  }, [dataFiltrada]);

  const limpiar = () => {
    setFiltros({
      anios: [],
      meses: [],
      tipos: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      estadoOferta: [],
      resultadoOferta: [],
      fechaActaCierreOT: [],
      fechaCierreOportunidad: [],
      estadoOT: [],
      ultimoMes: [],
      calificacion: [],
    });
  };

  const selectCommon = {
    isMulti: true,
    closeMenuOnSelect: false,
    hideSelectedOptions: false,
    styles: rsStyles,
    menuPortalTarget: portalTarget,
    getOptionValue: (o) => String(o.value),
    getOptionLabel: (o) => String(o.label),
    components: { Option: CheckboxOption },
    classNamePrefix: "rs",
  };

  const handleNavigate = (tab) => {
    if (tab === "resumen") {
      setActiveTab("resumen");
      return;
    }

    if (tab === "win-rate") {
      setActiveTab("resumen");
      setOpenWinRateModal(true);
      return;
    }

    if (tab === "detalle-consultorias") {
      setActiveTab("resumen");
      setOpenDetalleConsultoriaModal(true);
      return;
    }

    if (tab === "detalle-comercial") {
      setActiveTab("detalle-comercial");
      return;
    }

    if (tab === "detalle-ots") {
      setActiveTab("detalle-ots");
      return;
    }

    if (tab === "detalle-perdidas") {
      setActiveTab("detalle-perdidas");
      return;
    }

    Swal.fire("En construcción", "Esta vista aún no está implementada.", "info");
  };

  const renderKpiTooltip = (titulo, items) => (
    <div className="kpi-tooltip">
      <div className="kpi-tooltip-title">{titulo}</div>

      {items?.length ? (
        <ul className="kpi-tooltip-list">
          {items.map((it) => (
            <li key={it.key} className="kpi-tooltip-item">
              <span className="kpi-tooltip-state">{it.label}</span>
              <strong className="kpi-tooltip-count">{it.count}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <div className="kpi-tooltip-empty">Sin estados disponibles</div>
      )}
    </div>
  );

  if (activeTab === "detalle-comercial") {
    return <DetalleComercial onNavigate={handleNavigate} />;
  }

  if (activeTab === "detalle-ots") {
    return <DetalleOTS onNavigate={handleNavigate} />;
  }

  if (activeTab === "detalle-perdidas") {
    return <DetallePerdidas onNavigate={handleNavigate} />;
  }


  return (
    <div className="oport-dash-wrapper">
      <div className="oport-tabs">
        <button
          type="button"
          className="oport-tab-btn is-active"
          onClick={() => handleNavigate("resumen")}
        >
          Resumen
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("win-rate")}
        >
          Win Rate
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("detalle-perdidas")}
        >
          Detalle perdidas
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("detalle-consultorias")}
        >
          Detalle Consultorias
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("detalle-comercial")}
        >
          Detalle Comercial
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("detalle-ots")}
        >
          Detalle OTS
        </button>

        <button
          type="button"
          className="oport-tab-btn"
          onClick={() => handleNavigate("ingreso-cierre-mes")}
        >
          Ingreso por cierre de mes
        </button>
      </div>

      <div className="oport-topbar">
        <div>
          <h2 className="oport-dash-title">Consultorías y oportunidades comerciales CoE SAP</h2>
          <div className="oport-dash-subtitle">KPIs, filtros y detalle consolidado</div>
        </div>

        <div className="oport-topbar-actions">
          <button className="oport-btn" onClick={limpiar} disabled={loading}>
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="dashboard-layout">
        <main className="dashboard-main">
          {loading && <div className="oport-loading">Cargando...</div>}

          <section className="kpi-grid">
            <div className="kpi-card has-tooltip" tabIndex={0}>
              <div className="kpi-label">Cantidad</div>
              <div className="kpi-value">{kpis.total}</div>
              {renderKpiTooltip("Estados incluidos en cantidad", kpiEstadosInfo.total)}
            </div>

            <div className="kpi-card has-tooltip" tabIndex={0}>
              <div className="kpi-label">Activas</div>
              <div className="kpi-value">{kpis.activas}</div>
              {renderKpiTooltip("Estados incluidos en activas", kpiEstadosInfo.activas)}
            </div>

            <div className="kpi-card has-tooltip" tabIndex={0}>
              <div className="kpi-label">Cerradas</div>
              <div className="kpi-value">{kpis.cerradas}</div>
              {renderKpiTooltip("Estados incluidos en cerradas", kpiEstadosInfo.cerradas)}
            </div>

            <div className="kpi-card">
              <div className="kpi-label">% Ganadas</div>
              <div className="kpi-value">{kpis.porcentajeGanadas.toFixed(2)}%</div>
              <div className="kpi-sub">
                {kpis.ganadas} de {kpis.total}
              </div>
            </div>
          </section>

          <section className="main-grid">
            <div className="main-col">
              <div className="card">
                <div className="card-title">Estado de Oferta</div>

                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ESTADO</th>
                        <th>Cant</th>
                        <th>OTC</th>
                        <th>MRC</th>
                        <th>%</th>
                      </tr>
                    </thead>

                    <tbody>
                      {tablaEstadoOferta.rows.map((it) => (
                        <tr key={it.label}>
                          <td>{it.label}</td>
                          <td>{it.count}</td>
                          <td>{fmtMoney(it.otc)}</td>
                          <td>{fmtMoney(it.mrc)}</td>
                          <td>
                            {totEstadoOferta.count
                              ? ((it.count / totEstadoOferta.count) * 100).toFixed(2)
                              : "0.00"}
                            %
                          </td>
                        </tr>
                      ))}

                      <tr className="table-total">
                        <td>Total</td>
                        <td>{totEstadoOferta.count}</td>
                        <td>{fmtMoney(totEstadoOferta.otc)}</td>
                        <td>{fmtMoney(totEstadoOferta.mrc)}</td>
                        <td>{totEstadoOferta.count ? "100%" : "0%"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-title">Resultado de Oferta</div>

                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>RESULTADO</th>
                        <th>Cant</th>
                        <th>OTC</th>
                        <th>MRC</th>
                        <th>%</th>
                      </tr>
                    </thead>

                    <tbody>
                      {tablaResultadoOferta.rows.map((it) => (
                        <tr key={it.label}>
                          <td>{it.label}</td>
                          <td>{it.count}</td>
                          <td>{fmtMoney(it.otc)}</td>
                          <td>{fmtMoney(it.mrc)}</td>
                          <td>
                            {totResultadoOferta.count
                              ? ((it.count / totResultadoOferta.count) * 100).toFixed(2)
                              : "0.00"}
                            %
                          </td>
                        </tr>
                      ))}

                      <tr className="table-total">
                        <td>Total</td>
                        <td>{totResultadoOferta.count}</td>
                        <td>{fmtMoney(totResultadoOferta.otc)}</td>
                        <td>{fmtMoney(totResultadoOferta.mrc)}</td>
                        <td>{totResultadoOferta.count ? "100%" : "0%"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="side-col">
              <div className="card">
                <div className="card-title">Cantidad y Ganadas/Adjudicadas por Año y Mes</div>
                <GraficoCantidadGanadas data={dataFiltrada} />
              </div>

              <div className="card">
                <div className="card-title">Activas y Cerradas por Año y Mes</div>
                <GraficoActivasCerradas data={dataFiltrada} />
              </div>

              <div className="card">
                <div className="card-title">Resumen Calificación</div>
                <ResumenCalificacion data={dataFiltrada} />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">Detalle de Oportunidades</div>

            <div className="detalle-scroll">
              <table className="table table-detalle">
                <thead>
                  <tr>
                    <th>NOMBRE CLIENTE</th>
                    <th>SERVICIO</th>
                    <th>FECHA</th>
                    <th>CALIFICACION</th>
                    <th>ESTADO OFERTA</th>
                    <th>RESULTADO OFERTA</th>
                    <th>OTC</th>
                    <th>MRC</th>
                    <th>GERENCIA</th>
                    <th>COMERCIAL</th>
                    <th>ASOCIADAS</th>
                    <th>OBSERVACIONES 1RA OT</th>
                  </tr>
                </thead>

                <tbody>
                  {dataFiltrada.map((row, i) => (
                    <tr key={row.id ?? i}>
                      <td>{row.nombre_cliente ?? "-"}</td>
                      <td>{row.servicio ?? "-"}</td>
                      <td>{row.fecha_creacion ?? "-"}</td>
                      <td>{row.calificacion_oportunidad ?? "-"}</td>
                      <td>{row.estado_oferta ?? "-"}</td>
                      <td>{row.resultado_oferta ?? "-"}</td>
                      <td>{fmtMoney(readMoney(row, ["otc", "otr", "OTC", "OTR"]))}</td>
                      <td>{fmtMoney(readMoney(row, ["mrc", "MRC"]))}</td>
                      <td>{row.gerencia_comercial ?? "-"}</td>
                      <td>{row.comercial_asignado ?? "-"}</td>
                      <td>
                        {row.__dashboard_total_asociadas_filtradas ?? row.__dashboard_total_asociadas ?? 0}
                        {row.__dashboard_total_asociadas
                          ? ` / ${row.__dashboard_total_asociadas}`
                          : ""}
                      </td>
                      <td className="td-wrap">{renderObservacionesCell(row.observaciones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="dashboard-filtros">
          <div className="filters-head">
            <div className="filters-title">Filtros</div>
          </div>

          <div className="filtro-item">
            <label>Año / Mes</label>

            <div className="two-col">
              <Select
                {...selectCommon}
                placeholder="Año"
                options={opciones.anios}
                value={filtros.anios}
                onChange={(v) => setFiltros((p) => ({ ...p, anios: v || [] }))}
              />

              <Select
                {...selectCommon}
                placeholder="Mes"
                options={opciones.meses}
                value={filtros.meses}
                onChange={(v) => setFiltros((p) => ({ ...p, meses: v || [] }))}
              />
            </div>
          </div>

          <div className="filtro-item">
            <label>Tipo</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.tipos}
              value={filtros.tipos}
              onChange={(v) => setFiltros((p) => ({ ...p, tipos: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Dirección Comercial</label>

            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.direccionComercial}
              value={filtros.direccionComercial}
              onChange={(v) =>
                setFiltros((p) => ({ ...p, direccionComercial: v || [] }))
              }
            />
          </div>

          <div className="filtro-item">
            <label>Gerencia Comercial</label>

            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.gerenciaComercial}
              value={filtros.gerenciaComercial}
              onChange={(v) =>
                setFiltros((p) => ({ ...p, gerenciaComercial: v || [] }))
              }
            />
          </div>

          <div className="filtro-item">
            <label>Nombre Cliente</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.cliente}
              value={filtros.cliente}
              onChange={(v) => setFiltros((p) => ({ ...p, cliente: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Estado Oferta</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.estadoOferta}
              value={filtros.estadoOferta}
              onChange={(v) => setFiltros((p) => ({ ...p, estadoOferta: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Resultado Oferta</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.resultadoOferta}
              value={filtros.resultadoOferta}
              onChange={(v) =>
                setFiltros((p) => ({ ...p, resultadoOferta: v || [] }))
              }
            />
          </div>

          <div className="filtro-item">
            <label>Fecha Acta Cierre OT</label>

            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.fechaActaCierreOT}
              value={filtros.fechaActaCierreOT}
              onChange={(v) =>
                setFiltros((p) => ({ ...p, fechaActaCierreOT: v || [] }))
              }
            />
          </div>

          <div className="filtro-item">
            <label>Fecha Cierre Oportunidad</label>

            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.fechaCierreOportunidad}
              value={filtros.fechaCierreOportunidad}
              onChange={(v) =>
                setFiltros((p) => ({ ...p, fechaCierreOportunidad: v || [] }))
              }
            />
          </div>

          <div className="filtro-item">
            <label>Estado OT</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.estadoOT}
              value={filtros.estadoOT}
              onChange={(v) => setFiltros((p) => ({ ...p, estadoOT: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Último Mes</label>

            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.ultimoMes}
              value={filtros.ultimoMes}
              onChange={(v) => setFiltros((p) => ({ ...p, ultimoMes: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Calificación Oportunidad</label>

            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.calificacion}
              value={filtros.calificacion}
              onChange={(v) => setFiltros((p) => ({ ...p, calificacion: v || [] }))}
            />
          </div>
        </aside>
      </div>

      <ModalWinRate
        isOpen={openWinRateModal}
        onClose={() => setOpenWinRateModal(false)}
        rows={dataFiltrada}
        options={opciones}
        selectCommon={selectCommon}
        baseTitle="1ER SEMESTRE 2025"
      />

      <ModalDetalleConsultoria
        isOpen={openDetalleConsultoriaModal}
        onClose={() => setOpenDetalleConsultoriaModal(false)}
        rows={dataFiltrada}
        options={opciones}
        selectCommon={selectCommon}
      />
    </div>
  );
}
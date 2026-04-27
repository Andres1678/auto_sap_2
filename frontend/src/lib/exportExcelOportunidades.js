import * as XLSX from "xlsx";

const pretty = (col) =>
  String(col || "")
    .replace(/_/g, " ")
    .trim()
    .toUpperCase();

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

const NUMERIC_COLS = new Set([
  "otc",
  "mrc",
  "mrc_normalizado",
  "valor_oferta_claro",
]);

const toExcelDateDDMMYYYY = (v) => {
  if (!v) return "";

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const yyyy = v.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const s = String(v).trim();

  if (
    !s ||
    s === "-" ||
    s.toLowerCase() === "null" ||
    s.toLowerCase() === "none" ||
    s.toLowerCase() === "nan"
  ) {
    return "";
  }

  // Si ya viene como dd/mm/yyyy, se deja igual
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return s;
  }

  // Si viene como dd-mm-yyyy o dd.mm.yyyy, se convierte a dd/mm/yyyy
  const dmy = s.match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Si viene como yyyy-mm-dd, se convierte sin usar Date
  // para evitar desfases por zona horaria
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}/${mm}/${yyyy}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
};

const parseNumberSmart = (input) => {
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
};

const getCellValue = (row, col) => {
  if (!row) return "";

  if (col === "fecha_compromiso") {
    return (
      row.fecha_compromiso ??
      row.fechaCompromiso ??
      row["FECHA COMPROMISO"] ??
      ""
    );
  }

  if (col === "proyeccion_ingreso") {
    return (
      row.proyeccion_ingreso ??
      row.proyeccionIngreso ??
      row["PROYECCION INGRESO"] ??
      ""
    );
  }

  if (col === "fecha_cierre") {
    return (
      row.fecha_cierre ??
      row.fechaCierre ??
      row["FECHA CIERRE"] ??
      ""
    );
  }

  return row[col] ?? "";
};

export function exportOportunidadesExcel(
  rows,
  columnOrder,
  filename = "oportunidades.xlsx",
  meta = {}
) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeCols = Array.isArray(columnOrder) ? columnOrder : [];

  const headers = safeCols.map((c) => pretty(c));
  const headerToCol = new Map(headers.map((h, idx) => [h, safeCols[idx]]));

  const data = safeRows.map((r) => {
    const out = {};

    for (const h of headers) {
      const col = headerToCol.get(h);
      const v = getCellValue(r, col);

      if (DATE_COLS.has(col)) {
        out[h] = v ? toExcelDateDDMMYYYY(v) : "";
        continue;
      }

      if (NUMERIC_COLS.has(col)) {
        const n = typeof v === "number" ? v : parseNumberSmart(v);
        out[h] = n === "" ? v ?? "" : n;
        continue;
      }

      out[h] = v ?? "";
    }

    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  ws["!cols"] = headers.map((h) => ({
    wch: Math.min(50, Math.max(12, h.length + 4)),
  }));

  const metaRows = [
    { Campo: "Generado", Valor: new Date().toLocaleString() },
    { Campo: "Total filas", Valor: String(safeRows.length) },
    ...Object.entries(meta || {}).map(([k, v]) => ({
      Campo: k,
      Valor: String(v ?? ""),
    })),
  ];

  const wsMeta = XLSX.utils.json_to_sheet(
    metaRows.length ? metaRows : [{ Campo: "Info", Valor: "—" }]
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMeta, "Metadata");
  XLSX.utils.book_append_sheet(wb, ws, "Oportunidades");

  const safeName = filename.toLowerCase().endsWith(".xlsx")
    ? filename
    : `${filename}.xlsx`;

  XLSX.writeFile(wb, safeName);
}
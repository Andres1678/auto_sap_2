import * as XLSX from "xlsx";

const DATE_LABELS = new Set([
  "FECHA ASIGNACIÓN",
  "FECHA CREACION",
  "FECHA CREACIÓN",
  "FECHA CIERRE SM",
  "FECHA ENTREGA OFERTA FINAL",
  "FECHA CIERRE OPORTUNIDAD",
  "FECHA FIRMA AOS",
  "PROYECCION INGRESO",
  "PROYECCIÓN INGRESO",
  "FECHA COMPROMISO",
  "FECHA CIERRE",
]);

const COLUMN_LABELS = {
  id: "COD. CONTROL",
  fecha_creacion: "FECHA ASIGNACIÓN",
  anio_creacion_ot: "AÑO CREACIÓN OT",
  mostrar_dashboard: "MOSTRAR EN DASHBOARD",
  num_enlace: "ID ENLACE",

  nivel_export: "TIPO FILA",
  codigo_principal_export: "CÓDIGO PRINCIPAL",
  id_principal_export: "ID PRINCIPAL BD",
  cliente_principal_export: "CLIENTE PRINCIPAL",
  servicio_principal_export: "SERVICIO PRINCIPAL",
  cantidad_asociadas_export: "CANTIDAD ASOCIADAS",
  cantidad_suman_export: "ASOCIADAS QUE SUMAN / SUMA PRINCIPAL",
  relacion_export: "RELACIÓN PRINCIPAL",
};

function labelFromColumn(col) {
  return COLUMN_LABELS[col] || String(col || "").replace(/_/g, " ").toUpperCase();
}

function isDateColumn(col, label) {
  const colNorm = String(col || "").toLowerCase();
  const labelNorm = String(label || "").trim().toUpperCase();

  return (
    colNorm.startsWith("fecha_") ||
    colNorm === "proyeccion_ingreso" ||
    DATE_LABELS.has(labelNorm)
  );
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return "";
  return value;
}

function buildWorksheet(rows = [], columns = []) {
  const headers = columns.map(labelFromColumn);

  const aoa = [
    headers,
    ...(rows || []).map((row) =>
      columns.map((col) => normalizeCellValue(row?.[col]))
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false });

  // Forzar fechas como texto para que Excel no cambie día/mes según configuración regional.
  columns.forEach((col, index) => {
    const header = headers[index];

    if (!isDateColumn(col, header)) return;

    const columnLetter = XLSX.utils.encode_col(index);

    for (let rowIndex = 2; rowIndex <= aoa.length; rowIndex += 1) {
      const ref = `${columnLetter}${rowIndex}`;
      const cell = ws[ref];

      if (!cell || cell.v === null || cell.v === undefined || cell.v === "") continue;

      cell.t = "s";
      cell.v = String(cell.v);
      cell.w = String(cell.v);
      cell.z = "@";
    }
  });

  ws["!cols"] = headers.map((header, idx) => ({
    wch: isDateColumn(columns[idx], header)
      ? 14
      : Math.min(Math.max(String(header).length + 4, 12), 42),
  }));

  return ws;
}

function safeSheetName(name, fallback = "Hoja") {
  const clean = String(name || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim()
    .slice(0, 31);

  return clean || fallback;
}

export function exportOportunidadesExcel(
  rows = [],
  columns = [],
  filename = "oportunidades.xlsx",
  metadata = {},
  options = {}
) {
  const wb = XLSX.utils.book_new();

  if (metadata && Object.keys(metadata).length > 0) {
    const metaRows = [["Campo", "Valor"], ...Object.entries(metadata)];
    const metaWs = XLSX.utils.aoa_to_sheet(metaRows);
    XLSX.utils.book_append_sheet(wb, metaWs, "Metadata");
  }

  const mainSheetName = safeSheetName(options.sheetName || "Oportunidades");
  XLSX.utils.book_append_sheet(wb, buildWorksheet(rows, columns), mainSheetName);

  (options.extraSheets || []).forEach((sheet, index) => {
    if (!sheet) return;

    const name = safeSheetName(sheet.name || `Hoja ${index + 2}`);
    const sheetRows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const sheetColumns = Array.isArray(sheet.columns) ? sheet.columns : [];

    XLSX.utils.book_append_sheet(wb, buildWorksheet(sheetRows, sheetColumns), name);
  });

  XLSX.writeFile(wb, filename);
}

export default exportOportunidadesExcel;

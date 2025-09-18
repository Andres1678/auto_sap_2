import * as XLSX from "xlsx";

/**
 * Exporta a Excel los registros visibles en pantalla.
 * @param {Array<Object>} rows 
 * @param {string} filename    
 * @param {Object} meta         
 */
export function exportRegistrosExcel(rows = [], filename = "registros.xlsx", meta = {}) {
  
  const norm = (r = {}) => ({
    Fecha: r.fecha ?? "",
    "Módulo": r.modulo ?? "",
    Cliente: r.cliente ?? "",
    "Nro Caso Cliente": r.nroCasoCliente ?? r.nro_caso_cliente ?? "",
    "Nro Caso Interno": r.nroCasoInterno ?? r.nro_caso_interno ?? "",
    "Nro Escalado SAP": r.nroCasoEscaladoSap ?? r.nro_caso_escalado ?? "",
    "Tipo Tarea": r.tipoTarea ?? r.tipo_tarea ?? "",
    Consultor: r.consultor?.nombre ?? r.consultor ?? "",
    "Hora Inicio": r.horaInicio ?? r.hora_inicio ?? "",
    "Hora Fin": r.horaFin ?? r.hora_fin ?? "",
    "Tiempo Invertido": r.tiempoInvertido ?? r.tiempo_invertido ?? 0,
    "Tiempo Facturable": r.tiempoFacturable ?? r.tiempo_facturable ?? 0,
    "Horas Adicionales": r.horasAdicionales ?? r.horas_adicionales ?? 0,
    Descripción: r.descripcion ?? "",
    "Total Horas": r.totalHoras ?? r.total_horas ?? 0,
    Equipo: r.equipo ?? "",
    Bloqueado: (r.bloqueado === true || r.bloqueado === 1) ? "Sí" : "No",
  });

  const data = rows.map(norm);
  const headers = [
    [
      "Fecha","Módulo","Cliente","Nro Caso Cliente","Nro Caso Interno","Nro Escalado SAP",
      "Tipo Tarea","Consultor","Hora Inicio","Hora Fin","Tiempo Invertido","Tiempo Facturable",
      "Horas Adicionales","Descripción","Total Horas","Equipo","Bloqueado"
    ]
  ];

  const wb = XLSX.utils.book_new();

  
  if (meta && Object.keys(meta).length) {
    const metaRows = Object.entries(meta).map(([k, v]) => ({ Campo: k, Valor: String(v) }));
    const wsMeta = XLSX.utils.json_to_sheet(metaRows);
    XLSX.utils.book_append_sheet(wb, wsMeta, "Resumen");
  }

  
  const CHUNK = 50000;
  if (data.length > CHUNK) {
    let start = 0, hoja = 1;
    while (start < data.length) {
      const slice = data.slice(start, start + CHUNK);
      const ws = XLSX.utils.json_to_sheet(slice, { origin: "A2" });
      XLSX.utils.sheet_add_aoa(ws, headers, { origin: "A1" });

      autoFormat(ws, headers[0], slice);
      XLSX.utils.book_append_sheet(wb, ws, `Registros_${hoja}`);
      start += CHUNK; hoja++;
    }
  } else {
    const ws = XLSX.utils.json_to_sheet(data, { origin: "A2" });
    XLSX.utils.sheet_add_aoa(ws, headers, { origin: "A1" });

    autoFormat(ws, headers[0], data);
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
  }

  XLSX.writeFile(wb, filename);
}


function autoFormat(ws, headerRow, data) {
  
  const ref = ws["!ref"] || "A1";
  const range = XLSX.utils.decode_range(ref);
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } })
  };

  
  const cols = headerRow.map((h, idx) => {
    let w = String(h).length;
    for (const row of data) {
      const cell = String(row[headerRow[idx]] ?? "");
      if (cell.length > w) w = cell.length;
    }
    return { wch: Math.max(8, Math.min(w + 2, 60)) };
  });
  ws["!cols"] = cols;
}

import * as XLSX from "xlsx";


const pick = (obj, keys, fallback = "") => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

function exportRegistrosExcelXLSX_ALL(rows, filename = "registros.xlsx", meta = {}) {
  const headers = [
    "ID",
    "Fecha",
    "Cliente",
    "Nro Caso Cliente",
    "Nro Caso Interno",
    "Nro Caso Escalado",
    "Ocupación (FK)",
    "Ocupación",
    "Tarea (FK)",
    "Tarea",
    "Tipo Tarea (texto)",
    "Hora Inicio",
    "Hora Fin",
    "Tiempo Invertido",
    "Actividad Malla",
    "ONCALL",
    "Desborde",
    "Tiempo Facturable",
    "Horas Adicionales",
    "Descripción",
    "Total Horas",
    "Equipo",
    "Módulo",
    "Horario Trabajo",
    "Bloqueado",
    "Usuario Consultor",
    "Consultor"
  ];

  const data = (rows || []).map((r) => {
    // ocupación/tarea: soporta que venga "ocupacion" o "tarea" como objeto
    const ocupacionNombre =
      pick(r, ["ocupacion_nombre"], "") ||
      (r?.ocupacion ? `${r.ocupacion.codigo ?? ""} - ${r.ocupacion.nombre ?? ""}`.trim() : "");

    const tareaNombre =
      pick(r, ["tarea_nombre"], "") ||
      (r?.tarea ? `${r.tarea.codigo ?? ""} - ${r.tarea.nombre ?? ""}`.trim() : "");

    return {
      "ID": pick(r, ["id"], ""),
      "Fecha": pick(r, ["fecha"], ""),
      "Cliente": pick(r, ["cliente"], ""),

      "Nro Caso Cliente": pick(r, ["nro_caso_cliente", "nroCasoCliente"], ""),
      "Nro Caso Interno": pick(r, ["nro_caso_interno", "nroCasoInterno"], ""),
      "Nro Caso Escalado": pick(r, ["nro_caso_escalado", "nroCasoEscaladoSap", "nroCasoEscalado"], ""),

      "Ocupación (FK)": pick(r, ["ocupacion_id", "ocupacionId"], ""),
      "Ocupación": ocupacionNombre || "—",

      "Tarea (FK)": pick(r, ["tarea_id", "tareaId"], ""),
      "Tarea": tareaNombre || "—",

      // texto que tú marcas como importante en el modelo
      "Tipo Tarea (texto)": pick(r, ["tipo_tarea", "tipoTarea"], ""),

      "Hora Inicio": pick(r, ["hora_inicio", "horaInicio"], ""),
      "Hora Fin": pick(r, ["hora_fin", "horaFin"], ""),
      "Tiempo Invertido": pick(r, ["tiempo_invertido", "tiempoInvertido"], ""),

      "Actividad Malla": pick(r, ["actividad_malla", "actividadMalla"], ""),
      "ONCALL": pick(r, ["oncall"], ""),
      "Desborde": pick(r, ["desborde"], ""),

      "Tiempo Facturable": pick(r, ["tiempo_facturable", "tiempoFacturable"], ""),
      "Horas Adicionales": pick(r, ["horas_adicionales", "horasAdicionales"], ""),
      "Descripción": pick(r, ["descripcion"], ""),

      "Total Horas": pick(r, ["total_horas", "totalHoras"], ""),

      "Equipo": pick(r, ["equipo"], ""),
      "Módulo": pick(r, ["modulo"], ""),

      "Horario Trabajo": pick(r, ["horario_trabajo", "horarioTrabajo"], ""),
      "Bloqueado": pick(r, ["bloqueado"], false) ? "Sí" : "No",

      "Usuario Consultor": pick(r, ["usuario_consultor", "usuarioConsultor", "usuario"], ""),
      "Consultor": pick(r, ["consultor_nombre", "consultor", "nombre"], ""),
    };
  });

  // Hoja principal
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  // anchos (opcional)
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(45, Math.max(12, h.length + 4)) }));

  // Hoja metadata (filtros / info)
  const metaRows = Object.entries(meta || {}).map(([k, v]) => ({ Campo: k, Valor: String(v ?? "") }));
  const wsMeta = XLSX.utils.json_to_sheet(metaRows.length ? metaRows : [{ Campo: "Info", Valor: "—" }]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMeta, "Metadata");
  XLSX.utils.book_append_sheet(wb, ws, "Registros");

  const safeName = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeName);
}

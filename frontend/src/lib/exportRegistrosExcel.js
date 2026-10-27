import * as XLSX from 'xlsx';

const pick = (obj, keys, fallback = '') => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
};
const headers = [
  'ID', 'Fecha', 'Cliente', 'Nro Caso Cliente', 'Nro Caso Interno', 'Nro Caso Escalado',
  'Ocupación (FK)', 'Ocupación', 'Tarea (FK)', 'Tarea', 'Tipo Tarea (texto)',
  'Hora Inicio', 'Hora Fin', 'Tiempo Invertido', 'Actividad Malla', 'ONCALL', 'Desborde',
  'Tiempo Facturable', 'Horas Adicionales', 'Descripción', 'Total Horas', 'Equipo',
  'Módulo', 'Horario Trabajo', 'Bloqueado', 'Usuario Consultor', 'Consultor',
];
const nombreCatalogo = (r, tipo) => {
  const nombre = pick(r, [`${tipo}_nombre`]) || r?.[tipo]?.nombre || '';
  const codigo = pick(r, [`${tipo}_codigo`]) || r?.[tipo]?.codigo || '';
  return nombre || codigo ? [codigo, nombre].filter(v => v !== '').join(' - ') : '—';
};
const bloqueado = valor => valor === true || valor === 1 || ['1', 'true', 'si', 'sí'].includes(String(valor).trim().toLowerCase());

const cederInterfaz = () => new Promise(resolve => setTimeout(resolve, 0));
const comprobarCancelacion = signal => {
  if (signal?.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
};

// Construir un solo libro, agregando cada lote directamente a sus hojas.
export function crearExportacionRegistrosExcel(metaInicial = {}) {
  let wb = XLSX.utils.book_new();
  let ws = null;
  let hojas = 0;
  let filasHoja = 0;
  let total = 0;
  let finalizado = false;
  const MAX_FILAS_DATOS = 1048575; // Excel admite 1.048.576 filas incluyendo títulos.
  const meta = { ...metaInicial };

  const nuevaHoja = () => {
    if (ws) ws['!autofilter'] = { ref: ws['!ref'] };
    ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = headers.map(h => ({ wch: Math.min(45, Math.max(12, h.length + 4)) }));
    hojas += 1;
    filasHoja = 0;
    XLSX.utils.book_append_sheet(wb, ws, hojas === 1 ? 'Registros' : `Registros_${hojas}`);
  };

  return {
    async agregarLote(rows, signal) {
      if (finalizado || !wb) throw new Error('La exportación ya fue cerrada.');
      if (!Array.isArray(rows) || rows.length > 2000) throw new Error('El lote debe contener como máximo 2.000 registros.');
      let offset = 0;
      while (offset < rows.length) {
        comprobarCancelacion(signal);
        if (!ws || filasHoja === MAX_FILAS_DATOS) nuevaHoja();
        const cantidad = Math.min(200, rows.length - offset, MAX_FILAS_DATOS - filasHoja);
    const data = rows.slice(offset, offset + cantidad).map(r => [
      pick(r, ['id']), pick(r, ['fecha']), pick(r, ['cliente']),
      pick(r, ['nro_caso_cliente', 'nroCasoCliente']), pick(r, ['nro_caso_interno', 'nroCasoInterno']),
      pick(r, ['nro_caso_escalado', 'nroCasoEscaladoSap', 'nroCasoEscalado']),
      pick(r, ['ocupacion_id', 'ocupacionId']), nombreCatalogo(r, 'ocupacion'),
      pick(r, ['tarea_id', 'tareaId']), nombreCatalogo(r, 'tarea'),
      pick(r, ['tipo_tarea', 'tipoTarea']), pick(r, ['hora_inicio', 'horaInicio']),
      pick(r, ['hora_fin', 'horaFin']), pick(r, ['tiempo_invertido', 'tiempoInvertido']),
      pick(r, ['actividad_malla', 'actividadMalla']), pick(r, ['oncall']), pick(r, ['desborde']),
      pick(r, ['tiempo_facturable', 'tiempoFacturable']), pick(r, ['horas_adicionales', 'horasAdicionales']),
      pick(r, ['descripcion']), pick(r, ['total_horas', 'totalHoras']), pick(r, ['equipo']), pick(r, ['modulo']),
      pick(r, ['horario_trabajo', 'horarioTrabajo']), bloqueado(r?.bloqueado) ? 'Sí' : 'No',
      pick(r, ['usuario_consultor', 'usuarioConsultor', 'usuario']),
      pick(r, ['consultor_nombre', 'consultor', 'nombre']),
    ]);
        XLSX.utils.sheet_add_aoa(ws, data, { origin: -1 });
        filasHoja += cantidad;
        total += cantidad;
        offset += cantidad;
        await cederInterfaz();
      }
    },
    async descargar(filename = 'registros.xlsx', metaFinal = {}, signal) {
      if (finalizado || !wb) throw new Error('La exportación ya fue cerrada.');
      comprobarCancelacion(signal);
      if (!ws) nuevaHoja();
      ws['!autofilter'] = { ref: ws['!ref'] };
      const metadata = { ...meta, ...metaFinal, 'Total exportado': total };
      const metaRows = Object.entries(metadata).map(([k, v]) => [k, String(v ?? '')]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...metaRows]), 'Metadata');
      const safeName = String(filename || 'registros').replace(/\.(?:xlsx?|csv)$/i, '') + '.xlsx';
      await cederInterfaz();
      comprobarCancelacion(signal);
      XLSX.writeFile(wb, safeName, { bookType: 'xlsx', compression: true });
      finalizado = true;
      wb = null;
      ws = null;
      return { filename: safeName, count: total, sheets: hojas };
    },
    descartar() {
      wb = null;
      ws = null;
      finalizado = true;
    },
  };
}

// Compatibilidad con llamadas que ya entregan un array completo.
export async function exportRegistrosExcelXLSX_ALL(rows, filename = 'registros.xlsx', meta = {}) {
  if (!Array.isArray(rows)) throw new Error('Los registros de Excel no son válidos.');
  const exportacion = crearExportacionRegistrosExcel(meta);
  try {
    for (let offset = 0; offset < rows.length; offset += 1000) {
      await exportacion.agregarLote(rows.slice(offset, offset + 1000));
    }
    return await exportacion.descargar(filename);
  } finally {
    exportacion.descartar();
  }
}

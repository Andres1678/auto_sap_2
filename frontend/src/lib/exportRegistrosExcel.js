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

// Un libro por lote: nunca reunir todos los registros del filtro en un array.
export async function exportRegistrosExcelXLSX_ALL(rows, filename = 'registros.xlsx', meta = {}) {
  if (!Array.isArray(rows)) throw new Error('El lote de Excel no es válido.');
  if (rows.length > 2000) throw new Error('El lote supera 2.000 registros. Usa la descarga por lotes de Registro.');
  // Permitir que el navegador pinte el progreso antes de construir el libro.
  await new Promise(resolve => setTimeout(resolve, 0));
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  // Convertir bloques pequeños sin duplicar el lote completo en objetos y filas.
  for (let offset = 0; offset < rows.length; offset += 200) {
    const data = rows.slice(offset, offset + 200).map(r => [
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
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  ws['!cols'] = headers.map(h => ({ wch: Math.min(45, Math.max(12, h.length + 4)) }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  const metaRows = Object.entries(meta || {}).map(([k, v]) => [k, String(v ?? '')]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...metaRows]), 'Metadata');
  XLSX.utils.book_append_sheet(wb, ws, 'Registros');
  const safeName = String(filename || 'registros').replace(/\.(?:xlsx?|csv)$/i, '') + '.xlsx';
  XLSX.writeFile(wb, safeName, { bookType: 'xlsx', compression: true });
  return { filename: safeName, count: rows.length };
}

export const textoFiltro = (v) => String(v ?? '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toUpperCase();
export const listaFiltro = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(textoFiltro).filter(Boolean);
export const coincideFiltro = (seleccion, ...valores) => {
  const elegidos = listaFiltro(seleccion);
  return !elegidos.length || valores.some((v) => elegidos.includes(textoFiltro(v)));
};
export const fechaFiltro = (v) => String(v ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
export const horasFiltro = (r) => {
  const n = Number(r.tiempoInvertido ?? r.tiempo_invertido ?? r.total_horas ?? r.horas ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export function filtrarRegistrosGraficos(rows, filtros = {}) {
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const fecha = fechaFiltro(r.fecha);
    if (filtros.mes && !fecha.startsWith(filtros.mes)) return false;
    if (!filtros.mes && filtros.desde && fecha < filtros.desde) return false;
    if (!filtros.mes && filtros.hasta && fecha > filtros.hasta) return false;
    const ocupacion = [r.ocupacion_codigo, r.ocupacion_nombre].map(v=>String(v??'').trim()).filter(Boolean).join(' - ') || 'SIN OCUPACIÓN';
    return coincideFiltro(filtros.equipo, r.equipo, r.equipo_nombre)
      && coincideFiltro(filtros.consultor, r.consultor, r.usuario_consultor)
      && coincideFiltro(filtros.cliente, r.cliente)
      && coincideFiltro(filtros.modulo, r.modulo)
      && coincideFiltro(filtros.tarea, r.tipoTarea, r.tipo_tarea)
      && coincideFiltro(filtros.ocupacion, ocupacion)
      && coincideFiltro(filtros.nroCliente, r.nroCasoCliente ?? r.nro_caso_cliente)
      && coincideFiltro(filtros.nroEscalado, r.nroCasoEscaladoSap ?? r.nro_caso_escalado);
  });
}
export function personasEquiposFiltradas(equipos, registros, filtros) {
  const resultado = new Map();
  // Un recorrido de los registros; evitar releer todo por cada consultor.
  const porUsuario = new Map(), sinUsuarioPorNombre = new Map();
  for (const r of registros) {
    const equipo = textoFiltro(r.equipo);
    const usuario = textoFiltro(r.usuario_consultor);
    const nombre = textoFiltro(r.consultor);
    const map = usuario ? porUsuario : sinUsuarioPorNombre;
    const key = JSON.stringify([equipo, usuario || nombre]);
    const item = map.get(key) || { cantidad: 0, horas: 0 };
    item.cantidad += 1; item.horas += horasFiltro(r); map.set(key, item);
  }
  for (const row of Array.isArray(equipos) ? equipos : []) {
    const equipo = textoFiltro(row.equipo) || 'SIN EQUIPO';
    if (!coincideFiltro(filtros.equipo, equipo)) continue;
    const personas = (Array.isArray(row.personas) ? row.personas : [])
      .filter(p => ![false, 0, '0', 'false'].includes(p.activo))
      .filter(p => coincideFiltro(filtros.consultor, p.nombre, p.usuario))
      .map(p => {
        const login = textoFiltro(p.usuario);
        const nombre = textoFiltro(p.nombre);
        const porLogin = porUsuario.get(JSON.stringify([equipo, login]));
        const porNombre = sinUsuarioPorNombre.get(JSON.stringify([equipo, nombre]));
        const cantidad = (porLogin?.cantidad || 0) + (porNombre?.cantidad || 0);
        const horas = (porLogin?.horas || 0) + (porNombre?.horas || 0);
        return {
          ...p, equipo, activo: true, usuario: String(p.usuario || '').trim().toLowerCase(),
          nombre: String(p.nombre || p.usuario || 'SIN NOMBRE').trim(),
          registro: cantidad > 0,
          estado: cantidad ? 'REGISTRÓ' : 'NO REGISTRÓ',
          totalRegistros: cantidad,
          horasRegistradas: horas,
        };
      });
    if (!personas.length) continue;
    const registraron = personas.filter(p=>p.registro).length;
    resultado.set(equipo, {equipo, personas, totalPersonas:personas.length, registraron,
      noRegistraron:personas.length-registraron, porcentajeRegistro:100*registraron/personas.length});
  }
  return resultado;
}

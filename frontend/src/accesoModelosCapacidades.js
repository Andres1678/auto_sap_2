// Solo controla la interfaz; el backend debe validar la consulta por separado.
export function puedeVerModelosCapacidades(usuario) {
  const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const rol = normalizar(usuario?.rol_ref?.nombre ?? usuario?.rol?.nombre ?? usuario?.rol ?? usuario?.user?.rol);
  const permisos = Array.isArray(usuario?.permisos) ? usuario.permisos : [];
  return ['ADMIN', 'LIDER', 'JEFE'].includes(rol) || permisos.some(p => normalizar(typeof p === 'string' ? p : p?.codigo) === 'MODELOS_CAPACIDADES_VER');
}

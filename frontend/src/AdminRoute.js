import React from "react";
import { Navigate } from "react-router-dom";

export default function AdminRoute({
  children,
  allow = ["ADMIN"],
  allowAdminPrefix = true, // compatibilidad temporal con roles ADMIN_* existentes
  requirePermiso = null,
  requirePermisos = null,
}) {
  let raw = null;

  try {
    raw = JSON.parse(localStorage.getItem("userData") || "null");
  } catch (e) {
    console.warn("❌ Error leyendo userData del localStorage", e);
    return <Navigate to="/login" replace />;
  }

  
  if (!raw) {
    console.warn("❌ No hay sesión activa");
    return <Navigate to="/login" replace />;
  }

  
  const rol = String(raw.rol || "").trim().toUpperCase();

  const allowedRoles = Array.isArray(allow)
    ? allow.map((r) => String(r).trim().toUpperCase())
    : [String(allow).trim().toUpperCase()];

  
  const isAdmin = rol === "ADMIN";
  const isAdminPrefix = allowAdminPrefix && rol.startsWith("ADMIN_");
  const permisosRaw = raw.permisos || [];
  const permisos = Array.isArray(permisosRaw)
    ? permisosRaw
        .map((p) => (typeof p === "string" ? p : p?.codigo || p?.code || p?.nombre))
        .filter(Boolean)
        .map((p) => String(p).trim().toUpperCase())
    : [];

  if (!Array.isArray(permisosRaw)) {
    console.warn("⚠ userData.permisos no es array:", permisosRaw);
    return <Navigate to="/" replace />;
  }

  // ADMIN único tiene acceso total. Para JEFE, LIDER y ENCARGADOS manda
  // el permiso efectivo recibido desde el backend, no el nombre del rol.
  if (isAdmin) return children;

  const permisoRequerido = requirePermiso
    ? String(requirePermiso).trim().toUpperCase()
    : null;
  const permisosRequeridos = Array.isArray(requirePermisos)
    ? requirePermisos.map((p) => String(p).trim().toUpperCase())
    : [];

  if (permisoRequerido && !permisos.includes(permisoRequerido)) {
    console.warn(`⛔ Falta permiso: ${requirePermiso}`);
    return <Navigate to="/" replace />;
  }

  if (permisosRequeridos.length > 0) {
    const faltantes = permisosRequeridos.filter((p) => !permisos.includes(p));
    if (faltantes.length > 0) {
      console.warn(`⛔ Faltan permisos: ${faltantes.join(", ")}`);
      return <Navigate to="/" replace />;
    }
  }

  // Si la ruta exige permisos y ya los cumplió, el rol no añade un segundo
  // bloqueo. Esto permite usar JEFE/LIDER/ENCARGADO sin duplicar listas.
  if (permisoRequerido || permisosRequeridos.length > 0) return children;

  if (!allowedRoles.includes(rol) && !isAdminPrefix) {
    console.warn(
      `⛔ Acceso denegado. Rol requerido: ${allowedRoles.join(", ")}${allowAdminPrefix ? " o ADMIN_*" : ""} — Rol actual: ${rol}`
    );
    return <Navigate to="/" replace />;
  }

  return children;
}

import React from "react";
import { Navigate } from "react-router-dom";

export default function AdminRoute({
  children,
  allow = ["ADMIN"],
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

  // Validar sesión
  if (!raw) {
    console.warn("❌ No hay sesión activa");
    return <Navigate to="/login" replace />;
  }

  // Backend devuelve: { usuario, nombre, rol, equipo, permisos, ... }
  const rol = String(raw.rol || "").trim().toUpperCase();

  // Roles permitidos
  const allowedRoles = Array.isArray(allow)
    ? allow.map((r) => String(r).trim().toUpperCase())
    : [String(allow).trim().toUpperCase()];

  if (!allowedRoles.includes(rol)) {
    console.warn(
      `⛔ Acceso denegado. Rol requerido: ${allowedRoles.join(", ")} — Rol actual: ${rol}`
    );
    return <Navigate to="/" replace />;
  }

  // Permisos
  const permisos = raw.permisos || [];

  if (!Array.isArray(permisos)) {
    console.warn("⚠ userData.permisos no es array:", permisos);
    return <Navigate to="/" replace />;
  }

  // Validación de un solo permiso
  if (requirePermiso && !permisos.includes(requirePermiso)) {
    console.warn(`⛔ Falta permiso: ${requirePermiso}`);
    return <Navigate to="/" replace />;
  }

  // Validación de varios permisos
  if (Array.isArray(requirePermisos) && requirePermisos.length > 0) {
    const faltantes = requirePermisos.filter(p => !permisos.includes(p));
    if (faltantes.length > 0) {
      console.warn(`⛔ Faltan permisos: ${faltantes.join(", ")}`);
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

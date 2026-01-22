import React from "react";
import { Navigate } from "react-router-dom";

export default function AdminRoute({
  children,
  allow = ["ADMIN"],               
  allowAdminPrefix = true,         
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

  
  const isAdminPrefix = allowAdminPrefix && rol.startsWith("ADMIN_");

  
  if (!allowedRoles.includes(rol) && !isAdminPrefix) {
    console.warn(
      `⛔ Acceso denegado. Rol requerido: ${allowedRoles.join(", ")}${allowAdminPrefix ? " o ADMIN_*" : ""} — Rol actual: ${rol}`
    );
    return <Navigate to="/" replace />;
  }

  
  const permisos = raw.permisos || [];

  if (!Array.isArray(permisos)) {
    console.warn("⚠ userData.permisos no es array:", permisos);
    return <Navigate to="/" replace />;
  }

  
  if (requirePermiso && !permisos.includes(requirePermiso)) {
    console.warn(`⛔ Falta permiso: ${requirePermiso}`);
    return <Navigate to="/" replace />;
  }

  
  if (Array.isArray(requirePermisos) && requirePermisos.length > 0) {
    const faltantes = requirePermisos.filter((p) => !permisos.includes(p));
    if (faltantes.length > 0) {
      console.warn(`⛔ Faltan permisos: ${faltantes.join(", ")}`);
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

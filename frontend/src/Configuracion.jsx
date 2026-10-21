import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import "./Configuracion.css";

export default function Configuracion() {
  const { permisos, isAdmin } = useMemo(() => {
    try {
      const raw = localStorage.getItem("userData");
      const u = raw ? JSON.parse(raw) : null;
      const lista = Array.isArray(u?.permisos) ? u.permisos
        .map((p) => typeof p === "string" ? p : p?.codigo).filter(Boolean)
        .map((p) => String(p).trim().toUpperCase()) : [];
      return { permisos: lista, isAdmin: String(u?.rol_ref?.nombre ?? u?.rol ?? u?.user?.rol ?? "").trim().toUpperCase() === "ADMIN" };
    } catch { return { permisos: [], isAdmin: false }; }
  }, []);
  const canProyectos = permisos.includes("PROYECTOS_ADMIN");
  const canModulos = permisos.includes("ADMIN_MODULOS_GESTION");
  const canVerPermisosPersonas = isAdmin || permisos.includes("PERMISOS_EFECTIVOS_VER");
  return (
    <div className="config-wrapper">
      <div className="config-title"><h1>⚙️ Configuración del Sistema</h1>
        <p className="config-sub">Administra usuarios, cargos, clientes y permisos del sistema.</p>
      </div>
      <div className="config-grid">
        {isAdmin && (
          <Link to="/configuracion/modelos-capacidades-coe-sap" className="config-card">
            <div className="config-icon">📋</div>
            <h3>Modelos de capacidades COE SAP</h3>
            <p>Consulta el driver mensual por proceso y cargo.</p>
          </Link>
        )}
        {isAdmin && <Link to="/configuracion/especialidades" className="config-card"><div className="config-icon">🧩</div><h3>Gestión de Especialidades</h3><p>Crear especialidades y asociar un módulo a cada una para usarlas en los cargos.</p></Link>}
        <Link to="/configuracion/usuarios" className="config-card"><div className="config-icon">👥</div><h3>Gestión de Consultores</h3><p>Crear, editar o eliminar consultores y asignar cargos y módulos.</p></Link>
        {isAdmin && (<Link to="/configuracion/cargos" className="config-card"><div className="config-icon">💼</div><h3>Gestión de Cargos</h3><p>Crear, editar y eliminar los cargos disponibles para los consultores.</p></Link>)}
        <Link to="/configuracion/clientes" className="config-card"><div className="config-icon">🧾</div><h3>Gestión de Clientes</h3><p>Administrar clientes corporativos y contactos.</p></Link>
        <Link to="/configuracion/permisos" className="config-card"><div className="config-icon">🔐</div><h3>Gestión de Permisos</h3><p>Otorga permisos a roles, equipos o consultores.</p></Link>
        {canVerPermisosPersonas && (<Link to="/configuracion/permisos-personas" className="config-card is-featured"><div className="config-icon">🧑‍💻</div><h3>Permisos por Persona</h3><p>Consulta los permisos efectivos y si provienen del rol, equipo o asignación individual.</p></Link>)}
        <Link to="/configuracion/ocupaciones-tareas" className="config-card"><div className="config-icon">📊</div><h3>Ocupaciones y Tareas</h3><p>Configura las ocupaciones y las tareas asociadas.</p></Link>
        <Link to="/configuracion/roles" className="config-card"><div className="config-icon">🛡️</div><h3>Gestión de Roles</h3><p>Crear, modificar y asignar permisos a los roles del sistema.</p></Link>
        <Link to="/configuracion/equipos" className="config-card"><div className="config-icon">🧩</div><h3>Gestión de Equipos</h3><p>Administrar equipos y asignar consultores.</p></Link>
        {canProyectos && (<Link to="/configuracion/proyectos" className="config-card"><div className="config-icon">📌</div><h3>Gestión de Proyectos</h3><p>Crear proyectos, asignar módulos, definir fase y activar/inactivar.</p></Link>)}
        {canModulos && (<Link to="/configuracion/modulos" className="config-card"><div className="config-icon">📌</div><h3>Gestión de Módulos</h3><p>Crear y gestionar los módulos del sistema.</p></Link>)}
        {canModulos && (<Link to="/configuracion/perfiles" className="config-card"><div className="config-icon">📌</div><h3>Gestión de Perfiles</h3><p>Crear y gestionar los perfiles del sistema.</p></Link>)}
      </div>
    </div>
  );
}

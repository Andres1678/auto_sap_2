import React from "react";
import { Link } from "react-router-dom";
import "./Configuracion.css";

export default function Configuracion() {
  return (
    <div className="config-wrapper">
      <div className="config-title">
        <h1>⚙️ Configuración del Sistema</h1>
        <p className="config-sub">
          Administra usuarios, clientes y permisos del sistema.
        </p>
      </div>

      <div className="config-grid">

        {/* Card Usuarios */}
        <Link to="/configuracion/usuarios" className="config-card">
          <div className="config-icon">👥</div>
          <h3>Gestión de Consultores</h3>
          <p>Crear, editar o eliminar consultores y asignar módulos.</p>
        </Link>

        {/* Card Clientes */}
        <Link to="/configuracion/clientes" className="config-card">
          <div className="config-icon">🧾</div>
          <h3>Gestión de Clientes</h3>
          <p>Administrar clientes corporativos y contactos.</p>
        </Link>

        {/* Card Permisos */}
        <Link to="/configuracion/permisos" className="config-card">
          <div className="config-icon">🔐</div>
          <h3>Gestión de Permisos</h3>
          <p>Otorga permisos a roles, equipos o consultores.</p>
        </Link>

        {/* Card Ocupaciones y Tareas */}
        <Link to="/configuracion/ocupaciones-tareas" className="config-card">
          <div className="config-icon">📊</div>
          <h3>Ocupaciones y Tareas</h3>
          <p>Configura las ocupaciones y las tareas asociadas.</p>
        </Link>

        {/* 🆕 Card Roles */}
        <Link to="/configuracion/roles" className="config-card">
          <div className="config-icon">🛡️</div>
          <h3>Gestión de Roles</h3>
          <p>Crear, modificar y asignar permisos a los roles del sistema.</p>
        </Link>

        <Link to="/configuracion/equipos" className="config-card">
          <div className="config-icon">🧩</div>
          <h3>Gestión de Equipos</h3>
          <p>Administrar equipos y asignar consultores.</p>
        </Link>
      </div>
    </div>
  );
}

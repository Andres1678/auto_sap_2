import React from "react";
import { Link } from "react-router-dom";
import "./Configuracion.css";

export default function ConfiguracionReportes() {
  return (
    <div className="config-wrapper">
      <div className="config-title">
        <h1>📊 Configuración de Reportes</h1>
        <p className="config-sub">
          Accede a los reportes gráficos del sistema.
        </p>
      </div>

      <div className="config-grid">
        <Link to="/grafico" className="config-card">
          <div className="config-icon">📈</div>
          <h3>Gráficos</h3>
          <p>Visualiza todos los gráficos operativos en conjunto.</p>
        </Link>

        <Link to="/proyectos-horas" className="config-card">
          <div className="config-icon">📌</div>
          <h3>Proyectos</h3>
          <p>Consulta el reporte consolidado de horas por proyecto.</p>
        </Link>

        <Link to="/dashboard-costos" className="config-card">
          <div className="config-icon">💰</div>
          <h3>Dashboard de costos</h3>
          <p>Consulta el tablero consolidado de costos.</p>
        </Link>
      </div>
    </div>
  );
}
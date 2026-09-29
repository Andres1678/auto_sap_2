import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import "./Configuracion.css";

export default function ConfiguracionReportes() {
  const usuario = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem("userData") ||
        localStorage.getItem("user") ||
        "null"
      );
    } catch {
      return null;
    }
  }, []);

  const rol = String(
    usuario?.rol ||
    usuario?.user?.rol ||
    ""
  ).trim().toUpperCase();

  const permisos = Array.isArray(
    usuario?.permisos || usuario?.user?.permisos
  )
    ? (usuario?.permisos || usuario?.user?.permisos)
        .map((permiso) =>
          typeof permiso === "string"
            ? permiso
            : permiso?.codigo
        )
        .filter(Boolean)
        .map((codigo) => String(codigo).trim().toUpperCase())
    : [];

  const isAdmin = rol === "ADMIN";

  const can = (codigo) =>
    isAdmin || permisos.includes(String(codigo).toUpperCase());

  return (
    <div className="config-wrapper">
      <div className="config-title">
        <h1>📊 Configuración de Reportes</h1>

        <p className="config-sub">
          Accede a los reportes gráficos del sistema.
        </p>
      </div>

      <div className="config-grid">
        {can("GRAFICOS_VER") && (
          <Link to="/grafico" className="config-card">
            <div className="config-icon">📈</div>
            <h3>Gráficos</h3>
            <p>
              Visualiza los gráficos operativos correspondientes
              a tu alcance.
            </p>
          </Link>
        )}

        {can("PROYECTOS_VER") && (
          <Link to="/proyectos-horas" className="config-card">
            <div className="config-icon">📌</div>
            <h3>Proyectos</h3>
            <p>
              Consulta el reporte consolidado de horas por proyecto.
            </p>
          </Link>
        )}

        {can("PROYECTOS_ADMIN") && (
          <Link to="/dashboard-costos" className="config-card">
            <div className="config-icon">💰</div>
            <h3>Dashboard de costos</h3>
            <p>
              Consulta el tablero consolidado de costos.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './Login';
import Registro from './Registro';
import Navbar from './Navbar/Navbar';
import PanelGraficos from './PanelGraficos';
import GraficoBase from './GraficoBase';
import BaseRegistros from './BaseRegistros';
import ConsultoresTable from './ConsultoresTable';
import AdminRoute from './AdminRoute';
import Oportunidades from './Oportunidades';
import OportunidadesDashboard from './OportunidadesDashboard';
import Configuracion from './Configuracion';
import ClientesTable from './ClientesTable';
import PermisosPage from "./PermisosPage";
import OcupacionesTareasPage from "./OcupacionesTareasPage";
import RolesPage from "./RolesPage";
import EquiposPage from "./EquiposPage";
import ReporteHorasConsultorCliente from './Reportes/ReporteHorasConsultorCliente';
import PresupuestoConsultorImport from './PresupuestoConsultorImport';

function App() {
  const [userData, setUserData] = useState(null);

  // -------------------- LOAD USER DATA --------------------
  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("userData");
      if (rawUser) setUserData(JSON.parse(rawUser));
    } catch {}
  }, []);

  // Detect logout from another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "userData" && !e.newValue) setUserData(null);
      if (e.key === "token" && !e.newValue) setUserData(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // -------------------- LOGIN / LOGOUT --------------------
  const handleLoginSuccess = (payload) => {
    const token = payload?.token || null;
    const user = payload?.user || payload || null;

    if (token) localStorage.setItem("token", token);
    if (user) {
      localStorage.setItem("userData", JSON.stringify(user));
      setUserData(user);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userData");
      localStorage.removeItem("user");
      localStorage.removeItem("horarioSesion");
      sessionStorage.clear();
    } catch {}
    setUserData(null);
  };

  // -------------------- CURRENT USER INFO --------------------
  const rol = (
    userData?.rol_ref?.nombre ||
    userData?.rol ||
    ''
  ).toString().toUpperCase();

  const nombre = userData?.nombre || '';
  const equipo = userData?.equipo || '';
  const isAdmin = rol === "ADMIN";

  // ======================================================
  //                     ROUTES
  // ======================================================
  return (
    <Router>
      {!userData ? (
        <Routes>
          <Route path="*" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        </Routes>
      ) : (
        <>
          {/* NAVBAR */}
          <Navbar
            isAdmin={isAdmin}
            rol={rol}
            equipo={equipo}
            nombre={nombre}
            onLogout={handleLogout}
          />

          <Routes>
            {/* DEFAULT VIEW */}
            <Route path="/" element={<Registro userData={userData} />} />

            {/* ==================== ADMIN ROUTES ==================== */}

            <Route
              path="/GraficoBase"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="GRAFICOS_VER">
                  <GraficoBase userData={userData} />
                </AdminRoute>
              }
            />

            <Route
              path="/BaseRegistros"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="REGISTROS_VER">
                  <BaseRegistros />
                </AdminRoute>
              }
            />

            <Route
              path="/Oportunidades"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="OPORTUNIDADES_EDITAR">
                  <Oportunidades />
                </AdminRoute>
              }
            />

            <Route
              path="/grafico"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']} requirePermiso="GRAFICOS_VER">
                  <PanelGraficos />
                </AdminRoute>
              }
            />

            <Route
              path="/OportunidadesDashboard"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']} requirePermiso="OPORTUNIDADES_VER">
                  <OportunidadesDashboard />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="CONFIG_VER">
                  <Configuracion />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/usuarios"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="USUARIOS_ADMIN">
                  <ConsultoresTable />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/clientes"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="CLIENTES_ADMIN">
                  <ClientesTable />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/permisos"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="PERMISOS_ADMIN">
                  <PermisosPage />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/ocupaciones-tareas"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="OCUPACIONES_ADMIN">
                  <OcupacionesTareasPage />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/roles"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="ROLES_ADMIN">
                  <RolesPage />
                </AdminRoute>
              }
            />
            
            <Route
              path="/configuracion/equipos"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="EQUIPOS_ADMIN">
                  <EquiposPage />
                </AdminRoute>
              }
            />

            <Route
              path="/reportes/horas-consultor-cliente"
              element={
                <AdminRoute
                  allow={["ADMIN"]}
                >
                  <ReporteHorasConsultorCliente />
                </AdminRoute>
              }
            />
            
            <Route
              path="/configuracion/importar-presupuesto"
              element={
                <AdminRoute allow={["ADMIN"]} requirePermiso="PRESUPUESTO_CONSULTOR_IMPORTAR">
                  <PresupuestoConsultorImport />
                </AdminRoute>
              }
            />

            {/* CATCH ALL */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      )}
    </Router>
  );
}

export default App;


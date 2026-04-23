import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Swal from 'sweetalert2';

import Login from './Login';
import Registro from './Registro';
import Navbar from './Navbar/Navbar';
/*import PanelGraficos from './PanelGraficos';
import GraficoBase from './GraficoBase';
import BaseRegistros from './BaseRegistros';*/
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
import Proyectos from "./Proyectos";
import ModulosAdmin from "./ModulosAdmin";
import ProyectosHorasDashboard from './ProyectosHorasDashboard';
import PanelGrafico from './PanelGrafico';
import PerfilesPage from "./PerfilesPage";
import CostoConsultorPage from "./CostoConsultorPage";
import DashboardCostos from "./DashboardCostos";
import { jfetch } from './lib/api';

const AUTO_LOGOUT_HOURS = [6, 7, 8, 10, 18, 22];

function getNextScheduledLogout(now = new Date()) {
  for (const hour of AUTO_LOGOUT_HOURS) {
    const candidate = new Date(now);
    candidate.setHours(hour, 0, 0, 0);

    if (candidate > now) {
      return candidate;
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(AUTO_LOGOUT_HOURS[0], 0, 0, 0);
  return tomorrow;
}

function getSchedulesBetween(start, end) {
  if (!start || !end || end <= start) return [];

  const matches = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    AUTO_LOGOUT_HOURS.forEach((hour) => {
      const candidate = new Date(cursor);
      candidate.setHours(hour, 0, 0, 0);

      if (candidate > start && candidate <= end) {
        matches.push(candidate);
      }
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return matches.sort((a, b) => a.getTime() - b.getTime());
}

function formatHour(date) {
  return date.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function App() {
  const [userData, setUserData] = useState(null);

  const autoLogoutTimerRef = useRef(null);
  const lastCheckRef = useRef(new Date());
  const lastAutoLogoutKeyRef = useRef('');

  const clearClientSession = useCallback(() => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userData");
      localStorage.removeItem("user");
      localStorage.removeItem("userRol");
      localStorage.removeItem("userUsuario");
      localStorage.removeItem("consultorId");
      localStorage.removeItem("horarioSesion");
      sessionStorage.clear();
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("userData");
      if (rawUser) setUserData(JSON.parse(rawUser));
    } catch {}
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "userData" && !e.newValue) setUserData(null);
      if (e.key === "token" && !e.newValue) setUserData(null);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLoginSuccess = (payload) => {
    const token = payload?.token || null;
    const user = payload?.user || payload || null;

    if (token) localStorage.setItem("token", token);

    if (user) {
      localStorage.setItem("userData", JSON.stringify(user));
      setUserData(user);
    }

    lastCheckRef.current = new Date();
    lastAutoLogoutKeyRef.current = '';
  };

  const handleLogout = useCallback(async (showMessage = false, messageText = 'Sesión cerrada correctamente.') => {
    try {
      await jfetch('/logout', {
        method: 'POST',
      });
    } catch (e) {
      console.error('Error cerrando sesión en backend:', e);
    }

    clearClientSession();
    setUserData(null);

    if (showMessage) {
      Swal.fire({
        icon: 'info',
        title: 'Sesión finalizada',
        text: messageText,
        confirmButtonText: 'Entendido',
      });
    }
  }, [clearClientSession]);

  useEffect(() => {
    if (!userData) {
      if (autoLogoutTimerRef.current) {
        clearTimeout(autoLogoutTimerRef.current);
        autoLogoutTimerRef.current = null;
      }
      return;
    }

    const doAutoLogout = async (scheduledDate) => {
      const key = scheduledDate.toISOString();

      if (lastAutoLogoutKeyRef.current === key) return;
      lastAutoLogoutKeyRef.current = key;

      await handleLogout(
        true,
        `La sesión se cerró automáticamente por política horaria de las ${formatHour(scheduledDate)}.`
      );
    };

    const scheduleNextCheck = () => {
      if (autoLogoutTimerRef.current) {
        clearTimeout(autoLogoutTimerRef.current);
      }

      const now = new Date();
      const nextLogout = getNextScheduledLogout(now);
      const delay = Math.max(1000, nextLogout.getTime() - now.getTime() + 500);

      autoLogoutTimerRef.current = setTimeout(() => {
        doAutoLogout(nextLogout);
      }, delay);
    };

    const checkMissedSchedules = async () => {
      const now = new Date();
      const passedSchedules = getSchedulesBetween(lastCheckRef.current, now);
      lastCheckRef.current = now;

      if (passedSchedules.length > 0) {
        await doAutoLogout(passedSchedules[0]);
        return true;
      }

      return false;
    };

    const revalidateSchedule = async () => {
      if (!userData) return;
      const loggedOut = await checkMissedSchedules();
      if (!loggedOut) {
        scheduleNextCheck();
      }
    };

    revalidateSchedule();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        revalidateSchedule();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);

      if (autoLogoutTimerRef.current) {
        clearTimeout(autoLogoutTimerRef.current);
        autoLogoutTimerRef.current = null;
      }
    };
  }, [userData, handleLogout]);

  const rol = (
    userData?.rol_ref?.nombre ||
    userData?.rol ||
    ''
  ).toString().toUpperCase();

  const nombre = userData?.nombre || '';
  const equipo = userData?.equipo || '';
  const isAdmin = rol === "ADMIN";

  return (
    <Router>
      {!userData ? (
        <Routes>
          <Route path="*" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        </Routes>
      ) : (
        <>
          <Navbar
            isAdmin={isAdmin}
            rol={rol}
            equipo={equipo}
            nombre={nombre}
            onLogout={() => handleLogout(true)}
          />

          <Routes>
            <Route path="/" element={<Registro userData={userData} />} />

            <Route
              path="/Oportunidades"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="OPORTUNIDADES_EDITAR">
                  <Oportunidades />
                </AdminRoute>
              }
            />

            <Route
              path="/panel-grafico"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']} requirePermiso="GRAFICOS_VER">
                  <PanelGrafico />
                </AdminRoute>
              }
            />

            <Route
              path="/proyectos-horas"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']} requirePermiso="GRAFICOS_VER">
                  <ProyectosHorasDashboard userData={userData} />
                </AdminRoute>
              }
            />

            <Route
              path="/OportunidadesDashboard"
              element={
                <AdminRoute allow={['ADMIN', 'CONSULTOR']} requirePermiso="DASHBOARD_VER">
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
              path="/configuracion/proyectos"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="PROYECTOS_ADMIN">
                  <Proyectos />
                </AdminRoute>
              }
            />

            <Route
              path="/configuracion/modulos"
              element={
                <AdminRoute allow={['ADMIN']} requirePermiso="ADMIN_MODULOS_GESTION">
                  <ModulosAdmin />
                </AdminRoute>
              }
            />

            <Route
              path="/reportes/horas-consultor-cliente"
              element={
                <AdminRoute allow={["ADMIN"]}>
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

            <Route
              path="/perfiles"
              element={
                <AdminRoute>
                  <PerfilesPage />
                </AdminRoute>
              }
            />

            <Route
              path="/reportes/costo-consultor"
              element={
                <AdminRoute allow={["ADMIN"]}>
                  <CostoConsultorPage />
                </AdminRoute>
              }
            />

            <Route
              path="/dashboard-costos"
              element={
                <AdminRoute allow={["ADMIN"]}>
                  <DashboardCostos />
                </AdminRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      )}
    </Router>
  );
}

export default App;
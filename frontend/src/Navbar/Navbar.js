import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logoNav from '../assets/logo_navbar.png';
import { jfetch } from '../lib/api';

const Navbar = ({ isAdmin: isAdminProp, rol: rolProp, nombre: nombreProp, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [coeMenuOpen, setCoeMenuOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const navigate = useNavigate();
  const refreshMe = useCallback(async () => {
    try {
      const res = await jfetch('/me', { method: 'GET' });
      const data = res?.user ? res : await res.json();
      if (!data?.user) return;
      localStorage.setItem('userData', JSON.stringify(data.user));
      setRefreshTick(t => t + 1);
    } catch {}
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);
  const { isAdmin, nombre, rol, permisos } = useMemo(() => {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('userData') || localStorage.getItem('user') || 'null'); } catch {}
    const rolUpper = String(rolProp || raw?.rol || raw?.user?.rol || raw?.role || '').trim().toUpperCase();
    const list = raw?.permisos ?? raw?.user?.permisos ?? [];
    return {
      isAdmin: rolUpper === 'ADMIN' || isAdminProp === true,
      nombre: nombreProp || raw?.nombre || raw?.user?.nombre || raw?.name || '',
      rol: rolUpper,
      permisos: Array.isArray(list) ? list.map(p => typeof p === 'string' ? p : p?.codigo || p?.code || p?.nombre).filter(Boolean).map(p => String(p).trim().toUpperCase()) : []
    };
  }, [isAdminProp, rolProp, nombreProp, refreshTick]);
  const can = useCallback(perm => isAdmin || permisos.includes(String(perm || '').trim().toUpperCase()), [isAdmin, permisos]);
  // Triara usa permiso explícito igual que su backend, incluso para ADMIN.
  const canTriara = permisos.includes('ASISTENCIA_TRIARA_VER');
  const closeMenu = () => { setOpen(false); setCoeMenuOpen(false); };
  const toggleCoeMenu = e => { e.preventDefault(); e.stopPropagation(); setCoeMenuOpen(v => !v); };
  const handleLogout = useCallback(async () => {
    try { await jfetch('/logout', { method: 'POST' }); } catch {}
    try {
      ['token', 'userData', 'user', 'horarioSesion'].forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {}
    try { if (typeof onLogout === 'function') onLogout(); } catch {}
    navigate('/login', { replace: true });
    setTimeout(() => window.location.reload(), 50);
  }, [navigate, onLogout]);
  const coeLinks = [
    ['/coe-sap-funcional', '📄', 'Base cargada', 'Consulta e importación principal'],
    ['/coe-sap-funcional/calificacion', '✅', 'Consolidación', 'Calificación, horas y sincronización'],
    ['/coe-sap-funcional/promedio-atencion', '⏱️', 'Promedio atención', 'Tiempos de respuesta, resolución y cierre'],
    ['/coe-sap-funcional/dashboard-clientes', '📊', 'Dashboard clientes', 'Gráficas globales afectadas por filtros'],
    ['/coe-sap-funcional/control-bolsa', '🧮', 'Control conciliación contratos', 'Tabla manual independiente por cliente'],
    ['/coe-sap-funcional/detalle-seguimiento', '📝', 'Informe Cliente', 'Información de informe cliente']
  ];
  return (
    <header className="navc-header">
      <button className="navc-hamburger" onClick={() => setOpen(v => !v)} aria-label="Abrir menú" type="button">☰</button>
      <nav className={`navc-navbar ${open ? 'open' : ''}`}>
        <Link to="/" className="navc-logo" aria-label="Ir al inicio" onClick={closeMenu}><img src={logoNav} alt="CORA" /></Link>
        <Link to="/" onClick={closeMenu}>Inicio</Link>
        <Link to="/panel-grafico" onClick={closeMenu}>Panel Gráfico</Link>
        {can('OPORTUNIDADES_VER') && <Link to="/Oportunidades" onClick={closeMenu}>Oportunidades</Link>}
        {can('DASHBOARD_VER') && <Link to="/OportunidadesDashboard" onClick={closeMenu}>Dashboard</Link>}
        {can('PAGE_REPORTE_HORAS_CONSULTOR') && <Link to="/reportes/horas-consultor-cliente" onClick={closeMenu}>Reporte Horas</Link>}
        {can('BASE_REGISTRO_VER') && (
          <div className={`navc-dropdown ${coeMenuOpen ? 'open' : ''}`} onMouseEnter={() => setCoeMenuOpen(true)} onMouseLeave={() => setCoeMenuOpen(false)}>
            <button type="button" className="navc-dropdown-trigger" onClick={toggleCoeMenu} aria-expanded={coeMenuOpen} aria-haspopup="true">
              <span>Base COE SAP</span><span className="navc-dropdown-arrow">▾</span>
            </button>
            <div className="navc-dropdown-menu">
              {can('BASE_REGISTRO_IMPORTAR') && <Link to="/coe-sap-funcional/cargas" onClick={closeMenu}><span className="navc-sub-icon">⚙️</span><span><strong>Configuración COE SAP</strong><small>Estados, subestados, clientes y clasificación</small></span></Link>}
              {coeLinks.map(([to, icon, title, detail]) => <Link key={to} to={to} onClick={closeMenu}><span className="navc-sub-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span></Link>)}
            </div>
          </div>
        )}
        {canTriara && <Link to="/asistencia-triara" onClick={closeMenu}>Asistencia a Triara</Link>}
        {can('CONFIGURACION_VER') && <Link to="/configuracion" className="navc-settings" onClick={closeMenu}>⚙️</Link>}
        <span className="navc-spacer" />
        {(nombre || rol) && <span className="navc-user">{nombre || 'Usuario'} {rol && <em>({rol})</em>}</span>}
        <button className="navc-logout" onClick={handleLogout} type="button">Salir</button>
      </nav>
    </header>
  );
};
export default Navbar;

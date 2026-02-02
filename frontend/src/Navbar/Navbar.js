import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logoNav from '../assets/logo_navbar.png';
import { jfetch } from '../lib/api';

const Navbar = ({ isAdmin: isAdminProp, rol: rolProp, nombre: nombreProp, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0); 
  const navigate = useNavigate();

  const readStoredUser = () => {
    let raw = null;
    try {
      raw = JSON.parse(
        localStorage.getItem('userData') ||
        localStorage.getItem('user') ||
        'null'
      );
    } catch {}
    return raw;
  };


  const refreshMe = useCallback(async () => {
    try {
      const res = await jfetch('/me', { method: 'GET' });

      const data = res?.user ? res : await (async () => {
        try { return await res.json(); } catch { return null; }
      })();

      const user = data?.user;
      if (!user) return;

      
      localStorage.setItem('userData', JSON.stringify(user));
      setRefreshTick(t => t + 1);
    } catch {
      
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  
  const { isAdmin, nombre, rol, permisos } = useMemo(() => {
    const raw = readStoredUser();

    const _rol = rolProp || raw?.rol || raw?.user?.rol || raw?.role || '';
    const _nombre = nombreProp || raw?.nombre || raw?.user?.nombre || raw?.name || '';
    const rolUpper = String(_rol || '').toUpperCase();

    
    const permsRaw = raw?.permisos ?? raw?.user?.permisos ?? [];
    const perms = Array.isArray(permsRaw)
      ? permsRaw
          .map(p => (typeof p === 'string' ? p : (p?.codigo || p?.code || p?.nombre)))
          .filter(Boolean)
      : [];

    return {
      isAdmin: rolUpper === 'ADMIN' || isAdminProp === true,
      nombre: _nombre,
      rol: rolUpper,
      permisos: perms
    };
  }, [isAdminProp, rolProp, nombreProp, refreshTick]);


  const can = useCallback((perm) => {
    if (isAdmin) return true;
    return permisos.includes(perm);
  }, [isAdmin, permisos]);


  const toggleMenu = () => setOpen(v => !v);

  const hardClean = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('userData');
      localStorage.removeItem('user');
      localStorage.removeItem('horarioSesion');
      sessionStorage.clear();
    } catch {}
  };

  const handleLogout = useCallback(async () => {
    try { await jfetch('/logout', { method: 'POST' }); } catch {}
    hardClean();
    try { typeof onLogout === 'function' && onLogout(); } catch {}
    navigate('/login', { replace: true });
    setTimeout(() => window.location.reload(), 50);
  }, [navigate, onLogout]);

  return (
    <header className="navc-header">
      <button className="navc-hamburger" onClick={toggleMenu} aria-label="Abrir menú">☰</button>

      <nav className={`navc-navbar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>

        <Link to="/" className="navc-logo" aria-label="Ir al inicio">
          <img src={logoNav} alt="CORA" />
        </Link>

        <Link to="/">Inicio</Link>
        <Link to="/grafico">Panel Gráfico</Link>

        {can("BASE_REGISTROS_VER") && <Link to="/BaseRegistros">Base Registros</Link>}
        {can("GRAFICO_BASE_VER") && <Link to="/GraficoBase">Gráfico Base</Link>}

        {can("OPORTUNIDADES_VER") && <Link to="/Oportunidades">Oportunidades</Link>}

        {can("DASHBOARD_VER") && (
          <Link to="/OportunidadesDashboard">Dashboard</Link>
        )}

        {can("PAGE_REPORTE_HORAS_CONSULTOR") && (
          <Link to="/reportes/horas-consultor-cliente">Reporte Horas</Link>
        )}

        {can("PRESUPUESTO_CONSULTOR_IMPORTAR") && (
          <Link to="/configuracion/importar-presupuesto">Importar Excel</Link>
        )}

        {can("CONFIGURACION_VER") && (
          <Link to="/configuracion" className="navc-settings">⚙️</Link>
        )}

        <span className="navc-spacer" />

        {(nombre || rol) && (
          <span className="navc-user">
            {nombre || 'Usuario'} {rol && <em>({rol})</em>}
          </span>
        )}

        <button className="navc-logout" onClick={handleLogout}>Salir</button>
      </nav>
    </header>
  );
};

export default Navbar;

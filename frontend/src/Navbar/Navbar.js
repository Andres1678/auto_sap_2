import React, { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logoNav from '../assets/logo_navbar.png';
import { jfetch } from '../lib/api';

const Navbar = ({ isAdmin: isAdminProp, rol: rolProp, nombre: nombreProp, onLogout }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { isAdmin, nombre, rol, permisos } = useMemo(() => {
    let raw = null;
    try {
      raw = JSON.parse(
        localStorage.getItem('userData') ||
        localStorage.getItem('user') ||
        'null'
      );
    } catch {}

    const _rol = rolProp || raw?.rol || raw?.user?.rol || '';
    const _nombre = nombreProp || raw?.nombre || raw?.user?.nombre || '';
    const rolUpper = String(_rol || '').toUpperCase();
    const perms = raw?.permisos ? raw.permisos.map(p => p.codigo) : [];

    return {
      isAdmin: rolUpper === 'ADMIN',
      nombre: _nombre,
      rol: rolUpper,
      permisos: perms
    };
  }, [isAdminProp, rolProp, nombreProp]);

  const can = (perm) => isAdmin || permisos.includes(perm);

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

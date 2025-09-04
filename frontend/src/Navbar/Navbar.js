import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logoNav from '../assets/logo_navbar.png';

const Navbar = ({ isAdmin: isAdminProp, rol: rolProp, nombre: nombreProp, onLogout }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { isAdmin, nombre, rol } = useMemo(() => {
    
    if (isAdminProp != null || rolProp || nombreProp) {
      const rolUpper = String(rolProp || '').toUpperCase();
      return {
        isAdmin: !!isAdminProp || rolUpper === 'ADMIN',
        nombre : nombreProp || '',
        rol    : rolUpper
      };
    }

    
    let raw = null;
    try {
      raw = JSON.parse(
        localStorage.getItem('userData') ||
        localStorage.getItem('user') ||
        'null'
      );
    } catch { /* noop */ }

    const _rol     = raw?.rol ?? raw?.user?.rol ?? '';
    const _nombre  = raw?.nombre ?? raw?.user?.nombre ?? '';
    const rolUpper = String(_rol || '').toUpperCase();
    return { isAdmin: rolUpper === 'ADMIN', nombre: _nombre, rol: rolUpper };
  }, [isAdminProp, rolProp, nombreProp]);

  const toggleMenu = () => setOpen(v => !v);

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
      return;
    }
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    localStorage.removeItem('user');
    navigate('/', { replace: true });
    window.location.reload();
  };

  return (
    <header className="navc-header">
      <button className="navc-hamburger" onClick={toggleMenu} aria-label="Abrir menú">☰</button>

      <nav className={`navc-navbar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        
        <Link to="/" className="navc-logo" aria-label="Ir al inicio">
          <img src={logoNav} alt="CORA" />
        </Link>

        
        <Link to="/">Inicio</Link>
        <Link to="/grafico">Panel Gráfico</Link>

       
        {isAdmin && <Link to="/BaseRegistros">Base Registros</Link>}
        {isAdmin && <Link to="/GraficoBase">Gráfico Base</Link>}

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


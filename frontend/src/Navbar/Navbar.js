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
        try {
          return await res.json();
        } catch {
          return null;
        }
      })();

      const user = data?.user;

      if (!user) return;

      localStorage.setItem('userData', JSON.stringify(user));
      setRefreshTick(t => t + 1);
    } catch {
      // Silencioso para no romper el navbar si /me falla
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
          .map(p => String(p).trim().toUpperCase())
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
    return permisos.includes(String(perm || '').trim().toUpperCase());
  }, [isAdmin, permisos]);

  const toggleMenu = () => {
    setOpen(v => !v);
  };

  const closeMenu = () => {
    setOpen(false);
    setCoeMenuOpen(false);
  };

  const toggleCoeMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCoeMenuOpen(v => !v);
  };

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
    try {
      await jfetch('/logout', { method: 'POST' });
    } catch {}

    hardClean();

    try {
      typeof onLogout === 'function' && onLogout();
    } catch {}

    navigate('/login', { replace: true });

    setTimeout(() => window.location.reload(), 50);
  }, [navigate, onLogout]);

  return (
    <header className="navc-header">
      <button
        className="navc-hamburger"
        onClick={toggleMenu}
        aria-label="Abrir menú"
        type="button"
      >
        ☰
      </button>

      <nav className={`navc-navbar ${open ? 'open' : ''}`}>
        <Link to="/" className="navc-logo" aria-label="Ir al inicio" onClick={closeMenu}>
          <img src={logoNav} alt="CORA" />
        </Link>

        <Link to="/" onClick={closeMenu}>Inicio</Link>

        <Link to="/panel-grafico" onClick={closeMenu}>
          Panel Gráfico
        </Link>

        {/*{can("BASE_REGISTROS_VER") && (
          <Link to="/BaseRegistros" onClick={closeMenu}>Base Registros</Link>
        )}

        {can("GRAFICO_BASE_VER") && (
          <Link to="/GraficoBase" onClick={closeMenu}>Gráfico Base</Link>
        )}*/}

        {can("OPORTUNIDADES_VER") && (
          <Link to="/Oportunidades" onClick={closeMenu}>
            Oportunidades
          </Link>
        )}

        {can("DASHBOARD_VER") && (
          <Link to="/OportunidadesDashboard" onClick={closeMenu}>
            Dashboard
          </Link>
        )}

        {can("PAGE_REPORTE_HORAS_CONSULTOR") && (
          <Link to="/reportes/horas-consultor-cliente" onClick={closeMenu}>
            Reporte Horas
          </Link>
        )}

        {/*{can("PRESUPUESTO_CONSULTOR_IMPORTAR") && (
          <Link to="/configuracion/importar-presupuesto" onClick={closeMenu}>
            Importar presupuesto
          </Link>
        )}*/}

        {can("BASE_REGISTRO_VER") && (
          <div
            className={`navc-dropdown ${coeMenuOpen ? 'open' : ''}`}
            onMouseEnter={() => setCoeMenuOpen(true)}
            onMouseLeave={() => setCoeMenuOpen(false)}
          >
            <button
              type="button"
              className="navc-dropdown-trigger"
              onClick={toggleCoeMenu}
              aria-expanded={coeMenuOpen}
              aria-haspopup="true"
            >
              <span>Base COE SAP Funcional</span>
              <span className="navc-dropdown-arrow">▾</span>
            </button>

            <div className="navc-dropdown-menu">
              <Link to="/coe-sap-funcional" onClick={closeMenu}>
                <span className="navc-sub-icon">📄</span>
                <span>
                  <strong>Base cargada</strong>
                  <small>Consulta e importación principal</small>
                </span>
              </Link>

              <Link to="/coe-sap-funcional/calificacion" onClick={closeMenu}>
                <span className="navc-sub-icon">✅</span>
                <span>
                  <strong>Calificación</strong>
                  <small>Calificación, horas y sincronización</small>
                </span>
              </Link>

              {can("BASE_REGISTRO_IMPORTAR") && (
                <Link to="/coe-sap-funcional/cargas" onClick={closeMenu}>
                  <span className="navc-sub-icon">📤</span>
                  <span>
                    <strong>Cargar bases auxiliares</strong>
                    <small>Listas, SM, ITOP y sincronización</small>
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}

        {can("CONFIGURACION_VER") && (
          <Link to="/configuracion" className="navc-settings" onClick={closeMenu}>
            ⚙️
          </Link>
        )}

        <span className="navc-spacer" />

        {(nombre || rol) && (
          <span className="navc-user">
            {nombre || 'Usuario'} {rol && <em>({rol})</em>}
          </span>
        )}

        <button className="navc-logout" onClick={handleLogout} type="button">
          Salir
        </button>
      </nav>
    </header>
  );
};

export default Navbar;

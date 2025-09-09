import React, { useState } from 'react';
import Swal from 'sweetalert2';
import './Login.css';
import coraLogo from './assets/cora-logo.png';
import { jpost, jsonOrThrow } from './lib/api'; 

const Login = ({ onLoginSuccess }) => {
  const [usuario, setUsuario]   = useState('');
  const [password, setPassword] = useState('');
  const [horario, setHorario]   = useState('');
  const [loading, setLoading]   = useState(false);

  const opcionesHorario = [
    '07:00-17:00','08:00-18:00','07:00-16:00','08:00-12:00',
    '06:00-14:00','14:00-22:00','22:00-06:00', 'DISPONIBLE'
  ];

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!horario) {
      Swal.fire({ icon: 'warning', title: 'Seleccione un horario' });
      return;
    }
    setLoading(true);
    try {
      
      const res   = await jpost('/login', { usuario, password, horario });
      const data  = await jsonOrThrow(res);

      if (data.token) localStorage.setItem('token', data.token);

      const user = data.user || data;
      try {
        localStorage.setItem('user', JSON.stringify(user));
        const h = user?.horarioSesion || horario || user?.horario;
        if (h) localStorage.setItem('horarioSesion', h);
      } catch {}

      Swal.fire({ icon: 'success', title: 'Login exitoso', timer: 1000, showConfirmButton: false });
      onLoginSuccess?.(user);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err?.message || 'No se pudo conectar con el servidor'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authc-shell">
      <div className="authc-card">
        <div className="authc-head">
          <div className="authc-logo" aria-label="CORA — Claro Operations Resource Analyzer">
            <img
              src={coraLogo}
              alt="CORA — Claro Operations Resource Analyzer (Analizador de recursos del COE)"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <form className="authc-form" onSubmit={handleLogin}>
          <div className="authc-field">
            <label className="authc-label">Usuario</label>
            <input
              className="authc-input"
              type="text"
              placeholder="Escribe tu usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
          </div>

          <div className="authc-field">
            <label className="authc-label">Contraseña</label>
            <div className="authc-input-wrap">
              <input
                className="authc-input"
                type="password"
                placeholder="Escribe tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="authc-field">
            <label className="authc-label">Horario</label>
            <select
              className="authc-select"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              required
            >
              <option value="">Seleccionar horario</option>
              {opcionesHorario.map((h, idx) => (
                <option key={idx} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div className="authc-actions">
            <button className="authc-btn authc-btn--primary" type="submit" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>

          <p className="authc-help">Soporte: gonzalezanf@hitss.com/andres.gonzalezp@claro.com.co</p>
        </form>
      </div>
    </div>
  );
};

export default Login;


import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import './Login.css';
import coraLogo from './assets/cora-logo.png';
import { jfetch } from './lib/api';


const Login = ({ onLoginSuccess }) => {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [horario, setHorario] = useState('');
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(false);

  // ===========================
  // CARGAR HORARIOS
  // ===========================
  useEffect(() => {
    const cargarHorarios = async () => {
      try {
        const res = await jfetch('/horarios');
        if (!res.ok) throw new Error('No se pudieron cargar los horarios');

        const data = await res.json();
        setHorarios(data);

      } catch (err) {
        console.error('Error cargando horarios:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error al cargar horarios',
          text: err.message || 'No se pudieron obtener los horarios'
        });
      }
    };
    cargarHorarios();
  }, []);

  // ===========================
  // LOGIN
  // ===========================
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!horario) {
      Swal.fire({ icon: 'warning', title: 'Seleccione un horario' });
      return;
    }

    setLoading(true);

    try {
      const res = await jfetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ usuario, password, horario }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.mensaje || `Error ${res.status}`);
      }

      const data = await res.json();

    
      const user = data.user; 

      if (!user) {
        throw new Error("La respuesta del servidor no contiene 'user'");
      }

      // LIMPIAR TODO
      localStorage.clear();

      // Guardar token
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Guardar usuario completo
      localStorage.setItem("userData", JSON.stringify(user));

      // Opcional: guardar datos separados
      localStorage.setItem("userRol", user.rol || "");
      localStorage.setItem("userUsuario", user.usuario || "");

      if (user.consultor_id) {
        localStorage.setItem("consultorId", user.consultor_id);
      }

      // Guardar horario seleccionado
      if (horario) {
        localStorage.setItem("horarioSesion", horario);
      }

      Swal.fire({
        icon: 'success',
        title: 'Login exitoso',
        timer: 1200,
        showConfirmButton: false
      });

      // Notificar al padre
      onLoginSuccess?.(user);

    } catch (err) {
      console.error('Error en login:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error al iniciar sesión',
        text: err.message || 'No se pudo conectar con el servidor'
      });

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authc-shell">
      <div className="authc-card">
        <div className="authc-head">
          <div className="authc-logo">
            <img
              src={coraLogo}
              alt="CORA — Claro Operations Resource Analyzer"
              loading="lazy"
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
            <input
              className="authc-input"
              type="password"
              placeholder="Escribe tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
              {horarios.map((h) => (
                <option key={h.id} value={h.rango}>
                  {h.rango}
                </option>
              ))}
            </select>
          </div>

          <div className="authc-actions">
            <button
              className="authc-btn authc-btn--primary"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>

          <p className="authc-help">
            Soporte: gonzalezanf@hitss.com / andres.gonzalezp@claro.com.co
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;

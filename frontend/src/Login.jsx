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

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    usuario: '',
    passwordActual: '',
    nuevaPassword: '',
    confirmarPassword: '',
  });

  useEffect(() => {
    const u = usuario.trim();
    if (!u) {
      setHorarios([]);
      setHorario("");
      return;
    }

    const id = setTimeout(async () => {
      try {
        const res = await jfetch(`/horarios-permitidos?usuario=${encodeURIComponent(u)}`);
        const data = await res.json().catch(() => ({}));
        setHorarios(Array.isArray(data?.horarios) ? data.horarios : []);
      } catch {
        setHorarios([]);
      }
    }, 250);

    return () => clearTimeout(id);
  }, [usuario]);

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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `Error ${res.status}`);
      }

      const user = data?.user;
      const token = data?.token;

      if (!user) {
        throw new Error("La respuesta del servidor no contiene 'user'");
      }

      if (!token) {
        throw new Error("La respuesta del servidor no contiene 'token'");
      }

      localStorage.clear();

      localStorage.setItem("token", token);
      localStorage.setItem("userData", JSON.stringify(user));
      localStorage.setItem("userRol", user.rol || "");
      localStorage.setItem("userUsuario", user.usuario || "");

      if (user.consultor_id) {
        localStorage.setItem("consultorId", user.consultor_id);
      }

      if (horario) {
        localStorage.setItem("horarioSesion", horario);
      }

      Swal.fire({
        icon: 'success',
        title: 'Login exitoso',
        timer: 1200,
        showConfirmButton: false
      });

      onLoginSuccess?.({
        token,
        user
      });
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

  const openChangePassword = () => {
    setPasswordForm({
      usuario: usuario.trim(),
      passwordActual: '',
      nuevaPassword: '',
      confirmarPassword: '',
    });
    setShowChangePassword(true);
  };

  const closeChangePassword = () => {
    if (changePasswordLoading) return;

    setShowChangePassword(false);
    setPasswordForm({
      usuario: '',
      passwordActual: '',
      nuevaPassword: '',
      confirmarPassword: '',
    });
  };

  const handleChangePasswordInput = (field, value) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();

    const usuarioCambio = passwordForm.usuario.trim();

    if (!usuarioCambio) {
      return Swal.fire({
        icon: 'warning',
        title: 'Usuario requerido',
        text: 'Debes escribir el usuario.',
      });
    }

    if (!passwordForm.passwordActual) {
      return Swal.fire({
        icon: 'warning',
        title: 'Contraseña actual requerida',
      });
    }

    if (!passwordForm.nuevaPassword || !passwordForm.confirmarPassword) {
      return Swal.fire({
        icon: 'warning',
        title: 'Nueva contraseña requerida',
      });
    }

    if (passwordForm.nuevaPassword.length < 6) {
      return Swal.fire({
        icon: 'warning',
        title: 'Contraseña muy corta',
        text: 'La nueva contraseña debe tener mínimo 6 caracteres.',
      });
    }

    if (passwordForm.nuevaPassword !== passwordForm.confirmarPassword) {
      return Swal.fire({
        icon: 'warning',
        title: 'Las contraseñas no coinciden',
        text: 'La nueva contraseña y la confirmación deben ser iguales.',
      });
    }

    setChangePasswordLoading(true);

    try {
      const res = await jfetch('/cambiar-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          usuario: usuarioCambio,
          passwordActual: passwordForm.passwordActual,
          nuevaPassword: passwordForm.nuevaPassword,
          confirmarPassword: passwordForm.confirmarPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `Error ${res.status}`);
      }

      setUsuario(usuarioCambio);
      setPassword('');
      closeChangePassword();

      Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: 'Ahora puedes ingresar con tu nueva contraseña.',
      });
    } catch (err) {
      console.error('Error cambiando contraseña:', err);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cambiar la contraseña',
        text: err.message || 'Intenta nuevamente.',
      });
    } finally {
      setChangePasswordLoading(false);
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
              {horarios.map(h => (
                <option key={h} value={h}>{h}</option>
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

            <button
              className="authc-btn authc-btn--secondary"
              type="button"
              onClick={openChangePassword}
              disabled={loading}
            >
              Cambiar contraseña
            </button>
          </div>

          <p className="authc-help">
            Soporte: gonzalezanf@hitss.com / andres.gonzalezp@claro.com.co
          </p>
        </form>
      </div>

      {showChangePassword && (
        <div className="authc-modal-overlay">
          <div className="authc-modal">
            <div className="authc-modal-head">
              <div>
                <h3>Cambiar contraseña</h3>
                <p>Valida tu contraseña actual y define una nueva.</p>
              </div>

              <button
                type="button"
                className="authc-modal-close"
                onClick={closeChangePassword}
                disabled={changePasswordLoading}
              >
                ✕
              </button>
            </div>

            <form className="authc-modal-form" onSubmit={handleChangePasswordSubmit}>
              <div className="authc-field">
                <label className="authc-label">Usuario</label>
                <input
                  className="authc-input"
                  type="text"
                  placeholder="Escribe tu usuario"
                  value={passwordForm.usuario}
                  onChange={(e) => handleChangePasswordInput('usuario', e.target.value)}
                  required
                />
              </div>

              <div className="authc-field">
                <label className="authc-label">Contraseña actual</label>
                <input
                  className="authc-input"
                  type="password"
                  placeholder="Contraseña actual"
                  value={passwordForm.passwordActual}
                  onChange={(e) => handleChangePasswordInput('passwordActual', e.target.value)}
                  required
                />
              </div>

              <div className="authc-field">
                <label className="authc-label">Nueva contraseña</label>
                <input
                  className="authc-input"
                  type="password"
                  placeholder="Nueva contraseña"
                  value={passwordForm.nuevaPassword}
                  onChange={(e) => handleChangePasswordInput('nuevaPassword', e.target.value)}
                  required
                />
              </div>

              <div className="authc-field">
                <label className="authc-label">Confirmar nueva contraseña</label>
                <input
                  className="authc-input"
                  type="password"
                  placeholder="Confirma la nueva contraseña"
                  value={passwordForm.confirmarPassword}
                  onChange={(e) => handleChangePasswordInput('confirmarPassword', e.target.value)}
                  required
                />
              </div>

              <div className="authc-modal-actions">
                <button
                  type="button"
                  className="authc-btn authc-btn--secondary"
                  onClick={closeChangePassword}
                  disabled={changePasswordLoading}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="authc-btn authc-btn--primary"
                  disabled={changePasswordLoading}
                >
                  {changePasswordLoading ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
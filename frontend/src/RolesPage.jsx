import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./RolesPage.css";
import { API_URL } from "./config.js";

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [permisosRol, setPermisosRol] = useState([]);

  const [selectedRol, setSelectedRol] = useState(null);
  const [nuevoRol, setNuevoRol] = useState("");

  const userData = JSON.parse(localStorage.getItem("userData") || "{}");

  const api = (endpoint, options = {}) =>
    fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-User-Usuario": userData.usuario,
        "X-User-Rol": userData.rol,
        ...options.headers,
      },
    });

  // ==================================================
  // Cargar roles y permisos
  // ==================================================
  const loadRoles = async () => {
    const res = await api("/api/roles");
    if (res.ok) {
      setRoles(await res.json());
    }
  };

  const loadPermisos = async () => {
    const res = await api("/api/permisos");
    if (res.ok) {
      setPermisos(await res.json());
    }
  };

  const loadPermisosRol = async (rolId) => {
    const res = await api(`/api/roles/${rolId}/permisos`);
    if (res.ok) {
      const data = await res.json();
      setPermisosRol(data.map((p) => p.codigo));
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermisos();
  }, []);

  // ==================================================
  // CREAR ROL
  // ==================================================
  const crearRol = async () => {
    if (!nuevoRol.trim()) {
      Swal.fire("Error", "Ingrese un nombre de rol", "warning");
      return;
    }

    const res = await api("/api/roles", {
      method: "POST",
      body: JSON.stringify({ nombre: nuevoRol }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire("Error", data.mensaje || "No se pudo crear el rol", "error");
      return;
    }

    Swal.fire("Éxito", "Rol creado correctamente", "success");
    setNuevoRol("");
    loadRoles();
  };

  // ==================================================
  // ASIGNAR PERMISO
  // ==================================================
  const asignarPermiso = async (permisoId) => {
    if (!selectedRol) return;

    const res = await api(`/api/roles/${selectedRol.id}/permisos`, {
      method: "POST",
      body: JSON.stringify({ permiso_id: permisoId }),
    });

    if (res.ok) {
      loadPermisosRol(selectedRol.id);
    } else {
      Swal.fire("Advertencia", "Ese permiso ya está asignado", "info");
    }
  };

  // ==================================================
  // QUITAR PERMISO
  // ==================================================
  const quitarPermiso = async (codigo) => {
    if (!selectedRol) return;

    const permiso = permisos.find((p) => p.codigo === codigo);
    if (!permiso) return;

    const res = await api(
      `/api/roles/${selectedRol.id}/permisos/${permiso.id}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      loadPermisosRol(selectedRol.id);
    }
  };

  return (
    <div id="roles-wrapper">

      <h1 className="roles-title">🛡️ Administración de Roles</h1>

      <div className="roles-grid">

        {/* ======================= CARD ROLES ======================= */}
        <div className="roles-card">
          <h2>Roles Existentes</h2>

          <div className="roles-create">
            <input
              type="text"
              placeholder="Nombre del rol"
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value)}
            />
            <button onClick={crearRol}>Crear Rol</button>
          </div>

          <ul className="roles-list">
            {roles.map((rol) => (
              <li
                key={rol.id}
                className={selectedRol?.id === rol.id ? "active" : ""}
                onClick={() => {
                  setSelectedRol(rol);
                  loadPermisosRol(rol.id);
                }}
              >
                🧩 {rol.nombre}
              </li>
            ))}
          </ul>
        </div>

        {/* ======================= CARD PERMISOS ======================= */}
        <div className="roles-card">
          <h2>Permisos del Rol</h2>

          {!selectedRol && (
            <p className="roles-empty">Selecciona un rol para asignar permisos</p>
          )}

          {selectedRol && (
            <>
              <h3>Rol seleccionado: {selectedRol.nombre}</h3>

              <div className="permisos-asignados">
                <h4>Permisos asignados</h4>
                <div className="chips-container">
                  {permisosRol.map((codigo) => (
                    <span className="chip" key={codigo}>
                      {codigo}
                      <button onClick={() => quitarPermiso(codigo)}>❌</button>
                    </span>
                  ))}

                  {permisosRol.length === 0 && (
                    <p className="roles-empty">Sin permisos asignados</p>
                  )}
                </div>
              </div>

              <div className="permisos-todos">
                <h4>Asignar nuevos permisos</h4>
                <ul>
                  {permisos
                    .filter((p) => !permisosRol.includes(p.codigo))
                    .map((p) => (
                      <li key={p.id}>
                        <button onClick={() => asignarPermiso(p.id)}>➕</button>
                        {p.codigo} — {p.descripcion}
                      </li>
                    ))}
                </ul>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

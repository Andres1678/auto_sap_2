import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./RolesPage.css";
import { jfetch } from "./lib/api";

const jsonOrThrow = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.mensaje || "Error");
  return data;
};


export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [permisosRol, setPermisosRol] = useState([]);

  const [selectedRol, setSelectedRol] = useState(null);
  const [nuevoRol, setNuevoRol] = useState("");

  // ===============================
  // CARGA INICIAL
  // ===============================
  useEffect(() => {
    cargarRoles();
    cargarPermisos();
  }, []);

  const cargarRoles = async () => {
    try {
      const res = await jfetch("/roles");
      const data = await jsonOrThrow(res);
      setRoles(data);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const cargarPermisos = async () => {
    try {
      const res = await jfetch("/permisos");
      const data = await jsonOrThrow(res);
      setPermisos(data);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const cargarPermisosRol = async (rolId) => {
    try {
      const res = await jfetch(`/roles/${rolId}/permisos`);
      const data = await jsonOrThrow(res);
      setPermisosRol(data.map((p) => p.codigo));
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // ===============================
  // CRUD ROL
  // ===============================
  const crearRol = async () => {
    if (!nuevoRol.trim()) {
      Swal.fire("Campo requerido", "Ingrese un nombre de rol", "warning");
      return;
    }

    try {
      const res = await jfetch("/roles", {
        method: "POST",
        body: { nombre: nuevoRol },
      });

      await jsonOrThrow(res);
      Swal.fire("Éxito", "Rol creado correctamente", "success");

      setNuevoRol("");
      cargarRoles();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // ===============================
  // PERMISOS
  // ===============================
  const asignarPermiso = async (permisoId) => {
    if (!selectedRol) return;

    try {
      const res = await jfetch(
        `/roles/${selectedRol.id}/permisos`,
        {
          method: "POST",
          body: { permiso_id: permisoId },
        }
      );

      await jsonOrThrow(res);
      cargarPermisosRol(selectedRol.id);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const quitarPermiso = async (codigo) => {
    if (!selectedRol) return;

    const permiso = permisos.find((p) => p.codigo === codigo);
    if (!permiso) return;

    try {
      const res = await jfetch(
        `/roles/${selectedRol.id}/permisos/${permiso.id}`,
        { method: "DELETE" }
      );

      await jsonOrThrow(res);
      cargarPermisosRol(selectedRol.id);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // ===============================
  // RENDER
  // ===============================
  return (
    <div id="roles-wrapper">
      <h1 className="roles-title">🛡️ Administración de Roles</h1>

      <div className="roles-grid">

        {/* ROLES */}
        <div className="roles-card">
          <h2>Roles</h2>

          <div className="roles-create">
            <input
              type="text"
              placeholder="Nuevo rol"
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value)}
            />
            <button onClick={crearRol}>Crear</button>
          </div>

          <ul className="roles-list">
            {roles.map((r) => (
              <li
                key={r.id}
                className={selectedRol?.id === r.id ? "active" : ""}
                onClick={() => {
                  setSelectedRol(r);
                  cargarPermisosRol(r.id);
                }}
              >
                {r.nombre}
              </li>
            ))}
          </ul>
        </div>

        {/* PERMISOS */}
        <div className="roles-card">
          <h2>Permisos</h2>

          {!selectedRol && (
            <p className="roles-empty">
              Selecciona un rol
            </p>
          )}

          {selectedRol && (
            <>
              <h3>{selectedRol.nombre}</h3>

              <div className="permisos-asignados">
                {permisosRol.map((codigo) => (
                  <span className="chip" key={codigo}>
                    {codigo}
                    <button onClick={() => quitarPermiso(codigo)}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              <ul className="permisos-todos">
                {permisos
                  .filter((p) => !permisosRol.includes(p.codigo))
                  .map((p) => (
                    <li key={p.id}>
                      <button onClick={() => asignarPermiso(p.id)}>
                        ➕
                      </button>
                      {p.codigo}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

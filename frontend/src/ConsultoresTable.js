import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./ConsultoresTable.css";
import { jfetch } from "./lib/api";

const API = {
  CONSULT: "consultores",
  MODULOS: "/modulos",
  EQUIPOS: "/equipos",
  ROLES: "/roles",
  HORARIOS: "/horarios",
};

export default function ConsultoresTable() {
  const [consultores, setConsultores] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [horarios, setHorarios] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);

  const [filtro, setFiltro] = useState({
    nombre: "",
    equipo: "",
  });

  const [form, setForm] = useState({
    usuario: "",
    nombre: "",
    password: "",
    rol: "",
    equipo: "",
    horario: "",
    modulos: [],
  });

  /* ======================================================
     CARGA INICIAL
     ====================================================== */
  useEffect(() => {
    cargarListas();
    cargarConsultores();
  }, []);

  /* ======================================================
     FILTROS (con debounce)
     ====================================================== */
  useEffect(() => {
    const timeout = setTimeout(cargarConsultores, 250);
    return () => clearTimeout(timeout);
  }, [filtro]);

  const cargarListas = async () => {
    try {
      const responses = await Promise.all([
        fetch(API.MODULOS),
        fetch(API.EQUIPOS),
        fetch(API.ROLES),
        fetch(API.HORARIOS),
      ]);
      setModulos(await responses[0].json());
      setEquipos(await responses[1].json());
      setRoles(await responses[2].json());
      setHorarios(await responses[3].json());
    } catch (err) {
      Swal.fire("Error", "Error cargando listas", "error");
    }
  };

  const cargarConsultores = async () => {
    try {
      const saved = localStorage.getItem("userData");
      const user = saved ? JSON.parse(saved) : null;
      const usuario = user?.usuario;

      if (!usuario) return;

      const res = await jfetch(API.CONSULT, {
        headers: { "X-User-Usuario": usuario },
      });

      const data = await res.json();
      if (!Array.isArray(data)) return;

      const filtrados = data.filter(
        (c) =>
          c.nombre?.toLowerCase().includes(filtro.nombre.toLowerCase()) &&
          (c.equipo || "")
            .toLowerCase()
            .includes(filtro.equipo.toLowerCase())
      );

      setConsultores(filtrados);
    } catch (err) {
      Swal.fire("Error", "No fue posible cargar consultores", "error");
    }
  };

  /* ======================================================
     MODAL - ABRIR
     ====================================================== */
  const abrirModal = (c = null) => {
    if (c) {
      setEditando(c);
      setForm({
        usuario: c.usuario,
        nombre: c.nombre,
        rol: c.rol,
        equipo: c.equipo,
        horario: c.horario,
        modulos: c.modulos?.map((m) => m.id),
        password: "",
      });
    } else {
      setEditando(null);
      setForm({
        usuario: "",
        nombre: "",
        password: "",
        rol: "",
        equipo: "",
        horario: "",
        modulos: [],
      });
    }
    setShowModal(true);
  };

  /* ======================================================
     MODAL - CERRAR
     ====================================================== */
  const cerrarModal = () => setShowModal(false);

  /* ======================================================
     GUARDAR CONSULTOR
     ====================================================== */
  const guardarConsultor = async () => {
    const method = editando ? "PUT" : "POST";
    const url = editando ? `${API.CONSULT}/${editando.id}` : API.CONSULT;

    try {
      const res = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-User-Rol": "ADMIN" },
        body: JSON.stringify({
          usuario: form.usuario,
          nombre: form.nombre,
          password: form.password || undefined,
          rol: form.rol,
          equipo: form.equipo,
          horario: form.horario,
          modulos: form.modulos,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || "Error guardando");

      Swal.fire("Éxito", "Consultor guardado", "success");
      cerrarModal();
      cargarConsultores();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  /* ======================================================
     ELIMINAR
     ====================================================== */
  const eliminarConsultor = async (id) => {
    const conf = await Swal.fire({
      title: "¿Eliminar consultor?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
    });
    if (!conf.isConfirmed) return;

    try {
      const res = await jfetch(`${API.CONSULT}/${id}`, {
        method: "DELETE",
        headers: { "X-User-Rol": "ADMIN" },
      });
      if (!res.ok) throw new Error();

      Swal.fire("Eliminado", "Consultor eliminado", "success");
      cargarConsultores();
    } catch (err) {
      Swal.fire("Error", "No se pudo eliminar", "error");
    }
  };

  /* ======================================================
     RENDER
     ====================================================== */
  return (
    <div className="cst-wrapper">
      <h2 className="cst-title">👨‍💼 Gestión de Consultores</h2>

      {/* FILTROS */}
      <div className="cst-filtros">
        <input
          type="text"
          placeholder="🔎 Consultor..."
          value={filtro.nombre}
          onChange={(e) => setFiltro({ ...filtro, nombre: e.target.value })}
        />

        <input
          type="text"
          placeholder="🧩 Equipo..."
          value={filtro.equipo}
          onChange={(e) => setFiltro({ ...filtro, equipo: e.target.value })}
        />

        <button className="cst-btn cst-btn-add" onClick={() => abrirModal()}>
          ➕ Agregar
        </button>
      </div>

      {/* TABLA */}
      <div className="cst-table-wrapper">
        <table className="cst-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Equipo</th>
              <th>Horario</th>
              <th>Módulos</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {consultores.length > 0 ? (
              consultores.map((c) => (
                <tr key={c.id}>
                  <td>{c.usuario}</td>
                  <td>{c.nombre}</td>
                  <td>{c.rol}</td>
                  <td>{c.equipo}</td>
                  <td>{c.horario}</td>
                  <td>{c.modulos?.map((m) => m.nombre).join(", ")}</td>
                  <td className="cst-actions">
                    <button
                      className="cst-btn cst-edit"
                      onClick={() => abrirModal(c)}
                    >
                      ✏️
                    </button>
                    <button
                      className="cst-btn cst-delete"
                      onClick={() => eliminarConsultor(c.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="cst-empty">
                  No hay resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="cst-modal-backdrop">
          <div className="cst-modal">
            <div className="cst-modal-header">
              <h3>{editando ? "✏️ Editar Consultor" : "➕ Nuevo Consultor"}</h3>
              <button className="cst-close" onClick={cerrarModal}>×</button>
            </div>

            <div className="cst-modal-body">
              {/* FORMULARIO */}
              <label>Usuario</label>
              <input
                type="text"
                value={form.usuario}
                onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              />

              <label>Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />

              {!editando && (
                <>
                  <label>Contraseña</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                </>
              )}

              <label>Rol</label>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
              >
                <option value="">Seleccione...</option>
                {roles.map((r) => (
                  <option key={r.nombre} value={r.nombre}>
                    {r.nombre}
                  </option>
                ))}
              </select>

              <label>Equipo</label>
              <select
                value={form.equipo}
                onChange={(e) => setForm({ ...form, equipo: e.target.value })}
              >
                <option value="">Seleccione...</option>
                {equipos.map((e) => (
                  <option key={e.nombre} value={e.nombre}>
                    {e.nombre}
                  </option>
                ))}
              </select>

              <label>Horario</label>
              <select
                value={form.horario}
                onChange={(e) =>
                  setForm({ ...form, horario: e.target.value })
                }
              >
                <option value="">Seleccione...</option>
                {horarios.map((h) => (
                  <option key={h.rango} value={h.rango}>
                    {h.rango}
                  </option>
                ))}
              </select>

              <label>Módulos</label>
              <select
                multiple
                value={form.modulos}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modulos: Array.from(e.target.selectedOptions, (o) => o.value),
                  })
                }
              >
                {modulos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="cst-modal-footer">
              <button className="cst-btn cst-secondary" onClick={cerrarModal}>
                Cancelar
              </button>
              <button className="cst-btn cst-primary" onClick={guardarConsultor}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

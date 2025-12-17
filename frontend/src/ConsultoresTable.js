import React, { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import "./ConsultoresTable.css";
import { jfetch } from "./lib/api";

/* =========================
   RUTAS API
========================= */
const API = {
  CONSULT: "/consultores",
  MODULOS: "/modulos",
  EQUIPOS: "/equipos",
  ROLES: "/roles",
  HORARIOS: "/horarios",
};

export default function ConsultoresTable() {
  /* =========================
     ESTADOS
  ========================= */
  const [consultores, setConsultores] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [horarios, setHorarios] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);

  const [filtro, setFiltro] = useState({ nombre: "", equipo: "" });

  const [form, setForm] = useState({
    usuario: "",
    nombre: "",
    password: "",
    rol_id: "",
    equipo_id: "",
    horario_id: "",
    modulos: [],
  });

  /* =========================
     CARGAS
  ========================= */
  useEffect(() => {
    cargarConsultores();
  }, []);

  useEffect(() => {
    const t = setTimeout(cargarConsultores, 250);
    return () => clearTimeout(t);
  }, [filtro]);

  const cargarListas = async () => {
    try {
      const [m, e, r, h] = await Promise.all([
        jfetch(API.MODULOS).then(r => r.json()),
        jfetch(API.EQUIPOS).then(r => r.json()),
        jfetch(API.ROLES).then(r => r.json()),
        jfetch(API.HORARIOS).then(r => r.json()),
      ]);

      setModulos(m || []);
      setEquipos(e || []);
      setRoles(r || []);
      setHorarios(h || []);
    } catch {
      Swal.fire("Error", "Error cargando listas", "error");
    }
  };

  const cargarConsultores = useCallback(async () => {
    try {
      const res = await jfetch(API.CONSULT);
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const filtrados = data.filter(c =>
        c.nombre?.toLowerCase().includes(filtro.nombre.toLowerCase()) &&
        (c.equipo_nombre || "").toLowerCase().includes(filtro.equipo.toLowerCase())
      );

      setConsultores(filtrados);
    } catch {
      Swal.fire("Error", "No fue posible cargar consultores", "error");
    }
  }, [filtro]);

  /* =========================
     MODAL
  ========================= */
  const abrirModal = async (c = null) => {
    await cargarListas();

    if (c) {
      setEditando(c);
      setForm({
        usuario: c.usuario,
        nombre: c.nombre,
        password: "",
        rol_id: c.rol_id?.toString() || "",
        equipo_id: c.equipo_id?.toString() || "",
        horario_id: c.horario_id?.toString() || "",
        modulos: c.modulos?.map(m => String(m.id)) || [],
      });
    } else {
      setEditando(null);
      setForm({
        usuario: "",
        nombre: "",
        password: "",
        rol_id: "",
        equipo_id: "",
        horario_id: "",
        modulos: [],
      });
    }

    setShowModal(true);
  };

  const cerrarModal = () => setShowModal(false);

  /* =========================
     GUARDAR
  ========================= */
  const guardarConsultor = async () => {
    if (!form.usuario || !form.nombre || !form.rol_id) {
      Swal.fire("Campos requeridos", "Usuario, nombre y rol son obligatorios", "warning");
      return;
    }

    const method = editando ? "PUT" : "POST";
    const url = editando ? `${API.CONSULT}/${editando.id}` : API.CONSULT;

    try {
      const res = await jfetch(url, {
        method,
        body: {
          usuario: form.usuario,
          nombre: form.nombre,
          password: editando ? undefined : form.password,
          rol_id: Number(form.rol_id),
          equipo_id: form.equipo_id ? Number(form.equipo_id) : null,
          horario_id: form.horario_id ? Number(form.horario_id) : null,
          modulos: form.modulos.map(Number),
        },
      });

      if (!res.ok) throw new Error("Error guardando");

      Swal.fire("Éxito", "Consultor guardado", "success");
      cerrarModal();
      cargarConsultores();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  const eliminarConsultor = async (id) => {
    const r = await Swal.fire({
      title: "¿Eliminar consultor?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
    });
    if (!r.isConfirmed) return;

    await jfetch(`${API.CONSULT}/${id}`, { method: "DELETE" });
    cargarConsultores();
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="cst-wrapper">
      <h2 className="cst-title">👨‍💼 Gestión de Consultores</h2>

      <div className="cst-filtros">
        <input
          placeholder="🔎 Consultor..."
          value={filtro.nombre}
          onChange={e => setFiltro({ ...filtro, nombre: e.target.value })}
        />
        <input
          placeholder="🧩 Equipo..."
          value={filtro.equipo}
          onChange={e => setFiltro({ ...filtro, equipo: e.target.value })}
        />
        <button className="cst-btn-add" onClick={() => abrirModal()}>
          ➕ Agregar
        </button>
      </div>

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
            {consultores.length ? consultores.map(c => (
              <tr key={c.id}>
                <td>{c.usuario}</td>
                <td>{c.nombre}</td>
                <td>{c.rol_nombre}</td>
                <td>{c.equipo_nombre || "—"}</td>
                <td>{c.horario_rango || "—"}</td>
                <td>{c.modulos?.map(m => m.nombre).join(", ")}</td>
                <td className="cst-actions">
                  <button className="cst-edit" onClick={() => abrirModal(c)}>✏️</button>
                  <button className="cst-delete" onClick={() => eliminarConsultor(c.id)}>🗑️</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="cst-empty">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="cst-modal-backdrop">
          <div className="cst-modal">
            <div className="cst-modal-header">
              <h3>{editando ? "Editar Consultor" : "Nuevo Consultor"}</h3>
              <button className="cst-close" onClick={cerrarModal}>×</button>
            </div>

            <div className="cst-modal-body">
              <input placeholder="Usuario" value={form.usuario}
                onChange={e => setForm({ ...form, usuario: e.target.value })} />
              <input placeholder="Nombre" value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })} />

              {!editando && (
                <input type="password" placeholder="Contraseña"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} />
              )}

              <select value={form.rol_id} onChange={e => setForm({ ...form, rol_id: e.target.value })}>
                <option value="">Rol</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>

              <select value={form.equipo_id} onChange={e => setForm({ ...form, equipo_id: e.target.value })}>
                <option value="">Equipo</option>
                {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>

              <select value={form.horario_id} onChange={e => setForm({ ...form, horario_id: e.target.value })}>
                <option value="">Horario</option>
                {horarios.map(h => <option key={h.id} value={h.id}>{h.rango}</option>)}
              </select>

              <select multiple value={form.modulos}
                onChange={e =>
                  setForm({ ...form, modulos: Array.from(e.target.selectedOptions, o => o.value) })
                }>
                {modulos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>

            <div className="cst-modal-footer">
              <button className="cst-secondary" onClick={cerrarModal}>Cancelar</button>
              <button className="cst-primary" onClick={guardarConsultor}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

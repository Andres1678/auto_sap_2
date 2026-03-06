import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModulosAdmin.css";

Modal.setAppElement("#root");

const API_BASE = "";

const API = {
  modulos: `${API_BASE}/modulos`,
  consultores: `${API_BASE}/consultores`,
};

function getAuthHeaders() {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;

  return {
    "Content-Type": "application/json",
    "X-User-Usuario": user?.usuario || "",
    "X-User-Rol": user?.rol || "",
  };
}

export default function ModulosAdmin() {
  const [loading, setLoading] = useState(false);

  const [modulos, setModulos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [qModulo, setQModulo] = useState("");
  const [qConsultor, setQConsultor] = useState("");

  const [openView, setOpenView] = useState(false);
  const [viewConsultor, setViewConsultor] = useState(null);

  const [form, setForm] = useState({
    id: null,
    nombre: "",
  });

  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const headers = getAuthHeaders();

    const results = await Promise.allSettled([
      jfetch(API.modulos, { headers }),
      jfetch(API.consultores, { headers }),
    ]);

    const [modsRes, consRes] = results;

    if (modsRes.status === "fulfilled") {
      const mods = modsRes.value;
      setModulos(Array.isArray(mods) ? mods : []);
    } else {
      console.error("❌ Error cargando módulos:", modsRes.reason);
      setModulos([]);
    }

    if (consRes.status === "fulfilled") {
      const cons = consRes.value;
      setConsultores(Array.isArray(cons) ? cons : []);
    } else {
      console.error("❌ Error cargando consultores:", consRes.reason);
      setConsultores([]);
    }

    const errors = [];
    if (modsRes.status === "rejected") errors.push("Módulos");
    if (consRes.status === "rejected") errors.push("Consultores");

    if (errors.length) {
      Swal.fire(
        "Atención",
        `No se pudo cargar: ${errors.join(" y ")}. Revisa permisos o rutas del backend.`,
        "warning"
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredModulos = useMemo(() => {
    const t = qModulo.trim().toLowerCase();
    if (!t) return modulos;

    return modulos.filter((m) =>
      (m.nombre || "").toLowerCase().includes(t)
    );
  }, [modulos, qModulo]);

  const filteredConsultores = useMemo(() => {
    const t = qConsultor.trim().toLowerCase();
    if (!t) return consultores;

    return consultores.filter((c) => {
      const usuario = (c.usuario || "").toLowerCase();
      const nombre = (c.nombre || "").toLowerCase();
      const rol = (c.rol || "").toLowerCase();
      const equipo = (c.equipo || "").toLowerCase();

      const mods = (c.modulos || [])
        .map((m) => (m.nombre || "").toLowerCase())
        .join(" ");

      return (
        usuario.includes(t) ||
        nombre.includes(t) ||
        rol.includes(t) ||
        equipo.includes(t) ||
        mods.includes(t)
      );
    });
  }, [consultores, qConsultor]);

  function resetForm() {
    setForm({
      id: null,
      nombre: "",
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleEdit(modulo) {
    setForm({
      id: modulo.id,
      nombre: modulo.nombre || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const nombre = form.nombre.trim();
    if (!nombre) {
      Swal.fire("Validación", "El nombre del módulo es obligatorio.", "warning");
      return;
    }

    setSaving(true);

    try {
      const headers = getAuthHeaders();

      if (form.id) {
        await jfetch(`${API.modulos}/${form.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ nombre }),
        });

        Swal.fire("OK", "Módulo actualizado correctamente.", "success");
      } else {
        await jfetch(API.modulos, {
          method: "POST",
          headers,
          body: JSON.stringify({ nombre }),
        });

        Swal.fire("OK", "Módulo creado correctamente.", "success");
      }

      resetForm();
      await load();
    } catch (error) {
      console.error("❌ Error guardando módulo:", error);
      Swal.fire(
        "Error",
        error?.message || "No se pudo guardar el módulo.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(modulo) {
    const res = await Swal.fire({
      title: "¿Eliminar módulo?",
      text: `Se eliminará el módulo "${modulo.nombre}".`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!res.isConfirmed) return;

    try {
      const headers = getAuthHeaders();

      await jfetch(`${API.modulos}/${modulo.id}`, {
        method: "DELETE",
        headers,
      });

      Swal.fire("OK", "Módulo eliminado correctamente.", "success");

      if (form.id === modulo.id) {
        resetForm();
      }

      await load();
    } catch (error) {
      console.error("❌ Error eliminando módulo:", error);
      Swal.fire(
        "Error",
        error?.message || "No se pudo eliminar el módulo.",
        "error"
      );
    }
  }

  function openVerModulos(c) {
    setViewConsultor(c);
    setOpenView(true);
  }

  function listModulos(c) {
    const arr = Array.isArray(c?.modulos) ? c.modulos : [];
    return arr.length ? arr : [{ id: "0", nombre: "SIN MODULO" }];
  }

  return (
    <div className="ma-wrap">
      <div className="ma-header">
        <h2 className="ma-title">Administración de Módulos</h2>
        {loading ? <span className="ma-loading">⏳ Cargando...</span> : null}
      </div>

      {/* FORMULARIO CRUD DE MODULOS */}
      <div className="ma-card">
        <div className="ma-cardTitle">
          {form.id ? "Editar módulo" : "Crear módulo"}
        </div>

        <form className="ma-form" onSubmit={handleSubmit}>
          <div className="ma-formRow">
            <div className="ma-field">
              <label className="ma-label">Nombre del módulo</label>
              <input
                type="text"
                name="nombre"
                className="ma-input"
                placeholder="Ej: FI, MM, BASIS..."
                value={form.nombre}
                onChange={handleChange}
                maxLength={100}
              />
            </div>
          </div>

          <div className="ma-actions">
            <button className="ma-btn ma-btnPrimary" type="submit" disabled={saving}>
              {saving ? "Guardando..." : form.id ? "Actualizar" : "Crear"}
            </button>

            <button
              className="ma-btn ma-btnLight"
              type="button"
              onClick={resetForm}
              disabled={saving}
            >
              Limpiar
            </button>

            <button
              className="ma-btn ma-btnLight"
              type="button"
              onClick={load}
              disabled={loading || saving}
            >
              Recargar
            </button>
          </div>
        </form>
      </div>

      {/* TABLA DE MODULOS */}
      <div className="ma-card">
        <div className="ma-cardTitle">Módulos creados</div>

        <div className="ma-toolbar">
          <input
            className="ma-input"
            placeholder="Buscar módulo..."
            value={qModulo}
            onChange={(e) => setQModulo(e.target.value)}
          />
        </div>

        <div className="ma-body">
          <div className="ma-tableWrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredModulos.map((m) => (
                  <tr key={m.id}>
                    <td className="ma-muted">{m.id}</td>
                    <td>{m.nombre}</td>
                    <td>
                      <div className="ma-inlineActions">
                        <button
                          className="ma-btn ma-btnGhost"
                          onClick={() => handleEdit(m)}
                        >
                          Editar
                        </button>

                        <button
                          className="ma-btn ma-btnDanger"
                          onClick={() => handleDelete(m)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredModulos.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="ma-muted">
                      No hay módulos para mostrar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TABLA DE CONSULTORES */}
      <div className="ma-card">
        <div className="ma-cardTitle">Consultores y módulos asignados</div>

        <div className="ma-toolbar">
          <input
            className="ma-input"
            placeholder="Buscar consultor / módulo / equipo..."
            value={qConsultor}
            onChange={(e) => setQConsultor(e.target.value)}
          />
        </div>

        <div className="ma-body">
          <div className="ma-tableWrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Equipo</th>
                  <th>Horario</th>
                  <th>Módulos asignados</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredConsultores.map((c) => {
                  const mods = listModulos(c);
                  const showCompact = mods.length > 3;

                  return (
                    <tr key={c.id}>
                      <td className="ma-muted">{c.id}</td>
                      <td>{c.usuario}</td>
                      <td>{c.nombre}</td>
                      <td>{c.rol || "—"}</td>
                      <td>{c.equipo || "—"}</td>
                      <td>{c.horario || "—"}</td>

                      <td>
                        <div className="ma-badgesWrap">
                          {(showCompact ? mods.slice(0, 3) : mods).map((m) => (
                            <span key={`${c.id}-${m.id}-${m.nombre}`} className="ma-badge">
                              {m.nombre}
                            </span>
                          ))}

                          {showCompact ? (
                            <button
                              className="ma-btn ma-btnGhost"
                              onClick={() => openVerModulos(c)}
                            >
                              Ver
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td>
                        <button
                          className="ma-btn ma-btnGhost"
                          onClick={() => openVerModulos(c)}
                        >
                          Ver módulos
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredConsultores.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="ma-muted">
                      No hay consultores para mostrar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={openView}
        onRequestClose={() => setOpenView(false)}
        className="ma-modal"
        overlayClassName="ma-overlay"
      >
        <h3 className="ma-modalTitle">
          Módulos asignados — {viewConsultor?.nombre || ""}
        </h3>

        <div className="ma-group">
          <div className="ma-muted" style={{ marginBottom: 8 }}>
            Usuario: <b>{viewConsultor?.usuario}</b>
          </div>

          <div className="ma-badgesWrap">
            {listModulos(viewConsultor).map((m) => (
              <span key={`view-${m.id}-${m.nombre}`} className="ma-badge">
                {m.nombre}
              </span>
            ))}
          </div>
        </div>

        <div className="ma-footer">
          <button className="ma-btn ma-btnLight" onClick={() => setOpenView(false)}>
            Cerrar
          </button>
        </div>
      </Modal>
    </div>
  );
}
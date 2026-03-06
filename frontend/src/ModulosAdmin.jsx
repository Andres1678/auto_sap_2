import React, { useEffect, useMemo, useState, useCallback } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModulosAdmin.css";

Modal.setAppElement("#root");

export default function ModulosAdmin() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modulos, setModulos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [qModulo, setQModulo] = useState("");
  const [qConsultor, setQConsultor] = useState("");

  const [form, setForm] = useState({
    id: null,
    nombre: "",
  });

  const [openView, setOpenView] = useState(false);
  const [viewConsultor, setViewConsultor] = useState(null);

  const fetchModulos = useCallback(async () => {
    try {
      const res = await jfetch("/modulos");
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      setModulos(Array.isArray(data) ? data : []);
    } catch (err) {
      setModulos([]);
      Swal.fire({
        icon: "error",
        title: "Error cargando módulos",
        text: String(err.message || err),
      });
    }
  }, []);

  const fetchConsultores = useCallback(async () => {
    try {
      const res = await jfetch("/consultores");
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      setConsultores(Array.isArray(data) ? data : []);
    } catch (err) {
      setConsultores([]);
      Swal.fire({
        icon: "error",
        title: "Error cargando consultores",
        text: String(err.message || err),
      });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchModulos(), fetchConsultores()]);
    } finally {
      setLoading(false);
    }
  }, [fetchModulos, fetchConsultores]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredModulos = useMemo(() => {
    const t = qModulo.trim().toLowerCase();
    if (!t) return modulos;

    return modulos.filter((m) =>
      String(m.nombre || "").toLowerCase().includes(t)
    );
  }, [modulos, qModulo]);

  const filteredConsultores = useMemo(() => {
    const t = qConsultor.trim().toLowerCase();
    if (!t) return consultores;

    return consultores.filter((c) => {
      const usuario = String(c.usuario || "").toLowerCase();
      const nombre = String(c.nombre || "").toLowerCase();
      const rol = String(c.rol || "").toLowerCase();
      const equipo = String(c.equipo || "").toLowerCase();
      const mods = (c.modulos || [])
        .map((m) => String(m.nombre || "").toLowerCase())
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

  const resetForm = () => {
    setForm({
      id: null,
      nombre: "",
    });
  };

  const handleEdit = (modulo) => {
    setForm({
      id: modulo.id,
      nombre: modulo.nombre || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nombre = form.nombre.trim();
    if (!nombre) {
      return Swal.fire({
        icon: "warning",
        title: "El nombre del módulo es obligatorio",
      });
    }

    setSaving(true);

    try {
      const url = form.id ? `/modulos/${form.id}` : "/modulos";
      const method = form.id ? "PUT" : "POST";

      const res = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: form.id ? "Módulo actualizado" : "Módulo creado",
      });

      resetForm();
      fetchModulos();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error guardando módulo",
        text: String(err.message || err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (modulo) => {
    const ok = await Swal.fire({
      title: "¿Eliminar módulo?",
      text: `Se eliminará el módulo "${modulo.nombre}".`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!ok.isConfirmed) return;

    try {
      const res = await jfetch(`/modulos/${modulo.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Módulo eliminado",
      });

      if (form.id === modulo.id) {
        resetForm();
      }

      fetchModulos();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error eliminando módulo",
        text: String(err.message || err),
      });
    }
  };

  const listModulos = (c) => {
    const arr = Array.isArray(c?.modulos) ? c.modulos : [];
    return arr.length ? arr : [{ id: "0", nombre: "SIN MODULO" }];
  };

  const openVerModulos = (c) => {
    setViewConsultor(c);
    setOpenView(true);
  };

  return (
    <div className="ma-wrap">
      <div className="ma-header">
        <h2 className="ma-title">Administración de Módulos</h2>
        {loading ? <span className="ma-loading">⏳ Cargando...</span> : null}
      </div>

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
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
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
                {filteredModulos.length ? (
                  filteredModulos.map((m) => (
                    <tr key={m.id}>
                      <td>{m.id}</td>
                      <td>{m.nombre}</td>
                      <td>
                        <div className="ma-inlineActions">
                          <button
                            className="ma-btn ma-btnGhost"
                            onClick={() => handleEdit(m)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="ma-btn ma-btnDanger"
                            onClick={() => handleDelete(m)}
                            type="button"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="ma-muted">
                      No hay módulos para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
                {filteredConsultores.length ? (
                  filteredConsultores.map((c) => {
                    const mods = listModulos(c);
                    const showCompact = mods.length > 3;

                    return (
                      <tr key={c.id}>
                        <td>{c.id}</td>
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
                                type="button"
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
                            type="button"
                            onClick={() => openVerModulos(c)}
                          >
                            Ver módulos
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" className="ma-muted">
                      No hay consultores para mostrar.
                    </td>
                  </tr>
                )}
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
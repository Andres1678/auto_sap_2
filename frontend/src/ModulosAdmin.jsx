import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModulosAdmin.css";

Modal.setAppElement("#root");

const API = {
  modulos: "/api/modulos",
  consultores: "/api/consultores", 
};

function getAuthHeaders() {
  const raw = localStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;

  return {
    "X-User-Usuario": user?.usuario || "",
    "X-User-Rol": user?.rol || "",
  };
}

export default function ModulosAdmin() {
  const [loading, setLoading] = useState(false);
  const [modulos, setModulos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState({ id: null, nombre: "" });

  async function load() {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [mods, cons] = await Promise.all([
        jfetch(API.modulos, { headers }),
        jfetch(API.consultores, { headers }),
      ]);
      setModulos(Array.isArray(mods) ? mods : []);
      setConsultores(Array.isArray(cons) ? cons : []);
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e?.message || "No se pudo cargar módulos", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return modulos;
    return modulos.filter((m) => (m.nombre || "").toLowerCase().includes(t));
  }, [modulos, q]);

  const assignedCountByModuloId = useMemo(() => {
    const map = new Map();
    consultores.forEach((c) => {
      (c.modulos || []).forEach((m) => {
        const k = String(m.id);
        map.set(k, (map.get(k) || 0) + 1);
      });
    });
    return map;
  }, [consultores]);

  function assignedNames(moduloId) {
    const names = [];
    consultores.forEach((c) => {
      const has = (c.modulos || []).some((m) => String(m.id) === String(moduloId));
      if (has) names.push(`${c.nombre} (${c.usuario})`);
    });
    return names;
  }

  async function showAssigned(m) {
    const list = assignedNames(m.id);
    const html = list.length
      ? `<div style="text-align:left;max-height:280px;overflow:auto">${list
          .map((x) => `• ${x}`)
          .join("<br/>")}</div>`
      : "No hay consultores asignados a este módulo.";

    await Swal.fire({ title: `Asignados a: ${m.nombre}`, html, icon: "info" });
  }

  function openCreate() {
    setEditing({ id: null, nombre: "" });
    setOpen(true);
  }

  function openEdit(m) {
    setEditing({ id: m.id, nombre: m.nombre || "" });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    const nombre = (editing.nombre || "").trim();
    if (!nombre) {
      Swal.fire("Validación", "El nombre es obligatorio", "warning");
      return;
    }

    setLoading(true);
    try {
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };

      if (editing.id) {
        await jfetch(`${API.modulos}/${editing.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ nombre }),
        });
        Swal.fire("OK", "Módulo actualizado", "success");
      } else {
        await jfetch(API.modulos, {
          method: "POST",
          headers,
          body: JSON.stringify({ nombre }),
        });
        Swal.fire("OK", "Módulo creado", "success");
      }

      setOpen(false);
      await load();
    } catch (e2) {
      console.error(e2);
      Swal.fire("Error", e2?.message || "No se pudo guardar", "error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(m) {
    const cnt = assignedCountByModuloId.get(String(m.id)) || 0;

    const ok = await Swal.fire({
      title: "Eliminar módulo",
      text:
        cnt > 0
          ? `Este módulo está asignado a ${cnt} consultor(es). ¿Deseas eliminarlo de todas formas?`
          : `¿Seguro que deseas eliminar "${m.nombre}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!ok.isConfirmed) return;

    setLoading(true);
    try {
      const headers = getAuthHeaders();
      await jfetch(`${API.modulos}/${m.id}`, { method: "DELETE", headers });
      Swal.fire("OK", "Módulo eliminado", "success");
      await load();
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e?.message || "No se pudo eliminar", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ma-wrap">
      <div className="ma-header">
        <h2 className="ma-title">Administración — Módulos</h2>
        {loading ? <span className="ma-loading">⏳ Procesando...</span> : null}
      </div>

      <div className="ma-card">
        <div className="ma-toolbar">
          <input
            className="ma-input"
            placeholder="Buscar módulo..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button className="ma-btn ma-btnPrimary" onClick={openCreate} disabled={loading}>
            + Crear
          </button>

          <button className="ma-btn ma-btnLight" onClick={load} disabled={loading}>
            Recargar
          </button>
        </div>

        <div className="ma-body">
          <div className="ma-tableWrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Asignados</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((m) => {
                  const cnt = assignedCountByModuloId.get(String(m.id)) || 0;

                  return (
                    <tr key={m.id}>
                      <td className="ma-muted">{m.id}</td>
                      <td>{m.nombre}</td>
                      <td>
                        <span className="ma-badge">{cnt} asignados</span>
                        {cnt > 0 ? (
                          <button
                            className="ma-btn ma-btnGhost"
                            onClick={() => showAssigned(m)}
                            disabled={loading}
                          >
                            Ver
                          </button>
                        ) : null}
                      </td>
                      <td>
                        <div className="ma-actions">
                          <button
                            className="ma-btn ma-btnGhost"
                            onClick={() => openEdit(m)}
                            disabled={loading}
                          >
                            Editar
                          </button>

                          <button
                            className="ma-btn ma-btnDanger"
                            onClick={() => remove(m)}
                            disabled={loading}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="ma-muted">
                      No hay módulos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={open}
        onRequestClose={() => setOpen(false)}
        className="ma-modal"
        overlayClassName="ma-overlay"
      >
        <h3 className="ma-modalTitle">{editing.id ? "Editar Módulo" : "Crear Módulo"}</h3>

        <form onSubmit={save}>
          <div className="ma-group">
            <label className="ma-label">Nombre</label>
            <input
              className="ma-input"
              value={editing.nombre}
              onChange={(e) => setEditing((p) => ({ ...p, nombre: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="ma-footer">
            <button type="button" className="ma-btn ma-btnLight" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="ma-btn ma-btnPrimary" disabled={loading}>
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
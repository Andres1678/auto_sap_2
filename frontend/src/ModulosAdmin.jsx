import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModulosAdmin.css";

Modal.setAppElement("#root");

const API = {
  modulos: "/modulos",
  consultores: "/consultores",
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

  // modal “ver módulos” por consultor
  const [openView, setOpenView] = useState(false);
  const [viewConsultor, setViewConsultor] = useState(null);

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
      Swal.fire("Error", e?.message || "No se pudo cargar la información", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredConsultores = useMemo(() => {
    const t = q.trim().toLowerCase();
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
  }, [consultores, q]);

  function openVerModulos(c) {
    setViewConsultor(c);
    setOpenView(true);
  }

  // Si un consultor no tiene modulos, muestro “SIN MODULO”
  function listModulos(c) {
    const arr = Array.isArray(c?.modulos) ? c.modulos : [];
    return arr.length ? arr : [{ id: "0", nombre: "SIN MODULO" }];
  }

  // (Opcional) mapa para validar si un módulo existe en catálogo
  const modulosSet = useMemo(() => new Set(modulos.map((m) => String(m.id))), [modulos]);

  return (
    <div className="ma-wrap">
      <div className="ma-header">
        <h2 className="ma-title">Administración — Consultores y Módulos</h2>
        {loading ? <span className="ma-loading">⏳ Cargando...</span> : null}
      </div>

      <div className="ma-card">
        <div className="ma-toolbar">
          <input
            className="ma-input"
            placeholder="Buscar consultor / módulo / equipo..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

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
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Equipo</th>
                  <th>Activo</th>
                  <th>Módulos asignados</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredConsultores.map((c) => {
                  const mods = listModulos(c);
                  const showCompact = mods.length > 3; // si hay muchos, muestro 3 chips + “Ver”

                  return (
                    <tr key={c.id}>
                      <td className="ma-muted">{c.id}</td>
                      <td>{c.usuario}</td>
                      <td>{c.nombre}</td>
                      <td>{c.rol || "—"}</td>
                      <td>{c.equipo || "—"}</td>
                      <td>{String(c.activo ?? true)}</td>

                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(showCompact ? mods.slice(0, 3) : mods).map((m) => {
                            // Si quieres marcar “desconocidos” (por si un consultor tiene módulo que no está en catálogo)
                            const unknown =
                              m.id !== "0" && modulos.length > 0 && !modulosSet.has(String(m.id));

                            return (
                              <span
                                key={`${c.id}-${m.id}-${m.nombre}`}
                                className="ma-badge"
                                title={unknown ? "Este módulo no está en el catálogo" : ""}
                                style={unknown ? { background: "#fff7ed", borderColor: "#fed7aa", color: "#9a3412" } : undefined}
                              >
                                {m.nombre}
                              </span>
                            );
                          })}

                          {showCompact ? (
                            <button
                              className="ma-btn ma-btnGhost"
                              onClick={() => openVerModulos(c)}
                              disabled={loading}
                            >
                              Ver
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td>
                        <div className="ma-actions">
                          <button
                            className="ma-btn ma-btnGhost"
                            onClick={() => openVerModulos(c)}
                            disabled={loading}
                          >
                            Ver módulos
                          </button>
                        </div>
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

      {/* ===== Modal: ver todos los módulos de un consultor ===== */}
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
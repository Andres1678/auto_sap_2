import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModulosAdmin.css";

Modal.setAppElement("#root");

// ✅ Si tu jfetch ya pega a /api internamente, deja API_BASE = "".
// ✅ Si tu jfetch NO lo pega, pon API_BASE = "/api".
const API_BASE = ""; // prueba "" primero. Si en Network ves 404, cámbialo a "/api"

const API = {
  modulos: `${API_BASE}/modulos`,
  consultores: `${API_BASE}/consultores`,
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

  const [openView, setOpenView] = useState(false);
  const [viewConsultor, setViewConsultor] = useState(null);

  async function load() {
    setLoading(true);
    const headers = getAuthHeaders();

    // ✅ clave: no dejar que un fallo mate todo
    const results = await Promise.allSettled([
      jfetch(API.modulos, { headers }),
      jfetch(API.consultores, { headers }),
    ]);

    const [modsRes, consRes] = results;

    // --- módulos ---
    if (modsRes.status === "fulfilled") {
      const mods = modsRes.value;
      setModulos(Array.isArray(mods) ? mods : []);
    } else {
      console.error("❌ Error cargando modulos:", modsRes.reason);
      setModulos([]); // no bloquea la pantalla
    }

    // --- consultores ---
    if (consRes.status === "fulfilled") {
      const cons = consRes.value;
      setConsultores(Array.isArray(cons) ? cons : []);
    } else {
      console.error("❌ Error cargando consultores:", consRes.reason);
      setConsultores([]);
    }

    // ✅ si falló algo, muestro el motivo real
    const errors = [];
    if (modsRes.status === "rejected") errors.push("Módulos");
    if (consRes.status === "rejected") errors.push("Consultores");

    if (errors.length) {
      Swal.fire(
        "Atención",
        `No se pudo cargar: ${errors.join(" y ")}. Revisa permisos o ruta (/api).`,
        "warning"
      );
    }

    setLoading(false);
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

  function listModulos(c) {
    const arr = Array.isArray(c?.modulos) ? c.modulos : [];
    return arr.length ? arr : [{ id: "0", nombre: "SIN MODULO" }];
  }

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
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(showCompact ? mods.slice(0, 3) : mods).map((m) => (
                            <span key={`${c.id}-${m.id}-${m.nombre}`} className="ma-badge">
                              {m.nombre}
                            </span>
                          ))}

                          {showCompact ? (
                            <button className="ma-btn ma-btnGhost" onClick={() => openVerModulos(c)}>
                              Ver
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td>
                        <button className="ma-btn ma-btnGhost" onClick={() => openVerModulos(c)}>
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
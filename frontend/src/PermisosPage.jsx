import React, { useEffect, useState, useMemo } from "react";
import Swal from "sweetalert2";
import "./PermisosPage.css";
import { API_URL } from "../src/config.js";

export default function PermisosPage() {
  const [permisos, setPermisos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEquipo, setSelectedEquipo] = useState("");
  const [selectedConsultor, setSelectedConsultor] = useState("");

  const [permisosDestino, setPermisosDestino] = useState([]);
  const [selectedPermisos, setSelectedPermisos] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");

  const userData = JSON.parse(localStorage.getItem("userData") || "{}");

  // Wrapper FETCH con headers
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

  // ===================================================
  // CARGA INICIAL
  // ===================================================
  const safeJson = async (res) => {
    if (!res.ok) return [];
    try {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const loadAll = async () => {
    try {
      const [pRes, rRes, eRes, cRes] = await Promise.all([
        api("/permisos"),
        api("/roles"),
        api("/equipos"),
        api("/consultores"),
      ]);

      setPermisos(await safeJson(pRes));
      setRoles(await safeJson(rRes));
      setEquipos(await safeJson(eRes));
      setConsultores(await safeJson(cRes));
    } catch (err) {
      Swal.fire("Error", "Error cargando datos iniciales", "error");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ===================================================
  // PERMISOS DEL DESTINO SELECCIONADO
  // ===================================================
  const loadPermisosDestino = async () => {
    try {
      let url = null;

      if (selectedRole) url = `/roles/${selectedRole}/permisos`;
      else if (selectedEquipo) url = `/equipos/${selectedEquipo}/permisos`;
      else if (selectedConsultor)
        url = `/consultores/${selectedConsultor}/permisos`;

      if (!url) {
        setPermisosDestino([]);
        return;
      }

      const res = await api(url);
      const data = await res.json();
      setPermisosDestino(data.map((p) => p.codigo));
    } catch {
      Swal.fire("Error", "No se pudieron cargar los permisos del destino", "error");
    }
  };

  useEffect(() => {
    loadPermisosDestino();
  }, [selectedRole, selectedEquipo, selectedConsultor]);

  // ===================================================
  // BOTÓN LIMPIAR FILTROS
  // ===================================================
  const limpiarFiltros = () => {
    setSelectedRole("");
    setSelectedEquipo("");
    setSelectedConsultor("");
    setSearchTerm("");
    setSelectedPermisos([]);
    setPermisosDestino([]);
  };

  // ===================================================
  // ASIGNAR PERMISOS
  // ===================================================
  const asignar = async (tipo) => {
    const destino =
      tipo === "rol"
        ? selectedRole
        : tipo === "equipo"
        ? selectedEquipo
        : selectedConsultor;

    if (!destino) {
      Swal.fire("Seleccione destino", "Debe elegir rol, equipo o consultor", "warning");
      return;
    }

    if (selectedPermisos.length === 0) {
      Swal.fire("Nada seleccionado", "Seleccione uno o más permisos", "warning");
      return;
    }

    const urlBase =
      tipo === "rol"
        ? `/roles/${destino}/permisos`
        : tipo === "equipo"
        ? `/equipos/${destino}/permisos`
        : `/consultores/${destino}/permisos`;

    try {
      for (let id of selectedPermisos) {
        await api(urlBase, {
          method: "POST",
          body: JSON.stringify({ permiso_id: id }),
        });
      }

      Swal.fire("Éxito 🎉", "Permisos asignados correctamente", "success");
      setSelectedPermisos([]);
      loadPermisosDestino();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  // ===================================================
  // QUITAR PERMISO
  // ===================================================
  const quitarPermiso = async (codigoPermiso) => {
    let url = null;

    if (selectedRole) url = `/roles/${selectedRole}/permisos/${codigoPermiso}`;
    else if (selectedEquipo)
      url = `/equipos/${selectedEquipo}/permisos/${codigoPermiso}`;
    else if (selectedConsultor)
      url = `/consultores/${selectedConsultor}/permisos/${codigoPermiso}`;

    if (!url) return;

    const r = await Swal.fire({
      title: "¿Quitar permiso?",
      text: `Se eliminará: ${codigoPermiso}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, quitar",
    });

    if (!r.isConfirmed) return;

    await api(url, { method: "DELETE" });
    loadPermisosDestino();
  };

  // ===================================================
  // FILTRO
  // ===================================================
  const permisosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return permisos;
    const term = searchTerm.toLowerCase();
    return permisos.filter(
      (p) =>
        (p.codigo || "").toLowerCase().includes(term) ||
        (p.descripcion || "").toLowerCase().includes(term)
    );
  }, [permisos, searchTerm]);

  // ===================================================
  // RENDER
  // ===================================================
  return (
    <div id="permisos-page">

      <h1 className="mat-title">🔐 Gestión de Permisos</h1>

      {/* ======================== DESTINO ======================== */}
      <div className="mat-card">
        <h2>🎯 Destino</h2>

        <div className="actions-bar">
          <button className="clean-btn" onClick={limpiarFiltros}>
            ♻️ Limpiar filtros
          </button>
        </div>

        <div className="mat-destino-grid">
          {/* ROL */}
          <div className="mat-field">
            <label>👑 Rol</label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setSelectedEquipo("");
                setSelectedConsultor("");
              }}
            >
              <option value="">Seleccionar...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* EQUIPO */}
          <div className="mat-field">
            <label>🧩 Equipo</label>
            <select
              value={selectedEquipo}
              onChange={(e) => {
                setSelectedEquipo(e.target.value);
                setSelectedRole("");
                setSelectedConsultor("");
              }}
            >
              <option value="">Seleccionar...</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* CONSULTOR */}
          <div className="mat-field">
            <label>👨‍💼 Consultor</label>
            <select
              value={selectedConsultor}
              onChange={(e) => {
                setSelectedConsultor(e.target.value);
                setSelectedRole("");
                setSelectedEquipo("");
              }}
            >
              <option value="">Seleccionar...</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ======================== PERMISOS ASIGNADOS ======================== */}
      <div className="mat-card">
        <h2>🧩 Permisos asignados</h2>

        {permisosDestino.length === 0 && (
          <p className="empty-text">⚠️ No tiene permisos asignados.</p>
        )}

        <div className="mat-chips">
          {permisosDestino.map((codigo) => (
            <span className="mat-chip" key={codigo}>
              🔑 {codigo}
              <button className="chip-remove" onClick={() => quitarPermiso(codigo)}>
                ❌
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ======================== LISTA DE PERMISOS ======================== */}
      <div className="mat-card">
        <h2>📋 Lista de permisos</h2>

        <input
          type="text"
          className="mat-search"
          placeholder="🔎 Buscar permiso..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="table-wrapper">
          <table className="mat-table">
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Descripción</th>
              </tr>
            </thead>

            <tbody>
              {permisosFiltrados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedPermisos.includes(p.id)}
                      onChange={() =>
                        setSelectedPermisos((prev) =>
                          prev.includes(p.id)
                            ? prev.filter((x) => x !== p.id)
                            : [...prev, p.id]
                        )
                      }
                    />
                  </td>
                  <td>{p.codigo}</td>
                  <td>{p.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BOTONES */}
        <div className="button-bar">
          <button className="mat-btn" onClick={() => asignar("rol")}>
            👑 Asignar a Rol
          </button>
          <button className="mat-btn green" onClick={() => asignar("equipo")}>
            🧩 Asignar a Equipo
          </button>
          <button className="mat-btn yellow" onClick={() => asignar("consultor")}>
            👨‍💼 Asignar a Consultor
          </button>
        </div>
      </div>
    </div>
  );
}

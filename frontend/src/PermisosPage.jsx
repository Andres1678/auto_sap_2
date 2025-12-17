import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import "./PermisosPage.css";
import { jfetch, jsonOrThrow } from "./lib/api";

export default function PermisosPage() {
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  const isAdmin = userData?.rol === "ADMIN" || userData?.rol === 1;

  const [permisos, setPermisos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEquipo, setSelectedEquipo] = useState("");
  const [selectedConsultor, setSelectedConsultor] = useState("");

  const [selectedPermisos, setSelectedPermisos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  /* ===================== CARGA INICIAL ===================== */
  useEffect(() => {
    cargarTodo();
  }, []);

  const cargarTodo = async () => {
    try {
      const [p, r, e, c] = await Promise.all([
        jfetch("/permisos").then(jsonOrThrow),
        jfetch("/roles").then(jsonOrThrow),
        jfetch("/equipos").then(jsonOrThrow),
        jfetch("/consultores").then(jsonOrThrow),
      ]);

      setPermisos(p || []);
      setRoles(r || []);
      setEquipos(e || []);
      setConsultores(c || []);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  /* ===================== FILTRO ===================== */
  const permisosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return permisos;
    const t = searchTerm.toLowerCase();
    return permisos.filter(
      (p) =>
        p.codigo?.toLowerCase().includes(t) ||
        p.descripcion?.toLowerCase().includes(t)
    );
  }, [permisos, searchTerm]);

  /* ===================== ASIGNAR ===================== */
  const asignar = async (tipo) => {
    const destino =
      tipo === "rol"
        ? selectedRole
        : tipo === "equipo"
        ? selectedEquipo
        : selectedConsultor;

    if (!destino || selectedPermisos.length === 0) {
      Swal.fire("Datos incompletos", "Seleccione destino y permisos", "warning");
      return;
    }

    const base =
      tipo === "rol"
        ? `/roles/${destino}/permisos`
        : tipo === "equipo"
        ? `/equipos/${destino}/permisos`
        : `/consultores/${destino}/permisos`;

    try {
      for (const permisoId of selectedPermisos) {
        await jfetch(base, {
          method: "POST",
          body: { permiso_id: permisoId },
        }).then(jsonOrThrow);
      }

      Swal.fire("Éxito", "Permisos asignados", "success");
      setSelectedPermisos([]);
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  if (!isAdmin) {
    return (
      <div className="no-access">
        <h2>⛔ Acceso restringido</h2>
      </div>
    );
  }

  return (
    <div id="permisos-page">
      <h1 className="mat-title">🔐 Gestión de Permisos</h1>

      {/* DESTINO */}
      <div className="mat-card">
        <h2>🎯 Destino</h2>

        <div className="mat-destino-grid">
          <div className="mat-field">
            <label>Rol</label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              <option value="">Seleccione…</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>

          <div className="mat-field">
            <label>Equipo</label>
            <select value={selectedEquipo} onChange={(e) => setSelectedEquipo(e.target.value)}>
              <option value="">Seleccione…</option>
              {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div className="mat-field">
            <label>Consultor</label>
            <select value={selectedConsultor} onChange={(e) => setSelectedConsultor(e.target.value)}>
              <option value="">Seleccione…</option>
              {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* PERMISOS */}
      <div className="mat-card">
        <h2>📋 Permisos</h2>

        <input
          className="mat-search"
          placeholder="Buscar permiso…"
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
              {permisosFiltrados.map(p => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedPermisos.includes(p.id)}
                      onChange={() =>
                        setSelectedPermisos(prev =>
                          prev.includes(p.id)
                            ? prev.filter(x => x !== p.id)
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

        <div className="button-bar">
          <button className="mat-btn" onClick={() => asignar("rol")}>Asignar a Rol</button>
          <button className="mat-btn green" onClick={() => asignar("equipo")}>Asignar a Equipo</button>
          <button className="mat-btn yellow" onClick={() => asignar("consultor")}>Asignar a Consultor</button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import "./PermisosPage.css";
import { jfetch, jsonOrThrow } from "./lib/api";

export default function PermisosPage() {
  // ===============================
  // SEGURIDAD FRONT
  // ===============================
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  const isAdmin = userData?.rol === "ADMIN" || userData?.rol === 1;

  // ===============================
  // ESTADO
  // ===============================
  const [permisos, setPermisos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [consultores, setConsultores] = useState([]);

  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEquipo, setSelectedEquipo] = useState("");
  const [selectedConsultor, setSelectedConsultor] = useState("");

  const [permisosDestino, setPermisosDestino] = useState([]);
  const [permisosEfectivos, setPermisosEfectivos] = useState(null);

  const [selectedPermisos, setSelectedPermisos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  // ===============================
  // CARGA INICIAL
  // ===============================
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

  // ===============================
  // PERMISOS DEL DESTINO
  // ===============================
  useEffect(() => {
    cargarPermisosDestino();

    if (selectedConsultor) {
      cargarPermisosEfectivos();
    } else {
      setPermisosEfectivos(null);
    }
  }, [selectedRole, selectedEquipo, selectedConsultor]);

  const cargarPermisosDestino = async () => {
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

      const data = await jfetch(url).then(jsonOrThrow);
      setPermisosDestino((data || []).map((p) => p.codigo));
    } catch {
      Swal.fire("Error", "No se pudieron cargar permisos", "error");
    }
  };

  const cargarPermisosEfectivos = async () => {
    try {
      const data = await jfetch(
        `/consultores/${selectedConsultor}/permisos-asignados`
      ).then(jsonOrThrow);

      setPermisosEfectivos(data);
    } catch {
      setPermisosEfectivos(null);
    }
  };

  // ===============================
  // LIMPIAR FILTROS
  // ===============================
  const limpiarFiltros = () => {
    setSelectedRole("");
    setSelectedEquipo("");
    setSelectedConsultor("");
    setPermisosDestino([]);
    setPermisosEfectivos(null);
    setSelectedPermisos([]);
    setSearchTerm("");
  };

  // ===============================
  // PREVIEW
  // ===============================
  const previewPermisos = useMemo(() => {
    return permisos
      .filter((p) => selectedPermisos.includes(p.id))
      .map((p) => p.codigo);
  }, [selectedPermisos, permisos]);

  // ===============================
  // FILTRO
  // ===============================
  const permisosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return permisos;
    const t = searchTerm.toLowerCase();
    return permisos.filter(
      (p) =>
        (p.codigo || "").toLowerCase().includes(t) ||
        (p.descripcion || "").toLowerCase().includes(t)
    );
  }, [permisos, searchTerm]);

  // ===============================
  // ASIGNAR PERMISOS
  // ===============================
  const asignar = async (tipo) => {
    const destino =
      tipo === "rol"
        ? selectedRole
        : tipo === "equipo"
        ? selectedEquipo
        : selectedConsultor;

    if (!destino) {
      Swal.fire("Destino requerido", "Seleccione rol, equipo o consultor", "warning");
      return;
    }

    if (selectedPermisos.length === 0) {
      Swal.fire("Nada seleccionado", "Seleccione permisos", "warning");
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

      Swal.fire("Éxito", "Permisos asignados correctamente", "success");
      setSelectedPermisos([]);
      cargarPermisosDestino();
      if (selectedConsultor) cargarPermisosEfectivos();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // ===============================
  // QUITAR PERMISO
  // ===============================
  const quitarPermiso = async (codigo) => {
    const url = selectedRole
      ? `/roles/${selectedRole}/permisos/codigo/${codigo}`
      : selectedEquipo
      ? `/equipos/${selectedEquipo}/permisos/codigo/${codigo}`
      : `/consultores/${selectedConsultor}/permisos/codigo/${codigo}`;

    const r = await Swal.fire({
      title: "¿Quitar permiso?",
      text: codigo,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, quitar",
    });

    if (!r.isConfirmed) return;

    try {
      await jfetch(url, { method: "DELETE" }).then(jsonOrThrow);
      cargarPermisosDestino();
      if (selectedConsultor) cargarPermisosEfectivos();
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // ===============================
  // RENDER
  // ===============================
  if (!isAdmin) {
    return (
      <div className="no-access">
        <h2>⛔ Acceso restringido</h2>
        <p>No tienes permisos para administrar permisos del sistema.</p>
      </div>
    );
  }

  return (
    <div id="permisos-page">
      <h1 className="mat-title">🔐 Gestión de Permisos</h1>

      {/* DESTINO */}
      <div className="mat-card">
        <h2>🎯 Destino</h2>

        <button className="clean-btn" onClick={limpiarFiltros}>
          ♻️ Limpiar filtros
        </button>

        <div className="mat-destino-grid">
          <select value={selectedRole} onChange={(e) => {
            setSelectedRole(e.target.value);
            setSelectedEquipo("");
            setSelectedConsultor("");
          }}>
            <option value="">Rol</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>

          <select value={selectedEquipo} onChange={(e) => {
            setSelectedEquipo(e.target.value);
            setSelectedRole("");
            setSelectedConsultor("");
          }}>
            <option value="">Equipo</option>
            {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>

          <select value={selectedConsultor} onChange={(e) => {
            setSelectedConsultor(e.target.value);
            setSelectedRole("");
            setSelectedEquipo("");
          }}>
            <option value="">Consultor</option>
            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* PERMISOS */}
      <div className="mat-card">
        <h2>📋 Permisos</h2>

        <input
          className="mat-search"
          placeholder="Buscar permiso"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <table className="mat-table">
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

        <div className="button-bar">
          <button onClick={() => asignar("rol")}>Rol</button>
          <button onClick={() => asignar("equipo")}>Equipo</button>
          <button onClick={() => asignar("consultor")}>Consultor</button>
        </div>
      </div>
    </div>
  );
}

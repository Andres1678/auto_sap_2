import React, { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Link, Navigate } from "react-router-dom";
import { jfetch } from "./lib/api";
import "./CargosPage.css";

export default function CargosPage() {
  const [cargos, setCargos] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [busquedaModulo, setBusquedaModulo] = useState("");
  const [moduloIds, setModuloIds] = useState([]);
  const [id, setId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  let admin = false;
  try {
    const u = JSON.parse(localStorage.getItem("userData") || "null");
    admin = String(u?.rol_ref?.nombre ?? u?.rol ?? u?.user?.rol ?? "").toUpperCase() === "ADMIN";
  } catch {}

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await jfetch("/cargos");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.mensaje || "No se pudieron cargar los cargos");
      const pr = await jfetch('/cargos/modulos');
      const pd = await pr.json();
      if (!pr.ok || !Array.isArray(pd)) throw new Error(pd?.mensaje || 'No se pudieron cargar los módulos');
      setModulos(pd);
      setCargos(data);
    } catch (e) {
      setError(e.message || "Error cargando cargos");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (admin) cargar(); }, [admin, cargar]);
  const limpiar = () => { setId(null); setNombre(""); setModuloIds([]); setBusquedaModulo(""); setFormOpen(false); };
  const guardar = async (e) => {
    e.preventDefault();
    if (saving || !nombre.trim()) return;
    setSaving(true);
    try {
      const res = await jfetch(id === null ? "/cargos" : `/cargos/${id}`, {
        method: id === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), modulo_ids: moduloIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.mensaje || "No se pudo guardar el cargo");
      limpiar();
      await cargar();
      Swal.fire({ icon: "success", title: "Cargo guardado" });
    } catch (e) { Swal.fire({ icon: "error", title: "No se pudo guardar", text: e.message }); }
    finally { setSaving(false); }
  };
  const eliminar = async (cargo) => {
    const confirm = await Swal.fire({
      icon: "warning", title: "¿Eliminar cargo?", text: cargo.nombre,
      showCancelButton: true, confirmButtonText: "Eliminar", cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const res = await jfetch(`/cargos/${cargo.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.mensaje || "No se pudo eliminar el cargo");
      if (id === cargo.id) limpiar();
      await cargar();
    } catch (e) { Swal.fire({ icon: "error", title: "No se pudo eliminar", text: e.message }); }
    finally { setSaving(false); }
  };
  if (!admin) return <Navigate to="/configuracion" replace />;
  const visibles = cargos.filter(c => [c.nombre, ...(c.modulos || []).map(m => m.nombre)].join(' ').toLowerCase().includes(busqueda.trim().toLowerCase()));
  const modulosVisibles = modulos.filter(m => m.nombre.toLowerCase().includes(busquedaModulo.trim().toLowerCase()));
  return (
    <main className="cargos-page">
      <Link to="/configuracion">← Configuración</Link>
      <h1>Gestión de cargos</h1>
      <p>Crea los cargos disponibles para asignarlos desde Gestión de Consultores.</p>
      <button type="button" disabled={saving} onClick={() => {
        setId(null); setNombre(""); setModuloIds([]); setBusquedaModulo(""); setFormOpen(true);
      }}>+ Nuevo cargo</button>
      {formOpen && <form onSubmit={guardar} className="cargos-form">
        <label htmlFor="cargo-nombre">{id === null ? "Nuevo cargo" : "Editar cargo"}</label>
        <input id="cargo-nombre" value={nombre} onChange={e => setNombre(e.target.value)}
          autoFocus maxLength={100} required placeholder="Ej.: Consultor SAP" disabled={saving} />
        <fieldset className="cargos-modulos" disabled={saving}>
          <legend>Módulos asociados al cargo</legend>
          <input type="search" value={busquedaModulo} onChange={e => setBusquedaModulo(e.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
          <div className="cargos-modulos-acciones">
            <button type="button" onClick={() => setModuloIds(prev => [...new Set([...prev, ...modulosVisibles.map(m => m.id)])])}>Seleccionar visibles</button>
            <button type="button" onClick={() => setModuloIds([])}>Quitar todos</button>
            <span>{moduloIds.length} seleccionados</span>
          </div>
          <div className="cargos-modulos-lista">{modulosVisibles.map(m => <label key={m.id}>
            <input type="checkbox" checked={moduloIds.includes(m.id)} onChange={e => setModuloIds(prev => e.target.checked ? [...new Set([...prev, m.id])] : prev.filter(id => id !== m.id))} />{m.nombre}
          </label>)}</div>
          {!modulosVisibles.length && <p>No hay módulos para mostrar.</p>}
        </fieldset>
        <button disabled={saving || !nombre.trim()}>{saving ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={limpiar} disabled={saving}>Cancelar</button>
      </form>}
      <input className="cargos-search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar cargo…" aria-label="Buscar cargo" />
      {error && <p role="alert">{error} <button onClick={cargar}>Reintentar</button></p>}
      <div className="cargos-scroll"><table>
        <thead><tr><th>Cargo</th><th>Módulos asociados</th><th>Acciones</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={3}>Cargando…</td></tr> : visibles.length ? visibles.map(c => (
          <tr key={c.id}><td>{c.nombre}</td><td>{(c.modulos || []).map(m => m.nombre).join(", ") || "Sin módulos asociados"}</td><td>
            <button disabled={saving} onClick={() => { setId(c.id); setNombre(c.nombre); setModuloIds((c.modulo_ids || []).map(Number)); setBusquedaModulo(""); setFormOpen(true); }}>Editar</button>
            <button disabled={saving} onClick={() => eliminar(c)}>Eliminar</button>
          </td></tr>
        )) : <tr><td colSpan={3}>Sin cargos</td></tr>}</tbody>
      </table></div>
    </main>
  );
}

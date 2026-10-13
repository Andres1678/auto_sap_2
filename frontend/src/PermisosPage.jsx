import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch, jsonOrThrow } from "./lib/api";
import "./PermisosPage.css";

const TIPOS = [
  { key: "equipos", nombre: "Equipos" },
  { key: "consultores", nombre: "Consultores" },
  { key: "roles", nombre: "Roles" },
];
const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const ordenar = (a, b) => String(a.codigo || a.nombre || "").localeCompare(String(b.codigo || b.nombre || ""), "es", { sensitivity: "base", numeric: true });
const lista = (data) => {
  if (!Array.isArray(data)) throw new Error("El servidor no devolvió una lista válida.");
  return [...data].sort(ordenar);
};
const inicialSeleccion = () => ({ equipos: new Set(), consultores: new Set(), roles: new Set() });

export default function PermisosPage() {
  const [permisos, setPermisos] = useState([]);
  const [catalogos, setCatalogos] = useState({ equipos: [], consultores: [], roles: [] });
  const [seleccionPermisos, setSeleccionPermisos] = useState(new Set());
  const [seleccion, setSeleccion] = useState(inicialSeleccion);
  const [tipo, setTipo] = useState("equipos");
  const [busquedaPermiso, setBusquedaPermiso] = useState("");
  const [busquedaDestino, setBusquedaDestino] = useState("");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const datos = await Promise.all(["permisos", ...TIPOS.map((t) => t.key)].map((ruta) => jfetch(`/${ruta}`).then(jsonOrThrow).then(lista)));
      setPermisos(datos[0]);
      setCatalogos({ equipos: datos[1], consultores: datos[2], roles: datos[3] });
      setSeleccionPermisos(new Set());
      setSeleccion(inicialSeleccion());
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los catálogos de permisos.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visiblesPermisos = useMemo(() => permisos.filter((p) => norm(`${p.codigo} ${p.descripcion || ""}`).includes(norm(busquedaPermiso))), [permisos, busquedaPermiso]);
  const visiblesDestinos = useMemo(() => catalogos[tipo].filter((d) => norm(`${d.nombre} ${d.usuario || ""}`).includes(norm(busquedaDestino))), [catalogos, tipo, busquedaDestino]);
  const destinatarios = TIPOS.flatMap((t) => catalogos[t.key].filter((d) => seleccion[t.key].has(String(d.id))).map((d) => ({ ...d, tipo: t.key })));
  const cantidadDestinos = destinatarios.length;
  const cambiarPermiso = (id) => setSeleccionPermisos((actual) => {
    const next = new Set(actual); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const cambiarDestino = (id) => setSeleccion((actual) => {
    const next = new Set(actual[tipo]); next.has(id) ? next.delete(id) : next.add(id); return { ...actual, [tipo]: next };
  });
  const marcarPermisosVisibles = () => setSeleccionPermisos((actual) => new Set([...actual, ...visiblesPermisos.map((p) => String(p.id))]));
  const marcarDestinosVisibles = () => setSeleccion((actual) => ({ ...actual, [tipo]: new Set([...actual[tipo], ...visiblesDestinos.map((d) => String(d.id))]) }));

  const asignar = async () => {
    if (guardando || !seleccionPermisos.size || !cantidadDestinos) return;
    setGuardando(true);
    setResultado(null);
    let asignados = 0;
    let existentes = 0;
    const errores = [];
    try {
      for (const destino of destinatarios) {
        const ruta = `/${destino.tipo}/${destino.id}/permisos`;
        let vigentes;
        try {
          vigentes = new Set(lista(await jfetch(ruta).then(jsonOrThrow)).map((p) => String(p.id)));
        } catch (e) {
          errores.push(`${destino.nombre}: no se pudieron consultar las asignaciones (${e.message}).`);
          continue;
        }
        for (const id of seleccionPermisos) {
          if (vigentes.has(id)) { existentes += 1; continue; }
          const permiso = permisos.find((p) => String(p.id) === id);
          try {
            await jfetch(ruta, { method: "POST", body: { permiso_id: Number(id) } }).then(jsonOrThrow);
            vigentes.add(id);
            asignados += 1;
          } catch (e) { errores.push(`${destino.nombre} · ${permiso?.codigo || id}: ${e.message}`); }
        }
      }
      setResultado({ asignados, existentes, errores });
      if (!errores.length) {
        setSeleccionPermisos(new Set());
        setSeleccion(inicialSeleccion());
      }
      await Swal.fire({
        icon: errores.length ? "warning" : "success",
        title: errores.length ? "Asignación completada con pendientes" : "Permisos asignados",
        text: `${asignados} asignaciones nuevas; ${existentes} ya existentes; ${errores.length} pendientes.`,
      });
    } finally { setGuardando(false); }
  };

  return (
    <main className="pa-page">
      <header className="pa-header">
        <div><span className="pa-kicker">Administración de acceso</span><h1>Asignación de permisos</h1><p>Selecciona varios permisos y asígnalos a equipos, consultores o roles.</p></div>
        <button type="button" disabled={loading || guardando} onClick={cargar}>Actualizar listas</button>
      </header>
      {loading && <p role="status">Cargando catálogos…</p>}
      {!loading && error && <p role="alert" className="pa-error">{error}</p>}
      {!loading && !error && <>
        <div className="pa-grid">
          <section className="pa-panel">
            <h2>1. Permisos <small>{seleccionPermisos.size} seleccionados</small></h2>
            <label className="pa-search">Buscar permiso<input disabled={guardando} value={busquedaPermiso} onChange={(e) => setBusquedaPermiso(e.target.value)} placeholder="Código o descripción" /></label>
            <div className="pa-tools"><button type="button" disabled={guardando || !visiblesPermisos.length} onClick={marcarPermisosVisibles}>Seleccionar visibles</button><button type="button" disabled={guardando} onClick={() => setSeleccionPermisos(new Set())}>Limpiar permisos</button></div>
            <div className="pa-list">
              {visiblesPermisos.map((p) => <label className="pa-row" key={p.id}><input type="checkbox" disabled={guardando} checked={seleccionPermisos.has(String(p.id))} onChange={() => cambiarPermiso(String(p.id))} /><span><strong>{p.codigo}</strong><small>{p.descripcion || "Sin descripción"}</small></span></label>)}
              {!visiblesPermisos.length && <p>No hay permisos que coincidan.</p>}
            </div>
          </section>
          <section className="pa-panel">
            <h2>2. Destinatarios <small>{cantidadDestinos} seleccionados</small></h2>
            <div className="pa-tabs" aria-label="Tipo de destinatario">{TIPOS.map((t) => <button type="button" key={t.key} disabled={guardando} aria-pressed={tipo === t.key} onClick={() => { setTipo(t.key); setBusquedaDestino(""); }}>{t.nombre} ({seleccion[t.key].size})</button>)}</div>
            <label className="pa-search">Buscar destinatario<input disabled={guardando} value={busquedaDestino} onChange={(e) => setBusquedaDestino(e.target.value)} placeholder="Nombre o usuario" /></label>
            <div className="pa-tools"><button type="button" disabled={guardando || !visiblesDestinos.length} onClick={marcarDestinosVisibles}>Seleccionar visibles</button><button type="button" disabled={guardando} onClick={() => setSeleccion((actual) => ({ ...actual, [tipo]: new Set() }))}>Limpiar {tipo}</button></div>
            <div className="pa-list">
              {visiblesDestinos.map((d) => <label className="pa-row" key={d.id}><input type="checkbox" disabled={guardando} checked={seleccion[tipo].has(String(d.id))} onChange={() => cambiarDestino(String(d.id))} /><span><strong>{d.nombre}</strong>{d.usuario && <small>{d.usuario}</small>}</span></label>)}
              {!visiblesDestinos.length && <p>No hay destinatarios que coincidan.</p>}
            </div>
            <p className="pa-note">Las selecciones se conservan al cambiar de tipo. Puedes combinar equipos, consultores y roles.</p>
          </section>
        </div>
        <footer className="pa-action"><span>{seleccionPermisos.size} permisos × {cantidadDestinos} destinatarios = <strong>{seleccionPermisos.size * cantidadDestinos} asignaciones posibles</strong></span><button type="button" className="pa-primary" disabled={guardando || !seleccionPermisos.size || !cantidadDestinos} onClick={asignar}>{guardando ? "Asignando…" : "Asignar permisos seleccionados"}</button></footer>
      </>}
      {resultado && <section className="pa-result" aria-live="polite"><p>{resultado.asignados} asignaciones nuevas · {resultado.existentes} ya existentes</p>{resultado.errores.length > 0 && <><p>Las asignaciones exitosas quedaron guardadas. Puedes reintentar los pendientes:</p><ul>{resultado.errores.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</section>}
    </main>
  );
}

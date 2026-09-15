import React, { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ClientesTable.css";

const API = "/clientes";
const EMPTY = { nit: "", razon_social: "", alias: "", nombre_cliente: "" };
const LABELS = { nit: "NIT", razon_social: "Razón social", alias: "Alias", nombre_cliente: "Cliente" };

async function readResponse(res) {
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`La API devolvió una respuesta no JSON (HTTP ${res.status}). Revisa la sesión, la URL configurada en lib/api y el backend.`); }
  if (!res.ok) throw new Error(data?.mensaje || data?.error || `Error HTTP ${res.status}`);
  return data;
}

export default function ClientesTable() {
  const [clientes, setClientes] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [asc, setAsc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const inputFile = useRef(null);
  const requestNumber = useRef(0);

  async function cargar() {
    const requestId = ++requestNumber.current;
    setLoading(true); setError("");
    try {
      const data = await readResponse(await jfetch(API));
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
      if (!rows) throw new Error("La respuesta de /clientes no contiene una lista. Revisa el contrato de la API.");
      if (requestId === requestNumber.current) setClientes(rows);
    } catch (e) {
      if (requestId === requestNumber.current) { setError(e.message); setClientes([]); }
    } finally { if (requestId === requestNumber.current) setLoading(false); }
  }
  useEffect(() => { cargar(); return () => { requestNumber.current += 1; }; }, []);

  const visible = useMemo(() => clientes.filter(c => Object.keys(EMPTY).some(k => String(c[k] ?? "").toLocaleLowerCase("es").includes(filtro.trim().toLocaleLowerCase("es"))))
    .sort((a, b) => (asc ? 1 : -1) * String(a.nombre_cliente ?? "").localeCompare(String(b.nombre_cliente ?? ""), "es", { sensitivity: "base" })), [clientes, filtro, asc]);

  function abrir(cliente = null) {
    setEditing(cliente);
    setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, String(cliente?.[k] ?? "")])));
    setModal(true);
  }
  async function guardar(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k,v]) => [k,v.trim()]));
      if (!payload.nit || !payload.razon_social || !payload.nombre_cliente) throw new Error("NIT, razón social y cliente son obligatorios.");
      await readResponse(await jfetch(editing ? `${API}/${editing.id}` : API, { method: editing ? "PUT" : "POST", body: payload }));
      setModal(false); await cargar();
      await Swal.fire("Guardado", "Cliente guardado correctamente.", "success");
    } catch (e) { await Swal.fire("No se pudo guardar", e.message, "error"); }
    finally { setBusy(false); }
  }
  async function eliminar(cliente) {
    if (busy) return;
    const result = await Swal.fire({ title: "¿Eliminar cliente?", text: cliente.nombre_cliente, icon: "warning", showCancelButton: true, confirmButtonText: "Eliminar", cancelButtonText: "Cancelar" });
    if (!result.isConfirmed) return;
    setBusy(true);
    try { await readResponse(await jfetch(`${API}/${cliente.id}`, { method: "DELETE" })); await cargar(); }
    catch (e) { await Swal.fire("No se pudo eliminar", e.message, "error"); }
    finally { setBusy(false); }
  }
  async function descargar(plantilla = false) {
    setBusy(true);
    try {
      const res = await jfetch(`${API}/export-excel${plantilla ? "?plantilla=1" : ""}`);
      if (!res.ok) await readResponse(res);
      if (!(res.headers.get("content-type") || "").includes("spreadsheetml")) throw new Error("La descarga no devolvió un archivo Excel. Revisa la sesión y el backend.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = plantilla ? "Plantilla_clientes.xlsx" : "Clientes.xlsx";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { await Swal.fire("No se pudo descargar", e.message, "error"); }
    finally { setBusy(false); }
  }
  async function importar(e) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    const result = await Swal.fire({ title: "Importar clientes", text: "Se crearán clientes nuevos y se actualizarán los existentes por NIT. No se eliminarán clientes. ¿Continuar?", icon: "question", showCancelButton: true, confirmButtonText: "Importar", cancelButtonText: "Cancelar" });
    if (!result.isConfirmed) return;
    setBusy(true);
    try {
      const body = new FormData(); body.append("file", file);
      const data = await readResponse(await jfetch(`${API}/import-excel`, { method: "POST", body }));
      await cargar(); await Swal.fire("Excel procesado", `${data.creados} creados; ${data.actualizados} actualizados; ${data.sin_cambios} sin cambios.`, "success");
    } catch (e) { await Swal.fire("No se importó el archivo", e.message, "error"); }
    finally { setBusy(false); }
  }
  return <main className="clientes-wrapper">
    <header className="clientes-header"><div><p className="clientes-eyebrow">CATÁLOGOS</p><h2>Gestión de clientes</h2><p>Consulta, actualiza y administra la información de tus clientes.</p></div><button disabled={busy} onClick={() => abrir()}>+ Nuevo cliente</button></header>
    <section className="clientes-tools"><input aria-label="Buscar clientes" placeholder="Buscar NIT, razón social, alias o cliente…" value={filtro} onChange={e => setFiltro(e.target.value)} />
      <button className="secondary" disabled={loading || busy} onClick={cargar}>Actualizar</button>
      <button className="secondary" disabled={busy || loading} onClick={() => descargar()}>Descargar todos</button>
      <button className="secondary" disabled={busy} onClick={() => descargar(true)}>Plantilla Excel</button>
      <button disabled={busy} onClick={() => inputFile.current?.click()}>Subir Excel</button>
      <input ref={inputFile} hidden type="file" accept=".xlsx" onChange={importar} />
    </section>
    <p className="clientes-count" aria-live="polite">{busy ? "Procesando…" : `${visible.length} de ${clientes.length} clientes`}</p>
    {error && <div role="alert" className="clientes-error">{error}</div>}
    <div className="clientes-table-scroll"><table><thead><tr><th>NIT</th><th>Razón social</th><th>Alias</th><th aria-sort={asc ? "ascending" : "descending"}><button className="sort" onClick={() => setAsc(!asc)}>Cliente {asc ? "↑" : "↓"}</button></th><th>Acciones</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={5}>Cargando clientes…</td></tr> : error ? <tr><td colSpan={5}>No fue posible consultar la lista.</td></tr> : !visible.length ? <tr><td colSpan={5}>{filtro ? "Sin coincidencias para esta búsqueda." : "No hay clientes registrados."}</td></tr> : visible.map(c => <tr key={c.id}><td>{c.nit}</td><td>{c.razon_social}</td><td>{c.alias || "—"}</td><td>{c.nombre_cliente}</td><td><div className="clientes-actions"><button className="secondary" disabled={busy} onClick={() => abrir(c)}>Editar</button><button className="danger" disabled={busy} onClick={() => eliminar(c)}>Eliminar</button></div></td></tr>)}</tbody>
    </table></div>
    {modal && <div className="clientes-backdrop"><form onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="clientes-modal-title" className="clientes-modal"><header><h3 id="clientes-modal-title">{editing ? "Editar cliente" : "Nuevo cliente"}</h3><button type="button" className="secondary" disabled={busy} aria-label="Cerrar" onClick={() => setModal(false)}>×</button></header><div className="clientes-form-grid">{Object.keys(EMPTY).map((key,i) => <label key={key}>{LABELS[key]}{key !== "alias" && " *"}<input autoFocus={i === 0} required={key !== "alias"} maxLength={key === "nit" ? 50 : 255} value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})} /></label>)}</div><footer><button type="button" disabled={busy} className="secondary" onClick={() => setModal(false)}>Cancelar</button><button disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar"}</button></footer></form></div>}
  </main>;
}

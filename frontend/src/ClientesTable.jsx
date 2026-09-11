import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import "./ClientesTable.css";
import { jfetch } from "./lib/api";

const API_URL = "/clientes";
const FORM_VACIO = { nit: "", razon_social: "", alias: "", nombre_cliente: "" };

export default function ClientesTable() {
  const [clientes, setClientes] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [ordenAsc, setOrdenAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const cargarClientes = async () => {
    try {
      setCargando(true);
      const res = await jfetch(API_URL);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.mensaje || "Error cargando clientes");
      setClientes(Array.isArray(data) ? data : []);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarClientes(); }, []);

  const clientesVisibles = useMemo(() => {
    const texto = filtro.trim().toLocaleLowerCase("es");
    return clientes
      .filter((c) => !texto || [c.nit, c.razon_social, c.alias, c.nombre_cliente]
        .some((v) => String(v || "").toLocaleLowerCase("es").includes(texto)))
      .sort((a, b) => {
        const resultado = String(a.nombre_cliente || "").localeCompare(
          String(b.nombre_cliente || ""), "es", { sensitivity: "base" }
        );
        return ordenAsc ? resultado : -resultado;
      });
  }, [clientes, filtro, ordenAsc]);

  const abrirModal = (cliente = null) => {
    setEditando(cliente);
    setForm(cliente ? {
      nit: cliente.nit || "",
      razon_social: cliente.razon_social || "",
      alias: cliente.alias || "",
      nombre_cliente: cliente.nombre_cliente || "",
    } : FORM_VACIO);
    setShowModal(true);
  };

  const cerrarModal = () => { setShowModal(false); setEditando(null); setForm(FORM_VACIO); };
  const cambiarCampo = (e) => setForm((actual) => ({ ...actual, [e.target.name]: e.target.value }));

  const guardarCliente = async () => {
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
    if (!payload.nit || !payload.razon_social || !payload.nombre_cliente) {
      return Swal.fire("Campos requeridos", "NIT, razón social y cliente son obligatorios", "warning");
    }
    try {
      setGuardando(true);
      const res = await jfetch(editando ? `${API_URL}/${editando.id}` : API_URL, {
        method: editando ? "PUT" : "POST", body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje || "Error guardando cliente");
      await Swal.fire("Éxito", editando ? "Cliente actualizado correctamente" : "Cliente creado correctamente", "success");
      cerrarModal();
      await cargarClientes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally { setGuardando(false); }
  };

  const eliminarCliente = async (id) => {
    const confirmacion = await Swal.fire({ title: "¿Eliminar cliente?", icon: "warning", showCancelButton: true, confirmButtonText: "Sí, eliminar", cancelButtonText: "Cancelar" });
    if (!confirmacion.isConfirmed) return;
    try {
      const res = await jfetch(`${API_URL}/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje || "Error eliminando cliente");
      await Swal.fire("Eliminado", "Cliente eliminado correctamente", "success");
      cargarClientes();
    } catch (err) { Swal.fire("Error", err.message, "error"); }
  };

  return <div className="clientes-wrapper">
    <h2>🗂️ Gestión de Clientes</h2>
    <div className="clientes-filtros">
      <div className="clientes-input-icon"><span>🔍</span><input placeholder="Buscar por NIT, razón social, alias o cliente..." value={filtro} onChange={(e) => setFiltro(e.target.value)} /></div>
      {filtro && <button className="clientes-btn-limpiar" onClick={() => setFiltro("")}>Limpiar ✖</button>}
      <button className="clientes-btn-agregar" onClick={() => abrirModal()}>+ Cliente</button>
    </div>
    <div className="clientes-contador">Mostrando <strong>{clientesVisibles.length}</strong> cliente(s)</div>
    {cargando && <p className="clientes-loader">Cargando...</p>}
    <div className="clientes-tabla-envuelta"><table className="clientes-tabla">
      <thead><tr><th>NIT</th><th>Razón social</th><th>Alias</th><th onClick={() => setOrdenAsc(!ordenAsc)}>Cliente {ordenAsc ? "↑" : "↓"}</th><th>Acciones</th></tr></thead>
      <tbody>{clientesVisibles.length ? clientesVisibles.map((c) => <tr key={c.id}>
        <td>{c.nit || "-"}</td><td>{c.razon_social || "-"}</td><td>{c.alias || "-"}</td><td>{c.nombre_cliente}</td>
        <td><div className="clientes-acciones"><button className="clientes-btn clientes-btn-warning" onClick={() => abrirModal(c)}>✏️</button><button className="clientes-btn clientes-btn-danger" onClick={() => eliminarCliente(c.id)}>🗑️</button></div></td>
      </tr>) : <tr><td colSpan="5" className="clientes-no-data">Sin resultados</td></tr>}</tbody>
    </table></div>
    {showModal && <div className="clientes-modal-backdrop"><div className="clientes-modal">
      <div className="clientes-modal-header"><h5>{editando ? "Editar Cliente" : "Nuevo Cliente"}</h5><button className="clientes-btn-close" onClick={cerrarModal}>×</button></div>
      <div className="clientes-modal-body clientes-form-grid">
        <div><label>NIT *</label><input name="nit" value={form.nit} onChange={cambiarCampo} maxLength="50" /></div>
        <div><label>Razón social *</label><input name="razon_social" value={form.razon_social} onChange={cambiarCampo} maxLength="255" /></div>
        <div><label>Alias</label><input name="alias" value={form.alias} onChange={cambiarCampo} maxLength="255" /></div>
        <div><label>Cliente *</label><input name="nombre_cliente" value={form.nombre_cliente} onChange={cambiarCampo} maxLength="255" /></div>
      </div>
      <div className="clientes-modal-footer"><button className="clientes-btn-secondary" onClick={cerrarModal}>Cancelar</button><button className="clientes-btn-primary" disabled={guardando} onClick={guardarCliente}>{guardando ? "Guardando..." : "Guardar"}</button></div>
    </div></div>}
  </div>;
}

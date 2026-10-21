import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { jfetch } from './lib/api';
import './CargosPage.css';

export default function EspecialidadesPage() {
  const [especialidades, setEspecialidades] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [form, setForm] = useState({ id: null, nombre: '', modulo_id: '' });
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  let admin = false;
  try {
    const u = JSON.parse(localStorage.getItem('userData') || 'null');
    admin = String(u?.rol_ref?.nombre ?? u?.rol ?? u?.user?.rol ?? '').trim().toUpperCase() === 'ADMIN';
  } catch {}
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const respuestas = await Promise.all([jfetch('/especialidades'), jfetch('/modulos')]);
      const datos = await Promise.all(respuestas.map(r => r.json()));
      respuestas.forEach((r, i) => {
        if (!r.ok || !Array.isArray(datos[i])) throw new Error(datos[i]?.mensaje || 'No se pudo cargar el catálogo.');
      });
      setEspecialidades(datos[0]); setModulos(datos[1]);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { if (admin) cargar(); }, [admin, cargar]);
  const cerrar = () => { setAbierto(false); setForm({ id: null, nombre: '', modulo_id: '' }); };
  const guardar = async e => {
    e.preventDefault(); if (guardando) return;
    setGuardando(true);
    try {
      const r = await jfetch(form.id === null ? '/especialidades' : `/especialidades/${form.id}`, {
        method: form.id === null ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre.trim(), modulo_id: Number(form.modulo_id) }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d?.mensaje || 'No se pudo guardar.');
      cerrar(); await cargar(); Swal.fire({ icon: 'success', title: 'Especialidad guardada' });
    } catch (e) { Swal.fire({ icon: 'error', title: 'Error guardando', text: e.message }); }
    finally { setGuardando(false); }
  };
  const eliminar = async especialidad => {
    const c = await Swal.fire({ icon: 'warning', title: '¿Eliminar especialidad?', text: especialidad.nombre,
      showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!c.isConfirmed) return;
    setGuardando(true);
    try {
      const r = await jfetch(`/especialidades/${especialidad.id}`, { method: 'DELETE' });
      const d = await r.json(); if (!r.ok) throw new Error(d?.mensaje || 'No se pudo eliminar.');
      if (form.id === especialidad.id) cerrar(); await cargar();
    } catch (e) { Swal.fire({ icon: 'error', title: 'Error eliminando', text: e.message }); }
    finally { setGuardando(false); }
  };
  if (!admin) return <Navigate to='/configuracion' replace />;
  const visibles = especialidades.filter(e => `${e.nombre} ${e.modulo_nombre}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  return <main className='cargos-page'>
    <Link to='/configuracion'>← Configuración</Link>
    <h1>Gestión de especialidades</h1>
    <p>Crea una especialidad y selecciona su módulo. Después podrás asociarla a uno o varios cargos.</p>
    <button type='button' disabled={guardando} onClick={() => { cerrar(); setAbierto(true); }}>+ Nueva especialidad</button>
    <Link to='/configuracion/cargos' style={{ marginLeft: 16 }}>Gestionar cargos</Link>
    {abierto && <form className='cargos-form' onSubmit={guardar}>
      <label htmlFor='especialidad-nombre'>Nombre</label>
      <input id='especialidad-nombre' value={form.nombre} maxLength={150} required disabled={guardando} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
      <label htmlFor='especialidad-modulo'>Módulo</label>
      <select id='especialidad-modulo' value={form.modulo_id} required disabled={guardando} onChange={e => setForm(f => ({ ...f, modulo_id: e.target.value }))}>
        <option value=''>Selecciona un módulo</option>
        {modulos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
      </select>
      <button disabled={guardando || !form.nombre.trim() || !form.modulo_id}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      <button type='button' disabled={guardando} onClick={cerrar}>Cancelar</button>
    </form>}
    <div><input className='cargos-search' placeholder='Buscar especialidad o módulo…' aria-label='Buscar especialidad' value={busqueda} onChange={e => setBusqueda(e.target.value)} /></div>
    {error && <p role='alert'>{error} <button onClick={cargar}>Reintentar</button></p>}
    <div className='cargos-scroll'><table><thead><tr><th>Especialidad</th><th>Módulo</th><th>Acciones</th></tr></thead>
      <tbody>{cargando ? <tr><td colSpan={3}>Cargando…</td></tr> : visibles.length ? visibles.map(e => <tr key={e.id}>
        <td>{e.nombre}</td><td>{e.modulo_nombre}</td><td>
          <button disabled={guardando} onClick={() => { setForm({ id: e.id, nombre: e.nombre, modulo_id: String(e.modulo_id) }); setAbierto(true); }}>Editar</button>
          <button disabled={guardando} onClick={() => eliminar(e)}>Eliminar</button>
        </td></tr>) : <tr><td colSpan={3}>Sin especialidades</td></tr>}</tbody></table></div>
  </main>;
}

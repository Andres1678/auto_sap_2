import React, { useCallback, useEffect, useState } from "react";
import { jfetch } from "./lib/api";
import Swal from "sweetalert2";
import "./AsistenciaTriara.css";

const MES_ACTUAL = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit",
}).formatToParts(new Date()).filter(p => p.type === "year" || p.type === "month")
  .reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
const mesActual = () => { const p = MES_ACTUAL(); return `${p.year}-${p.month}`; };
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const nombreMes = mes => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" })
  .format(new Date(`${mes}-01T12:00:00`));
const fechaCorta = fecha => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
  .format(new Date(`${fecha}T12:00:00`));
const semanaTexto = lunes => `Semana del ${fechaCorta(lunes)}`;

function RegistroAsistencia({ registro, alGuardar, alCambiar, guardando }) {
  const [estado, setEstado] = useState(registro.estado);
  const [justificacion, setJustificacion] = useState(registro.justificacion || "");
  useEffect(() => { setEstado(registro.estado); setJustificacion(registro.justificacion || ""); },
    [registro.estado, registro.justificacion]);
  const etiquetas = { PENDIENTE: "Por confirmar", ASISTIO: "Asistió", NO_ASISTIO: "No asistió" };
  return <article className={`triara-persona estado-${registro.estado.toLowerCase()}`}>
    <strong>{registro.nombre}</strong>
    <span className="triara-estado">{etiquetas[registro.estado] || registro.estado}</span>
    {registro.puede_confirmar ? <form onSubmit={e => {
      e.preventDefault(); alGuardar(registro.id, estado, justificacion);
    }}>
      <div className="triara-opciones">
        <label><input type="radio" name={`estado-${registro.id}`} value="ASISTIO"
          checked={estado === "ASISTIO"} onChange={() => setEstado("ASISTIO")} disabled={guardando} /> Sí asistí</label>
        <label><input type="radio" name={`estado-${registro.id}`} value="NO_ASISTIO"
          checked={estado === "NO_ASISTIO"} onChange={() => setEstado("NO_ASISTIO")} disabled={guardando} /> No asistí</label>
      </div>
      {estado === "NO_ASISTIO" && <label className="triara-motivo">¿Por qué no asististe?
        <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
          required maxLength={2000} disabled={guardando} placeholder="Escribe la justificación" />
      </label>}
      <button disabled={guardando || estado === "PENDIENTE"} type="submit">Guardar confirmación</button>
    </form> : registro.justificacion ? <p className="triara-justificacion">{registro.justificacion}</p> : null}
    {registro.puede_reasignar && <button type="button" className="triara-secondary"
      disabled={guardando} onClick={() => alCambiar(registro)}>Cambiar día</button>}
  </article>;
}

function MesTriara({ mes }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ consultor_id: "", fecha: "", asignacion_id: null });
  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const res = await jfetch(`/asistencia-triara?mes=${encodeURIComponent(mes)}`);
      const json = await res.json();
      if (!res.ok || !Array.isArray(json?.semanas)) throw new Error(json?.mensaje || "No se pudo cargar el mes.");
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, [mes]);
  useEffect(() => { cargar(); }, [cargar]);
  const guardar = async (ruta, method, payload) => {
    if (guardando) return false;
    setGuardando(true);
    try {
      const res = await jfetch(ruta, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.mensaje || "No se pudo guardar.");
      await cargar();
      await Swal.fire({ icon: "success", title: json.mensaje || "Guardado" });
      return true;
    } catch (e) { await Swal.fire({ icon: "error", title: "No se pudo guardar", text: e.message }); return false; }
    finally { setGuardando(false); }
  };
  const confirmar = (id, estado, justificacion) => guardar(`/asistencia-triara/${id}/confirmacion`, "PUT", { estado, justificacion });
  const cambiar = r => {
    setForm({ consultor_id: String(r.consultor_id), fecha: r.fecha, asignacion_id: r.id });
    document.getElementById(`triara-asignar-${mes}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  if (cargando && !data) return <p role="status">Cargando calendario…</p>;
  if (error) return <p role="alert">{error} <button onClick={cargar}>Reintentar</button></p>;
  if (!data) return null;
  const fechas = data.semanas.flatMap(s => s.dias);
  return <div className="triara-mes-contenido" aria-busy={cargando}>
    <div className="triara-mes-info">
      <span className={data.cerrado ? "triara-cerrado" : "triara-abierto"}>{data.cerrado ? "Mes cerrado · Solo consulta" : "Mes abierto"}</span>
      <span>{data.asistencias.length} días asignados</span>
    </div>
    {data.puede_asignar && !data.cerrado && <form id={`triara-asignar-${mes}`} className="triara-asignar" onSubmit={async e => {
      e.preventDefault();
      if (await guardar("/asistencia-triara/asignaciones", "POST", form)) setForm({ consultor_id: "", fecha: "", asignacion_id: null });
    }}>
      <h3>{form.asignacion_id ? "Cambiar el día asignado" : "Asignar día de asistencia"}</h3>
      <label>Consultor<select required value={form.consultor_id} disabled={guardando || !!form.asignacion_id}
        onChange={e => setForm({ ...form, consultor_id: e.target.value })}>
        <option value="">Seleccionar consultor</option>
        {data.consultores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select></label>
      <label>Día laboral<select required value={form.fecha} disabled={guardando} onChange={e => setForm({ ...form, fecha: e.target.value })}>
        <option value="">Seleccionar día</option>
        {fechas.map(d => <option key={d.fecha} value={d.fecha}>{DIAS[d.dia]} {fechaCorta(d.fecha)}</option>)}
      </select></label>
      <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar asignación"}</button>
      {form.asignacion_id && <button type="button" className="triara-secondary" disabled={guardando}
        onClick={() => setForm({ consultor_id: "", fecha: "", asignacion_id: null })}>Cancelar cambio</button>}
    </form>}
    {!data.puede_registrar && <p className="triara-aviso">Tu acceso a esta vista es de consulta.</p>}
    <div className="triara-semanas">{data.semanas.map(semana => <section key={semana.lunes} className="triara-semana">
      <h3>{semanaTexto(semana.lunes)}</h3>
      <div className="triara-dias" style={{ "--triara-dias": semana.dias.length }}>
        {semana.dias.map(dia => {
          const asignados = data.asistencias.filter(r => r.fecha === dia.fecha);
          return <div key={dia.fecha} className={`triara-dia ${dia.fecha === data.hoy ? "es-hoy" : ""}`}>
            <header><strong>{DIAS[dia.dia]}</strong><span>{fechaCorta(dia.fecha)}</span></header>
            {asignados.length ? asignados.map(r => <RegistroAsistencia key={r.id} registro={r}
              alGuardar={confirmar} alCambiar={cambiar} guardando={guardando || cargando} />) : <p className="triara-vacio">Sin asignaciones</p>}
          </div>;
        })}
      </div>
    </section>)}</div>
    <p className="triara-nota">Un día por consultor cada semana. No se muestran fines de semana ni festivos de Colombia. Cada persona confirma únicamente su propia asistencia desde el día asignado. Los meses anteriores son solo de consulta.</p>
  </div>;
}

export default function AsistenciaTriara() {
  const [mesElegido, setMesElegido] = useState(mesActual);
  const [periodos, setPeriodos] = useState([mesActual()]);
  const [abiertos, setAbiertos] = useState({ [mesActual()]: true });
  const [error, setError] = useState("");
  const cargarPeriodos = useCallback(async () => {
    setError("");
    try {
      const res = await jfetch("/asistencia-triara/periodos"); const data = await res.json();
      if (!res.ok || !Array.isArray(data?.periodos)) throw new Error(data?.mensaje || "No se pudo cargar el historial.");
      setPeriodos(prev => [...new Set([...prev, ...data.periodos])].sort().reverse());
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);
  const abrirMes = e => {
    e.preventDefault(); if (!mesElegido) return;
    setPeriodos(prev => [...new Set([...prev, mesElegido])].sort().reverse());
    setAbiertos(prev => ({ ...prev, [mesElegido]: true }));
  };
  return <main className="triara-page">
    <header className="triara-cabecera"><div><span className="triara-kicker">Planeación y seguimiento</span>
      <h1>Asistencia a Triara</h1><p>Consulta tu día semanal y confirma si asististe.</p>
    </div><form onSubmit={abrirMes} className="triara-selector">
      <label>Consultar mes<input type="month" min="2000-01" max="2100-12" value={mesElegido} required onChange={e => setMesElegido(e.target.value)} /></label>
      <button type="submit">Mostrar mes</button>
    </form></header>
    {error && <p role="alert">{error} <button onClick={cargarPeriodos}>Reintentar</button></p>}
    {periodos.map(mes => <section key={mes} className="triara-mes">
      <button type="button" className="triara-mes-toggle" aria-expanded={!!abiertos[mes]}
        onClick={() => setAbiertos(prev => ({ ...prev, [mes]: !prev[mes] }))}>
        <span>{abiertos[mes] ? "▾" : "▸"} {nombreMes(mes)}</span><small>{abiertos[mes] ? "Ocultar mes" : "Mostrar mes"}</small>
      </button>
      {abiertos[mes] && <MesTriara mes={mes} />}
    </section>)}
  </main>;
}

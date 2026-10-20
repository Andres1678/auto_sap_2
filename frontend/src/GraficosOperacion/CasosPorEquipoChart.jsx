import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { buscarCasosEquipo, resumirCasosPorEquipo, opcionesTareasEquipo, filtrarTareasEquipo, registrosDelEquipo, opcionesOcupacionesEquipo, filtrarOcupacionesEquipo } from '../casosPorEquipo';
import './CasosPorEquipoChart.css';

const nf=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2});
const h=v=>`${nf.format(v || 0)} h`;
function TooltipEquipo({active,payload}) {
  const t=payload?.[0]?.payload;if(!active||!t)return null;
  return <div className="pgx-cases-tooltip"><strong>{t.equipo}</strong><span>Casos agrupados: {t.totalCasos}</span><span>Registros con caso: {t.registrosConCaso}</span><span>Horas con caso, sin duplicar filas: {h(t.horasConCaso)}</span></div>;
}
function ResumenEquipo({team: equipoBase,rows,periodo,onClose}) {
  const [filtrosAbiertos,setFiltrosAbiertos]=useState(true);
  const [ocupacionesSeleccionadas,setOcupacionesSeleccionadas]=useState(null);
  const [tareasSeleccionadas,setTareasSeleccionadas]=useState(null);
  const ocupaciones=useMemo(()=>opcionesOcupacionesEquipo(rows),[rows]);
  const filasOcupaciones=useMemo(()=>filtrarOcupacionesEquipo(rows,ocupacionesSeleccionadas),[rows,ocupacionesSeleccionadas]);
  const cambiarOcupaciones=seleccion=>{
    setOcupacionesSeleccionadas(seleccion);
    setTareasSeleccionadas(null);
  };
  const toggleOcupacion=key=>{
    const keys=ocupacionesSeleccionadas===null?ocupaciones.map(o=>o.key):ocupacionesSeleccionadas;
    cambiarOcupaciones(keys.includes(key)?keys.filter(k=>k!==key):[...keys,key]);
  };
  const tareas=useMemo(()=>opcionesTareasEquipo(filasOcupaciones),[filasOcupaciones]);
  const filasFiltradas=useMemo(()=>filtrarTareasEquipo(filasOcupaciones,tareasSeleccionadas),[filasOcupaciones,tareasSeleccionadas]);
  const team=useMemo(()=>resumirCasosPorEquipo(filasFiltradas)[0] || {
    equipo:equipoBase.equipo,casos:[],totalCasos:0,totalConsultores:0,
    registros:0,horas:0,registrosConCaso:0,horasConCaso:0,registrosSinCaso:0,horasSinCaso:0,
  },[filasFiltradas,equipoBase.equipo]);
  const toggleTarea=key=>setTareasSeleccionadas(prev=>{
    const keys=prev===null?tareas.map(t=>t.key):prev;
    return keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];
  });
  const [busqueda,setBusqueda]=useState('');
  const [abierto,setAbierto]=useState('');
  useEffect(()=>{setAbierto('');},[tareasSeleccionadas,ocupacionesSeleccionadas]);
  const visibles=useMemo(()=>buscarCasosEquipo(team.casos,busqueda),[team.casos,busqueda]);
  return <Modal isOpen onRequestClose={onClose} contentLabel={`Casos registrados por ${team.equipo}`} className="pgx-cases-modal" overlayClassName="pgx-cases-overlay" bodyOpenClassName="pgx-cases-body-open">
    <header className="pgx-cases-modal-head"><div><span>Resumen de casos por equipo</span><h2>{team.equipo}</h2><p>{periodo} · Filtros aplicados en gráficos</p></div><button type="button" className="pgx-cases-close" onClick={onClose} aria-label="Cerrar resumen del equipo">×</button></header>
    <div className="pgx-cases-modal-body">
      <section className="pgx-cases-filters" aria-label="Filtros del resumen">
        <button type="button" className="pgx-cases-filter-toggle" aria-expanded={filtrosAbiertos} aria-controls="pgx-cases-filter-content" onClick={()=>setFiltrosAbiertos(v=>!v)}>
          <span><strong>Ocupaciones y tareas</strong><small>{ocupacionesSeleccionadas===null?ocupaciones.length:ocupacionesSeleccionadas.length} ocupaciones · {tareasSeleccionadas===null?tareas.length:tareasSeleccionadas.length} tareas · {filasFiltradas.length} registros</small></span>
          <span className="pgx-cases-chevron" aria-hidden="true">{filtrosAbiertos?'▾':'▸'}</span>
        </button>
        <div id="pgx-cases-filter-content" hidden={!filtrosAbiertos}>
          <fieldset className="pgx-cases-task-filter">
            <legend>1. Ocupaciones</legend>
            <div className="pgx-cases-task-head"><p>Selecciona una o varias ocupaciones para mostrar sus tareas.</p><div><button type="button" onClick={()=>cambiarOcupaciones(null)}>Seleccionar todas las ocupaciones</button><button type="button" onClick={()=>cambiarOcupaciones([])}>Quitar selección de ocupaciones</button></div></div>
            <div className="pgx-cases-task-options">{ocupaciones.map(o=><label key={o.key}><input type="checkbox" checked={ocupacionesSeleccionadas===null || ocupacionesSeleccionadas.includes(o.key)} onChange={()=>toggleOcupacion(o.key)}/><span>{o.label}</span></label>)}</div>
          </fieldset>
          <fieldset className="pgx-cases-task-filter">
            <legend>2. Tareas de las ocupaciones elegidas</legend>
            <div className="pgx-cases-task-head"><p>Al cambiar las ocupaciones se seleccionan todas sus tareas. Puedes ajustar la selección aquí.</p><div><button type="button" disabled={!tareas.length} onClick={()=>setTareasSeleccionadas(null)}>Seleccionar todas las tareas</button><button type="button" disabled={!tareas.length} onClick={()=>setTareasSeleccionadas([])}>Quitar selección de tareas</button></div></div>
            <div className="pgx-cases-task-options">{tareas.map(t=><label key={t.key}><input type="checkbox" checked={tareasSeleccionadas===null || tareasSeleccionadas.includes(t.key)} onChange={()=>toggleTarea(t.key)}/><span>{t.label}</span></label>)}</div>
            {!tareas.length&&<p className="pgx-cases-note">Sin tareas disponibles. Selecciona al menos una ocupación con registros.</p>}
            <small>{tareasSeleccionadas===null?tareas.length:tareasSeleccionadas.length} de {tareas.length} tareas seleccionadas · {filasFiltradas.length} registros</small>
          </fieldset>
        </div>
      </section>
      <div className="pgx-cases-kpis"><div><span>Casos agrupados</span><strong>{team.totalCasos}</strong></div><div><span>Registros con caso</span><strong>{team.registrosConCaso}</strong></div><div><span>Horas con caso</span><strong>{h(team.horasConCaso)}</strong><small>Cada registro cuenta una vez</small></div><div><span>Horas sin caso</span><strong>{h(team.horasSinCaso)}</strong><small>Sin caso cliente ni interno válido</small></div><div><span>Consultores con registros</span><strong>{team.totalConsultores}</strong></div></div>
      <p className="pgx-cases-note">Los registros se agrupan por caso dentro del equipo. Los números internos asociados aparecen en la columna CASO INTERNO. Cada registro y sus horas se suman una sola vez. Si falta el caso principal, se agrupa por el número interno disponible.</p>
      {team.registrosSinCaso>0&&<p className="pgx-cases-without">Además hay {team.registrosSinCaso} registros sin número de caso válido ({h(team.horasSinCaso)}). Se incluyen en las {h(team.horas)} totales del equipo, pero no en el conteo de casos.</p>}
      <div className="pgx-cases-controls"><label>Buscar caso, caso interno o cliente<input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Caso, caso interno o cliente"/></label><span>Mostrando {visibles.length} de {team.casos.length} casos</span></div>
      {visibles.length===0?<div className="pgx-cases-empty">Sin casos para las ocupaciones, tareas y búsqueda seleccionadas.</div>:<div className="pgx-cases-table-wrap"><table className="pgx-cases-table"><thead><tr><th scope="col">CASO</th><th scope="col">CASO INTERNO</th><th scope="col">CLIENTE</th><th scope="col">REGISTROS</th><th scope="col">HORAS ACUMULADAS</th><th scope="col">PARTICIPANTES</th></tr></thead><tbody>{visibles.map(c=><Fragment key={c.key}><tr><th scope="row">{c.numero || '—'}</th><td>{c.internos.join(', ') || '—'}</td><td>{c.clientes.join(', ')||'—'}</td><td className="pgx-cases-num">{c.registros}</td><td className="pgx-cases-num">{h(c.horas)}</td><td><button type="button" className="pgx-cases-link" aria-expanded={abierto===c.key} onClick={()=>setAbierto(prev=>prev===c.key?'':c.key)}>{abierto===c.key?'Ocultar':'Ver'} consultores ({c.consultores.length})</button></td></tr>{abierto===c.key&&<tr className="pgx-cases-expanded"><td colSpan={6}><section aria-label={`Consultores del caso ${c.numero || c.internos.join(', ')}`}><h3>Consultores del caso {c.numero || c.internos.join(', ')}</h3><p>{c.desde===c.hasta?c.desde:`${c.desde} al ${c.hasta}`}</p><div className="pgx-cases-table-wrap"><table className="pgx-cases-table"><thead><tr><th>Consultor</th><th>Usuario</th><th>Registros</th><th>Horas en este caso</th></tr></thead><tbody>{c.consultores.map(p=><tr key={p.key}><th scope="row">{p.nombre}</th><td>{p.usuario||'—'}</td><td className="pgx-cases-num">{p.registros}</td><td className="pgx-cases-num">{h(p.horas)}</td></tr>)}</tbody></table></div></section></td></tr>}</Fragment>)}</tbody></table></div>}
    </div>
    <footer className="pgx-cases-modal-foot"><span>{team.registrosConCaso} registros con caso · {team.registros} registros del equipo</span><strong>Total equipo sin duplicar filas: {h(team.horas)}</strong><button type="button" onClick={onClose}>Cerrar</button></footer>
  </Modal>;
}
export default function CasosPorEquipoChart({data=[],periodo=''}) {
  const equipos=useMemo(()=>resumirCasosPorEquipo(data),[data]);
  const [seleccion,setSeleccion]=useState('');
  useEffect(()=>{setSeleccion('');},[data,periodo]);
  const team=equipos.find(t=>t.equipo===seleccion);
  const filasEquipo=useMemo(()=>registrosDelEquipo(data,seleccion),[data,seleccion]);
  const abrir=entry=>setSeleccion(entry?.equipo||entry?.payload?.equipo||'');
  return <section className="pgx-cases-card" aria-label="Casos por equipo"><header className="pgx-cases-card-head"><div><h3>Casos registrados por equipo</h3><p>{periodo} · Casos agrupados con sus números internos asociados</p></div></header>
    {!equipos.length?<div className="pgx-cases-empty">Sin registros para los filtros aplicados.</div>:<><div className="pgx-cases-chart-scroll"><div style={{height:Math.max(280,equipos.length*76+100),minWidth:620}}><ResponsiveContainer width="100%" height="100%"><BarChart data={equipos} layout="vertical" margin={{left:8,right:30,top:10,bottom:15}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="equipo" width={165} tick={{fontSize:12}} interval={0}/><Tooltip content={<TooltipEquipo/>}/><Bar name="Casos agrupados" dataKey="totalCasos" fill="#1d65bc" radius={[0,5,5,0]} onClick={abrir} style={{cursor:'pointer'}}/></BarChart></ResponsiveContainer></div></div><div className="pgx-cases-team-actions">{equipos.map(t=><button type="button" key={t.equipo} onClick={()=>setSeleccion(t.equipo)} aria-label={`Ver casos de ${t.equipo}`}><strong>{t.equipo}</strong><span>{t.totalCasos} casos · {h(t.horasConCaso)}</span><small>Ver resumen →</small></button>)}</div></>}
    {team&&<ResumenEquipo key={team.equipo} team={team} rows={filasEquipo} periodo={periodo} onClose={()=>setSeleccion('')}/>}
  </section>;
}

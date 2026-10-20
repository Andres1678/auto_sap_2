import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { buscarCasosEquipo, resumirCasosPorEquipo } from '../casosPorEquipo';
import './CasosPorEquipoChart.css';

const nf=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2});
const h=v=>`${nf.format(v || 0)} h`;
function TooltipEquipo({active,payload}) {
  const t=payload?.[0]?.payload;if(!active||!t)return null;
  return <div className="pgx-cases-tooltip"><strong>{t.equipo}</strong><span>Casos cliente distintos: {t.casosCliente}</span><span>Casos internos distintos: {t.casosInternos}</span><span>Registros con caso: {t.registrosConCaso}</span><span>Horas con caso, sin duplicar filas: {h(t.horasConCaso)}</span></div>;
}
function ResumenEquipo({team,periodo,onClose}) {
  const [busqueda,setBusqueda]=useState('');
  const [tipo,setTipo]=useState('todos');
  const [abierto,setAbierto]=useState('');
  const visibles=useMemo(()=>buscarCasosEquipo(team.casos,busqueda,tipo),[team.casos,busqueda,tipo]);
  return <Modal isOpen onRequestClose={onClose} contentLabel={`Casos registrados por ${team.equipo}`} className="pgx-cases-modal" overlayClassName="pgx-cases-overlay" bodyOpenClassName="pgx-cases-body-open">
    <header className="pgx-cases-modal-head"><div><span>Resumen de casos por equipo</span><h2>{team.equipo}</h2><p>{periodo} · Filtros aplicados en gráficos</p></div><button type="button" className="pgx-cases-close" onClick={onClose} aria-label="Cerrar resumen del equipo">×</button></header>
    <div className="pgx-cases-modal-body">
      <div className="pgx-cases-kpis"><div><span>Casos cliente distintos</span><strong>{team.casosCliente}</strong></div><div><span>Casos internos distintos</span><strong>{team.casosInternos}</strong></div><div><span>Horas con caso</span><strong>{h(team.horasConCaso)}</strong><small>Cada registro cuenta una vez</small></div><div><span>Consultores con registros</span><strong>{team.totalConsultores}</strong></div></div>
      <p className="pgx-cases-note">Los casos repetidos de distintos consultores se unen por número dentro del equipo. Cliente e interno se cuentan por separado. Si una fila tiene ambos casos, aparece en las dos categorías; sus horas se cuentan una sola vez en el total del equipo.</p>
      {team.registrosSinCaso>0&&<p className="pgx-cases-without">Además hay {team.registrosSinCaso} registros sin número de caso válido ({h(team.horasSinCaso)}). Se incluyen en las {h(team.horas)} totales del equipo, pero no en el conteo de casos.</p>}
      <div className="pgx-cases-controls"><label>Buscar caso o cliente<input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Número de caso o cliente"/></label><label>Tipo de caso<select value={tipo} onChange={e=>setTipo(e.target.value)}><option value="todos">Cliente e interno</option><option value="cliente">Caso cliente</option><option value="interno">Caso interno</option></select></label><span>Mostrando {visibles.length} de {team.casos.length} casos</span></div>
      {visibles.length===0?<div className="pgx-cases-empty">Sin casos para esta selección.</div>:<div className="pgx-cases-table-wrap"><table className="pgx-cases-table"><thead><tr><th scope="col">Tipo</th><th scope="col">Caso</th><th scope="col">Clientes</th><th scope="col">Registros</th><th scope="col">Horas acumuladas</th><th scope="col">Participantes</th></tr></thead><tbody>{visibles.map(c=><Fragment key={c.key}><tr><td><span className={`pgx-cases-tag is-${c.tipo}`}>{c.tipo==='cliente'?'Cliente':'Interno'}</span></td><th scope="row">{c.numero}</th><td>{c.clientes.join(', ')||'—'}</td><td className="pgx-cases-num">{c.registros}</td><td className="pgx-cases-num">{h(c.horas)}</td><td><button type="button" className="pgx-cases-link" aria-expanded={abierto===c.key} onClick={()=>setAbierto(prev=>prev===c.key?'':c.key)}>{abierto===c.key?'Ocultar':'Ver'} consultores ({c.consultores.length})</button></td></tr>{abierto===c.key&&<tr className="pgx-cases-expanded"><td colSpan={6}><section aria-label={`Consultores del caso ${c.numero}`}><h3>Consultores del caso {c.numero}</h3><p>{c.desde===c.hasta?c.desde:`${c.desde} al ${c.hasta}`}</p><div className="pgx-cases-table-wrap"><table className="pgx-cases-table"><thead><tr><th>Consultor</th><th>Usuario</th><th>Registros</th><th>Horas en este caso</th></tr></thead><tbody>{c.consultores.map(p=><tr key={p.key}><th scope="row">{p.nombre}</th><td>{p.usuario||'—'}</td><td className="pgx-cases-num">{p.registros}</td><td className="pgx-cases-num">{h(p.horas)}</td></tr>)}</tbody></table></div></section></td></tr>}</Fragment>)}</tbody></table></div>}
    </div>
    <footer className="pgx-cases-modal-foot"><span>{team.registrosConCaso} registros con caso · {team.registros} registros del equipo</span><strong>Total equipo sin duplicar filas: {h(team.horas)}</strong><button type="button" onClick={onClose}>Cerrar</button></footer>
  </Modal>;
}
export default function CasosPorEquipoChart({data=[],periodo=''}) {
  const equipos=useMemo(()=>resumirCasosPorEquipo(data),[data]);
  const [seleccion,setSeleccion]=useState('');
  useEffect(()=>{setSeleccion('');},[data,periodo]);
  const team=equipos.find(t=>t.equipo===seleccion);
  const abrir=entry=>setSeleccion(entry?.equipo||entry?.payload?.equipo||'');
  return <section className="pgx-cases-card" aria-label="Casos por equipo"><header className="pgx-cases-card-head"><div><h3>Casos registrados por equipo</h3><p>{periodo} · Cantidad de números distintos por tipo de caso</p></div></header>
    {!equipos.length?<div className="pgx-cases-empty">Sin registros para los filtros aplicados.</div>:<><div className="pgx-cases-chart-scroll"><div style={{height:Math.max(280,equipos.length*76+100),minWidth:620}}><ResponsiveContainer width="100%" height="100%"><BarChart data={equipos} layout="vertical" margin={{left:8,right:30,top:10,bottom:15}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="equipo" width={165} tick={{fontSize:12}} interval={0}/><Tooltip content={<TooltipEquipo/>}/><Legend/><Bar name="Casos cliente" dataKey="casosCliente" fill="#1d65bc" radius={[0,5,5,0]} onClick={abrir} style={{cursor:'pointer'}}/><Bar name="Casos internos" dataKey="casosInternos" fill="#15917b" radius={[0,5,5,0]} onClick={abrir} style={{cursor:'pointer'}}/></BarChart></ResponsiveContainer></div></div><div className="pgx-cases-team-actions">{equipos.map(t=><button type="button" key={t.equipo} onClick={()=>setSeleccion(t.equipo)} aria-label={`Ver casos de ${t.equipo}`}><strong>{t.equipo}</strong><span>{t.casosCliente} cliente · {t.casosInternos} internos</span><small>Ver resumen →</small></button>)}</div></>}
    {team&&<ResumenEquipo key={team.equipo} team={team} periodo={periodo} onClose={()=>setSeleccion('')}/>}
  </section>;
}

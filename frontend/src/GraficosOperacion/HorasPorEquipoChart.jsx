import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { ResumenEquipo } from './CasosPorEquipoChart';
import { registrosDelEquipo, resumirCasosPorEquipo } from '../casosPorEquipo';
import './HorasPorEquipoChart.css';

const EMPTY_ROWS = [];
const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const integer = value => Math.max(0, Math.trunc(number(value)));
const hours = value => `${nf.format(Math.max(0, number(value)))} h`;
function TeamValidationTooltip({ active, payload }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const porcentaje = row.totalPersonas ? row.registraron * 100 / row.totalPersonas : 0;
  return <div className="pgx-team-tooltip">
    <div className="pgx-team-tooltip__title">{row.equipo}</div>
    <div className="pgx-team-tooltip__hours"><span>Horas registradas</span><strong>{hours(row.horas)}</strong></div>
    <div className="pgx-team-tooltip__divider"/>
    <div className="pgx-team-tooltip__row"><span>Personas activas en el equipo</span><strong>{row.totalPersonas}</strong></div>
    <div className="pgx-team-tooltip__row is-success"><span>Registraron en el período</span><strong>{row.registraron}</strong></div>
    <div className="pgx-team-tooltip__row is-danger"><span>No registraron en el período</span><strong>{row.noRegistraron}</strong></div>
    <div className="pgx-team-tooltip__progress" aria-hidden="true"><span style={{width:`${porcentaje}%`}}/></div>
    <div className="pgx-team-tooltip__percent">Cobertura de registro: {nf.format(porcentaje)}%</div>
  </div>;
}
export default function HorasPorEquipoChart({data=EMPTY_ROWS, registros=EMPTY_ROWS, filtroMes='', desde='', hasta='', filtroEquipo=[]}) {
  const [seleccion,setSeleccion]=useState('');
  useEffect(()=>setSeleccion(''),[data,registros,filtroMes,desde,hasta]);
  const rows=useMemo(()=>(Array.isArray(data)?data:[]).map(row=>{
    const totalPersonas=integer(row.totalPersonas);
    const registraron=Math.min(integer(row.registraron),totalPersonas);
    return {...row,equipo:String(row.equipo || 'SIN EQUIPO').trim().toUpperCase(),horas:Math.max(0,number(row.horas)),totalPersonas,registraron,noRegistraron:totalPersonas-registraron};
  }).filter(row=>row.horas>0 || row.totalPersonas>0).sort((a,b)=>b.horas-a.horas || a.equipo.localeCompare(b.equipo)),[data]);
  const periodo=filtroMes?`Mes ${filtroMes}`:desde&&hasta?`${desde} a ${hasta}`:'Período aplicado';
  const equipos=Array.isArray(filtroEquipo)?filtroEquipo.join(', '):String(filtroEquipo || '');
  const filasEquipo=useMemo(()=>registrosDelEquipo(Array.isArray(registros)?registros:[],seleccion),[registros,seleccion]);
  const team=useMemo(()=>resumirCasosPorEquipo(filasEquipo)[0] || {equipo:seleccion},[filasEquipo,seleccion]);
  const abrir=entry=>setSeleccion(String(entry?.equipo || entry?.payload?.equipo || '').trim());
  return <section className="pgx-team-chart">
    <div className="pgx-team-chart__head"><div><h3>Horas por equipo</h3><p>{periodo} · Equipo: {equipos || 'Todos'}</p><span className="pgx-team-chart__hint">Pasa el mouse para ver el cumplimiento. Haz clic para consultar ocupaciones, tareas y casos con sus internos asociados.</span></div><span className="pgx-team-chart__total">{hours(rows.reduce((s,r)=>s+r.horas,0))}</span></div>
    {!rows.length?<div className="pgx-team-chart__empty">Sin datos por equipo con los filtros aplicados.</div>:<>
      <div className="pgx-team-chart__canvas" style={{height:Math.max(320,rows.length*62+115)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{top:12,right:88,left:12,bottom:12}} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={hours} tick={{fontSize:12,fill:'#64748b'}} allowDecimals/><YAxis type="category" dataKey="equipo" width={180} interval={0} tick={{fontSize:12,fontWeight:700,fill:'#334155'}}/>
        <Tooltip content={<TeamValidationTooltip/>} cursor={{fill:'rgba(148,163,184,.10)'}}/>
        <Bar dataKey="horas" name="Horas" fill="#DA291C" radius={[0,9,9,0]} minPointSize={4} onClick={abrir} style={{cursor:'pointer'}}><LabelList dataKey="horas" position="right" formatter={hours} style={{fill:'#334155',fontSize:12,fontWeight:700}}/></Bar>
      </BarChart></ResponsiveContainer></div>
      <div className="pgx-team-detail-actions">{rows.map(r=><button type="button" key={r.equipo} onClick={()=>abrir(r)} aria-label={`Ver detalle de ${r.equipo}`}>{r.equipo} · Ver casos</button>)}</div>
    </>}
    {seleccion&&<ResumenEquipo key={seleccion} team={team} rows={filasEquipo} periodo={periodo} onClose={()=>setSeleccion('')}/>}
  </section>;
}

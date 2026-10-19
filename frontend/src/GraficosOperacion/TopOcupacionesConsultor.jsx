import React, { useEffect, useMemo, useState } from 'react';
import { jfetch } from '../lib/api';

const nf = new Intl.NumberFormat('es-CO', {maximumFractionDigits:2});
const norm = v => String(v ?? '').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase();
const num = v => {const n=Number(v);return Number.isFinite(n)?n:0;};
const safeRows = p => Array.isArray(p)?p:Array.isArray(p?.rows)?p.rows:Array.isArray(p?.ocupaciones)?p.ocupaciones:[];

export default function TopOcupacionesConsultorChart({ consultor, equipo, mes, anio, maxItems=6, endpoint='/capacidad-semanal-ocupaciones', data }) {
  const [state,setState]=useState({key:'',rows:[],loading:false,error:''});
  const key=JSON.stringify([consultor||'',equipo||'',mes||'',anio||'',endpoint]);
  useEffect(()=>{
    if (Array.isArray(data)) return undefined;
    if ((!consultor && !equipo) || !mes || !anio) {setState({key,rows:[],loading:false,error:''});return undefined;}
    const controller=new AbortController();let active=true;
    setState({key,rows:[],loading:true,error:''});
    const qs=new URLSearchParams({mes:String(mes),anio:String(anio)});
    if(consultor)qs.set('consultor',String(consultor).trim());
    if(equipo)qs.set('equipo',String(equipo).trim());
    (async()=>{
      try {
        const res=await jfetch(`${endpoint}?${qs}`,{signal:controller.signal});const json=await res.json();
        if(!res.ok)throw Error(json?.error||`HTTP ${res.status}`);
        if(active&&!controller.signal.aborted)setState({key,rows:safeRows(json),loading:false,error:''});
      }catch(e){if(active&&!controller.signal.aborted)setState({key,rows:[],loading:false,error:e.message||'No se pudo cargar el top de ocupaciones'});}
    })();
    return ()=>{active=false;controller.abort();};
  },[consultor,equipo,mes,anio,endpoint,key,data]);
  const fuente=Array.isArray(data)?data:state.key===key?state.rows:[];
  const top=useMemo(()=>{
    const map=new Map();
    fuente.filter(r=>(!equipo||norm(r.equipo)===norm(equipo))&&(!consultor||[r.consultor,r.usuario_consultor,r.usuario].some(v=>norm(v)===norm(consultor))))
      .forEach(r=>{
        const codigo=String(r.ocupacion_codigo??r.codigo??r.ocupacionCodigo??'').trim();
        const nombre=String(r.ocupacion_nombre??r.nombre??r.ocupacionNombre??r.ocupacion??'').trim();
        const name=[codigo,nombre].filter(Boolean).join(' - ')||'SIN OCUPACIÓN';
        const horas=num(r.horas??r.tiempoInvertido??r.tiempo_invertido??r.tiempo??0);
        if(horas>0)map.set(name,(map.get(name)||0)+horas);
      });
    const base=[...map].map(([name,horas])=>({name,horas})).sort((a,b)=>b.horas-a.horas);
    const total=base.reduce((s,r)=>s+r.horas,0);const limit=Math.max(1,Math.min(50,Math.trunc(num(maxItems))||6));
    const items=base.slice(0,limit);if(base.length>limit)items.push({name:'Otros',horas:base.slice(limit).reduce((s,r)=>s+r.horas,0)});
    return {total,items:items.map(r=>({...r,pct:total?100*r.horas/total:0}))};
  },[fuente,consultor,equipo,maxItems]);
  const loading=!Array.isArray(data)&&state.key===key&&state.loading;
  const error=!Array.isArray(data)&&state.key===key?state.error:'';
  return <aside className="capacidad-ocupaciones-card"><div className="ocup-card-head"><div><h5>Top ocupaciones</h5><p>{consultor||equipo||'Selecciona consultor o equipo'}</p></div><span className="ocup-card-badge">{nf.format(top.total)} h</span></div>
    {loading?<div className="ocup-state">Cargando ocupaciones…</div>:error?<div className="ocup-state ocup-state-error">{error}</div>:!top.items.length?<div className="ocup-state">Sin horas por ocupación para los filtros seleccionados.</div>:<div className="ocup-list">{top.items.map((item,index)=><article key={item.name} className="ocup-item"><div className="ocup-item-head"><span className="ocup-rank">#{index+1}</span><div className="ocup-main"><strong className="ocup-name" title={item.name}>{item.name}</strong><span className="ocup-hours">{nf.format(item.horas)} h</span></div></div><div className="ocup-bar"><div className="ocup-bar-fill" style={{width:`${item.pct}%`}}/></div><div className="ocup-foot"><span>{item.pct.toFixed(1)}%</span></div></article>)}</div>}
  </aside>;
}

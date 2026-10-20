const texto = v => String(v ?? '').trim();
const clave = v => texto(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
const numeroCaso = v => ['', '0', 'N/A', 'N/APLICA', 'NA', 'NULL', 'NONE', '-', 'SIN CASO'].includes(clave(v)) ? '' : texto(v);
const horas = r => {const n=Number(r.tiempoInvertido ?? r.tiempo_invertido ?? r.total_horas ?? 0);return Number.isFinite(n)?n:0;};
const personaDe = r => {
  const usuario=texto(r.usuario_consultor || r.usuario).toLowerCase();
  const nombre=texto(r.consultor || r.consultor_nombre) || usuario || 'Sin consultor identificado';
  return {key:usuario?`usuario:${usuario}`:`nombre:${clave(nombre)}`,nombre,usuario};
};
function acumularPersona(map,row,h) {
  const persona=personaDe(row);
  if(!map.has(persona.key))map.set(persona.key,{...persona,registros:0,horas:0});
  const item=map.get(persona.key);item.registros+=1;item.horas+=h;
}

// Una fila por caso del equipo; internos asociados en otra columna. Cada registro cuenta una vez.
export function resumirCasosPorEquipo(rows) {
  const equipos=new Map();
  for(const r of Array.isArray(rows)?rows:[]) {
    const equipo=clave(r.equipo || r.equipo_nombre) || 'SIN EQUIPO';
    if(!equipos.has(equipo))equipos.set(equipo,{equipo,registros:0,horas:0,registrosConCaso:0,horasConCaso:0,registrosSinCaso:0,horasSinCaso:0,casosMap:new Map(),personasMap:new Map()});
    const team=equipos.get(equipo), h=horas(r);
    const campos=[['cliente',numeroCaso(r.nroCasoCliente ?? r.nro_caso_cliente)],['interno',numeroCaso(r.nroCasoInterno ?? r.nro_caso_interno)]];
    team.registros+=1;team.horas+=h;acumularPersona(team.personasMap,r,h);
    if(campos.some(([,numero])=>numero)){team.registrosConCaso+=1;team.horasConCaso+=h;}
    else {team.registrosSinCaso+=1;team.horasSinCaso+=h;}
    const numero=campos[0][1], interno=campos[1][1];
    if(!numero&&!interno)continue;
    // Agrupar por caso principal. Sin caso principal, usar interno como respaldo.
    const key=JSON.stringify(numero?['caso',numero]:['sin-caso-principal',interno]);
    if(!team.casosMap.has(key))team.casosMap.set(key,{key,numero,internos:new Set(),registros:0,horas:0,clientes:new Set(),fechas:new Set(),personasMap:new Map()});
    const caso=team.casosMap.get(key);caso.registros+=1;caso.horas+=h;
    if(interno)caso.internos.add(interno);
    if(texto(r.cliente))caso.clientes.add(texto(r.cliente));
    if(texto(r.fecha))caso.fechas.add(texto(r.fecha).slice(0,10));
    acumularPersona(caso.personasMap,r,h);
  }
  return [...equipos.values()].map(t=>{
    const casos=[...t.casosMap.values()].map(c=>{
      const fechas=[...c.fechas].sort();
      const consultores=[...c.personasMap.values()].sort((a,b)=>b.horas-a.horas || a.nombre.localeCompare(b.nombre,'es'));
      return {key:c.key,numero:c.numero,internos:[...c.internos].sort(),registros:c.registros,horas:c.horas,clientes:[...c.clientes].sort(),desde:fechas[0]||'',hasta:fechas[fechas.length-1]||'',consultores};
    }).sort((a,b)=>b.horas-a.horas || a.numero.localeCompare(b.numero,'es',{numeric:true}));
    return {equipo:t.equipo,registros:t.registros,horas:t.horas,registrosConCaso:t.registrosConCaso,horasConCaso:t.horasConCaso,registrosSinCaso:t.registrosSinCaso,horasSinCaso:t.horasSinCaso,casos,totalCasos:casos.length,totalConsultores:t.personasMap.size};
  }).sort((a,b)=>b.totalCasos-a.totalCasos || a.equipo.localeCompare(b.equipo));
}
export function buscarCasosEquipo(casos,busqueda) {
  const q=clave(busqueda);
  return casos.filter(c=>!q||clave([c.numero,...c.internos,...c.clientes].join(' ')).includes(q));
}

export function tareaDeRegistro(row) {
  const label=(texto(row.tipoTarea) || texto(row.tipo_tarea)) || [row.tarea_codigo,row.tarea_nombre].map(texto).filter(Boolean).join(' - ') || 'Sin tarea';
  return {key:clave(label),label};
}
export function opcionesTareasEquipo(rows) {
  const map=new Map();
  for(const row of rows){const t=tareaDeRegistro(row);if(!map.has(t.key))map.set(t.key,t);}
  return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
}
export function filtrarTareasEquipo(rows,seleccion) {
  if(seleccion===null)return rows;
  const keys=new Set(seleccion);
  return rows.filter(r=>keys.has(tareaDeRegistro(r).key));
}
export function registrosDelEquipo(rows,equipo) {
  return rows.filter(r=>(clave(r.equipo || r.equipo_nombre)||'SIN EQUIPO')===clave(equipo));
}

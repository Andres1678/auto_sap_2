import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { jfetch } from "./lib/api";
import "./ModelosCapacidadesCoeSap.css";

// Niveles N primero, otros cargos por nombre y líderes al final.
const textoOrdenCargo = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
const claveOrdenCargo = value => {
  const nombre = textoOrdenCargo(value);
  if (/\bLIDER(?:ES)?\b/.test(nombre)) return { grupo: 2, nivel: 0 };
  const nivel = nombre.match(/\bN\s*(\d+)\b/);
  return nivel ? { grupo: 0, nivel: Number(nivel[1]) } : { grupo: 1, nivel: 0 };
};
function compararFilasCargo(a, b) {
  const ca = claveOrdenCargo(a.cargo), cb = claveOrdenCargo(b.cargo);
  return ca.grupo - cb.grupo || ca.nivel - cb.nivel
    || String(a.cargo ?? '').localeCompare(String(b.cargo ?? ''), 'es', { numeric: true, sensitivity: 'base' })
    || String(a.cargo_id ?? '').localeCompare(String(b.cargo_id ?? ''), 'es', { numeric: true })
    || String(a.especialidad ?? '').localeCompare(String(b.especialidad ?? ''), 'es', { numeric: true, sensitivity: 'base' });
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const textoMes = value => {
  const [anio, mes] = String(value || '').split('-');
  return mes ? `${MESES[Number(mes) - 1]} de ${anio}` : '';
};
const formato = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const capacidadInstalada = (horas, driver) => {
  const h = Number(horas ?? 0);
  const d = Number(driver);
  return Number.isFinite(h) && Number.isFinite(d) && d > 0 ? h / d : null;
};
const mostrarInstalada = (horas, driver) => {
  const valor = capacidadInstalada(horas, driver);
  return valor == null ? "—" : formato.format(valor);
};

const periodoActual = () => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${partes.find(p => p.type === "year").value}-${partes.find(p => p.type === "month").value}`;
};

function totalesProyectos(filas) {
  const proyectos = new Map();
  for (const fila of filas) {
    for (const [tipo, id, horas] of fila.proyectos_horas || []) {
      const clave = JSON.stringify([fila.equipo_id, tipo, id]);
      proyectos.set(clave, (proyectos.get(clave) || 0) + Number(horas || 0));
    }
  }
  const valores = [...proyectos.values()];
  return {
    conHoras: valores.filter(h => Math.round(h * 100) !== 0).length,
  };
}

function tareasPermitidas(tareas, ocupaciones) {
  return tareas.filter(t => (t.ocupacionIds || []).some(id => ocupaciones.includes(id)));
}
function resumirProceso(filas) {
  const personas = new Set();
  let actual = 0, vendida = 0, instalada = 0, ocupacionAcumulada = 0;
  for (const fila of filas) {
    (fila.consultores || []).forEach(c => personas.add(String(c.id)));
    actual += Number(fila.capacidad_actual || 0);
    vendida += Number(fila.capacidad_vendida || 0);
    instalada += capacidadInstalada(fila.capacidad_actual, fila.driver) || 0;
    ocupacionAcumulada += Number(fila.porcentaje_cumplimiento_mes || 0);
  }
  return { personas: personas.size, actual, vendida, instalada, ocupacionAcumulada,
    ocupacion: vendida > 0 ? actual / vendida * 100 : null };
}

function FiltroMultiple({ titulo, opciones, valores, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = e => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const tecla = e => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  return <div className="mcc-filtro" ref={ref}>
    <button type="button" className="mcc-filtro-trigger" aria-expanded={abierto}
      onClick={() => setAbierto(v => !v)}>{titulo} ({valores.length}/{opciones.length}) {abierto ? "▴" : "▾"}</button>
    {abierto && <div className="mcc-filtro-menu">
      <div className="mcc-filtro-actions">
        <button type="button" onClick={() => onChange(opciones.map(o => String(o.id)))}>Todos</button>
        <button type="button" onClick={() => onChange([])}>Ninguno</button>
        <button type="button" onClick={() => setAbierto(false)}>Cerrar ✕</button>
      </div>
      {opciones.map(o => <label key={o.id}><input type="checkbox"
        checked={valores.includes(String(o.id))}
        onChange={e => onChange(e.target.checked ? [...valores, String(o.id)] : valores.filter(v => v !== String(o.id)))}
      />{o.nombre}</label>)}
      {!opciones.length && <p>Sin opciones para las ocupaciones seleccionadas</p>}
    </div>}
  </div>;
}

export default function ModelosCapacidadesCoeSap() {
  const [periodo, setPeriodo] = useState(periodoActual);
  const [periodoHasta, setPeriodoHasta] = useState(periodoActual);
  const [catalogos, setCatalogos] = useState(null);
  const [filtros, setFiltros] = useState({ ocupaciones: [], tareas: [], equipos: [], cargos: [] });
  const cambiarFiltro = (clave, valores) => setFiltros(prev => {
    if (clave !== "ocupaciones") return { ...prev, [clave]: valores };
    const anteriores = tareasPermitidas(catalogos?.tareas || [], prev.ocupaciones).map(t => String(t.id));
    const nuevas = tareasPermitidas(catalogos?.tareas || [], valores).map(t => String(t.id));
    const estabanTodas = anteriores.length > 0 && anteriores.every(id => prev.tareas.includes(id));
    return { ...prev, ocupaciones: valores,
      tareas: estabanTodas ? nuevas : prev.tareas.filter(id => nuevas.includes(id)) };
  });
  const tareasDisponibles = useMemo(() => tareasPermitidas(catalogos?.tareas || [], filtros.ocupaciones), [catalogos, filtros.ocupaciones]);
  const [expandidos, setExpandidos] = useState({});
  const [cargosComprimidos, setCargosComprimidos] = useState({});
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  let admin = false;
  try {
    const u = JSON.parse(localStorage.getItem("userData") || "null");
    admin = String(u?.rol_ref?.nombre ?? u?.rol ?? u?.user?.rol ?? "").trim().toUpperCase() === "ADMIN";
  } catch {}

  useEffect(() => {
    if (!admin) return;
    let vigente = true;
    (async () => {
      try {
        const respuestas = await Promise.all([jfetch("/ocupaciones"), jfetch("/equipos"), jfetch("/cargos")]);
        const datos = await Promise.all(respuestas.map(r => r.json()));
        if (respuestas.some((r, i) => !r.ok || !Array.isArray(datos[i]))) throw new Error("No se pudieron cargar los filtros.");
        const tareas = new Map();
        datos[0].forEach(o => (o.tareas || []).forEach(t => {
          const id = String(t.id);
          if (!tareas.has(id)) tareas.set(id, { id: t.id, nombre: `${t.codigo} - ${t.nombre}`, ocupacionIds: [] });
          const item = tareas.get(id);
          if (!item.ocupacionIds.includes(String(o.id))) item.ocupacionIds.push(String(o.id));
        }));
        const cat = {
          ocupaciones: datos[0].map(o => ({ id: o.id, nombre: `${o.codigo} - ${o.nombre}` })),
          tareas: [...tareas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          equipos: [...datos[1].map(e => ({ id: e.id, nombre: e.nombre })), { id: "sin", nombre: "SIN EQUIPO" }],
          cargos: [...datos[2].map(c => ({ id: c.id, nombre: c.nombre })), { id: "sin", nombre: "SIN CARGO ASIGNADO" }],
        };
        if (vigente) {
          setFiltros(Object.fromEntries(Object.entries(cat).map(([k, opciones]) => [k, opciones.map(o => String(o.id))])));
          setCatalogos(cat);
        }
      } catch (e) { if (vigente) setError(e.message || "Error cargando filtros"); }
    })();
    return () => { vigente = false; };
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    if (!catalogos) return;
    const controller = new AbortController();
    let vigente = true;
    setResultado(null);
    setExpandidos({});
    setError("");
    const patronMes = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
    if (!patronMes.test(periodo) || !patronMes.test(periodoHasta) || periodo > periodoHasta) {
      setError(periodo > periodoHasta ? "El mes inicial no puede ser mayor que el mes final." : "Selecciona el mes inicial y final válidos.");
      setCargando(false);
      return () => { vigente = false; controller.abort(); };
    }
    setCargando(true);
    (async () => {
      try {
        const params = new URLSearchParams({ mes_desde: periodo, mes_hasta: periodoHasta, filtrar: "1" });
        for (const [clave, parametro] of [["ocupaciones", "ocupacion_id"], ["tareas", "tarea_id"], ["equipos", "equipo_id"], ["cargos", "cargo_id"]]) {
          filtros[clave].forEach(id => params.append(parametro, id));
        }
        const res = await jfetch(`/modelos-capacidades-coe-sap?${params.toString()}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data?.data)) throw new Error(data?.mensaje || "No se pudo cargar el modelo.");
        if (vigente) setResultado(data);
      } catch (e) {
        if (vigente && e.name !== "AbortError") setError(e.message || "Error consultando el modelo.");
      } finally { if (vigente) setCargando(false); }
    })();
    return () => { vigente = false; controller.abort(); };
  }, [admin, periodo, periodoHasta, revision, catalogos, filtros]);

  const estiloEquipo = (equipoId) => {
    const posicion = (catalogos?.equipos || []).findIndex(e => String(e.id) === String(equipoId ?? "sin"));
    const indice = posicion >= 0 ? posicion : (catalogos?.equipos?.length || 0);
    const tono = (indice * 137.508 + 205) % 360;
    return {
      "--mcc-team-border": `hsl(${tono}, 48%, 43%)`,
      "--mcc-team-bg": `hsl(${tono}, 48%, 93%)`,
      "--mcc-team-row": `hsl(${tono}, 38%, 98%)`,
      "--mcc-team-text": `hsl(${tono}, 48%, 27%)`,
    };
  };

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const fila of resultado?.data || []) {
      const clave = String(fila.equipo_id ?? "sin-equipo");
      if (!mapa.has(clave)) mapa.set(clave, { clave, proceso: fila.proceso, filas: [], consultores: [] });
      const grupo = mapa.get(clave);
      grupo.filas.push(fila);
      grupo.consultores.push(...(fila.consultores || []));
    }
    return Array.from(mapa.values()).map(grupo => ({ ...grupo, filas: [...grupo.filas].sort(compararFilasCargo), resumen: resumirProceso((resultado?.totales_data || resultado?.data || []).filter(f => String(f.equipo_id ?? "sin-equipo") === grupo.clave)) }));
  }, [resultado]);

  // Resúmenes calculados antes de repetir personas entre especialidades.
  const resumenesCargo = useMemo(() => new Map((resultado?.totales_data || []).map(fila => [
    `${fila.equipo_id ?? "sin-equipo"}-${fila.cargo_id ?? "sin-cargo"}`, fila,
  ])), [resultado]);

  const gruposVisibles = useMemo(() => grupos.map(grupo => {
    const vistos = new Set();
    return { ...grupo, filas: grupo.filas.filter(fila => {
      const key = `${grupo.clave}-${fila.cargo_id ?? "sin-cargo"}`;
      if (!cargosComprimidos[key]) return true;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    }) };
  }), [grupos, cargosComprimidos]);

  const totales = useMemo(() => {
    const filas = resultado?.totales_data || resultado?.data || [];
    const vendida = filas.reduce((s, f) => s + Number(f.capacidad_vendida || 0), 0);
    const actual = filas.reduce((s, f) => s + Number(f.capacidad_actual || 0), 0);
    return {
      vendida, actual,
      instalada: filas.length && filas.every(f => capacidadInstalada(f.capacidad_actual, f.driver) != null)
        ? filas.reduce((total, f) => total + capacidadInstalada(f.capacidad_actual, f.driver), 0)
        : null,
      porcentaje: vendida > 0 ? actual / vendida * 100 : null,
      numeroCasos: new Set(filas.flatMap(f => (f.casos_claves || []).map(k => JSON.stringify([f.equipo_id, k])))).size,
      proyectos: totalesProyectos(filas),
      horasProyectos: filas.reduce((s, f) => s + Number(f.horas_proyectos || 0), 0),
      horasConCaso: filas.reduce((s, f) => s + Number(f.horas_con_caso || 0), 0),
      otrasActividadesOperacion: filas.reduce((s, f) => s + Number(f.otras_actividades_operacion || 0), 0),
      clientesPreventa: new Set(filas.flatMap(f => (f.clientes_preventa_claves || []).map(k => JSON.stringify([f.equipo_id, k])))).size,
      horasPreventa: filas.reduce((s, f) => s + Number(f.horas_preventa || 0), 0),
      otrasOcupaciones: filas.reduce((s, f) => s + Number(f.otras_ocupaciones || 0), 0),
    };
  }, [resultado]);

  if (!admin) return <Navigate to="/configuracion" replace />;
  return (
    <main className="mcc-page">
      <Link to="/configuracion" className="mcc-back">← Configuración</Link>
      <header className="mcc-header"><div>
        <span className="mcc-kicker">Planeación operativa</span>
        <h1>Modelos de capacidades COE SAP</h1>
        <p>Capacidad del periodo por proceso, cargo y especialidad de los consultores activos.</p>
      </div><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="mcc-periodo">Mes desde
          <input type="month" value={periodo} min="2000-01" max="2100-12"
            onChange={e => { const value = e.target.value; setPeriodo(value); if (value && value > periodoHasta) setPeriodoHasta(value); }} />
        </label>
        <label className="mcc-periodo">Mes hasta
          <input type="month" value={periodoHasta} min={periodo || '2000-01'} max="2100-12"
            onChange={e => setPeriodoHasta(e.target.value)} />
        </label>
      </div></header>
      {catalogos && <div className="mcc-filtros">
        {[["ocupaciones", "Ocupaciones"], ["tareas", "Tareas"], ["equipos", "Equipos"], ["cargos", "Cargos"]].map(([clave, titulo]) => (
          <FiltroMultiple key={clave} titulo={titulo} opciones={clave === "tareas" ? tareasDisponibles : catalogos[clave]} valores={filtros[clave]}
            onChange={valores => cambiarFiltro(clave, valores)} />
        ))}
        <button type="button" onClick={() => setFiltros(Object.fromEntries(Object.entries(catalogos).map(([k, opciones]) => [k, opciones.map(o => String(o.id))])))}>Restablecer todos</button>
      </div>}
      {!catalogos && !error && <p>Cargando filtros…</p>}
      {error && <div className="mcc-error" role="alert">{error} <button onClick={() => setRevision(v => v + 1)}>Reintentar</button></div>}
      {resultado && <div className="mcc-resumen">
        <div><span>Periodo</span><strong>{textoMes(resultado.mes_desde)}{resultado.mes_hasta !== resultado.mes_desde ? ` — ${textoMes(resultado.mes_hasta)}` : ''}</strong></div>
        <div><span>Días laborables</span><strong>{resultado.dias_laborables}</strong></div>
        <div><span>Driver por consultor</span><strong>{formato.format(resultado.driver)} horas</strong></div>
      </div>}
      {!!resultado?.advertencias?.length && <div className="mcc-error" role="alert">
        {resultado.advertencias.map((texto) => <p key={texto}>{texto}</p>)}
      </div>}
      <p className="mcc-nota">Las especialidades corresponden a las asignadas directamente a cada consultor. Cuando no hay asignación, la celda queda vacía y sus métricas permanecen incluidas. Una persona puede aparecer en varias especialidades con sus métricas completas; los resúmenes del equipo y el total general excluyen duplicados.</p>
      <p className="mcc-nota">Lunes a jueves: 8,5 horas. Viernes: 8 horas. Se excluyen fines de semana y festivos de Colombia.</p>
      <div className="mcc-scroll" aria-busy={cargando}><table className="mcc-table"><colgroup><col style={{ width: "12.000000%" }} /><col style={{ width: "8.000000%" }} /><col style={{ width: "10.000000%" }} /><col style={{ width: "8.000000%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /><col style={{ width: "4.769231%" }} /></colgroup>
        <thead>
<tr><th rowSpan={2} scope="col">Proceso</th><th rowSpan={2} scope="col">Cargo</th><th rowSpan={2} scope="col">Especialidad</th><th rowSpan={2} scope="col">Personas incluidas</th><th rowSpan={2} scope="col">Driver (horas del periodo)</th><th rowSpan={2} scope="col">Capacidad vendida (horas)</th><th rowSpan={2} scope="col">Capacidad actual (horas)</th><th rowSpan={2} scope="col">Ocupación del periodo (%)</th><th rowSpan={2} scope="col">Capacidad instalada</th><th colSpan={3} scope="colgroup" className="mcc-casos-gris mcc-grupo-titulo">Operación</th>
<th colSpan={2} scope="colgroup" className="mcc-proyecto-gris mcc-grupo-titulo">Proyecto</th>
<th colSpan={2} scope="colgroup" className="mcc-preventa mcc-grupo-titulo">Preventa</th><th rowSpan={2} scope="col" className="mcc-otras-gris">Otras ocupaciones (horas)</th></tr>
<tr><th scope="col" className="mcc-casos-gris">Número de casos</th><th scope="col" className="mcc-casos-gris">Horas con caso</th><th scope="col" className="mcc-casos-gris">Otras Actividades Operacion (Horas)</th><th scope="col" className="mcc-proyecto-gris">Nro de Proyectos</th><th scope="col" className="mcc-proyecto-gris">Horas de proyectos</th><th scope="col" className="mcc-preventa">Número de clientes</th><th scope="col" className="mcc-preventa">Horas de preventa</th></tr></thead>
        <tbody>{cargando ? <tr><td colSpan={17}>Consultando capacidad mensual…</td></tr> : gruposVisibles.length ? gruposVisibles.map((grupo) => (
          <React.Fragment key={grupo.clave}>
            {grupo.filas.map((filaEspecialidad, indice) => {
              const clave = `${grupo.clave}-${filaEspecialidad.cargo_id ?? "sin-cargo"}-${filaEspecialidad.especialidad_id ?? "sin-especialidad"}`;
              const claveCargo = `${grupo.clave}-${filaEspecialidad.cargo_id ?? "sin-cargo"}`;
              const cargoComprimido = !!cargosComprimidos[claveCargo];
              const fila = cargoComprimido ? (resumenesCargo.get(claveCargo) || filaEspecialidad) : filaEspecialidad;
              const abierto = !cargoComprimido && !!expandidos[clave];
              const filasCargo = grupo.filas.filter(f => f.cargo_id === fila.cargo_id);
              const primeraCargo = indice === 0 || grupo.filas[indice - 1].cargo_id !== fila.cargo_id;
              const cargoRowSpan = filasCargo.length + filasCargo.filter(f => !cargoComprimido && expandidos[`${grupo.clave}-${f.cargo_id ?? "sin-cargo"}-${f.especialidad_id ?? "sin-especialidad"}`]).length;
              return (
              <React.Fragment key={clave}>
              <tr className={`mcc-equipo-fila ${indice === 0 ? "mcc-equipo-inicio" : ""} ${primeraCargo && indice > 0 ? "mcc-cargo-inicio" : ""}`} style={estiloEquipo(fila.equipo_id)}>
                {indice === 0 && <th scope="rowgroup" rowSpan={grupo.filas.length + grupo.filas.filter(f => !cargosComprimidos[`${grupo.clave}-${f.cargo_id ?? "sin-cargo"}`] && expandidos[`${grupo.clave}-${f.cargo_id ?? "sin-cargo"}-${f.especialidad_id ?? "sin-especialidad"}`]).length} className="mcc-proceso">
                  <strong className="mcc-proceso-nombre">{grupo.proceso}</strong>
                  <dl className="mcc-proceso-resumen">
                    <div><dt>Personas</dt><dd>{grupo.resumen.personas}</dd></div>
                    <div><dt>Capacidad actual</dt><dd>{formato.format(grupo.resumen.actual)} h</dd></div>
                    <div><dt>Ocupación del periodo</dt><dd>{grupo.resumen.ocupacion == null ? "—" : `${formato.format(grupo.resumen.ocupacion)} %`}</dd></div>
                    <div><dt>Ocupación acumulada de cargos</dt><dd>{formato.format(grupo.resumen.ocupacionAcumulada)} %</dd></div>
                    <div><dt>Capacidad instalada (Nro de Personas)</dt><dd>{formato.format(grupo.resumen.instalada)}</dd></div>
                  </dl>
                </th>}
                <React.Fragment>{primeraCargo && <td rowSpan={cargoRowSpan} className="mcc-cargo-agrupado">
                  <button type="button" className="mcc-expand"
                    aria-expanded={!cargoComprimido}
                    aria-label={`${cargoComprimido ? 'Mostrar' : 'Comprimir'} información de ${fila.cargo}`}
                    title={cargoComprimido ? 'Mostrar información del cargo' : 'Comprimir información del cargo'}
                    onClick={() => setCargosComprimidos(prev => ({ ...prev, [claveCargo]: !prev[claveCargo] }))}>
                    <span aria-hidden="true">{cargoComprimido ? '▸' : '▾'}</span> {fila.cargo}
                  </button>
                </td>}</React.Fragment>
                <td>{!cargoComprimido && (fila.especialidad || "")}{!cargoComprimido && fila.modulo_nombre && <small className="mcc-especialidad-consultor">Módulos: {fila.modulo_nombre}</small>}</td>
                <td className="mcc-personas">
                  <button type="button" className="mcc-expand" aria-expanded={abierto}
                    aria-controls={cargoComprimido ? undefined : `detalle-${clave}`}
                    title={cargoComprimido ? 'Mostrar especialidades del cargo' : 'Mostrar consultores de la especialidad'}
                    onClick={() => cargoComprimido
                      ? setCargosComprimidos(prev => ({ ...prev, [claveCargo]: false }))
                      : setExpandidos(prev => ({ ...prev, [clave]: !prev[clave] }))}>
                    {abierto ? "▾" : "▸"} {fila.consultores?.length || 0} personas incluidas
                  </button>
                </td>
                
                <td className="mcc-num">{formato.format(fila.driver)}</td>
                <td className="mcc-num" title={`${fila.personas_activas ?? 0} personas activas × ${fila.driver} horas laborables`}>
                  {formato.format(fila.capacidad_vendida ?? 0)}
                </td>
                <td className="mcc-num">{formato.format(fila.capacidad_actual ?? 0)}</td>
                <td className="mcc-num" title="Horas registradas del periodo / capacidad vendida × 100">
                  {fila.porcentaje_cumplimiento_mes == null ? "—" : `${formato.format(fila.porcentaje_cumplimiento_mes)} %`}
                </td>
                <td className="mcc-num" title="Horas registradas del cargo / driver mensual por consultor">
                  {mostrarInstalada(fila.capacidad_actual, fila.driver)}
                </td>
                <td className="mcc-num mcc-casos-gris">{formato.format(fila.numero_casos ?? 0)}</td>
                <td className="mcc-num mcc-casos-gris">{formato.format(fila.horas_con_caso ?? 0)}</td>
                <td className="mcc-num mcc-casos-gris">{formato.format(fila.otras_actividades_operacion ?? 0)}</td>
                <td className="mcc-num mcc-proyecto-gris">{formato.format(fila.proyectos_con_horas ?? 0)}</td>
<td className="mcc-num mcc-proyecto-gris">{formato.format(fila.horas_proyectos ?? 0)}</td>
<td className="mcc-num mcc-preventa">{formato.format(fila.clientes_preventa ?? 0)}</td>
<td className="mcc-num mcc-preventa">{formato.format(fila.horas_preventa ?? 0)}</td>
<td className="mcc-num mcc-otras-gris">{formato.format(fila.otras_ocupaciones ?? 0)}</td>
              </tr>
              {abierto && <tr className="mcc-detalle" id={`detalle-${clave}`} style={estiloEquipo(fila.equipo_id)}>
                <td colSpan={15}>
                  <div className="mcc-detalle-body">
                    <h3>{[grupo.proceso, fila.cargo, fila.especialidad].filter(Boolean).join(" · ")}</h3>
                    <table className="mcc-consultores"><colgroup><col style={{ width: "20%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /><col style={{ width: "6.153846%" }} /></colgroup>
                      <thead>
<tr><th rowSpan={2} scope="col">Consultor</th><th rowSpan={2} scope="col">Driver (horas del periodo)</th><th rowSpan={2} scope="col">Capacidad vendida (horas)</th><th rowSpan={2} scope="col">Capacidad actual (horas)</th><th rowSpan={2} scope="col">Ocupación del periodo (%)</th><th rowSpan={2} scope="col">Capacidad instalada (Nro de Personas)</th><th colSpan={3} scope="colgroup" className="mcc-casos-gris mcc-grupo-titulo">Operación</th>
<th colSpan={2} scope="colgroup" className="mcc-proyecto-gris mcc-grupo-titulo">Proyecto</th>
<th colSpan={2} scope="colgroup" className="mcc-preventa mcc-grupo-titulo">Preventa</th><th rowSpan={2} scope="col" className="mcc-otras-gris">Otras ocupaciones (horas)</th></tr>
<tr><th scope="col" className="mcc-casos-gris">Número de casos</th><th scope="col" className="mcc-casos-gris">Horas con caso</th><th scope="col" className="mcc-casos-gris">Otras Actividades Operacion (Horas)</th><th scope="col" className="mcc-proyecto-gris">Nro de Proyectos</th><th scope="col" className="mcc-proyecto-gris">Horas de proyectos</th><th scope="col" className="mcc-preventa">Número de clientes</th><th scope="col" className="mcc-preventa">Horas de preventa</th></tr></thead>
                      <tbody>{(fila.consultores || []).map(c => (
                        <tr key={c.id}>
                          <td>{c.nombre}{c.especialidad && <small className="mcc-especialidad-consultor">{c.especialidad}</small>}</td>
                          <td className="mcc-num">{formato.format(fila.driver)}</td>
                          <td className="mcc-num">{formato.format(fila.driver)}</td>
                          <td className="mcc-num">{formato.format(c.capacidad_actual ?? 0)}</td>
                          <td className="mcc-num">{c.porcentaje_cumplimiento_mes == null ? "—" : `${formato.format(c.porcentaje_cumplimiento_mes)} %`}</td>
                          <td className="mcc-num" title="Horas registradas de la persona / driver mensual">
                            {mostrarInstalada(c.capacidad_actual, fila.driver)}
                          </td>
                          <td className="mcc-num mcc-casos-gris">{formato.format(c.numero_casos ?? 0)}</td>
                          <td className="mcc-num mcc-casos-gris">{formato.format(c.horas_con_caso ?? 0)}</td>
                          <td className="mcc-num mcc-casos-gris">{formato.format(c.otras_actividades_operacion ?? 0)}</td>
                          <td className="mcc-num mcc-proyecto-gris">{formato.format(c.proyectos_con_horas ?? 0)}</td>
<td className="mcc-num mcc-proyecto-gris">{formato.format(c.horas_proyectos ?? 0)}</td>
<td className="mcc-num mcc-preventa">{formato.format(c.clientes_preventa ?? 0)}</td>
<td className="mcc-num mcc-preventa">{formato.format(c.horas_preventa ?? 0)}</td>
<td className="mcc-num mcc-otras-gris">{formato.format(c.otras_ocupaciones ?? 0)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </td>
              </tr>}
              </React.Fragment>
              );
            })}
          </React.Fragment>
        )) : <tr><td colSpan={17}>{error ? "Información no disponible" : "No hay consultores activos para mostrar."}</td></tr>}</tbody>
        {resultado && !cargando && <tfoot><tr>
          <th colSpan={5} scope="row">Totales</th>
          <td className="mcc-num">{formato.format(totales.vendida)}</td>
          <td className="mcc-num">{formato.format(totales.actual)}</td>
          <td className="mcc-num">{totales.porcentaje == null ? "—" : `${formato.format(totales.porcentaje)} %`}</td>
          <td className="mcc-num" title="Suma de capacidad instalada de los cargos">
            {totales.instalada == null ? "—" : formato.format(totales.instalada)}
          </td>
          <td className="mcc-num mcc-casos-gris">{formato.format(totales.numeroCasos)}</td>
          <td className="mcc-num mcc-casos-gris">{formato.format(totales.horasConCaso)}</td>
          <td className="mcc-num mcc-casos-gris">{formato.format(totales.otrasActividadesOperacion)}</td>
          <td className="mcc-num mcc-proyecto-gris">{formato.format(totales.proyectos.conHoras)}</td>
<td className="mcc-num mcc-proyecto-gris">{formato.format(totales.horasProyectos)}</td>
<td className="mcc-num mcc-preventa">{formato.format(totales.clientesPreventa)}</td>
<td className="mcc-num mcc-preventa">{formato.format(totales.horasPreventa)}</td>
<td className="mcc-num mcc-otras-gris">{formato.format(totales.otrasOcupaciones)}</td>
        </tr></tfoot>}
      </table></div>
      <p className="mcc-nota">Casos: únicamente ocupación 01 con tarea 01. Número de casos cuenta identificadores únicos; los registros sin identificador no crean casos. Otras Actividades Operacion: tareas 05 Generación de informes y 22 Reunión cliente en cualquier ocupación, con o sin caso, además de las restantes tareas de ocupación 01 distintas de 01. Otras ocupaciones: el resto, excluyendo ocupación 02 de proyectos y ocupación 06 de preventa. La ocupación 06, con todas sus tareas, pertenece solo a Preventa: clientes únicos y sus horas en el periodo y filtros seleccionados. Proyectos con horas y Horas de proyectos siguen siendo indicadores exclusivos de ocupación 02.</p>
    </main>
  );
}

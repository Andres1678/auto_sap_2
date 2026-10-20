import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { jfetch } from "./lib/api";
import "./ModelosCapacidadesCoeSap.css";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const formato = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const periodoActual = () => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${partes.find(p => p.type === "year").value}-${partes.find(p => p.type === "month").value}`;
};

export default function ModelosCapacidadesCoeSap() {
  const [periodo, setPeriodo] = useState(periodoActual);
  const [expandidos, setExpandidos] = useState({});
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
    const controller = new AbortController();
    let vigente = true;
    setResultado(null);
    setExpandidos({});
    setError("");
    if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(periodo)) {
      setError("Selecciona un mes y año válidos.");
      setCargando(false);
      return () => { vigente = false; controller.abort(); };
    }
    const [anio, mes] = periodo.split("-");
    setCargando(true);
    (async () => {
      try {
        const res = await jfetch(`/modelos-capacidades-coe-sap?anio=${anio}&mes=${Number(mes)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data?.data)) throw new Error(data?.mensaje || "No se pudo cargar el modelo.");
        if (vigente) setResultado(data);
      } catch (e) {
        if (vigente && e.name !== "AbortError") setError(e.message || "Error consultando el modelo.");
      } finally { if (vigente) setCargando(false); }
    })();
    return () => { vigente = false; controller.abort(); };
  }, [admin, periodo, revision]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const fila of resultado?.data || []) {
      const clave = String(fila.equipo_id ?? "sin-equipo");
      if (!mapa.has(clave)) mapa.set(clave, { clave, proceso: fila.proceso, filas: [], consultores: [] });
      const grupo = mapa.get(clave);
      grupo.filas.push(fila);
      grupo.consultores.push(...(fila.consultores || []));
    }
    return Array.from(mapa.values());
  }, [resultado]);

  const totales = useMemo(() => {
    const filas = resultado?.data || [];
    const vendida = filas.reduce((s, f) => s + Number(f.capacidad_vendida || 0), 0);
    const actual = filas.reduce((s, f) => s + Number(f.capacidad_actual || 0), 0);
    const vacanteDefinida = filas.length > 0 && filas.every(f => f.capacidad_vacante != null);
    return {
      vendida, actual,
      vacante: vacanteDefinida ? filas.reduce((s, f) => s + Number(f.capacidad_vacante), 0) : null,
      porcentaje: vendida > 0 ? actual / vendida * 100 : null,
    };
  }, [resultado]);

  if (!admin) return <Navigate to="/configuracion" replace />;
  return (
    <main className="mcc-page">
      <Link to="/configuracion" className="mcc-back">← Configuración</Link>
      <header className="mcc-header"><div>
        <span className="mcc-kicker">Planeación operativa</span>
        <h1>Modelos de capacidades COE SAP</h1>
        <p>Capacidad mensual por proceso y cargo de los consultores activos.</p>
      </div><label className="mcc-periodo">Mes de referencia
        <input type="month" value={periodo} min="2000-01" max="2100-12"
          onChange={e => setPeriodo(e.target.value)} />
      </label></header>
      {error && <div className="mcc-error" role="alert">{error} <button onClick={() => setRevision(v => v + 1)}>Reintentar</button></div>}
      {resultado && <div className="mcc-resumen">
        <div><span>Periodo</span><strong>{MESES[resultado.mes - 1]} de {resultado.anio}</strong></div>
        <div><span>Días laborables</span><strong>{resultado.dias_laborables}</strong></div>
        <div><span>Driver por consultor</span><strong>{formato.format(resultado.driver)} horas</strong></div>
      </div>}
      {!!resultado?.advertencias?.length && <div className="mcc-error" role="alert">
        {resultado.advertencias.map((texto) => <p key={texto}>{texto}</p>)}
      </div>}
      <p className="mcc-nota">Lunes a jueves: 8,5 horas. Viernes: 8 horas. Se excluyen fines de semana y festivos de Colombia.</p>
      <div className="mcc-scroll" aria-busy={cargando}><table className="mcc-table">
        <thead><tr><th>Proceso</th><th>Cargo</th><th>Personas incluidas</th><th>Unidad</th><th>Driver</th><th>Volumen actual</th><th>Capacidad vendida (horas)</th><th>Capacidad actual (horas)</th><th>Cumplimiento mes (%)</th><th>Capacidad vacante</th></tr></thead>
        <tbody>{cargando ? <tr><td colSpan={10}>Consultando capacidad mensual…</td></tr> : grupos.length ? grupos.map((grupo) => (
          <React.Fragment key={grupo.clave}>
            {grupo.filas.map((fila, indice) => {
              const clave = `${grupo.clave}-${fila.cargo_id ?? "sin-cargo"}`;
              const abierto = !!expandidos[clave];
              return (
              <React.Fragment key={clave}>
              <tr>
                {indice === 0 && <th scope="rowgroup" rowSpan={grupo.filas.length + grupo.filas.filter(f => expandidos[`${grupo.clave}-${f.cargo_id ?? "sin-cargo"}`]).length} className="mcc-proceso">
                  {grupo.proceso}
                </th>}
                <td>{fila.cargo}</td>
                <td className="mcc-personas">
                  <button type="button" className="mcc-expand" aria-expanded={abierto}
                    aria-controls={`detalle-${clave}`}
                    onClick={() => setExpandidos(prev => ({ ...prev, [clave]: !prev[clave] }))}>
                    {abierto ? "▾" : "▸"} {fila.consultores?.length || 0} personas incluidas
                  </button>
                </td>
                <td>{fila.unidad}</td>
                <td className="mcc-num">{formato.format(fila.driver)}</td>
                <td className="mcc-num">{formato.format(fila.volumen_actual ?? 0)}</td>
                <td className="mcc-num" title={`${fila.personas_activas ?? 0} personas activas × ${fila.driver} horas laborables`}>
                  {formato.format(fila.capacidad_vendida ?? 0)}
                </td>
                <td className="mcc-num">{formato.format(fila.capacidad_actual ?? 0)}</td>
                <td className="mcc-num" title="Horas registradas del mes / capacidad vendida × 100">
                  {fila.porcentaje_cumplimiento_mes == null ? "—" : `${formato.format(fila.porcentaje_cumplimiento_mes)} %`}
                </td>
                <td title="Pendiente de definición">—</td>
              </tr>
              {abierto && <tr className="mcc-detalle" id={`detalle-${clave}`}>
                <td colSpan={9}>
                  <div className="mcc-detalle-body">
                    <h3>{grupo.proceso} · {fila.cargo}</h3>
                    <table className="mcc-consultores">
                      <thead><tr>
                        <th>Consultor</th><th>Usuario</th><th>Unidad</th><th>Driver</th>
                        <th>Volumen actual</th><th>Capacidad vendida (horas)</th>
                        <th>Capacidad actual (horas)</th><th>Cumplimiento mes (%)</th><th>Capacidad vacante</th>
                      </tr></thead>
                      <tbody>{(fila.consultores || []).map(c => (
                        <tr key={c.id}>
                          <td>{c.nombre}</td><td>{c.usuario}</td><td>Horas</td>
                          <td className="mcc-num">{formato.format(fila.driver)}</td>
                          <td className="mcc-num">{formato.format(c.horas ?? 0)}</td>
                          <td className="mcc-num">{formato.format(fila.driver)}</td>
                          <td className="mcc-num">{formato.format(c.capacidad_actual ?? 0)}</td>
                          <td className="mcc-num">{c.porcentaje_cumplimiento_mes == null ? "—" : `${formato.format(c.porcentaje_cumplimiento_mes)} %`}</td>
                          <td title="Pendiente de definición">—</td>
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
        )) : <tr><td colSpan={10}>{error ? "Información no disponible" : "No hay consultores activos para mostrar."}</td></tr>}</tbody>
        {resultado && !cargando && <tfoot><tr>
          <th colSpan={6} scope="row">Totales</th>
          <td className="mcc-num">{formato.format(totales.vendida)}</td>
          <td className="mcc-num">{formato.format(totales.actual)}</td>
          <td className="mcc-num">{totales.porcentaje == null ? "—" : `${formato.format(totales.porcentaje)} %`}</td>
          <td className="mcc-num" title={totales.vacante == null ? "Pendiente de definir el cálculo de capacidad vacante" : "Total capacidad vacante"}>
            {totales.vacante == null ? "Pendiente" : formato.format(totales.vacante)}
          </td>
        </tr></tfoot>}
      </table></div>
      <p className="mcc-nota">Volumen actual: horas registradas en el mes seleccionado, sumadas por cargo. Despliega Personas incluidas para consultar cada persona. Capacidad vendida: personas activas incluidas × driver mensual, sumada por cargo. Los totales suman las filas por cargo sin duplicar consultores. Capacidad actual: horas registradas del mes, con la misma fuente que la capacidad semanal. Cumplimiento mensual: capacidad actual / capacidad vendida × 100. Capacidad vacante sigue pendiente de definición.</p>
    </main>
  );
}

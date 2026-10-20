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
      <p className="mcc-nota">Lunes a jueves: 8,5 horas. Viernes: 9 horas. Se excluyen fines de semana y festivos de Colombia.</p>
      <div className="mcc-scroll" aria-busy={cargando}><table className="mcc-table">
        <thead><tr><th>Proceso</th><th>Cargo</th><th>Unidad</th><th>Driver</th><th>Volumen actual</th><th>Capacidad actual</th><th>Capacidad vacante</th></tr></thead>
        <tbody>{cargando ? <tr><td colSpan={7}>Consultando capacidad mensual…</td></tr> : grupos.length ? grupos.map((grupo) => (
          <React.Fragment key={grupo.clave}>
            {grupo.filas.map((fila, indice) => (
              <tr key={String(fila.cargo_id ?? "sin-cargo")}>
                {indice === 0 && <th scope="rowgroup" rowSpan={grupo.filas.length} className="mcc-proceso">
                  <button type="button" className="mcc-expand" aria-expanded={!!expandidos[grupo.clave]}
                    aria-controls={`detalle-equipo-${grupo.clave}`}
                    onClick={() => setExpandidos(prev => ({ ...prev, [grupo.clave]: !prev[grupo.clave] }))}>
                    <span aria-hidden="true">{expandidos[grupo.clave] ? "▾" : "▸"}</span> {grupo.proceso}
                    <small>{grupo.consultores.length} consultores</small>
                  </button>
                </th>}
                <td>{fila.cargo}</td><td>{fila.unidad}</td>
                <td className="mcc-num">{formato.format(fila.driver)}</td>
                <td className="mcc-num">{formato.format(fila.volumen_actual ?? 0)}</td>
                <td title="Pendiente de definición">—</td><td title="Pendiente de definición">—</td>
              </tr>
            ))}
            <tr id={`detalle-equipo-${grupo.clave}`} hidden={!expandidos[grupo.clave]} className="mcc-detalle">
              <td colSpan={7}><div className="mcc-detalle-body">
                <h3>Consultores de {grupo.proceso}</h3>
                <table className="mcc-consultores"><thead><tr>
                  <th>Consultor</th><th>Usuario</th><th>Cargo</th><th>Volumen actual (horas)</th>
                </tr></thead><tbody>
                  {grupo.consultores.map(c => <tr key={c.id}>
                    <td>{c.nombre}</td><td>{c.usuario}</td><td>{c.cargo}</td>
                    <td className="mcc-num">{formato.format(c.horas ?? 0)}</td>
                  </tr>)}
                </tbody></table>
              </div></td>
            </tr>
          </React.Fragment>
        )) : <tr><td colSpan={7}>{error ? "Información no disponible" : "No hay consultores activos para mostrar."}</td></tr>}</tbody>
      </table></div>
      <p className="mcc-nota">Volumen actual: horas registradas en el mes seleccionado, sumadas por cargo. Despliega el proceso para consultar cada persona. Capacidad actual y capacidad vacante siguen pendientes de definición.</p>
    </main>
  );
}

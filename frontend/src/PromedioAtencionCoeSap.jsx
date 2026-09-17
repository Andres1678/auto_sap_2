import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./PromedioAtencionCoeSap.css";

const EMPTY_FILTERS = { q: "", sociedad: "", clienteAsociadoNombre: "", validarCliente: "", anio: "", mes: "", estadoConsolidado: "", estadoPrincipal: "", subestado: "", validarEstadoControl: "", modulo: "", tipoSolicitud: "", responsableEstado: "", controlHoras: "" };
const LEVELS = { critica: "Crítica", alta: "Alta", media: "Media", baja: "Informativa" };
const FRONTS = { estimacion: "Estimación", cierre: "Antigüedad", comentario: "Seguimiento" };

function readUser() {
  try { return JSON.parse(localStorage.getItem("userData") || localStorage.getItem("user") || sessionStorage.getItem("userData") || sessionStorage.getItem("user") || "{}"); }
  catch { return {}; }
}
function permissions(user) {
  const raw = user?.permisos || user?.user?.permisos || [];
  return Array.isArray(raw) ? raw.map((p) => typeof p === "string" ? p : p?.codigo || p?.code || p?.nombre).filter(Boolean).map((p) => String(p).trim().toUpperCase()) : [];
}
function num(value, decimals = 2) { const n = Number(value || 0); return (Number.isFinite(n) ? n : 0).toLocaleString("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function integer(value) { return Number(value || 0).toLocaleString("es-CO"); }
function text(value) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function options(values) { return (Array.isArray(values) ? values : []).map((item) => item && typeof item === "object" ? { value: item.value ?? item.label ?? "", label: item.label ?? item.value ?? "" } : { value: item, label: item }).filter((item) => String(item.value ?? "").trim()); }
function queryString(filters) { const qs = new URLSearchParams(); qs.set("modo_periodo", "sin_filtro"); Object.entries(filters || {}).forEach(([key, value]) => { if (String(value ?? "").trim()) qs.set(key, String(value).trim()); }); return qs.toString(); }
function fileName(header, fallback) { const utf8 = (header || "").match(/filename\*=UTF-8''([^;]+)/i); const basic = (header || "").match(/filename="?([^";]+)"?/i); return utf8?.[1] ? decodeURIComponent(utf8[1]) : basic?.[1] || fallback; }
function displayDate(value) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }); }

async function downloadFile(url, headers) {
  const response = await jfetch(url, { method: "GET", headers });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.mensaje || `HTTP ${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = objectUrl; link.download = fileName(response.headers.get("Content-Disposition"), "promedio_atencion.xlsx");
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
}

function Select({ label, value, values, onChange }) {
  return <label className="coeavg-filter"><span>{label}</span><select value={value || ""} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{options(values).map((item) => <option key={`${label}-${item.value}`} value={item.value}>{item.label}</option>)}</select></label>;
}
function Metric({ title, value, detail, tone = "dark", onClick }) {
  const content = <><span>{title}</span><strong>{value}</strong><small>{detail}</small>{onClick && <em>Ver cómo se calculó →</em>}</>;
  return onClick ? <button type="button" className={`coeavg-metric ${tone} clickable`} onClick={onClick}>{content}</button> : <article className={`coeavg-metric ${tone}`}>{content}</article>;
}
function Pill({ level }) { return <span className={`coeavg-severity ${level}`}>{LEVELS[level] || level}</span>; }

function CalculationModal({ open, loading, detail, onClose }) {
  const [tab, setTab] = useState("resumen");
  useEffect(() => { if (open) setTab("resumen"); }, [open, detail?.tipo]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  const evolution = detail?.evolucion || []; const cases = detail?.casos || [];
  const max = Math.max(0, ...evolution.map((row) => Number(row.promedio || 0)));
  return <div className="coeavg-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="coeavg-calc-modal" role="dialog" aria-modal="true" aria-labelledby="coeavg-modal-title">
    <header className="coeavg-modal-head"><div><span className="coeavg-section-kicker">Detalle del indicador</span><h2 id="coeavg-modal-title">{detail?.titulo || "Cargando cálculo…"}</h2><p>Corte: {detail?.fechaCorte || "—"} · Mismos filtros del tablero</p></div><button type="button" className="coeavg-modal-close" onClick={onClose} aria-label="Cerrar">×</button></header>
    {loading ? <div className="coeavg-modal-loading"><div className="coeavg-loader" />Consultando casos del cálculo…</div> : !detail ? <div className="coeavg-empty">No fue posible cargar el detalle.</div> : <>
      <nav className="coeavg-modal-tabs" aria-label="Vistas del cálculo">{[["resumen", "Resumen"], ["evolucion", "Evolución"], ["casos", `Casos incluidos (${integer(cases.length)})`]].map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <div className="coeavg-modal-body">
        {tab === "resumen" && <div className="coeavg-calc-summary"><div className="coeavg-calc-result"><span>Promedio calculado</span><strong>{num(detail.promedio)} días</strong><small>{detail.unidad}</small></div><div className="coeavg-calc-stats"><article><span>Medidos</span><strong>{integer(detail.medidos)}</strong></article><article><span>Sin fechas</span><strong>{integer(detail.excluidos)}</strong></article><article><span>No aplican</span><strong>{integer(detail.noAplican)}</strong></article><article><span>Fechas inválidas</span><strong>{integer(detail.invalidos)}</strong></article></div><div className="coeavg-formula"><span>Fórmula</span><strong>{detail.formula}</strong><p>{detail.descripcion}</p></div></div>}
        {tab === "evolucion" && <div className="coeavg-calc-evolution">{!evolution.length ? <div className="coeavg-empty small">No hay periodos con casos medidos.</div> : evolution.map((row) => <article key={row.periodo}><div><strong>{row.periodo}</strong><span>{integer(row.cantidad)} casos</span></div><div className="coeavg-calc-bar"><i style={{ width: `${max ? Math.max(3, Number(row.promedio || 0) / max * 100) : 0}%` }} /></div><b>{num(row.promedio)} días</b></article>)}</div>}
        {tab === "casos" && <div className="coeavg-cases-wrap"><table><thead><tr><th>Caso</th><th>Cliente / asunto</th><th>Consultor</th><th>Fecha inicial</th><th>Fecha final</th><th>Días</th></tr></thead><tbody>{!cases.length ? <tr><td colSpan="6" className="coeavg-empty">No hay casos incluidos.</td></tr> : cases.map((row) => <tr key={`${row.id}-${row.numero}`}><td className="mono strong">{text(row.numero)}</td><td><strong>{text(row.cliente)}</strong><small>{text(row.asunto)}</small></td><td>{text(row.consultor)}</td><td>{displayDate(row.fechaInicio)}</td><td>{displayDate(row.fechaFin)}</td><td className="right strong">{num(row.dias)}</td></tr>)}</tbody></table></div>}
      </div>
    </>}
  </section></div>;
}

function AlertCenter({ alerts, consultants }) {
  const [front, setFront] = useState("todos"); const [level, setLevel] = useState("todos"); const [consultant, setConsultant] = useState("todos"); const [search, setSearch] = useState("");
  const visible = useMemo(() => (alerts || []).filter((alert) => {
    const haystack = `${alert.numero} ${alert.asunto} ${alert.cliente} ${alert.consultor}`.toLowerCase();
    return (front === "todos" || alert.frente === front) && (level === "todos" || alert.nivel === level) && (consultant === "todos" || alert.consultor === consultant) && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  }), [alerts, front, level, consultant, search]);

  return <section className="coeavg-card coeavg-alert-card"><div className="coeavg-card-head"><div><span className="coeavg-section-kicker">Centro de control</span><h2>Alertas accionables por consultor</h2><p>Ordenadas por prioridad; los filtros de esta sección no alteran los indicadores.</p></div><span className="coeavg-count">{integer(visible.length)} visibles</span></div>
    <div className="coeavg-alert-filters"><label><span>Frente</span><select value={front} onChange={(e) => setFront(e.target.value)}><option value="todos">Todos</option>{Object.entries(FRONTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>Prioridad</span><select value={level} onChange={(e) => setLevel(e.target.value)}><option value="todos">Todas</option>{Object.entries(LEVELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>Consultor</span><select value={consultant} onChange={(e) => setConsultant(e.target.value)}><option value="todos">Todos</option>{(consultants || []).map((row) => <option key={row.consultor} value={row.consultor}>{row.consultor}</option>)}</select></label><label className="wide"><span>Buscar caso</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID, asunto o cliente" /></label></div>
    <div className="coeavg-alert-table-wrap"><table className="coeavg-alert-table"><thead><tr><th>Prioridad</th><th>Frente</th><th>Caso</th><th>Cliente / asunto</th><th>Consultor</th><th>Control</th><th>Acción requerida</th></tr></thead><tbody>{!visible.length ? <tr><td colSpan="7" className="coeavg-empty">No hay alertas con esta selección.</td></tr> : visible.map((alert, index) => <tr key={`${alert.frente}-${alert.id}-${index}`} className={`row-${alert.nivel}`}><td><Pill level={alert.nivel} /></td><td><span className="coeavg-front">{FRONTS[alert.frente]}</span></td><td><strong className="mono">{alert.numero}</strong><small>{text(alert.estadoPrincipal)}{alert.subestado ? ` · ${alert.subestado}` : ""}</small></td><td><strong>{alert.cliente}</strong><small title={alert.asunto}>{alert.asunto}</small></td><td>{alert.consultor}</td><td><strong>{integer(alert.dias)} días</strong><small>Base: {text(alert.fechaBase)}</small></td><td><p>{alert.mensaje}</p></td></tr>)}</tbody></table></div>
  </section>;
}

function Consultants({ rows }) {
  return <section className="coeavg-card coeavg-consultants"><div className="coeavg-card-head"><div><h2>Carga de alertas por consultor</h2><p>Ayuda a priorizar acompañamiento y redistribuir acciones.</p></div></div><div className="coeavg-consultant-grid">{!(rows || []).length ? <div className="coeavg-empty small">Sin consultores para mostrar.</div> : rows.map((row) => <article key={row.consultor}><div><strong>{row.consultor}</strong><span>{integer(row.casos)} casos · {integer(row.alertas)} alertas</span></div><div className="coeavg-consultant-levels"><b className="critica">{row.criticas} críticas</b><b className="alta">{row.altas} altas</b><b className="media">{row.medias} medias</b></div></article>)}</div></section>;
}

function History({ rows }) {
  const max = useMemo(() => Math.max(0, ...(rows || []).flatMap((row) => [row.promedioTiempoRespuesta, row.promedioTiempoResolucion, row.promedioTiempoCierre, row.promedioElaboracionEstimacion].map(Number))), [rows]);
  return <><section className="coeavg-card coeavg-bars-card"><div className="coeavg-card-head"><div><h2>Evolución mensual</h2><p>Respuesta, resolución, cierre y elaboración de estimaciones en días calendario.</p></div></div><div className="coeavg-period-list">{!rows?.length ? <div className="coeavg-empty small">Sin datos para graficar.</div> : rows.map((row) => <div className="coeavg-period-row" key={row.periodo}><div className="coeavg-period-title"><strong>{row.periodo}</strong><span>{row.mesNombre} · {integer(row.cantidad)} casos</span></div><div className="coeavg-period-bars">{[["Respuesta", row.promedioTiempoRespuesta], ["Resolución", row.promedioTiempoResolucion], ["Cierre", row.promedioTiempoCierre], ["Elaboración estimación", row.promedioElaboracionEstimacion]].map(([label, raw]) => { const value = Number(raw || 0); return <div className="coeavg-mini-bar" key={label}><span>{label}</span><div><em style={{ width: `${max ? Math.max(4, Math.round(value / max * 100)) : 0}%` }} /></div><strong>{num(value)} d</strong></div>; })}</div></div>)}</div></section>
    <section className="coeavg-card coeavg-table-card"><div className="coeavg-table-head"><div><h2>Detalle histórico por periodo</h2><p>La elaboración mide desde el inicio de laboración hasta la fecha de estimación.</p></div></div><div className="coeavg-table-wrap"><table className="coeavg-table"><thead><tr><th>Año</th><th>Mes</th><th>Periodo</th><th>Casos</th><th>Prom. respuesta</th><th>Prom. resolución</th><th>Prom. cierre</th><th>Prom. elaboración estimación</th><th>Estimaciones medidas</th></tr></thead><tbody>{!rows.length ? <tr><td colSpan="9" className="coeavg-empty">No hay información.</td></tr> : rows.map((row) => <tr key={row.periodo}><td>{row.anio}</td><td>{row.mesNombre}</td><td className="mono strong">{row.periodo}</td><td className="right">{integer(row.cantidad)}</td><td className="right">{num(row.promedioTiempoRespuesta)} días</td><td className="right">{num(row.promedioTiempoResolucion)} días</td><td className="right">{num(row.promedioTiempoCierre)} días</td><td className="right strong">{num(row.promedioElaboracionEstimacion)} días</td><td className="right">{integer(row.estimacionesMedidas)}</td></tr>)}</tbody></table></div></section></>;
}

export default function PromedioAtencionCoeSap() {
  const user = useMemo(readUser, []); const role = String(user?.rol || user?.user?.rol || "").toUpperCase(); const perms = useMemo(() => permissions(user), [user]);
  const canView = role === "ADMIN" || perms.includes("BASE_REGISTRO_VER");
  const headers = useMemo(() => ({ "X-User-Rol": role, "X-User-Usuario": user?.usuario || user?.user?.usuario || "" }), [role, user]);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [applied, setApplied] = useState(EMPTY_FILTERS); const [data, setData] = useState({ rows: [], summary: {}, options: {}, alerts: [], consultants: [], rules: {} }); const [loading, setLoading] = useState(false); const [downloading, setDownloading] = useState(false);
  const [calculationOpen, setCalculationOpen] = useState(false); const [calculationLoading, setCalculationLoading] = useState(false); const [calculationDetail, setCalculationDetail] = useState(null);

  const load = useCallback(async () => {
    if (!canView) return; setLoading(true);
    try { const qs = queryString(applied); const response = await jfetch(`/coe-sap-funcional/calificacion/promedio-atencion${qs ? `?${qs}` : ""}`, { method: "GET", headers }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || body?.mensaje || `HTTP ${response.status}`); setData({ rows: Array.isArray(body.data) ? body.data : [], summary: body.resumen || {}, options: body.opciones || {}, alerts: Array.isArray(body.alertas) ? body.alertas : [], consultants: Array.isArray(body.consultores) ? body.consultores : [], rules: body.reglas || {} }); }
    catch (error) { setData({ rows: [], summary: {}, options: {}, alerts: [], consultants: [], rules: {} }); Swal.fire({ icon: "error", title: "No se pudo consultar el seguimiento", text: error?.message || "Revisa el backend.", confirmButtonColor: "#DA291C" }); }
    finally { setLoading(false); }
  }, [canView, headers, applied]);
  useEffect(() => { load(); }, [load]);
  const clear = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  const download = useCallback(async () => { setDownloading(true); try { const qs = queryString(applied); await downloadFile(`/coe-sap-funcional/calificacion/promedio-atencion/export-excel${qs ? `?${qs}` : ""}`, headers); } catch (error) { Swal.fire({ icon: "error", title: "No se pudo descargar", text: error?.message, confirmButtonColor: "#DA291C" }); } finally { setDownloading(false); } }, [applied, headers]);
  const closeCalculation = useCallback(() => setCalculationOpen(false), []);
  const openCalculation = useCallback(async (tipo) => {
    setCalculationOpen(true); setCalculationLoading(true); setCalculationDetail(null);
    try { const qs = new URLSearchParams(queryString(applied)); qs.set("tipo", tipo); const response = await jfetch(`/coe-sap-funcional/calificacion/promedio-atencion/detalle-calculo?${qs.toString()}`, { method: "GET", headers }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || body?.mensaje || `HTTP ${response.status}`); setCalculationDetail(body); }
    catch (error) { setCalculationOpen(false); Swal.fire({ icon: "error", title: "No se pudo abrir el cálculo", text: error?.message || "Revisa el backend.", confirmButtonColor: "#DA291C" }); }
    finally { setCalculationLoading(false); }
  }, [applied, headers]);
  if (!canView) return <div className="coeavg-page"><div className="coeavg-access-card"><div className="coeavg-access-icon">🔒</div><h2>Acceso restringido</h2><p>Necesitas el permiso BASE_REGISTRO_VER.</p></div></div>;

  const { rows, summary, alerts, consultants, rules } = data;
  return <div className="coeavg-page"><section className="coeavg-hero"><div><span className="coeavg-eyebrow">Seguimiento de atención</span><h1>Control de tiempos y alertas COE SAP</h1><p>Supervisa cierre, estimaciones y actualización de comentarios con responsables y acciones claras.</p></div><div className="coeavg-hero-actions"><div className="coeavg-cutoff"><span>Corte</span><strong>{rules.fechaCorte || "Hoy"}</strong></div><button className="coeavg-btn light" onClick={load} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button><button className="coeavg-btn danger" onClick={download} disabled={loading || downloading}>{downloading ? "Descargando…" : "Excel"}</button></div></section>
    <section className="coeavg-card coeavg-filters-card"><div className="coeavg-card-head"><div><h2>Alcance del análisis</h2><p>Los filtros recalculan promedios, alertas y carga por consultor.</p></div><button className="coeavg-btn ghost" onClick={clear}>Limpiar</button></div><div className="coeavg-filters-grid"><label className="coeavg-filter search"><span>Búsqueda general</span><input value={filters.q} placeholder="ID, asunto, observación, sociedad…" onChange={(e) => setFilters((old) => ({ ...old, q: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && setApplied({ ...filters })} /></label>{[["Sociedad", "sociedad"], ["Cliente", "clienteAsociadoNombre"], ["Año", "anio"], ["Mes", "mes"], ["Estado principal", "estadoPrincipal"], ["Subestado", "subestado"], ["Módulo", "modulo"], ["Tipo solicitud", "tipoSolicitud"], ["Responsable", "responsableEstado"]].map(([label, key]) => <Select key={key} label={label} value={filters[key]} values={data.options[key]} onChange={(value) => setFilters((old) => ({ ...old, [key]: value }))} />)}</div><div className="coeavg-actions"><button className="coeavg-btn danger" onClick={() => setApplied({ ...filters })} disabled={loading}>Aplicar filtros</button><button className="coeavg-btn light" onClick={clear} disabled={loading}>Restablecer</button></div></section>
    {loading && !rows.length ? <section className="coeavg-card coeavg-loading-card"><div className="coeavg-loader" />Calculando indicadores y alertas…</section> : <><section className="coeavg-metrics-grid coeavg-main-metrics"><Metric title="Apertura → cierre" value={`${num(summary.promedioAperturaCierre)} días`} detail={`${integer(summary.casosCerradosMedidos)} cerrados medidos`} onClick={() => openCalculation("apertura_cierre")} /><Metric title="Elaboración de estimación" value={`${num(summary.promedioElaboracionEstimacion)} días`} detail={`${integer(summary.estimacionesMedidas)} estimaciones medidas`} tone="ok" onClick={() => openCalculation("elaboracion_estimacion")} /><Metric title="Edad de casos abiertos" value={`${num(summary.promedioEdadAbiertos)} días`} detail={`${integer(summary.casosAbiertos)} activos · máximo 90 días`} tone="warn" onClick={() => openCalculation("edad_abiertos")} /><Metric title="Desde último comentario" value={`${num(summary.promedioSinComentario)} días`} detail="Actualizar cada 2–3 días" tone="info" onClick={() => openCalculation("sin_comentario")} /><Metric title="Casos en estimación" value={integer(summary.casosEnEstimacion)} detail={`${num(summary.promedioEnEstimacion)} días · SLA 3 días`} tone="ok" onClick={() => openCalculation("en_estimacion")} /></section><section className="coeavg-metrics-grid coeavg-alert-metrics"><Metric title="Alertas totales" value={integer(summary.alertasTotal)} detail="Todos los frentes" /><Metric title="Críticas" value={integer(summary.alertasCriticas)} detail="Vencidas o inmediatas" tone="critical" /><Metric title="Altas" value={integer(summary.alertasAltas)} detail="Atender hoy" tone="warn" /><Metric title="Medias + informativas" value={integer(Number(summary.alertasMedias || 0) + Number(summary.alertasBajas || 0))} detail="Planificar seguimiento" tone="info" /></section><AlertCenter alerts={alerts} consultants={consultants} /><Consultants rows={consultants} /><History rows={rows} /></>}
    <CalculationModal open={calculationOpen} loading={calculationLoading} detail={calculationDetail} onClose={closeCalculation} />
  </div>;
}

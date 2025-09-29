// src/Graficos.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ReferenceLine
} from 'recharts';
import Modal from 'react-modal';
import './PanelGraficos.css';
import { jfetch } from './lib/api';

/* ========= config ========= */
const OPEN_ON_HOVER = false;
Modal.setAppElement('#root');

/* =============== Helpers básicos =============== */
const asArray = (v) => (Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []));
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const coincideMes = (fechaISO, mesYYYYMM) => {
  if (!mesYYYYMM) return true;
  const [y, m] = mesYYYYMM.split('-');
  return typeof fechaISO === 'string' && fechaISO.startsWith(`${y}-${m}`);
};

/* ====== días hábiles del mes (sin fines de semana) ====== */
function businessDaysInMonth(year, month /* 1-12 */, holidays = []) {
  const festivos = new Set(holidays || []);
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month, 0);
  let habiles = 0;
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();               // 0 dom .. 6 sáb
    const iso = d.toISOString().slice(0,10);
    if (dow === 0 || dow === 6) continue; // fin de semana
    if (festivos.has(iso)) continue;      // festivo
    habiles++;
  }
  return habiles;
}

/* =============== Medición de texto + tick con wrap =============== */
const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d');

function _setFont({
  fontSize = 12,
  fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  fontWeight = 400,
} = {}) {
  _ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
}
function textWidthPx(text, opts) {
  _setFont(opts);
  return _ctx.measureText(String(text ?? '')).width;
}

function yWidthFromPx(labels, {
  min = 120, max = 360, pad = 28, fontSize = 12, fontWeight = 400,
} = {}) {
  _setFont({ fontSize, fontWeight });
  const w = Math.max(0, ...labels.map(t => textWidthPx(t, { fontSize, fontWeight })));
  return Math.max(min, Math.min(max, Math.ceil(w + pad)));
}
function wrapByPx(text, maxWidth, { lineHeight = 13, fontSize = 12, fontWeight = 400 } = {}) {
  _setFont({ fontSize, fontWeight });
  const words = String(text ?? '').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const tentative = line ? `${line} ${w}` : w;
    if (textWidthPx(tentative, { fontSize, fontWeight }) > maxWidth) {
      if (line) lines.push(line);
      if (textWidthPx(w, { fontSize, fontWeight }) > maxWidth) {
        let buff = '';
        for (const ch of w) {
          if (textWidthPx(buff + ch, { fontSize, fontWeight }) > maxWidth) {
            lines.push(buff);
            buff = ch;
          } else {
            buff += ch;
          }
        }
        line = buff;
      } else {
        line = w;
      }
    } else {
      line = tentative;
    }
  }
  if (line) lines.push(line);
  return { lines, lineHeight };
}

function WrapTickPx({ x, y, payload, maxWidth = 160, dy = 3, fontSize = 12, color = '#6b7280' }) {
  const full = String(payload?.value ?? '');
  const { lines, lineHeight } = wrapByPx(full, maxWidth, { lineHeight: 13, fontSize });
  return (
    <g transform={`translate(${x - 6},${y})`}>
      <title>{full}</title>
      <text textAnchor="end" fontSize={fontSize} fill={color}>
        {lines.map((t, i) => (
          <tspan key={i} x={0} dy={i === 0 ? dy : lineHeight}>{t}</tspan>
        ))}
      </text>
    </g>
  );
}

/* Gradiente de marca para las barras */
const BrandDefs = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#E30613" />
      <stop offset="100%" stopColor="#0055B8" />
    </linearGradient>
  </defs>
);

/* Paleta para pie (torta) */
const PIE_COLORS = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#0ea5e9', '#e11d48', '#16a34a', '#ca8a04', '#6d28d9'
];

/* ========= Componente ========= */
export default function Graficos() {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');

  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRows, setModalRows] = useState([]);
  const [modalTitle, setModalTitle] = useState('');

  // Usuario / rol
  const user = useMemo(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('userData') || 'null') ||
        JSON.parse(localStorage.getItem('user') || 'null') ||
        {}
      );
    } catch {
      return {};
    }
  }, []);
  const rol = String(user?.rol || user?.user?.rol || '').toUpperCase();
  const nombreUser = String(user?.nombre || user?.user?.nombre || '').trim();
  const isAdmin = rol === 'ADMIN';

  // Carga de datos
  useEffect(() => {
    const fetchRegistros = async () => {
      setError('');
      try {
        const isUser = !isAdmin;
        const res = await jfetch('/registros', {
          method: isUser ? 'POST' : 'GET',
          headers: {
            ...(isAdmin ? { 'X-User-Rol': 'ADMIN' } : {}),
            ...(isUser ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(isUser ? { body: JSON.stringify({ rol, nombre: nombreUser }) } : {})
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
        const arr = asArray(json);
        setRegistros(arr);
        if (!isAdmin && nombreUser) setFiltroConsultor(nombreUser);
      } catch (err) {
        setRegistros([]);
        setError(String(err?.message || err));
        console.error('Error al cargar registros:', err);
      }
    };
    fetchRegistros();
  }, [isAdmin, nombreUser, rol]);

  // Opciones de filtros
  const consultoresUnicos = useMemo(() => {
    const set = new Set((registros ?? [])
      .filter(r => coincideMes(r.fecha, filtroMes))
      .map(r => r.consultor));
    const arr = Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return isAdmin ? arr : (nombreUser ? [nombreUser] : arr);
  }, [registros, filtroMes, isAdmin, nombreUser]);

  const tareasUnicas = useMemo(() => {
    const set = new Set((registros ?? [])
      .filter(r => coincideMes(r.fecha, filtroMes))
      .map(r => r.tipoTarea));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const clientesUnicos = useMemo(() => {
    const set = new Set((registros ?? [])
      .filter(r => coincideMes(r.fecha, filtroMes))
      .map(r => r.cliente));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const modulosUnicos = useMemo(() => {
    const set = new Set((registros ?? [])
      .filter(r => coincideMes(r.fecha, filtroMes))
      .map(r => r.modulo));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  // Datos filtrados
  const datosFiltrados = useMemo(() => {
    return (registros ?? []).filter(r => {
      if (!coincideMes(r.fecha, filtroMes)) return false;
      if (filtroConsultor && r.consultor !== filtroConsultor) return false;
      if (filtroTarea && r.tipoTarea !== filtroTarea) return false;
      if (filtroCliente && r.cliente !== filtroCliente) return false;
      if (filtroModulo && r.modulo !== filtroModulo) return false;
      return true;
    });
  }, [registros, filtroMes, filtroConsultor, filtroTarea, filtroCliente, filtroModulo]);

  // Agrupaciones
  const horasPorConsultor = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach(r => {
      const k = r.consultor || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([consultor, horas]) => ({
      consultor, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorTarea = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach(r => {
      const k = r.tipoTarea || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([tipoTarea, horas]) => ({
      tipoTarea, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorCliente = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach(r => {
      const k = r.cliente || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([cliente, horas]) => ({
      cliente, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorModulo = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach(r => {
      const k = r.modulo || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([modulo, horas]) => ({
      modulo, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  // Pie (% por tarea)
  const pieTareas = useMemo(() => {
    const total = horasPorTarea.reduce((s, r) => s + r.horas, 0);
    if (total <= 0) return [];
    return horasPorTarea.map((t) => ({
      name: t.tipoTarea,
      value: +((t.horas / total) * 100).toFixed(2),
      horas: t.horas
    }));
  }, [horasPorTarea]);

  // Alturas (se usan en ResponsiveContainer → elimina warnings)
  const hConsultores = Math.max(320, horasPorConsultor.length * 30);
  const hTareas      = Math.max(320, horasPorTarea.length * 30);
  const hClientes    = Math.max(320, horasPorCliente.length * 30);
  const hModulos     = Math.max(320, horasPorModulo.length * 30);

  // Anchos de Y
  const yWidthConsultor = yWidthFromPx(horasPorConsultor.map(d => d.consultor), { min: 140, max: 360, pad: 32 });
  const yWidthTarea     = yWidthFromPx(horasPorTarea.map(d => d.tipoTarea),     { min: 160, max: 380, pad: 32 });
  const yWidthCliente   = yWidthFromPx(horasPorCliente.map(d => d.cliente),     { min: 160, max: 380, pad: 32 });
  const yWidthModulo    = yWidthFromPx(horasPorModulo.map(d => d.modulo),       { min: 140, max: 360, pad: 32 });

  // ====== META mensual (días hábiles × 9h) ======
  const metaHorasMes = useMemo(() => {
    if (!filtroMes) return null; // sin mes seleccionado no mostramos meta
    const [yStr, mStr] = filtroMes.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const habiles = businessDaysInMonth(y, m /*, festivos=[] si tienes lista */);
    return habiles * 9; // 9h por día
  }, [filtroMes]);

  // Eje X asegurando que la meta quepa
  const maxDatoConsultor = horasPorConsultor.reduce((m, r) => Math.max(m, r.horas), 0);
  const xMaxConsultor = useMemo(
    () => Math.max(maxDatoConsultor, metaHorasMes || 0) * 1.05,
    [maxDatoConsultor, metaHorasMes]
  );

  // Modal helpers
  const openDetail = (kind, value, pretty) => {
    let rows = [];
    if (kind === 'consultor') rows = datosFiltrados.filter(r => r.consultor === value);
    if (kind === 'tipoTarea') rows = datosFiltrados.filter(r => r.tipoTarea === value);
    if (kind === 'cliente')   rows = datosFiltrados.filter(r => r.cliente === value);
    if (kind === 'modulo')    rows = datosFiltrados.filter(r => r.modulo === value);

    rows = rows.slice().sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));
    const total = rows.reduce((sum, r) => sum + toNum(r.tiempoInvertido), 0);

    setModalRows(rows);
    setModalTitle(`${pretty}: ${value} — Total: ${total.toFixed(2)} h`);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  // Subtotales por día (modal)
  const modalSubtotales = useMemo(() => {
    const byDay = new Map();
    (modalRows ?? []).forEach(r => {
      const f = r.fecha || '—';
      if (!byDay.has(f)) byDay.set(f, { rows: [], total: 0 });
      const bucket = byDay.get(f);
      bucket.rows.push(r);
      bucket.total += toNum(r.tiempoInvertido);
    });
    return Array.from(byDay.entries())
      .sort((a,b) => String(b[0]).localeCompare(String(a[0])))
      .map(([fecha, v]) => ({ fecha, rows: v.rows, total: +v.total.toFixed(2) }));
  }, [modalRows]);

  return (
    <div className="panel-graficos-container">
      {error && (
        <div className="pg-error" style={{
          color: '#b00510', background: '#ffe6e8', border: '1px solid #f5c2c7',
          padding: '10px 12px', borderRadius: 10, maxWidth: 1100, width: '100%'
        }}>
          Error al cargar datos: {error}
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-globales pg-sticky">
        <select
          className="filtro-select"
          value={filtroConsultor}
          onChange={(e) => setFiltroConsultor(e.target.value)}
          disabled={!isAdmin}
          title="Consultor"
        >
          {isAdmin && <option value="">Todos los consultores</option>}
          {consultoresUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="filtro-select" value={filtroTarea} onChange={(e) => setFiltroTarea(e.target.value)} title="Tipo de tarea">
          <option value="">Todas las tareas</option>
          {tareasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="filtro-select" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} title="Cliente">
          <option value="">Todos los clientes</option>
          {clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="filtro-select" value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)} title="Módulo">
          <option value="">Todos los módulos</option>
          {modulosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <input className="filtro-month" type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} title="Mes (YYYY-MM)" />

        <button
          className="btn btn-outline"
          onClick={() => {
            setFiltroTarea(''); setFiltroCliente(''); setFiltroModulo(''); setFiltroMes('');
            setFiltroConsultor(isAdmin ? '' : (nombreUser || ''));
          }}
        >
          Limpiar
        </button>
      </div>

      <div className="pg-grid pg-grid--stack">
        {/* Horas por Consultor */}
        <div className="grafico-box">
          <h3>Horas por Consultor</h3>
          {!!metaHorasMes && (
            <div style={{ margin: '0 0 6px 6px', color: 'var(--pg-muted)', fontSize: 13 }}>
              Meta mes: <b>{metaHorasMes} h</b> ({/* texto amigable */}
              {(() => {
                const [y,m] = (filtroMes || '').split('-');
                const habiles = businessDaysInMonth(parseInt(y||'0',10), parseInt(m||'0',10));
                return `${habiles} días hábiles × 9h`;
              })()})
            </div>
          )}

          {horasPorConsultor.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hConsultores}>
                <BarChart
                  data={horasPorConsultor}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  barCategoryGap={12}
                  barSize={20}
                >
                  <BrandDefs id="gradConsultor" />
                  <CartesianGrid strokeDasharray="3 3" />

                  {/* Asegura que la meta sea visible sin romper el diseño */}
                  <XAxis type="number" domain={[0, xMaxConsultor]} tickLine={false} axisLine={false} />

                  <YAxis
                    type="category"
                    dataKey="consultor"
                    width={yWidthConsultor}
                    tick={<WrapTickPx maxWidth={yWidthConsultor - 18} fontSize={12} />}
                  />

                  <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />

                  {/* Línea de meta (sin fondo gris) */}
                  {metaHorasMes != null && (
                    <ReferenceLine
                      x={metaHorasMes}
                      stroke="#E30613"
                      strokeDasharray="5 5"
                      label={{ value: 'Meta', position: 'top', fill: '#E30613', fontWeight: 700 }}
                    />
                  )}

                  <Bar dataKey="horas" name="Horas">
                    {horasPorConsultor.map((entry, idx) => (
                      <Cell
                        key={`c-${idx}`}
                        fill="url(#gradConsultor)"
                        onClick={() => openDetail('consultor', entry.consultor, 'Consultor')}
                        onMouseEnter={() => { if (OPEN_ON_HOVER) openDetail('consultor', entry.consultor, 'Consultor'); }}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Tipo de Tarea */}
        <div className="grafico-box">
          <h3>Horas por Tipo de Tarea</h3>

          {horasPorTarea.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hTareas}>
                <BarChart
                  data={horasPorTarea}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  barCategoryGap={12}
                  barSize={20}
                >
                  <BrandDefs id="gradTarea" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="tipoTarea"
                    width={yWidthTarea}
                    tick={<WrapTickPx maxWidth={yWidthTarea - 18} fontSize={12} />}
                  />
                  <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                  <Bar dataKey="horas" name="Horas">
                    {horasPorTarea.map((entry, idx) => (
                      <Cell
                        key={`t-${idx}`}
                        fill="url(#gradTarea)"
                        onClick={() => openDetail('tipoTarea', entry.tipoTarea, 'Tipo de Tarea')}
                        onMouseEnter={() => { if (OPEN_ON_HOVER) openDetail('tipoTarea', entry.tipoTarea, 'Tipo de Tarea'); }}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Cliente */}
        <div className="grafico-box">
          <h3>Horas por Cliente</h3>

          {horasPorCliente.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hClientes}>
                <BarChart
                  data={horasPorCliente}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  barCategoryGap={12}
                  barSize={20}
                >
                  <BrandDefs id="gradCliente" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="cliente"
                    width={yWidthCliente}
                    tick={<WrapTickPx maxWidth={yWidthCliente - 18} fontSize={12} />}
                  />
                  <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                  <Bar dataKey="horas" name="Horas">
                    {horasPorCliente.map((entry, idx) => (
                      <Cell
                        key={`cli-${idx}`}
                        fill="url(#gradCliente)"
                        onClick={() => openDetail('cliente', entry.cliente, 'Cliente')}
                        onMouseEnter={() => { if (OPEN_ON_HOVER) openDetail('cliente', entry.cliente, 'Cliente'); }}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Módulo */}
        <div className="grafico-box">
          <h3>Horas por Módulo</h3>

          {horasPorModulo.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hModulos}>
                <BarChart
                  data={horasPorModulo}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  barCategoryGap={12}
                  barSize={20}
                >
                  <BrandDefs id="gradModulo" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="modulo"
                    width={yWidthModulo}
                    tick={<WrapTickPx maxWidth={yWidthModulo - 18} fontSize={12} />}
                  />
                  <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                  <Bar dataKey="horas" name="Horas">
                    {horasPorModulo.map((entry, idx) => (
                      <Cell
                        key={`m-${idx}`}
                        fill="url(#gradModulo)"
                        onClick={() => openDetail('modulo', entry.modulo, 'Módulo')}
                        onMouseEnter={() => { if (OPEN_ON_HOVER) openDetail('modulo', entry.modulo, 'Módulo'); }}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Torta por tipo de tarea */}
        <div className="grafico-box">
          <h3>Distribución por Tipo de Tarea (%) {filtroMes && `(${filtroMes})`}</h3>
          {pieTareas.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <PieChart>
                <Tooltip
                  formatter={(v, n, p) => [
                    `${v}% — ${Number(p.payload.horas).toFixed(2)} h`,
                    p.payload.name
                  ]}
                />
                <Legend />
                <Pie
                  data={pieTareas}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                  isAnimationActive
                >
                  {pieTareas.map((entry, index) => (
                    <Cell key={`slice-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ===== Modal con subtotales por día ===== */}
      <Modal
        isOpen={modalOpen}
        onRequestClose={closeModal}
        className="modal-content"
        overlayClassName="modal-overlay"
        contentLabel="Detalle de barra"
        shouldCloseOnOverlayClick
      >
        <div className="modal-header modal-header--gradient">
          <h3 className="modal-title">{modalTitle || 'Detalle'}</h3>
          <button className="close-button" onClick={closeModal} aria-label="Cerrar">✖</button>
        </div>

        <div className="modal-body modal-body--scroll">
          {modalSubtotales.length === 0 ? (
            <div className="empty">Sin registros para mostrar.</div>
          ) : (
            modalSubtotales.map((bucket) => (
              <details key={bucket.fecha} className="day-accordion" open>
                <summary className="day-accordion__summary">
                  <div className="day-accordion__title">
                    <span className="badge-date">{bucket.fecha}</span>
                  </div>
                  <div className="day-accordion__meta">
                    <span className="chip">{bucket.rows.length} reg.</span>
                    <span className="chip chip--accent"><b>Subtotal:</b> {bucket.total.toFixed(2)} h</span>
                  </div>
                </summary>

                <div className="table-responsive">
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Consultor</th>
                        <th>Cliente</th>
                        <th>Tarea</th>
                        <th>Módulo</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th className="num">Horas</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="truncate" title={r.consultor}>{r.consultor}</td>
                          <td className="truncate" title={r.cliente}>{r.cliente}</td>
                          <td className="truncate" title={r.tipoTarea}>{r.tipoTarea}</td>
                          <td className="truncate" title={r.modulo}>{r.modulo}</td>
                          <td>{r.horaInicio}</td>
                          <td>{r.horaFin}</td>
                          <td className="num">{toNum(r.tiempoInvertido).toFixed(2)}</td>
                          <td className="truncate" title={r.descripcion || ''}>{r.descripcion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          )}
        </div>

        <div className="modal-footer-total">
          <span className="chip chip--ghost">Filas: {modalRows.length}</span>
          <span className="spacer" />
          <strong>
            Total general:&nbsp;
            {modalRows.reduce((s,r)=>s+toNum(r.tiempoInvertido),0).toFixed(2)} h
          </strong>
        </div>
      </Modal>
    </div>
  );
}

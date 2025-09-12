import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './PanelGraficos.css';
import { jfetch } from './lib/api';

/* ---------- Utils ---------- */
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

/* Mide ancho del eje Y según el texto más largo */
const yWidthFrom = (arr, key, min = 120, max = 320) => {
  const maxLen = (arr || []).reduce((m, r) => Math.max(m, String(r?.[key] || '').length), 0);
  return Math.max(min, Math.min(max, Math.round(maxLen * 7.2)));
};

/* Envuelve texto de eje Y en múltiples líneas cortas */
const renderYAxisTick = ({ x, y, payload }) => {
  const raw = String(payload?.value ?? '');
  const words = raw.split(' ');
  const lines = [];
  let line = '';
  const maxChars = 20;

  words.forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);

  const lh = 12; 
  return (
    <g transform={`translate(${x - 6},${y})`}>
      <text textAnchor="end" fill="#6b7280" fontSize="12">
        {lines.map((t, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : lh}>{t}</tspan>
        ))}
      </text>
    </g>
  );
};

/* Gradiente marca */
const BrandDefs = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#E30613" />
      <stop offset="100%" stopColor="#0055B8" />
    </linearGradient>
  </defs>
);

const Graficos = () => {
  /* ---------- Estado ---------- */
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');

  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

  /* ---------- Usuario / rol ---------- */
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

  /* ---------- Carga de datos ---------- */
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

  /* ---------- Opciones para filtros (según mes) ---------- */
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

  /* ---------- Datos filtrados ---------- */
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

  /* ---------- Agrupaciones ---------- */
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

  /* ---------- Alturas dinámicas (scroll suave) ---------- */
  const hConsultores = Math.max(300, horasPorConsultor.length * 26);
  const hTareas      = Math.max(300, horasPorTarea.length * 26);
  const hClientes    = Math.max(300, horasPorCliente.length * 26);
  const hModulos     = Math.max(300, horasPorModulo.length * 26);

  /* ---------- Render ---------- */
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

        <select
          className="filtro-select"
          value={filtroTarea}
          onChange={(e) => setFiltroTarea(e.target.value)}
          title="Tipo de tarea"
        >
          <option value="">Todas las tareas</option>
          {tareasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className="filtro-select"
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          title="Cliente"
        >
          <option value="">Todos los clientes</option>
          {clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          className="filtro-select"
          value={filtroModulo}
          onChange={(e) => setFiltroModulo(e.target.value)}
          title="Módulo"
        >
          <option value="">Todos los módulos</option>
          {modulosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <input
          className="filtro-month"
          type="month"
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          title="Mes (YYYY-MM)"
        />

        <button
          className="btn btn-outline"
          onClick={() => {
            setFiltroTarea('');
            setFiltroCliente('');
            setFiltroModulo('');
            setFiltroMes('');
            setFiltroConsultor(isAdmin ? '' : (nombreUser || ''));
          }}
        >
          Limpiar
        </button>
      </div>

      
      <div className="pg-grid pg-grid--stack">

        {/* Horas por Consultor */}
        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Consultor' : 'Tus horas por Consultor'}
            {filtroMes && ` (${filtroMes})`}
          </h3>

          {horasPorConsultor.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hConsultores}>
                <BarChart
                  data={horasPorConsultor}
                  layout="vertical"
                  margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                  barCategoryGap={6}
                >
                  <BrandDefs id="gradConsultor" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="consultor"
                    width={yWidthFrom(horasPorConsultor, 'consultor')}
                    tick={renderYAxisTick}
                    interval={0}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="horas" name="Horas" fill="url(#gradConsultor)" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Tipo de Tarea */}
        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}
          </h3>

          {horasPorTarea.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hTareas}>
                <BarChart
                  data={horasPorTarea}
                  layout="vertical"
                  margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                  barCategoryGap={6}
                >
                  <BrandDefs id="gradTarea" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="tipoTarea"
                    width={yWidthFrom(horasPorTarea, 'tipoTarea')}
                    tick={renderYAxisTick}
                    interval={0}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="horas" name="Horas" fill="url(#gradTarea)" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Cliente */}
        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
            {filtroMes && ` (${filtroMes})`}
          </h3>

          {horasPorCliente.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hClientes}>
                <BarChart
                  data={horasPorCliente}
                  layout="vertical"
                  margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                  barCategoryGap={6}
                >
                  <BrandDefs id="gradCliente" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="cliente"
                    width={yWidthFrom(horasPorCliente, 'cliente')}
                    tick={renderYAxisTick}
                    interval={0}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="horas" name="Horas" fill="url(#gradCliente)" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horas por Módulo */}
        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Módulo' : 'Tus horas por Módulo'}
            {filtroMes && ` (${filtroMes})`}
          </h3>

          {horasPorModulo.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <div className="chart-scroll">
              <ResponsiveContainer width="100%" height={hModulos}>
                <BarChart
                  data={horasPorModulo}
                  layout="vertical"
                  margin={{ top: 10, right: 16, left: 8, bottom: 10 }}
                  barCategoryGap={6}
                >
                  <BrandDefs id="gradModulo" />
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="modulo"
                    width={yWidthFrom(horasPorModulo, 'modulo')}
                    tick={renderYAxisTick}
                    interval={0}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="horas" name="Horas" fill="url(#gradModulo)" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Graficos;

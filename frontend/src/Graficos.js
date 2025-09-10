import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts';
import './PanelGraficos.css';
import { jfetch } from './lib/api';

const asArray = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []);

// useBrandColors sin warnings
function useBrandColors() {
  const [colors, setColors] = useState({
    red: '#E30613',
    red700: '#b00510',
    blue: '#0055B8',
    blue700: '#024aa2'
  });

  useEffect(() => {
    try {
      const root = getComputedStyle(document.documentElement);
      const next = {
        red:     root.getPropertyValue('--brand-red')?.trim()       || '#E30613',
        red700:  root.getPropertyValue('--brand-red-700')?.trim()   || '#b00510',
        blue:    root.getPropertyValue('--brand-blue')?.trim()      || '#0055B8',
        blue700: root.getPropertyValue('--brand-blue-700')?.trim()  || '#024aa2'
      };
      setColors(prev =>
        prev.red === next.red &&
        prev.red700 === next.red700 &&
        prev.blue === next.blue &&
        prev.blue700 === next.blue700 ? prev : next
      );
    } catch {}
  }, []);

  return colors;
}

function BrandDefs({ red, blue }) {
  return (
    <defs>
      <linearGradient id="brandGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={blue} />
        <stop offset="100%" stopColor={red} />
      </linearGradient>
    </defs>
  );
}

// ===== Ticks multilínea =====
const splitByLength = (s, n) => {
  const out = [];
  let rest = String(s || '').trim();
  while (rest.length > n) {
    let cut = rest.lastIndexOf(' ', n);
    if (cut <= 0) cut = n;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
};

const MultiLineTick = ({ x, y, payload, maxLines = 2, lineLength = 16, breakAfterCode = false }) => {
  const raw = String(payload?.value ?? '');
  const hinted = breakAfterCode ? raw.replace(/^(\d+\s*-\s*)/, '$1\n') : raw;
  const lines = hinted
    .split('\n')
    .flatMap(piece => splitByLength(piece, lineLength))
    .slice(0, maxLines);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#6b7280" fontSize={12}>
        {lines.map((ln, i) => (
          <tspan key={i} x={0} dy={12}>{ln}</tspan>
        ))}
      </text>
    </g>
  );
};

const NameTick = (p) => <MultiLineTick {...p} lineLength={18} maxLines={2} />;
const TaskTick = (p) => <MultiLineTick {...p} lineLength={20} maxLines={2} breakAfterCode />;

const Graficos = () => {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const brand = useBrandColors();

  const user = useMemo(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('userData') || 'null') ||
        JSON.parse(localStorage.getItem('user') || 'null') ||
        {}
      );
    } catch { return {}; }
  }, []);
  const rol = String(user?.rol || user?.user?.rol || '').toUpperCase();
  const nombreUser = String(user?.nombre || user?.user?.nombre || '').trim();
  const isAdmin = rol === 'ADMIN';

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
      }
    };
    fetchRegistros();
  }, [isAdmin, nombreUser, rol]);

  const coincideMes = (fechaISO, mesFiltro) => {
    if (!mesFiltro) return true;
    const [y, m] = mesFiltro.split('-');
    return typeof fechaISO === 'string' && fechaISO.startsWith(`${y}-${m}`);
  };
  const toNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const datosFiltrados = useMemo(() => {
    return (registros ?? []).filter(r => {
      if (!coincideMes(r.fecha, filtroMes)) return false;
      if (filtroConsultor && r.consultor !== filtroConsultor) return false;
      if (filtroTarea && r.tipoTarea !== filtroTarea) return false;
      return true;
    });
  }, [registros, filtroMes, filtroConsultor, filtroTarea]);

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

  const hasConsultor = !!filtroConsultor;
  const hasTarea = !!filtroTarea;
  const getBarStyle = (section) => {
    if (hasConsultor && !hasTarea) {
      return { fill: brand.blue, stroke: brand.blue700 };
    }
    if (!hasConsultor && hasTarea) {
      return { fill: brand.red, stroke: brand.red700 };
    }
    if (hasConsultor && hasTarea) {
      if (section === 'consultor') return { fill: brand.blue, stroke: brand.blue700 };
      if (section === 'tarea') return { fill: brand.red, stroke: brand.red700 };
      return { fill: 'url(#brandGradient)', stroke: brand.blue700 };
    }
    return { fill: 'url(#brandGradient)', stroke: brand.blue700 };
  };

  const styleConsultor = getBarStyle('consultor');
  const styleTarea = getBarStyle('tarea');
  const styleCliente = getBarStyle('cliente');
  const styleModulo = getBarStyle('modulo');

  return (
    <div className="panel-graficos-container">
      {error && <div className="pg-error">Error al cargar datos: {error}</div>}

      <div className="filtros-globales">
        <select
          value={filtroConsultor}
          onChange={(e) => setFiltroConsultor(e.target.value)}
          disabled={!isAdmin}
        >
          {isAdmin && <option value="">Todos los consultores</option>}
          {consultoresUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filtroTarea} onChange={(e) => setFiltroTarea(e.target.value)}>
          <option value="">Todas las tareas</option>
          {tareasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} />

        <button
          className="btn btn-outline"
          onClick={() => {
            setFiltroTarea('');
            setFiltroMes('');
            setFiltroConsultor(isAdmin ? '' : (nombreUser || ''));
          }}
          title="Limpiar filtros"
        >
          Limpiar
        </button>
      </div>

      <div className="pg-grid">
        {/* 1) Consultor — ocupa toda la fila */}
        <div className="grafico-box" style={{ gridColumn: '1 / -1' }}>
          <h3>
            {isAdmin ? 'Horas por Consultor' : 'Tus horas por Consultor'}
            {filtroMes && ` (${filtroMes})`}
          </h3>
          {horasPorConsultor.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={horasPorConsultor} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={22}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="consultor" interval={0} tickMargin={10} height={48} tick={<NameTick />} />
                <YAxis />
                <Tooltip />
                <Legend />
                <ReferenceLine y={180} label="Meta" stroke={brand.red} strokeDasharray="3 3" />
                <Bar dataKey="horas" name="Horas" fill={styleConsultor.fill} stroke={styleConsultor.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 2) Tipo de tarea — ocupa toda la fila */}
        <div className="grafico-box" style={{ gridColumn: '1 / -1' }}>
          <h3>
            {isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}
            {filtroConsultor && ` — ${filtroConsultor}`}
          </h3>
          {horasPorTarea.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={horasPorTarea} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={22}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipoTarea" interval={0} tickMargin={10} height={58} tick={<TaskTick />} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="horas" name="Horas" fill={styleTarea.fill} stroke={styleTarea.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 3) Cliente — ocupa toda la fila */}
        <div className="grafico-box" style={{ gridColumn: '1 / -1' }}>
          <h3>
            {isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
            {filtroMes && ` (${filtroMes})`} {filtroConsultor && ` — ${filtroConsultor}`}
          </h3>
          {horasPorCliente.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={horasPorCliente} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={18}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cliente" interval={0} angle={-45} textAnchor="end" height={110} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="horas" name="Horas" fill={styleCliente.fill} stroke={styleCliente.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 4) Módulo — ocupa toda la fila */}
        <div className="grafico-box" style={{ gridColumn: '1 / -1' }}>
          <h3>
            {isAdmin ? 'Horas por Módulo' : 'Tus horas por Módulo'}
            {filtroMes && ` (${filtroMes})`}
          </h3>
          {horasPorModulo.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={horasPorModulo} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={18}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="modulo" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="horas" name="Horas" fill={styleModulo.fill} stroke={styleModulo.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default Graficos;

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import './PanelGraficos.css';
import { jfetch } from './lib/api';

const asArray = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []);


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
      const red     = root.getPropertyValue('--brand-red')?.trim()       || colors.red;
      const red700  = root.getPropertyValue('--brand-red-700')?.trim()   || colors.red700;
      const blue    = root.getPropertyValue('--brand-blue')?.trim()      || colors.blue;
      const blue700 = root.getPropertyValue('--brand-blue-700')?.trim()  || colors.blue700;
      setColors({ red, red700, blue, blue700 });
    } catch {}
  }, []);
  return colors;
}


const autoHeight = (rows, { base = 220, row = 28, min = 260, max = 900 } = {}) => {
  const h = base + Math.max(0, rows - 6) * row;
  return Math.min(Math.max(h, min), max);
};


const ellipsize = (s, n = 42) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};


const toNum = (v) => (Number.isFinite(+v) ? +v : 0);


function HorizontalBars({ title, data, labelKey, valueKey = 'horas', fill, stroke, minHeight = 260 }) {
  const height = autoHeight(data.length, { min: minHeight });
  return (
    <div className="grafico-box pg-no-scroll">
      <h3>{title}</h3>
      {data.length === 0 ? (
        <div className="empty">Sin datos para los filtros seleccionados.</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 16, right: 24, left: 12, bottom: 12 }}
            barCategoryGap={10}
          >
            <CartesianGrid strokeDasharray="3 3" />
            {/* Eje de categorías a la izquierda (etiqueta) */}
            <YAxis
              dataKey={labelKey}
              type="category"
              width={220}
              tickFormatter={ellipsize}
              tickLine={false}
              axisLine={false}
            />
            {/* Eje de valores abajo */}
            <XAxis type="number" tickCount={6} />
            <Tooltip
              formatter={(v) => [`${(+v).toFixed(2)} h`, 'Horas']}
              labelFormatter={(lbl) => String(lbl)}
            />
            <Legend />
            <Bar
              dataKey={valueKey}
              name="Horas"
              fill={fill}
              stroke={stroke}
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const Graficos = () => {
  const colors = useBrandColors();

  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');

  
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroMes, setFiltroMes] = useState(''); // YYYY-MM

  
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
    (async () => {
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
      } catch (e) {
        setRegistros([]);
        setError(String(e?.message || e));
        
        console.error('Error al cargar registros:', e);
      }
    })();
  }, [isAdmin, nombreUser, rol]);

  
  const consultoresUnicos = useMemo(() => {
    const set = new Set(registros.map(r => r.consultor).filter(Boolean));
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return isAdmin ? arr : (nombreUser ? [nombreUser] : arr);
  }, [registros, isAdmin, nombreUser]);

  const tareasUnicas = useMemo(() => {
    const set = new Set(registros.map(r => r.tipoTarea).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registros]);

  const clientesUnicos = useMemo(() => {
    const set = new Set(registros.map(r => r.cliente).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registros]);

  const modulosUnicos = useMemo(() => {
    const set = new Set(registros.map(r => r.modulo).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registros]);

  
  const coincideMes = (fechaISO, mes) => {
    if (!mes) return true;
    const [y, m] = mes.split('-');
    return typeof fechaISO === 'string' && fechaISO.startsWith(`${y}-${m}`);
  };

  
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

  
  const horasPorConsultor = useMemo(() => {
    const acc = new Map();
    datosFiltrados.forEach(r => {
      const k = r.consultor || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([consultor, horas]) => ({
      consultor, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorTarea = useMemo(() => {
    const acc = new Map();
    datosFiltrados.forEach(r => {
      const k = r.tipoTarea || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([tipoTarea, horas]) => ({
      tipoTarea, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorCliente = useMemo(() => {
    const acc = new Map();
    datosFiltrados.forEach(r => {
      const k = r.cliente || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([cliente, horas]) => ({
      cliente, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const horasPorModulo = useMemo(() => {
    const acc = new Map();
    datosFiltrados.forEach(r => {
      const k = r.modulo || '—';
      acc.set(k, (acc.get(k) || 0) + toNum(r.tiempoInvertido));
    });
    return Array.from(acc, ([modulo, horas]) => ({
      modulo, horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  return (
    <div className="panel-graficos-container">
      {error && <div className="pg-error">Error al cargar datos: {error}</div>}

      
      <div className="filtros-globales pg-sticky">
        <select
          value={filtroConsultor}
          onChange={(e) => setFiltroConsultor(e.target.value)}
          disabled={!isAdmin}
          aria-label="Consultor"
        >
          {isAdmin && <option value="">Todos los consultores</option>}
          {consultoresUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filtroTarea} onChange={(e) => setFiltroTarea(e.target.value)} aria-label="Tarea">
          <option value="">Todas las tareas</option>
          {tareasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} aria-label="Cliente">
          <option value="">Todos los clientes</option>
          {clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)} aria-label="Módulo">
          <option value="">Todos los módulos</option>
          {modulosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} />

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
        <HorizontalBars
          title={isAdmin ? 'Horas por Consultor' : 'Tus horas por Consultor'}
          data={horasPorConsultor}
          labelKey="consultor"
          fill="url(#brandGradient)" stroke={colors.blue700}
        />

        <HorizontalBars
          title={isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}
          data={horasPorTarea}
          labelKey="tipoTarea"
          fill={colors.red} stroke={colors.red700}
        />

        <HorizontalBars
          title={isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
          data={horasPorCliente}
          labelKey="cliente"
          fill="url(#brandGradient)" stroke={colors.blue700}
          minHeight={300}
        />

        <HorizontalBars
          title={isAdmin ? 'Horas por Módulo' : 'Tus horas por Módulo'}
          data={horasPorModulo}
          labelKey="modulo"
          fill="url(#brandGradient)" stroke={colors.blue700}
          minHeight={300}
        />
      </div>

      
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.red} />
            <stop offset="100%" stopColor={colors.blue} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

export default Graficos;

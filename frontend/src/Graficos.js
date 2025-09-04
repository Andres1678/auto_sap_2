import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer
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
      const red = root.getPropertyValue('--brand-red')?.trim() || colors.red;
      const red700 = root.getPropertyValue('--brand-red-700')?.trim() || colors.red700;
      const blue = root.getPropertyValue('--brand-blue')?.trim() || colors.blue;
      const blue700 = root.getPropertyValue('--brand-blue-700')?.trim() || colors.blue700;
      setColors({ red, red700, blue, blue700 });
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
        JSON.parse(localStorage.getItem('userData') || 'null') ??
        JSON.parse(localStorage.getItem('user') || 'null') ??
        {}
      );
    } catch {
      return {};
    }
  }, []);

  
  const raw = user?.user ?? user;
  const rol = String(raw?.rol || '').toUpperCase();
  const nombreUser = String(raw?.nombre || '').trim();
  const isAdmin = rol === 'ADMIN';

  useEffect(() => {
    const fetchRegistros = async () => {
      setError('');
      try {
        const isGET = isAdmin; 
        const res = await jfetch('/registros', {
          method: isGET ? 'GET' : 'POST',
          headers: {
            ...(isGET ? { 'X-User-Rol': 'ADMIN' } : {}),
            ...(nombreUser ? { 'X-User-Name': nombreUser } : {}),
          },
          ...(isGET ? {} : { body: JSON.stringify({ rol, nombre: nombreUser }) })
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

        const arr = asArray(json);
        setRegistros(arr);

        
        if (!isAdmin && nombreUser) {
          setFiltroConsultor(nombreUser);
        }
      } catch (err) {
        setRegistros([]);
        setError(String(err?.message || err));
        console.error('Error al cargar registros:', err);
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
      return { fill: brand.blue, stroke: brand.blue700, useGradient: false };
    }
    if (!hasConsultor && hasTarea) {
      return { fill: brand.red, stroke: brand.red700, useGradient: false };
    }
    if (hasConsultor && hasTarea) {
      if (section === 'consultor') return { fill: brand.blue, stroke: brand.blue700, useGradient: false };
      if (section === 'tarea') return { fill: brand.red, stroke: brand.red700, useGradient: false };
      return { fill: 'url(#brandGradient)', stroke: brand.blue700, useGradient: true };
    }
    return { fill: 'url(#brandGradient)', stroke: brand.blue700, useGradient: true };
  };

  const styleConsultor = getBarStyle('consultor');
  const styleTarea = getBarStyle('tarea');
  const styleCliente = getBarStyle('cliente');
  const styleModulo = getBarStyle('modulo');

  return (
    <div className="panel-graficos-container">
      {error && (
        <div className="pg-error">
          Error al cargar datos: {error}
        </div>
      )}

      {/* Filtros */}
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
            setFiltroConsultor(isAdmin ? '' : nombreUser || '');
          }}
          title="Limpiar filtros"
        >
          Limpiar
        </button>
      </div>

      {/* Grid de tarjetas */}
      <div className="pg-grid">
        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Consultor' : 'Tus horas por Consultor'}
            {filtroMes && ` (${filtroMes})`}
          </h3>
          {horasPorConsultor.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={horasPorConsultor} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={18}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="consultor" />
                <YAxis />
                <Tooltip />
                <Legend />
                <ReferenceLine y={180} label="Meta" stroke={brand.red} strokeDasharray="3 3" />
                <Bar dataKey="horas" name="Horas" fill={styleConsultor.fill} stroke={styleConsultor.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grafico-box">
          <h3>
            {isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}
            {filtroConsultor && ` — ${filtroConsultor}`}
          </h3>
          {horasPorTarea.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={horasPorTarea} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={18}>
                <BrandDefs red={brand.red} blue={brand.blue} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipoTarea" interval={0} angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="horas" name="Horas" fill={styleTarea.fill} stroke={styleTarea.stroke} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grafico-box" style={{ gridColumn: '1 / -1' }}>
          <h3>
            {isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
            {filtroMes && ` (${filtroMes})`} {filtroConsultor && ` — ${filtroConsultor}`}
          </h3>
          {horasPorCliente.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={horasPorCliente} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={16}>
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

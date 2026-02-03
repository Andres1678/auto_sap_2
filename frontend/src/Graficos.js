import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ReferenceLine
} from 'recharts';
import Modal from 'react-modal';
import './PanelGraficos.css';
import { jfetch } from './lib/api';

/* ======== config ======== */
const OPEN_ON_HOVER = false;
Modal.setAppElement('#root');

const HOLIDAYS = [
  // '2025-01-01', ...
];

/* ======== Helpers ======== */
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const coincideMes = (fechaISO, mesYYYYMM) => {
  if (!mesYYYYMM) return true;
  const [y, m] = mesYYYYMM.split('-');
  return typeof fechaISO === 'string' && fechaISO.startsWith(`${y}-${m}`);
};

const equipoOf = (r, fallback = 'SIN EQUIPO') =>
  (String(r?.equipo || '').trim().toUpperCase() || fallback);


function taskCodeFromTipo(t) {
  const s = String(t ?? '').trim();
  const m = s.match(/\b\d{1,2}\b/);
  if (!m) return '';
  return m[0].padStart(2, '0');
}

function ocupCodeFromRow(r) {
  
  const c = String(r?.ocupacion_codigo ?? '').trim();
  if (c) return String(c).padStart(2, '0');

  
  const name = String(r?.ocupacion_nombre ?? '').trim();
  const m = name.match(/\b\d{1,2}\b/);
  return m ? m[0].padStart(2, '0') : '';
}



function workdaysInMonth(year, month, holidays = []) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = dt.toISOString().slice(0, 10);
    if (holidays.includes(iso)) continue;
    count++;
  }
  return count;
}

/* ======== Medición texto + wrap ======== */
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
function yWidthFromPx(labels, { min = 120, max = 360, pad = 28, fontSize = 12, fontWeight = 400 } = {}) {
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

/* Gradiente marca */
const BrandDefs = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#E30613" />
      <stop offset="100%" stopColor="#0055B8" />
    </linearGradient>
  </defs>
);

/* Colores pie */
const PIE_COLORS = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#0ea5e9', '#e11d48', '#16a34a', '#ca8a04', '#6d28d9'
];

/* =========================================
   COMPONENTE MultiFiltro (chips tipo Gmail)
========================================= */
  function MultiFiltro({
    titulo,
    opciones,
    seleccion,
    onChange,
    placeholder = 'Todas',
    disabled = false,
  }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);

    // ✅ cerrar al click fuera
    useEffect(() => {
      if (!open) return;

      const handler = (e) => {
        if (!containerRef.current) return;
        if (!containerRef.current.contains(e.target)) setOpen(false);
      };

      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggleValue = (val) => {
      if (disabled) return;
      const exists = seleccion.includes(val);
      const next = exists
        ? seleccion.filter(v => v !== val)
        : [...seleccion, val];
      onChange(next);
    };

    const removeChip = (val) => {
      if (disabled) return;
      onChange(seleccion.filter(v => v !== val));
    };

    const lower = search.toLowerCase();
    const filtered = (opciones || []).filter(o =>
      o && String(o).toLowerCase().includes(lower)
    );

    const showPlaceholder = seleccion.length === 0;

  return (
    <div className="multi-filter" ref={containerRef}>
      {titulo && <span className="mf-label">{titulo}</span>}

      <button
        type="button"
        className={
          'mf-control' +
          (open ? ' is-open' : '') +
          (disabled ? ' is-disabled' : '')
        }
        onClick={() => { if (!disabled) setOpen(o => !o); }}
      >
        {showPlaceholder ? (
          <span className="mf-placeholder">{placeholder}</span>
        ) : (
          <div className="mf-chips">
            {seleccion.map(val => (
              <span key={val} className="mf-chip">
                <span>{val}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeChip(val); }}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <span className="mf-arrow">▾</span>
      </button>

      {open && !disabled && (
        <div
          className="mf-dropdown"
          onClick={(e) => e.stopPropagation()} // evita que burbujee al botón
        >
          <div className="mf-search">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mf-options">
            {filtered.length === 0 && (
              <div className="mf-option" style={{ fontStyle: 'italic', color: '#9ca3af' }}>
                Sin resultados
              </div>
            )}
            {filtered.map(val => (
              <label
                key={val}
                className="mf-option"
              >
                <input
                  type="checkbox"
                  checked={seleccion.includes(val)}
                  onChange={() => toggleValue(val)}
                />
                <span>{val}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= Componente principal ========= */
export default function Graficos() {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');

  // Filtros (multi valor)
  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroCliente, setFiltroCliente] = useState([]);
  const [filtroModulo, setFiltroModulo] = useState([]);
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroNroCliente, setFiltroNroCliente] = useState([]);
  const [filtroNroEscalado, setFiltroNroEscalado] = useState([]);
  const [filtroEquipo, setFiltroEquipo] = useState([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRows, setModalRows] = useState([]);
  const [modalTitle, setModalTitle] = useState('');

  /* Usuario / rol */
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

  const rolUpper   = String(user?.rol || user?.user?.rol || '').toUpperCase();
  const nombreUser = String(user?.nombre || user?.user?.nombre || '').trim();
  const equipoUser = String(user?.equipo || user?.user?.equipo || '').toUpperCase();
  const usuario    = String(user?.usuario || user?.user?.usuario || '').trim();

  const isAdminAll  = rolUpper === 'ADMIN';
  const isAdminLike = rolUpper.startsWith('ADMIN_');
  const isAdminGerentes = rolUpper === 'ADMIN_GERENTES';
  const [horariosBackend, setHorariosBackend] = useState([]);

  // ✅ scope SIEMPRE definido ANTES de usarse en cualquier otra cosa
  const scope = useMemo(() => {
    if (isAdminAll) return 'ALL';
    if (isAdminGerentes) return 'ALL';     // ellos ven todo
    if (isAdminLike) return 'TEAM';
    return 'SELF';
  }, [isAdminAll, isAdminGerentes, isAdminLike]);

  const isAdmin = scope !== 'SELF';

  /* Carga registros */
  useEffect(() => {
    const fetchRegistros = async () => {
      setError('');
      try {
        const res = await jfetch('/registros', {
          method: 'GET',
          headers: {
            'X-User-Rol': rolUpper,
            'X-User-Usuario': usuario,
            'X-User-Equipo': equipoUser,
            'X-View': 'PANEL',
          }
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

        setRegistros(Array.isArray(json) ? json : []);

        // inicialización según scope
        if (scope === 'SELF') {
          setFiltroConsultor(nombreUser ? [nombreUser] : []);
          setFiltroEquipo(equipoUser ? [equipoUser] : []);
        } else if (scope === 'TEAM') {
          setFiltroEquipo(equipoUser ? [equipoUser] : []);
          setFiltroConsultor([]);
        } else {
          setFiltroConsultor([]);
          setFiltroEquipo([]);
        }

      } catch (err) {
        setRegistros([]);
        setError(String(err?.message || err));
      }
    };

    fetchRegistros();
  }, [rolUpper, usuario, nombreUser, equipoUser, scope]);


  useEffect(() => {
    const fetchOcupaciones = async () => {
      try {
        const res = await jfetch('/horarios', { method: 'GET' });
        const json = await res.json();

        console.log("📌 Datos crudos de /horarios:", json);

        if (!Array.isArray(json)) {
          console.error("❌ /horarios no devolvió un array");
          setHorariosBackend([]);
          return;
        }

        // Transformación universal y segura
        const normalizados = json.map((o, idx) => ({
          codigo:
            o.codigo ??
            o.code ??
            o.cod ??
            o.id ??
            `COD-${idx}`,

          nombre:
            o.nombre ??
            o.name ??
            o.rango ??          
            o.descripcion ??
            o.title ??
            "SIN NOMBRE",

          value: Number(
            o.value ??
            o.porcentaje ??
            o.pct ??
            o.percent ??
            0
          ),

          horas: Number(
            o.horas ??
            o.total_horas ??
            o.time ??
            o.hours ??
            0
          ),

          ocupacion_id:
            o.ocupacion_id ??
            o.id ??
            o.codigo ??
            idx
        }));

        console.log("📌 Normalizado para gráficas:", normalizados);

        setHorariosBackend(normalizados);
      } catch (err) {
        console.error("❌ Error cargando /horarios:", err);
        setHorariosBackend([]);
      }
    };

    fetchOcupaciones();
  }, []);

  

  /* Opciones filtros */
  const consultoresUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.consultor)
    );
    const arr = Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return arr;
  }, [registros, filtroMes]);

  const tareasUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.tipoTarea)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const clientesUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.cliente)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const modulosUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.modulo)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const equiposUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => equipoOf(r))
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const nroClienteUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.nroCasoCliente)
    );
    return Array.from(set)
      .filter(v => (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0'))
      .map(v => String(v))
      .sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const nroEscaladoUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.nroCasoEscaladoSap)
    );
    return Array.from(set)
      .filter(v => (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0'))
      .map(v => String(v))
      .sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  /* Datos filtrados */
  /* Datos filtrados */
  const datosFiltrados = useMemo(() => {
    return (registros ?? []).filter((r) => {
      const eq = equipoOf(r);

      if (scope === 'SELF') {
        const u = String(usuario || '').trim().toLowerCase();
        const ru = String(r.usuario_consultor || '').trim().toLowerCase();

        if (u && ru && ru !== u) return false;
        if (equipoUser && eq !== equipoUser) return false;
      }

      if (scope === 'TEAM') {
        if (equipoUser && eq !== equipoUser) return false;
      }

      if (rolUpper === 'ADMIN_GERENTES') {
        const u = String(usuario || '').trim().toLowerCase();
        const ru = String(r.usuario_consultor || '').trim().toLowerCase();

        const esMioPorUsuario = u && ru && ru === u;

        const esMioPorNombre =
          String(r.consultor || '').trim().toLowerCase() ===
          String(nombreUser || '').trim().toLowerCase();

        const esMio = esMioPorUsuario || esMioPorNombre;

        if (!esMio) {
          const taskCode = taskCodeFromTipo(r.tipoTarea);
          const ocupCode = ocupCodeFromRow(r);

          if (taskCode !== '03') return false;
          if (ocupCode !== '02') return false;
        }
      }

      if (!coincideMes(r.fecha, filtroMes)) return false;

      if (filtroConsultor.length > 0 && !filtroConsultor.includes(r.consultor)) return false;
      if (filtroTarea.length > 0 && !filtroTarea.includes(r.tipoTarea)) return false;
      if (filtroCliente.length > 0 && !filtroCliente.includes(r.cliente)) return false;
      if (filtroModulo.length > 0 && !filtroModulo.includes(r.modulo)) return false;

      if (filtroEquipo.length > 0 && !filtroEquipo.includes(eq)) return false;

      if (filtroNroCliente.length > 0) {
        const val = String(r.nroCasoCliente || '');
        if (!filtroNroCliente.includes(val)) return false;
      }

      if (filtroNroEscalado.length > 0) {
        const val = String(r.nroCasoEscaladoSap || '');
        if (!filtroNroEscalado.includes(val)) return false;
      }

      return true;
    });
  }, [
    registros,
    filtroMes,
    filtroConsultor,
    filtroTarea,
    filtroCliente,
    filtroModulo,
    filtroEquipo,
    filtroNroCliente,
    filtroNroEscalado,
    scope,
    usuario,
    equipoUser,
    rolUpper,
    nombreUser
  ]);

  /* Agrupaciones */
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

  const horasPorDia = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach(r => {
      const fecha = r.fecha || '—';
      acc.set(fecha, (acc.get(fecha) || 0) + toNum(r.tiempoInvertido));
    });
    const arr = Array.from(acc, ([fecha, horas]) => {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? Number(fecha.slice(8, 10)) : 0;
      return { fecha, day, horas: +horas.toFixed(2) };
    });
    return arr.sort((a, b) => a.day - b.day);
  }, [datosFiltrados]);

  /* Pie (porcentaje por tarea) */
  const pieTareas = useMemo(() => {
    const total = horasPorTarea.reduce((s, r) => s + r.horas, 0);
    if (total <= 0) return [];
    return horasPorTarea.map((t) => ({
      name: t.tipoTarea,
      value: +((t.horas / total) * 100).toFixed(2),
      horas: t.horas
    }));
  }, [horasPorTarea]);

  const hConsultores = Math.max(320, horasPorConsultor.length * 30);
  const hTareas      = Math.max(320, horasPorTarea.length * 30);
  const hClientes    = Math.max(320, horasPorCliente.length * 30);
  const hModulos     = Math.max(320, horasPorModulo.length * 30);
  const hDias        = 380;

  const yWidthConsultor = yWidthFromPx(horasPorConsultor.map(d => d.consultor), { min: 140, max: 360, pad: 32 });
  const yWidthTarea     = yWidthFromPx(horasPorTarea.map(d => d.tipoTarea),     { min: 160, max: 380, pad: 32 });
  const yWidthCliente   = yWidthFromPx(horasPorCliente.map(d => d.cliente),     { min: 160, max: 380, pad: 32 });
  const yWidthModulo    = yWidthFromPx(horasPorModulo.map(d => d.modulo),       { min: 140, max: 360, pad: 32 });

  
  const filtroIncluyeOtros = useMemo(() => {
    if (rolUpper !== 'ADMIN_GERENTES') return false;
    if (!filtroConsultor || filtroConsultor.length === 0) return true;
    const me = String(nombreUser || '').trim().toLowerCase();
    return filtroConsultor.some(n => String(n || '').trim().toLowerCase() !== me);
  }, [rolUpper, filtroConsultor, nombreUser]);

  const tareasParaFiltro = useMemo(() => {
    if (rolUpper !== 'ADMIN_GERENTES') return tareasUnicos;
    if (!filtroIncluyeOtros) return tareasUnicos;
    return (tareasUnicos || []).filter(t => taskCodeFromTipo(t) === '03');
  }, [rolUpper, filtroIncluyeOtros, tareasUnicos]);

  useEffect(() => {
    if (!isAdminGerentes) return;

    if (filtroIncluyeOtros) {
      const opt = (tareasUnicos || []).find(t => taskCodeFromTipo(t) === '03');
      setFiltroTarea(opt ? [opt] : []);
    } else {
      setFiltroTarea([]);
    }
  }, [isAdminGerentes, filtroIncluyeOtros, tareasUnicos]);

  /* Modal helpers */
  const openDetail = (kind, value, pretty) => {
    let rows = [];
    if (kind === 'consultor') rows = datosFiltrados.filter(r => r.consultor === value);
    if (kind === 'tipoTarea') rows = datosFiltrados.filter(r => r.tipoTarea === value);
    if (kind === 'cliente')   rows = datosFiltrados.filter(r => r.cliente === value);
    if (kind === 'modulo')    rows = datosFiltrados.filter(r => r.modulo === value);
    if (kind === 'fecha')     rows = datosFiltrados.filter(r => r.fecha === value);

    rows = rows
      .slice()
      .sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));

    const total = rows.reduce((sum, r) => sum + toNum(r.tiempoInvertido), 0);

    setModalRows(rows);
    setModalTitle(`${pretty}: ${value} — Total: ${total.toFixed(2)} h`);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

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

  const metaMensual = useMemo(() => {
    if (!filtroMes) return null;
    const [y, m] = filtroMes.split('-').map(Number);
    const wd = workdaysInMonth(y, m, HOLIDAYS);
    return {
      diasHabiles: wd,
      limite: wd * 9
    };
  }, [filtroMes]);

  /* Horas por Ocupación */
  const horasPorOcupacion = useMemo(() => {
    const acc = new Map();

    (datosFiltrados ?? []).forEach(r => {
      const ocup = 
        r.ocupacion_nombre || 
        "SIN OCUPACIÓN";

      const horas = Number(r.tiempoInvertido) || 0;

      acc.set(ocup, (acc.get(ocup) || 0) + horas);
    });

    return Array.from(acc, ([ocupacion, horas]) => ({
      ocupacion,
      horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);





  // Porcentaje
  const pieOcupacion = useMemo(() => {
    const total = horasPorOcupacion.reduce((sum, r) => sum + r.horas, 0);

    if (total === 0) return [];

    return horasPorOcupacion.map(o => ({
      name: o.ocupacion,
      value: +(o.horas * 100 / total).toFixed(2),
      horas: o.horas
    }));
  }, [horasPorOcupacion]);


  /* ============================
     RENDER
  ============================ */

  const consultoresUnicosTeam = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .filter(r => !equipoUser || equipoOf(r) === equipoUser)
        .map(r => r.consultor)
    );
    return Array.from(set).filter(Boolean).sort((a,b) => a.localeCompare(b));
  }, [registros, filtroMes, equipoUser]);

  const consultoresParaFiltro =
    scope === 'ALL'  ? consultoresUnicos :
    scope === 'TEAM' ? consultoresUnicosTeam :
    (nombreUser ? [nombreUser] : []);

  return (
    <div className="panel-graficos-container">
      {error && (
        <div
          className="pg-error"
          style={{
            color: '#b00510',
            background: '#ffe6e8',
            border: '1px solid #f5c2c7',
            padding: '10px 12px',
            borderRadius: 10,
            maxWidth: 1100,
            width: '100%'
          }}
        >
          Error al cargar datos: {error}
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-globales pg-sticky">
        <MultiFiltro
          titulo="CONSULTORES"
          opciones={consultoresParaFiltro}
          seleccion={filtroConsultor}
          onChange={(scope === 'ALL' || scope === 'TEAM') ? setFiltroConsultor : () => {}}
          disabled={scope === 'SELF'}
          placeholder={
            scope === 'ALL' ? 'Todos los consultores' :
            scope === 'TEAM' ? 'Consultores del equipo' :
            (nombreUser || 'Tu usuario')
          }
        />

        <MultiFiltro
          titulo="TAREAS"
          opciones={tareasParaFiltro}
          seleccion={filtroTarea}
          onChange={(!isAdminGerentes || !filtroIncluyeOtros) ? setFiltroTarea : () => {}}
          disabled={isAdminGerentes && filtroIncluyeOtros}
          placeholder={
            (isAdminGerentes && filtroIncluyeOtros)
              ? '03 - Proyectos (fijo al ver otros)'
              : 'Todas las tareas'
          }
        />

        <MultiFiltro
          titulo="MÓDULOS"
          opciones={modulosUnicos}
          seleccion={filtroModulo}
          onChange={setFiltroModulo}
          placeholder="Todos los módulos"
        />

        <MultiFiltro
          titulo="CLIENTES"
          opciones={clientesUnicos}
          seleccion={filtroCliente}
          onChange={setFiltroCliente}
          placeholder="Todos los clientes"
        />

        <MultiFiltro
          titulo="Nro. CASO CLIENTE"
          opciones={nroClienteUnicos}
          seleccion={filtroNroCliente}
          onChange={setFiltroNroCliente}
          placeholder="Nro. Caso Cliente (todos)"
        />

        <MultiFiltro
          titulo="Nro. ESCALADO SAP"
          opciones={nroEscaladoUnicos}
          seleccion={filtroNroEscalado}
          onChange={setFiltroNroEscalado}
          placeholder="Nro. Escalado SAP (todos)"
        />

        <MultiFiltro
          titulo="EQUIPOS"
          opciones={scope === 'ALL' ? equiposUnicos : (equipoUser ? [equipoUser] : [])}
          seleccion={filtroEquipo}
          onChange={scope === 'ALL' ? setFiltroEquipo : () => {}}
          disabled={scope !== 'ALL'}
          placeholder={scope === 'ALL' ? 'Todos los equipos' : 'Tu equipo'}
        />


        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mf-label">MES</span>
          <input
            className="filtro-month"
            type="month"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            title="Mes (YYYY-MM)"
          />
        </div>

        <button
          className="btn btn-outline"
          onClick={() => {
            if (!isAdminGerentes) setFiltroTarea([]);
            setFiltroCliente([]);
            setFiltroModulo([]);
            setFiltroMes('');
            setFiltroNroCliente([]);
            setFiltroNroEscalado([]);

            if (scope === 'ALL') {
              setFiltroEquipo([]);
              setFiltroConsultor([]);
            } else if (scope === 'TEAM') {
              setFiltroEquipo(equipoUser ? [equipoUser] : []);
              setFiltroConsultor([]); // deja ver todo el equipo
            } else { // SELF
              setFiltroEquipo(equipoUser ? [equipoUser] : []);
              setFiltroConsultor(nombreUser ? [nombreUser] : []);
            }
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
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>

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
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="consultor"
                    width={yWidthConsultor}
                    tick={<WrapTickPx maxWidth={yWidthConsultor - 18} fontSize={12} />}
                  />
                  <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />

                  {metaMensual && (
                    <ReferenceLine
                      x={metaMensual.limite}
                      stroke="#ef4444"
                      strokeDasharray="6 6"
                      label={{
                        value: `Meta: ${metaMensual.limite.toFixed(0)} h (${metaMensual.diasHabiles} días)`,
                        position: 'top',
                        fill: '#ef4444',
                        fontSize: 12,
                        fontWeight: 700
                      }}
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
          <h3>{isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}</h3>

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
          <h3>
            {isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
            {filtroMes && ` (${filtroMes})`}
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>

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
          <h3>
            {isAdmin ? 'Horas por Módulo' : 'Tus horas por Módulo'}
            {filtroMes && ` (${filtroMes})`}
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>

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

        {/* Horas por Día */}
        <div className="grafico-box">
          <h3>
            Horas por Día (mes)
            {filtroMes && ` (${filtroMes})`}
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>

          {horasPorDia.length === 0 ? (
            <div className="empty">Sin datos para los filtros seleccionados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={hDias}>
              <BarChart
                data={horasPorDia}
                margin={{ top: 8, right: 24, left: 8, bottom: 16 }}
                barCategoryGap={6}
              >
                <BrandDefs id="gradDia" />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} />
                <YAxis />
                <Tooltip
                  formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0] && payload[0].payload?.fecha) {
                      return payload[0].payload.fecha;
                    }
                    return String(label);
                  }}
                />
                <Bar dataKey="horas" name="Horas" radius={[4,4,0,0]}>
                  {horasPorDia.map((entry, idx) => (
                    <Cell
                      key={`d-${entry.fecha}-${idx}`}
                      fill="url(#gradDia)"
                      onClick={() => openDetail('fecha', entry.fecha, 'Fecha')}
                      onMouseEnter={() => { if (OPEN_ON_HOVER) openDetail('fecha', entry.fecha, 'Fecha'); }}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Torta por Tipo de Tarea */}
        <div className="grafico-box">
          <h3>
            Distribución por Tipo de Tarea (%)
            {filtroMes && ` (${filtroMes})`}
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>
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

        {/* Torta por Ocupación */}
        <div className="grafico-box">
          <h3>
            Distribución por Ocupación (%)
            {filtroMes && ` (${filtroMes})`}
            {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
          </h3>

          {pieOcupacion.length === 0 ? (
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

                <Legend
                  formatter={(value, entry) =>
                    `${entry.payload.name} (${Number(entry.payload.horas).toFixed(2)} h)`
                  }
                />

                <Pie
                  data={pieOcupacion}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                >
                  {pieOcupacion.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
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
                      <span className="chip chip--accent">
                        <b>Subtotal:</b> {bucket.total.toFixed(2)} h
                      </span>
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
                          <th>Equipo</th>
                          <th>Inicio</th>
                          <th>Fin</th>
                          <th className="num">Horas</th>
                          <th>Nro. Caso Cliente</th>
                          <th>Horas adicionales</th>
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
                            <td className="truncate" title={equipoOf(r)}>{equipoOf(r)}</td>
                            <td>{r.horaInicio}</td>
                            <td>{r.horaFin}</td>
                            <td className="num">{toNum(r.tiempoInvertido).toFixed(2)}</td>
                            <td className="truncate" title={r.nroCasoCliente || ''}>{r.nroCasoCliente}</td>
                            <td className="truncate" title={r.horasAdicionales || 'N/D'}>
                              {r.horasAdicionales ?? 'N/D'}
                            </td>
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
      )}
    </div>
  );
}

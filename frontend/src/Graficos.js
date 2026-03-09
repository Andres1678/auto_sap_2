import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ReferenceLine
} from 'recharts';
import Modal from 'react-modal';
import './PanelGraficos.css';
import { jfetch } from './lib/api';
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

const OPEN_ON_HOVER = false;
Modal.setAppElement('#root');

const HOLIDAYS = [];

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const normTxt = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");

const inRangeISO = (fechaISO, desdeISO, hastaISO) => {
  if (!isISO(fechaISO)) return false;

  const d = isISO(desdeISO) ? desdeISO : null;
  const h = isISO(hastaISO) ? hastaISO : null;

  if (!d && !h) return true;
  if (d && !h) return fechaISO >= d;
  if (!d && h) return fechaISO <= h;
  return fechaISO >= d && fechaISO <= h;
};

const coincideMes = (fechaISO, mesYYYYMM) => {
  if (!mesYYYYMM) return true;
  const [y, m] = mesYYYYMM.split('-');
  return typeof fechaISO === 'string' && fechaISO.startsWith(`${y}-${m}`);
};

const equipoOf = (r, fallback = 'SIN EQUIPO') =>
  (String(r?.equipo || '').trim().toUpperCase() || fallback);

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

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d');

function _setFont({
  fontSize = 12,
  fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
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

const BrandDefs = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#E30613" />
      <stop offset="100%" stopColor="#0055B8" />
    </linearGradient>
  </defs>
);

const PIE_COLORS = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#0ea5e9', '#e11d48', '#16a34a', '#ca8a04', '#6d28d9'
];

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

  useEffect(() => {
    if (!open) return;

    const handler = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
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
    <div className="pgx-multi-filter" ref={containerRef}>
      {titulo && <span className="pgx-mf-label">{titulo}</span>}

      <button
        type="button"
        className={
          'pgx-mf-control' +
          (open ? ' is-open' : '') +
          (disabled ? ' is-disabled' : '')
        }
        onClick={() => { if (!disabled) setOpen(o => !o); }}
      >
        {showPlaceholder ? (
          <span className="pgx-mf-placeholder">{placeholder}</span>
        ) : (
          <div className="pgx-mf-chips">
            {seleccion.map(val => (
              <span key={val} className="pgx-mf-chip">
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
        <span className="pgx-mf-arrow">▾</span>
      </button>

      {open && !disabled && (
        <div
          className="pgx-mf-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pgx-mf-search">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pgx-mf-options">
            {filtered.length === 0 && (
              <div className="pgx-mf-option pgx-mf-option-empty">
                Sin resultados
              </div>
            )}
            {filtered.map(val => (
              <label key={val} className="pgx-mf-option">
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

export default function Graficos() {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroCliente, setFiltroCliente] = useState([]);
  const [filtroModulo, setFiltroModulo] = useState([]);
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroNroCliente, setFiltroNroCliente] = useState([]);
  const [filtroNroEscalado, setFiltroNroEscalado] = useState([]);
  const [filtroEquipo, setFiltroEquipo] = useState([]);
  const [ocupacionesCatalogo, setOcupacionesCatalogo] = useState([]);
  const [filtroOcupacion, setFiltroOcupacion] = useState([]);
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalRows, setModalRows] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [mapeosProyecto, setMapeosProyecto] = useState([]);
  const [proyectos, setProyectos] = useState([]);

  const navigate = useNavigate();
  const fetchAbortRef = useRef(null);

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

  const rolUpper = String(user?.rol || user?.user?.rol || '').toUpperCase();
  const nombreUser = String(user?.nombre || user?.user?.nombre || '').trim();
  const equipoUser = String(user?.equipo || user?.user?.equipo || '').toUpperCase();
  const usuario = String(user?.usuario || user?.user?.usuario || '').trim();

  const ADMIN_ALL_ROLES = new Set(['ADMIN', 'ADMIN_GERENTES']);
  const isAdminAll = ADMIN_ALL_ROLES.has(rolUpper);
  const isAdminLike = rolUpper.startsWith('ADMIN_');
  const isAdminTeam = !isAdminAll && isAdminLike && !!equipoUser;

  const scope = isAdminAll ? 'ALL' : (isAdminTeam ? 'TEAM' : 'SELF');
  const isAdmin = scope !== 'SELF';
  const canOpenProyectos = scope === 'ALL' || scope === 'TEAM';

  const fetchRegistros = useCallback(async () => {
    if (fetchAbortRef.current) {
      try { fetchAbortRef.current.abort(); } catch {}
    }

    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const res = await jfetch('/registros/graficos', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'X-User-Rol': rolUpper,
          'X-User-Usuario': usuario,
          'X-User-Equipo': equipoUser,
        }
      });

      const json = await res.json().catch(() => []);
      if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

      const arr = Array.isArray(json) ? json : [];
      setRegistros(arr);

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
      if (err?.name === 'AbortError') return;
      setRegistros([]);
      setError(String(err?.message || err));
      console.error('Error al cargar registros:', err);
    } finally {
      setLoading(false);
    }
  }, [rolUpper, usuario, nombreUser, equipoUser, scope]);

  useEffect(() => {
    if (!usuario) return;
    fetchRegistros();
    return () => {
      if (fetchAbortRef.current) {
        try { fetchAbortRef.current.abort(); } catch {}
      }
    };
  }, [fetchRegistros, usuario]);

  useEffect(() => {
    const cached = sessionStorage.getItem("pgx_ocupaciones_catalogo");
    if (cached) {
      try {
        setOcupacionesCatalogo(JSON.parse(cached));
      } catch {}
    }

    const fetchCatalogoOcupaciones = async () => {
      try {
        const res = await jfetch("/ocupaciones", { method: "GET" });
        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

        const ocus = Array.isArray(json) ? json : [];
        const labels = ocus
          .map((o) => {
            const codigo = String(o?.codigo ?? "").trim();
            const nombre = String(o?.nombre ?? "").trim();
            const label = [codigo, nombre].filter(Boolean).join(" - ");
            return label || null;
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        setOcupacionesCatalogo(labels);
        sessionStorage.setItem("pgx_ocupaciones_catalogo", JSON.stringify(labels));
      } catch (err) {
        console.error("Error cargando /ocupaciones:", err);
      }
    };

    if (!cached) fetchCatalogoOcupaciones();
  }, []);

  useEffect(() => {
    const fetchMapeos = async () => {
      try {
        const res = await jfetch("/proyecto-mapeos");
        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
        setMapeosProyecto(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error("Error cargando mapeos:", err);
        setMapeosProyecto([]);
      }
    };
    fetchMapeos();
  }, []);

  useEffect(() => {
    const fetchProyectos = async () => {
      try {
        const res = await jfetch("/proyectos", {
          method: "GET",
          headers: {
            "X-User-Rol": rolUpper,
            "X-User-Usuario": usuario,
            "X-User-Equipo": equipoUser,
          }
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

        setProyectos(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("Error cargando proyectos:", e);
        setProyectos([]);
      }
    };

    fetchProyectos();
  }, [rolUpper, usuario, equipoUser]);

  const proyectosByCodigo = useMemo(() => {
    const map = new Map();
    (proyectos || []).forEach((p) => {
      const codigo = normTxt(p.codigo);
      if (!codigo) return;
      map.set(codigo, p);
    });
    return map;
  }, [proyectos]);

  const proyectosById = useMemo(() => {
    const map = new Map();
    (proyectos || []).forEach((p) => {
      const id = Number(p.id);
      if (!id) return;
      map.set(id, p);
    });
    return map;
  }, [proyectos]);

  const mapeoOrigenToProyecto = useMemo(() => {
    const map = new Map();
    (mapeosProyecto || []).forEach((m) => {
      if (!m?.activo) return;

      const proyectoId = Number(m.proyecto_id);
      const origen = normTxt(m.valor_origen);

      if (!proyectoId || !origen) return;

      const proyecto = proyectosById.get(proyectoId);
      if (!proyecto) return;

      map.set(origen, proyecto);
    });

    return map;
  }, [mapeosProyecto, proyectosById]);

  const projectOfficialResolved = useCallback((r) => {
    const codigoDirecto = String(r?.proyecto_codigo || r?.proyecto?.codigo || "").trim();
    const nombreDirecto = String(r?.proyecto_nombre || r?.proyecto?.nombre || "").trim();

    if (codigoDirecto) {
      return `${codigoDirecto} - ${nombreDirecto || "SIN NOMBRE"}`;
    }

    const nroCaso = String(r?.nroCasoCliente || "").trim();
    const nroCasoNorm = normTxt(nroCaso);

    if (nroCasoNorm && proyectosByCodigo.has(nroCasoNorm)) {
      const p = proyectosByCodigo.get(nroCasoNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    if (nroCasoNorm && mapeoOrigenToProyecto.has(nroCasoNorm)) {
      const p = mapeoOrigenToProyecto.get(nroCasoNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    const descripcion = String(r?.descripcion || "").trim();
    const descripcionNorm = normTxt(descripcion);

    if (descripcionNorm && mapeoOrigenToProyecto.has(descripcionNorm)) {
      const p = mapeoOrigenToProyecto.get(descripcionNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    if (!nroCaso && !descripcion) return "SIN PROYECTO";
    return "NO MAPEADO";
  }, [proyectosByCodigo, mapeoOrigenToProyecto]);

  const consultoresUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter(r => coincideMes(r.fecha, filtroMes))
        .map(r => r.consultor)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
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

  const datosFiltrados = useMemo(() => {
    return (registros ?? []).filter(r => {
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

      if (!coincideMes(r.fecha, filtroMes)) return false;
      if (!inRangeISO(r.fecha, filtroDesde, filtroHasta)) return false;

      if (filtroOcupacion.length > 0) {
        const occLabel =
          (r.ocupacion_codigo && r.ocupacion_nombre)
            ? `${String(r.ocupacion_codigo).trim()} - ${String(r.ocupacion_nombre).trim()}`
            : (r.ocupacion_nombre ? String(r.ocupacion_nombre).trim() : "SIN OCUPACIÓN");

        if (!filtroOcupacion.includes(occLabel)) return false;
      }

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
    registros, filtroMes, filtroConsultor, filtroTarea, filtroCliente,
    filtroModulo, filtroEquipo, filtroNroCliente, filtroNroEscalado,
    scope, usuario, equipoUser, filtroOcupacion, filtroDesde, filtroHasta
  ]);

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

  const horasPorProyecto = useMemo(() => {
    const acc = new Map();
    (datosFiltrados ?? []).forEach((r) => {
      const key = projectOfficialResolved(r);
      acc.set(key, (acc.get(key) || 0) + toNum(r.tiempoInvertido));
    });

    return Array.from(acc, ([proyecto, horas]) => ({
      proyecto,
      horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados, projectOfficialResolved]);

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

  const horasPorOcupacion = useMemo(() => {
    const acc = new Map();

    (datosFiltrados ?? []).forEach(r => {
      const ocup =
        (r.ocupacion_codigo && r.ocupacion_nombre)
          ? `${r.ocupacion_codigo} - ${r.ocupacion_nombre}`
          : (r.ocupacion_nombre || "SIN OCUPACIÓN");

      const horas = Number(r.tiempoInvertido) || 0;
      acc.set(ocup, (acc.get(ocup) || 0) + horas);
    });

    return Array.from(acc, ([ocupacion, horas]) => ({
      ocupacion,
      horas: +horas.toFixed(2),
    })).sort((a, b) => b.horas - a.horas);
  }, [datosFiltrados]);

  const pieTareas = useMemo(() => {
    const total = horasPorTarea.reduce((s, r) => s + r.horas, 0);
    if (total <= 0) return [];
    return horasPorTarea.map((t) => ({
      name: t.tipoTarea,
      value: +((t.horas / total) * 100).toFixed(2),
      horas: t.horas
    }));
  }, [horasPorTarea]);

  const pieOcupacion = useMemo(() => {
    const total = horasPorOcupacion.reduce((sum, r) => sum + r.horas, 0);
    if (total === 0) return [];
    return horasPorOcupacion.map(o => ({
      name: o.ocupacion,
      value: +(o.horas * 100 / total).toFixed(2),
      horas: o.horas
    }));
  }, [horasPorOcupacion]);

  const hConsultores = Math.max(320, horasPorConsultor.length * 30);
  const hTareas = Math.max(320, horasPorTarea.length * 30);
  const hClientes = Math.max(320, horasPorCliente.length * 30);
  const hModulos = Math.max(320, horasPorModulo.length * 30);
  const hDias = 380;

  const yWidthConsultor = yWidthFromPx(horasPorConsultor.map(d => d.consultor), { min: 140, max: 360, pad: 32 });
  const yWidthTarea = yWidthFromPx(horasPorTarea.map(d => d.tipoTarea), { min: 160, max: 380, pad: 32 });
  const yWidthCliente = yWidthFromPx(horasPorCliente.map(d => d.cliente), { min: 160, max: 380, pad: 32 });
  const yWidthModulo = yWidthFromPx(horasPorModulo.map(d => d.modulo), { min: 140, max: 360, pad: 32 });

  const openDetail = (kind, value, pretty) => {
    let rows = [];
    if (kind === 'consultor') rows = datosFiltrados.filter(r => r.consultor === value);
    if (kind === 'tipoTarea') rows = datosFiltrados.filter(r => r.tipoTarea === value);
    if (kind === 'cliente') rows = datosFiltrados.filter(r => r.cliente === value);
    if (kind === 'modulo') rows = datosFiltrados.filter(r => r.modulo === value);
    if (kind === 'fecha') rows = datosFiltrados.filter(r => r.fecha === value);

    rows = rows
      .slice()
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

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
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
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
    scope === 'ALL' ? consultoresUnicos :
    scope === 'TEAM' ? consultoresUnicosTeam :
    (nombreUser ? [nombreUser] : []);

  return (
    <div className="pgx-scope">
      <div className="pgx-container">
        {error && (
          <div className="pgx-error">
            Error al cargar datos: {error}
          </div>
        )}

        <div className="pgx-filtros pgx-sticky">
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

          <MultiFiltro titulo="TAREAS" opciones={tareasUnicos} seleccion={filtroTarea} onChange={setFiltroTarea} placeholder="Todas las tareas" />
          <MultiFiltro titulo="MÓDULOS" opciones={modulosUnicos} seleccion={filtroModulo} onChange={setFiltroModulo} placeholder="Todos los módulos" />
          <MultiFiltro titulo="CLIENTES" opciones={clientesUnicos} seleccion={filtroCliente} onChange={setFiltroCliente} placeholder="Todos los clientes" />
          <MultiFiltro titulo="OCUPACIONES" opciones={ocupacionesCatalogo} seleccion={filtroOcupacion} onChange={setFiltroOcupacion} placeholder="Todas las ocupaciones" />
          <MultiFiltro titulo="Nro. CASO CLIENTE" opciones={nroClienteUnicos} seleccion={filtroNroCliente} onChange={setFiltroNroCliente} placeholder="Nro. Caso Cliente (todos)" />
          <MultiFiltro titulo="Nro. ESCALADO SAP" opciones={nroEscaladoUnicos} seleccion={filtroNroEscalado} onChange={setFiltroNroEscalado} placeholder="Nro. Escalado SAP (todos)" />

          <MultiFiltro
            titulo="EQUIPOS"
            opciones={scope === 'ALL' ? equiposUnicos : (equipoUser ? [equipoUser] : [])}
            seleccion={filtroEquipo}
            onChange={scope === 'ALL' ? setFiltroEquipo : () => {}}
            disabled={scope !== 'ALL'}
            placeholder={scope === 'ALL' ? 'Todos los equipos' : 'Tu equipo'}
          />

          <div className="pgx-field">
            <span className="pgx-mf-label">MES</span>
            <input
              className="pgx-input-month"
              type="month"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
            />
          </div>

          <div className="pgx-range-days">
            <span className="pgx-mf-label">RANGO DE DÍAS</span>
            <div className="pgx-range-days-row">
              <input
                className="pgx-input-date"
                type="date"
                value={filtroDesde}
                onChange={(e) => { setFiltroDesde(e.target.value); setFiltroMes(""); }}
              />
              <span className="pgx-range-sep">a</span>
              <input
                className="pgx-input-date"
                type="date"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className={"pgx-btn pgx-btn-outline" + (!canOpenProyectos ? " is-disabled" : "")}
            disabled={!canOpenProyectos}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.blur();

              if (!canOpenProyectos) {
                Swal.fire({
                  icon: "warning",
                  title: "Acceso restringido",
                  text: "Solo ADMIN o ADMIN por equipo pueden abrir el reporte de Proyectos.",
                });
                return;
              }

              navigate("/proyectos-horas", {
                state: {
                  userData: user,
                  defaultMonth: filtroMes,
                },
              });
            }}
          >
            Proyectos
          </button>

          <button
            className="pgx-btn pgx-btn-outline"
            onClick={() => {
              setFiltroTarea([]);
              setFiltroCliente([]);
              setFiltroModulo([]);
              setFiltroMes('');
              setFiltroNroCliente([]);
              setFiltroNroEscalado([]);
              setFiltroOcupacion([]);
              setFiltroDesde("");
              setFiltroHasta("");

              if (scope === 'ALL') {
                setFiltroEquipo([]);
                setFiltroConsultor([]);
              } else if (scope === 'TEAM') {
                setFiltroEquipo(equipoUser ? [equipoUser] : []);
                setFiltroConsultor([]);
              } else {
                setFiltroEquipo(equipoUser ? [equipoUser] : []);
                setFiltroConsultor(nombreUser ? [nombreUser] : []);
              }
            }}
          >
            Limpiar
          </button>

          <button
            type="button"
            className="pgx-btn pgx-btn-outline"
            onClick={() => { setFiltroDesde(""); setFiltroHasta(""); }}
          >
            Limpiar rango
          </button>
        </div>

        {loading && (
          <div className="pgx-loading">
            Cargando información...
          </div>
        )}

        <div className="pgx-grid pgx-grid-stack">
          <div className="pgx-card">
            <h3>
              {isAdmin ? 'Horas por Consultor' : 'Tus horas por Consultor'}
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>

            {horasPorConsultor.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <div className="pgx-chart-scroll">
                <ResponsiveContainer width="100%" height={hConsultores}>
                  <BarChart data={horasPorConsultor} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12} barSize={20}>
                    <BrandDefs id="pgx-gradConsultor" />
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="consultor" width={yWidthConsultor} tick={<WrapTickPx maxWidth={yWidthConsultor - 18} fontSize={12} />} />
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
                          fill="url(#pgx-gradConsultor)"
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

          <div className="pgx-card">
            <h3>{isAdmin ? 'Horas por Tipo de Tarea' : 'Tus horas por Tipo de Tarea'}</h3>
            {horasPorTarea.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <div className="pgx-chart-scroll">
                <ResponsiveContainer width="100%" height={hTareas}>
                  <BarChart data={horasPorTarea} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12} barSize={20}>
                    <BrandDefs id="pgx-gradTarea" />
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="tipoTarea" width={yWidthTarea} tick={<WrapTickPx maxWidth={yWidthTarea - 18} fontSize={12} />} />
                    <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                    <Bar dataKey="horas" name="Horas">
                      {horasPorTarea.map((entry, idx) => (
                        <Cell
                          key={`t-${idx}`}
                          fill="url(#pgx-gradTarea)"
                          onClick={() => openDetail('tipoTarea', entry.tipoTarea, 'Tipo de Tarea')}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              {isAdmin ? 'Horas por Cliente' : 'Tus horas por Cliente'}
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>
            {horasPorCliente.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <div className="pgx-chart-scroll">
                <ResponsiveContainer width="100%" height={hClientes}>
                  <BarChart data={horasPorCliente} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12} barSize={20}>
                    <BrandDefs id="pgx-gradCliente" />
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="cliente" width={yWidthCliente} tick={<WrapTickPx maxWidth={yWidthCliente - 18} fontSize={12} />} />
                    <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                    <Bar dataKey="horas" name="Horas">
                      {horasPorCliente.map((entry, idx) => (
                        <Cell
                          key={`cli-${idx}`}
                          fill="url(#pgx-gradCliente)"
                          onClick={() => openDetail('cliente', entry.cliente, 'Cliente')}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              {isAdmin ? 'Horas por Módulo' : 'Tus horas por Módulo'}
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>
            {horasPorModulo.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <div className="pgx-chart-scroll">
                <ResponsiveContainer width="100%" height={hModulos}>
                  <BarChart data={horasPorModulo} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12} barSize={20}>
                    <BrandDefs id="pgx-gradModulo" />
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="modulo" width={yWidthModulo} tick={<WrapTickPx maxWidth={yWidthModulo - 18} fontSize={12} />} />
                    <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                    <Bar dataKey="horas" name="Horas">
                      {horasPorModulo.map((entry, idx) => (
                        <Cell
                          key={`m-${idx}`}
                          fill="url(#pgx-gradModulo)"
                          onClick={() => openDetail('modulo', entry.modulo, 'Módulo')}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              {isAdmin ? 'Horas por Proyecto' : 'Tus horas por Proyecto'}
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>

            {horasPorProyecto.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <div className="pgx-chart-scroll">
                <ResponsiveContainer width="100%" height={Math.max(320, horasPorProyecto.length * 30)}>
                  <BarChart data={horasPorProyecto} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12} barSize={20}>
                    <BrandDefs id="pgx-gradProyecto" />
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="proyecto" width={360} tick={<WrapTickPx maxWidth={340} fontSize={12} />} />
                    <Tooltip formatter={(v)=> [`${Number(v).toFixed(2)} h`, 'Horas']} />
                    <Bar dataKey="horas" name="Horas">
                      {horasPorProyecto.map((entry, idx) => (
                        <Cell key={`p-${idx}`} fill="url(#pgx-gradProyecto)" style={{ cursor: 'pointer' }} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              Horas por Día (mes)
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>
            {horasPorDia.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
            ) : (
              <ResponsiveContainer width="100%" height={hDias}>
                <BarChart data={horasPorDia} margin={{ top: 8, right: 24, left: 8, bottom: 16 }} barCategoryGap={6}>
                  <BrandDefs id="pgx-gradDia" />
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
                        fill="url(#pgx-gradDia)"
                        onClick={() => openDetail('fecha', entry.fecha, 'Fecha')}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              Distribución por Tipo de Tarea (%)
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>
            {pieTareas.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
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
                  <Pie data={pieTareas} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={2} isAnimationActive>
                    {pieTareas.map((entry, index) => (
                      <Cell key={`slice-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="pgx-card">
            <h3>
              Distribución por Ocupación (%)
              {filtroMes && ` (${filtroMes})`}
              {filtroEquipo.length > 0 && ` — Equipo: ${filtroEquipo.join(', ')}`}
            </h3>

            {pieOcupacion.length === 0 ? (
              <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
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
                  <Pie data={pieOcupacion} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={2}>
                    {pieOcupacion.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <Modal
          isOpen={modalOpen}
          onRequestClose={closeModal}
          className="pgx-modal-content"
          overlayClassName="pgx-modal-overlay"
          bodyOpenClassName="pgx-modal-body-open"
          htmlOpenClassName="pgx-modal-html-open"
          contentLabel="Detalle de barra"
          shouldCloseOnOverlayClick
          shouldCloseOnEsc
        >
          <div className="pgx-modal-header pgx-modal-header-gradient">
            <h3 className="pgx-modal-title">{modalTitle || 'Detalle'}</h3>
            <button className="pgx-close-button" onClick={closeModal} aria-label="Cerrar">✖</button>
          </div>

          <div className="pgx-modal-body pgx-modal-body-scroll">
            {modalSubtotales.length === 0 ? (
              <div className="pgx-empty">Sin registros para mostrar.</div>
            ) : (
              modalSubtotales.map((bucket) => (
                <details key={bucket.fecha} className="pgx-day-accordion" open>
                  <summary className="pgx-day-accordion-summary">
                    <div className="pgx-day-accordion-title">
                      <span className="pgx-badge-date">{bucket.fecha}</span>
                    </div>
                    <div className="pgx-day-accordion-meta">
                      <span className="pgx-chip">{bucket.rows.length} reg.</span>
                      <span className="pgx-chip pgx-chip-accent">
                        <b>Subtotal:</b> {bucket.total.toFixed(2)} h
                      </span>
                    </div>
                  </summary>

                  <div className="pgx-table-responsive">
                    <table className="pgx-detail-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Consultor</th>
                          <th>Cliente</th>
                          <th>Tarea</th>
                          <th>Módulo</th>
                          <th>Equipo</th>
                          <th>Inicio</th>
                          <th>Fin</th>
                          <th className="pgx-num">Horas</th>
                          <th>Nro. Caso Cliente</th>
                          <th>Horas adicionales</th>
                          <th>Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="pgx-num">{r.id ?? r.registro_id ?? r.id_registro ?? r.ID ?? '—'}</td>
                            <td className="pgx-truncate" title={r.consultor}>{r.consultor}</td>
                            <td className="pgx-truncate" title={r.cliente}>{r.cliente}</td>
                            <td className="pgx-truncate" title={r.tipoTarea}>{r.tipoTarea}</td>
                            <td className="pgx-truncate" title={r.modulo}>{r.modulo}</td>
                            <td className="pgx-truncate" title={equipoOf(r)}>{equipoOf(r)}</td>
                            <td>{r.horaInicio}</td>
                            <td>{r.horaFin}</td>
                            <td className="pgx-num">{toNum(r.tiempoInvertido).toFixed(2)}</td>
                            <td className="pgx-truncate" title={r.nroCasoCliente || ''}>{r.nroCasoCliente}</td>
                            <td className="pgx-truncate" title={r.horasAdicionales || 'N/D'}>{r.horasAdicionales ?? 'N/D'}</td>
                            <td className="pgx-truncate" title={r.descripcion || ''}>{r.descripcion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))
            )}
          </div>

          <div className="pgx-modal-footer-total">
            <span className="pgx-chip pgx-chip-ghost">Filas: {modalRows.length}</span>
            <span className="pgx-spacer" />
            <strong>
              Total general:&nbsp;
              {modalRows.reduce((s,r)=>s+toNum(r.tiempoInvertido),0).toFixed(2)} h
            </strong>
          </div>
        </Modal>
      </div>
    </div>
  );
}
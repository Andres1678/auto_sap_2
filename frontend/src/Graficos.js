import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Modal from 'react-modal';
import './PanelGraficos.css';
import { jfetch } from './lib/api';
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

import HorasPorConsultorChart from './GraficosOperacion/HorasPorConsultorChart';
import HorasPorTareaChart from './GraficosOperacion/HorasPorTareaChart';
import HorasPorClienteChart from './GraficosOperacion/HorasPorClienteChart';
import HorasPorModuloChart from './GraficosOperacion/HorasPorModuloChart';
import HorasPorProyectoChart from './GraficosOperacion/HorasPorProyectoChart';
import HorasPorDiaChart from './GraficosOperacion/HorasPorDiaChart';
import PieTareasChart from './GraficosOperacion/PieTareasChart';
import PieOcupacionChart from './GraficosOperacion/PieOcupacionChart';

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

function MultiFiltro({
  titulo,
  opciones = [],
  seleccion = [],
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

  const lower = search.toLowerCase();

  const filtered = (opciones || []).filter((o) =>
    o && String(o).toLowerCase().includes(lower)
  );

  const toggleValue = (val) => {
    if (disabled) return;

    const exists = seleccion.includes(val);
    const next = exists
      ? seleccion.filter((v) => v !== val)
      : [...seleccion, val];

    onChange(next);
  };

  const removeChip = (val) => {
    if (disabled) return;
    onChange(seleccion.filter((v) => v !== val));
  };

  const handleSelectAll = (e) => {
    e.stopPropagation();
    if (disabled) return;

    const base = new Set(seleccion);
    filtered.forEach((val) => base.add(val));
    onChange(Array.from(base));
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange([]);
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((val) => seleccion.includes(val));

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
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        {showPlaceholder ? (
          <span className="pgx-mf-placeholder">{placeholder}</span>
        ) : (
          <div className="pgx-mf-chips">
            {seleccion.map((val) => (
              <span key={val} className="pgx-mf-chip">
                <span>{val}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeChip(val);
                    }}
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

          <div className="pgx-mf-actions">
            <button
              type="button"
              className="pgx-mf-action-btn"
              onClick={handleSelectAll}
              disabled={filtered.length === 0 || allFilteredSelected}
            >
              Seleccionar todo
            </button>

            <button
              type="button"
              className="pgx-mf-action-btn pgx-mf-action-btn-clear"
              onClick={handleClearAll}
              disabled={seleccion.length === 0}
            >
              Quitar selección
            </button>
          </div>

          <div className="pgx-mf-options">
            {filtered.length === 0 && (
              <div className="pgx-mf-option pgx-mf-option-empty">
                Sin resultados
              </div>
            )}

            {filtered.map((val) => (
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
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [filtroMes, setFiltroMes] = useState(currentMonth);
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

  const GRAFICOS_ALL_ROLES = new Set([
    'ADMIN',
    'ADMIN_GERENTES',
    'ADMIN_GESTION_PREVENTA',
    'ADMIN_OPORTUNIDADES',
  ]);

  const PROYECTOS_ALLOWED_ROLES = new Set([
    'ADMIN',
    'ADMIN_GERENTES',
  ]);

  const isAdminAll = GRAFICOS_ALL_ROLES.has(rolUpper);
  const isAdminLike = rolUpper.startsWith('ADMIN_');
  const isAdminTeam = !isAdminAll && isAdminLike && !!equipoUser;

  const scope = isAdminAll ? 'ALL' : (isAdminTeam ? 'TEAM' : 'SELF');
  const isAdmin = scope !== 'SELF';
  const canOpenProyectos = PROYECTOS_ALLOWED_ROLES.has(rolUpper) || scope === 'TEAM';

  const fetchRegistros = useCallback(async () => {
    if (fetchAbortRef.current) {
      try { fetchAbortRef.current.abort(); } catch {}
    }

    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('max_rows', '2000');

      if (filtroMes) {
        params.set('mes', filtroMes);
      } else {
        if (filtroDesde) params.set('desde', filtroDesde);
        if (filtroHasta) params.set('hasta', filtroHasta);
      }

      const res = await jfetch(`/registros/graficos?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'X-User-Rol': rolUpper,
          'X-User-Usuario': usuario,
          'X-User-Equipo': equipoUser,
        }
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Respuesta error /registros/graficos:", json);
        throw new Error(
          json?.detalle ||
          json?.error ||
          json?.mensaje ||
          `HTTP ${res.status}`
        );
      }

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
  }, [rolUpper, usuario, nombreUser, equipoUser, scope, filtroMes, filtroDesde, filtroHasta]);

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

  const registrosBase = useMemo(() => {
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

      return true;
    });
  }, [registros, scope, usuario, equipoUser, filtroMes, filtroDesde, filtroHasta]);

  const consultoresUnicos = useMemo(() => {
    const set = new Set((registrosBase ?? []).map(r => r.consultor));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosBase]);

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
    return (registrosBase ?? []).filter(r => {
      const eq = equipoOf(r);

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
    registrosBase,
    filtroOcupacion,
    filtroConsultor,
    filtroTarea,
    filtroCliente,
    filtroModulo,
    filtroEquipo,
    filtroNroCliente,
    filtroNroEscalado
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

  const pieTareasData = useMemo(() => {
    const totalHoras = horasPorTarea.reduce((s, r) => s + r.horas, 0);
    if (totalHoras <= 0) {
      return {
        chartData: [],
        otrosDetalle: [],
        totalHoras: 0,
      };
    }

    const base = horasPorTarea.map((t) => ({
      name: t.tipoTarea,
      horas: +t.horas.toFixed(2),
      value: +((t.horas / totalHoras) * 100).toFixed(2),
    }));

    const MAX_SEGMENTOS = 8;
    const ordenado = [...base].sort((a, b) => b.horas - a.horas);
    const visibles = ordenado.slice(0, MAX_SEGMENTOS);
    const resto = ordenado.slice(MAX_SEGMENTOS);

    if (resto.length > 0) {
      visibles.push({
        name: "Otros",
        horas: +resto.reduce((s, r) => s + r.horas, 0).toFixed(2),
        value: +resto.reduce((s, r) => s + r.value, 0).toFixed(2),
        isOthers: true,
      });
    }

    return {
      chartData: visibles,
      otrosDetalle: resto,
      totalHoras,
    };
  }, [horasPorTarea]);

  const pieTareas = pieTareasData.chartData;
  const otrosTareasDetalle = pieTareasData.otrosDetalle;

  const totalHorasPieTareas = useMemo(
    () => pieTareasData.totalHoras,
    [pieTareasData]
  );

  const pieOcupacion = useMemo(() => {
    const total = horasPorOcupacion.reduce((sum, r) => sum + r.horas, 0);
    if (total === 0) return [];
    return horasPorOcupacion.map(o => ({
      name: o.ocupacion,
      value: +(o.horas * 100 / total).toFixed(2),
      horas: o.horas
    }));
  }, [horasPorOcupacion]);

  const totalHorasPieOcupacion = useMemo(
    () => pieOcupacion.reduce((s, r) => s + r.horas, 0),
    [pieOcupacion]
  );

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

          <MultiFiltro
            titulo="TAREAS"
            opciones={tareasUnicos}
            seleccion={filtroTarea}
            onChange={setFiltroTarea}
            placeholder="Todas las tareas"
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
            titulo="OCUPACIONES"
            opciones={ocupacionesCatalogo}
            seleccion={filtroOcupacion}
            onChange={setFiltroOcupacion}
            placeholder="Todas las ocupaciones"
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

          <div className="pgx-field">
            <span className="pgx-mf-label">MES</span>
            <input
              className="pgx-input-month"
              type="month"
              value={filtroMes}
              onChange={(e) => {
                setFiltroMes(e.target.value);
                setFiltroDesde("");
                setFiltroHasta("");
              }}
            />
          </div>

          <div className="pgx-range-days">
            <span className="pgx-mf-label">RANGO DE DÍAS</span>
            <div className="pgx-range-days-row">
              <input
                className="pgx-input-date"
                type="date"
                value={filtroDesde}
                onChange={(e) => {
                  setFiltroDesde(e.target.value);
                  setFiltroMes("");
                }}
              />
              <span className="pgx-range-sep">a</span>
              <input
                className="pgx-input-date"
                type="date"
                value={filtroHasta}
                onChange={(e) => {
                  setFiltroHasta(e.target.value);
                  setFiltroMes("");
                }}
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
          <PieOcupacionChart
            data={pieOcupacion}
            totalHoras={totalHorasPieOcupacion}
            filtroMes={filtroMes}
            filtroEquipo={filtroEquipo}
          />

          <PieTareasChart
            data={pieTareas}
            otrosDetalle={otrosTareasDetalle}
            totalHoras={totalHorasPieTareas}
            filtroMes={filtroMes}
            filtroEquipo={filtroEquipo}
          />

          <div className="pgx-chart-mono">
            <HorasPorConsultorChart
              data={horasPorConsultor}
              isAdmin={isAdmin}
              filtroMes={filtroMes}
              filtroEquipo={filtroEquipo}
              metaMensual={metaMensual}
              onOpenDetail={openDetail}
            />
          </div>

          <div className="pgx-chart-mono">
            <HorasPorTareaChart
              data={horasPorTarea}
              isAdmin={isAdmin}
              onOpenDetail={openDetail}
            />
          </div>

          <div className="pgx-chart-mono">
            <HorasPorClienteChart
              data={horasPorCliente}
              isAdmin={isAdmin}
              filtroMes={filtroMes}
              filtroEquipo={filtroEquipo}
              onOpenDetail={openDetail}
            />
          </div>

          <div className="pgx-chart-mono">
            <HorasPorModuloChart
              data={horasPorModulo}
              isAdmin={isAdmin}
              filtroMes={filtroMes}
              filtroEquipo={filtroEquipo}
              onOpenDetail={openDetail}
            />
          </div>

          <div className="pgx-chart-mono">
            <HorasPorProyectoChart
              data={horasPorProyecto}
              isAdmin={isAdmin}
              filtroMes={filtroMes}
              filtroEquipo={filtroEquipo}
            />
          </div>

          <div className="pgx-chart-mono">
            <HorasPorDiaChart
              data={horasPorDia}
              filtroMes={filtroMes}
              filtroEquipo={filtroEquipo}
              onOpenDetail={openDetail}
            />
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
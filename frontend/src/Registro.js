import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import './Registro.css';
import { jfetch } from './lib/api';
import Resumen from './Resumen';
import { exportRegistrosExcelXLSX_ALL } from "./lib/exportExcel";
import CapacidadSemanalModal from "./CapacidadSemanalModal";
import { Navigate } from "react-router-dom";

Modal.setAppElement('#root');

function initRegistro() {
  return {
    id: null,
    fecha: '',
    cliente: '',
    nroCasoCliente: '',
    nroCasoInterno: '',
    nroCasoEscaladoSap: '',
    horaInicio: '',
    horaFin: '',
    tiempoInvertido: 0,
    actividadMalla: '',
    tiempoFacturable: '',
    horasAdicionales: '',
    oncall: '',
    desborde: '',
    descripcion: '',
    totalHoras: 0,
    modulo: '',
    equipo: '',
    proyecto_id: '',
    proyecto_codigo: '',
    proyecto_nombre: '',
    proyecto_fase: '',
    fase_proyecto_id: '',
    tarea_id: '',
    ocupacion_id: '',
  };
}

const CLIENTE_RESTRINGIDO = 'HITSS/CLARO';
const OCCUPATIONS_FORBID_HITSS = new Set(['01', '02', '06']);
const CODES_RESTRICTED_CLIENT_9H = new Set(['09', '13', '14', '15']);
const CODE_SUPERVISION_EQUIPO = '06';
const OCCUPATIONS_ONLY_HITSS = new Set(['03']);

const parseHHMM = (s) => {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
};

const toMinutes = ({ h, m }) => h * 60 + m;

const parseRange = (range) => {
  if (!range || typeof range !== 'string' || !/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(range)) return null;
  const [ini, fin] = range.split('-').map(x => x.trim());
  const a = parseHHMM(ini);
  const b = parseHHMM(fin);
  if (!a || !b) return null;
  return { ini: a, fin: b };
};

const toRangeMinutes = (ini, fin) => {
  const a = parseHHMM(ini);
  const b = parseHHMM(fin);
  if (!a || !b) return null;

  const start = toMinutes(a);
  const end = toMinutes(b);
  if (end <= start) return null;
  return { start, end };
};

const rangesOverlap = (a, b) => Math.max(a.start, b.start) < Math.min(a.end, b.end);

const calcularTiempo = (inicio, fin) => {
  const r = toRangeMinutes(inicio, fin);
  if (!r) return 0;
  const mins = r.end - r.start;
  return mins > 0 ? parseFloat((mins / 60).toFixed(2)) : 0;
};

const calcularHorasAdicionales = (horaInicio, horaFin, horarioUsuario) => {
  const ini = parseHHMM(horaInicio);
  const fin = parseHHMM(horaFin);
  const rango = parseRange(horarioUsuario);
  if (!ini || !fin || !rango) return 'N/D';

  let start = toMinutes(ini);
  let end = toMinutes(fin);
  if (end <= start) end += 24 * 60;

  let inWorkStart = toMinutes(rango.ini);
  let inWorkEnd = toMinutes(rango.fin);
  if (inWorkEnd <= inWorkStart) inWorkEnd += 24 * 60;

  const fueraInicio = start < inWorkStart;
  const fueraFin = end > inWorkEnd;
  return (fueraInicio || fueraFin) ? 'Sí' : 'No';
};

const normKey = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const normText = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const equipoOf = (r, fallback = 'SIN EQUIPO') => {
  const raw = (r?.equipo ?? r?.EQUIPO ?? r?.equipo_nombre ?? r?.equipoName ?? '');
  const n = normKey(raw);
  return n || fallback;
};

const normalizeModulos = (arr) => (
  Array.isArray(arr)
    ? arr.map(m => (typeof m === 'string' ? m : (m?.nombre ?? String(m))))
    : []
);

const getModulosLocal = (u) => {
  const arr = normalizeModulos(u?.modulos ?? u?.user?.modulos);
  if (arr.length) return arr;
  const single = u?.modulo ?? u?.user?.modulo;
  return single ? normalizeModulos([single]) : [];
};

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const getWeekBoundsISO = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { minISO: toISODate(start), maxISO: toISODate(end), todayISO: toISODate(d) };
};

function getWeekBoundsFromDateISO(dateLike) {
  const base = dateLike ? new Date(`${dateLike}T00:00:00`) : new Date();

  if (Number.isNaN(base.getTime())) {
    return { minISO: "", maxISO: "" };
  }

  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay(); // 0 domingo, 1 lunes...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    minISO: toISODate(start),
    maxISO: toISODate(end),
  };
}

function isDateInCurrentWeek(fechaISO, now = new Date()) {
  if (!fechaISO) return false;
  const { minISO, maxISO } = getWeekBoundsISO(now);
  return fechaISO >= minISO && fechaISO <= maxISO;
}

function taskCode(value) {
  return (String(value || '').match(/^\d+/)?.[0] ?? '');
}

function isInvalidCaseNumber(nro) {
  const s = String(nro ?? '').trim().toUpperCase();
  return !s || s === '0' || s === 'NA' || s === 'N/A' || s.length > 10;
}

function ocupacionCodeFromId(ocupacionId, ocupacionesArr) {
  if (!ocupacionId) return "";
  const occ = (ocupacionesArr || []).find(o => String(o.id) === String(ocupacionId));
  return String(occ?.codigo || "").trim();
}

function isNAValue(v) {
  const s = String(v ?? "").trim().toUpperCase();
  return !s || s === "0" || s === "NA" || s === "N/A";
}

function tareaCodeFromRegistro(registro, tareasBD) {
  const fromText = String(registro?.tipoTarea || "").match(/^\d+/)?.[0] || "";
  if (fromText) return fromText;

  const tid = Number(registro?.tarea_id || 0);
  const t = (tareasBD || []).find(x => Number(x.id) === tid);
  return String(t?.codigo || "").trim();
}

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const isActiveValue = (v) => {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "si" || s === "sí";
};

const uniq = (arr) => Array.from(new Set((arr || []).map(v => String(v || "").trim()).filter(Boolean)));

const proyectoClienteNombre = (p) =>
  String(p?.cliente?.nombre_cliente ?? p?.cliente?.nombre ?? "").trim();

const findOverlapRegistro = ({
  registros,
  fecha,
  consultorId,
  usuarioLogin,
  nombreConsultor,
  excludeId,
  horaInicio,
  horaFin
}) => {
  const nuevo = toRangeMinutes(horaInicio, horaFin);
  if (!nuevo) return null;

  const cid = consultorId ? String(consultorId) : null;
  const exId = excludeId ? String(excludeId) : null;

  const sameOwner = (r) => {
    if (cid && r?.consultor_id != null) return String(r.consultor_id) === cid;
    if (r?.usuario || r?.usuario_consultor) {
      return String(r.usuario ?? r.usuario_consultor).trim().toLowerCase() === String(usuarioLogin).trim().toLowerCase();
    }
    if (r?.consultor) return String(r.consultor).trim() === String(nombreConsultor || "").trim();
    return false;
  };

  for (const r of Array.isArray(registros) ? registros : []) {
    if (!r) continue;
    if (String(r?.fecha || "") !== String(fecha || "")) continue;
    if (exId && String(r?.id) === exId) continue;
    if (!sameOwner(r)) continue;

    const oldRange = toRangeMinutes(r?.horaInicio, r?.horaFin);
    if (!oldRange) continue;

    if (rangesOverlap(nuevo, oldRange)) return r;
  }

  return null;
};

const RegistroRow = React.memo(function RegistroRow({
  r,
  isBASISTable,
  isAdmin,
  moduloUser,
  nombreUser,
  onEditar,
  onEliminar,
  onCopiar,
  onToggleBloqueado,
}) {
  return (
    <tr>
      <td className="num">{r.id}</td>
      <td>{r.fecha}</td>
      <td>{r.modulo ?? moduloUser}</td>
      <td>{r.equipoNormalizado}</td>
      <td>{r.cliente}</td>
      <td>{r.nroCasoCliente}</td>
      <td>{r.nroCasoInterno}</td>
      <td>{r.nroCasoEscaladoSap}</td>
      <td>{r.ocupacionTexto}</td>
      <td>{r.tipoTareaTexto}</td>
      <td>{r.consultor ?? nombreUser}</td>
      <td>{r.horaInicio}</td>
      <td>{r.horaFin}</td>
      <td className="num">{r.tiempoInvertido}</td>
      <td className="num">{r.tiempoFacturable}</td>
      {isBASISTable && <td>{r.oncall}</td>}
      {isBASISTable && <td>{r.desborde}</td>}
      <td>{r.horasAdicionales}</td>
      <td className="truncate" title={r.descripcion}>{r.descripcion}</td>
      <td className="actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onEditar(r)}
          disabled={r.bloqueado}
          title={r.bloqueado ? "Registro bloqueado" : "Editar"}
        >
          ✏️
        </button>

        <button
          type="button"
          className="icon-btn danger"
          onClick={() => onEliminar(r.id)}
          disabled={r.bloqueado}
          title="Eliminar"
        >
          🗑️
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => onCopiar(r)}
          title="Copiar"
        >
          📋
        </button>
      </td>

      {isAdmin && (
        <td>
          <input
            type="checkbox"
            checked={!!r.bloqueado}
            onChange={() => onToggleBloqueado(r.id)}
            aria-label="Bloquear/Desbloquear fila"
          />
        </td>
      )}
    </tr>
  );
});

const Registro = ({ userData }) => {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');
  const excelInputRef = useRef(null);
  const openButtonRef = useRef(null);
  const firstFieldRef = useRef(null);
  const { todayISO } = getWeekBoundsISO(new Date());

  const [registro, setRegistro] = useState(initRegistro());
  const [modoEdicion, setModoEdicion] = useState(false);

  const [filtroId, setFiltroId] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOcupacion, setFiltroOcupacion] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroNroCasoCli, setFiltroNroCasoCli] = useState('');
  const [filtroHorasAdic, setFiltroHorasAdic] = useState('');
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroAnio, setFiltroAnio] = useState("");

  const [consultorActivo, setConsultorActivo] = useState(
    isActiveValue(userData?.activo ?? userData?.user?.activo ?? localStorage.getItem("consultorActivo"))
  );

  const horarioUsuario = (userData?.horario ?? userData?.user?.horario ?? userData?.user?.horarioSesion ?? '');
  const rol = String(
    userData?.rol_ref?.nombre ??
    userData?.rol ??
    userData?.user?.rol ??
    ''
  ).toUpperCase();

  const nombreUser = (userData?.nombre ?? userData?.user?.nombre) || '';
  const moduloUser = (userData?.modulo ?? userData?.user?.modulo) || '';
  const equipoUser = (userData?.equipo ?? userData?.user?.equipo) || '';

  const usuarioLogin = String(
    userData?.usuario ??
    userData?.user?.usuario ??
    ''
  ).trim().toLowerCase();

  const initialEquipo = () => normKey(localStorage.getItem('filtroEquipo') || '');
  const [filtroEquipo, setFiltroEquipo] = useState(initialEquipo);
  useEffect(() => { localStorage.setItem('filtroEquipo', filtroEquipo); }, [filtroEquipo]);

  const rolUpper = String(rol || "").toUpperCase();

  const REGISTRO_GLOBAL_ROLES = new Set([
    "ADMIN",
  ]);

  const REGISTRO_ROLE_POOL_ROLES = new Set([
    "ADMIN_GESTION_PREVENTA",
    "ADMIN_OPORTUNIDADES",
  ]);

  const REGISTRO_EXCLUDED_ROLES = new Set([
    "ADMIN_GERENTES",
  ]);

  const canAccessRegistro = !REGISTRO_EXCLUDED_ROLES.has(rolUpper);

  const isAdmin = canAccessRegistro && rolUpper.startsWith("ADMIN");
  const isAdminGlobal = canAccessRegistro && REGISTRO_GLOBAL_ROLES.has(rolUpper);
  const isAdminRolePool = canAccessRegistro && REGISTRO_ROLE_POOL_ROLES.has(rolUpper);
  const isAdminEquipo = canAccessRegistro && isAdmin && !isAdminGlobal && !isAdminRolePool;
  

  const miEquipo = String(equipoUser || "").trim().toUpperCase();
  const equipoLocked = isAdminEquipo ? miEquipo : filtroEquipo;

  const userEquipoUpper = String(equipoUser || '').toUpperCase();

  const canDownload = ['rodriguezso', 'valdezjl', 'gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());
  const [importingExcel, setImportingExcel] = useState(false);
  const canImportExcel = ['gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());

  const [proyectos, setProyectos] = useState([]);
  const [loadingProyectos, setLoadingProyectos] = useState(false);

  const initialVista = () => {
    const persisted = localStorage.getItem('equipoView');
    if (persisted === 'BASIS' || persisted === 'FUNCIONAL') return persisted;
    return (userEquipoUpper === 'BASIS') ? 'BASIS' : 'FUNCIONAL';
  };
  const [vistaEquipo, setVistaEquipo] = useState(initialVista);
  useEffect(() => { localStorage.setItem('equipoView', vistaEquipo); }, [vistaEquipo]);

  const isBASISTable = isAdmin ? (vistaEquipo === 'BASIS') : (userEquipoUpper === 'BASIS');

  const adminBloqueadoPorEquipo =
    isAdmin && (userEquipoUpper === 'BASIS' || userEquipoUpper === 'FUNCIONAL');

  const equipoFormulario = adminBloqueadoPorEquipo
    ? userEquipoUpper
    : (isAdmin ? vistaEquipo : (userEquipoUpper === 'BASIS' ? 'BASIS' : 'FUNCIONAL'));

  const [modulos, setModulos] = useState(getModulosLocal(userData));
  const [moduloElegido, setModuloElegido] = useState('');

  useEffect(() => {
    const locals = getModulosLocal(userData);
    setModulos(locals);
    setModuloElegido(locals.length === 1 ? locals[0] : '');
  }, [userData]);

  const [clientes, setClientes] = useState([]);
  const [ocupaciones, setOcupaciones] = useState([]);
  const [todasTareas, setTodasTareas] = useState([]);
  const [ocupacionSeleccionada, setOcupacionSeleccionada] = useState('');
  const [equiposDisponibles, setEquiposDisponibles] = useState([]);
  const [consultoresGlobales, setConsultoresGlobales] = useState([]);
  const [equiposConConteo, setEquiposConConteo] = useState([{ key: '', label: 'Todos', count: 0 }]);

  const filtroNroCasoCliDeb = useDebouncedValue(filtroNroCasoCli, 300);
  const filtroIdDeb = useDebouncedValue(filtroId, 250);

  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const editOriginalRef = useRef(null);
  const registrosAbortRef = useRef(null);

  const [fasesProyecto, setFasesProyecto] = useState([]);
  const prevIsProyectoModeRef = useRef(false);
  const [capacidadModalOpen, setCapacidadModalOpen] = useState(false);

  const canViewCapacidadSemanal = canAccessRegistro && (isAdminGlobal || isAdminEquipo);

  useEffect(() => {
    const v = userData?.activo ?? userData?.user?.activo;
    if (v !== undefined) setConsultorActivo(isActiveValue(v));
  }, [userData]);

  useEffect(() => {
    if (!modalIsOpen) return;
    const id = setTimeout(() => {
      firstFieldRef.current?.focus?.();
    }, 50);
    return () => clearTimeout(id);
  }, [modalIsOpen]);

  const isProyectoMode = useMemo(() => {
    const occCode = ocupacionCodeFromId(ocupacionSeleccionada, ocupaciones);
    return occCode === "02";
  }, [ocupacionSeleccionada, ocupaciones]);

  const forceProyectoMode = useMemo(() => {
    return !!String(registro?.proyecto_id || "").trim();
  }, [registro?.proyecto_id]);

  const showProyectoUI = isProyectoMode || forceProyectoMode;

  const proyectosFiltradosPorCliente = useMemo(() => {
    const clienteSel = String(registro?.cliente || "").trim();
    if (!clienteSel) return [];
    const key = normText(clienteSel);

    return (proyectos || []).filter((p) => {
      const cName = proyectoClienteNombre(p);
      if (!cName) return false;
      return normText(cName) === key;
    });
  }, [proyectos, registro?.cliente]);

  const tareasDeOcupacion = useMemo(() => {
    const occ = (ocupaciones || []).find(o => String(o.id) === String(ocupacionSeleccionada));
    return Array.isArray(occ?.tareas) ? occ.tareas : [];
  }, [ocupaciones, ocupacionSeleccionada]);

  const occCodeSeleccionada = useMemo(() => {
    return ocupacionCodeFromId(ocupacionSeleccionada, ocupaciones);
  }, [ocupacionSeleccionada, ocupaciones]);

  const clientesDisponibles = useMemo(() => {
    const lista = Array.isArray(clientes) ? clientes : [];

    if (OCCUPATIONS_ONLY_HITSS.has(occCodeSeleccionada)) {
      return lista.filter(
        (c) => normText(c.nombre_cliente) === normText(CLIENTE_RESTRINGIDO)
      );
    }

    return lista;
  }, [clientes, occCodeSeleccionada]);

  useEffect(() => {
    if (!OCCUPATIONS_ONLY_HITSS.has(occCodeSeleccionada)) return;

    const clienteHitss = (clientes || []).find(
      (c) => normText(c.nombre_cliente) === normText(CLIENTE_RESTRINGIDO)
    );

    if (!clienteHitss) return;

    setRegistro((prev) => {
      const clienteActual = String(prev.cliente || "").trim();
      const clienteObjetivo = String(clienteHitss.nombre_cliente || "").trim();

      if (normText(clienteActual) === normText(clienteObjetivo)) {
        return prev;
      }

      return {
        ...prev,
        cliente: clienteObjetivo,
        proyecto_id: "",
        proyecto_codigo: "",
        proyecto_nombre: "",
        proyecto_fase: "",
        fase_proyecto_id: "",
      };
    });

    setFasesProyecto([]);
  }, [occCodeSeleccionada, clientes]);

  useEffect(() => {
    if (!showProyectoUI) return;
    if (!registro?.cliente) return;
    if (!registro?.proyecto_id) return;
    if (loadingProyectos) return;
    if (!Array.isArray(proyectos) || proyectos.length === 0) return;

    const pid = String(registro.proyecto_id);
    const ok = proyectosFiltradosPorCliente.some(p => String(p.id) === pid);

    if (!ok) {
      setRegistro((r) => ({
        ...r,
        proyecto_id: "",
        proyecto_codigo: "",
        proyecto_nombre: "",
        proyecto_fase: "",
        fase_proyecto_id: "",
      }));
      setFasesProyecto([]);
    }
  }, [
    showProyectoUI,
    registro?.cliente,
    registro?.proyecto_id,
    proyectosFiltradosPorCliente,
    proyectos,
    loadingProyectos
  ]);

  useEffect(() => {
    const prev = prevIsProyectoModeRef.current;
    prevIsProyectoModeRef.current = showProyectoUI;

    const debeLimpiar = prev === true && showProyectoUI === false;

    if (!showProyectoUI) {
      if (debeLimpiar) {
        setProyectos([]);
        setFasesProyecto([]);
        setRegistro((r) => ({
          ...r,
          proyecto_id: "",
          proyecto_codigo: "",
          proyecto_nombre: "",
          proyecto_fase: "",
          fase_proyecto_id: "",
        }));
      }
      return;
    }

    const mod = (moduloElegido || moduloUser || "").trim();
    if (!mod) {
      setProyectos([]);
      return;
    }

    const fetchProyectos = async () => {
      setLoadingProyectos(true);
      try {
        const res = await jfetch(
          `/proyectos?modulo=${encodeURIComponent(mod)}&include_fases=1`,
          { headers: { "X-User-Usuario": usuarioLogin, "X-User-Rol": rol } }
        );

        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

        setProyectos(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Error cargando proyectos:", e);
        setProyectos([]);
      } finally {
        setLoadingProyectos(false);
      }
    };

    fetchProyectos();
  }, [showProyectoUI, moduloElegido, moduloUser, usuarioLogin, rol]);

  useEffect(() => {
    setPage(1);
  }, [
    filtroIdDeb,
    filtroEquipo,
    filtroFecha,
    filtroCliente,
    filtroOcupacion,
    filtroTarea,
    filtroConsultor,
    filtroNroCasoCliDeb,
    filtroHorasAdic,
    filtroMes,
    filtroAnio
  ]);

  useEffect(() => {
    const fetchCatalogos = async () => {
      try {
        const cached = sessionStorage.getItem("catalogos_registro");
        if (cached) {
          const parsed = JSON.parse(cached);
          setEquiposDisponibles(Array.isArray(parsed?.equipos) ? parsed.equipos : []);
          setClientes(Array.isArray(parsed?.clientes) ? parsed.clientes : []);
          setOcupaciones(Array.isArray(parsed?.ocupaciones) ? parsed.ocupaciones : []);
          setTodasTareas(Array.isArray(parsed?.tareas) ? parsed.tareas : []);
        }

        const [eqRes, cliRes, ocuRes] = await Promise.all([
          jfetch('/equipos'),
          jfetch('/clientes?limit=500'),
          jfetch('/ocupaciones')
        ]);

        const [eqData, cliData, ocuData] = await Promise.all([
          eqRes.json().catch(() => []),
          cliRes.json().catch(() => []),
          ocuRes.json().catch(() => [])
        ]);

        if (!eqRes.ok) throw new Error(eqData?.mensaje || `HTTP ${eqRes.status}`);
        if (!cliRes.ok) throw new Error(cliData?.mensaje || `HTTP ${cliRes.status}`);
        if (!ocuRes.ok) throw new Error(ocuData?.mensaje || `HTTP ${ocuRes.status}`);

        const ocus = Array.isArray(ocuData) ? ocuData : [];
        const map = new Map();
        ocus.forEach(o => (o.tareas || []).forEach(t => {
          if (t && !map.has(t.id)) map.set(t.id, t);
        }));

        setEquiposDisponibles(Array.isArray(eqData) ? eqData : []);
        setClientes(Array.isArray(cliData) ? cliData : []);
        setOcupaciones(ocus);
        setTodasTareas(Array.from(map.values()));

        sessionStorage.setItem("catalogos_registro", JSON.stringify({
          equipos: Array.isArray(eqData) ? eqData : [],
          clientes: Array.isArray(cliData) ? cliData : [],
          ocupaciones: ocus,
          tareas: Array.from(map.values()),
        }));
      } catch (err) {
        console.error('Error cargando catálogos:', err);
        setEquiposDisponibles([]);
        setClientes([]);
        setOcupaciones([]);
        setTodasTareas([]);
      }
    };
    fetchCatalogos();
  }, []);

  const fetchFiltrosGlobales = useCallback(async () => {
    try {
      const res = await jfetch('/registros/filtros', {
        headers: {
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
          "X-User-Equipo": String(equipoUser || ""),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      setConsultoresGlobales(Array.isArray(data?.consultores) ? data.consultores : []);
    } catch (e) {
      console.error("Error cargando filtros globales:", e);
      setConsultoresGlobales([]);
    }
  }, [usuarioLogin, rol, equipoUser]);

  const fetchConteosGlobales = useCallback(async () => {
    try {
      const res = await jfetch('/registros/conteos', {
        headers: {
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
          "X-User-Equipo": String(equipoUser || ""),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      const total = Number(data?.total || 0);
      const equipos = Array.isArray(data?.equipos) ? data.equipos : [];

      const mapped = [
        { key: '', label: 'Todos', count: total },
        ...equipos.map((x) => ({
          key: normKey(x.equipo),
          label: String(x.equipo || "SIN EQUIPO"),
          count: Number(x.count || 0),
        })),
      ];

      setEquiposConConteo(mapped);
    } catch (e) {
      console.error("Error cargando conteos globales:", e);
      setEquiposConConteo([{ key: '', label: 'Todos', count: 0 }]);
    }
  }, [usuarioLogin, rol, equipoUser]);

  const fetchRegistros = useCallback(async () => {
    setError("");

    if (registrosAbortRef.current) {
      try {
        registrosAbortRef.current.abort();
      } catch {}
    }

    const controller = new AbortController();
    registrosAbortRef.current = controller;

    try {
      const params = new URLSearchParams();

      if (equipoLocked) params.set("equipo", equipoLocked);
      if (filtroMes) params.set("mes", filtroMes);
      if (filtroAnio) params.set("anio", filtroAnio);
      if (filtroConsultor) params.set("consultor", filtroConsultor);
      if (filtroCliente) params.set("cliente", filtroCliente);
      if (filtroFecha) params.set("fecha", filtroFecha);
      if (filtroIdDeb) params.set("id", filtroIdDeb);
      if (filtroNroCasoCliDeb) params.set("nroCasoCliente", filtroNroCasoCliDeb);
      if (filtroHorasAdic) params.set("horasAdicionales", filtroHorasAdic);

      if (filtroTarea) {
        const tareaObj = (todasTareas || []).find(
          t => `${t.codigo} - ${t.nombre}` === filtroTarea
        );
        if (tareaObj?.id) params.set("tarea_id", tareaObj.id);
      }

      if (filtroOcupacion) {
        const occObj = (ocupaciones || []).find(
          o => `${o.codigo} - ${o.nombre}` === filtroOcupacion
        );
        if (occObj?.id) params.set("ocupacion_id", occObj.id);
      }

      params.set("page", page);
      params.set("per_page", perPage);

      const url = `/registros?${params.toString()}`;

      const res = await jfetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
          "X-User-Equipo": String(equipoUser || ""),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      setRegistros(Array.isArray(data?.data) ? data.data : []);
      setTotalRegistros(Number(data?.total || 0));
      setTotalPages(Number(data?.total_pages || 1));
    } catch (e) {
      if (e?.name === "AbortError") return;
      setRegistros([]);
      setTotalRegistros(0);
      setTotalPages(1);
      setError(String(e.message || e));
    }
  }, [
    equipoLocked,
    filtroMes,
    filtroAnio,
    filtroConsultor,
    filtroCliente,
    filtroFecha,
    filtroIdDeb,
    filtroNroCasoCliDeb,
    filtroHorasAdic,
    filtroTarea,
    filtroOcupacion,
    page,
    perPage,
    usuarioLogin,
    rol,
    equipoUser,
    todasTareas,
    ocupaciones,
  ]);

  useEffect(() => {
    if (!usuarioLogin) return;

    (async () => {
      try {
        const res = await jfetch(`/consultores/datos?usuario=${encodeURIComponent(usuarioLogin)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const act = isActiveValue(data?.activo);
        setConsultorActivo(act);
        localStorage.setItem("consultorActivo", act ? "1" : "0");

        const norm = normalizeModulos(Array.isArray(data.modulos) ? data.modulos : []);
        if (norm.length) {
          setModulos(prev => uniq([...(prev || []), ...norm]));
        }
      } catch {}
    })();
  }, [usuarioLogin]);

  useEffect(() => {
    const hasId = (userData && (userData.id || userData?.user?.id));
    if (!hasId || !usuarioLogin) return;

    fetchRegistros();
    fetchFiltrosGlobales();
    fetchConteosGlobales();
  }, [userData, usuarioLogin, fetchRegistros, fetchFiltrosGlobales, fetchConteosGlobales]);

  const resolveModulosForEdit = useCallback((reg) => {
    const fromRegistro = reg?.modulo ? [reg.modulo] : [];
    const fromState = Array.isArray(modulos) ? modulos : [];
    const fromUser = getModulosLocal(userData);
    return uniq([...fromRegistro, ...fromState, ...fromUser]);
  }, [modulos, userData]);

  const ocupacionLabelByTareaId = useMemo(() => {
    const map = new Map();
    (ocupaciones || []).forEach((o) => {
      const label = `${o.codigo} - ${o.nombre}`;
      (o.tareas || []).forEach((t) => {
        if (t?.id) map.set(t.id, label);
      });
    });
    return map;
  }, [ocupaciones]);

  const tareaIdByCodigoNombre = useMemo(() => {
    const map = new Map();
    (todasTareas || []).forEach((t) => {
      const key = `${String(t.codigo || "").trim()} - ${String(t.nombre || "").trim()}`.toUpperCase();
      map.set(key, t.id);
    });
    return map;
  }, [todasTareas]);

  const obtenerOcupacionDeRegistro = useCallback((r) => {
    if (r?.ocupacion_codigo && r?.ocupacion_nombre) {
      return `${r.ocupacion_codigo} - ${r.ocupacion_nombre}`;
    }
    const tipo = String(r?.tipoTarea || "").trim();
    const key = tipo.toUpperCase();
    const tareaId = tareaIdByCodigoNombre.get(key);
    if (!tareaId) return "—";
    return ocupacionLabelByTareaId.get(tareaId) || "—";
  }, [tareaIdByCodigoNombre, ocupacionLabelByTareaId]);

  const registrosProcesados = useMemo(() => {
    return (registros || []).map((r) => ({
      ...r,
      equipoNormalizado: equipoOf(r),
      ocupacionTexto: obtenerOcupacionDeRegistro(r),
      tipoTareaTexto: r.tipoTarea || (r.tarea ? `${r.tarea.codigo} - ${r.tarea.nombre}` : "—"),
    }));
  }, [registros, obtenerOcupacionDeRegistro]);

  const registrosFiltrados = useMemo(() => {
    return {
      total: totalRegistros,
      totalPages,
      page,
      pageRows: registrosProcesados,
      allRows: registrosProcesados,
    };
  }, [registrosProcesados, totalRegistros, totalPages, page]);

  const closeModal = useCallback(() => {
    setModalIsOpen(false);
    setModoEdicion(false);
    setOcupacionSeleccionada("");
    editOriginalRef.current = null;
    setFasesProyecto([]);
    setRegistro(initRegistro());
    setModuloElegido(modulos.length === 1 ? modulos[0] : "");

    setTimeout(() => {
      openButtonRef.current?.focus?.();
    }, 50);
  }, [modulos]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const original = editOriginalRef.current;

    if (!isAdmin && !consultorActivo) {
      return Swal.fire({
        icon: "warning",
        title: "Usuario inactivo",
        text: "No puedes registrar horas porque tu usuario está inactivo.",
      });
    }

    const code = taskCode(registro.tipoTarea);

    if (!registro.fecha) {
      return Swal.fire({ icon: "warning", title: "Selecciona una fecha" });
    }

    if (registro.fecha > todayISO) {
      return Swal.fire({
        icon: "warning",
        title: "Fecha futura no permitida",
        text: "No puedes registrar fechas futuras.",
      });
    }

    if (!registro.horaInicio || !registro.horaFin) {
      return Swal.fire({ icon: "warning", title: "Completa las horas de inicio y fin" });
    }

    const tiempo = calcularTiempo(registro.horaInicio, registro.horaFin);
    if (tiempo <= 0) {
      return Swal.fire({ icon: "error", title: "Hora fin debe ser mayor a inicio" });
    }

    const consultorId =
      registro.consultor_id ||
      userData?.consultor_id ||
      userData?.user?.consultor_id ||
      localStorage.getItem("consultorId") ||
      null;

    const nombreConsultor =
      userData?.nombre || userData?.user?.nombre || userData?.consultor?.nombre || "";

    const cambioRangoEnEdicion =
      modoEdicion &&
      original &&
      (
        String(original.fecha) !== String(registro.fecha) ||
        String(original.horaInicio) !== String(registro.horaInicio) ||
        String(original.horaFin) !== String(registro.horaFin)
      );

    const debeValidarOverlap = !modoEdicion || cambioRangoEnEdicion;

    if (debeValidarOverlap) {
      const conflict = findOverlapRegistro({
        registros,
        fecha: registro.fecha,
        consultorId,
        usuarioLogin,
        nombreConsultor,
        excludeId: modoEdicion ? registro.id : null,
        horaInicio: registro.horaInicio,
        horaFin: registro.horaFin,
      });

      if (conflict) {
        return Swal.fire({
          icon: "warning",
          title: "Horas duplicadas",
          html: `Ya existe un registro que se cruza con este rango:<br/><b>${conflict.horaInicio} - ${conflict.horaFin}</b> (ID: ${conflict.id})`,
        });
      }
    }

    const occCode = ocupacionCodeFromId(ocupacionSeleccionada, ocupaciones);
    const tareaCode = tareaCodeFromRegistro(registro, tareasDeOcupacion);

    if (
      OCCUPATIONS_ONLY_HITSS.has(occCode) &&
      normText(registro.cliente) !== normText(CLIENTE_RESTRINGIDO)
    ) {
      return Swal.fire({
        icon: "warning",
        title: "Cliente no permitido",
        text: "La ocupación 03 solo puede registrarse con el cliente HITSS/CLARO.",
      });
    }

    if (occCode === "02") {
      const badCliente = isNAValue(registro.nroCasoCliente);
      if (badCliente) {
        return Swal.fire({
          icon: "warning",
          title: "Número de proyecto obligatorio",
          html: `
              Para <b>02 - Proyectos</b> debes diligenciar:
              <br/>• <b>Nro Caso Cliente</b>
              <br/><br/>
              No se permite <b>NA</b>, <b>N/A</b>, <b>0</b> ni dejarlo vacío.
            `,
        });
      }

      if (!registro.proyecto_id) {
        return Swal.fire({
          icon: "warning",
          title: "Proyecto obligatorio",
          text: "Selecciona un proyecto.",
        });
      }

      if (Array.isArray(fasesProyecto) && fasesProyecto.length > 0) {
        if (!registro.fase_proyecto_id) {
          return Swal.fire({
            icon: "warning",
            title: "Fase del proyecto obligatoria",
            text: "Selecciona una fase del proyecto.",
          });
        }
      }
    }
    
    if (
      OCCUPATIONS_FORBID_HITSS.has(occCode) &&
      String(registro.cliente || "").trim().toUpperCase() === CLIENTE_RESTRINGIDO
    ) {
      return Swal.fire({
        icon: "warning",
        title: "Cliente no permitido",
        text: "Las ocupaciones no se pueden registrar con el cliente HITSS/CLARO.",
      });
    }

    if (CODES_RESTRICTED_CLIENT_9H.has(code)) {
      if ((registro.cliente || "").trim().toUpperCase() !== CLIENTE_RESTRINGIDO) {
        return Swal.fire({
          icon: "warning",
          title: "Cliente no permitido",
          text: "Esta tarea solo puede registrarse al cliente HITSS/CLARO.",
        });
      }
      if (tiempo > 9) {
        return Swal.fire({
          icon: "warning",
          title: "Límite de horas excedido",
          text: "Estas tareas no pueden superar 9 horas en un registro.",
        });
      }
    }

    if (code === CODE_SUPERVISION_EQUIPO) {
      const poolModulos = [moduloElegido, moduloUser, ...(modulos || [])].map((m) =>
        String(m || "").trim().toUpperCase()
      );
      const canUseLider = poolModulos.includes("LIDER");
      if (!canUseLider) {
        return Swal.fire({
          icon: "warning",
          title: "Módulo no autorizado",
          text:
            'La tarea "Seguimiento y Supervisión Equipo" solo puede ser usada por quienes pueden diligenciar el módulo LIDER.',
        });
      }
    }

    if (modulos.length > 1 && !moduloElegido) {
      return Swal.fire({ icon: "warning", title: "Selecciona un módulo" });
    }

    const horasAdic = calcularHorasAdicionales(
      registro.horaInicio,
      registro.horaFin,
      /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(horarioUsuario) ? horarioUsuario : null
    );

    const moduloFinal = (moduloElegido || modulos[0] || moduloUser || "").trim();
    if (!moduloFinal) {
      return Swal.fire({
        icon: "warning",
        title: "Selecciona un módulo antes de guardar",
      });
    }

    const base = {
      fecha: registro.fecha,
      cliente: registro.cliente,
      nroCasoCliente: registro.nroCasoCliente,
      nroCasoInterno: registro.nroCasoInterno,
      nroCasoEscaladoSap: registro.nroCasoEscaladoSap,
      tarea_id: registro.tarea_id || null,
      ocupacion_id: ocupacionSeleccionada ? parseInt(ocupacionSeleccionada, 10) : null,

      proyecto_id: showProyectoUI && registro.proyecto_id ? Number(registro.proyecto_id) : null,
      proyecto_codigo: showProyectoUI ? (registro.proyecto_codigo || null) : null,
      proyecto_nombre: showProyectoUI ? (registro.proyecto_nombre || null) : null,
      proyecto_fase: showProyectoUI ? (registro.proyecto_fase || null) : null,
      fase_proyecto_id: showProyectoUI && registro.fase_proyecto_id ? Number(registro.fase_proyecto_id) : null,

      horaInicio: registro.horaInicio,
      horaFin: registro.horaFin,
      tiempoInvertido: tiempo,
      tiempoFacturable: registro.tiempoFacturable,
      horasAdicionales: horasAdic,
      descripcion: registro.descripcion,
      totalHoras: tiempo,
      modulo: moduloFinal,
      equipo: equipoFormulario,
      usuario: usuarioLogin,
      consultor_id: consultorId,
      rol,
    };

    const payload = {
      ...base,
      nombre: nombreConsultor,
      consultor: nombreConsultor,
      modulo: moduloFinal,
      tipoTarea: registro.tipoTarea,
    };

    if (equipoFormulario === "BASIS") {
      payload.actividadMalla = registro.actividadMalla;
      payload.oncall = registro.oncall;
      payload.desborde = registro.desborde;
    }

    try {
      const path = modoEdicion ? `/editar-registro/${registro.id}` : "/registrar-hora";
      const method = modoEdicion ? "PUT" : "POST";

      const resp = await jfetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
        },
        body: JSON.stringify(payload),
      });

      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.mensaje || `HTTP ${resp.status}`);

      Swal.fire({
        icon: "success",
        title: modoEdicion ? "Registro actualizado" : "Registro guardado",
      });

      window.dispatchEvent(new Event("resumen-actualizar"));
      fetchRegistros();
      fetchFiltrosGlobales();
      fetchConteosGlobales();
      closeModal();
    } catch (e) {
      Swal.fire({ icon: "error", title: String(e.message || e) });
    }
  };

  const handleEditar = async (reg) => {
    editOriginalRef.current = {
      id: reg.id,
      fecha: reg.fecha,
      horaInicio: reg.horaInicio,
      horaFin: reg.horaFin,
    };

    const tareaId =
      reg?.tarea_id ??
      reg?.tarea?.id ??
      (tareaIdByCodigoNombre.get(String(reg?.tipoTarea || "").trim().toUpperCase()) || null);

    let ocupacionId = reg?.ocupacion_id ? String(reg.ocupacion_id) : "";

    if (!ocupacionId && tareaId && Array.isArray(ocupaciones) && ocupaciones.length) {
      const occ = ocupaciones.find(o => (o.tareas || []).some(t => Number(t.id) === Number(tareaId)));
      if (occ?.id) ocupacionId = String(occ.id);
    }

    const pool = resolveModulosForEdit(reg);
    setModulos(pool);

    const preferido = reg?.modulo ? String(reg.modulo).trim() : "";
    const moduloSel = pool.length === 1 ? pool[0] : (preferido || "");
    setModuloElegido(moduloSel);

    const pid = reg?.proyecto_id ? String(reg.proyecto_id) : "";
    const mod = (reg?.modulo || moduloSel || moduloUser || "").trim();

    let proyectosData = Array.isArray(proyectos) ? proyectos : [];

    if (pid && proyectosData.length === 0 && mod) {
      try {
        const res = await jfetch(
          `/proyectos?modulo=${encodeURIComponent(mod)}&include_fases=1`,
          { headers: { "X-User-Usuario": usuarioLogin, "X-User-Rol": rol } }
        );
        const data = await res.json().catch(() => []);
        if (res.ok) {
          proyectosData = Array.isArray(data) ? data : [];
          setProyectos(proyectosData);
        }
      } catch {}
    }

    const proyectoObj = pid ? (proyectosData || []).find(x => String(x.id) === pid) : null;

    let fases = [];
    if (Array.isArray(reg?.proyecto?.fases) && reg.proyecto.fases.length) {
      fases = reg.proyecto.fases;
    } else if (Array.isArray(proyectoObj?.fases)) {
      fases = proyectoObj.fases;
    }
    setFasesProyecto(fases);

    const faseIdFromReg =
      reg?.fase_proyecto_id
        ? String(reg.fase_proyecto_id)
        : (reg?.fase_proyecto?.id ? String(reg.fase_proyecto.id) : "");

    const faseObj =
      (faseIdFromReg && fases.find(f => String(f.id) === String(faseIdFromReg))) ||
      (fases.length ? fases[0] : null);

    setRegistro({
      ...initRegistro(),
      id: reg.id,
      fecha: reg.fecha,
      cliente: reg.cliente,
      nroCasoCliente: reg.nroCasoCliente,
      nroCasoInterno: reg.nroCasoInterno,
      nroCasoEscaladoSap: reg.nroCasoEscaladoSap,
      tarea_id: tareaId ? Number(tareaId) : "",
      tipoTarea: reg?.tarea ? `${reg.tarea.codigo} - ${reg.tarea.nombre}` : (reg?.tipoTarea || ""),
      ocupacion_id: ocupacionId,
      horaInicio: reg.horaInicio,
      horaFin: reg.horaFin,
      tiempoFacturable: reg.tiempoFacturable,
      descripcion: reg.descripcion,
      modulo: moduloSel,
      equipo: equipoOf(reg, userEquipoUpper),
      actividadMalla: reg.actividadMalla || "",
      oncall: reg.oncall || "",
      desborde: reg.desborde || "",
      proyecto_id: pid,
      proyecto_codigo: reg?.proyecto_codigo ?? reg?.proyecto?.codigo ?? (proyectoObj?.codigo ?? ""),
      proyecto_nombre: reg?.proyecto_nombre ?? reg?.proyecto?.nombre ?? (proyectoObj?.nombre ?? ""),
      proyecto_fase: faseObj?.nombre || (reg?.proyecto_fase ?? reg?.fase_proyecto?.nombre ?? ""),
      fase_proyecto_id: faseObj?.id ? String(faseObj.id) : (faseIdFromReg || ""),
    });

    setOcupacionSeleccionada(ocupacionId);
    setModoEdicion(true);
    setTimeout(() => setModalIsOpen(true), 0);
  };

  const handleEliminar = async (id) => {
    const res = await Swal.fire({
      title: '¿Seguro?',
      text: '¡No podrás revertir esto!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (res.isConfirmed) {
      const resp = await jfetch(`/eliminar-registro/${id}`, {
        method: 'DELETE',
        headers: {
          "Content-Type": "application/json",
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol
        },
        body: JSON.stringify({ rol, nombre: nombreUser })
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        return Swal.fire({ icon: 'error', title: j?.mensaje || `HTTP ${resp.status}` });
      }

      Swal.fire({ icon: 'success', title: 'Eliminado' });
      fetchRegistros();
      fetchFiltrosGlobales();
      fetchConteosGlobales();
      window.dispatchEvent(new Event("resumen-actualizar"));
    }
  };

  const handleCopiar = async (reg) => {
    editOriginalRef.current = null;

    const pool = resolveModulosForEdit(reg);
    setModulos(pool);

    const moduloPref = reg?.modulo ? String(reg.modulo).trim() : "";
    const moduloSel = pool.length === 1 ? pool[0] : (moduloPref || "");
    setModuloElegido(moduloSel);

    const tareaId =
      reg?.tarea_id ??
      reg?.tarea?.id ??
      (tareaIdByCodigoNombre.get(String(reg?.tipoTarea || "").trim().toUpperCase()) || null);

    let ocupacionId = reg?.ocupacion_id ? String(reg.ocupacion_id) : "";
    if (!ocupacionId && tareaId && Array.isArray(ocupaciones) && ocupaciones.length) {
      const occ = ocupaciones.find(o => (o.tareas || []).some(t => Number(t.id) === Number(tareaId)));
      if (occ?.id) ocupacionId = String(occ.id);
    }

    const pid = reg?.proyecto_id ? String(reg.proyecto_id) : "";

    let proyectosData = Array.isArray(proyectos) ? proyectos : [];

    if (pid && proyectosData.length === 0) {
      const mod = (reg?.modulo || moduloSel || moduloUser || "").trim();
      if (mod) {
        try {
          const res = await jfetch(
            `/proyectos?modulo=${encodeURIComponent(mod)}&include_fases=1`,
            { headers: { "X-User-Usuario": usuarioLogin, "X-User-Rol": rol } }
          );
          const data = await res.json().catch(() => []);
          if (res.ok) {
            proyectosData = Array.isArray(data) ? data : [];
            setProyectos(proyectosData);
          }
        } catch {}
      }
    }

    let fases = [];
    if (Array.isArray(reg?.proyecto?.fases)) {
      fases = reg.proyecto.fases;
    } else {
      const p = pid ? proyectosData.find(x => String(x.id) === pid) : null;
      fases = Array.isArray(p?.fases) ? p.fases : [];
    }
    setFasesProyecto(fases);

    const faseIdFromReg =
      reg?.fase_proyecto_id
        ? String(reg.fase_proyecto_id)
        : (reg?.fase_proyecto?.id ? String(reg.fase_proyecto.id) : "");

    const faseObj =
      (faseIdFromReg && fases.find(f => String(f.id) === String(faseIdFromReg))) ||
      (fases.length ? fases[0] : null);

    setRegistro({
      ...initRegistro(),
      id: null,
      fecha: reg?.fecha || "",
      cliente: reg.cliente,
      nroCasoCliente: reg.nroCasoCliente,
      nroCasoInterno: reg.nroCasoInterno,
      nroCasoEscaladoSap: reg.nroCasoEscaladoSap,
      tarea_id: tareaId ? Number(tareaId) : "",
      tipoTarea: reg?.tarea ? `${reg.tarea.codigo} - ${reg.tarea.nombre}` : (reg?.tipoTarea || ""),
      ocupacion_id: ocupacionId,
      horaInicio: reg?.horaInicio || "",
      horaFin: reg?.horaFin || "",
      tiempoFacturable: reg.tiempoFacturable,
      descripcion: reg.descripcion,
      modulo: moduloSel,
      equipo: equipoOf(reg, userEquipoUpper),
      actividadMalla: reg.actividadMalla || "",
      oncall: reg.oncall || "",
      desborde: reg.desborde || "",
      proyecto_id: pid,
      proyecto_codigo: reg?.proyecto_codigo ?? reg?.proyecto?.codigo ?? "",
      proyecto_nombre: reg?.proyecto_nombre ?? reg?.proyecto?.nombre ?? "",
      proyecto_fase: faseObj?.nombre || (reg?.proyecto_fase ?? ""),
      fase_proyecto_id: faseObj?.id ? String(faseObj.id) : "",
    });

    setOcupacionSeleccionada(ocupacionId);
    setModoEdicion(false);
    setTimeout(() => setModalIsOpen(true), 0);
  };

  const toggleBloqueado = async (id) => {
    try {
      const resp = await jfetch(`/toggle-bloqueado/${id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: isAdmin ? 'ADMIN' : (rol || '') })
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({})))?.mensaje || `HTTP ${resp.status}`);
      fetchRegistros();
      fetchConteosGlobales();
    } catch {}
  };

  const actividadMalla = ['AC', 'CRU1', 'CRU2', 'CRU3', 'DC', 'DE', 'DF', 'IN', 'ON', 'T1E', 'T1I', 'T1X', 'T2E', 'T2I', 'T2X', 'T3', 'VC', 'SAT', 'N/APLICA'];
  const oncall = ['SI', 'NO', 'N/A'];
  const desborde = ['SI', 'NO', 'N/A'];

  const MESES = [
    { value: "01", label: "Enero" },
    { value: "02", label: "Febrero" },
    { value: "03", label: "Marzo" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Mayo" },
    { value: "06", label: "Junio" },
    { value: "07", label: "Julio" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  const buildCurrentFilterParams = useCallback(() => {
    const params = new URLSearchParams();

    if (equipoLocked) params.set("equipo", equipoLocked);
    if (filtroMes) params.set("mes", filtroMes);
    if (filtroAnio) params.set("anio", filtroAnio);
    if (filtroConsultor) params.set("consultor", filtroConsultor);
    if (filtroCliente) params.set("cliente", filtroCliente);
    if (filtroFecha) params.set("fecha", filtroFecha);
    if (filtroIdDeb) params.set("id", filtroIdDeb);
    if (filtroNroCasoCliDeb) params.set("nroCasoCliente", filtroNroCasoCliDeb);
    if (filtroHorasAdic) params.set("horasAdicionales", filtroHorasAdic);

    if (filtroTarea) {
      const tareaObj = (todasTareas || []).find(
        t => `${t.codigo} - ${t.nombre}` === filtroTarea
      );
      if (tareaObj?.id) params.set("tarea_id", tareaObj.id);
    }

    if (filtroOcupacion) {
      const occObj = (ocupaciones || []).find(
        o => `${o.codigo} - ${o.nombre}` === filtroOcupacion
      );
      if (occObj?.id) params.set("ocupacion_id", occObj.id);
    }

    return params;
  }, [
    equipoLocked,
    filtroMes,
    filtroAnio,
    filtroConsultor,
    filtroCliente,
    filtroFecha,
    filtroIdDeb,
    filtroNroCasoCliDeb,
    filtroHorasAdic,
    filtroTarea,
    filtroOcupacion,
    todasTareas,
    ocupaciones,
  ]);

  const handleExport = async () => {
    try {
      const params = buildCurrentFilterParams();
      const res = await jfetch(`/registros/export?${params.toString()}`, {
        headers: {
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
          "X-User-Equipo": String(equipoUser || ""),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      const rows = Array.isArray(data?.data) ? data.data : [];

      exportRegistrosExcelXLSX_ALL(
        rows,
        `registros_${new Date().toISOString().slice(0, 10)}.xlsx`,
        {
          'Consultor filtro': filtroConsultor || 'Todos',
          'Tarea filtro': filtroTarea || 'Todas',
          'Cliente filtro': filtroCliente || 'Todos',
          'Equipo filtro': filtroEquipo || 'Todos',
          'Nro Caso Cliente filtro': filtroNroCasoCli || 'Todos',
          'Horas Adicionales filtro': filtroHorasAdic || 'Todas',
          'Fecha filtro': filtroFecha || 'Todas',
          'Mes filtro': filtroMes || 'Todos',
          'Año filtro': filtroAnio || 'Todos',
          'Total exportado': rows.length,
          'Generado': new Date().toLocaleString()
        }
      );
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error exportando",
        text: String(e.message || e),
      });
    }
  };

  useEffect(() => {
    if (!userData) return;

    if (!isAdmin) {
      setFiltroConsultor(nombreUser);
      setFiltroEquipo(normKey(equipoUser));
      return;
    }

    if (isAdminEquipo) {
      setFiltroConsultor('');
      setFiltroEquipo(normKey(equipoUser));
      return;
    }

    if (isAdminRolePool) {
      setFiltroConsultor('');
      setFiltroEquipo('');
      return;
    }

    if (isAdminGlobal) {
      setFiltroConsultor('');
      setFiltroEquipo('');
    }
  }, [isAdmin, isAdminEquipo, isAdminRolePool, isAdminGlobal, nombreUser, equipoUser, userData]);

  const handleImportExcel = async () => {
    const file = excelInputRef.current?.files?.[0];

    if (!file) {
      return Swal.fire({
        icon: "warning",
        title: "Selecciona un archivo Excel"
      });
    }

    const confirm = await Swal.fire({
      title: "¿Importar Excel?",
      text: "Se cargará el archivo al servidor para comparar / reconstruir registros.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, importar",
      cancelButtonText: "Cancelar",
      reverseButtons: true
    });

    if (!confirm.isConfirmed) return;

    setImportingExcel(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/registro/import-excel", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Excel importado",
        text: `Registros cargados: ${data?.total_registros ?? "N/D"}`
      });

      fetchRegistros();
      fetchFiltrosGlobales();
      fetchConteosGlobales();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error importando Excel",
        text: e.message
      });
    } finally {
      setImportingExcel(false);
      if (excelInputRef.current) {
        excelInputRef.current.value = "";
      }
    }
  };

  const handleAbrirModalRegistro = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    e?.currentTarget?.blur?.();
    document.activeElement?.blur?.();

    try {
      const res = await jfetch(
        `/consultores/datos?usuario=${encodeURIComponent(usuarioLogin)}`
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      const act = isActiveValue(data?.activo);
      setConsultorActivo(act);
      localStorage.setItem("consultorActivo", act ? "1" : "0");

      if (!isAdmin && !act) {
        return Swal.fire({
          icon: "warning",
          title: "Usuario inactivo",
          text: "Tu usuario está inactivo. No puedes registrar horas. Contacta al administrador.",
        });
      }

      const lista = Array.isArray(data.modulos) ? data.modulos : [];
      const norm = normalizeModulos(lista);

      setModulos(norm);
      setModuloElegido(norm.length === 1 ? norm[0] : "");

      setRegistro({
        ...initRegistro(),
        fecha: todayISO,
        modulo: norm.length === 1 ? norm[0] : "",
        equipo: data.equipo ? String(data.equipo).toUpperCase() : userEquipoUpper,
      });

      setFasesProyecto([]);
      setOcupacionSeleccionada("");
      setModoEdicion(false);

      setTimeout(() => {
        setModalIsOpen(true);
      }, 0);
    } catch (err) {
      console.error("Error cargando datos del consultor:", err);
      Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los datos del consultor",
        text: err.message,
      });
    }
  };

  const colSpanTabla = useMemo(() => {
    let cols = 19;
    if (isBASISTable) cols += 2;
    if (isAdmin) cols += 1;
    return cols;
  }, [isBASISTable, isAdmin]);

  if (!canAccessRegistro) {
    return <Navigate to="/panel-grafico" replace />;
  }

  return (
    <div className="registro-page-scope">
      <div className="container">
        <div className="page-head">
          <div className="page-title">
            <div className="page-kicker">Gestión operativa</div>
            <h2>Gestión de Registro de Horas</h2>
            <p className="subtitle">
              Consulta, filtra y administra los registros de horas de forma clara, rápida y ordenada.
            </p>
          </div>

          <div className="page-actions">
            {canDownload && (
              <button
                className="btn btn-outline"
                onClick={handleExport}
                title="Descargar Excel"
              >
                Descargar Excel
              </button>
            )}

            {canImportExcel && (
              <>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="excel-input"
                />

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleImportExcel}
                  disabled={importingExcel}
                >
                  {importingExcel ? "Importando…" : "Importar Excel"}
                </button>
              </>
            )}

            {canViewCapacidadSemanal && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCapacidadModalOpen(true)}
              >
                Ver capacidad semanal
              </button>
            )}

            <button
              ref={openButtonRef}
              type="button"
              className="btn btn-primary"
              onClick={handleAbrirModalRegistro}
              disabled={!isAdmin && !consultorActivo}
              title={!isAdmin && !consultorActivo ? "Usuario inactivo" : "Agregar Registro"}
            >
              + Nuevo registro
            </button>
          </div>
        </div>

        {isAdminGlobal && (
          <div className="team-filter-row">
            <span className="team-filter-label">Equipo:</span>
            <div className="team-toggle">
              {equiposConConteo.map((opt) => (
                <button
                  key={opt.key || "ALL"}
                  type="button"
                  className={`team-btn ${filtroEquipo === opt.key ? "is-active" : ""}`}
                  onClick={() => {
                    setFiltroEquipo(normKey(opt.key));
                    setPage(1);
                  }}
                >
                  {opt.label}
                  <span className="chip">{opt.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="filters-card">
          <div className="filters-head">
            <h3>Filtros de búsqueda</h3>
            <p>Usa uno o varios criterios para encontrar registros específicos.</p>
          </div>

          <div className="filter-grid">
            <input
              type="text"
              value={filtroId}
              onChange={(e) => setFiltroId(e.target.value)}
              placeholder="ID..."
            />

            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
            />

            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.nombre_cliente}>
                  {c.nombre_cliente}
                </option>
              ))}
            </select>

            <select
              value={filtroOcupacion}
              onChange={(e) => setFiltroOcupacion(e.target.value)}
            >
              <option value="">Todas las ocupaciones</option>
              {ocupaciones.map((o) => (
                <option key={o.id} value={`${o.codigo} - ${o.nombre}`}>
                  {o.codigo} - {o.nombre}
                </option>
              ))}
            </select>

            <select
              value={filtroTarea}
              onChange={(e) => setFiltroTarea(e.target.value)}
            >
              <option value="">Todas las tareas</option>
              {todasTareas.map((t) => (
                <option key={t.id} value={`${t.codigo} - ${t.nombre}`}>
                  {t.codigo} - {t.nombre}
                </option>
              ))}
            </select>

            {isAdminGlobal ? (
              <select
                value={filtroEquipo}
                onChange={(e) => setFiltroEquipo(normKey(e.target.value))}
              >
                <option value="">Todos los equipos</option>
                {equiposDisponibles.map((eq) => (
                  <option key={eq.id} value={eq.nombre}>
                    {eq.nombre}
                  </option>
                ))}
              </select>
            ) : isAdminRolePool ? (
              <input
                type="text"
                value="Consultores asignados al rol"
                readOnly
                placeholder="Alcance por rol"
              />
            ) : (
              <input
                type="text"
                value={equipoUser}
                readOnly
                placeholder="Equipo"
              />
            )}

            <select
              value={filtroConsultor}
              onChange={(e) => setFiltroConsultor(e.target.value)}
              disabled={!isAdmin}
            >
              <option value="">
                {!isAdmin
                  ? (nombreUser || 'Consultor')
                  : isAdminRolePool
                    ? 'Consultores asignados al rol'
                    : 'Todos los consultores'}
              </option>

              {consultoresGlobales.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Nro. Caso Cliente..."
              value={filtroNroCasoCli}
              onChange={(e) => setFiltroNroCasoCli(e.target.value)}
            />

            <select
              value={filtroHorasAdic}
              onChange={(e) => setFiltroHorasAdic(e.target.value)}
            >
              <option value="">Horas Adicionales (todas)</option>
              <option value="SI">Sí</option>
              <option value="NO">No</option>
            </select>

            <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {MESES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Año (ej: 2026)"
              value={filtroAnio}
              onChange={(e) => setFiltroAnio(e.target.value)}
              min="2000"
              max="2100"
            />
          </div>

          <div className="filter-actions">
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setFiltroId('');
                setFiltroFecha('');
                setFiltroCliente('');
                setFiltroTarea('');
                setFiltroOcupacion('');
                setFiltroNroCasoCli('');
                setFiltroHorasAdic('');
                setFiltroMes('');
                setFiltroAnio('');
                setPage(1);
                if (!isAdmin) {
                  setFiltroConsultor(nombreUser);
                  setFiltroEquipo(normKey(equipoUser));
                } else if (isAdminEquipo) {
                  setFiltroConsultor('');
                  setFiltroEquipo(normKey(equipoUser));
                } else if (isAdminRolePool) {
                  setFiltroConsultor('');
                  setFiltroEquipo('');
                } else {
                  setFiltroConsultor('');
                  setFiltroEquipo('');
                }
              }}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <Modal
          isOpen={modalIsOpen}
          onRequestClose={closeModal}
          className="registro-modal-content"
          overlayClassName="registro-modal-overlay"
          bodyOpenClassName="registro-modal-body-open"
          htmlOpenClassName="registro-modal-html-open"
          contentLabel="Registro"
          shouldCloseOnOverlayClick={true}
          shouldCloseOnEsc={true}
          shouldFocusAfterRender={false}
          shouldReturnFocusAfterClose={false}
        >
          <div className="registro-modal-shell">
            <div className="registro-modal-header">
              <div>
                <div className="registro-modal-kicker">Formulario</div>
                <h3 className="registro-modal-title">
                  {modoEdicion ? 'Editar Registro' : 'Nuevo Registro'}
                </h3>
              </div>

              <button
                className="registro-modal-close"
                onClick={closeModal}
                aria-label="Cerrar"
                type="button"
              >
                ✖
              </button>
            </div>

            <div className="registro-modal-body">
              <form onSubmit={handleSubmit}>
                <div className="registro-section-title">
                  <h4>Información general</h4>
                  <p>Completa los datos principales del registro.</p>
                </div>

                <div className="registro-form-grid">
                  {modulos.length > 1 ? (
                    <select
                      ref={firstFieldRef}
                      value={moduloElegido}
                      onChange={(e) => {
                        setModuloElegido(e.target.value);
                        setRegistro(r => ({ ...r, modulo: e.target.value }));
                      }}
                      required
                    >
                      <option value="">Seleccionar Módulo</option>
                      {modulos.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input
                      ref={firstFieldRef}
                      type="text"
                      value={modulos[0] || ''}
                      readOnly
                      placeholder="Módulo"
                    />
                  )}

                  <input
                    type="text"
                    value={registro.equipo || userEquipoUpper}
                    readOnly
                    placeholder="Equipo"
                  />

                  <input
                    type="date"
                    value={registro.fecha}
                    max={todayISO}
                    onChange={(e) => setRegistro({ ...registro, fecha: e.target.value })}
                    required
                    title="Puedes editar fechas pasadas o de hoy, pero no fechas futuras"
                  />

                  <select
                    value={registro.cliente}
                    onChange={(e) => {
                      const nextCliente = e.target.value;

                      setRegistro((r) => {
                        const next = { ...r, cliente: nextCliente };

                        if (showProyectoUI) {
                          next.proyecto_id = "";
                          next.proyecto_codigo = "";
                          next.proyecto_nombre = "";
                          next.proyecto_fase = "";
                          next.fase_proyecto_id = "";
                        }

                        return next;
                      });

                      if (showProyectoUI) {
                        setFasesProyecto([]);
                      }
                    }}
                    required
                    disabled={
                      OCCUPATIONS_ONLY_HITSS.has(occCodeSeleccionada) &&
                      clientesDisponibles.length <= 1
                    }
                  >
                    <option value="">Seleccionar Cliente</option>
                    {clientesDisponibles.map((c) => (
                      <option key={c.id} value={c.nombre_cliente}>
                        {c.nombre_cliente}
                      </option>
                    ))}
                  </select>

                  <select
                    value={ocupacionSeleccionada}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOcupacionSeleccionada(value);
                      setRegistro(r => ({
                        ...r,
                        ocupacion_id: value ? parseInt(value, 10) : '',
                        tarea_id: '',
                        tipoTarea: '',
                        proyecto_id: '',
                        proyecto_codigo: '',
                        proyecto_nombre: '',
                        proyecto_fase: '',
                        fase_proyecto_id: '',
                      }));
                      setFasesProyecto([]);
                    }}
                    required
                  >
                    <option value="">Seleccionar Ocupación</option>
                    {ocupaciones.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.codigo} - {o.nombre}
                      </option>
                    ))}
                  </select>

                  <select
                    value={registro.tarea_id || ""}
                    onChange={(e) => {
                      const tareaId = Number(e.target.value);
                      const tareaObj = tareasDeOcupacion.find(t => Number(t.id) === Number(tareaId));

                      setRegistro(r => ({
                        ...r,
                        tarea_id: tareaId,
                        tipoTarea: tareaObj ? `${tareaObj.codigo} - ${tareaObj.nombre}` : ""
                      }));
                    }}
                    required
                    disabled={!ocupacionSeleccionada || tareasDeOcupacion.length === 0}
                  >
                    <option value="">Seleccionar Tarea</option>
                    {tareasDeOcupacion.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} - {t.nombre}
                      </option>
                    ))}
                  </select>

                  {showProyectoUI && (
                    <>
                      <select
                        value={registro.proyecto_id || ""}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const p = proyectosFiltradosPorCliente.find(x => String(x.id) === String(pid));

                          const fases = Array.isArray(p?.fases) ? p.fases : [];
                          setFasesProyecto(fases);

                          const firstFase = fases.length ? fases[0] : null;

                          setRegistro((r) => ({
                            ...r,
                            proyecto_id: pid,
                            proyecto_codigo: p?.codigo || "",
                            proyecto_nombre: p?.nombre || "",
                            nroCasoCliente: p?.codigo ? String(p.codigo) : r.nroCasoCliente,
                            fase_proyecto_id: firstFase ? String(firstFase.id) : "",
                            proyecto_fase: firstFase ? String(firstFase.nombre) : "",
                          }));
                        }}
                        required
                        disabled={loadingProyectos || !registro.cliente || proyectosFiltradosPorCliente.length === 0}
                      >
                        <option value="">
                          {loadingProyectos
                            ? "Cargando proyectos..."
                            : !registro.cliente
                              ? "Selecciona un cliente primero"
                              : (proyectosFiltradosPorCliente.length === 0 ? "No hay proyectos para este cliente" : "Seleccionar Proyecto")}
                        </option>

                        {proyectosFiltradosPorCliente.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codigo} - {p.nombre}
                          </option>
                        ))}
                      </select>

                      {Array.isArray(fasesProyecto) && fasesProyecto.length > 0 && (
                        <select
                          value={registro.fase_proyecto_id || ""}
                          onChange={(e) => {
                            const faseId = e.target.value;
                            const faseObj = fasesProyecto.find(f => String(f.id) === String(faseId));

                            setRegistro(r => ({
                              ...r,
                              fase_proyecto_id: faseId,
                              proyecto_fase: faseObj?.nombre || "",
                            }));
                          }}
                          required
                        >
                          <option value="">Seleccionar Fase</option>
                          {fasesProyecto.map((fx) => (
                            <option key={fx.id} value={fx.id}>
                              {fx.nombre}
                            </option>
                          ))}
                        </select>
                      )}

                      <input
                        type="text"
                        value={registro.proyecto_fase || ""}
                        readOnly
                        placeholder="Fase seleccionada"
                      />
                    </>
                  )}

                  <input
                    type="text"
                    placeholder="Nro Caso Cliente"
                    value={registro.nroCasoCliente}
                    onChange={(e) => setRegistro({ ...registro, nroCasoCliente: e.target.value })}
                  />

                  <input
                    type="text"
                    placeholder="Nro Caso Interno"
                    value={registro.nroCasoInterno}
                    onChange={(e) => setRegistro({ ...registro, nroCasoInterno: e.target.value })}
                  />

                  <input
                    type="text"
                    placeholder="Nro Caso Escalado SAP"
                    value={registro.nroCasoEscaladoSap}
                    onChange={(e) => setRegistro({ ...registro, nroCasoEscaladoSap: e.target.value })}
                  />

                  <div className="registro-inline-2">
                    <input
                      type="time"
                      value={registro.horaInicio}
                      onChange={(e) => setRegistro({ ...registro, horaInicio: e.target.value })}
                      required
                    />
                    <input
                      type="time"
                      value={registro.horaFin}
                      onChange={(e) => setRegistro({ ...registro, horaFin: e.target.value })}
                      required
                    />
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="Tiempo Facturable"
                    value={registro.tiempoFacturable}
                    onChange={(e) => setRegistro({ ...registro, tiempoFacturable: e.target.value })}
                    className="span-2"
                  />

                  {equipoFormulario === 'BASIS' && (
                    <>
                      <select
                        value={registro.actividadMalla}
                        onChange={(e) => setRegistro({ ...registro, actividadMalla: e.target.value })}
                      >
                        <option value="">Seleccionar Actividad de Malla</option>
                        {actividadMalla.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={registro.oncall}
                        onChange={(e) => setRegistro({ ...registro, oncall: e.target.value })}
                      >
                        <option value="">ONCALL</option>
                        {oncall.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={registro.desborde}
                        onChange={(e) => setRegistro({ ...registro, desborde: e.target.value })}
                      >
                        <option value="">Desborde</option>
                        {desborde.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                      </select>
                    </>
                  )}

                  <textarea
                    placeholder="Descripción"
                    value={registro.descripcion}
                    onChange={(e) =>
                      setRegistro({ ...registro, descripcion: e.target.value })
                    }
                    className="span-3"
                  />
                </div>

                <div className="registro-modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {modoEdicion ? 'Actualizar' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>

        <div className="table-wrap">
          <div className="table-scroll sticky-actions">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Módulo</th>
                  <th>Equipo</th>
                  <th>Cliente</th>
                  <th>Nro. Caso Cliente</th>
                  <th>Nro. Caso Interno</th>
                  <th>Nro. Caso Escalado SAP</th>
                  <th>Ocupacion</th>
                  <th>Tipo Tarea Azure</th>
                  <th>Consultor</th>
                  <th>Hora Inicio</th>
                  <th>Hora Fin</th>
                  <th className="num">Tiempo Invertido</th>
                  <th className="num">Tiempo Facturable</th>
                  {isBASISTable && <th>ONCALL</th>}
                  {isBASISTable && <th>Desborde</th>}
                  <th>Horas Adicionales</th>
                  <th className="truncate">Descripción</th>
                  <th className="actions">Acciones</th>
                  {isAdmin && <th>Bloqueado</th>}
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.pageRows.map((r) => (
                  <RegistroRow
                    key={r.id}
                    r={r}
                    isBASISTable={isBASISTable}
                    isAdmin={isAdmin}
                    moduloUser={moduloUser}
                    nombreUser={nombreUser}
                    onEditar={handleEditar}
                    onEliminar={handleEliminar}
                    onCopiar={handleCopiar}
                    onToggleBloqueado={toggleBloqueado}
                  />
                ))}
                {registrosFiltrados.total === 0 && (
                  <tr>
                    <td colSpan={colSpanTabla} className="muted">Sin registros</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="registro-pagination">
              <button
                className="btn btn-outline"
                disabled={registrosFiltrados.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ◀
              </button>

              <span className="registro-pagination-text">
                Página {registrosFiltrados.page} / {registrosFiltrados.totalPages} — {registrosFiltrados.total} registros
              </span>

              <button
                className="btn btn-outline"
                disabled={registrosFiltrados.page >= registrosFiltrados.totalPages}
                onClick={() => setPage((p) => Math.min(registrosFiltrados.totalPages, p + 1))}
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {error && <div className="registro-error-box">Error: {error}</div>}

        {canViewCapacidadSemanal && (
          <CapacidadSemanalModal
            isOpen={capacidadModalOpen}
            onClose={() => setCapacidadModalOpen(false)}
            filtroEquipo={equipoLocked}
            filtroConsultor={filtroConsultor}
            filtroMes={filtroMes}
            filtroAnio={filtroAnio}
            equipoBloqueado={isAdminEquipo}
          />
        )}

        {/* <Resumen
          userData={userData}
          filtroEquipo={filtroEquipo}
          filtroConsultor={filtroConsultor}
          filtroMes={filtroMes}
          filtroAnio={filtroAnio} 
        />*/}
      </div>
    </div>
  );
};

export default Registro;
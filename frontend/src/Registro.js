import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import './Registro.css';
import { jfetch } from './lib/api';
import Resumen from './Resumen';
import { exportRegistrosExcelXLSX_ALL } from "./lib/exportExcel";


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
    equipo: ''
  };
}

const EXCEPCION_8H_USERS = new Set([
  'serranoel','chaburg','torresfaa','jose.raigosa','camargoje',
  'duqueb','diazstef','castronay','sierrag','tarquinojm','celyfl'
]);

const CLIENTE_RESTRINGIDO = 'HITSS/CLARO';
const CODES_NEED_CASE = new Set(['01','02','03']);
const CODES_RESTRICTED_CLIENT_9H = new Set(['09','13','14','15']);
const CODE_SUPERVISION_EQUIPO = '06';
const USERS_PUEDE_SEMANAS_ANTERIORES = new Set([
  'johngaravito'
]);


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
  if (!range || typeof range !== 'string' || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(range)) return null;
  const [ini, fin] = range.split('-');
  const a = parseHHMM(ini);
  const b = parseHHMM(fin);
  if (!a || !b) return null;
  return { ini: a, fin: b };
};

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
  let end   = toMinutes(fin);
  if (end <= start) end += 24 * 60;
  let inWorkStart = toMinutes(rango.ini);
  let inWorkEnd   = toMinutes(rango.fin);
  if (inWorkEnd <= inWorkStart) inWorkEnd += 24 * 60;
  const fueraInicio = start < inWorkStart;
  const fueraFin    = end   > inWorkEnd;
  return (fueraInicio || fueraFin) ? 'Sí' : 'No';
};

const normKey = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');


const equipoOf = (r, fallback = 'SIN EQUIPO') => {
  const raw = (r?.equipo ?? r?.EQUIPO ?? r?.equipo_nombre ?? r?.equipoName ?? '');
  const n = normKey(raw);
  return n || fallback;
};

function buildLocalResumen(registros, nombre, usuarioLogin) {
  if (!Array.isArray(registros)) return [];
  const login = String(usuarioLogin || '').toLowerCase();
  const metaBase = EXCEPCION_8H_USERS.has(login) ? 8 : 9;

  const byFecha = new Map();

  for (const r of registros) {
    const fecha = r?.fecha;
    if (!fecha) continue;
    const horas = Number(r?.tiempoInvertido ?? 0);
    if (!Number.isFinite(horas)) continue;

    const tipo = String(r?.tipoTarea || '').toUpperCase();
    const esDisponible = tipo.includes('DISPONIBLE');

    if (!byFecha.has(fecha)) {
      byFecha.set(fecha, { total: 0, disponible: false });
    }
    const bucket = byFecha.get(fecha);
    bucket.total += horas;
    bucket.disponible = bucket.disponible || esDisponible;
  }

  return Array.from(byFecha.entries()).map(([fecha, { total, disponible }]) => {
    const metaDelDia = disponible ? 0 : metaBase;
    return {
      consultor: nombre || (registros[0]?.consultor ?? ''),
      fecha,
      total_horas: Math.round(total * 100) / 100,
      estado: total >= metaDelDia ? 'Al día' : 'Incompleto'
    };
  });
}

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

const normSiNo = (val) => {
  if (val === null || val === undefined) return 'N/D';
  const s = String(val).trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (['si','sí','s','true','1'].includes(s)) return 'SI';
  if (['no','n','false','0'].includes(s)) return 'NO';
  return 'N/D';
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

const isDateInRangeISO = (iso, minISO, maxISO) => {
  if (!iso) return false;
  return iso >= minISO && iso <= maxISO; 
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
    // prioridad por consultor_id si existe
    if (cid && r?.consultor_id != null) return String(r.consultor_id) === cid;

    // fallback por usuario / nombre
    if (r?.usuario) return String(r.usuario).trim().toLowerCase() === String(usuarioLogin).trim().toLowerCase();
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

    // solape o duplicado exacto
    if (rangesOverlap(nuevo, oldRange)) return r;
  }

  return null;
};


function taskCode(value){
  return (String(value || '').match(/^\d+/)?.[0] ?? '');
}
function isInvalidCaseNumber(nro){
  const s = String(nro ?? '').trim().toUpperCase();
  return !s || s === '0' || s === 'NA' || s === 'N/A' || s.length > 10;
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


const Registro = ({ userData }) => {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [registros, setRegistros]   = useState([]);
  const [error, setError]           = useState('');
  const excelInputRef = useRef(null);
  const { minISO: weekMinISO, maxISO: weekMaxISO, todayISO } = useMemo(() => getWeekBoundsISO(new Date()), []);


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
  const puedeSemanasAnteriores = USERS_PUEDE_SEMANAS_ANTERIORES.has(usuarioLogin);

  useEffect(() => {
    localStorage.setItem('filtroEquipo', filtroEquipo);
  }, [filtroEquipo]);

  const rolUpper = String(rol || "").toUpperCase();
  const isAdmin = rolUpper.startsWith("ADMIN");
  const isAdminGlobal = rolUpper === "ADMIN";
  const isAdminEquipo = isAdmin && !isAdminGlobal;

  const miEquipo = String(equipoUser || "").trim().toUpperCase();
  const equipoLocked = isAdminEquipo ? miEquipo : filtroEquipo;

  const userEquipoUpper = String(equipoUser || '').toUpperCase();


  const canDownload = ['rodriguezso','valdezjl', 'gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());
  const [importingExcel, setImportingExcel] = useState(false);
  const canImportExcel = ['gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());


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
  const [tareasBD, setTareasBD] = useState([]);
  const filtroNroCasoCliDeb = useDebouncedValue(filtroNroCasoCli, 300);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 250;

  const pendingEditTareaIdRef = useRef(null);

  useEffect(() => {
    const v = userData?.activo ?? userData?.user?.activo;
    if (v !== undefined) setConsultorActivo(isActiveValue(v));
  }, [userData]);


  useEffect(() => {
    const pendingId = pendingEditTareaIdRef.current;

    if (!modoEdicion) return;
    if (!pendingId) return;
    if (!Array.isArray(tareasBD) || tareasBD.length === 0) return;

    const tareaObj = tareasBD.find(t => Number(t.id) === Number(pendingId));
    if (!tareaObj) return;

    setRegistro((r) => ({
      ...r,
      tarea_id: Number(pendingId),
      tipoTarea: r.tipoTarea || `${tareaObj.codigo} - ${tareaObj.nombre}`,
    }));

    pendingEditTareaIdRef.current = null;
  }, [tareasBD, modoEdicion]);


  useEffect(() => {
    setPage(1);
  }, [
    filtroId,
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
        const [eqRes, cliRes, ocuRes] = await Promise.all([
          jfetch('/equipos'),
          jfetch('/clientes'),
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

        setEquiposDisponibles(Array.isArray(eqData) ? eqData : []);
        setClientes(Array.isArray(cliData) ? cliData : []);

        const ocus = Array.isArray(ocuData) ? ocuData : [];
        setOcupaciones(ocus);

        const map = new Map();
        ocus.forEach(o => (o.tareas || []).forEach(t => {
          if (t && !map.has(t.id)) map.set(t.id, t);
        }));
        setTodasTareas(Array.from(map.values()));
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

  const registrosAbortRef = useRef(null);

  const fetchRegistros = useCallback(async () => {
    setError("");

    if (registrosAbortRef.current) {
      try { registrosAbortRef.current.abort(); } catch {}
    }
    const controller = new AbortController();
    registrosAbortRef.current = controller;

    try {
      const params = new URLSearchParams();

      if (equipoLocked) params.set("equipo", equipoLocked);

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

      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      setRegistros(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setRegistros([]);
      setError(String(e.message || e));
    }
  }, [usuarioLogin, rol, equipoUser, equipoLocked]);

  const normMod = (v) => String(v || "").trim();
  const uniq = (arr) => Array.from(new Set((arr || []).map(normMod).filter(Boolean)));


  useEffect(() => {
    if (!usuarioLogin) return;

    (async () => {
      try {
        const res = await jfetch(`/consultores/datos?usuario=${encodeURIComponent(usuarioLogin)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        // ✅ NUEVO: setear activo
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
  }, [userData, usuarioLogin, fetchRegistros]);

  const resolveModulosForEdit = useCallback((reg) => {
    // prioridad: lo que venga en el registro (por si el registro ya trae el módulo usado)
    const fromRegistro = reg?.modulo ? [reg.modulo] : [];

    // luego lo que ya tienes en estado (catálogo del usuario)
    const fromState = Array.isArray(modulos) ? modulos : [];

    // luego lo que venga del userData (fallback)
    const fromUser = getModulosLocal(userData);

    return uniq([...fromRegistro, ...fromState, ...fromUser]);
  }, [modulos, userData]);


  const consultoresUnicos = useMemo(() =>
    Array.isArray(registros)
      ? [...new Set(registros.map(r => r?.consultor).filter(Boolean))]
      : []
  , [registros]);

  const equiposConConteo = useMemo(() => {
    const map = new Map();
    (registros || []).forEach(r => {
      const k = equipoOf(r);
      map.set(k, (map.get(k) || 0) + 1);
    });
    const total = (registros || []).length;
    const arr = Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
    return [{ key:'', label:'Todos', count: total }, ...arr.map(([k,c])=>({ key:k, label:k, count:c }))];
  }, [registros]);

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

    if (r?.ocupacion_id && ocupacionLabelByTareaId.size) {
    }
    const tipo = String(r?.tipoTarea || "").trim();
    const key = tipo.toUpperCase();
    const tareaId = tareaIdByCodigoNombre.get(key);

    if (!tareaId) return "—";
    return ocupacionLabelByTareaId.get(tareaId) || "—";
  }, [tareaIdByCodigoNombre, ocupacionLabelByTareaId]);


  const registrosFiltrados = useMemo(() => {
    const base = Array.isArray(registros) ? registros : [];

    // 1) Filtrar
    const rows = base.filter((r) => {
      if (String(filtroId || '').trim() !== '') {
        const idBuscado = String(filtroId).trim();
        const idRegistro = String(r.id ?? r.registro_id ?? r.id_registro ?? '').trim();

        if (!idRegistro.includes(idBuscado)) return false;
      }
      if (filtroEquipo && equipoOf(r) !== normKey(filtroEquipo)) return false;
      if (filtroFecha && r.fecha !== filtroFecha) return false;
      if (filtroCliente && r.cliente !== filtroCliente) return false;
      if (filtroOcupacion && obtenerOcupacionDeRegistro(r) !== filtroOcupacion) return false;
      if (filtroTarea && r.tipoTarea !== filtroTarea) return false;
      if (filtroConsultor && r.consultor !== filtroConsultor) return false;

      if (filtroNroCasoCliDeb) {
        const val = String(r.nroCasoCliente || "").toLowerCase();
        const needle = String(filtroNroCasoCliDeb || "").toLowerCase();
        if (!val.includes(needle)) return false;
      }

      if (filtroHorasAdic) {
        if (normSiNo(r.horasAdicionales) !== filtroHorasAdic) return false;
      }

      if (filtroMes || filtroAnio) {
      const f = String(r.fecha || "");
      const [yyyy, mm] = f.split("-");

      if (filtroAnio && yyyy !== String(filtroAnio)) return false;
      if (filtroMes && mm !== String(filtroMes)) return false;
      }
      return true;
    });

    
    const sorted = rows.slice().sort((a, b) => {
      const ia = Number(a?.id ?? a?.registro_id ?? a?.id_registro ?? 0);
      const ib = Number(b?.id ?? b?.registro_id ?? b?.id_registro ?? 0);
      if (ia !== ib) return ia - ib;

      const da = new Date(a?.fecha || "1970-01-01");
      const db = new Date(b?.fecha || "1970-01-01");
      return da - db;
    });

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const start = (safePage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    return {
      total,
      totalPages,
      page: safePage,
      pageRows: sorted.slice(start, end),
      allRows: sorted, 
    };
  }, [
    registros,
    filtroId,
    filtroEquipo,
    filtroFecha,
    filtroCliente,
    filtroOcupacion,
    filtroTarea,
    filtroConsultor,
    filtroNroCasoCliDeb,
    filtroHorasAdic,
    filtroMes,
    filtroAnio,
    obtenerOcupacionDeRegistro,
    page,
  ]);



  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAdmin && !consultorActivo) {
      return Swal.fire({
        icon: "warning",
        title: "Usuario inactivo",
        text: "No puedes registrar horas porque tu usuario está inactivo.",
      });
    }

    const { minISO: weekMinISO, maxISO: weekMaxISO } = getWeekBoundsISO(new Date());

    if (!puedeSemanasAnteriores && !isDateInRangeISO(registro.fecha, weekMinISO, weekMaxISO)) {
      return Swal.fire({
        icon: "warning",
        title: "Fecha fuera de la semana actual",
        text: `Solo puedes registrar entre ${weekMinISO} y ${weekMaxISO}.`,
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
        title: "Horas duplicadas o solapadas",
        html: `Ya existe un registro que se cruza con este rango:<br/><b>${conflict.horaInicio} - ${conflict.horaFin}</b> (ID: ${conflict.id})`,
      });
    }

    const code = taskCode(registro.tipoTarea);

    if (CODES_NEED_CASE.has(code) && isInvalidCaseNumber(registro.nroCasoCliente)) {
      return Swal.fire({
        icon: "warning",
        title: "Número de caso inválido",
        text:
          'Para las tareas 01, 02 o 03, el Nro. Caso Cliente no puede ser "0", "NA", estar vacío ni superar los 10 caracteres.',
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
      const poolModulos = [moduloElegido, moduloUser, ...(modulos || [])].map((v) =>
        String(v || "")
          .trim()
          .toUpperCase()
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
      /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(horarioUsuario) ? horarioUsuario : null
    );

    const moduloFinal = (moduloElegido || modulos[0] || moduloUser || "").trim();

    if (!moduloFinal || moduloFinal.trim() === "") {
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
      ocupacion_id: ocupacionSeleccionada ? parseInt(ocupacionSeleccionada) : null,
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

    const payload = { ...base };
    payload.nombre = nombreConsultor;
    payload.consultor = nombreConsultor;
    payload.modulo = moduloFinal;

    if (equipoFormulario !== "BASIS") {
      delete payload.actividadMalla;
      delete payload.oncall;
      delete payload.desborde;
    }

    try {
      const path = modoEdicion ? `/editar-registro/${registro.id}` : "/registrar-hora";
      const method = modoEdicion ? "PUT" : "POST";

      const resp = await jfetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
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

      setRegistro(initRegistro());
      setModuloElegido(modulos.length === 1 ? modulos[0] : "");
      setModoEdicion(false);
      setOcupacionSeleccionada("");
      setModalIsOpen(false);
    } catch (e) {
      Swal.fire({ icon: "error", title: String(e.message || e) });
    }
  };



    const handleEditar = (reg) => {
      // 1) TareaId robusto (puede venir como tarea_id, tarea.id o por texto tipoTarea)
      const tareaId =
        reg?.tarea_id ??
        reg?.tarea?.id ??
        (tareaIdByCodigoNombre.get(String(reg?.tipoTarea || "").trim().toUpperCase()) || null);

      //const tareaIdStr = tareaId ? String(tareaId) : "";

      // 2) Ocupación: si no viene, la inferimos desde ocupaciones->tareas
      let ocupacionId =
        reg?.ocupacion_id ? String(reg.ocupacion_id) : "";

      if (!ocupacionId && tareaId && Array.isArray(ocupaciones) && ocupaciones.length) {
        const occ = ocupaciones.find(o => (o.tareas || []).some(t => Number(t.id) === Number(tareaId)));
        if (occ?.id) ocupacionId = String(occ.id);
      }

      // 3) Deja pendiente la tarea para aplicarla cuando cargue tareasBD
      pendingEditTareaIdRef.current = tareaId ? Number(tareaId) : null;

      // 4) Setea formulario
      setRegistro({
        ...initRegistro(),

        id: reg.id,
        fecha: reg.fecha,
        cliente: reg.cliente,

        nroCasoCliente: reg.nroCasoCliente,
        nroCasoInterno: reg.nroCasoInterno,
        nroCasoEscaladoSap: reg.nroCasoEscaladoSap,

        
        tarea_id: tareaId ? Number(tareaId) : "",
        tipoTarea: reg?.tarea
          ? `${reg.tarea.codigo} - ${reg.tarea.nombre}`
          : (reg?.tipoTarea || ""),

        ocupacion_id: ocupacionId,

        horaInicio: reg.horaInicio,
        horaFin: reg.horaFin,

        tiempoInvertido: reg.tiempoInvertido,
        tiempoFacturable: reg.tiempoFacturable,
        horasAdicionales: reg.horasAdicionales,
        descripcion: reg.descripcion,

        actividadMalla: reg.actividadMalla,
        oncall: reg.oncall,
        desborde: reg.desborde,

        consultor_id: reg.consultor_id,
        equipo: reg.equipo,
        modulo: reg.modulo
      });

      
      setOcupacionSeleccionada(ocupacionId);

      const pool = resolveModulosForEdit(reg);
      setModulos(pool);

      const preferido = reg?.modulo ? String(reg.modulo).trim() : "";
      const moduloSel = pool.length === 1 ? pool[0] : (preferido || "");
      setModuloElegido(moduloSel);

      setRegistro((prev) => ({ ...prev, modulo: moduloSel }));

      setModoEdicion(true);
      setModalIsOpen(true);
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
        const j = await resp.json().catch(()=> ({}));
        return Swal.fire({ icon:'error', title: j?.mensaje || `HTTP ${resp.status}` });
      }
      Swal.fire({ icon:'success', title:'Eliminado' });
      fetchRegistros();
      window.dispatchEvent(new Event("resumen-actualizar"));
    }
  };

  const handleCopiar = (reg) => {
    const copia = { ...reg };
    delete copia.id;

    const pool = resolveModulosForEdit(reg);
    setModulos(pool);

    const moduloPref = reg?.modulo ? String(reg.modulo).trim() : "";
    const moduloSel = pool.length === 1 ? pool[0] : (moduloPref || "");
    setModuloElegido(moduloSel);

    const newHoraInicio = reg?.horaFin || "";

    setRegistro({
      ...initRegistro(),
      ...copia,
      id: null,
      modulo: moduloSel,
      equipo: equipoOf(copia, userEquipoUpper),

      horaInicio: newHoraInicio,
      horaFin: "", 
    });

    
    let occId = "";
    if (reg?.tarea_id || reg?.tarea?.id) {
      const tid = reg?.tarea_id ?? reg?.tarea?.id;
      const occ = ocupaciones.find(o => (o.tareas || []).some(t => Number(t.id) === Number(tid)));
      if (occ?.id) occId = String(occ.id);
    } else if (reg?.tipoTarea && todasTareas.length && ocupaciones.length) {
      const tarea = todasTareas.find(
        t => reg.tipoTarea === `${t.codigo} - ${t.nombre}` ||
            (t.codigo && String(reg.tipoTarea).startsWith(t.codigo))
      );
      if (tarea) {
        const occ = ocupaciones.find(o => (o.tareas || []).some(tt => tt.id === tarea.id));
        if (occ) occId = String(occ.id);
      }
    }

    setOcupacionSeleccionada(occId);

    setModoEdicion(false);
    setModalIsOpen(true);
  };


  const toggleBloqueado = async (id) => {
    try {
      const resp = await jfetch(`/toggle-bloqueado/${id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: isAdmin ? 'ADMIN' : (rol || '') })
      });
      if (!resp.ok) throw new Error((await resp.json().catch(()=>({})))?.mensaje || `HTTP ${resp.status}`);
      fetchRegistros();
    } catch (e) {}
  };

  const actividadMalla = ['AC','CRU1','CRU2','CRU3','DC','DE','DF','IN','ON','T1E','T1I','T1X','T2E','T2I','T2X','T3','VC', 'SAT', 'N/APLICA'];
  const oncall = ['SI','NO','N/A'];
  const desborde = ['SI','NO','N/A'];
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


  const handleExport = () => {
    const visible = registrosFiltrados?.allRows || [];
    exportRegistrosExcelXLSX_ALL(
      visible,
      `registros_${new Date().toISOString().slice(0,10)}.xlsx`,
      {
        'Consultor filtro': filtroConsultor || 'Todos',
        'Tarea filtro': filtroTarea || 'Todas',
        'Cliente filtro': filtroCliente || 'Todos',
        'Equipo filtro': filtroEquipo || 'Todos',
        'Nro Caso Cliente filtro': filtroNroCasoCli || 'Todos',
        'Horas Adicionales filtro': filtroHorasAdic || 'Todas',
        'Fecha filtro': filtroFecha || 'Todas',
        'Generado': new Date().toLocaleString()
      }
    );
  };


  useEffect(() => {
    if (!userData) return;
    if (!isAdmin) {
      setFiltroConsultor(nombreUser);
      setFiltroEquipo(normKey(equipoUser));
    }else {
      setFiltroConsultor('');
      setFiltroEquipo('');
    }
  }, [isAdmin, nombreUser, equipoUser, userData]);

  useEffect(() => {
    if (!ocupacionSeleccionada) {
      setTareasBD([]);
      return;
    }

    const cargarTareas = async () => {
      try {
        const res = await jfetch(`/ocupaciones/${ocupacionSeleccionada}/tareas`);
        const data = await res.json();
        setTareasBD(Array.isArray(data) ? data : []);
      } catch (err) {
        setTareasBD([]);
      }
    };

    cargarTareas();
  }, [ocupacionSeleccionada]);

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

  const handleAbrirModalRegistro = async () => {
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

      setOcupacionSeleccionada("");
      setModoEdicion(false);
      setModalIsOpen(true);
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
    let cols = 19; // ✅ antes 18, ahora +1 por ID
    if (isBASISTable) cols += 2;
    if (isAdmin) cols += 1;
    return cols;
  }, [isBASISTable, isAdmin]);


  return (
    <div className="container">
      <div className="page-head">
          <div className="page-title">
            <h2>Registro de Horas</h2>
            <p className="subtitle">
              Filtra por fecha, cliente, tarea, consultor, equipo, Nro. de caso y horas adicionales
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

            <button
              className="btn btn-primary"
              onClick={handleAbrirModalRegistro}
              disabled={!isAdmin && !consultorActivo}
              title={!isAdmin && !consultorActivo ? "Usuario inactivo" : "Agregar Registro"}
            >
              Agregar Registro
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
                className={`team-btn ${filtroEquipo === opt.key ? "is-active" : ""}`}
                onClick={() => setFiltroEquipo(normKey(opt.key))}

              >
                {opt.label}
                <span className="chip">{opt.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}


      {/* FILTROS */}
      <div className="filters-card">
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

          {/* Clientes desde la BD */}
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

          {/* Ocupación */}
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

          {/* Tarea Azure */}
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
              {isAdmin ? 'Todos los consultores' : (nombreUser || 'Consultor')}
            </option>
            {consultoresUnicos.map((c, idx) => (
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
            onClick={() => {
              setFiltroId('');
              setFiltroFecha('');
              setFiltroCliente('');
              setFiltroTarea('');
              setFiltroOcupacion('');
              setFiltroNroCasoCli('');
              setFiltroHorasAdic('');
              if (isAdmin) {
                setFiltroConsultor('');
                setFiltroEquipo('');
              } else {
                setFiltroConsultor(nombreUser);
                setFiltroEquipo(normKey(equipoUser));
              }
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* MODAL */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => setModalIsOpen(false)}
        className="modal-content"
        overlayClassName="modal-overlay"
        contentLabel="Registro"
      >
        <div>
          <div className="modal-header">
            <h3 className="modal-title">{modoEdicion ? 'Editar Registro' : 'Nuevo Registro'}</h3>
            <button className="close-button" onClick={() => setModalIsOpen(false)} aria-label="Cerrar">✖</button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                {/* Módulo */}
                {modulos.length > 1 ? (
                  <select
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
                  min={puedeSemanasAnteriores ? undefined : weekMinISO}
                  max={puedeSemanasAnteriores ? undefined : weekMaxISO}
                  onChange={(e) => setRegistro({ ...registro, fecha: e.target.value })}
                  required
                />
                {/* Clientes desde la BD */}
                <select
                  value={registro.cliente}
                  onChange={(e) => setRegistro({ ...registro, cliente: e.target.value })}
                  required
                >
                  <option value="">Seleccionar Cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.nombre_cliente}>
                      {c.nombre_cliente}
                    </option>
                  ))}
                </select>

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

                {/* Ocupación */}
                <select
                  value={ocupacionSeleccionada}
                  onChange={(e) => {
                    const value = e.target.value;
                    setOcupacionSeleccionada(value);
                    setRegistro(r => ({
                      ...r,
                      ocupacion_id: value ? parseInt(value, 10) : '',
                      tarea_id: '',
                      tipoTarea: ''
                    }));
                    pendingEditTareaIdRef.current = null;
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

                {/* Tarea filtrada por ocupación */}
                <select
                  value={registro.tarea_id || ""}
                  onChange={(e) => {
                    const tareaId = Number(e.target.value);
                    const tareaObj = tareasBD.find(t => t.id === tareaId);

                    setRegistro({
                      ...registro,
                      tarea_id: tareaId,
                      tipoTarea: tareaObj ? `${tareaObj.codigo} - ${tareaObj.nombre}` : ""
                    });
                  }}
                  required
                  disabled={!ocupacionSeleccionada || tareasBD.length === 0}
                >
                  <option value="">Seleccionar Tarea</option>
                  {tareasBD.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} - {t.nombre}
                    </option>
                  ))}
                </select>

                <div className="inline-2">
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
                  className="span-2"
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalIsOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  {modoEdicion ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      {/* TABLA PRINCIPAL */}
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
                <tr key={r.id}>
                  <td className="num">{r.id}</td> 
                  <td>{r.fecha}</td>
                  <td>{r.modulo ?? moduloUser}</td>
                  <td>{equipoOf(r)}</td>
                  <td>{r.cliente}</td>
                  <td>{r.nroCasoCliente}</td>
                  <td>{r.nroCasoInterno}</td>
                  <td>{r.nroCasoEscaladoSap}</td>
                  <td>{obtenerOcupacionDeRegistro(r)}</td>
                  <td>{r.tipoTarea || (r.tarea ? `${r.tarea.codigo} - ${r.tarea.nombre}` : "—")}</td>
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
                    <button className="icon-btn" onClick={() => handleEditar(r)} disabled={r.bloqueado} title="Editar">✏️</button>
                    <button className="icon-btn danger" onClick={() => handleEliminar(r.id)} disabled={r.bloqueado} title="Eliminar">🗑️</button>
                    <button className="icon-btn" onClick={() => handleCopiar(r)} title="Copiar">📋</button>
                  </td>
                  {isAdmin && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!!r.bloqueado}
                        onChange={() => toggleBloqueado(r.id)}
                        aria-label="Bloquear/Desbloquear fila"
                      />
                    </td>
                  )}
                </tr>
              ))}
              {registrosFiltrados.total === 0 && (
                <tr>
                  <td colSpan={colSpanTabla} className="muted">Sin registros</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
            <button
              className="btn btn-outline"
              disabled={registrosFiltrados.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>

            <span style={{ fontWeight: 800 }}>
              Página {registrosFiltrados.page} / {registrosFiltrados.totalPages} —{" "}
              {registrosFiltrados.total} registros
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

      {error && <div style={{color:'crimson', marginTop:10}}>Error: {error}</div>}
      <Resumen
        userData={userData}
        filtroEquipo={filtroEquipo}
        filtroConsultor={filtroConsultor}
        filtroMes={filtroMes}
        filtroAnio={filtroAnio}
      />
    </div>
  );
};

export default Registro;

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import './Registro.css';
import { jfetch } from './lib/api';
import Resumen from './Resumen';
import { exportRegistrosExcelXLSX_ALL } from "./lib/exportExcel";


Modal.setAppElement('#root');

const RegistroRow = React.memo(function RegistroRow({
  r,
  isBASISTable,
  isAdmin,
  moduloUser,
  nombreUser,
  onEditar,
  onEliminar,
  onCopiar,
  onToggleBloq,
}) {
  return (
    <tr>
      <td>{r.fecha}</td>
      <td>{r.modulo ?? moduloUser}</td>

      {/* ✅ mejor así */}
      <td>{equipoOf(r)}</td>

      <td>{r.cliente}</td>
      <td>{r.nroCasoCliente}</td>
      <td>{r.nroCasoInterno}</td>
      <td>{r.nroCasoEscaladoSap}</td>
      <td>{r.__occLabel}</td>
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
        <button className="icon-btn" onClick={() => onEditar(r)} disabled={r.bloqueado} title="Editar">✏️</button>
        <button className="icon-btn danger" onClick={() => onEliminar(r.id)} disabled={r.bloqueado} title="Eliminar">🗑️</button>
        <button className="icon-btn" onClick={() => onCopiar(r)} title="Copiar">📋</button>
      </td>

      {isAdmin && (
        <td>
          <input
            type="checkbox"
            checked={!!r.bloqueado}
            onChange={() => onToggleBloq(r.id)}
            aria-label="Bloquear/Desbloquear fila"
          />
        </td>
      )}
    </tr>
  );
});


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

const fechaToNum = (yyyyMMdd) => {
  // yyyy-mm-dd -> número comparable (20260202)
  if (!yyyyMMdd || typeof yyyyMMdd !== "string") return 0;
  const [y, m, d] = yyyyMMdd.split("-");
  if (!y || !m || !d) return 0;
  return (Number(y) * 10000) + (Number(m) * 100) + Number(d);
};

// construye label ocupación por tarea_id
const buildOcupacionLabelByTareaId = (ocupaciones = []) => {
  const map = new Map();
  for (const o of ocupaciones) {
    const label = `${o.codigo} - ${o.nombre}`;
    for (const t of (o.tareas || [])) {
      if (t?.id) map.set(Number(t.id), label);
    }
  }
  return map;
};


const parseHHMM = (s) => {
  if (!s || typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
};

const parseRange = (range) => {
  if (!range || typeof range !== 'string' || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(range)) return null;
  const [ini, fin] = range.split('-');
  const a = parseHHMM(ini);
  const b = parseHHMM(fin);
  if (!a || !b) return null;
  return { ini: a, fin: b };
};

const toMinutes = ({ h, m }) => h * 60 + m;

const calcularTiempo = (inicio, fin) => {
  const a = parseHHMM(inicio);
  const b = parseHHMM(fin);
  if (!a || !b) return 0;
  let start = toMinutes(a);
  let end   = toMinutes(b);
  if (end <= start) end += 24 * 60;
  const mins = end - start;
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

const Registro = ({ userData }) => {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [registros, setRegistros]   = useState([]);
  const [error, setError]           = useState('');
  const excelInputRef = useRef(null);

  const [registro, setRegistro] = useState(initRegistro());
  const [modoEdicion, setModoEdicion] = useState(false);

  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOcupacion, setFiltroOcupacion] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroNroCasoCli, setFiltroNroCasoCli] = useState('');
  const [filtroHorasAdic, setFiltroHorasAdic] = useState('');
  const [filtroMes, setFiltroMes] = useState("");   
  const [filtroAnio, setFiltroAnio] = useState(""); 

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

  const initialEquipo = () => {
    const raw = localStorage.getItem("filtroEquipo") || "";
    const v = normKey(raw);

    
    if (v === "TODOS") return "";

    return v; 
  };

const [filtroEquipo, setFiltroEquipo] = useState(initialEquipo);

  useEffect(() => {
    localStorage.setItem('filtroEquipo', filtroEquipo);
  }, [filtroEquipo]);

  const rolUpper = String(rol || "").trim().toUpperCase();

  const miEquipo = normKey(equipoUser || "");

  const isAdminGerentes = rolUpper === "ADMIN_GERENTES";
  const isAdminOportunidades = rolUpper === "ADMIN_OPORTUNIDADES";
  const isAdmin = rolUpper.startsWith("ADMIN") && !isAdminOportunidades && !isAdminGerentes;
  const isSoloPropio = rolUpper === "CONSULTOR" || isAdminOportunidades;
  const isAdminGlobal = rolUpper === "ADMIN";
  const isAdminEquipo = rolUpper.startsWith("ADMIN_");
  const equipoLocked = isSoloPropio
  ? ""
  : (isAdminGlobal ? (filtroEquipo || "") : miEquipo);

  const userEquipoUpper = String(equipoUser || '').toUpperCase();


  const canDownload = ['rodriguezso','valdezjl', 'gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());
  const [importingExcel, setImportingExcel] = useState(false);
  const canImportExcel = ['gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());


  const initialVista = () => {
    const persisted = localStorage.getItem('equipoView');
    if (persisted === 'BASIS' || persisted === 'FUNCIONAL') return persisted;
    return (userEquipoUpper === 'BASIS') ? 'BASIS' : 'FUNCIONAL';
  };
  const [vistaEquipo] = useState(initialVista);
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
  const PAGE_SIZE = 100;

  const pendingEditTareaIdRef = useRef(null);

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

  const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};

  const normalizeRegistro = (raw = {}) => {
    const tareaLabel =
      pick(raw, "tipoTarea", "tipoTareaAzure", "tipo_tarea", "tipo_tarea_azure") ||
      (raw?.tarea ? `${raw.tarea.codigo} - ${raw.tarea.nombre}` : "—");

    return {
      id: raw.id ?? raw.ID ?? null,
      bloqueado: !!pick(raw, "bloqueado", "is_bloqueado"),

      fecha: pick(raw, "fecha", "FECHA"),
      modulo: pick(raw, "modulo", "MODULO"),
      equipo: pick(raw, "equipo", "EQUIPO", "equipo_nombre", "equipoName"),
      cliente: pick(raw, "cliente", "CLIENTE"),

      nroCasoCliente: pick(raw, "nroCasoCliente", "nro_caso_cliente", "nro_caso", "nroCaso"),
      nroCasoInterno: pick(raw, "nroCasoInterno", "nro_caso_interno"),
      nroCasoEscaladoSap: pick(raw, "nroCasoEscaladoSap", "nro_caso_escalado", "nro_caso_escalado_sap"),

      ocupacion_id: raw.ocupacion_id ?? raw.ocupacionId ?? null,
      tarea_id: raw.tarea_id ?? raw.tareaId ?? (raw?.tarea?.id ?? null),
      tipoTarea: tareaLabel,

      consultor: pick(raw, "consultor", "usuario_consultor", "usuarioConsultor"),

      horaInicio: pick(raw, "horaInicio", "hora_inicio"),
      horaFin: pick(raw, "horaFin", "hora_fin"),

      tiempoInvertido: Number(
        pick(raw, "tiempoInvertido", "tiempo_invertido", "total_horas", "totalHoras") || 0
      ),
      tiempoFacturable: Number(
        pick(raw, "tiempoFacturable", "tiempo_facturable") || 0
      ),

      oncall: pick(raw, "oncall", "ONCALL"),
      desborde: pick(raw, "desborde", "DESBORDE"),

      horasAdicionales: pick(raw, "horasAdicionales", "horas_adicionales"),
      descripcion: pick(raw, "descripcion", "DESCRIPCION"),

      tarea: raw.tarea ?? null,
    };
  };

  const fetchRegistros = useCallback(async () => {
    setError("");

    // abort request anterior si existe
    if (registrosAbortRef.current) {
      try { registrosAbortRef.current.abort(); } catch {}
    }

    const controller = new AbortController();
    registrosAbortRef.current = controller;

    try {
      const params = new URLSearchParams();

      // equipoLocked ya viene calculado según rol/admin
      const eq = normKey(equipoLocked);
      if (eq && eq !== "TODOS") params.set("equipo", eq);

      const url = `/registros${params.toString() ? `?${params.toString()}` : ""}`;

      // headers para backend (permisos)
      const headers = {
        "X-User-Usuario": usuarioLogin,
        "X-User-Rol": rol,
        "X-View": "REGISTRO",
      };

      const headerEquipo = normKey(equipoUser || "");
      if (headerEquipo) headers["X-User-Equipo"] = headerEquipo;

      // log para depurar
      console.log("FETCH /registros", { url, eq, equipoLocked, headers });

      const res = await jfetch(url, {
        method: "GET",
        signal: controller.signal,
        headers,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);

      // backend puede responder:
      // 1) []  (lista directa)
      // 2) { rows: [], total: ... }
      const rows = Array.isArray(data)
        ? data
        : (Array.isArray(data?.rows) ? data.rows : []);

      // ✅ NORMALIZA para evitar campos vacíos por snake_case
      const normalized = rows.map(normalizeRegistro);

      setRegistros(normalized);

    } catch (e) {
      if (e?.name === "AbortError") return;
      setRegistros([]);
      setError(String(e?.message || e));
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

        const norm = normalizeModulos(Array.isArray(data.modulos) ? data.modulos : []);
        if (norm.length) {
          setModulos(prev => uniq([...(prev || []), ...norm]));
        }
      } catch {}
    })();
  }, [usuarioLogin]);


  useEffect(() => {
    if (!usuarioLogin) return;
    fetchRegistros();
  }, [usuarioLogin, fetchRegistros]);

  const resolveModulosForEdit = useCallback((reg) => {
    const fromRegistro = reg?.modulo ? [reg.modulo] : [];
    const fromState = Array.isArray(modulos) ? modulos : [];
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

  const ocupacionLabelByTareaIdFast = useMemo(
  () => buildOcupacionLabelByTareaId(ocupaciones),
  [ocupaciones]
);

const tareaIdByCodigoNombreFast = useMemo(() => {
  const map = new Map();
  for (const t of (todasTareas || [])) {
    const key = `${String(t.codigo || "").trim()} - ${String(t.nombre || "").trim()}`.toUpperCase();
    map.set(key, Number(t.id));
  }
  return map;
}, [todasTareas]);

const registrosIndexed = useMemo(() => {
    const base = Array.isArray(registros) ? registros : [];
    const out = new Array(base.length);

    for (let i = 0; i < base.length; i++) {
      const r = base[i];

      // equipo normalizado 1 vez
      const eqKey = equipoOf(r); // ya devuelve normKey internamente

      // fecha numérica 1 vez para ordenar rápido
      const fNum = fechaToNum(r?.fecha);

      // ocupación label 1 vez
      let occLabel = "—";
      const tid =
        (r?.tarea_id != null ? Number(r.tarea_id) : null) ??
        (r?.tarea?.id != null ? Number(r.tarea.id) : null);

      if (tid && ocupacionLabelByTareaIdFast.size) {
        occLabel = ocupacionLabelByTareaIdFast.get(tid) || "—";
      } else {
        const key = String(r?.tipoTarea || "").trim().toUpperCase();
        const tid2 = tareaIdByCodigoNombreFast.get(key);
        if (tid2) occLabel = ocupacionLabelByTareaIdFast.get(tid2) || "—";
      }

      out[i] = {
        ...r,
        __eqKey: eqKey,
        __fNum: fNum,
        __occLabel: occLabel,
        __consultor: r?.consultor || "",
        __tipoTarea: r?.tipoTarea || "",
        __cliente: r?.cliente || "",
        __nroCasoCliente: r?.nroCasoCliente || "",
        __horasAdic: normSiNo(r?.horasAdicionales),
        __idStr: String(r?.id ?? ""),
      };
    }

    return out;
  }, [registros, ocupacionLabelByTareaIdFast, tareaIdByCodigoNombreFast]);


  const registrosFiltrados = useMemo(() => {
  const base = registrosIndexed || [];

  // normaliza 1 vez (para no hacer normKey en cada fila)
  const filtroEqKey = filtroEquipo ? normKey(filtroEquipo) : "";

  // needle 1 vez
  const needle = filtroNroCasoCliDeb ? String(filtroNroCasoCliDeb).toLowerCase() : "";

  // filtro rápido sin recalcular nada
  const rows = [];
    for (let i = 0; i < base.length; i++) {
      const r = base[i];

      // ✅ equipo: filtro global rápido
      if (filtroEqKey && r.__eqKey !== filtroEqKey) continue;

      if (filtroFecha && r.fecha !== filtroFecha) continue;
      if (filtroCliente && r.__cliente !== filtroCliente) continue;
      if (filtroOcupacion && r.__occLabel !== filtroOcupacion) continue;
      if (filtroTarea && r.__tipoTarea !== filtroTarea) continue;
      if (filtroConsultor && r.__consultor !== filtroConsultor) continue;

      if (needle) {
        if (!String(r.__nroCasoCliente).toLowerCase().includes(needle)) continue;
      }

      if (filtroHorasAdic) {
        if (r.__horasAdic !== filtroHorasAdic) continue;
      }

      if (filtroMes || filtroAnio) {
        const f = String(r.fecha || "");
        const [yyyy, mm] = f.split("-");
        if (filtroAnio && yyyy !== String(filtroAnio)) continue;
        if (filtroMes && mm !== String(filtroMes)) continue;
      }

      rows.push(r);
    }

    // sort súper rápido (sin Date)
    rows.sort((a, b) => {
      if (a.__fNum !== b.__fNum) return a.__fNum - b.__fNum;
      return a.__idStr.localeCompare(b.__idStr);
    });

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const start = (safePage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    return {
      total,
      totalPages,
      page: safePage,
      pageRows: rows.slice(start, end),
      allRows: rows,
    };
  }, [
    registrosIndexed,
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
    page,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!registro.horaInicio || !registro.horaFin) {
      return Swal.fire({ icon: 'warning', title: 'Completa las horas de inicio y fin' });
    }
    const tiempo = calcularTiempo(registro.horaInicio, registro.horaFin);
    if (tiempo <= 0) {
      return Swal.fire({ icon: 'error', title: 'Hora fin debe ser mayor a inicio' });
    }

    const code = taskCode(registro.tipoTarea);

    if (CODES_NEED_CASE.has(code) && isInvalidCaseNumber(registro.nroCasoCliente)) {
      return Swal.fire({
        icon: 'warning',
        title: 'Número de caso inválido',
        text: 'Para las tareas 01, 02 o 03, el Nro. Caso Cliente no puede ser "0", "NA", estar vacío ni superar los 10 caracteres.'
      });
    }

    if (CODES_RESTRICTED_CLIENT_9H.has(code)) {
      if ((registro.cliente || '').trim().toUpperCase() !== CLIENTE_RESTRINGIDO) {
        return Swal.fire({
          icon: 'warning',
          title: 'Cliente no permitido',
          text: 'Esta tarea solo puede registrarse al cliente HITSS/CLARO.'
        });
      }
      if (tiempo > 9) {
        return Swal.fire({
          icon: 'warning',
          title: 'Límite de horas excedido',
          text: 'Estas tareas no pueden superar 9 horas en un registro.'
        });
      }
    }

    if (code === CODE_SUPERVISION_EQUIPO) {
      const poolModulos = [moduloElegido, moduloUser, ...(modulos || [])]
        .map(v => String(v || '').trim().toUpperCase());
      const canUseLider = poolModulos.includes('LIDER');
      if (!canUseLider) {
        return Swal.fire({
          icon: 'warning',
          title: 'Módulo no autorizado',
          text: 'La tarea "Seguimiento y Supervisión Equipo" solo puede ser usada por quienes pueden diligenciar el módulo LIDER.'
        });
      }
    }

    if (modulos.length > 1 && !moduloElegido) {
      return Swal.fire({ icon: 'warning', title: 'Selecciona un módulo' });
    }

    const horasAdic = calcularHorasAdicionales(
      registro.horaInicio,
      registro.horaFin,
      /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(horarioUsuario) ? horarioUsuario : null
    );
    const moduloFinal = (moduloElegido || modulos[0] || moduloUser || '').trim();

    const consultorId =
      registro.consultor_id ||                  
      userData?.consultor_id ||                 
      userData?.user?.consultor_id ||
      localStorage.getItem("consultorId") ||
      null;



    // 🔥 Nombre EXACTO que el backend usa para validar permisos
    const nombreConsultor =
      userData?.nombre ||
      userData?.user?.nombre ||
      userData?.consultor?.nombre ||
      "";

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

    // si no es basis
    if (equipoFormulario !== "BASIS") {
      delete payload.actividadMalla;
      delete payload.oncall;
      delete payload.desborde;
    }

    if (!moduloFinal || moduloFinal.trim() === "") {
      return Swal.fire({
        icon: "warning",
        title: "Selecciona un módulo antes de guardar"
      });
    }


    try {
      const path = modoEdicion
        ? `/editar-registro/${registro.id}`
        : "/registrar-hora";
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

    const tareaIdStr = tareaId ? String(tareaId) : "";

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

    // pool de módulos inmediato (sin esperar nada)
    const pool = resolveModulosForEdit(reg);
    setModulos(pool);

    const moduloPref = reg?.modulo ? String(reg.modulo).trim() : "";
    const moduloSel = pool.length === 1 ? pool[0] : (moduloPref || "");

    setModuloElegido(moduloSel);

    setRegistro({
      ...initRegistro(),
      ...copia,
      id: null,
      modulo: moduloSel, // 👈 importante: que el registro tenga el modulo también
      equipo: equipoOf(copia, userEquipoUpper),
    });

    // ocupación / tareas (opcional: si quieres que al copiar también quede lista)
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

    if (isSoloPropio) {
      setFiltroConsultor(nombreUser);
      setFiltroEquipo("");
      return;
    }

    if (isAdminGlobal) {
      setFiltroConsultor("");
      setFiltroEquipo("");
      return;
    }

    if (isAdminEquipo) {
      setFiltroConsultor("");
      setFiltroEquipo(miEquipo);
      return;
    }
    setFiltroConsultor(nombreUser);
    setFiltroEquipo(miEquipo);
  }, [userData, isSoloPropio, isAdminGlobal, isAdminEquipo, nombreUser, miEquipo]);

  useEffect(() => {
    if (isAdminEquipo && miEquipo) {
      setFiltroEquipo(miEquipo);
    }
  }, [isAdminEquipo, miEquipo]);


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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      const lista = Array.isArray(data.modulos) ? data.modulos : [];
      const norm = normalizeModulos(lista);

      setModulos(norm);
      setModuloElegido(norm.length === 1 ? norm[0] : "");

      setRegistro({
        ...initRegistro(),
        modulo: norm.length === 1 ? norm[0] : "",
        equipo: data.equipo
          ? String(data.equipo).toUpperCase()
          : userEquipoUpper,
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
    let cols = 18; 
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
                className={`team-btn ${normKey(filtroEquipo) === normKey(opt.key) ? "is-active" : ""}`}
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
            disabled={isSoloPropio || !isAdmin}
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
              setFiltroFecha('');
              setFiltroCliente('');
              setFiltroTarea('');
              setFiltroOcupacion('');
              setFiltroNroCasoCli('');
              setFiltroHorasAdic('');
              if (isAdminGlobal) {
                setFiltroConsultor('');
                setFiltroEquipo('');
              } else if (isAdminEquipo) {
                setFiltroConsultor('');
                setFiltroEquipo(miEquipo);
              } else {
                setFiltroConsultor(nombreUser);
                setFiltroEquipo(miEquipo);
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
                  <input type="text" value={miEquipo || equipoUser} readOnly placeholder="Equipo" />
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
                      ocupacion_id: parseInt(value),
                      tipoTarea: ''
                    }));
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
                    onToggleBloq={toggleBloqueado}
                  />
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

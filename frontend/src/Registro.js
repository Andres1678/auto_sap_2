import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import './Registro.css';
import { jfetch } from './lib/api';
import Resumen from './Resumen';
import CapacidadSemanalModal from "./CapacidadSemanalModal";
import { Navigate, useNavigate } from "react-router-dom";
import CostoConsultorPage from './CostoConsultorPage';
import { crearExportacionRegistrosExcel } from "./lib/exportRegistrosExcel";

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
    horarioTrabajo: '',
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
    tipoTarea: '',

    // NUEVO: rango de vacaciones
    fechaInicioVacaciones: '',
    fechaFinVacaciones: '',
  };
}

const CLIENTE_RESTRINGIDO = 'HITSS/CLARO';
const OCCUPATIONS_FORBID_HITSS = new Set(['01', '02', '06']);
const CODES_RESTRICTED_CLIENT_9H = new Set(['09', '13', '14', '15']);
const CODE_SUPERVISION_EQUIPO = '06';
const OCCUPATIONS_ONLY_HITSS = new Set(['03','08']);
const TASK_CODE_HIDDEN_FOR_CONSULTORIA = '46';
const TEAM_WITHOUT_TASK_46 = 'CONSULTORIA';
const OCCUPATIONS_ALLOWED_FOR_TASK_46 = new Set(['01', '02']);

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

const BASIS_TURNOS = {
  TM2E: { lunesJueves: "06:00 - 13:00", viernes: "06:00 - 12:00" },
  TT1E: { lunesJueves: "14:00 - 22:30", viernes: "14:00 - 22:30" },
  TT2E: { lunesJueves: "14:00 - 21:00", viernes: "14:00 - 20:00" },
  TT2I: { lunesJueves: "14:00 - 21:00", viernes: "14:00 - 20:00" },
  TM2I: { lunesJueves: "06:00 - 13:00", viernes: "06:00 - 12:00" },
  TM1E: { lunesJueves: "06:00 - 14:30", viernes: "06:00 - 14:00" },
  TM1I: { lunesJueves: "06:00 - 14:30", viernes: "06:00 - 14:00" },
  T2X: { lunesJueves: "14:00 - 22:00", viernes: "14:00 - 22:00" },
};

const codigoTurnoBasis = (horario, actividad, equipo) => {
  if (String(equipo || '').trim().toUpperCase() !== 'BASIS') return '';
  return [actividad, horario].map(v=>String(v || '').trim().toUpperCase()).find(v=>BASIS_TURNOS[v]) || '';
};
const rangoTurnoBasis = (codigo, fecha) => {
  const regla = BASIS_TURNOS[codigo];
  if (!regla) return '';
  if (codigo === 'T2X') return regla.lunesJueves;
  const text = String(fecha || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const d = new Date(`${text}T12:00:00`);
  if (Number.isNaN(d.getTime()) || [0,6].includes(d.getDay())) return '';
  return d.getDay() === 5 ? regla.viernes : regla.lunesJueves;
};

const HORARIOS_FUNCIONAL_PERMITIDOS = [
  "08:30 - 18:00",
  "07:30 - 16:00",
  "07:00 - 16:00",
];

const HORARIO_FUNCIONAL_DEFAULT = "08:30 - 18:00";

const HORARIOS_FUNCIONAL_ANTERIORES = {
  "08:00 - 18:00": "08:30 - 18:00",
  "07:00 - 17:00": "08:30 - 18:00",
};

const normalizeHorarioText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim();

const resolveHorarioTrabajo = (horarioUsuario, equipo = "", fecha = "", actividad = "") => {
  const horario = normalizeHorarioText(horarioUsuario);
  const equipoNorm = normKey(equipo);
  const turno = codigoTurnoBasis(horarioUsuario, actividad, equipo);
  if (turno) return rangoTurnoBasis(turno, fecha);

  if (equipoNorm === "FUNCIONAL") {
    if (HORARIOS_FUNCIONAL_PERMITIDOS.includes(horario)) return horario;
    if (HORARIOS_FUNCIONAL_ANTERIORES[horario]) return HORARIOS_FUNCIONAL_ANTERIORES[horario];

    return HORARIO_FUNCIONAL_DEFAULT;
  }

  return horario;
};

const calcularHorasAdicionales = (horaInicio, horaFin, horarioUsuario, equipo = "", fecha = "", actividad = "") => {
  const ini = parseHHMM(horaInicio);
  const fin = parseHHMM(horaFin);
  const horarioTrabajo = resolveHorarioTrabajo(horarioUsuario, equipo, fecha, actividad);
  const rango = parseRange(horarioTrabajo);
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

const getModulosFromConsultorData = (data, userData) => {
  const fromDetalle = Array.isArray(data?.modulos_detalle)
    ? data.modulos_detalle
    : [];

  const fromModulos = Array.isArray(data?.modulos)
    ? data.modulos
    : [];

  const fromModulo = data?.modulo
    ? [data.modulo]
    : [];

  const fromUser = getModulosLocal(userData);

  return [
    ...new Set(
      normalizeModulos([
        ...fromDetalle,
        ...fromModulos,
        ...fromModulo,
        ...fromUser,
      ])
        .map((m) => String(m || "").trim())
        .filter(Boolean)
    ),
  ];
};

const MESES = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const validateMonthRange = (desde, hasta, maxMonths = 12) => {
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

  if (!desde || !hasta) {
    return {
      valid: false,
      message: "Selecciona el mes inicial y el mes final.",
      months: 0,
    };
  }

  if (!monthPattern.test(desde) || !monthPattern.test(hasta)) {
    return {
      valid: false,
      message: "El rango de meses no tiene un formato válido.",
      months: 0,
    };
  }

  if (desde > hasta) {
    return {
      valid: false,
      message: "El mes inicial no puede ser mayor que el mes final.",
      months: 0,
    };
  }

  const [yearFrom, monthFrom] = desde.split("-").map(Number);
  const [yearTo, monthTo] = hasta.split("-").map(Number);
  const months = ((yearTo - yearFrom) * 12) + (monthTo - monthFrom) + 1;

  if (months > maxMonths) {
    return {
      valid: false,
      message: `Selecciona un rango máximo de ${maxMonths} meses para evitar sobrecargar la consulta.`,
      months,
    };
  }

  return { valid: true, message: "", months };
};

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

function isVacacionesTaskText(value) {
  return taskCode(value) === "15";
}

function buildDateRangeISO(startISO, endISO) {
  if (!startISO || !endISO) return [];

  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return [];
  }

  const days = [];
  const current = new Date(start);

  while (current <= end) {
    days.push(toISODate(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
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


const isActiveValue = (v) => {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "si" || s === "sí";
};

const getFaseRealId = (f) =>
  String(f?.fase_id ?? f?.fase?.id ?? f?.id ?? "").trim();

const getFaseRealNombre = (f) =>
  String(f?.fase?.nombre ?? f?.nombre ?? "").trim();

const findFaseByRealId = (fases, faseId) =>
  (Array.isArray(fases) ? fases : []).find(
    (f) => getFaseRealId(f) === String(faseId)
  );

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
  puedeEditarBloqueados,
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
          disabled={r.bloqueado && !puedeEditarBloqueados}
          title={r.bloqueado && !puedeEditarBloqueados ? "Registro bloqueado" : "Editar"}
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

function MultiSelectField({
  value = [],
  onChange,
  options = [],
  placeholder = "Selecciona",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedValues = Array.isArray(value) ? value : [];

  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const toggleOption = (option) => {
    if (disabled) return;

    const exists = selectedValues.includes(option);
    if (exists) {
      onChange(selectedValues.filter((v) => v !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const summaryText = useMemo(() => {
    if (!selectedValues.length) return placeholder;
    if (selectedValues.length === 1) return selectedValues[0];
    if (selectedValues.length === 2) return `${selectedValues[0]}, ${selectedValues[1]}`;
    return `${selectedValues.length} seleccionados`;
  }, [selectedValues, placeholder]);

  return (
    <div
      className={`filter-multiselect ${disabled ? "is-disabled" : ""}`}
      ref={wrapperRef}
    >
      <button
        type="button"
        className={`filter-multiselect__trigger ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span
          className={`filter-multiselect__text ${
            !selectedValues.length ? "is-placeholder" : ""
          }`}
          title={selectedValues.join(", ")}
        >
          {summaryText}
        </span>

        <span className="filter-multiselect__actions">
          {!!selectedValues.length && !disabled && (
            <span
              className="filter-multiselect__clear"
              onClick={clearAll}
              role="button"
              tabIndex={0}
            >
              ✕
            </span>
          )}
          <span className="filter-multiselect__arrow">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="filter-multiselect__menu">
          {options.length === 0 ? (
            <div className="filter-multiselect__empty">
              No hay opciones
            </div>
          ) : (
            options.map((opt) => {
              const checked = selectedValues.includes(opt);

              return (
                <label key={opt} className="filter-multiselect__option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(opt)}
                  />
                  <span>{opt}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function buildOptionsSortedByCount(baseOptions, rows, getValue) {
  const counts = new Map();

  (rows || []).forEach((row) => {
    const raw = getValue(row);
    const value = String(raw ?? "").trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return [...new Set((baseOptions || []).map((x) => String(x || "").trim()).filter(Boolean))]
    .sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
}

const appendMultiValues = (params, key, values) => {
  (Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .forEach((v) => params.append(key, v));
};

const Registro = ({ userData }) => {
  const navigate = useNavigate();
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [appliedFilterQuery, setAppliedFilterQuery] = useState('');
  const [cargandoRegistros, setCargandoRegistros] = useState(false);
  const [filterRevision, setFilterRevision] = useState(0);
  const appliedFilters = useMemo(() => {
    const params = new URLSearchParams(appliedFilterQuery);
    return {
      equipo: params.get('equipo') || '', consultores: params.getAll('consultor'),
      mes: params.get('mes') || '', anio: params.get('anio') || '',
    };
  }, [appliedFilterQuery]);
  const [error, setError] = useState('');
  const excelInputRef = useRef(null);
  const openButtonRef = useRef(null);
  const firstFieldRef = useRef(null);
  const fechaBogota = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const parteFecha = (tipo) => fechaBogota.find((p) => p.type === tipo)?.value;
  const todayISO = `${parteFecha("year")}-${parteFecha("month")}-${parteFecha("day")}`;

  const [registro, setRegistro] = useState(initRegistro());
  const [modoEdicion, setModoEdicion] = useState(false);

  const [filtroId, setFiltroId] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState([]);
  const [filtroOcupacion, setFiltroOcupacion] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroNroCasoCli, setFiltroNroCasoCli] = useState('');
  const [filtroHorasAdic, setFiltroHorasAdic] = useState([]);

  // Filtro tradicional: visible para todos los usuarios.
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroAnio, setFiltroAnio] = useState("");

  // Filtro adicional por rango: exclusivo para roles ADMIN / ADMIN_*.
  const [filtroMesDesde, setFiltroMesDesde] = useState("");
  const [filtroMesHasta, setFiltroMesHasta] = useState("");

  const [consultorActivo, setConsultorActivo] = useState(
    isActiveValue(userData?.activo ?? userData?.user?.activo ?? localStorage.getItem("consultorActivo"))
  );

  const horarioUsuario = (
    userData?.horario ??
    userData?.user?.horario ??
    userData?.user?.horarioSesion ??
    localStorage.getItem("horarioSesion") ??
    ''
  );
  const rol = String(
    userData?.rol_ref?.nombre ??
    userData?.rol ??
    userData?.user?.rol ??
    ''
  ).toUpperCase();

  const nombreUser = (userData?.nombre ?? userData?.user?.nombre) || '';

  const modulosUserLocal = getModulosLocal(userData);

  const moduloUser = String(
    userData?.modulo ??
    userData?.user?.modulo ??
    modulosUserLocal?.[0] ??
    ''
  ).trim();

  const equipoUser = (userData?.equipo ?? userData?.user?.equipo) || '';
  const esEquipoConsultoria = normKey(equipoUser) === TEAM_WITHOUT_TASK_46;

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
  ]);

  const canAccessRegistro = !REGISTRO_EXCLUDED_ROLES.has(rolUpper);

  const isAdmin = canAccessRegistro && rolUpper.startsWith("ADMIN");
  const isAdminGlobal = canAccessRegistro && REGISTRO_GLOBAL_ROLES.has(rolUpper);
  const isAdminRolePool = canAccessRegistro && REGISTRO_ROLE_POOL_ROLES.has(rolUpper);
  // LIDER tiene alcance por equipo igual que los antiguos ADMIN_* de equipo,
  // pero no obtiene privilegios administrativos globales.
  const isAdminEquipo = canAccessRegistro && (
    rolUpper === "LIDER" ||
    (isAdmin && !isAdminGlobal && !isAdminRolePool)
  );
  

  const miEquipo = String(equipoUser || "").trim().toUpperCase();
  const equipoLocked = isAdminEquipo ? miEquipo : filtroEquipo;

  const userEquipoUpper = String(equipoUser || '').toUpperCase();

  const canDownload = ['rodriguezso', 'valdezjl', 'gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());
  const [importingExcel, setImportingExcel] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const canImportExcel = ['gonzalezanf'].includes(String(usuarioLogin || '').toLowerCase());
  const puedeRegistrarCualquierFecha = String(usuarioLogin || '').trim().toLowerCase() === 'gonzalezanf';
  const puedeRegistrarMesesAnteriores = ['gonzalezanf', 'rodriguezso'].includes(String(usuarioLogin || '').trim().toLowerCase());

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

  const [modulos, setModulos] = useState(() => getModulosLocal(userData));
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

  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const editOriginalRef = useRef(null);
  const registrosAbortRef = useRef(null);

  const [fasesProyecto, setFasesProyecto] = useState([]);
  const prevIsProyectoModeRef = useRef(false);
  const [capacidadModalOpen, setCapacidadModalOpen] = useState(false);
  const [costoModalOpen, setCostoModalOpen] = useState(false);


  const canViewCapacidadSemanal = canAccessRegistro && (isAdminGlobal || isAdminEquipo);
  const canViewCostoConsultor = isAdmin;

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
    const tareas = Array.isArray(occ?.tareas) ? occ.tareas : [];
    const codigoOcupacion = String(occ?.codigo || '').trim();

    // La tarea 46 - Gestión de Cambios solo pertenece a las ocupaciones 01 y 02
    // y nunca está disponible para Consultoría.
    return tareas.filter((t) => {
      const codigoTarea = String(t?.codigo || '').trim();
      if (codigoTarea !== TASK_CODE_HIDDEN_FOR_CONSULTORIA) return true;
      return !esEquipoConsultoria && OCCUPATIONS_ALLOWED_FOR_TASK_46.has(codigoOcupacion);
    });
  }, [ocupaciones, ocupacionSeleccionada, esEquipoConsultoria]);

  const occCodeSeleccionada = useMemo(() => {
    return ocupacionCodeFromId(ocupacionSeleccionada, ocupaciones);
  }, [ocupacionSeleccionada, ocupaciones]);

  const isVacacionesTask = useMemo(() => {
    return Number(occCodeSeleccionada) === 8 &&
      Number(tareaCodeFromRegistro(registro, todasTareas)) === 15;
  }, [occCodeSeleccionada, registro, todasTareas]);

  const habilitarRangoVacaciones = isVacacionesTask && !modoEdicion;

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
      const params = new URLSearchParams(appliedFilterQuery);
      setCargandoRegistros(true);

      params.set("page", String(page));
      params.set("per_page", String(perPage));

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
      if (!res.ok) {
        throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
      }

      if (controller.signal.aborted || registrosAbortRef.current !== controller) return;
      setRegistros(Array.isArray(data?.data) ? data.data : []);
      setTotalRegistros(Number(data?.total || 0));
      setTotalPages(Number(data?.total_pages || 1));
    } catch (e) {
      if (e?.name === "AbortError" || controller.signal.aborted || registrosAbortRef.current !== controller) return;
      setRegistros([]);
      setTotalRegistros(0);
      setTotalPages(1);
      setError(String(e.message || e));
    } finally {
      if (registrosAbortRef.current === controller) setCargandoRegistros(false);
    }
  }, [appliedFilterQuery, filterRevision, page, perPage, usuarioLogin, rol, equipoUser]);

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

        const norm = getModulosFromConsultorData(data, userData);

        if (norm.length) {
          setModulos((prev) => uniq([...(prev || []), ...norm]));

          setModuloElegido((prev) => {
            if (prev) return prev;
            return norm.length === 1 ? norm[0] : "";
          });
        }
      } catch {}
    })();
  }, [usuarioLogin]);

  useEffect(() => {
    const hasId = (userData && (userData.id || userData?.user?.id));
    if (!hasId || !usuarioLogin) return;

    fetchRegistros();
    return () => registrosAbortRef.current?.abort();
  }, [userData, usuarioLogin, fetchRegistros]);

  useEffect(() => {
    if (!usuarioLogin) return;
    fetchFiltrosGlobales();
    fetchConteosGlobales();
  }, [usuarioLogin, fetchFiltrosGlobales, fetchConteosGlobales]);

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
    return (registros || []).map((r) => {
      const equipoNormalizado = equipoOf(r);
      const horarioFila =
        r?.horarioTrabajo ||
        r?.horario_trabajo ||
        (String(r?.usuario_consultor || "").trim().toLowerCase() === usuarioLogin ? horarioUsuario : "");

      const horasAdicionalesCalculadas = horarioFila
        ? calcularHorasAdicionales(r?.horaInicio, r?.horaFin, horarioFila, equipoNormalizado, r?.fecha, r?.actividadMalla)
        : r?.horasAdicionales;

      return {
        ...r,
        equipoNormalizado,
        horarioTrabajoCodigo: horarioFila,
        horarioTrabajo: resolveHorarioTrabajo(horarioFila, equipoNormalizado, r?.fecha, r?.actividadMalla),
        horasAdicionales:
          horasAdicionalesCalculadas && horasAdicionalesCalculadas !== "N/D"
            ? horasAdicionalesCalculadas
            : r?.horasAdicionales,
        ocupacionTexto: obtenerOcupacionDeRegistro(r),
        tipoTareaTexto: r.tipoTarea || (r.tarea ? `${r.tarea.codigo} - ${r.tarea.nombre}` : "—"),
      };
    });
  }, [registros, obtenerOcupacionDeRegistro, horarioUsuario, usuarioLogin]);

  const clientesOptions = useMemo(() => {
    return buildOptionsSortedByCount(
      clientes.map((c) => c.nombre_cliente),
      registrosProcesados,
      (r) => r.cliente
    );
  }, [clientes, registrosProcesados]);

  const ocupacionesOptions = useMemo(() => {
    return buildOptionsSortedByCount(
      ocupaciones.map((o) => `${o.codigo} - ${o.nombre}`),
      registrosProcesados,
      (r) => r.ocupacionTexto
    );
  }, [ocupaciones, registrosProcesados]);

  const tareasOptions = useMemo(() => {
    const tareasVisibles = esEquipoConsultoria
      ? todasTareas.filter(
          (t) => String(t?.codigo || '').trim() !== TASK_CODE_HIDDEN_FOR_CONSULTORIA
        )
      : todasTareas;

    return buildOptionsSortedByCount(
      tareasVisibles.map((t) => `${t.codigo} - ${t.nombre}`),
      registrosProcesados,
      (r) => r.tipoTareaTexto
    );
  }, [todasTareas, registrosProcesados, esEquipoConsultoria]);

  useEffect(() => {
    if (!esEquipoConsultoria) return;

    // Elimina una selección previa que pudiera haber quedado en memoria antes
    // de iniciar sesión o cambiar al equipo Consultoría.
    setFiltroTarea((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (label) => taskCode(label) !== TASK_CODE_HIDDEN_FOR_CONSULTORIA
      )
    );

    setRegistro((prev) => {
      const codigoActual = tareaCodeFromRegistro(prev, todasTareas);
      if (codigoActual !== TASK_CODE_HIDDEN_FOR_CONSULTORIA) return prev;
      return { ...prev, tarea_id: '', tipoTarea: '' };
    });
  }, [esEquipoConsultoria, todasTareas]);

  const consultoresOptions = useMemo(() => {
    return buildOptionsSortedByCount(
      consultoresGlobales,
      registrosProcesados,
      (r) => r.consultor
    );
  }, [consultoresGlobales, registrosProcesados]);

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
    const esRangoVacaciones = habilitarRangoVacaciones;

    let fechasVacaciones = esRangoVacaciones
      ? buildDateRangeISO(registro.fechaInicioVacaciones, registro.fechaFinVacaciones)
      : [];

    // El calendario del backend es la fuente común para los festivos de Colombia.
    if (isVacacionesTask) {
      const desde = esRangoVacaciones ? registro.fechaInicioVacaciones : registro.fecha;
      const hasta = esRangoVacaciones ? registro.fechaFinVacaciones : registro.fecha;
      if (desde && hasta && desde <= hasta) {
        try {
          const params = new URLSearchParams({ desde, hasta });
          const res = await jfetch(`/calendario/vacaciones?${params.toString()}`, {
            headers: { "X-User-Usuario": usuarioLogin, "X-User-Rol": rol },
          });
          const data = await res.json();
          if (!res.ok || !Array.isArray(data?.fechas)) {
            throw new Error(data?.mensaje || "No se pudo consultar el calendario laboral.");
          }
          if (!data.fechas.length) {
            return Swal.fire({
              icon: "warning",
              title: "Vacaciones sin días laborables",
              text: "Selecciona días de lunes a viernes que no sean festivos de Colombia.",
            });
          }
          if (esRangoVacaciones) fechasVacaciones = data.fechas;
        } catch (error) {
          return Swal.fire({
            icon: "error",
            title: "No se pudo validar el calendario",
            text: String(error.message || error),
          });
        }
      }
    }

    const fechaPrincipal = esRangoVacaciones
      ? (fechasVacaciones[0] || registro.fechaInicioVacaciones)
      : registro.fecha;

    if (!fechaPrincipal) {
      return Swal.fire({ icon: "warning", title: "Selecciona una fecha" });
    }

    if (esRangoVacaciones) {
      if (!registro.fechaInicioVacaciones || !registro.fechaFinVacaciones) {
        return Swal.fire({
          icon: "warning",
          title: "Rango de vacaciones obligatorio",
          text: "Selecciona la fecha de inicio y la fecha de fin de vacaciones.",
        });
      }

      if (!fechasVacaciones.length) {
        return Swal.fire({
          icon: "warning",
          title: "Rango inválido",
          text: "La fecha final de vacaciones debe ser mayor o igual a la fecha inicial.",
        });
      }
    } else if (!puedeRegistrarCualquierFecha && registro.fecha > todayISO) {
      return Swal.fire({
        icon: "warning",
        title: "Fecha futura no permitida",
        text: "No puedes registrar fechas futuras.",
      });
    }

    const fechasARevisarMes = esRangoVacaciones ? [...fechasVacaciones] : [fechaPrincipal];
    if (modoEdicion && original?.fecha) fechasARevisarMes.push(String(original.fecha).slice(0, 10));
    if (!puedeRegistrarMesesAnteriores && fechasARevisarMes.some(f => String(f).slice(0, 7) < todayISO.slice(0, 7))) {
      return Swal.fire({ icon: 'warning', title: 'Mes cerrado', text: 'No puedes crear ni modificar registros de meses anteriores.' });
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
      const fechasAValidar = esRangoVacaciones ? fechasVacaciones : [registro.fecha];

      for (const fechaValidar of fechasAValidar) {
        const conflict = findOverlapRegistro({
          registros,
          fecha: fechaValidar,
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
            html: `Ya existe un registro que se cruza con este rango el día <b>${fechaValidar}</b>:<br/><b>${conflict.horaInicio} - ${conflict.horaFin}</b> (ID: ${conflict.id})`,
          });
        }
      }
    }

    const occCode = ocupacionCodeFromId(ocupacionSeleccionada, ocupaciones);
    const tareaCode = tareaCodeFromRegistro(registro, todasTareas);

    // Ocupación 01 + tarea 01: ambos números de caso son obligatorios.
    // Compara códigos de catálogo; admite "1" y "01".
    if (Number(occCode) === 1 && Number(tareaCode) === 1) {
      const casoInvalido = (valor) => {
        const texto = String(valor ?? "").trim().toUpperCase();
        return (
          texto === "" ||
          texto === "NA" ||
          texto === "N/A" ||
          Number(texto.replace(",", ".")) === 0
        );
      };

      const camposInvalidos = [];
      if (casoInvalido(registro.nroCasoCliente)) {
        camposInvalidos.push("Nro Caso Cliente");
      }
      if (casoInvalido(registro.nroCasoInterno)) {
        camposInvalidos.push("Nro Caso Interno");
      }

      if (camposInvalidos.length > 0) {
        return Swal.fire({
          icon: "warning",
          title: "Número de caso obligatorio",
          text:
            "Para la ocupación 01 y la tarea 01, debes diligenciar " +
            camposInvalidos.join(" y ") +
            ". No se permite cero, NA, N/A ni dejar el campo vacío.",
        });
      }
    }

    // Validación defensiva: aunque se manipule el HTML o se conserve un valor
    // anterior en el estado del formulario, Consultoría no puede registrar la 46.
    if (
      String(tareaCode || '').trim() === TASK_CODE_HIDDEN_FOR_CONSULTORIA &&
      (
        esEquipoConsultoria ||
        !OCCUPATIONS_ALLOWED_FOR_TASK_46.has(String(occCode || '').trim())
      )
    ) {
      return Swal.fire({
        icon: "warning",
        title: "Tarea no disponible",
        text: esEquipoConsultoria
          ? 'La tarea "46 - Gestión de Cambios" no está habilitada para el equipo Consultoría.'
          : 'La tarea "46 - Gestión de Cambios" solo está habilitada en las ocupaciones 01 y 02.',
      });
    }

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

    const horarioBase = registro.horarioTrabajo || horarioUsuario;
    const horarioTrabajo = resolveHorarioTrabajo(
      horarioBase, equipoFormulario, fechaPrincipal, registro.actividadMalla
    );

    const horasAdic = calcularHorasAdicionales(
      registro.horaInicio,
      registro.horaFin,
      horarioTrabajo,
      equipoFormulario,
      fechaPrincipal,
      registro.actividadMalla
    );

    const moduloFinal = (moduloElegido || modulos[0] || moduloUser || "").trim();
    if (!moduloFinal) {
      return Swal.fire({
        icon: "warning",
        title: "Selecciona un módulo antes de guardar",
      });
    }

    const base = {
      fecha: fechaPrincipal,
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
      horarioTrabajo,
      horario_trabajo: horarioTrabajo,
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

    if (esRangoVacaciones) {
      payload.generarRangoVacaciones = true;
      payload.fechaInicioVacaciones = registro.fechaInicioVacaciones;
      payload.fechaFinVacaciones = registro.fechaFinVacaciones;
    }

    if (equipoFormulario === "BASIS") {
      payload.actividadMalla = registro.actividadMalla;
      payload.oncall = registro.oncall;
      payload.desborde = registro.desborde;
    }

    try {
      const path = modoEdicion ? `/editar-registro/${registro.id}` : "/registrar-hora";
      const method = modoEdicion ? "PUT" : "POST";

      const enviarRegistro = () => jfetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-Usuario": usuarioLogin,
          "X-User-Rol": rol,
        },
        body: JSON.stringify(payload),
      });
      let resp = await enviarRegistro();
      let j = await resp.json().catch(() => ({}));
      if (resp.status === 409 && j?.codigo === 'CONFIRMAR_HORAS_DIARIAS') {
        const numero = v => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
        const detalle = (j.avisos || []).map(a =>
          `${a.fecha}: ${numero(a.horas_actuales)} h acumuladas + ${numero(a.horas_registro)} h de este registro = ${numero(a.horas_resultantes)} h.` +
          (a.horas_excedidas > 0 ? ` Superarías las 8,5 h en ${numero(a.horas_excedidas)} h.` : ` Faltan ${numero(Math.max(0, 8.5 - a.horas_resultantes))} h para completar 8,5 h.`)
        ).join('\n');
        const decision = await Swal.fire({
          icon: 'info', title: 'Registrar horas extras',
          text: `${detalle}\nYa completarías las 8,5 horas diarias. Si necesitas agregar este tiempo, selecciona Registrar horas extras.`,
          showCancelButton: true, confirmButtonText: 'Registrar horas extras', cancelButtonText: 'Revisar registro',
          focusCancel: true,
        });
        if (!decision.isConfirmed) return;
        payload.confirmar_aviso_horas = true;
        resp = await enviarRegistro();
        j = await resp.json().catch(() => ({}));
      }
      if (!resp.ok) throw new Error(j?.mensaje || `HTTP ${resp.status}`);

      const avisosGuardados = Array.isArray(j?.avisos_horas) ? j.avisos_horas : [];
      const textoAviso = avisosGuardados.map(a => {
        const horas = Number(a.horas_resultantes || 0);
        const valor = horas.toLocaleString('es-CO', { maximumFractionDigits: 2 });
        if (Math.round(horas * 100) < 850) return `${a.fecha}: llevas ${valor} horas. Te estás aproximando a las 8,5 horas diarias.`;
        if (Math.round(horas * 100) === 850) return `${a.fecha}: completaste tus 8,5 horas diarias. Si necesitas registrar más tiempo, al guardar podrás elegir Registrar horas extras.`;
        return `${a.fecha}: registro guardado con ${valor} horas acumuladas en el día.`;
      }).join('\n');
      Swal.fire({
        icon: "success",
        title: modoEdicion ? "Registro actualizado" : "Registro guardado",
        text: textoAviso || (j?.cantidad_registros > 1
          ? (
              j?.es_rango_vacaciones
                ? `Se generaron ${j.cantidad_registros} registros de vacaciones en días laborables, excluyendo fines de semana y festivos de Colombia.`
                : `Se generaron ${j.cantidad_registros} registros por división de horario.`
            )
          : undefined),
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
      (faseIdFromReg && findFaseByRealId(fases, faseIdFromReg)) ||
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
      horarioTrabajo: reg.horarioTrabajoCodigo || reg.horarioTrabajo || reg.horario_trabajo || "",
      oncall: reg.oncall || "",
      desborde: reg.desborde || "",
      proyecto_id: pid,
      proyecto_codigo: reg?.proyecto_codigo ?? reg?.proyecto?.codigo ?? (proyectoObj?.codigo ?? ""),
      proyecto_nombre: reg?.proyecto_nombre ?? reg?.proyecto?.nombre ?? (proyectoObj?.nombre ?? ""),
      proyecto_fase:
        getFaseRealNombre(faseObj) ||
        reg?.proyecto_fase ||
        reg?.fase_proyecto?.nombre ||
        "",
      fase_proyecto_id:
        getFaseRealId(faseObj) || faseIdFromReg || "",
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
      (faseIdFromReg && findFaseByRealId(fases, faseIdFromReg)) ||
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
      horarioTrabajo: reg.horarioTrabajoCodigo || reg.horarioTrabajo || reg.horario_trabajo || "",
      oncall: reg.oncall || "",
      desborde: reg.desborde || "",
      proyecto_id: pid,
      proyecto_codigo: reg?.proyecto_codigo ?? reg?.proyecto?.codigo ?? "",
      proyecto_nombre: reg?.proyecto_nombre ?? reg?.proyecto?.nombre ?? "",
      proyecto_fase:
        getFaseRealNombre(faseObj) ||
        reg?.proyecto_fase ||
        reg?.fase_proyecto?.nombre ||
        "",

      fase_proyecto_id:
        getFaseRealId(faseObj) || faseIdFromReg || "",
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

  const actividadMalla = ['AC', 'CRU1', 'CRU2', 'CRU3', 'DC', 'DE', 'DF', 'IN', 'ON', 'T1E', 'T1I', 'T1X', 'T2E', 'T2I', 'T2X', 'TM2E', 'TT1E', 'TT2E', 'TT2I', 'TM2I', 'TM1E', 'TM1I', 'T3', 'VC', 'SAT', 'N/APLICA'];
  const oncall = ['SI', 'NO', 'N/A'];
  const desborde = ['SI', 'NO', 'N/A'];

  const buildCurrentFilterParams = useCallback(() => {
    const params = new URLSearchParams();

    if (equipoLocked) params.set("equipo", equipoLocked);

    const adminUsaRangoMeses =
      isAdmin && Boolean(filtroMesDesde || filtroMesHasta);

    if (adminUsaRangoMeses) {
      params.set("mes_desde", filtroMesDesde);
      params.set("mes_hasta", filtroMesHasta);
    } else {
      if (filtroMes) params.set("mes", filtroMes);
      if (filtroAnio) params.set("anio", filtroAnio);
    }

    if (filtroFecha) params.set("fecha", filtroFecha);
    if (filtroId) params.set("id", filtroId);
    if (filtroNroCasoCli) params.set("nroCasoCliente", filtroNroCasoCli);

    appendMultiValues(params, "consultor", filtroConsultor);
    appendMultiValues(params, "cliente", filtroCliente);
    appendMultiValues(params, "horasAdicionales", filtroHorasAdic);

    const tareaIds = [
      ...new Set(
        (Array.isArray(filtroTarea) ? filtroTarea : [])
          .map((label) =>
            (todasTareas || []).find(
              (t) => `${t.codigo} - ${t.nombre}` === String(label || "").trim()
            )?.id
          )
          .filter(Boolean)
      ),
    ];

    tareaIds.forEach((id) => params.append("tarea_id", String(id)));

    const ocupacionIds = [
      ...new Set(
        (Array.isArray(filtroOcupacion) ? filtroOcupacion : [])
          .map((label) =>
            (ocupaciones || []).find(
              (o) => `${o.codigo} - ${o.nombre}` === String(label || "").trim()
            )?.id
          )
          .filter(Boolean)
      ),
    ];

    ocupacionIds.forEach((id) => params.append("ocupacion_id", String(id)));

    return params;
  }, [
    equipoLocked,
    isAdmin,
    filtroMes,
    filtroAnio,
    filtroMesDesde,
    filtroMesHasta,
    filtroFecha,
    filtroId,
    filtroNroCasoCli,
    filtroConsultor,
    filtroCliente,
    filtroHorasAdic,
    filtroTarea,
    filtroOcupacion,
    todasTareas,
    ocupaciones,
  ]);

  const aplicarFiltros = () => {
    if (isAdmin && (filtroMesDesde || filtroMesHasta)) {
      const rango = validateMonthRange(filtroMesDesde, filtroMesHasta);
      if (!rango.valid) {
        Swal.fire({ icon: 'warning', title: 'Rango de meses inválido', text: rango.message });
        return;
      }
    }
    if (filtroId && !/^\d+$/.test(filtroId.trim())) {
      Swal.fire({ icon: 'warning', title: 'ID inválido', text: 'El ID debe contener únicamente números.' });
      return;
    }
    if (filtroAnio && !/^(?:19|20|21)\d{2}$/.test(String(filtroAnio).trim())) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Escribe un año de cuatro dígitos.' });
      return;
    }
    setAppliedFilterQuery(buildCurrentFilterParams().toString());
    setPage(1);
    setFilterRevision(v => v + 1);
  };

  const filtrosPendientes = buildCurrentFilterParams().toString() !== appliedFilterQuery;
  const exportExcelBusyRef = useRef(false);

  const handleExport = async () => {
    if (exportingExcel || exportExcelBusyRef.current) return;
    exportExcelBusyRef.current = true;
    setExportingExcel(true);
    const controlador = new AbortController();
    const filtros = new URLSearchParams(appliedFilterQuery);
    const exportacion = crearExportacionRegistrosExcel({
      'Fecha de exportación': new Date().toLocaleString('es-CO'),
      Usuario: usuarioLogin, 'Filtros aplicados': filtros.toString(), 'Orden': 'ID descendente',
    });
    let acumulados = 0;
    let lotes = 0;
    try {
      void Swal.fire({
        title: 'Preparando un único Excel', text: 'Consultando los registros por lotes…',
        allowOutsideClick: false, showConfirmButton: false, showCancelButton: true,
        cancelButtonText: 'Cancelar exportación', didOpen: () => Swal.showLoading(),
      }).then(res => {
        if (res.dismiss === Swal.DismissReason.cancel || res.dismiss === Swal.DismissReason.esc) controlador.abort();
      });
      const TAMANO_LOTE = 1000;
      let cursor = null;
      let snapshot = null;
      let total = null;
      while (true) {
        if (controlador.signal.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
        const params = new URLSearchParams(filtros.toString());
        params.set('lote_size', String(TAMANO_LOTE));
        if (cursor !== null) params.set('cursor_id', String(cursor));
        if (snapshot !== null) params.set('snapshot_id', String(snapshot));
        const res = await jfetch(`/registros/export?${params.toString()}`, {
          method: 'GET', signal: controlador.signal,
          headers: {
            'X-User-Usuario': usuarioLogin, 'X-User-Rol': rol,
            'X-User-Equipo': String(equipoUser || ''), Accept: 'application/json',
          },
        });
        const payload = await res.json().catch(() => { throw new Error(`Respuesta inválida del servidor (HTTP ${res.status}).`); });
        if (!res.ok) throw new Error(payload?.detalle || payload?.mensaje || payload?.error || `HTTP ${res.status}`);
        if (!Array.isArray(payload?.data) || payload.data.length > TAMANO_LOTE || typeof payload.has_more !== 'boolean') {
          throw new Error('El servidor debe tener instalada la versión de routes.py con exportación por lotes.');
        }
        if (total === null) total = Number(payload.total || 0);
        if (!Number.isSafeInteger(payload.snapshot_id) || payload.snapshot_id < 0) throw new Error('Límite de exportación inválido.');
        if (snapshot !== null && payload.snapshot_id !== snapshot) throw new Error('El límite de exportación cambió durante la consulta.');
        snapshot = payload.snapshot_id;
        const siguiente = payload.next_cursor;
        if (payload.has_more && (!payload.data.length || !Number.isSafeInteger(siguiente) || siguiente <= 0 || (cursor !== null && siguiente >= cursor))) {
          throw new Error('El servidor devolvió un cursor de exportación inválido.');
        }
        if (payload.data.length) {
          const cantidad = payload.data.length;
          await exportacion.agregarLote(payload.data, controlador.signal);
          acumulados += cantidad;
          lotes += 1;
          payload.data = null;
          Swal.update({ text: `${acumulados.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')} registros iniciales preparados (${lotes} lotes). Se descargará un solo archivo al finalizar.` });
        }
        if (!payload.has_more) break;
        cursor = siguiente;
      }
      if (controlador.signal.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
      if (!acumulados) {
        await Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros para los filtros aplicados.' });
        return;
      }
      Swal.update({ title: 'Generando el archivo Excel', text: `${acumulados.toLocaleString('es-CO')} registros listos. La descarga comenzará al terminar de generar el libro.` });
      await exportacion.descargar(`registros_${new Date().toISOString().slice(0, 10)}.xlsx`, {
        'Total filtrado al iniciar': total, 'Lotes procesados': lotes,
      }, controlador.signal);
      await Swal.fire({ icon: 'success', title: 'Excel generado',
        text: `${acumulados.toLocaleString('es-CO')} registros reunidos en un único archivo Excel.` });
    } catch (e) {
      await Swal.fire({ icon: e.name === 'AbortError' ? 'info' : 'error',
        title: e.name === 'AbortError' ? 'Exportación cancelada' : 'Error exportando',
        text: e.name === 'AbortError' ? 'Se descartó la preparación. No se descargó un archivo parcial.' : `${String(e.message || e)} No se descargó un archivo parcial.`,
      });
    } finally {
      exportacion.descartar();
      exportExcelBusyRef.current = false;
      setExportingExcel(false);
    }
  };

  useEffect(() => {
    if (!userData) return;

    if (isAdminEquipo) {
      setFiltroConsultor([]);
      setFiltroEquipo(normKey(equipoUser));
      return;
    }

    if (!isAdmin) {
      setFiltroConsultor(nombreUser ? [nombreUser] : []);
      setFiltroEquipo(normKey(equipoUser));
      return;
    }

    if (isAdminRolePool) {
      setFiltroConsultor([]);
      setFiltroEquipo('');
      return;
    }

    if (isAdminGlobal) {
      setFiltroConsultor([]);
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

      const norm = getModulosFromConsultorData(data, userData);

      const moduloPreferido = String(data?.modulo || "").trim();
      const moduloInicial =
        moduloPreferido ||
        (norm.length === 1 ? norm[0] : "");

      setModulos(norm);
      setModuloElegido(moduloInicial);

      setRegistro({
        ...initRegistro(),
        fecha: todayISO,
        modulo: moduloInicial,
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

  const filtroOcupacionIds = useMemo(() => {
    return [
      ...new Set(
        (Array.isArray(filtroOcupacion) ? filtroOcupacion : [])
          .map((label) =>
            (ocupaciones || []).find(
              (o) => `${o.codigo} - ${o.nombre}` === String(label || "").trim()
            )?.id
          )
          .filter(Boolean)
          .map((id) => Number(id))
      ),
    ];
  }, [filtroOcupacion, ocupaciones]);

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
                disabled={exportingExcel || cargandoRegistros}
                title={exportingExcel ? "Descarga por lotes en curso" : "Consultar por lotes y descargar todos los registros filtrados en un único Excel"}
              >
                {exportingExcel ? "Preparando Excel…" : "Descargar Excel completo"}
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
            <p>Selecciona los criterios y pulsa Aplicar filtros. La tabla y el Excel usan los filtros aplicados.</p>
          </div>

          <div className="filter-grid" onKeyDown={e => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); aplicarFiltros(); }
          }}>
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

            <MultiSelectField
              value={filtroCliente}
              onChange={setFiltroCliente}
              options={clientesOptions}
              placeholder="Todos los clientes"
            />

            <MultiSelectField
              value={filtroOcupacion}
              onChange={setFiltroOcupacion}
              options={ocupacionesOptions}
              placeholder="Todas las ocupaciones"
            />

            <MultiSelectField
              value={filtroTarea}
              onChange={setFiltroTarea}
              options={tareasOptions}
              placeholder="Todas las tareas"
            />

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

            <MultiSelectField
              value={filtroConsultor}
              onChange={setFiltroConsultor}
              options={consultoresOptions}
              placeholder={
                !isAdmin
                  ? (nombreUser || "Consultor")
                  : isAdminRolePool
                    ? "Consultores asignados al rol"
                    : "Todos los consultores"
              }
              disabled={!isAdmin}
            />

            <input
              type="text"
              placeholder="Nro. Caso Cliente..."
              value={filtroNroCasoCli}
              onChange={(e) => setFiltroNroCasoCli(e.target.value)}
            />

            <MultiSelectField
              value={filtroHorasAdic}
              onChange={setFiltroHorasAdic}
              options={["SI", "NO"]}
              placeholder="Horas Adicionales"
            />

            <select
              value={filtroMes}
              onChange={(e) => {
                setFiltroMes(e.target.value);
                setFiltroMesDesde("");
                setFiltroMesHasta("");
              }}
            >
              <option value="">Todos los meses</option>
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Año (ej: 2026)"
              value={filtroAnio}
              onChange={(e) => {
                setFiltroAnio(e.target.value);
                setFiltroMesDesde("");
                setFiltroMesHasta("");
              }}
              min="2000"
              max="2100"
            />

            {isAdmin && (
              <>
                <label
                  title="Primer mes incluido en la consulta"
                  style={{ display: "grid", gap: 4 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Mes desde</span>
                  <input
                    type="month"
                    value={filtroMesDesde}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFiltroMesDesde(value);
                      setFiltroMes("");
                      setFiltroAnio("");

                      if (!value) {
                        setFiltroMesHasta("");
                      } else if (!filtroMesHasta) {
                        setFiltroMesHasta(value);
                      }
                    }}
                    aria-label="Mes desde"
                  />
                </label>

                <label
                  title="Último mes incluido en la consulta"
                  style={{ display: "grid", gap: 4 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Mes hasta</span>
                  <input
                    type="month"
                    value={filtroMesHasta}
                    min={filtroMesDesde || undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFiltroMesHasta(value);
                      setFiltroMes("");
                      setFiltroAnio("");

                      if (!value) {
                        setFiltroMesDesde("");
                      } else if (!filtroMesDesde) {
                        setFiltroMesDesde(value);
                      }
                    }}
                    aria-label="Mes hasta"
                  />
                </label>
              </>
            )}
          </div>

          <div className="filter-actions">
            <span className="filter-state" role="status" aria-live="polite">
              {cargandoRegistros ? 'Consultando registros…' : filtrosPendientes ? 'Cambios pendientes: pulsa Aplicar filtros' : `${totalRegistros.toLocaleString('es-CO')} registros con los filtros aplicados`}
            </span>
            <button className="btn btn-primary filter-apply" type="button" onClick={aplicarFiltros} disabled={cargandoRegistros || exportingExcel}>
              {cargandoRegistros ? 'Consultando…' : 'Aplicar filtros'}
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setAppliedFilterQuery('');
                setPage(1);
                setFilterRevision(v => v + 1);
                setFiltroId('');
                setFiltroFecha('');
                setFiltroCliente([]);
                setFiltroTarea([]);
                setFiltroOcupacion([]);
                setFiltroNroCasoCli('');
                setFiltroHorasAdic([]);
                setFiltroMes("");
                setFiltroAnio("");
                setFiltroMesDesde("");
                setFiltroMesHasta("");

                setPage(1);

                if (isAdminEquipo) {
                  setFiltroConsultor([]);
                  setFiltroEquipo(normKey(equipoUser));
                } else if (!isAdmin) {
                  setFiltroConsultor(nombreUser ? [nombreUser] : []);
                  setFiltroEquipo(normKey(equipoUser));
                } else if (isAdminRolePool) {
                  setFiltroConsultor([]);
                  setFiltroEquipo('');
                } else {
                  setFiltroConsultor([]);
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
                      value={registro.modulo || modulos[0] || moduloUser || ''}
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
                    min={puedeRegistrarMesesAnteriores ? undefined : `${todayISO.slice(0, 7)}-01`}
                    max={habilitarRangoVacaciones || puedeRegistrarCualquierFecha ? undefined : todayISO}
                    onChange={(e) => {
                      const value = e.target.value;

                      if (habilitarRangoVacaciones) {
                        setRegistro((r) => ({
                          ...r,
                          fecha: value,
                          fechaInicioVacaciones: value,
                          fechaFinVacaciones:
                            r.fechaFinVacaciones && r.fechaFinVacaciones >= value
                              ? r.fechaFinVacaciones
                              : value,
                        }));
                        return;
                      }

                      setRegistro((r) => ({
                        ...r,
                        fecha: value,
                      }));
                    }}
                    required
                    title={
                      puedeRegistrarCualquierFecha
                        ? "Puedes registrar y editar cualquier fecha."
                        : habilitarRangoVacaciones
                        ? "Para vacaciones se permiten fechas futuras."
                        : "Puedes registrar días del mes actual; no fechas futuras."
                    }
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
                      const tipoTareaText = tareaObj ? `${tareaObj.codigo} - ${tareaObj.nombre}` : "";
                      const esVacaciones = isVacacionesTaskText(tipoTareaText);

                      setRegistro(r => ({
                        ...r,
                        tarea_id: tareaId || '',
                        tipoTarea: tipoTareaText,
                        fechaInicioVacaciones: esVacaciones ? (r.fechaInicioVacaciones || r.fecha || todayISO) : '',
                        fechaFinVacaciones: esVacaciones ? (r.fechaFinVacaciones || r.fecha || todayISO) : '',
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

                  {habilitarRangoVacaciones && (
                    <div className="registro-vacaciones-range span-2">
                      <div className="registro-field">
                        <label>Inicio vacaciones</label>
                        <input
                          type="date"
                          value={registro.fechaInicioVacaciones || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRegistro((r) => ({
                              ...r,
                              fechaInicioVacaciones: value,
                              fecha: value || r.fecha,
                              fechaFinVacaciones:
                                r.fechaFinVacaciones && r.fechaFinVacaciones >= value
                                  ? r.fechaFinVacaciones
                                  : value,
                            }));
                          }}
                          required={habilitarRangoVacaciones}
                        />
                      </div>

                      <div className="registro-field">
                        <label>Fin vacaciones</label>
                        <input
                          type="date"
                          value={registro.fechaFinVacaciones || ''}
                          min={registro.fechaInicioVacaciones || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRegistro((r) => ({
                              ...r,
                              fechaFinVacaciones: value,
                            }));
                          }}
                          required={habilitarRangoVacaciones}
                        />
                      </div>
                    </div>
                  )}

                  {showProyectoUI && (
                    <>
                      <select
                        value={registro.proyecto_id || ""}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const p = proyectosFiltradosPorCliente.find(
                            (x) => String(x.id) === String(pid)
                          );

                          const fases = Array.isArray(p?.fases) ? p.fases : [];
                          setFasesProyecto(fases);

                          const firstFase = fases.length ? fases[0] : null;

                          setRegistro((r) => ({
                            ...r,
                            proyecto_id: pid,
                            proyecto_codigo: p?.codigo || "",
                            proyecto_nombre: p?.nombre || "",
                            nroCasoCliente: p?.codigo ? String(p.codigo) : r.nroCasoCliente,
                            fase_proyecto_id: firstFase ? getFaseRealId(firstFase) : "",
                            proyecto_fase: firstFase ? getFaseRealNombre(firstFase) : "",
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
                            const faseObj = findFaseByRealId(fasesProyecto, faseId);

                            setRegistro((r) => ({
                              ...r,
                              fase_proyecto_id: faseId,
                              proyecto_fase: faseObj ? getFaseRealNombre(faseObj) : "",
                            }));
                          }}
                          required
                        >
                          <option value="">Seleccionar Fase</option>
                          {fasesProyecto.map((fx, idx) => {
                            const realId = getFaseRealId(fx);
                            const realNombre = getFaseRealNombre(fx);

                            return (
                              <option key={realId || `fase-${idx}`} value={realId}>
                                {realNombre}
                              </option>
                            );
                          })}
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
                        {actividadMalla.map((t, idx) => <option key={idx} value={t}>{BASIS_TURNOS[t] ? `${t} — L-J ${BASIS_TURNOS[t].lunesJueves} / V ${BASIS_TURNOS[t].viernes}` : t}</option>)}
                      </select>
                      <div className="span-2" role="status" style={{padding:'10px 12px', background:'#eef5ff', borderRadius:8, fontSize:13}}>
                        <strong>Horario aplicado: </strong>
                        {resolveHorarioTrabajo(registro.horarioTrabajo || horarioUsuario, equipoFormulario, registro.fecha, registro.actividadMalla) || 'Sin rango definido para esta fecha'}
                      </div>
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
                    puedeEditarBloqueados={puedeRegistrarCualquierFecha && String(r.usuario_consultor ?? r.usuario ?? "").trim().toLowerCase() === "gonzalezanf"}
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
                disabled={cargandoRegistros || registrosFiltrados.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ◀
              </button>

              <span className="registro-pagination-text">
                Página {registrosFiltrados.page} / {registrosFiltrados.totalPages} — {registrosFiltrados.total} registros
              </span>

              <button
                className="btn btn-outline"
                disabled={cargandoRegistros || registrosFiltrados.page >= registrosFiltrados.totalPages}
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
            filtroEquipo={appliedFilters.equipo}
            filtroConsultor={appliedFilters.consultores}
            filtroMes={appliedFilters.mes}
            filtroAnio={appliedFilters.anio}
            equipoBloqueado={isAdminEquipo}
          />
        )}

        <Resumen
          userData={userData}
          filtroEquipo={appliedFilters.equipo}
          filtroConsultor={appliedFilters.consultores}
          filtroMes={appliedFilters.mes}
          filtroAnio={appliedFilters.anio}
        />
      </div>
    </div>
  );
};

export default Registro;

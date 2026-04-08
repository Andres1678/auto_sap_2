import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Modal from "react-modal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { jfetch } from "./lib/api";
import "./ProyectosHorasDashboard.css";
import ProyectoFaseTopLineChart from "./Proyectos/ProyectoFaseTopLineChart";

if (typeof document !== "undefined") {
  const rootEl = document.querySelector("#root");
  if (rootEl) {
    Modal.setAppElement(rootEl);
  }
}

/* =========================
   Helpers
========================= */
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const toArrayResponse = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
};

const asBool = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || v === 1 || s === "1" || s === "true";
};

const currentMonthStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const normalizeDateOnly = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
};

const coincideMes = (fechaISO, mesYYYYMM) => {
  if (!mesYYYYMM) return true;
  const fecha = normalizeDateOnly(fechaISO);
  if (!fecha) return false;
  const [y, m] = mesYYYYMM.split("-");
  return fecha.startsWith(`${y}-${m}`);
};

const monthToDateStart = (monthStr) => {
  if (!monthStr) return "";
  return `${monthStr}-01`;
};

const monthToDateEnd = (monthStr) => {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return "";
  const lastDay = new Date(y, m, 0).getDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

const estaEnRangoFecha = (fechaISO, desde, hasta) => {
  const fecha = normalizeDateOnly(fechaISO);
  if (!fecha) return false;
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
};

const hasRangeActivo = (
  tipoRango,
  filtroRangoMesDesde,
  filtroRangoMesHasta,
  filtroFechaDesde,
  filtroFechaHasta
) => {
  if (tipoRango === "mes") {
    return !!(filtroRangoMesDesde || filtroRangoMesHasta);
  }
  return !!(filtroFechaDesde || filtroFechaHasta);
};

const cumpleFiltroFechaPrincipal = ({
  fechaISO,
  filtroMes,
  rangoActivo,
  rangoDesde,
  rangoHasta,
}) => {
  if (rangoActivo) {
    return estaEnRangoFecha(fechaISO, rangoDesde, rangoHasta);
  }

  if (filtroMes) {
    return coincideMes(fechaISO, filtroMes);
  }

  return true;
};

const equipoOf = (r, fallback = "SIN EQUIPO") =>
  String(r?.equipo || r?.equipoNormalizado || "").trim().toUpperCase() || fallback;

const uniqueCount = (rows, keyFn) => {
  const s = new Set();
  for (const r of rows) {
    const k = keyFn(r);
    if (k) s.add(String(k));
  }
  return s.size;
};

const normTxt = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");

const cleanProjectInput = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const up = s.toUpperCase();
  if (up === "0" || up === "NA" || up === "N/A") return "";
  return s;
};

const getHorasRegistro = (r) =>
  toNum(
    r?.horasNum ??
      r?.total_horas ??
      r?.totalHoras ??
      r?.tiempoInvertido ??
      r?.tiempo_invertido ??
      0
  );

const buildProyectoLabel = (p) => {
  const codigo = String(p?.codigo || "").trim();
  const nombre = String(p?.nombre || "").trim();

  if (codigo && nombre) return `${codigo} - ${nombre}`;
  if (codigo) return codigo;
  if (nombre) return nombre;
  return "SIN PROYECTO";
};

const groupSum = (rows, keyFn, labelFn) => {
  const acc = new Map();

  for (const r of rows) {
    const key = String(keyFn(r) || "SIN_PROYECTO");
    const label = String(labelFn(r) || "SIN PROYECTO");

    const prev = acc.get(key) || {
      key,
      name: label,
      horas: 0,
    };

    prev.horas += getHorasRegistro(r);
    acc.set(key, prev);
  }

  return Array.from(acc.values())
    .map((x) => ({
      ...x,
      horas: +x.horas.toFixed(2),
    }))
    .sort((a, b) => b.horas - a.horas);
};

const recordMatchesSelfScope = (r, usuario, nombreUser, equipoUser) => {
  if (equipoUser && equipoOf(r) !== equipoUser) return false;

  const userLogin = String(usuario || "").trim().toLowerCase();
  const rowLogin = String(r?.usuario_consultor || r?.usuario || "")
    .trim()
    .toLowerCase();

  if (userLogin && rowLogin) {
    return userLogin === rowLogin;
  }

  const userName = normTxt(nombreUser);
  const rowName = normTxt(r?.consultor || r?.consultorNormalizado || "");

  if (userName && rowName) {
    return userName === rowName;
  }

  return true;
};

const CHART_BLUE = "#0055B8";

const getYAxisWidth = (kind, data = []) => {
  const longest = Math.max(
    18,
    ...data.map((d) => String(d?.name || "").length)
  );

  if (kind === "proyecto") return Math.min(Math.max(longest * 7.2, 320), 460);
  if (kind === "consultor") return Math.min(Math.max(longest * 6.9, 280), 400);
  return Math.min(Math.max(longest * 6.6, 260), 380);
};

const getChartHeight = (len) => {
  return Math.min(Math.max(380, len * 34), 980);
};

/* =========================
   Helpers gráfico por mes
========================= */
const MONTHS_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

const getMonthKeyFromFecha = (fechaISO) => {
  const fecha = normalizeDateOnly(fechaISO);
  if (!fecha || fecha.length < 7) return "";
  return fecha.slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "SIN MES";
  const [y, m] = monthKey.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return monthKey;
  return `${MONTHS_ES[idx]} ${y}`;
};

function MesModuloTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const row = payload[0]?.payload;
  const detalle = Array.isArray(row?.modulosDetalle) ? row.modulosDetalle : [];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        minWidth: 240,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ marginBottom: 8 }}>
        <b>Total:</b> {Number(row?.horas || 0).toFixed(2)} h
      </div>

      {detalle.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#475569" }}>
            Módulos
          </div>
          {detalle.slice(0, 8).map((m) => (
            <div
              key={m.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 12,
                padding: "3px 0",
              }}
            >
              <span style={{ color: "#334155" }}>{m.name}</span>
              <span style={{ fontWeight: 700 }}>{Number(m.horas).toFixed(2)} h</span>
            </div>
          ))}
          {detalle.length > 8 && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              + {detalle.length - 8} módulos más
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================
   Tick custom: WRAP en YAxis
========================= */
function YAxisTickWrap(props) {
  const {
    x,
    y,
    payload,
    width = 420,
    maxLines = 5,
    lineHeight = 13,
    fontSize = 12,
  } = props;

  const text = String(payload?.value ?? "").trim();
  const words = text.split(/\s+/).filter(Boolean);

  const maxCharsPerLine = Math.max(18, Math.floor(width / 8.2));
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;

    if (test.length <= maxCharsPerLine) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;

      if (lines.length >= maxLines - 1) break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  const visibleText = lines.join(" ");
  const wasCut = visibleText.length < text.length;

  if (wasCut && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s*$/, "")}…`;
  }

  const offsetY = -((lines.length - 1) * lineHeight) / 2;

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{text}</title>
      <text
        x={0}
        y={offsetY}
        textAnchor="end"
        fill="#475569"
        fontSize={fontSize}
        fontWeight={700}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/* =========================
   MultiFiltro
========================= */
function MultiFiltro({
  titulo,
  opciones,
  seleccion,
  onChange,
  placeholder = "Todos",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const calcPosition = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedDropdownHeight = 340;
      setOpenUp(spaceBelow < estimatedDropdownHeight && rect.top > estimatedDropdownHeight / 2);
    };

    calcPosition();
    window.addEventListener("resize", calcPosition);
    window.addEventListener("scroll", calcPosition, true);

    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };

    document.addEventListener("mousedown", handler);

    return () => {
      window.removeEventListener("resize", calcPosition);
      window.removeEventListener("scroll", calcPosition, true);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const toggleValue = (val) => {
    if (disabled) return;
    const exists = seleccion.includes(val);
    const next = exists ? seleccion.filter((v) => v !== val) : [...seleccion, val];
    onChange(next);
  };

  const lower = search.toLowerCase();
  const filtered = (opciones || []).filter((o) =>
    String(o || "").toLowerCase().includes(lower)
  );

  const showPlaceholder = seleccion.length === 0;

  return (
    <div
      className={
        "phd-mf" +
        (open ? " is-layer-open" : "") +
        (openUp ? " is-open-up" : "")
      }
      ref={ref}
    >
      <span className="phd-mf-label">{titulo}</span>

      <button
        type="button"
        className={
          "phd-mf-control" +
          (open ? " is-open" : "") +
          (disabled ? " is-disabled" : "")
        }
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        {showPlaceholder ? (
          <span className="phd-mf-placeholder">{placeholder}</span>
        ) : (
          <div className="phd-mf-chips">
            {seleccion.map((val) => (
              <span key={val} className="phd-mf-chip">
                <span>{val}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(seleccion.filter((v) => v !== val));
                    }}
                    aria-label={`Quitar ${val}`}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <span className="phd-mf-arrow">▾</span>
      </button>

      {open && !disabled && (
        <div className="phd-mf-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="phd-mf-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
            />
          </div>
          <div className="phd-mf-options">
            {filtered.length === 0 && <div className="phd-mf-empty">Sin resultados</div>}
            {filtered.map((val) => (
              <label key={val} className="phd-mf-option">
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

 const isMonthStr = (value) => /^\d{4}-\d{2}$/.test(String(value || ""));
  const isDateStr = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  const normalizeMonthRange = (desdeMes, hastaMes) => {
    const d = isMonthStr(desdeMes) ? desdeMes : "";
    const h = isMonthStr(hastaMes) ? hastaMes : "";

    if (!d && !h) return { desdeMes: "", hastaMes: "", activo: false };

    // si solo selecciona uno, tomar ese mismo mes como inicio y fin
    if (d && !h) return { desdeMes: d, hastaMes: d, activo: true };
    if (!d && h) return { desdeMes: h, hastaMes: h, activo: true };

    return d <= h
      ? { desdeMes: d, hastaMes: h, activo: true }
      : { desdeMes: h, hastaMes: d, activo: true };
  };

  const normalizeDayRange = (desde, hasta) => {
    const d = isDateStr(desde) ? desde : "";
    const h = isDateStr(hasta) ? hasta : "";

    if (!d && !h) return { desde: "", hasta: "", activo: false };

    // si solo selecciona una fecha, tomar ese mismo día
    if (d && !h) return { desde: d, hasta: d, activo: true };
    if (!d && h) return { desde: h, hasta: h, activo: true };

    return d <= h
      ? { desde: d, hasta: h, activo: true }
      : { desde: h, hasta: d, activo: true };
  };

  const buildMonthSeries = (desdeMonthKey, hastaMonthKey) => {
    if (!isMonthStr(desdeMonthKey) || !isMonthStr(hastaMonthKey)) return [];

    let [y, m] = desdeMonthKey.split("-").map(Number);
    const [endY, endM] = hastaMonthKey.split("-").map(Number);

    const out = [];

    while (y < endY || (y === endY && m <= endM)) {
      const key = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
      out.push({
        key,
        name: formatMonthLabel(key),
        horas: 0,
        totalModulos: 0,
        modulosDetalle: [],
      });

      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    return out;
  };

/* =========================
   Componente principal
========================= */
export default function ProyectosHorasDashboard({
  userData,
  defaultMonth = "",
  registrosOverride = null,
}) {
  const initialMonth = useMemo(() => defaultMonth || currentMonthStr(), [defaultMonth]);

  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState("");
  const [proyectos, setProyectos] = useState([]);
  const [mapeosProyecto, setMapeosProyecto] = useState([]);
  const [loadingMain, setLoadingMain] = useState(false);

  const [filtroMes, setFiltroMes] = useState(initialMonth);

  const [tipoRango, setTipoRango] = useState("mes");
  const [filtroRangoMesDesde, setFiltroRangoMesDesde] = useState("");
  const [filtroRangoMesHasta, setFiltroRangoMesHasta] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");

  const [filtroEquipo, setFiltroEquipo] = useState([]);
  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroCliente, setFiltroCliente] = useState([]);
  const [filtroModulo, setFiltroModulo] = useState([]);
  const [filtroOcupacion, setFiltroOcupacion] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroProyecto, setFiltroProyecto] = useState([]);

  const [detailTitle, setDetailTitle] = useState("");
  const [detailRows, setDetailRows] = useState([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const abortMainRef = useRef(null);

  const user = useMemo(() => {
    if (userData) return userData?.user ? userData.user : userData;
    try {
      return (
        JSON.parse(localStorage.getItem("userData") || "null") ||
        JSON.parse(localStorage.getItem("user") || "null") ||
        {}
      );
    } catch {
      return {};
    }
  }, [userData]);

  const rolUpper = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const equipoUser = String(user?.equipo || user?.user?.equipo || "").toUpperCase();
  const usuario = String(user?.usuario || user?.user?.usuario || "").trim();
  const nombreUser = String(user?.nombre || user?.user?.nombre || "").trim();

  const ADMIN_ALL_ROLES = new Set(["ADMIN", "ADMIN_GERENTES"]);
  const isAdminAll = ADMIN_ALL_ROLES.has(rolUpper);
  const isAdminTeam = !isAdminAll && rolUpper.startsWith("ADMIN_") && !!equipoUser;
  const scope = isAdminAll ? "ALL" : isAdminTeam ? "TEAM" : "SELF";

  const initFiltrosPorScope = useCallback(() => {
    if (scope === "SELF") {
      setFiltroConsultor(nombreUser ? [nombreUser] : []);
      setFiltroEquipo(equipoUser ? [equipoUser] : []);
    } else if (scope === "TEAM") {
      setFiltroEquipo(equipoUser ? [equipoUser] : []);
      setFiltroConsultor([]);
    } else {
      setFiltroEquipo([]);
      setFiltroConsultor([]);
    }
  }, [scope, nombreUser, equipoUser]);

  useEffect(() => {
    initFiltrosPorScope();
  }, [initFiltrosPorScope]);

  const rangoMesNormalizado = useMemo(
    () => normalizeMonthRange(filtroRangoMesDesde, filtroRangoMesHasta),
    [filtroRangoMesDesde, filtroRangoMesHasta]
  );

  const rangoDiaNormalizado = useMemo(
    () => normalizeDayRange(filtroFechaDesde, filtroFechaHasta),
    [filtroFechaDesde, filtroFechaHasta]
  );

  const rangoActivo = useMemo(() => {
    return tipoRango === "mes"
      ? rangoMesNormalizado.activo
      : rangoDiaNormalizado.activo;
  }, [tipoRango, rangoMesNormalizado, rangoDiaNormalizado]);

  const rangoDesde = useMemo(() => {
    if (tipoRango === "mes") return monthToDateStart(rangoMesNormalizado.desdeMes);
    return rangoDiaNormalizado.desde;
  }, [tipoRango, rangoMesNormalizado, rangoDiaNormalizado]);

  const rangoHasta = useMemo(() => {
    if (tipoRango === "mes") return monthToDateEnd(rangoMesNormalizado.hastaMes);
    return rangoDiaNormalizado.hasta;
  }, [tipoRango, rangoMesNormalizado, rangoDiaNormalizado]);

  const filtroMesActivo = useMemo(() => {
    return rangoActivo ? "" : filtroMes;
  }, [rangoActivo, filtroMes]);

  useEffect(() => {
    if (rangoActivo && filtroMes) {
      setFiltroMes("");
    }
  }, [rangoActivo, filtroMes]);

  useEffect(() => {
    const fetchCatalogosProyecto = async () => {
      try {
        const [resProyectos, resMapeos] = await Promise.all([
          jfetch("/proyectos?include_modulos=0&include_fases=0"),
          jfetch("/proyecto-mapeos"),
        ]);

        const [jsonProyectos, jsonMapeos] = await Promise.all([
          resProyectos.json().catch(() => []),
          resMapeos.json().catch(() => []),
        ]);

        if (!resProyectos.ok) {
          throw new Error(jsonProyectos?.mensaje || `HTTP ${resProyectos.status}`);
        }
        if (!resMapeos.ok) {
          throw new Error(jsonMapeos?.mensaje || `HTTP ${resMapeos.status}`);
        }

        setProyectos(
          toArrayResponse(jsonProyectos).map((p) => ({
            ...p,
            activo: asBool(p?.activo),
          }))
        );

        setMapeosProyecto(
          toArrayResponse(jsonMapeos).map((m) => ({
            ...m,
            activo: asBool(m?.activo),
          }))
        );
      } catch (e) {
        console.error("Error cargando catálogo de proyectos:", e);
        setProyectos([]);
        setMapeosProyecto([]);
      }
    };

    fetchCatalogosProyecto();
  }, []);

  useEffect(() => {
    setFiltroMes(defaultMonth || currentMonthStr());
  }, [defaultMonth]);

  const proyectosByCodigo = useMemo(() => {
    const map = new Map();

    (proyectos || []).forEach((p) => {
      const codigo = normTxt(p?.codigo);
      if (!codigo) return;
      map.set(codigo, p);
    });

    return map;
  }, [proyectos]);

  const proyectosById = useMemo(() => {
    const map = new Map();

    (proyectos || []).forEach((p) => {
      const id = Number(p?.id);
      if (!id) return;
      map.set(id, p);
    });

    return map;
  }, [proyectos]);

  const proyectoLabelToId = useMemo(() => {
    const map = new Map();

    (proyectos || []).forEach((p) => {
      const label = buildProyectoLabel(p);
      const id = Number(p?.id);

      if (label && Number.isFinite(id) && id > 0) {
        map.set(label, id);
      }
    });

    return map;
  }, [proyectos]);

  const mapeosProyectoPreparados = useMemo(() => {
    const exactMap = new Map();
    const containsRules = [];
    const regexRules = [];

    (mapeosProyecto || []).forEach((m) => {
      if (!asBool(m?.activo)) return;

      const proyecto = proyectosById.get(Number(m.proyecto_id));
      if (!proyecto) return;

      const valor = normTxt(m.valor_origen);
      const tipo = String(m.tipo_match || "EXACT").toUpperCase();

      if (!valor) return;

      if (tipo === "EXACT") {
        exactMap.set(valor, proyecto);
      } else if (tipo === "CONTAINS") {
        containsRules.push({ valor, proyecto });
      } else if (tipo === "REGEX") {
        try {
          regexRules.push({
            regex: new RegExp(String(m.valor_origen), "i"),
            proyecto,
          });
        } catch {
          // ignorar regex inválido
        }
      }
    });

    containsRules.sort((a, b) => b.valor.length - a.valor.length);

    return { exactMap, containsRules, regexRules };
  }, [mapeosProyecto, proyectosById]);

  const fetchGraficos = useCallback(async () => {
    if (Array.isArray(registrosOverride)) {
      setError("");
      setRegistros(registrosOverride);
      return;
    }

    if (!usuario) return;

    if (abortMainRef.current) {
      try {
        abortMainRef.current.abort();
      } catch {}
    }

    const controller = new AbortController();
    abortMainRef.current = controller;

    setLoadingMain(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (rangoActivo) {
        if (rangoDesde) params.set("desde", rangoDesde);
        if (rangoHasta) params.set("hasta", rangoHasta);
      } else if (filtroMesActivo) {
        params.set("mes", filtroMesActivo);
      }

      params.set("max_rows", "10000");

      const qs = params.toString();
      const url = qs ? `/dashboard/proyectos-horas?${qs}` : "/dashboard/proyectos-horas";

      const res = await jfetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "X-User-Rol": rolUpper,
          "X-User-Usuario": usuario,
          "X-User-Equipo": equipoUser,
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.detalle ||
            json?.mensaje ||
            json?.error ||
            `HTTP ${res.status}`
        );
      }

      setRegistros(toArrayResponse(json));
    } catch (e) {
      if (e?.name === "AbortError") return;
      setRegistros([]);
      setError(String(e?.message || e));
    } finally {
      setLoadingMain(false);
    }
  }, [
    registrosOverride,
    usuario,
    rolUpper,
    equipoUser,
    filtroMesActivo,
    rangoActivo,
    rangoDesde,
    rangoHasta,
  ]);

  useEffect(() => {
    fetchGraficos();
    return () => {
      if (abortMainRef.current) {
        try {
          abortMainRef.current.abort();
        } catch {}
      }
    };
  }, [fetchGraficos]);

  const resolveProyecto = useCallback(
    (r) => {
      const pid = Number(r?.proyecto_id || r?.proyecto?.id || 0);
      if (pid && proyectosById.has(pid)) {
        return proyectosById.get(pid);
      }

      const codigoDirecto = normTxt(r?.proyecto_codigo || r?.proyecto?.codigo || "");
      if (codigoDirecto && proyectosByCodigo.has(codigoDirecto)) {
        return proyectosByCodigo.get(codigoDirecto);
      }

      const candidatos = [
        cleanProjectInput(r?.proyecto_codigo),
        cleanProjectInput(r?.proyecto?.codigo),
        cleanProjectInput(r?.nroCasoCliente),
        cleanProjectInput(r?.nro_caso_cliente),
        cleanProjectInput(r?.descripcion),
      ].filter(Boolean);

      for (const raw of candidatos) {
        const val = normTxt(raw);
        if (!val) continue;

        if (proyectosByCodigo.has(val)) {
          return proyectosByCodigo.get(val);
        }

        if (mapeosProyectoPreparados.exactMap.has(val)) {
          return mapeosProyectoPreparados.exactMap.get(val);
        }

        for (const rule of mapeosProyectoPreparados.containsRules) {
          if (val.includes(rule.valor)) {
            return rule.proyecto;
          }
        }

        for (const rule of mapeosProyectoPreparados.regexRules) {
          if (rule.regex.test(String(raw))) {
            return rule.proyecto;
          }
        }
      }

      return null;
    },
    [proyectosById, proyectosByCodigo, mapeosProyectoPreparados]
  );

  const registrosEnriquecidos = useMemo(() => {
    return (registros || []).map((r) => {
      const proyectoResuelto = resolveProyecto(r);

      const proyectoKey = proyectoResuelto
        ? `PROY_${proyectoResuelto.id}`
        : "SIN_PROYECTO";

      const proyectoOficial = proyectoResuelto
        ? buildProyectoLabel(proyectoResuelto)
        : "SIN PROYECTO";

      const proyectoDigitadoRaw = cleanProjectInput(
        r?.proyecto_codigo ||
          r?.proyecto?.codigo ||
          r?.nroCasoCliente ||
          r?.nro_caso_cliente
      );

      const mesKey = getMonthKeyFromFecha(r?.fecha);

      return {
        ...r,
        equipoNormalizado: equipoOf(r),
        clienteNormalizado: String(r?.cliente || "SIN CLIENTE").trim(),
        ocupacionNormalizada: String(
          r?.ocupacion_nombre || r?.ocupacion || "SIN OCUPACIÓN"
        ).trim(),
        moduloNormalizado: String(r?.modulo || "—").trim(),
        consultorNormalizado: String(r?.consultor || r?.usuario_consultor || "—").trim(),
        tareaNormalizada: String(
          r?.tipoTarea || r?.tipo_tarea || r?.tarea?.nombre || "—"
        ).trim(),
        proyectoKey,
        proyectoOficial,
        proyectoDigitado: proyectoDigitadoRaw || "",
        mesKey,
        mesLabel: formatMonthLabel(mesKey),
        horasNum: getHorasRegistro(r),
      };
    });
  }, [registros, resolveProyecto]);

  const equiposUnicos = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.equipoNormalizado)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const consultoresUnicos = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .filter((r) => (scope !== "TEAM" ? true : !equipoUser || r.equipoNormalizado === equipoUser))
        .map((r) => r.consultorNormalizado)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [
    registrosEnriquecidos,
    filtroMesActivo,
    rangoActivo,
    rangoDesde,
    rangoHasta,
    scope,
    equipoUser,
  ]);

  const clientesUnicos = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.clienteNormalizado)
    );

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const modulosUnicos = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.moduloNormalizado)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const ocupacionesUnicas = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.ocupacionNormalizada)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const tareasUnicas = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.tareaNormalizada)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const proyectosUnicos = useMemo(() => {
    const set = new Set(
      (registrosEnriquecidos ?? [])
        .filter((r) =>
          cumpleFiltroFechaPrincipal({
            fechaISO: r.fecha,
            filtroMes: filtroMesActivo,
            rangoActivo,
            rangoDesde,
            rangoHasta,
          })
        )
        .map((r) => r.proyectoOficial)
        .filter((x) => x && x !== "SIN PROYECTO")
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrosEnriquecidos, filtroMesActivo, rangoActivo, rangoDesde, rangoHasta]);

  const datosFiltrados = useMemo(() => {
    return (registrosEnriquecidos ?? []).filter((r) => {
      if (scope === "SELF") {
        if (!recordMatchesSelfScope(r, usuario, nombreUser, equipoUser)) return false;
      }

      if (scope === "TEAM") {
        if (equipoUser && r.equipoNormalizado !== equipoUser) return false;
      }

      if (
        !cumpleFiltroFechaPrincipal({
          fechaISO: r.fecha,
          filtroMes: filtroMesActivo,
          rangoActivo,
          rangoDesde,
          rangoHasta,
        })
      ) {
        return false;
      }

      if (filtroEquipo.length > 0 && !filtroEquipo.includes(r.equipoNormalizado)) return false;
      if (filtroConsultor.length > 0 && !filtroConsultor.includes(r.consultorNormalizado)) return false;
      if (filtroCliente.length > 0 && !filtroCliente.includes(r.clienteNormalizado)) return false;
      if (filtroModulo.length > 0 && !filtroModulo.includes(r.moduloNormalizado)) return false;
      if (filtroOcupacion.length > 0 && !filtroOcupacion.includes(r.ocupacionNormalizada)) return false;
      if (filtroTarea.length > 0 && !filtroTarea.includes(r.tareaNormalizada)) return false;
      if (filtroProyecto.length > 0 && !filtroProyecto.includes(r.proyectoOficial)) return false;

      return true;
    });
  }, [
    registrosEnriquecidos,
    filtroMesActivo,
    rangoActivo,
    rangoDesde,
    rangoHasta,
    filtroEquipo,
    filtroConsultor,
    filtroCliente,
    filtroModulo,
    filtroOcupacion,
    filtroTarea,
    filtroProyecto,
    scope,
    usuario,
    nombreUser,
    equipoUser,
  ]);

  const horasPorMesModulo = useMemo(() => {
    const acc = new Map();

    for (const r of datosFiltrados) {
      const mesKey = r?.mesKey || getMonthKeyFromFecha(r?.fecha);
      if (!mesKey) continue;

      const mesLabel = r?.mesLabel || formatMonthLabel(mesKey);
      const modulo = String(r?.moduloNormalizado || "SIN MÓDULO").trim();
      const horas = getHorasRegistro(r);

      const prev = acc.get(mesKey) || {
        key: mesKey,
        name: mesLabel,
        horas: 0,
        modulosMap: new Map(),
      };

      prev.horas += horas;
      prev.modulosMap.set(modulo, toNum(prev.modulosMap.get(modulo)) + horas);

      acc.set(mesKey, prev);
    }

    const rows = Array.from(acc.values())
      .map((row) => {
        const modulosDetalle = Array.from(row.modulosMap.entries())
          .map(([name, horas]) => ({
            name,
            horas: +toNum(horas).toFixed(2),
          }))
          .sort((a, b) => b.horas - a.horas);

        return {
          key: row.key,
          name: row.name,
          horas: +row.horas.toFixed(2),
          totalModulos: modulosDetalle.length,
          modulosDetalle,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    const byKey = new Map(rows.map((r) => [r.key, r]));

    let mesDesdeSerie = "";
    let mesHastaSerie = "";

    if (rangoActivo) {
      mesDesdeSerie = rangoDesde ? rangoDesde.slice(0, 7) : "";
      mesHastaSerie = rangoHasta ? rangoHasta.slice(0, 7) : "";
    } else if (filtroMesActivo) {
      mesDesdeSerie = filtroMesActivo;
      mesHastaSerie = filtroMesActivo;
    } else if (rows.length > 0) {
      mesDesdeSerie = rows[0].key;
      mesHastaSerie = rows[rows.length - 1].key;
    }

    if (!mesDesdeSerie || !mesHastaSerie) return rows;

    const baseSerie = buildMonthSeries(mesDesdeSerie, mesHastaSerie);

    return baseSerie.map((base) => byKey.get(base.key) || base);
  }, [datosFiltrados, rangoActivo, rangoDesde, rangoHasta, filtroMesActivo]);

  const horasPorProyecto = useMemo(
    () =>
      groupSum(
        datosFiltrados,
        (r) => r.proyectoKey,
        (r) => r.proyectoOficial
      ),
    [datosFiltrados]
  );

  const horasPorModulo = useMemo(
    () => groupSum(datosFiltrados, (r) => r.moduloNormalizado, (r) => r.moduloNormalizado),
    [datosFiltrados]
  );

  const horasPorConsultor = useMemo(
    () => groupSum(datosFiltrados, (r) => r.consultorNormalizado, (r) => r.consultorNormalizado),
    [datosFiltrados]
  );

  const horasPorTarea = useMemo(
    () => groupSum(datosFiltrados, (r) => r.tareaNormalizada, (r) => r.tareaNormalizada),
    [datosFiltrados]
  );

  const horasPorOcupacion = useMemo(
    () => groupSum(datosFiltrados, (r) => r.ocupacionNormalizada, (r) => r.ocupacionNormalizada),
    [datosFiltrados]
  );

  const totalHoras = useMemo(
    () => datosFiltrados.reduce((s, r) => s + r.horasNum, 0),
    [datosFiltrados]
  );

  const totalProyectos = useMemo(
    () =>
      uniqueCount(
        datosFiltrados.filter((r) => r.proyectoKey !== "SIN_PROYECTO"),
        (r) => r.proyectoKey
      ),
    [datosFiltrados]
  );

  const totalConsultores = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.consultorNormalizado),
    [datosFiltrados]
  );

  const totalModulos = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.moduloNormalizado),
    [datosFiltrados]
  );

  const totalTareas = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.tareaNormalizada),
    [datosFiltrados]
  );

  const openDetail = useCallback(
    (kind, value, extra = "") => {
      let rows = [];

      if (kind === "proyecto") {
        rows = datosFiltrados.filter((r) => r.proyectoKey === value);
      }

      if (kind === "modulo") {
        rows = datosFiltrados.filter((r) => r.moduloNormalizado === value);
      }

      if (kind === "consultor") {
        rows = datosFiltrados.filter((r) => r.consultorNormalizado === value);
      }

      if (kind === "tarea") {
        rows = datosFiltrados.filter((r) => r.tareaNormalizada === value);
      }

      if (kind === "ocupacion") {
        rows = datosFiltrados.filter((r) => r.ocupacionNormalizada === value);
      }

      if (kind === "mes_total") {
        rows = datosFiltrados.filter((r) => r.mesKey === value);
      }

      rows = rows.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      const subtotal = rows.reduce((s, r) => s + r.horasNum, 0);

      let label = value;

      if (kind === "proyecto") {
        label = rows[0]?.proyectoOficial || "SIN PROYECTO";
      } else if (kind === "mes_total") {
        label = rows[0]?.mesLabel || formatMonthLabel(value) || value;
      }

      setDetailTitle(`${kind.toUpperCase()}: ${label} — Total: ${subtotal.toFixed(2)} h`);
      setDetailRows(rows);
      setDetailOpen(true);
    },
    [datosFiltrados]
  );
  
  const TOP = 20;
  const topProyectos = useMemo(() => horasPorProyecto.slice(0, TOP), [horasPorProyecto]);

  const limpiarFiltros = () => {
    const mesBase = defaultMonth || currentMonthStr();

    setFiltroMes(mesBase);
    setTipoRango("mes");
    setFiltroRangoMesDesde("");
    setFiltroRangoMesHasta("");
    setFiltroFechaDesde("");
    setFiltroFechaHasta("");

    setFiltroModulo([]);
    setFiltroOcupacion([]);
    setFiltroTarea([]);
    setFiltroProyecto([]);
    setFiltroCliente([]);

    if (scope === "ALL") {
      setFiltroEquipo([]);
      setFiltroConsultor([]);
    } else if (scope === "TEAM") {
      setFiltroEquipo(equipoUser ? [equipoUser] : []);
      setFiltroConsultor([]);
    } else {
      setFiltroEquipo(equipoUser ? [equipoUser] : []);
      setFiltroConsultor(nombreUser ? [nombreUser] : []);
    }
  };

  const renderChartCard = (title, data, kind, opts = {}) => {
    if (!data || data.length === 0) {
      return (
        <div className={`phd-card phd-card-chart ${opts.className || ""}`}>
          <div className="phd-card-head">
            <h4>{title}</h4>
          </div>
          <div className="phd-empty">Sin datos con los filtros.</div>
        </div>
      );
    }

    const chartData = opts.limit ? data.slice(0, opts.limit) : data;
    const height = getChartHeight(chartData.length);
    const yAxisWidth = getYAxisWidth(kind, chartData);

    return (
      <div className={`phd-card phd-card-chart ${opts.className || ""}`}>
        <div className="phd-card-head">
          <h4>{title}</h4>
          <span className="phd-card-badge">{chartData.length} ítems</span>
        </div>

        <div className="phd-chartWrap">
          <div className="phd-chartInner">
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 12, right: 34, left: 8, bottom: 12 }}
                barCategoryGap={10}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 700 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={yAxisWidth}
                  tick={<YAxisTickWrap width={yAxisWidth - 14} />}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]}
                  labelFormatter={(label) => `Nombre: ${label}`}
                />
                <Bar
                  dataKey="horas"
                  name="Horas"
                  fill={CHART_BLUE}
                  radius={[10, 10, 10, 10]}
                  onClick={(entry) => openDetail(kind, entry?.key ?? entry?.name)}
                  style={{ cursor: "pointer" }}
                >
                  <LabelList
                    dataKey="horas"
                    position="right"
                    formatter={(v) => `${Number(v).toFixed(1)} h`}
                    style={{
                      fill: "#334155",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderMesModuloChart = (title, data) => {
    if (!data || data.length === 0) {
      return (
        <div className="phd-card phd-card-chart phd-card--wide">
          <div className="phd-card-head">
            <h4>{title}</h4>
          </div>
          <div className="phd-empty">Sin datos con los filtros.</div>
        </div>
      );
    }

    const barSize =
      data.length <= 1 ? 92 : data.length === 2 ? 76 : data.length <= 4 ? 58 : 44;

    return (
      <div className="phd-card phd-card-chart phd-card--wide">
        <div className="phd-card-head">
          <h4>{title}</h4>
          <span className="phd-card-badge">
            {data.length} {data.length === 1 ? "mes" : "meses"}
          </span>
        </div>

        <div className="phd-chartWrap">
          <div className="phd-chartInner">
            <ResponsiveContainer width="100%" height={410}>
              <BarChart
                data={data}
                margin={{ top: 34, right: 26, left: 8, bottom: 62 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={52}
                  tick={{ fontSize: 12, fill: "#475569", fontWeight: 700 }}
                />
                <YAxis
                  width={58}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                  tick={{ fontSize: 12, fill: "#475569", fontWeight: 700 }}
                />
                <Tooltip content={<MesModuloTooltip />} />

                <Bar
                  dataKey="horas"
                  name="Horas"
                  fill={CHART_BLUE}
                  radius={[10, 10, 0, 0]}
                  barSize={barSize}
                  onClick={(entry) => openDetail("mes_total", entry?.payload?.key)}
                  style={{ cursor: "pointer" }}
                >
                  <LabelList
                    dataKey="horas"
                    position="top"
                    formatter={(v) => `${Number(v).toFixed(1)} h`}
                    style={{
                      fill: "#334155",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="phd-page">
      <div className="phd-shell">
        <section className="phd-hero">
          <div className="phd-hero-left">
            <span className="phd-kicker">Dashboard</span>
            <h1>Horas por Proyecto</h1>
            <p>
              Visualiza horas registradas por mes y módulo, proyecto, consultor, tarea y ocupación
              con filtros avanzados y detalle de registros.
            </p>
          </div>

          <div className="phd-hero-right">
            <div className="phd-hero-stat">
              <span>Total horas</span>
              <strong>{totalHoras.toFixed(2)} h</strong>
            </div>
            <div className="phd-hero-stat">
              <span>Registros</span>
              <strong>{datosFiltrados.length}</strong>
            </div>
          </div>
        </section>

        {loadingMain && <div className="phd-loading-box">Cargando información...</div>}
        {error && <div className="phd-error">Error: {error}</div>}

        <section className="phd-kpis">
          <div className="phd-kpi phd-kpi-blue">
            <span>Proyectos</span>
            <strong>{totalProyectos}</strong>
          </div>
          <div className="phd-kpi phd-kpi-red">
            <span>Consultores</span>
            <strong>{totalConsultores}</strong>
          </div>
          <div className="phd-kpi phd-kpi-dark">
            <span>Módulos</span>
            <strong>{totalModulos}</strong>
          </div>
          <div className="phd-kpi phd-kpi-green">
            <span>Tareas</span>
            <strong>{totalTareas}</strong>
          </div>
        </section>

        <section className="phd-filtros-card">
          <div className="phd-filtros-head">
            <div>
              <h3>Filtros</h3>
              <p>Aplica filtros para refinar las gráficas y el detalle.</p>
            </div>
            <button className="phd-btn phd-btn-dark" onClick={limpiarFiltros} type="button">
              Limpiar filtros
            </button>
          </div>

          <div className="phd-filtros-grid">
            <div className="phd-month">
              <span className="phd-label">MES</span>
              <input
                type="month"
                value={rangoActivo ? "" : filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                disabled={rangoActivo}
              />
            </div>

            <div className="phd-month">
              <span className="phd-label">TIPO DE RANGO</span>
              <select
                value={tipoRango}
                onChange={(e) => setTipoRango(e.target.value)}
              >
                <option value="mes">Rango por meses</option>
                <option value="dia">Rango por días</option>
              </select>
            </div>

            {tipoRango === "mes" ? (
              <>
                <div className="phd-month">
                  <span className="phd-label">RANGO MES DESDE</span>
                  <input
                    type="month"
                    value={filtroRangoMesDesde}
                    onChange={(e) => setFiltroRangoMesDesde(e.target.value)}
                  />
                </div>

                <div className="phd-month">
                  <span className="phd-label">RANGO MES HASTA</span>
                  <input
                    type="month"
                    value={filtroRangoMesHasta}
                    onChange={(e) => setFiltroRangoMesHasta(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="phd-month">
                  <span className="phd-label">FECHA DESDE</span>
                  <input
                    type="date"
                    value={filtroFechaDesde}
                    onChange={(e) => setFiltroFechaDesde(e.target.value)}
                  />
                </div>

                <div className="phd-month">
                  <span className="phd-label">FECHA HASTA</span>
                  <input
                    type="date"
                    value={filtroFechaHasta}
                    onChange={(e) => setFiltroFechaHasta(e.target.value)}
                  />
                </div>
              </>
            )}

            <MultiFiltro
              titulo="PROYECTOS (OFICIAL)"
              opciones={proyectosUnicos}
              seleccion={filtroProyecto}
              onChange={setFiltroProyecto}
              placeholder="Todos los proyectos"
            />

            <MultiFiltro
              titulo="CLIENTES"
              opciones={clientesUnicos}
              seleccion={filtroCliente}
              onChange={setFiltroCliente}
              placeholder="Todos los clientes"
            />

            <MultiFiltro
              titulo="MÓDULOS"
              opciones={modulosUnicos}
              seleccion={filtroModulo}
              onChange={setFiltroModulo}
              placeholder="Todos los módulos"
            />

            <MultiFiltro
              titulo="OCUPACIÓN"
              opciones={ocupacionesUnicas}
              seleccion={filtroOcupacion}
              onChange={setFiltroOcupacion}
              placeholder="Todas las ocupaciones"
            />

            <MultiFiltro
              titulo="TAREAS"
              opciones={tareasUnicas}
              seleccion={filtroTarea}
              onChange={setFiltroTarea}
              placeholder="Todas las tareas"
            />

            <MultiFiltro
              titulo="CONSULTORES"
              opciones={scope === "SELF" ? (nombreUser ? [nombreUser] : []) : consultoresUnicos}
              seleccion={filtroConsultor}
              onChange={scope === "SELF" ? () => {} : setFiltroConsultor}
              disabled={scope === "SELF"}
              placeholder={scope === "SELF" ? nombreUser || "Tu usuario" : "Todos"}
            />

            <MultiFiltro
              titulo="EQUIPOS"
              opciones={scope === "ALL" ? equiposUnicos : equipoUser ? [equipoUser] : []}
              seleccion={filtroEquipo}
              onChange={scope === "ALL" ? setFiltroEquipo : () => {}}
              disabled={scope !== "ALL"}
              placeholder={scope === "ALL" ? "Todos" : "Tu equipo"}
            />
          </div>
        </section>

        <section className="phd-grid">
          {renderChartCard(`Top Proyectos (Top ${TOP})`, topProyectos, "proyecto")}

          <div className="phd-card-slot">
            <ProyectoFaseTopLineChart
              rows={datosFiltrados}
              title="Proyecto vs fase más trabajada"
              top={10}
            />
          </div>

          {renderMesModuloChart("Horas por Mes y Módulo", horasPorMesModulo)}

          {renderChartCard("Horas por Módulo", horasPorModulo, "modulo", { limit: 18 })}
          {renderChartCard("Horas por Consultor", horasPorConsultor, "consultor", { limit: 18 })}

          {renderChartCard("Horas por Tarea", horasPorTarea, "tarea", { limit: 20 })}
          {renderChartCard("Horas por Ocupación", horasPorOcupacion, "ocupacion", { limit: 20 })}
        </section>
      </div>

      <Modal
        isOpen={detailOpen}
        onRequestClose={() => setDetailOpen(false)}
        className="phd-modal"
        overlayClassName="phd-modalOverlay"
        contentLabel="Detalle de horas"
        shouldCloseOnOverlayClick
        ariaHideApp={false}
      >
        <div className="phd-modalHeader">
          <div className="phd-modalHeaderText">
            <h3 className="phd-modalTitle">{detailTitle || "Detalle"}</h3>
            <div className="phd-modalSub">
              Filas: <b>{detailRows.length}</b> · Total:{" "}
              <b>{detailRows.reduce((s, r) => s + r.horasNum, 0).toFixed(2)} h</b>
            </div>
          </div>

          <button
            className="phd-modalClose"
            onClick={() => setDetailOpen(false)}
            aria-label="Cerrar"
            type="button"
          >
            ✖
          </button>
        </div>

        <div className="phd-modalBody">
          {detailRows.length === 0 ? (
            <div className="phd-empty phd-empty-lg">Sin filas para mostrar.</div>
          ) : (
            <div className="phd-modalTableWrap">
              <table className="phd-table phd-table-detail">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Mes</th>
                    <th>Consultor</th>
                    <th>Cliente</th>
                    <th>Proyecto (OFICIAL)</th>
                    <th>Proyecto (Digitado)</th>
                    <th>Módulo</th>
                    <th>Ocupación</th>
                    <th>Tarea</th>
                    <th className="num">Horas</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r, i) => (
                    <tr key={r.id ?? i}>
                      <td className="num">{r.id ?? "—"}</td>
                      <td>{r.fecha}</td>
                      <td>{r.mesLabel || "—"}</td>
                      <td className="phd-truncate" title={r.consultorNormalizado}>
                        {r.consultorNormalizado}
                      </td>
                      <td className="phd-truncate" title={r.cliente}>
                        {r.cliente}
                      </td>
                      <td className="phd-truncate" title={r.proyectoOficial}>
                        {r.proyectoOficial}
                      </td>
                      <td className="phd-truncate" title={r.proyectoDigitado || ""}>
                        {r.proyectoDigitado || "—"}
                      </td>
                      <td className="phd-truncate" title={r.moduloNormalizado}>
                        {r.moduloNormalizado}
                      </td>
                      <td className="phd-truncate" title={r.ocupacionNormalizada}>
                        {r.ocupacionNormalizada}
                      </td>
                      <td className="phd-truncate" title={r.tareaNormalizada}>
                        {r.tareaNormalizada}
                      </td>
                      <td className="num">{r.horasNum.toFixed(2)}</td>
                      <td className="phd-truncate phd-detail-desc" title={r.descripcion || ""}>
                        {r.descripcion || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
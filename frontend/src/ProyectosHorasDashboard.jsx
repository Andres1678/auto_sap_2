import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { jfetch } from "./lib/api";
import "./ProyectosHorasDashboard.css";

/* =========================
   Helpers
========================= */
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const coincideMes = (fechaISO, mesYYYYMM) => {
  if (!mesYYYYMM) return true;
  const [y, m] = mesYYYYMM.split("-");
  return typeof fechaISO === "string" && fechaISO.startsWith(`${y}-${m}`);
};

const equipoOf = (r, fallback = "SIN EQUIPO") =>
  String(r?.equipo || "").trim().toUpperCase() || fallback;

const groupSum = (rows, keyFn) => {
  const acc = new Map();
  for (const r of rows) {
    const k = String(keyFn(r) || "—");
    acc.set(k, (acc.get(k) || 0) + toNum(r?.tiempoInvertido));
  }
  return Array.from(acc, ([name, horas]) => ({
    name,
    horas: +horas.toFixed(2),
  })).sort((a, b) => b.horas - a.horas);
};

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

/* =========================
   Tick custom: WRAP en YAxis
========================= */
function YAxisTickWrap(props) {
  const { x, y, payload, width = 420 } = props;
  const text = String(payload?.value ?? "");

  const maxCharsPerLine = Math.max(18, Math.floor(width / 10));
  const maxLines = 3;

  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = (line ? line + " " : "") + w;
    if (test.length <= maxCharsPerLine) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  const joined = lines.join(" ");
  const wasCut = joined.length < text.length;
  if (wasCut && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, "") + "…";
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{text}</title>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="#475569"
        fontSize={12}
        fontWeight={700}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 14}>
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
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
    <div className="phd-mf" ref={ref}>
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

/* =========================
   Componente principal dashboard
========================= */
export default function ProyectosHorasDashboard({
  userData,
  defaultMonth = "",
  registrosOverride = null,
}) {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState("");
  const [proyectos, setProyectos] = useState([]);
  const [mapeosProyecto, setMapeosProyecto] = useState([]);

  const [filtroMes, setFiltroMes] = useState(defaultMonth || "");
  const [filtroEquipo, setFiltroEquipo] = useState([]);
  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroModulo, setFiltroModulo] = useState([]);
  const [filtroOcupacion, setFiltroOcupacion] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroProyecto, setFiltroProyecto] = useState([]);

  const [detailTitle, setDetailTitle] = useState("");
  const [detailRows, setDetailRows] = useState([]);
  const [detailVisible, setDetailVisible] = useState(false);

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

  const proyectosByCodigo = useMemo(() => {
    const map = new Map();

    (proyectos || []).forEach((p) => {
      const codigo = normTxt(p?.codigo);
      if (!codigo) return;
      map.set(codigo, p);
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

      const proyecto = (proyectos || []).find((p) => Number(p.id) === proyectoId);
      if (!proyecto) return;

      map.set(origen, proyecto);
    });

    return map;
  }, [mapeosProyecto, proyectos]);

  const projectOfficial = (r) => {
    // 1) si el registro ya viene amarrado a proyecto
    const codigoDirecto = String(r?.proyecto_codigo || r?.proyecto?.codigo || "").trim();
    const nombreDirecto = String(r?.proyecto_nombre || r?.proyecto?.nombre || "").trim();

    if (codigoDirecto) {
      return `${codigoDirecto} - ${nombreDirecto || "SIN NOMBRE"}`;
    }

    // 2) intentar por nroCasoCliente = código del proyecto
    const nroCaso = String(r?.nroCasoCliente || "").trim();
    const nroCasoNorm = normTxt(nroCaso);

    if (nroCasoNorm && proyectosByCodigo.has(nroCasoNorm)) {
      const p = proyectosByCodigo.get(nroCasoNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    // 3) intentar por mapeo usando nroCasoCliente
    if (nroCasoNorm && mapeoOrigenToProyecto.has(nroCasoNorm)) {
      const p = mapeoOrigenToProyecto.get(nroCasoNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    // 4) intentar por mapeo usando descripción
    const descripcion = String(r?.descripcion || "").trim();
    const descripcionNorm = normTxt(descripcion);

    if (descripcionNorm && mapeoOrigenToProyecto.has(descripcionNorm)) {
      const p = mapeoOrigenToProyecto.get(descripcionNorm);
      return `${p.codigo} - ${p.nombre || "SIN NOMBRE"}`;
    }

    return "SIN PROYECTO";
};

  const projectDigitado = (r) => {
    const raw = String(r?.nroCasoCliente ?? "").trim();
    if (!raw || raw === "0" || raw.toUpperCase() === "NA" || raw.toUpperCase() === "N/A") return "";
    return raw;
  };

  useEffect(() => {
    setFiltroMes(defaultMonth || "");
  }, [defaultMonth]);

  useEffect(() => {
    const initFiltrosPorScope = () => {
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
    };

    if (Array.isArray(registrosOverride)) {
      setError("");
      setRegistros(registrosOverride);
      initFiltrosPorScope();
      return;
    }

    const fetchData = async () => {
      setError("");
      try {
        const res = await jfetch("/registros/graficos", {
          method: "GET",
          headers: {
            "X-User-Rol": rolUpper,
            "X-User-Usuario": usuario,
            "X-User-Equipo": equipoUser,
          },
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

        const arr = Array.isArray(json) ? json : [];
        setRegistros(arr);
        initFiltrosPorScope();
      } catch (e) {
        setRegistros([]);
        setError(String(e?.message || e));
      }
    };

    fetchData();
  }, [registrosOverride, rolUpper, usuario, equipoUser, scope, nombreUser]);

  useEffect(() => {
  const fetchProyectos = async () => {
    try {
      const res = await jfetch("/proyectos");
      const json = await res.json().catch(() => []);
      if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
      setProyectos(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error("Error cargando proyectos:", e);
      setProyectos([]);
    }
  };

  fetchProyectos();
}, []);

  useEffect(() => {
    const fetchMapeos = async () => {
      try {
        const res = await jfetch("/proyecto-mapeos");
        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
        setMapeosProyecto(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("Error cargando mapeos:", e);
        setMapeosProyecto([]);
      }
    };

    fetchMapeos();
  }, []);

  const equiposUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .map((r) => equipoOf(r))
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const consultoresUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .filter((r) => (scope !== "TEAM" ? true : !equipoUser || equipoOf(r) === equipoUser))
        .map((r) => r.consultor)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes, scope, equipoUser]);

  const modulosUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .map((r) => r.modulo)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const ocupacionesUnicas = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .map((r) => r.ocupacion_nombre || "SIN OCUPACIÓN")
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const tareasUnicas = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .map((r) => r.tipoTarea)
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const proyectosUnicos = useMemo(() => {
    const set = new Set(
      (registros ?? [])
        .filter((r) => coincideMes(r.fecha, filtroMes))
        .map((r) => projectOfficial(r))
    );
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [registros, filtroMes]);

  const datosFiltrados = useMemo(() => {
    return (registros ?? []).filter((r) => {
      const eq = equipoOf(r);

      if (scope === "SELF") {
        const u = String(usuario || "").trim().toLowerCase();
        const ru = String(r.usuario_consultor || "").trim().toLowerCase();
        if (u && ru && ru !== u) return false;
        if (equipoUser && eq !== equipoUser) return false;
      }

      if (scope === "TEAM") {
        if (equipoUser && eq !== equipoUser) return false;
      }

      if (!coincideMes(r.fecha, filtroMes)) return false;
      if (filtroEquipo.length > 0 && !filtroEquipo.includes(eq)) return false;
      if (filtroConsultor.length > 0 && !filtroConsultor.includes(r.consultor)) return false;
      if (filtroModulo.length > 0 && !filtroModulo.includes(r.modulo)) return false;

      const ocup = r.ocupacion_nombre || "SIN OCUPACIÓN";
      if (filtroOcupacion.length > 0 && !filtroOcupacion.includes(ocup)) return false;

      if (filtroTarea.length > 0 && !filtroTarea.includes(r.tipoTarea)) return false;

      const prjOfficial = projectOfficial(r);
      if (filtroProyecto.length > 0 && !filtroProyecto.includes(prjOfficial)) return false;

      return true;
    });
  }, [
    registros,
    filtroMes,
    filtroEquipo,
    filtroConsultor,
    filtroModulo,
    filtroOcupacion,
    filtroTarea,
    filtroProyecto,
    scope,
    usuario,
    equipoUser,
  ]);

  const horasPorProyecto = useMemo(
    () => groupSum(datosFiltrados, (r) => projectOfficial(r)),
    [datosFiltrados]
  );
  const horasPorModulo = useMemo(
    () => groupSum(datosFiltrados, (r) => r.modulo || "—"),
    [datosFiltrados]
  );
  const horasPorConsultor = useMemo(
    () => groupSum(datosFiltrados, (r) => r.consultor || "—"),
    [datosFiltrados]
  );
  const horasPorTarea = useMemo(
    () => groupSum(datosFiltrados, (r) => r.tipoTarea || "—"),
    [datosFiltrados]
  );
  const horasPorOcupacion = useMemo(
    () => groupSum(datosFiltrados, (r) => r.ocupacion_nombre || "SIN OCUPACIÓN"),
    [datosFiltrados]
  );

  const totalHoras = useMemo(
    () => datosFiltrados.reduce((s, r) => s + toNum(r.tiempoInvertido), 0),
    [datosFiltrados]
  );

  const totalProyectos = useMemo(
    () => uniqueCount(datosFiltrados, (r) => projectOfficial(r)),
    [datosFiltrados]
  );

  const totalConsultores = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.consultor),
    [datosFiltrados]
  );

  const totalModulos = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.modulo),
    [datosFiltrados]
  );

  const totalTareas = useMemo(
    () => uniqueCount(datosFiltrados, (r) => r.tipoTarea),
    [datosFiltrados]
  );

  const openDetail = (kind, value) => {
    let rows = [];
    if (kind === "proyecto") rows = datosFiltrados.filter((r) => projectOfficial(r) === value);
    if (kind === "modulo") rows = datosFiltrados.filter((r) => (r.modulo || "—") === value);
    if (kind === "consultor") rows = datosFiltrados.filter((r) => (r.consultor || "—") === value);
    if (kind === "tarea") rows = datosFiltrados.filter((r) => (r.tipoTarea || "—") === value);
    if (kind === "ocupacion") rows = datosFiltrados.filter((r) => (r.ocupacion_nombre || "SIN OCUPACIÓN") === value);

    rows = rows.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const subtotal = rows.reduce((s, r) => s + toNum(r.tiempoInvertido), 0);

    setDetailTitle(`${kind.toUpperCase()}: ${value} — Total: ${subtotal.toFixed(2)} h`);
    setDetailRows(rows);
    setDetailVisible(true);

    requestAnimationFrame(() => {
      const node = document.getElementById("phd-detail-section");
      if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const TOP = 20;
  const topProyectos = horasPorProyecto.slice(0, TOP);

  const renderChartCard = (title, data, color, kind) => {
    if (!data || data.length === 0) {
      return (
        <div className="phd-card phd-card-chart">
          <div className="phd-card-head">
            <h4>{title}</h4>
          </div>
          <div className="phd-empty">Sin datos con los filtros.</div>
        </div>
      );
    }

    const height = Math.max(320, data.length * 34);
    const yAxisWidth = 460;

    return (
      <div className="phd-card phd-card-chart">
        <div className="phd-card-head">
          <h4>{title}</h4>
          <span className="phd-card-badge">{data.length} ítems</span>
        </div>

        <div className="phd-chartWrap">
          <div className="phd-chartInner">
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 10, right: 24, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={yAxisWidth}
                  tick={<YAxisTickWrap width={yAxisWidth} />}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]}
                  labelFormatter={(label) => `Nombre: ${label}`}
                />
                {kind === "proyecto" && <Legend />}
                <Bar dataKey="horas" name="Horas">
                  {data.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={color}
                      onClick={() => openDetail(kind, entry.name)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const limpiarFiltros = () => {
    setFiltroModulo([]);
    setFiltroOcupacion([]);
    setFiltroTarea([]);
    setFiltroProyecto([]);

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

  return (
    <div className="phd-page">
      <div className="phd-shell">
        <section className="phd-hero">
          <div className="phd-hero-left">
            <span className="phd-kicker">Dashboard</span>
            <h1>Horas por Proyecto</h1>
            <p>
              Visualiza horas registradas por proyecto, módulo, consultor, tarea y ocupación
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
            <button className="phd-btn phd-btn-dark" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          </div>

          <div className="phd-filtros-grid">
            <div className="phd-month">
              <span className="phd-label">MES</span>
              <input
                type="month"
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
              />
            </div>

            <MultiFiltro
              titulo="PROYECTOS (OFICIAL)"
              opciones={proyectosUnicos}
              seleccion={filtroProyecto}
              onChange={setFiltroProyecto}
              placeholder="Todos los proyectos"
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
          {renderChartCard(`Top Proyectos (Top ${TOP})`, topProyectos, "#0055B8", "proyecto")}
          {renderChartCard("Horas por Módulo", horasPorModulo, "#E30613", "modulo")}
          {renderChartCard("Horas por Consultor", horasPorConsultor, "#111827", "consultor")}
          {renderChartCard("Horas por Tarea", horasPorTarea, "#0EA5E9", "tarea")}
          {renderChartCard("Horas por Ocupación", horasPorOcupacion, "#10B981", "ocupacion")}
        </section>

        <section id="phd-detail-section" className="phd-detail-section">
          <div className="phd-detail-head">
            <div>
              <h3>Detalle</h3>
              <p>
                {detailVisible
                  ? detailTitle
                  : "Haz clic en cualquier barra para ver el detalle de registros."}
              </p>
            </div>

            {detailVisible && (
              <button
                className="phd-btn phd-btn-light"
                onClick={() => {
                  setDetailVisible(false);
                  setDetailRows([]);
                  setDetailTitle("");
                }}
              >
                Cerrar detalle
              </button>
            )}
          </div>

          {!detailVisible ? (
            <div className="phd-empty phd-empty-lg">
              Selecciona una barra en cualquiera de las gráficas para cargar el detalle aquí.
            </div>
          ) : (
            <>
              <div className="phd-detail-meta">
                Filas: <b>{detailRows.length}</b> · Total:{" "}
                <b>{detailRows.reduce((s, r) => s + toNum(r.tiempoInvertido), 0).toFixed(2)} h</b>
              </div>

              <div className="phd-tableWrap">
                <table className="phd-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
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
                      <tr key={i}>
                        <td className="num">{r.id ?? "—"}</td>
                        <td>{r.fecha}</td>
                        <td className="truncate" title={r.consultor}>{r.consultor}</td>
                        <td className="truncate" title={r.cliente}>{r.cliente}</td>
                        <td className="truncate" title={projectOfficial(r)}>{projectOfficial(r)}</td>
                        <td className="truncate" title={projectDigitado(r) || ""}>
                          {projectDigitado(r) || "—"}
                        </td>
                        <td className="truncate" title={r.modulo}>{r.modulo}</td>
                        <td className="truncate" title={r.ocupacion_nombre || ""}>
                          {r.ocupacion_nombre || "SIN OCUPACIÓN"}
                        </td>
                        <td className="truncate" title={r.tipoTarea || ""}>
                          {r.tipoTarea || "—"}
                        </td>
                        <td className="num">{toNum(r.tiempoInvertido).toFixed(2)}</td>
                        <td className="truncate" title={r.descripcion || ""}>
                          {r.descripcion || ""}
                        </td>
                      </tr>
                    ))}
                    {detailRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="phd-empty">Sin filas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
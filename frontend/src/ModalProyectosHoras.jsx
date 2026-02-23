import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-modal";
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
import "./ModalProyectosHoras.css";

import { ACTIVE_PROJECTS } from "./activeProjects";
import { buildProjectIndex, matchProject } from "./projectMatch";


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

/* =========================
   MultiFiltro (chips)
========================= */
function MultiFiltro({
  titulo,
  opciones,
  seleccion,
  onChange,
  placeholder = "Todas",
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
    <div className="pmf" ref={ref}>
      <span className="pmf-label">{titulo}</span>

      <button
        type="button"
        className={
          "pmf-control" + (open ? " is-open" : "") + (disabled ? " is-disabled" : "")
        }
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        {showPlaceholder ? (
          <span className="pmf-placeholder">{placeholder}</span>
        ) : (
          <div className="pmf-chips">
            {seleccion.map((val) => (
              <span key={val} className="pmf-chip">
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
        <span className="pmf-arrow">▾</span>
      </button>

      {open && !disabled && (
        <div className="pmf-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="pmf-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
            />
          </div>
          <div className="pmf-options">
            {filtered.length === 0 && <div className="pmf-empty">Sin resultados</div>}
            {filtered.map((val) => (
              <label key={val} className="pmf-option">
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
   Componente principal (Modal)
========================= */
export default function ModalProyectosHoras({
  isOpen,
  onClose,
  userData,
  defaultMonth = "",
  registrosOverride = null,
}) {
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState("");

  // filtros
  const [filtroMes, setFiltroMes] = useState(defaultMonth);
  const [filtroEquipo, setFiltroEquipo] = useState([]);
  const [filtroConsultor, setFiltroConsultor] = useState([]);
  const [filtroModulo, setFiltroModulo] = useState([]);
  const [filtroOcupacion, setFiltroOcupacion] = useState([]);
  const [filtroTarea, setFiltroTarea] = useState([]);
  const [filtroProyecto, setFiltroProyecto] = useState([]);

  // detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailRows, setDetailRows] = useState([]);

  // ✅ refs para manejar foco y evitar warning aria-hidden
  const closeBtnRef = useRef(null);
  const closeDetailBtnRef = useRef(null);

  // user
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

  // índice proyectos
  const projectIndex = useMemo(() => buildProjectIndex(ACTIVE_PROJECTS), []);

  const getProjectMatch = (r) => {
    const raw = r?.nroCasoCliente;
    const m = matchProject(raw, projectIndex);

    if (m.status === "MATCH" && m.proyecto?.display) {
      return {
        status: "MATCH",
        official: m.proyecto.display,
        raw: String(raw ?? "").trim(),
      };
    }

    const rawText = String(raw ?? "").trim();
    if (!rawText || rawText === "0" || rawText.toUpperCase() === "NA" || rawText.toUpperCase() === "N/A") {
      return { status: "EMPTY", official: "SIN PROYECTO", raw: rawText };
    }

    return { status: "NO_MATCH", official: "NO MAPEADO", raw: rawText };
  };

  const projectOfficial = (r) => getProjectMatch(r).official;

  /* =========================
     Sync month cuando abres
  ========================= */
  useEffect(() => {
    if (!isOpen) return;
    setFiltroMes(defaultMonth || "");
  }, [isOpen, defaultMonth]);

  /* =========================
     Cargar data SOLO al abrir
  ========================= */
  useEffect(() => {
    if (!isOpen) return;

    // usar override
    if (Array.isArray(registrosOverride)) {
      setError("");
      setRegistros(registrosOverride);

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
      } catch (e) {
        setRegistros([]);
        setError(String(e?.message || e));
      }
    };

    fetchData();
  }, [isOpen, registrosOverride, rolUpper, usuario, equipoUser, scope, nombreUser]);

  /* =========================
     Opciones filtros
  ========================= */
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
  }, [registros, filtroMes, projectIndex]);

  /* =========================
     Datos filtrados
  ========================= */
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
    projectIndex,
  ]);

  /* =========================
     Agrupaciones
  ========================= */
  const horasPorProyecto = useMemo(
    () => groupSum(datosFiltrados, (r) => projectOfficial(r)),
    [datosFiltrados, projectIndex]
  );
  const horasPorModulo = useMemo(() => groupSum(datosFiltrados, (r) => r.modulo || "—"), [datosFiltrados]);
  const horasPorConsultor = useMemo(() => groupSum(datosFiltrados, (r) => r.consultor || "—"), [datosFiltrados]);
  const horasPorTarea = useMemo(() => groupSum(datosFiltrados, (r) => r.tipoTarea || "—"), [datosFiltrados]);
  const horasPorOcupacion = useMemo(
    () => groupSum(datosFiltrados, (r) => r.ocupacion_nombre || "SIN OCUPACIÓN"),
    [datosFiltrados]
  );

  const totalHoras = useMemo(() => datosFiltrados.reduce((s, r) => s + toNum(r.tiempoInvertido), 0), [datosFiltrados]);

  /* =========================
     Modal detalle
  ========================= */
  const openDetail = (kind, value) => {
    let rows = [];
    if (kind === "proyecto") rows = datosFiltrados.filter((r) => projectOfficial(r) === value);
    if (kind === "modulo") rows = datosFiltrados.filter((r) => (r.modulo || "—") === value);
    if (kind === "consultor") rows = datosFiltrados.filter((r) => (r.consultor || "—") === value);
    if (kind === "tarea") rows = datosFiltrados.filter((r) => (r.tipoTarea || "—") === value);
    if (kind === "ocupacion")
      rows = datosFiltrados.filter((r) => (r.ocupacion_nombre || "SIN OCUPACIÓN") === value);

    rows = rows.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const subtotal = rows.reduce((s, r) => s + toNum(r.tiempoInvertido), 0);

    setDetailTitle(`${kind.toUpperCase()}: ${value} — Total: ${subtotal.toFixed(2)} h`);
    setDetailRows(rows);
    setDetailOpen(true);
  };

  const closeDetail = () => setDetailOpen(false);

  const TOP = 20;
  const topProyectos = horasPorProyecto.slice(0, TOP);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="mph-modal"
      overlayClassName="mph-overlay"
      contentLabel="Horas por Proyecto"
      shouldCloseOnOverlayClick
      // ✅ evita warning aria-hidden moviendo foco dentro del modal
      shouldFocusAfterRender={true}
      shouldReturnFocusAfterClose={true}
      onAfterOpen={() => {
        closeBtnRef.current?.focus();
      }}
    >
      <div className="mph-header">
        <div>
          <h3 className="mph-title">Horas por Proyecto (mapeo por Nro. Caso Cliente)</h3>
          <div className="mph-sub">
            Total filtrado: <b>{totalHoras.toFixed(2)} h</b> · Registros: <b>{datosFiltrados.length}</b>
          </div>
        </div>
        <button
          ref={closeBtnRef}
          className="mph-close"
          onClick={onClose}
          aria-label="Cerrar"
          type="button"
        >
          ✖
        </button>
      </div>

      {error && <div className="mph-error">Error: {error}</div>}

      <div className="mph-filtros">
        <div className="mph-month">
          <span className="mph-label">MES</span>
          <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} />
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

        <button
          className="mph-btn"
          type="button"
          onClick={() => {
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
          }}
        >
          Limpiar
        </button>
      </div>

      <div className="mph-grid">
        {/* Top Proyectos */}
        <div className="mph-card">
          <h4>Top Proyectos (Top {TOP})</h4>
          {topProyectos.length === 0 ? (
            <div className="mph-empty">Sin datos con los filtros.</div>
          ) : (
            <div className="mph-chartScroll">
              <ResponsiveContainer width="100%" height={Math.max(320, topProyectos.length * 28)}>
                <BarChart data={topProyectos} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={360} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />
                  <Legend />
                  <Bar dataKey="horas" name="Horas">
                    {topProyectos.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#0055B8"
                        onClick={() => openDetail("proyecto", entry.name)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Módulo */}
        <div className="mph-card">
          <h4>Horas por Módulo</h4>
          {horasPorModulo.length === 0 ? (
            <div className="mph-empty">Sin datos.</div>
          ) : (
            <div className="mph-chartScroll">
              <ResponsiveContainer width="100%" height={Math.max(320, horasPorModulo.length * 28)}>
                <BarChart data={horasPorModulo} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={260} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />
                  <Bar dataKey="horas">
                    {horasPorModulo.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#E30613"
                        onClick={() => openDetail("modulo", entry.name)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Consultor */}
        <div className="mph-card">
          <h4>Horas por Consultor</h4>
          {horasPorConsultor.length === 0 ? (
            <div className="mph-empty">Sin datos.</div>
          ) : (
            <div className="mph-chartScroll">
              <ResponsiveContainer width="100%" height={Math.max(320, horasPorConsultor.length * 28)}>
                <BarChart data={horasPorConsultor} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={300} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />
                  <Bar dataKey="horas">
                    {horasPorConsultor.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#111827"
                        onClick={() => openDetail("consultor", entry.name)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Tarea */}
        <div className="mph-card">
          <h4>Horas por Tarea</h4>
          {horasPorTarea.length === 0 ? (
            <div className="mph-empty">Sin datos.</div>
          ) : (
            <div className="mph-chartScroll">
              <ResponsiveContainer width="100%" height={Math.max(320, horasPorTarea.length * 28)}>
                <BarChart data={horasPorTarea} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={420} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />
                  <Bar dataKey="horas">
                    {horasPorTarea.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#0EA5E9"
                        onClick={() => openDetail("tarea", entry.name)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Ocupación */}
        <div className="mph-card">
          <h4>Horas por Ocupación</h4>
          {horasPorOcupacion.length === 0 ? (
            <div className="mph-empty">Sin datos.</div>
          ) : (
            <div className="mph-chartScroll">
              <ResponsiveContainer width="100%" height={Math.max(320, horasPorOcupacion.length * 28)}>
                <BarChart data={horasPorOcupacion} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={380} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />
                  <Bar dataKey="horas">
                    {horasPorOcupacion.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#10B981"
                        onClick={() => openDetail("ocupacion", entry.name)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* =============== MODAL DETALLE (tabla) =============== */}
      {detailOpen && (
        <Modal
          isOpen={detailOpen}
          onRequestClose={closeDetail}
          className="mph-modalDetail"
          overlayClassName="mph-overlayDetail"
          contentLabel="Detalle"
          shouldFocusAfterRender={true}
          shouldReturnFocusAfterClose={true}
          onAfterOpen={() => {
            closeDetailBtnRef.current?.focus();
          }}
        >
          <div className="mph-header">
            <h3 className="mph-title">{detailTitle}</h3>
            <button
              ref={closeDetailBtnRef}
              className="mph-close"
              onClick={closeDetail}
              aria-label="Cerrar"
              type="button"
            >
              ✖
            </button>
          </div>

          <div className="mph-detailBody">
            <div className="mph-detailMeta">
              Filas: <b>{detailRows.length}</b> · Total:{" "}
              <b>{detailRows.reduce((s, r) => s + toNum(r.tiempoInvertido), 0).toFixed(2)} h</b>
            </div>

            <div className="mph-tableWrap">
              <table className="mph-table">
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
                  {detailRows.map((r, i) => {
                    const pm = getProjectMatch(r);
                    return (
                      <tr key={i}>
                        <td className="num">{r.id ?? "—"}</td>
                        <td>{r.fecha}</td>
                        <td className="truncate" title={r.consultor}>
                          {r.consultor}
                        </td>
                        <td className="truncate" title={r.cliente}>
                          {r.cliente}
                        </td>
                        <td className="truncate" title={pm.official}>
                          {pm.official}
                        </td>
                        <td className="truncate" title={pm.raw || ""}>
                          {pm.raw || "—"}
                        </td>
                        <td className="truncate" title={r.modulo}>
                          {r.modulo}
                        </td>
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
                    );
                  })}
                  {detailRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="mph-empty">
                        Sin filas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
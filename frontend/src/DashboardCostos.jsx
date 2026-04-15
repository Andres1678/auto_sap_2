import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jfetch } from "./lib/api";
import "./DashboardCostos.css";

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtMoney(v) {
  return money.format(Number(v || 0));
}

function fmtHours(v) {
  return `${numberFmt.format(Number(v || 0))} h`;
}

function fmtInt(v) {
  return new Intl.NumberFormat("es-CO").format(Number(v || 0));
}

function fmtPercent(v) {
  return `${numberFmt.format(Number(v || 0))}%`;
}

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeUpper(v) {
  return normalizeText(v).toUpperCase();
}

function sameClient(a, b) {
  return normalizeUpper(a) === normalizeUpper(b);
}

function buildYearOptions(baseYear) {
  const y = Number(baseYear || new Date().getFullYear());
  return [y - 2, y - 1, y, y + 1];
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("userData") || "{}");
  } catch {
    return {};
  }
}

function getAuthHeaders(rolProp = "") {
  const u = getStoredUser();

  const usuario = u?.usuario || u?.user?.usuario || "";
  const rol = rolProp || u?.rol || u?.user?.rol || u?.rol_ref?.nombre || "";

  return {
    "X-User-Usuario": String(usuario || "").trim().toLowerCase(),
    "X-User-Rol": String(rol || "").trim().toUpperCase(),
  };
}

function monthIndex(year, month) {
  return Number(year) * 12 + Number(month);
}

function parseNavMonth(value, fallbackMonth) {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
    return Number(value.slice(5, 7));
  }

  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : fallbackMonth;
}

function parseNavYear(value, fallbackYear, monthLike = "") {
  if (typeof monthLike === "string" && /^\d{4}-\d{2}$/.test(monthLike)) {
    return Number(monthLike.slice(0, 4));
  }

  const n = Number(value);
  return Number.isFinite(n) && n >= 2000 ? n : fallbackYear;
}

function resolvePeriodParams(filters) {
  if (filters.modo === "mes") {
    return {
      modo: "mes",
      mes: String(filters.mes),
      anio: String(filters.anio),
    };
  }

  if (filters.modo === "rango_meses") {
    const startIdx = monthIndex(filters.anioDesde, filters.mesDesde);
    const endIdx = monthIndex(filters.anioHasta, filters.mesHasta);

    if (endIdx < startIdx) {
      throw new Error("El mes final no puede ser menor al mes inicial.");
    }

    return {
      modo: "rango_meses",
      mes_desde: String(filters.mesDesde),
      anio_desde: String(filters.anioDesde),
      mes_hasta: String(filters.mesHasta),
      anio_hasta: String(filters.anioHasta),
    };
  }

  if (filters.modo === "rango_fechas") {
    if (!filters.desde || !filters.hasta) {
      throw new Error("Debes seleccionar fecha inicial y fecha final.");
    }

    if (filters.hasta < filters.desde) {
      throw new Error("La fecha final no puede ser menor a la fecha inicial.");
    }

    return {
      modo: "rango_fechas",
      desde: filters.desde,
      hasta: filters.hasta,
    };
  }

  return {
    modo: "mes",
    mes: String(filters.mes),
    anio: String(filters.anio),
  };
}

function buildDashboardQuery(filters) {
  const qs = new URLSearchParams();
  const periodParams = resolvePeriodParams(filters);

  qs.set("modo", periodParams.modo);

  if (periodParams.modo === "mes") {
    qs.set("mes", periodParams.mes);
    qs.set("anio", periodParams.anio);
  } else if (periodParams.modo === "rango_meses") {
    qs.set("mes_desde", periodParams.mes_desde);
    qs.set("anio_desde", periodParams.anio_desde);
    qs.set("mes_hasta", periodParams.mes_hasta);
    qs.set("anio_hasta", periodParams.anio_hasta);
  } else {
    qs.set("desde", periodParams.desde);
    qs.set("hasta", periodParams.hasta);
  }

  if (filters.equipo) qs.set("equipo", filters.equipo);
  if (filters.cliente) qs.append("cliente", filters.cliente);
  if (filters.consultor) qs.append("consultor", filters.consultor);
  if (filters.modulo) qs.append("modulo", filters.modulo);
  if (filters.estadoOT) qs.append("estado_ot", filters.estadoOT);
  if (filters.servicio) qs.append("servicio", filters.servicio);
  if (filters.proyectoId) qs.set("proyecto_id", String(filters.proyectoId));

  (Array.isArray(filters.ocupacionIds) ? filters.ocupacionIds : [])
    .map((id) => Number(id))
    .filter(Boolean)
    .forEach((id) => qs.append("ocupacion_id", String(id)));

  return qs;
}

function toUniqueSorted(values) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((v) => normalizeText(v)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function getOpportunityChartValue(item) {
  const otc = Number(item?.otc || 0);
  const mrc = Number(item?.mrc || 0);
  return otc + mrc;
}

function formatPeriodoLabel(periodo) {
  const txt = normalizeText(periodo);
  if (!/^\d{4}-\d{2}$/.test(txt)) return txt || "-";

  const anio = txt.slice(0, 4);
  const mes = Number(txt.slice(5, 7));
  const month = MONTHS.find((m) => m.value === mes)?.label || txt;

  return `${month.slice(0, 3)} ${anio}`;
}

function aggregateOperationalByMonth(rows = []) {
  const map = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const detalle = Array.isArray(row?.detallePeriodos) ? row.detallePeriodos : [];

    detalle.forEach((item) => {
      const periodo = normalizeText(item?.periodo);
      if (!periodo) return;

      const current = map.get(periodo) || {
        periodo,
        costo: 0,
        horas: 0,
      };

      current.costo += Number(item?.costo || 0);
      current.horas += Number(item?.horas || 0);

      map.set(periodo, current);
    });
  });

  return Array.from(map.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}

function getLinkedMarginAnalysis(opRows = [], summaryRows = [], linkedClient = "") {
  const client = normalizeText(linkedClient);

  if (!client) {
    return {
      hasClient: false,
      client: "",
      ingreso: 0,
      costo: 0,
      margen: 0,
      margenPct: 0,
      oportunidadesCount: 0,
      resumenRowsCount: 0,
    };
  }

  const oppRows = (Array.isArray(opRows) ? opRows : []).filter((item) =>
    sameClient(item?.cliente, client)
  );

  const summary = (Array.isArray(summaryRows) ? summaryRows : []).filter((item) =>
    sameClient(item?.cliente, client)
  );

  const ingreso = oppRows.reduce((acc, item) => acc + getOpportunityChartValue(item), 0);
  const costo = summary.reduce((acc, item) => acc + Number(item?.costoTotal || 0), 0);
  const margen = ingreso - costo;
  const margenPct = ingreso > 0 ? (margen / ingreso) * 100 : 0;

  return {
    hasClient: true,
    client,
    ingreso,
    costo,
    margen,
    margenPct,
    oportunidadesCount: oppRows.length,
    resumenRowsCount: summary.length,
  };
}

function SimpleBarChart({ title, rows = [], subtitle = "" }) {
  const max = Math.max(...rows.map((r) => Number(r?.costo || 0)), 0);

  return (
    <section className="dc-chart-card">
      <div className="dc-section-head">
        <h3>{title}</h3>
        {!!subtitle && <span>{subtitle}</span>}
      </div>

      {!rows.length ? (
        <div className="dc-empty">Sin datos</div>
      ) : (
        <div className="dc-chart-list">
          {rows.map((item) => {
            const value = Number(item?.costo || 0);
            const width = max > 0 ? (value / max) * 100 : 0;

            return (
              <div className="dc-chart-row" key={`${title}-${item.name}`}>
                <div className="dc-chart-label" title={item.name}>
                  {item.name}
                </div>

                <div className="dc-chart-bar-wrap">
                  <div
                    className="dc-chart-bar"
                    style={{ width: `${Math.max(width, 4)}%` }}
                  />
                </div>

                <div className="dc-chart-value">{fmtMoney(value)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VerticalMonthlyBarChart({ title, rows = [], subtitle = "" }) {
  const max = Math.max(...rows.map((r) => Number(r?.costo || 0)), 0);

  return (
    <section className="dc-panel">
      <div className="dc-section-head">
        <h3>{title}</h3>
        {!!subtitle && <span>{subtitle}</span>}
      </div>

      {!rows.length ? (
        <div className="dc-empty">Sin datos por mes para el filtro actual.</div>
      ) : (
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${rows.length}, minmax(96px, 1fr))`,
              gap: 14,
              alignItems: "end",
              minWidth: Math.max(rows.length * 110, 320),
            }}
          >
            {rows.map((item) => {
              const value = Number(item?.costo || 0);
              const height = max > 0 ? Math.max((value / max) * 220, 12) : 12;

              return (
                <div
                  key={item.periodo}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div
                    title={`${formatPeriodoLabel(item.periodo)} · ${fmtMoney(value)}`}
                    style={{
                      height: 240,
                      width: "100%",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      padding: "0 8px",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 64,
                        height,
                        borderRadius: 12,
                        background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
                        boxShadow: "0 8px 18px rgba(37, 99, 235, 0.18)",
                      }}
                    />
                  </div>

                  <strong style={{ fontSize: 12, textAlign: "center" }}>
                    {formatPeriodoLabel(item.periodo)}
                  </strong>

                  <span
                    style={{
                      fontSize: 12,
                      textAlign: "center",
                      opacity: 0.85,
                      lineHeight: 1.2,
                    }}
                  >
                    {fmtMoney(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function aggregateWonByClient(rows = []) {
  const map = new Map();

  (Array.isArray(rows) ? rows : [])
    .filter(
      (item) =>
        normalizeUpper(item?.estado_oferta) === "GANADA" &&
        getOpportunityChartValue(item) > 0
    )
    .forEach((item) => {
      const cliente = normalizeText(item?.cliente || "SIN CLIENTE");
      const current = map.get(cliente) || {
        name: cliente,
        costo: 0,
        oportunidades: 0,
      };

      current.costo += getOpportunityChartValue(item);
      current.oportunidades += 1;

      map.set(cliente, current);
    });

  return Array.from(map.values())
    .sort((a, b) => Number(b.costo || 0) - Number(a.costo || 0))
    .map((item) => ({
      ...item,
      name: `${item.name} · ${fmtInt(item.oportunidades)} oportunidad(es)`,
    }));
}

function aggregateWonByResult(rows = []) {
  const map = new Map();

  (Array.isArray(rows) ? rows : [])
    .filter(
      (item) =>
        normalizeUpper(item?.estado_oferta) === "GANADA" &&
        getOpportunityChartValue(item) > 0
    )
    .forEach((item) => {
      const resultado = normalizeText(item?.resultado_oferta || "SIN RESULTADO");
      const current = map.get(resultado) || {
        name: resultado,
        costo: 0,
        oportunidades: 0,
      };

      current.costo += getOpportunityChartValue(item);
      current.oportunidades += 1;

      map.set(resultado, current);
    });

  return Array.from(map.values())
    .sort((a, b) => Number(b.costo || 0) - Number(a.costo || 0))
    .map((item) => ({
      ...item,
      name: `${item.name} · ${fmtInt(item.oportunidades)} oportunidad(es)`,
    }));
}

function OportunidadesGanadasPorClienteChart({ rows = [] }) {
  const chartRows = useMemo(() => aggregateWonByClient(rows), [rows]);

  return (
    <SimpleBarChart
      title="Oportunidades ganadas por cliente"
      subtitle={`${chartRows.length} clientes`}
      rows={chartRows}
    />
  );
}

function OportunidadesGanadasPorResultadoChart({ rows = [] }) {
  const chartRows = useMemo(() => aggregateWonByResult(rows), [rows]);

  return (
    <SimpleBarChart
      title="Oportunidades ganadas por resultado"
      subtitle={`${chartRows.length} resultados`}
      rows={chartRows}
    />
  );
}

function ResumenFilaModal({ row, onClose }) {
  if (!row) return null;

  const detalleConsultores = Array.isArray(row.detalleConsultores)
    ? row.detalleConsultores
    : [];

  return (
    <div className="dc-modal-backdrop" onClick={onClose}>
      <div className="dc-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="dc-modal-head">
          <div>
            <div className="dc-kicker">Resumen de la línea</div>
            <h3>{row.cliente}</h3>
            <p>
              {row.ocupacion} · {row.equipo || "SIN EQUIPO"}
            </p>
          </div>

          <button type="button" className="dc-btn dc-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="dc-detail-cards">
          <article className="dc-mini-card">
            <span>Horas</span>
            <strong>{fmtHours(row.horas)}</strong>
          </article>

          <article className="dc-mini-card">
            <span>Costo total</span>
            <strong>{fmtMoney(row.costoTotal)}</strong>
          </article>

          <article className="dc-mini-card">
            <span>Valor hora promedio</span>
            <strong>{fmtMoney(row.valorHoraPromedio)}</strong>
          </article>

          <article className="dc-mini-card">
            <span>Consultores</span>
            <strong>{fmtInt(row.consultoresCount)}</strong>
          </article>

          <article className="dc-mini-card">
            <span>Registros</span>
            <strong>{fmtInt(row.registrosCount)}</strong>
          </article>
        </div>

        <div className="dc-detail-grid">
          <div className="dc-subpanel">
            <h4>Consultores involucrados</h4>

            {detalleConsultores.length ? (
              <div className="dc-table-wrap">
                <table className="dc-table dc-table-small">
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      <th className="num">Horas</th>
                      <th className="num">Costo</th>
                      <th className="num">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleConsultores.map((item, idx) => (
                      <tr key={`${item.consultor}-${idx}`}>
                        <td>{item.consultor}</td>
                        <td className="num">{fmtHours(item.horas)}</td>
                        <td className="num">{fmtMoney(item.costo)}</td>
                        <td className="num">{fmtInt(item.registrosCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : Array.isArray(row.consultores) && row.consultores.length ? (
              <div className="dc-chip-list">
                {row.consultores.map((name) => (
                  <span key={name} className="dc-chip">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="dc-empty">Sin consultores.</div>
            )}
          </div>

          <div className="dc-subpanel">
            <h4>Detalle por período</h4>

            {!row.detallePeriodos?.length ? (
              <div className="dc-empty">Sin períodos.</div>
            ) : (
              <div className="dc-table-wrap">
                <table className="dc-table dc-table-small">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th className="num">Horas</th>
                      <th className="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.detallePeriodos.map((p) => (
                      <tr key={p.periodo}>
                        <td>{p.periodo}</td>
                        <td className="num">{fmtHours(p.horas)}</td>
                        <td className="num">{fmtMoney(p.costo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardCostos() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state || {};
  const summarySectionRef = useRef(null);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const rol = String(
    navState?.rol ||
      getStoredUser()?.rol ||
      getStoredUser()?.user?.rol ||
      getStoredUser()?.rol_ref?.nombre ||
      ""
  ).toUpperCase();

  const navMes = parseNavMonth(navState?.filtroMes, currentMonth);
  const navAnio = parseNavYear(navState?.filtroAnio, currentYear, navState?.filtroMes);

  const initialDraft = {
    modo: navState?.modoDashboard || "mes",
    equipo: Array.isArray(navState?.filtroEquipo)
      ? normalizeUpper(navState.filtroEquipo[0] || "")
      : normalizeUpper(navState?.filtroEquipo || ""),
    cliente: Array.isArray(navState?.filtroCliente)
      ? normalizeText(navState.filtroCliente[0] || "")
      : normalizeText(navState?.filtroCliente || ""),
    consultor: Array.isArray(navState?.filtroConsultor)
      ? normalizeText(navState.filtroConsultor[0] || "")
      : normalizeText(navState?.filtroConsultor || ""),
    modulo: Array.isArray(navState?.filtroModulo)
      ? normalizeUpper(navState.filtroModulo[0] || "")
      : normalizeUpper(navState?.filtroModulo || ""),
    estadoOT: Array.isArray(navState?.filtroEstadoOT)
      ? normalizeText(navState.filtroEstadoOT[0] || "")
      : normalizeText(navState?.filtroEstadoOT || ""),
    servicio: Array.isArray(navState?.filtroServicio)
      ? normalizeText(navState.filtroServicio[0] || "")
      : normalizeText(navState?.filtroServicio || ""),
    proyectoId: navState?.filtroProyectoId ? Number(navState.filtroProyectoId) : "",
    mes: navMes,
    anio: navAnio,
    mesDesde: navMes,
    anioDesde: navAnio,
    mesHasta: navMes,
    anioHasta: navAnio,
    ocupacionIds: Array.isArray(navState?.filtroOcupacionIds)
      ? navState.filtroOcupacionIds
      : [],
    ocupacionLabels: Array.isArray(navState?.filtroOcupacionLabels)
      ? navState.filtroOcupacionLabels
      : [],
    desde: navState?.filtroDesde || "",
    hasta: navState?.filtroHasta || "",
  };

  const [draft, setDraft] = useState(initialDraft);
  const [filters, setFilters] = useState(initialDraft);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalCosto: 0,
    totalHoras: 0,
    totalClientes: 0,
    totalOcupaciones: 0,
    totalConsultores: 0,
  });

  const [graficos, setGraficos] = useState({
    porCliente: [],
    porOcupacion: [],
  });

  const [oportunidadesGanadas, setOportunidadesGanadas] = useState({
    rows: [],
  });

  const [proyectosOptions, setProyectosOptions] = useState([]);
  const [ocupacionesOptions, setOcupacionesOptions] = useState([]);
  const [clientesOptions, setClientesOptions] = useState([]);
  const [consultoresOptions, setConsultoresOptions] = useState([]);
  const [modulosOptions, setModulosOptions] = useState([]);
  const [equiposOptions, setEquiposOptions] = useState([]);
  const [estadosOTOptions, setEstadosOTOptions] = useState([]);
  const [serviciosOptions, setServiciosOptions] = useState([]);

  const [modalRow, setModalRow] = useState(null);
  const [linkedClient, setLinkedClient] = useState("");
  const [showOnlyLinkedSummary, setShowOnlyLinkedSummary] = useState(false);

  const yearOptions = useMemo(() => buildYearOptions(draft.anio), [draft.anio]);
  const yearOptionsFrom = useMemo(() => buildYearOptions(draft.anioDesde), [draft.anioDesde]);
  const yearOptionsTo = useMemo(() => buildYearOptions(draft.anioHasta), [draft.anioHasta]);

  useEffect(() => {
    const fetchCatalogos = async () => {
      const headers = getAuthHeaders(rol);
      const qs = buildDashboardQuery(filters);

      const reqs = await Promise.allSettled([
        jfetch("/proyectos?include_fases=0", { headers }),
        jfetch("/ocupaciones", { headers }),
        jfetch(`/dashboard/costos-filtros?${qs.toString()}`, { headers }),
        jfetch("/clientes", { headers }),
        jfetch("/consultores", { headers }),
        jfetch("/modulos", { headers }),
        jfetch("/equipos", { headers }),
        jfetch("/oportunidades/filters", { headers }),
      ]);

      const readJson = async (result) => {
        if (result.status !== "fulfilled") return null;
        try {
          const res = result.value;
          const json = await res.json().catch(() => null);
          if (!res.ok) return null;
          return json;
        } catch {
          return null;
        }
      };

      const [
        proyectosJson,
        ocupacionesJson,
        dashboardFiltrosJson,
        clientesJson,
        consultoresJson,
        modulosJson,
        equiposJson,
        oportunidadesFiltersJson,
      ] = await Promise.all(reqs.map(readJson));

      const proyectos = (Array.isArray(proyectosJson) ? proyectosJson : []).map((p) => ({
        value: Number(p.id),
        label: `${p.codigo || "SIN CÓDIGO"} - ${p.nombre || "SIN NOMBRE"}`,
      }));

      const ocupaciones = (Array.isArray(ocupacionesJson) ? ocupacionesJson : [])
        .map((o) => ({
          value: Number(o.id),
          label: [normalizeText(o?.codigo), normalizeText(o?.nombre)]
            .filter(Boolean)
            .join(" - "),
        }))
        .filter((o) => Number.isFinite(o.value) && o.value > 0 && o.label);

      const clientes = toUniqueSorted(
        dashboardFiltrosJson?.clientes?.length
          ? dashboardFiltrosJson.clientes
          : (Array.isArray(clientesJson) ? clientesJson : []).map((c) => c?.nombre_cliente)
      );

      const consultores = toUniqueSorted(
        dashboardFiltrosJson?.consultores?.length
          ? dashboardFiltrosJson.consultores
          : (Array.isArray(consultoresJson) ? consultoresJson : []).map((c) => c?.nombre)
      );

      const modulos = toUniqueSorted(
        dashboardFiltrosJson?.modulos?.length
          ? (dashboardFiltrosJson.modulos || []).map(normalizeUpper)
          : (Array.isArray(modulosJson) ? modulosJson : []).map((m) => m?.nombre).map(normalizeUpper)
      );

      const equipos = toUniqueSorted(
        dashboardFiltrosJson?.equipos?.length
          ? (dashboardFiltrosJson.equipos || []).map(normalizeUpper)
          : (Array.isArray(equiposJson) ? equiposJson : []).map((e) => e?.nombre).map(normalizeUpper)
      );

      const estadosOT = toUniqueSorted(
        dashboardFiltrosJson?.estados_ot?.length
          ? dashboardFiltrosJson.estados_ot
          : oportunidadesFiltersJson?.estado_ot || []
      );

      const servicios = toUniqueSorted(
        dashboardFiltrosJson?.servicios?.length
          ? dashboardFiltrosJson.servicios
          : oportunidadesFiltersJson?.servicio || []
      );

      setProyectosOptions(proyectos);
      setOcupacionesOptions(ocupaciones);
      setClientesOptions(clientes);
      setConsultoresOptions(consultores);
      setModulosOptions(modulos);
      setEquiposOptions(equipos);
      setEstadosOTOptions(estadosOT);
      setServiciosOptions(servicios);

      setDraft((prev) => ({
        ...prev,
        cliente: prev.cliente && !clientes.includes(prev.cliente) ? "" : prev.cliente,
        consultor: prev.consultor && !consultores.includes(prev.consultor) ? "" : prev.consultor,
        modulo: prev.modulo && !modulos.includes(prev.modulo) ? "" : prev.modulo,
        equipo: prev.equipo && !equipos.includes(prev.equipo) ? "" : prev.equipo,
        estadoOT: prev.estadoOT && !estadosOT.includes(prev.estadoOT) ? "" : prev.estadoOT,
        servicio: prev.servicio && !servicios.includes(prev.servicio) ? "" : prev.servicio,
      }));
    };

    fetchCatalogos();
  }, [filters, rol]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        setModalRow(null);

        const qs = buildDashboardQuery(filters);

        const res = await jfetch(`/dashboard/costos-resumen?${qs.toString()}`, {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const rowsData = Array.isArray(json?.rows) ? json.rows : [];

        setRows(rowsData);

        setSummary({
          totalCosto: Number(json?.totalCosto || 0),
          totalHoras: Number(json?.totalHoras || 0),
          totalClientes: Number(json?.totalClientes || 0),
          totalOcupaciones: Number(json?.totalOcupaciones || 0),
          totalConsultores: Number(json?.totalConsultores || 0),
        });

        setGraficos({
          porCliente: Array.isArray(json?.graficos?.porCliente)
            ? json.graficos.porCliente.slice(0, 10)
            : [],
          porOcupacion: Array.isArray(json?.graficos?.porOcupacion)
            ? json.graficos.porOcupacion.slice(0, 10)
            : [],
        });

        const oportunidadRows = (
          Array.isArray(json?.oportunidadesGanadas?.rows)
            ? json.oportunidadesGanadas.rows
            : []
        )
          .filter(
            (item) =>
              normalizeUpper(item?.estado_oferta) === "GANADA" &&
              getOpportunityChartValue(item) > 0
          )
          .sort(
            (a, b) =>
              getOpportunityChartValue(b) - getOpportunityChartValue(a)
          );

        setOportunidadesGanadas({
          rows: oportunidadRows,
        });
      } catch (e) {
        setRows([]);
        setSummary({
          totalCosto: 0,
          totalHoras: 0,
          totalClientes: 0,
          totalOcupaciones: 0,
          totalConsultores: 0,
        });
        setGraficos({
          porCliente: [],
          porOcupacion: [],
        });
        setOportunidadesGanadas({
          rows: [],
        });
        setError(e?.message || "No se pudo cargar el dashboard de costos");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, rol]);

  useEffect(() => {
    if (!linkedClient) return;

    const existsInOpp = (oportunidadesGanadas.rows || []).some((item) =>
      sameClient(item?.cliente, linkedClient)
    );

    const existsInSummary = (rows || []).some((item) =>
      sameClient(item?.cliente, linkedClient)
    );

    if (!existsInOpp && !existsInSummary) {
      setLinkedClient("");
      setShowOnlyLinkedSummary(false);
    }
  }, [linkedClient, oportunidadesGanadas.rows, rows]);

  const displayedSummaryRows = useMemo(() => {
    if (!showOnlyLinkedSummary || !linkedClient) return rows;
    return rows.filter((item) => sameClient(item?.cliente, linkedClient));
  }, [rows, linkedClient, showOnlyLinkedSummary]);

  const linkedAnalysis = useMemo(() => {
    return getLinkedMarginAnalysis(
      oportunidadesGanadas.rows,
      rows,
      linkedClient
    );
  }, [oportunidadesGanadas.rows, rows, linkedClient]);

  const monthlyRows = useMemo(() => {
    return aggregateOperationalByMonth(displayedSummaryRows);
  }, [displayedSummaryRows]);

  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleOcupacionesChange = (e) => {
    const selected = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
    const labels = ocupacionesOptions
      .filter((o) => selected.includes(Number(o.value)))
      .map((o) => o.label);

    setDraft((prev) => ({
      ...prev,
      ocupacionIds: selected,
      ocupacionLabels: labels,
    }));
  };

  const applyFilters = () => {
    setFilters({ ...draft });
  };

  const clearFilters = () => {
    const reset = {
      ...initialDraft,
      cliente: "",
      consultor: "",
      modulo: "",
      equipo: "",
      estadoOT: "",
      servicio: "",
      proyectoId: "",
      ocupacionIds: [],
      ocupacionLabels: [],
      desde: "",
      hasta: "",
      modo: "mes",
      mesDesde: currentMonth,
      anioDesde: currentYear,
      mesHasta: currentMonth,
      anioHasta: currentYear,
      mes: currentMonth,
      anio: currentYear,
    };

    setDraft(reset);
    setFilters(reset);
    setModalRow(null);
    setLinkedClient("");
    setShowOnlyLinkedSummary(false);
  };

  const handleLinkClient = (client) => {
    const clientName = normalizeText(client);
    if (!clientName) return;

    setLinkedClient(clientName);
    setShowOnlyLinkedSummary(true);

    window.requestAnimationFrame(() => {
      summarySectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const clearLinkedAnalysis = () => {
    setLinkedClient("");
    setShowOnlyLinkedSummary(false);
  };

  const monthlyChartTitle =
    linkedClient && showOnlyLinkedSummary
      ? `Costo total registrado por mes · ${linkedClient}`
      : "Costo total registrado por mes";

  const monthlyChartSubtitle = linkedClient && showOnlyLinkedSummary
    ? "Vista mensual del cliente vinculado"
    : "Se recalcula con el período y filtros activos";

  return (
    <div className="dc-shell">
      <div className="dc-topbar">
        <div>
          <div className="dc-kicker">Vista financiera operativa</div>
          <h1>Dashboard de costos</h1>
          <p>
            Resumen de costo total por cliente, ocupación y equipo, calculado con valor hora real
            del consultor según período y filtros aplicados.
          </p>

          {!!draft.ocupacionLabels.length && (
            <div className="dc-tag">
              Ocupación activa: {draft.ocupacionLabels.join(", ")}
            </div>
          )}

          {!!linkedClient && (
            <div className="dc-tag" style={{ marginTop: 8 }}>
              Cliente vinculado: {linkedClient}
            </div>
          )}
        </div>

        <div className="dc-top-actions">
          <button className="dc-btn dc-btn-ghost" type="button" onClick={() => navigate(-1)}>
            Volver
          </button>

          <button className="dc-btn dc-btn-primary" type="button" onClick={applyFilters}>
            Actualizar dashboard
          </button>
        </div>
      </div>

      <div className="dc-layout">
        <main className="dc-main">
          <section className="dc-cards">
            <article className="dc-card">
              <span className="label">Costo total</span>
              <strong>{fmtMoney(summary.totalCosto)}</strong>
            </article>

            <article className="dc-card">
              <span className="label">Horas totales</span>
              <strong>{fmtHours(summary.totalHoras)}</strong>
            </article>

            <article className="dc-card">
              <span className="label">Clientes impactados</span>
              <strong>{fmtInt(summary.totalClientes)}</strong>
            </article>

            <article className="dc-card">
              <span className="label">Ocupaciones impactadas</span>
              <strong>{fmtInt(summary.totalOcupaciones)}</strong>
            </article>

            <article className="dc-card">
              <span className="label">Consultores impactados</span>
              <strong>{fmtInt(summary.totalConsultores)}</strong>
            </article>
          </section>

          <section className="dc-charts-grid">
            <SimpleBarChart title="Top valor por cliente" rows={graficos.porCliente} />
            <SimpleBarChart title="Top costo por ocupación" rows={graficos.porOcupacion} />
          </section>

          <VerticalMonthlyBarChart
            title={monthlyChartTitle}
            subtitle={monthlyChartSubtitle}
            rows={monthlyRows}
          />

          <section className="dc-charts-grid">
            <OportunidadesGanadasPorClienteChart rows={oportunidadesGanadas.rows} />
            <OportunidadesGanadasPorResultadoChart rows={oportunidadesGanadas.rows} />
          </section>

          {linkedAnalysis.hasClient && (
            <section className="dc-panel">
              <div className="dc-section-head">
                <h3>Análisis vinculado de margen</h3>
                <span>{linkedAnalysis.client}</span>
              </div>

              <div className="dc-detail-cards">
                <article className="dc-mini-card">
                  <span>Ingreso</span>
                  <strong>{fmtMoney(linkedAnalysis.ingreso)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Costo</span>
                  <strong>{fmtMoney(linkedAnalysis.costo)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Margen</span>
                  <strong>{fmtMoney(linkedAnalysis.margen)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>% margen</span>
                  <strong>{fmtPercent(linkedAnalysis.margenPct)}</strong>
                </article>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                <span className="dc-tag">
                  {fmtInt(linkedAnalysis.oportunidadesCount)} oportunidad(es) vinculada(s)
                </span>

                <span className="dc-tag">
                  {fmtInt(linkedAnalysis.resumenRowsCount)} fila(s) en resumen
                </span>

                <button
                  type="button"
                  className="dc-btn dc-btn-primary"
                  onClick={() => setShowOnlyLinkedSummary((prev) => !prev)}
                >
                  {showOnlyLinkedSummary
                    ? "Mostrar todo el resumen"
                    : "Mostrar solo filas vinculadas"}
                </button>

                <button
                  type="button"
                  className="dc-btn dc-btn-ghost"
                  onClick={clearLinkedAnalysis}
                >
                  Quitar vínculo
                </button>
              </div>

              <p style={{ marginTop: 14, opacity: 0.8 }}>
                Ingreso = suma de OTC + MRC del cliente en oportunidades ganadas filtradas.
                Costo = suma de costo total del resumen por cliente, ocupación y equipo.
                Margen = Ingreso - Costo.
              </p>
            </section>
          )}

          <section className="dc-panel">
            <div className="dc-section-head">
              <h3>Detalle de oportunidades ganadas</h3>
              <span>{oportunidadesGanadas.rows.length} filas</span>
            </div>

            {!oportunidadesGanadas.rows.length ? (
              <div className="dc-empty">Sin oportunidades ganadas para los filtros actuales.</div>
            ) : (
              <div className="dc-table-wrap">
                <table className="dc-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Servicio</th>
                      <th>PRC</th>
                      <th>Fecha creación</th>
                      <th>Estado oferta</th>
                      <th>Resultado</th>
                      <th>Estado OT</th>
                      <th className="num">OTC</th>
                      <th className="num">MRC</th>
                      <th className="num">MRC Normalizado</th>
                      <th className="num">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oportunidadesGanadas.rows.map((op) => {
                      const isLinked = linkedClient && sameClient(op.cliente, linkedClient);

                      return (
                        <tr
                          key={`opp-${op.id}`}
                          style={
                            isLinked
                              ? {
                                  outline: "2px solid rgba(37, 99, 235, 0.35)",
                                  background: "rgba(37, 99, 235, 0.05)",
                                }
                              : undefined
                          }
                        >
                          <td>{op.cliente}</td>
                          <td>{op.servicio}</td>
                          <td>{op.codigo_prc}</td>
                          <td>{op.fecha_creacion || "-"}</td>
                          <td>{op.estado_oferta || "-"}</td>
                          <td>{op.resultado_oferta || "-"}</td>
                          <td>{op.estado_ot || "-"}</td>
                          <td className="num">{fmtMoney(op.otc)}</td>
                          <td className="num">{fmtMoney(op.mrc)}</td>
                          <td className="num">{fmtMoney(op.mrcNormalizado)}</td>
                          <td className="num">
                            <button
                              type="button"
                              className={isLinked ? "dc-btn dc-btn-primary" : "dc-btn dc-btn-ghost"}
                              onClick={() => handleLinkClient(op.cliente)}
                            >
                              {isLinked ? "Vinculado" : "Vincular"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dc-panel" ref={summarySectionRef}>
            <div className="dc-section-head">
              <h3>Resumen por cliente, ocupación y equipo</h3>
              <span>{displayedSummaryRows.length} filas</span>
            </div>

            {loading && <div className="dc-empty">Cargando información…</div>}
            {!loading && error && <div className="dc-empty dc-empty-error">{error}</div>}
            {!loading && !error && !displayedSummaryRows.length && (
              <div className="dc-empty">No hay información para los filtros seleccionados.</div>
            )}

            {!loading && !error && !!displayedSummaryRows.length && (
              <div className="dc-table-wrap">
                <table className="dc-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Ocupación</th>
                      <th>Equipo</th>
                      <th className="num">Horas</th>
                      <th className="num">Costo total</th>
                      <th className="num">Valor hora prom.</th>
                      <th className="num">Consultores</th>
                      <th className="num">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSummaryRows.map((item, idx) => {
                      const rowKey = `${item.cliente}||${item.ocupacion}||${item.equipo || "SIN EQUIPO"}||${idx}`;
                      const isLinked = linkedClient && sameClient(item.cliente, linkedClient);

                      return (
                        <tr
                          key={rowKey}
                          className="dc-row-clickable"
                          onClick={() => setModalRow(item)}
                          style={
                            isLinked
                              ? {
                                  outline: "2px solid rgba(37, 99, 235, 0.35)",
                                  background: "rgba(37, 99, 235, 0.05)",
                                }
                              : undefined
                          }
                        >
                          <td>{item.cliente}</td>
                          <td>{item.ocupacion}</td>
                          <td>{item.equipo || "—"}</td>
                          <td className="num">{fmtHours(item.horas)}</td>
                          <td className="num">{fmtMoney(item.costoTotal)}</td>
                          <td className="num">{fmtMoney(item.valorHoraPromedio)}</td>
                          <td className="num">{fmtInt(item.consultoresCount)}</td>
                          <td className="num">{fmtInt(item.registrosCount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside className="dc-sidebar">
          <section className="dc-panel">
            <div className="dc-section-head">
              <h3>Filtros</h3>
            </div>

            <div className="dc-filters-grid">
              <div className="dc-filter-field">
                <label>Modo de período</label>
                <select
                  value={draft.modo}
                  onChange={(e) => handleDraftChange("modo", e.target.value)}
                >
                  <option value="mes">Mes</option>
                  <option value="rango_meses">Rango de meses</option>
                  <option value="rango_fechas">Rango de fechas</option>
                </select>
              </div>

              {draft.modo === "mes" && (
                <>
                  <div className="dc-filter-field">
                    <label>Mes</label>
                    <select
                      value={draft.mes}
                      onChange={(e) => handleDraftChange("mes", Number(e.target.value))}
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-filter-field">
                    <label>Año</label>
                    <select
                      value={draft.anio}
                      onChange={(e) => handleDraftChange("anio", Number(e.target.value))}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {draft.modo === "rango_meses" && (
                <>
                  <div className="dc-filter-field">
                    <label>Mes desde</label>
                    <select
                      value={draft.mesDesde}
                      onChange={(e) => handleDraftChange("mesDesde", Number(e.target.value))}
                    >
                      {MONTHS.map((m) => (
                        <option key={`d-${m.value}`} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-filter-field">
                    <label>Año desde</label>
                    <select
                      value={draft.anioDesde}
                      onChange={(e) => handleDraftChange("anioDesde", Number(e.target.value))}
                    >
                      {yearOptionsFrom.map((y) => (
                        <option key={`yd-${y}`} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-filter-field">
                    <label>Mes hasta</label>
                    <select
                      value={draft.mesHasta}
                      onChange={(e) => handleDraftChange("mesHasta", Number(e.target.value))}
                    >
                      {MONTHS.map((m) => (
                        <option key={`h-${m.value}`} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-filter-field">
                    <label>Año hasta</label>
                    <select
                      value={draft.anioHasta}
                      onChange={(e) => handleDraftChange("anioHasta", Number(e.target.value))}
                    >
                      {yearOptionsTo.map((y) => (
                        <option key={`yh-${y}`} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {draft.modo === "rango_fechas" && (
                <>
                  <div className="dc-filter-field">
                    <label>Fecha desde</label>
                    <input
                      type="date"
                      value={draft.desde}
                      onChange={(e) => handleDraftChange("desde", e.target.value)}
                    />
                  </div>

                  <div className="dc-filter-field">
                    <label>Fecha hasta</label>
                    <input
                      type="date"
                      value={draft.hasta}
                      onChange={(e) => handleDraftChange("hasta", e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="dc-filter-section-title">Resumen operativo</div>

              <div className="dc-filter-field">
                <label>Equipo</label>
                <select
                  value={draft.equipo}
                  onChange={(e) => handleDraftChange("equipo", normalizeUpper(e.target.value))}
                >
                  <option value="">Todos</option>
                  {equiposOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field">
                <label>Cliente</label>
                <select
                  value={draft.cliente}
                  onChange={(e) => handleDraftChange("cliente", e.target.value)}
                >
                  <option value="">Todos</option>
                  {clientesOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field">
                <label>Consultor</label>
                <select
                  value={draft.consultor}
                  onChange={(e) => handleDraftChange("consultor", e.target.value)}
                >
                  <option value="">Todos</option>
                  {consultoresOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field">
                <label>Módulo</label>
                <select
                  value={draft.modulo}
                  onChange={(e) => handleDraftChange("modulo", normalizeUpper(e.target.value))}
                >
                  <option value="">Todos</option>
                  {modulosOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field dc-filter-field--span-2">
                <label>Proyecto</label>
                <select
                  value={draft.proyectoId}
                  onChange={(e) =>
                    handleDraftChange(
                      "proyectoId",
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                >
                  <option value="">Todos</option>
                  {proyectosOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field dc-filter-field--span-2">
                <label>Ocupación</label>
                <select
                  multiple
                  value={(draft.ocupacionIds || []).map(String)}
                  onChange={handleOcupacionesChange}
                >
                  {ocupacionesOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-section-title">Oportunidades ganadas</div>

              <div className="dc-filter-field">
                <label>Estado OT</label>
                <select
                  value={draft.estadoOT}
                  onChange={(e) => handleDraftChange("estadoOT", e.target.value)}
                >
                  <option value="">Todos</option>
                  {estadosOTOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-field">
                <label>Servicio</label>
                <select
                  value={draft.servicio}
                  onChange={(e) => handleDraftChange("servicio", e.target.value)}
                >
                  <option value="">Todos</option>
                  {serviciosOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-filter-actions">
                <button className="dc-btn dc-btn-primary" type="button" onClick={applyFilters}>
                  Aplicar filtros
                </button>

                <button className="dc-btn dc-btn-ghost" type="button" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <ResumenFilaModal row={modalRow} onClose={() => setModalRow(null)} />
    </div>
  );
}
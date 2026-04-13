import React, { useEffect, useMemo, useState } from "react";
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

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeUpper(v) {
  return normalizeText(v).toUpperCase();
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
  const usuario =
    u?.usuario ||
    u?.user?.usuario ||
    "";

  const rol =
    rolProp ||
    u?.rol ||
    u?.user?.rol ||
    u?.rol_ref?.nombre ||
    "";

  return {
    "X-User-Usuario": String(usuario || "").trim().toLowerCase(),
    "X-User-Rol": String(rol || "").trim().toUpperCase(),
  };
}

function pad2(n) {
  return String(Number(n || 0)).padStart(2, "0");
}

function buildMonthStartISO(year, month) {
  return `${year}-${pad2(month)}-01`;
}

function buildMonthEndISO(year, month) {
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return `${year}-${pad2(month)}-${pad2(lastDay)}`;
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

function SimpleBarChart({ title, rows = [] }) {
  const max = Math.max(...rows.map((r) => Number(r?.costo || 0)), 0);

  return (
    <section className="dc-chart-card">
      <div className="dc-section-head">
        <h3>{title}</h3>
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

function OportunidadesGanadasChart({ rows = [] }) {
  const max = Math.max(...rows.map((r) => Number(r?.mrcNormalizado || 0)), 0);

  return (
    <section className="dc-panel">
      <div className="dc-section-head">
        <h3>Oportunidades ganadas por PRC</h3>
        <span>{rows.length} PRC</span>
      </div>

      {!rows.length ? (
        <div className="dc-empty">Sin oportunidades ganadas para los filtros aplicados.</div>
      ) : (
        <>
          <div className="dc-chart-list">
            {rows.map((item) => {
              const value = Number(item?.mrcNormalizado || 0);
              const width = max > 0 ? (value / max) * 100 : 0;

              return (
                <div className="dc-chart-row" key={item.name}>
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

          <div className="dc-table-wrap" style={{ marginTop: 16 }}>
            <table className="dc-table dc-table-small">
              <thead>
                <tr>
                  <th>PRC</th>
                  <th className="num">Cant.</th>
                  <th className="num">OTC</th>
                  <th className="num">MRC</th>
                  <th className="num">MRC Normalizado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`prc-${item.name}`}>
                    <td>{item.name}</td>
                    <td className="num">{item.count || 0}</td>
                    <td className="num">{fmtMoney(item.otc)}</td>
                    <td className="num">{fmtMoney(item.mrc)}</td>
                    <td className="num">{fmtMoney(item.mrcNormalizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
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
      ? navState.filtroCliente[0] || ""
      : normalizeText(navState?.filtroCliente || ""),
    consultor: Array.isArray(navState?.filtroConsultor)
      ? navState.filtroConsultor[0] || ""
      : normalizeText(navState?.filtroConsultor || ""),
    modulo: Array.isArray(navState?.filtroModulo)
      ? normalizeUpper(navState.filtroModulo[0] || "")
      : normalizeUpper(navState?.filtroModulo || ""),
    proyectoId: navState?.filtroProyectoId ? Number(navState.filtroProyectoId) : "",
    mes: navMes,
    anio: navAnio,
    mesDesde: navMes,
    anioDesde: navAnio,
    mesHasta: navMes,
    anioHasta: navAnio,
    ocupacionIds: Array.isArray(navState?.filtroOcupacionIds) ? navState.filtroOcupacionIds : [],
    ocupacionLabels: Array.isArray(navState?.filtroOcupacionLabels) ? navState.filtroOcupacionLabels : [],
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
    chart: [],
  });

  const [proyectosOptions, setProyectosOptions] = useState([]);
  const [ocupacionesOptions, setOcupacionesOptions] = useState([]);
  const [modalRow, setModalRow] = useState(null);

  const yearOptions = useMemo(() => buildYearOptions(draft.anio), [draft.anio]);
  const yearOptionsFrom = useMemo(() => buildYearOptions(draft.anioDesde), [draft.anioDesde]);
  const yearOptionsTo = useMemo(() => buildYearOptions(draft.anioHasta), [draft.anioHasta]);

  useEffect(() => {
    const fetchProyectos = async () => {
      try {
        const res = await jfetch("/proyectos?include_fases=0", {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error();

        const opts = (Array.isArray(json) ? json : []).map((p) => ({
          value: Number(p.id),
          label: `${p.codigo || "SIN CODIGO"} - ${p.nombre || "SIN NOMBRE"}`,
        }));

        setProyectosOptions(opts);
      } catch {
        setProyectosOptions([]);
      }
    };

    const fetchOcupaciones = async () => {
      try {
        const res = await jfetch("/ocupaciones", {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error();

        const opts = (Array.isArray(json) ? json : [])
          .map((o) => ({
            value: Number(o.id),
            label: [String(o?.codigo || "").trim(), String(o?.nombre || "").trim()]
              .filter(Boolean)
              .join(" - "),
          }))
          .filter((o) => Number.isFinite(o.value) && o.value > 0 && o.label);

        setOcupacionesOptions(opts);
      } catch {
        setOcupacionesOptions([]);
      }
    };

    fetchProyectos();
    fetchOcupaciones();
  }, [rol]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

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
        if (filters.proyectoId) qs.set("proyecto_id", String(filters.proyectoId));

        (Array.isArray(filters.ocupacionIds) ? filters.ocupacionIds : [])
          .map((id) => Number(id))
          .filter(Boolean)
          .forEach((id) => qs.append("ocupacion_id", String(id)));

        const res = await jfetch(`/dashboard/costos-resumen?${qs.toString()}`, {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        setRows(Array.isArray(json?.rows) ? json.rows : []);
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

        setOportunidadesGanadas({
          rows: Array.isArray(json?.oportunidadesGanadas?.rows) ? json.oportunidadesGanadas.rows : [],
          chart: Array.isArray(json?.oportunidadesGanadas?.chart) ? json.oportunidadesGanadas.chart : [],
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
          chart: [],
        });
        setError(e?.message || "No se pudo cargar el dashboard de costos");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, rol]);

  const applyFilters = () => {
    setFilters({ ...draft });
  };

  const clearFilters = () => {
    const reset = {
      ...initialDraft,
      cliente: "",
      consultor: "",
      modulo: "",
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
    };

    setDraft(reset);
    setFilters(reset);
  };

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
            <SimpleBarChart title="Top costo por cliente" rows={graficos.porCliente} />
            <SimpleBarChart title="Top costo por ocupación" rows={graficos.porOcupacion} />
          </section>

          <OportunidadesGanadasChart rows={oportunidadesGanadas.chart} />

          <section className="dc-panel">
            <div className="dc-section-head">
              <h3>Resumen por cliente, ocupación y equipo</h3>
              <span>{rows.length} filas</span>
            </div>

            {loading && <div className="dc-empty">Cargando información…</div>}
            {!loading && error && <div className="dc-empty dc-empty-error">{error}</div>}
            {!loading && !error && !rows.length && (
              <div className="dc-empty">No hay información para los filtros seleccionados.</div>
            )}

            {!loading && !error && !!rows.length && (
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
                    {rows.map((item, idx) => {
                      const rowKey = `${item.cliente}||${item.ocupacion}||${item.equipo || "SIN EQUIPO"}||${idx}`;

                      return (
                        <tr
                          key={rowKey}
                          className="dc-row-clickable"
                          onClick={() => setModalRow(item)}
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

          {/* Detalle inline deshabilitado intencionalmente.
              El resumen ahora se muestra en un modal breve al seleccionar una fila. */}

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
                      <th>Resultado</th>
                      <th className="num">OTC</th>
                      <th className="num">MRC</th>
                      <th className="num">MRC Normalizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oportunidadesGanadas.rows.map((op) => (
                      <tr key={op.id}>
                        <td>{op.cliente}</td>
                        <td>{op.servicio}</td>
                        <td>{op.codigo_prc}</td>
                        <td>{op.fecha_creacion || "-"}</td>
                        <td>{op.resultado_oferta || "-"}</td>
                        <td className="num">{fmtMoney(op.otc)}</td>
                        <td className="num">{fmtMoney(op.mrc)}</td>
                        <td className="num">{fmtMoney(op.mrcNormalizado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside className="dc-sidebar">
          <div className="dc-sidebar-card">
            <h3>Filtros</h3>

            <div className="dc-filter-grid">
              <div className="dc-field">
                <label>Modo</label>
                <select
                  value={draft.modo}
                  onChange={(e) => setDraft((s) => ({ ...s, modo: e.target.value }))}
                >
                  <option value="mes">Mes / año</option>
                  <option value="rango_meses">Rango de meses</option>
                  <option value="rango_fechas">Rango de fechas</option>
                </select>
              </div>

              <div className="dc-field">
                <label>Equipo</label>
                <input
                  value={draft.equipo}
                  onChange={(e) => setDraft((s) => ({ ...s, equipo: normalizeUpper(e.target.value) }))}
                  placeholder="BASIS / FUNCIONAL / IMPLEMENTACIÓN"
                />
              </div>

              <div className="dc-field">
                <label>Cliente</label>
                <input
                  value={draft.cliente}
                  onChange={(e) => setDraft((s) => ({ ...s, cliente: e.target.value }))}
                  placeholder="Cliente"
                />
              </div>

              <div className="dc-field">
                <label>Consultor</label>
                <input
                  value={draft.consultor}
                  onChange={(e) => setDraft((s) => ({ ...s, consultor: e.target.value }))}
                  placeholder="Consultor"
                />
              </div>

              <div className="dc-field">
                <label>Módulo</label>
                <input
                  value={draft.modulo}
                  onChange={(e) => setDraft((s) => ({ ...s, modulo: normalizeUpper(e.target.value) }))}
                  placeholder="FI / CO / ..."
                />
              </div>

              <div className="dc-field">
                <label>Proyecto creado</label>
                <select
                  value={draft.proyectoId}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      proyectoId: e.target.value ? Number(e.target.value) : "",
                    }))
                  }
                >
                  <option value="">Todos</option>
                  {proyectosOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dc-field">
                <label>Ocupación</label>
                <select
                  multiple
                  className="dc-multi"
                  value={(draft.ocupacionIds || []).map(String)}
                  onChange={(e) => {
                    const selectedOptions = Array.from(e.target.selectedOptions || []);
                    const nextIds = selectedOptions
                      .map((opt) => Number(opt.value))
                      .filter((id) => Number.isFinite(id) && id > 0);

                    const nextLabels = selectedOptions.map((opt) => opt.text);

                    setDraft((s) => ({
                      ...s,
                      ocupacionIds: nextIds,
                      ocupacionLabels: nextLabels,
                    }));
                  }}
                >
                  {ocupacionesOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <small className="dc-help">Puedes seleccionar una o varias ocupaciones.</small>
              </div>

              {draft.modo === "mes" && (
                <>
                  <div className="dc-field">
                    <label>Mes</label>
                    <select
                      value={draft.mes}
                      onChange={(e) => setDraft((s) => ({ ...s, mes: Number(e.target.value) }))}
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-field">
                    <label>Año</label>
                    <select
                      value={draft.anio}
                      onChange={(e) => setDraft((s) => ({ ...s, anio: Number(e.target.value) }))}
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
                  <div className="dc-field">
                    <label>Mes inicial</label>
                    <select
                      value={draft.mesDesde}
                      onChange={(e) => setDraft((s) => ({ ...s, mesDesde: Number(e.target.value) }))}
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-field">
                    <label>Año inicial</label>
                    <select
                      value={draft.anioDesde}
                      onChange={(e) => setDraft((s) => ({ ...s, anioDesde: Number(e.target.value) }))}
                    >
                      {yearOptionsFrom.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-field">
                    <label>Mes final</label>
                    <select
                      value={draft.mesHasta}
                      onChange={(e) => setDraft((s) => ({ ...s, mesHasta: Number(e.target.value) }))}
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dc-field">
                    <label>Año final</label>
                    <select
                      value={draft.anioHasta}
                      onChange={(e) => setDraft((s) => ({ ...s, anioHasta: Number(e.target.value) }))}
                    >
                      {yearOptionsTo.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {draft.modo === "rango_fechas" && (
                <>
                  <div className="dc-field">
                    <label>Desde</label>
                    <input
                      type="date"
                      value={draft.desde}
                      onChange={(e) => setDraft((s) => ({ ...s, desde: e.target.value }))}
                    />
                  </div>

                  <div className="dc-field">
                    <label>Hasta</label>
                    <input
                      type="date"
                      value={draft.hasta}
                      onChange={(e) => setDraft((s) => ({ ...s, hasta: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="dc-sidebar-actions">
              <button className="dc-btn dc-btn-ghost" type="button" onClick={clearFilters}>
                Limpiar filtros
              </button>

              <button className="dc-btn dc-btn-primary" type="button" onClick={applyFilters}>
                Aplicar filtros
              </button>
            </div>
          </div>
        </aside>
      </div>

      <ResumenFilaModal row={modalRow} onClose={() => setModalRow(null)} />
    </div>
  );
}
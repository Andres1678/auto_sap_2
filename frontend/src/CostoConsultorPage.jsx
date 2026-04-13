import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jfetch } from "./lib/api";
import "./CostoConsultorPage.css";

const nfMoney = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const nfHours = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

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

function fmtMoney(v) {
  return nfMoney.format(Number(v || 0));
}

function fmtHours(v) {
  return `${nfHours.format(Number(v || 0))} h`;
}

function fmtPct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function pctClass(v) {
  const n = Number(v || 0);
  if (n >= 90) return "is-good";
  if (n >= 70) return "is-warn";
  return "is-bad";
}

function clampPct(v) {
  return Math.max(0, Math.min(100, Number(v || 0)));
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

function SimpleBarChart({ title, rows = [], valueKey, formatter }) {
  const max = Math.max(...rows.map((r) => Number(r?.[valueKey] || 0)), 0);

  return (
    <div className="ccp-chart-card">
      <div className="ccp-section-head">
        <h3>{title}</h3>
      </div>

      {!rows.length ? (
        <div className="ccp-empty">Sin datos</div>
      ) : (
        <div className="ccp-chart-list">
          {rows.map((item) => {
            const value = Number(item?.[valueKey] || 0);
            const width = max > 0 ? (value / max) * 100 : 0;

            return (
              <div className="ccp-chart-row" key={`${title}-${item.consultor}`}>
                <div className="ccp-chart-label" title={item.consultor}>
                  {item.consultor}
                </div>

                <div className="ccp-chart-bar-wrap">
                  <div
                    className="ccp-chart-bar"
                    style={{ width: `${Math.max(width, 4)}%` }}
                  />
                </div>

                <div className="ccp-chart-value">{formatter(value)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CostoConsultorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const rol = String(
    state?.rol ||
      getStoredUser()?.rol ||
      getStoredUser()?.user?.rol ||
      getStoredUser()?.rol_ref?.nombre ||
      ""
  ).toUpperCase();

  const isAdmin = rol.startsWith("ADMIN");
  const equipoBloqueado = Boolean(state?.equipoBloqueado);

  const [draft, setDraft] = useState({
    modo: "mes",
    equipo: normalizeUpper(state?.filtroEquipo || ""),
    consultor: normalizeText(state?.filtroConsultor || ""),
    mes: Number(state?.filtroMes || currentMonth),
    anio: Number(state?.filtroAnio || currentYear),
    ocupacionIds: Array.isArray(state?.filtroOcupacionIds) ? state.filtroOcupacionIds : [],
    ocupacionLabels: Array.isArray(state?.filtroOcupacionLabels) ? state.filtroOcupacionLabels : [],
    desde: "",
    hasta: "",
  });

  const [filters, setFilters] = useState(draft);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalConsultores: 0,
    totalHorasPeriodo: 0,
    totalMetaPeriodo: 0,
    totalCostoPeriodo: 0,
    porcentajeGeneral: 0,
  });

  const [selectedConsultorId, setSelectedConsultorId] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/registro", { replace: true });
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();

        if (filters.modo === "mes") {
          qs.set("mes", String(filters.mes));
          qs.set("anio", String(filters.anio));
        } else {
          if (filters.desde) qs.set("desde", filters.desde);
          if (filters.hasta) qs.set("hasta", filters.hasta);
        }

        if (filters.equipo) qs.set("equipo", filters.equipo);
        if (filters.consultor) qs.set("consultor", filters.consultor);

        (Array.isArray(filters.ocupacionIds) ? filters.ocupacionIds : [])
          .map((id) => Number(id))
          .filter(Boolean)
          .forEach((id) => qs.append("ocupacion_id", String(id)));

        const res = await jfetch(`/resumen-costo-consultor?${qs.toString()}`, {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const nextRows = Array.isArray(json?.rows) ? json.rows : [];

        setRows(nextRows);
        setSummary({
          totalConsultores: Number(json?.totalConsultores || 0),
          totalHorasPeriodo: Number(json?.totalHorasPeriodo || 0),
          totalMetaPeriodo: Number(json?.totalMetaPeriodo || 0),
          totalCostoPeriodo: Number(json?.totalCostoPeriodo || 0),
          porcentajeGeneral: Number(json?.porcentajeGeneral || 0),
        });

        setSelectedConsultorId((prev) => {
          if (prev && nextRows.some((r) => Number(r.consultorId) === Number(prev))) {
            return prev;
          }
          return nextRows[0]?.consultorId ?? null;
        });
      } catch (e) {
        setRows([]);
        setSummary({
          totalConsultores: 0,
          totalHorasPeriodo: 0,
          totalMetaPeriodo: 0,
          totalCostoPeriodo: 0,
          porcentajeGeneral: 0,
        });
        setError(e?.message || "No se pudo cargar el costo por consultor");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, rol, isAdmin]);

  const equiposDisponibles = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => normalizeUpper(r.equipo)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const consultoresDisponibles = useMemo(() => {
    const base = rows.filter((r) => {
      if (!draft.equipo) return true;
      return normalizeUpper(r.equipo) === draft.equipo;
    });

    return Array.from(
      new Set(base.map((r) => normalizeText(r.consultor)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, draft.equipo]);

  const chartsCostRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => Number(b.costoPeriodo || 0) - Number(a.costoPeriodo || 0))
      .slice(0, 10);
  }, [rows]);

  const chartsHoursRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => Number(b.horasPeriodo || 0) - Number(a.horasPeriodo || 0))
      .slice(0, 10);
  }, [rows]);

  const yearOptions = useMemo(() => buildYearOptions(draft.anio), [draft.anio]);

  const selectedRow = useMemo(() => {
    return rows.find((r) => Number(r.consultorId) === Number(selectedConsultorId)) || null;
  }, [rows, selectedConsultorId]);

  const clearFilters = () => {
    setDraft({
      modo: "mes",
      equipo: normalizeUpper(state?.filtroEquipo || ""),
      consultor: "",
      mes: Number(state?.filtroMes || currentMonth),
      anio: Number(state?.filtroAnio || currentYear),
      ocupacionIds: Array.isArray(state?.filtroOcupacionIds) ? state.filtroOcupacionIds : [],
      ocupacionLabels: Array.isArray(state?.filtroOcupacionLabels) ? state.filtroOcupacionLabels : [],
      desde: "",
      hasta: "",
    });
  };

  const applyFilters = () => {
    setFilters({ ...draft });
  };

  if (!isAdmin) return null;

  return (
    <div className="ccp-shell">
      <div className="ccp-topbar">
        <div>
          <div className="ccp-kicker">Vista financiera operativa</div>
          <h1>Costo por consultor</h1>
          <p>
            El salario se carga por período vía Excel. El valor hora se calcula automáticamente
            según el mes y las horas hábiles reales.
          </p>

          {!!draft.ocupacionLabels.length && (
            <div className="ccp-tag">
              Ocupación activa: {draft.ocupacionLabels.join(", ")}
            </div>
          )}
        </div>

        <div className="ccp-top-actions">
          <button className="ccp-btn ccp-btn-ghost" type="button" onClick={() => navigate(-1)}>
            Volver
          </button>
          <button className="ccp-btn ccp-btn-primary" type="button" onClick={applyFilters}>
            Actualizar tablero
          </button>
        </div>
      </div>

      <div className="ccp-layout">
        <main className="ccp-main">
          <section className="ccp-cards">
            <article className="ccp-card">
              <span className="label">Consultores visibles</span>
              <strong>{summary.totalConsultores}</strong>
            </article>

            <article className="ccp-card">
              <span className="label">Horas registradas</span>
              <strong>{fmtHours(summary.totalHorasPeriodo)}</strong>
            </article>

            <article className="ccp-card">
              <span className="label">Meta del periodo</span>
              <strong>{fmtHours(summary.totalMetaPeriodo)}</strong>
            </article>

            <article className="ccp-card">
              <span className="label">Costo ejecutado</span>
              <strong>{fmtMoney(summary.totalCostoPeriodo)}</strong>
            </article>

            <article className={`ccp-card ${pctClass(summary.porcentajeGeneral)}`}>
              <span className="label">% uso general</span>
              <strong>{fmtPct(summary.porcentajeGeneral)}</strong>
            </article>
          </section>

          <section className="ccp-charts-grid">
            <SimpleBarChart
              title="Top costo por consultor"
              rows={chartsCostRows}
              valueKey="costoPeriodo"
              formatter={fmtMoney}
            />

            <SimpleBarChart
              title="Top horas por consultor"
              rows={chartsHoursRows}
              valueKey="horasPeriodo"
              formatter={fmtHours}
            />
          </section>

          <section className="ccp-panel">
            <div className="ccp-section-head">
              <h3>Resumen general por consultor</h3>
              <span>{rows.length} registros</span>
            </div>

            {loading && <div className="ccp-empty">Cargando información…</div>}
            {!loading && error && <div className="ccp-empty ccp-empty-error">{error}</div>}
            {!loading && !error && !rows.length && (
              <div className="ccp-empty">No hay información para los filtros seleccionados.</div>
            )}

            {!loading && !error && !!rows.length && (
              <div className="ccp-table-wrap">
                <table className="ccp-table">
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      <th>Equipo</th>
                      <th className="num">Horas</th>
                      <th className="num">Meta</th>
                      <th className="num">% uso</th>
                      <th className="num">Valor hora</th>
                      <th className="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr
                        key={item.consultorId}
                        className={Number(selectedConsultorId) === Number(item.consultorId) ? "is-active" : ""}
                        onClick={() => setSelectedConsultorId(item.consultorId)}
                      >
                        <td>{item.consultor}</td>
                        <td>{item.equipo || "—"}</td>
                        <td className="num">{fmtHours(item.horasPeriodo)}</td>
                        <td className="num">{fmtHours(item.metaHorasPeriodo)}</td>
                        <td className="num">
                          <span className={`ccp-pill ${pctClass(item.porcentajeUsoPeriodo)}`}>
                            {fmtPct(item.porcentajeUsoPeriodo)}
                          </span>
                        </td>
                        <td className="num">{fmtMoney(item.valorHoraPromedio)}</td>
                        <td className="num">{fmtMoney(item.costoPeriodo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedRow && (
            <section className="ccp-panel">
              <div className="ccp-section-head">
                <div>
                  <h3>{selectedRow.consultor}</h3>
                  <p>{selectedRow.equipo || "Sin equipo"}</p>
                </div>
                <span className={`ccp-pill ${pctClass(selectedRow.porcentajeUsoPeriodo)}`}>
                  {fmtPct(selectedRow.porcentajeUsoPeriodo)}
                </span>
              </div>

              <div className="ccp-detail-cards">
                <article className="ccp-mini-card">
                  <span>Horas registradas</span>
                  <strong>{fmtHours(selectedRow.horasPeriodo)}</strong>
                </article>
                <article className="ccp-mini-card">
                  <span>Meta del periodo</span>
                  <strong>{fmtHours(selectedRow.metaHorasPeriodo)}</strong>
                </article>
                <article className="ccp-mini-card">
                  <span>Diferencia</span>
                  <strong>{fmtHours(selectedRow.diferenciaHoras)}</strong>
                </article>
                <article className="ccp-mini-card">
                  <span>Valor hora promedio</span>
                  <strong>{fmtMoney(selectedRow.valorHoraPromedio)}</strong>
                </article>
                <article className="ccp-mini-card">
                  <span>Costo ejecutado</span>
                  <strong>{fmtMoney(selectedRow.costoPeriodo)}</strong>
                </article>
              </div>

              <div className="ccp-progress">
                <div className="ccp-progress-head">
                  <span>Uso del periodo</span>
                  <span>{fmtPct(selectedRow.porcentajeUsoPeriodo)}</span>
                </div>
                <div className="ccp-progress-bar">
                  <div
                    className={`ccp-progress-fill ${pctClass(selectedRow.porcentajeUsoPeriodo)}`}
                    style={{ width: `${clampPct(selectedRow.porcentajeUsoPeriodo)}%` }}
                  />
                </div>
              </div>

              <div className="ccp-table-wrap">
                <table className="ccp-table ccp-table-detail">
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th className="num">Salario</th>
                      <th className="num">Días hábiles</th>
                      <th className="num">Horas base</th>
                      <th className="num">Valor hora</th>
                      <th className="num">Horas filtro</th>
                      <th className="num">Meta filtro</th>
                      <th className="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRow.presupuestos || []).map((p) => (
                      <tr key={`${selectedRow.consultorId}-${p.anio}-${p.mes}`}>
                        <td>{p.anio}-{String(p.mes).padStart(2, "0")}</td>
                        <td className="num">{fmtMoney(p.vrPerfil)}</td>
                        <td className="num">{p.diasHabilesMes ?? "—"}</td>
                        <td className="num">{fmtHours(p.horasBaseMes)}</td>
                        <td className="num">{fmtMoney(p.valorHoraMes)}</td>
                        <td className="num">{fmtHours(p.horasRegistradasMesEnFiltro)}</td>
                        <td className="num">{fmtHours(p.metaHorasMesEnFiltro)}</td>
                        <td className="num">{fmtMoney(p.costoMesEnFiltro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>

        <aside className="ccp-sidebar">
          <div className="ccp-sidebar-card">
            <h3>Filtros</h3>

            <div className="ccp-filter-grid">
              <div className="ccp-field">
                <label>Modo</label>
                <select
                  value={draft.modo}
                  onChange={(e) => setDraft((s) => ({ ...s, modo: e.target.value }))}
                >
                  <option value="mes">Mes / año</option>
                  <option value="rango">Rango de fechas</option>
                </select>
              </div>

              <div className="ccp-field">
                <label>Equipo</label>
                <select
                  value={draft.equipo}
                  disabled={equipoBloqueado}
                  onChange={(e) => setDraft((s) => ({ ...s, equipo: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {equiposDisponibles.map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ccp-field">
                <label>Consultor</label>
                <select
                  value={draft.consultor}
                  onChange={(e) => setDraft((s) => ({ ...s, consultor: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {consultoresDisponibles.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {draft.modo === "mes" ? (
                <>
                  <div className="ccp-field">
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

                  <div className="ccp-field">
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
              ) : (
                <>
                  <div className="ccp-field">
                    <label>Desde</label>
                    <input
                      type="date"
                      value={draft.desde}
                      onChange={(e) => setDraft((s) => ({ ...s, desde: e.target.value }))}
                    />
                  </div>

                  <div className="ccp-field">
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

            <div className="ccp-sidebar-actions">
              <button className="ccp-btn ccp-btn-ghost" type="button" onClick={clearFilters}>
                Limpiar filtros
              </button>
              <button className="ccp-btn ccp-btn-primary" type="button" onClick={applyFilters}>
                Aplicar filtros
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
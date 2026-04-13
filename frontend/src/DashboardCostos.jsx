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
    mes: Number(navState?.filtroMes || currentMonth),
    anio: Number(navState?.filtroAnio || currentYear),
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
    porConsultor: [],
  });

  const [selectedRowKey, setSelectedRowKey] = useState("");

  const yearOptions = useMemo(() => buildYearOptions(draft.anio), [draft.anio]);

  useEffect(() => {
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
        if (filters.cliente) qs.append("cliente", filters.cliente);
        if (filters.consultor) qs.append("consultor", filters.consultor);
        if (filters.modulo) qs.append("modulo", filters.modulo);

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

        const nextRows = Array.isArray(json?.rows) ? json.rows : [];
        setRows(nextRows);
        setSummary({
          totalCosto: Number(json?.totalCosto || 0),
          totalHoras: Number(json?.totalHoras || 0),
          totalClientes: Number(json?.totalClientes || 0),
          totalOcupaciones: Number(json?.totalOcupaciones || 0),
          totalConsultores: Number(json?.totalConsultores || 0),
        });

        setGraficos({
          porCliente: Array.isArray(json?.graficos?.porCliente) ? json.graficos.porCliente.slice(0, 10) : [],
          porOcupacion: Array.isArray(json?.graficos?.porOcupacion) ? json.graficos.porOcupacion.slice(0, 10) : [],
          porConsultor: Array.isArray(json?.graficos?.porConsultor) ? json.graficos.porConsultor.slice(0, 10) : [],
        });

        setSelectedRowKey((prev) => {
          if (prev && nextRows.some((r) => `${r.cliente}||${r.ocupacion}` === prev)) {
            return prev;
          }
          const first = nextRows[0];
          return first ? `${first.cliente}||${first.ocupacion}` : "";
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
          porConsultor: [],
        });
        setError(e?.message || "No se pudo cargar el dashboard de costos");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, rol]);

  const selectedRow = useMemo(() => {
    return rows.find((r) => `${r.cliente}||${r.ocupacion}` === selectedRowKey) || null;
  }, [rows, selectedRowKey]);

  const applyFilters = () => {
    setFilters({ ...draft });
  };

  const clearFilters = () => {
    const reset = {
      ...initialDraft,
      cliente: "",
      consultor: "",
      modulo: "",
      desde: "",
      hasta: "",
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
            Resumen de costo total por cliente y ocupación, calculado con valor hora real del consultor
            según período y filtros aplicados.
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

          <section className="dc-panel">
            <div className="dc-section-head">
              <h3>Resumen por cliente y ocupación</h3>
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
                    {rows.map((item) => {
                      const rowKey = `${item.cliente}||${item.ocupacion}`;
                      return (
                        <tr
                          key={rowKey}
                          className={selectedRowKey === rowKey ? "is-active" : ""}
                          onClick={() => setSelectedRowKey(rowKey)}
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

          {selectedRow && (
            <section className="dc-panel">
              <div className="dc-section-head">
                <div>
                  <h3>{selectedRow.cliente}</h3>
                  <p>{selectedRow.ocupacion}</p>
                </div>
                <span>{selectedRow.equipo || "SIN EQUIPO"}</span>
              </div>

              <div className="dc-detail-cards">
                <article className="dc-mini-card">
                  <span>Costo total</span>
                  <strong>{fmtMoney(selectedRow.costoTotal)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Horas</span>
                  <strong>{fmtHours(selectedRow.horas)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Valor hora promedio</span>
                  <strong>{fmtMoney(selectedRow.valorHoraPromedio)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Consultores</span>
                  <strong>{fmtInt(selectedRow.consultoresCount)}</strong>
                </article>

                <article className="dc-mini-card">
                  <span>Registros</span>
                  <strong>{fmtInt(selectedRow.registrosCount)}</strong>
                </article>
              </div>

              <div className="dc-detail-grid">
                <div className="dc-subpanel">
                  <h4>Consultores involucrados</h4>
                  {!selectedRow.consultores?.length ? (
                    <div className="dc-empty">Sin consultores</div>
                  ) : (
                    <div className="dc-chip-list">
                      {selectedRow.consultores.map((name) => (
                        <span key={name} className="dc-chip">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="dc-subpanel">
                  <h4>Detalle por período</h4>
                  {!selectedRow.detallePeriodos?.length ? (
                    <div className="dc-empty">Sin períodos</div>
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
                          {selectedRow.detallePeriodos.map((p) => (
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
            </section>
          )}
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
                  <option value="rango">Rango de fechas</option>
                </select>
              </div>

              <div className="dc-field">
                <label>Equipo</label>
                <input
                  value={draft.equipo}
                  onChange={(e) => setDraft((s) => ({ ...s, equipo: normalizeUpper(e.target.value) }))}
                  placeholder="BASIS / FUNCIONAL"
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

              {draft.modo === "mes" ? (
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
              ) : (
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

          <SimpleBarChart title="Top costo por consultor" rows={graficos.porConsultor} />
        </aside>
      </div>
    </div>
  );
}
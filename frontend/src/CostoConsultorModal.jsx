import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import { jfetch } from "./lib/api";
import "./CostoConsultorModal.css";

Modal.setAppElement("#root");

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
    <div className="cost-chart-card">
      <h4>{title}</h4>

      {!rows.length ? (
        <div className="cost-empty-chart">Sin datos</div>
      ) : (
        <div className="cost-chart-list">
          {rows.map((item) => {
            const value = Number(item?.[valueKey] || 0);
            const width = max > 0 ? (value / max) * 100 : 0;

            return (
              <div className="cost-chart-row" key={`${title}-${item.consultor}`}>
                <div className="cost-chart-label" title={item.consultor}>
                  {item.consultor}
                </div>

                <div className="cost-chart-bar-wrap">
                  <div
                    className="cost-chart-bar"
                    style={{ width: `${Math.max(width, 4)}%` }}
                  />
                </div>

                <div className="cost-chart-value">{formatter(value)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CostoConsultorModal({
  isOpen,
  onClose,
  filtroEquipo = "",
  filtroConsultor = "",
  filtroMes = "",
  filtroAnio = "",
  filtroOcupacion = [],
  equipoBloqueado = false,
  isAdmin = false,
  rol = "",
}) {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  const [modoFiltro, setModoFiltro] = useState("mes");
  const [selectedEquipo, setSelectedEquipo] = useState(normalizeUpper(filtroEquipo));
  const [selectedConsultor, setSelectedConsultor] = useState(normalizeText(filtroConsultor));
  const [selectedOcupacion, setSelectedOcupacion] = useState(
    Array.isArray(filtroOcupacion) ? filtroOcupacion[0] || "" : ""
  );
  const [selectedMes, setSelectedMes] = useState(Number(filtroMes || currentMonth));
  const [selectedAnio, setSelectedAnio] = useState(Number(filtroAnio || currentYear));
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [summary, setSummary] = useState({
    totalConsultores: 0,
    totalHorasPeriodo: 0,
    totalMetaPeriodo: 0,
    totalCostoPeriodo: 0,
    porcentajeGeneral: 0,
  });

  useEffect(() => {
    if (isOpen && !isAdmin) {
      onClose?.();
    }
  }, [isOpen, isAdmin, onClose]);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;

    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor(normalizeText(filtroConsultor));
    setSelectedMes(Number(filtroMes || currentMonth));
    setSelectedAnio(Number(filtroAnio || currentYear));
    setDesde("");
    setHasta("");
    setModoFiltro("mes");
    setSelectedOcupacion(Array.isArray(filtroOcupacion) ? filtroOcupacion[0] || "" : "");
  }, [
    isOpen,
    isAdmin,
    filtroEquipo,
    filtroConsultor,
    filtroMes,
    filtroAnio,
    currentMonth,
    currentYear,
  ]);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();

        if (modoFiltro === "mes") {
          qs.set("mes", String(selectedMes));
          qs.set("anio", String(selectedAnio));
        } else {
          if (desde) qs.set("desde", desde);
          if (hasta) qs.set("hasta", hasta);
        }

        if (selectedEquipo) qs.set("equipo", selectedEquipo);
        if (selectedConsultor) qs.set("consultor", selectedConsultor);
        if (selectedOcupacion) qs.set("ocupacion", selectedOcupacion);

        const res = await jfetch(`/resumen-costo-consultor?${qs.toString()}`, {
          headers: getAuthHeaders(rol),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setSummary({
          totalConsultores: Number(json?.totalConsultores || 0),
          totalHorasPeriodo: Number(json?.totalHorasPeriodo || 0),
          totalMetaPeriodo: Number(json?.totalMetaPeriodo || 0),
          totalCostoPeriodo: Number(json?.totalCostoPeriodo || 0),
          porcentajeGeneral: Number(json?.porcentajeGeneral || 0),
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
  }, [
    isOpen,
    isAdmin,
    modoFiltro,
    selectedEquipo,
    selectedConsultor,
    selectedMes,
    selectedAnio,
    desde,
    hasta,
    rol,
  ]);

  useEffect(() => {
    if (!equipoBloqueado) return;
    setSelectedEquipo(normalizeUpper(filtroEquipo));
  }, [equipoBloqueado, filtroEquipo]);

  const equiposDisponibles = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => normalizeUpper(r.equipo)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const consultoresDisponibles = useMemo(() => {
    const base = rows.filter((r) => {
      if (!selectedEquipo) return true;
      return normalizeUpper(r.equipo) === selectedEquipo;
    });

    return Array.from(
      new Set(base.map((r) => normalizeText(r.consultor)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, selectedEquipo]);

  const chartsRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => Number(b.costoPeriodo || 0) - Number(a.costoPeriodo || 0))
      .slice(0, 10);
  }, [rows]);

  const chartsHoursRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => Number(b.horasPeriodo || 0) - Number(a.horasPeriodo || 0))
      .slice(0, 10);
  }, [rows]);

  const yearOptions = useMemo(() => buildYearOptions(selectedAnio), [selectedAnio]);

  const clearFilters = () => {
    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor("");
    setSelectedMes(Number(filtroMes || currentMonth));
    setSelectedAnio(Number(filtroAnio || currentYear));
    setDesde("");
    setHasta("");
    setModoFiltro("mes");
    setSelectedOcupacion(Array.isArray(filtroOcupacion) ? filtroOcupacion[0] || "" : "");
  };

  if (!isAdmin) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="cost-modal-content"
      overlayClassName="cost-modal-overlay"
      bodyOpenClassName="registro-modal-body-open"
      htmlOpenClassName="registro-modal-html-open"
      contentLabel="Costo por consultor"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <div className="cost-shell">
        <div className="cost-header">
          <div>
            <div className="cost-kicker">Vista financiera operativa</div>
            <h3>Costo por consultor</h3>
            <p>
              El salario se carga por periodo vía Excel. El valor hora se calcula
              automáticamente según el mes y las horas hábiles reales.
            </p>
          </div>

          <button type="button" className="cost-close" onClick={onClose}>
            ✖
          </button>
        </div>

        <div className="cost-filters">
          <div className="filter-field">
            <label>Modo</label>
            <select value={modoFiltro} onChange={(e) => setModoFiltro(e.target.value)}>
              <option value="mes">Mes / año</option>
              <option value="rango">Rango de fechas</option>
            </select>
          </div>

          <div className="filter-field">
            <label>Equipo</label>
            <select
              value={selectedEquipo}
              onChange={(e) => setSelectedEquipo(e.target.value)}
              disabled={equipoBloqueado}
            >
              <option value="">Todos</option>
              {equiposDisponibles.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label>Consultor</label>
            <select
              value={selectedConsultor}
              onChange={(e) => setSelectedConsultor(e.target.value)}
            >
              <option value="">Todos</option>
              {consultoresDisponibles.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {modoFiltro === "mes" ? (
            <>
              <div className="filter-field">
                <label>Mes</label>
                <select
                  value={selectedMes}
                  onChange={(e) => setSelectedMes(Number(e.target.value))}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label>Año</label>
                <select
                  value={selectedAnio}
                  onChange={(e) => setSelectedAnio(Number(e.target.value))}
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
              <div className="filter-field">
                <label>Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>

              <div className="filter-field">
                <label>Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="filter-actions">
            <button type="button" className="btn-clear-filters" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="cost-top-cards">
          <div className="cost-card">
            <span className="label">Consultores visibles</span>
            <strong>{summary.totalConsultores}</strong>
          </div>

          <div className="cost-card">
            <span className="label">Horas registradas</span>
            <strong>{fmtHours(summary.totalHorasPeriodo)}</strong>
          </div>

          <div className="cost-card">
            <span className="label">Meta del periodo</span>
            <strong>{fmtHours(summary.totalMetaPeriodo)}</strong>
          </div>

          <div className="cost-card">
            <span className="label">Costo ejecutado</span>
            <strong>{fmtMoney(summary.totalCostoPeriodo)}</strong>
          </div>

          <div className={`cost-card ${pctClass(summary.porcentajeGeneral)}`}>
            <span className="label">% uso general</span>
            <strong>{fmtPct(summary.porcentajeGeneral)}</strong>
          </div>
        </div>

        <div className="cost-charts-grid">
          <SimpleBarChart
            title="Top costo por consultor"
            rows={chartsRows}
            valueKey="costoPeriodo"
            formatter={fmtMoney}
          />

          <SimpleBarChart
            title="Top horas por consultor"
            rows={chartsHoursRows}
            valueKey="horasPeriodo"
            formatter={fmtHours}
          />
        </div>

        <div className="cost-body">
          {loading && <div className="cost-state">Cargando costo por consultor…</div>}

          {!loading && error && <div className="cost-state error">{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div className="cost-state">No hay información para los filtros seleccionados.</div>
          )}

          {!loading &&
            !error &&
            rows.map((item) => (
              <section
                className="cost-consultor"
                key={`${item.consultorId}-${item.consultor}`}
              >
                <div className="cost-consultor-head">
                  <div>
                    <h4>{item.consultor || "Sin nombre"}</h4>
                    <p>{item.equipo || "Sin equipo"}</p>
                  </div>

                  <div className="cost-consultor-stats">
                    <span>
                      <b>Horas:</b> {fmtHours(item.horasPeriodo)} / {fmtHours(item.metaHorasPeriodo)}
                    </span>
                    <span className={`pill ${pctClass(item.porcentajeUsoPeriodo)}`}>
                      {fmtPct(item.porcentajeUsoPeriodo)}
                    </span>
                  </div>
                </div>

                <div className="cost-summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Horas registradas</span>
                    <strong>{fmtHours(item.horasPeriodo)}</strong>
                  </div>

                  <div className="summary-item">
                    <span className="summary-label">Meta del periodo</span>
                    <strong>{fmtHours(item.metaHorasPeriodo)}</strong>
                  </div>

                  <div className="summary-item">
                    <span className="summary-label">Diferencia</span>
                    <strong>{fmtHours(item.diferenciaHoras)}</strong>
                  </div>

                  <div className="summary-item">
                    <span className="summary-label">% uso</span>
                    <strong>{fmtPct(item.porcentajeUsoPeriodo)}</strong>
                  </div>

                  <div className="summary-item">
                    <span className="summary-label">Valor hora promedio</span>
                    <strong>{fmtMoney(item.valorHoraPromedio)}</strong>
                  </div>

                  <div className="summary-item">
                    <span className="summary-label">Costo ejecutado</span>
                    <strong>{fmtMoney(item.costoPeriodo)}</strong>
                  </div>
                </div>

                <div className="summary-progress">
                  <div className="progress-row">
                    <span>Uso del periodo</span>
                    <span>{fmtPct(item.porcentajeUsoPeriodo)}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${pctClass(item.porcentajeUsoPeriodo)}`}
                      style={{ width: `${clampPct(item.porcentajeUsoPeriodo)}%` }}
                    />
                  </div>
                </div>

                <div className="cost-months-table">
                  <div className="cost-months-head">
                    <span>Periodo</span>
                    <span>Salario</span>
                    <span>Horas base mes</span>
                    <span>Valor hora</span>
                    <span>Horas filtro</span>
                    <span>Meta filtro</span>
                    <span>Costo</span>
                  </div>

                  {(item.presupuestos || []).map((p) => (
                    <div
                      className="cost-months-row"
                      key={`${item.consultorId}-${p.anio}-${p.mes}`}
                    >
                      <span>{p.anio}-{String(p.mes).padStart(2, "0")}</span>
                      <span>{fmtMoney(p.vrPerfil)}</span>
                      <span>{fmtHours(p.horasBaseMes)}</span>
                      <span>{fmtMoney(p.valorHoraMes)}</span>
                      <span>{fmtHours(p.horasRegistradasMesEnFiltro)}</span>
                      <span>{fmtHours(p.metaHorasMesEnFiltro)}</span>
                      <span>{fmtMoney(p.costoMesEnFiltro)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </Modal>
  );
}
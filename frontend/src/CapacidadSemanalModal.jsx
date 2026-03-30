import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import { jfetch } from "./lib/api";
import "./CapacidadSemanalModal.css";

Modal.setAppElement("#root");

const nf = new Intl.NumberFormat("es-CO", {
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

function fmtHours(v) {
  return `${nf.format(Number(v || 0))} h`;
}

function fmtPct(v) {
  const n = Number(v || 0);
  return `${n.toFixed(1)}%`;
}

function pctClass(v) {
  const n = Number(v || 0);
  if (n >= 90) return "is-good";
  if (n >= 70) return "is-warn";
  return "is-bad";
}

function safeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function cumplimientoBucket(pct) {
  const n = Number(pct || 0);
  if (n >= 90) return "alto";
  if (n >= 70) return "medio";
  return "bajo";
}

function buildYearOptions(baseYear) {
  const y = Number(baseYear || new Date().getFullYear());
  return [y - 2, y - 1, y, y + 1];
}

function barWidth(pct) {
  return `${Math.max(0, Math.min(100, Number(pct || 0)))}%`;
}

export default function CapacidadSemanalModal({
  isOpen,
  onClose,
  filtroEquipo,
  filtroConsultor,
  filtroMes,
  filtroAnio,
  equipoBloqueado = false,
}) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  const [selectedEquipo, setSelectedEquipo] = useState(normalizeUpper(filtroEquipo));
  const [selectedConsultor, setSelectedConsultor] = useState(normalizeText(filtroConsultor));
  const [selectedMes, setSelectedMes] = useState(Number(filtroMes || currentMonth));
  const [selectedAnio, setSelectedAnio] = useState(Number(filtroAnio || currentYear));
  const [selectedCumplimiento, setSelectedCumplimiento] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor(normalizeText(filtroConsultor));
    setSelectedMes(Number(filtroMes || currentMonth));
    setSelectedAnio(Number(filtroAnio || currentYear));
    setSelectedCumplimiento("");
  }, [isOpen, filtroEquipo, filtroConsultor, filtroMes, filtroAnio, currentMonth, currentYear]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();
        qs.set("mes", String(selectedMes));
        qs.set("anio", String(selectedAnio));

        if (selectedEquipo) qs.set("equipo", selectedEquipo);
        if (selectedConsultor) qs.set("consultor", selectedConsultor);

        const res = await jfetch(`/resumen-capacidad-semanal?${qs.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        setRows(safeRows(json));
      } catch (e) {
        setError(e?.message || "No se pudo cargar la capacidad semanal");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, selectedMes, selectedAnio, selectedEquipo, selectedConsultor]);

  const equiposDisponibles = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => normalizeUpper(r.equipo)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const consultoresDisponibles = useMemo(() => {
    const source = rows.filter((r) => {
      if (!selectedEquipo) return true;
      return normalizeUpper(r.equipo) === selectedEquipo;
    });

    return Array.from(
      new Set(source.map((r) => normalizeText(r.consultor)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, selectedEquipo]);

  useEffect(() => {
    if (equipoBloqueado) {
      setSelectedEquipo(normalizeUpper(filtroEquipo));
    }
  }, [equipoBloqueado, filtroEquipo]);

  useEffect(() => {
    if (!selectedConsultor) return;
    if (!consultoresDisponibles.includes(selectedConsultor)) {
      setSelectedConsultor("");
    }
  }, [consultoresDisponibles, selectedConsultor]);

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      const equipoOk = !selectedEquipo || normalizeUpper(item.equipo) === selectedEquipo;
      const consultorOk =
        !selectedConsultor || normalizeText(item.consultor) === selectedConsultor;
      const cumplimientoOk =
        !selectedCumplimiento ||
        cumplimientoBucket(item.porcentajeLegalMes) === selectedCumplimiento;

      return equipoOk && consultorOk && cumplimientoOk;
    });
  }, [rows, selectedEquipo, selectedConsultor, selectedCumplimiento]);

  const resumenGeneral = useMemo(() => {
    const totalConsultores = filteredRows.length;
    const totalHorasMes = filteredRows.reduce((acc, r) => acc + Number(r.horasMes || 0), 0);
    const totalMetaLegal = filteredRows.reduce(
      (acc, r) => acc + Number(r.metaLegalMes || 0),
      0
    );
    const totalMetaOperativa = filteredRows.reduce(
      (acc, r) => acc + Number(r.metaOperativaMes || 0),
      0
    );

    const totalPctLegal =
      totalMetaLegal > 0 ? (totalHorasMes / totalMetaLegal) * 100 : 0;

    return {
      totalConsultores,
      totalHorasMes,
      totalMetaLegal,
      totalMetaOperativa,
      totalPctLegal,
      totalDiffLegal: totalMetaLegal - totalHorasMes,
    };
  }, [filteredRows]);

  const yearOptions = useMemo(() => buildYearOptions(selectedAnio), [selectedAnio]);

  const clearFilters = () => {
    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor("");
    setSelectedCumplimiento("");
    setSelectedMes(Number(filtroMes || currentMonth));
    setSelectedAnio(Number(filtroAnio || currentYear));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="capacidad-modal-content"
      overlayClassName="capacidad-modal-overlay"
      bodyOpenClassName="registro-modal-body-open"
      htmlOpenClassName="registro-modal-html-open"
      contentLabel="Capacidad semanal"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <div className="capacidad-shell">
        <div className="capacidad-header">
          <div>
            <div className="capacidad-kicker">Vista operativa</div>
            <h3>Capacidad semanal del mes</h3>
            <p>
              Meta legal fija de 43 horas por consultor y meta operativa calculada
              por días laborables y jornada diaria.
            </p>
          </div>

          <button type="button" className="capacidad-close" onClick={onClose}>
            ✖
          </button>
        </div>

        <div className="capacidad-filters">
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

          <div className="filter-field">
            <label>Cumplimiento legal</label>
            <select
              value={selectedCumplimiento}
              onChange={(e) => setSelectedCumplimiento(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="alto">Alto (≥ 90%)</option>
              <option value="medio">Medio (70% - 89.9%)</option>
              <option value="bajo">Bajo (&lt; 70%)</option>
            </select>
          </div>

          <div className="filter-actions">
            <button type="button" className="btn-clear-filters" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="capacidad-top-cards">
          <div className="capacidad-card">
            <span className="label">Consultores visibles</span>
            <strong>{resumenGeneral.totalConsultores}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Horas registradas</span>
            <strong>{fmtHours(resumenGeneral.totalHorasMes)}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Meta legal total</span>
            <strong>{fmtHours(resumenGeneral.totalMetaLegal)}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Meta operativa total</span>
            <strong>{fmtHours(resumenGeneral.totalMetaOperativa)}</strong>
          </div>

          <div className={`capacidad-card ${pctClass(resumenGeneral.totalPctLegal)}`}>
            <span className="label">% legal total</span>
            <strong>{fmtPct(resumenGeneral.totalPctLegal)}</strong>
          </div>
        </div>

        <div className="capacidad-body">
          {loading && <div className="capacidad-state">Cargando capacidad semanal…</div>}

          {!loading && error && (
            <div className="capacidad-state error">{error}</div>
          )}

          {!loading && !error && filteredRows.length === 0 && (
            <div className="capacidad-state">
              No hay información para los filtros seleccionados.
            </div>
          )}

          {!loading &&
            !error &&
            filteredRows.map((item, idx) => (
              <section className="capacidad-consultor" key={`${item.consultor}-${idx}`}>
                <div className="capacidad-consultor-head">
                  <div>
                    <h4>{item.consultor || "Sin nombre"}</h4>
                    <p>{item.equipo || "Sin equipo"}</p>
                  </div>

                  <div className="capacidad-consultor-stats">
                    <span>
                      <b>Mes:</b> {fmtHours(item.horasMes)} / {fmtHours(item.metaLegalMes)}
                    </span>
                    <span className={`pill ${pctClass(item.porcentajeLegalMes)}`}>
                      {fmtPct(item.porcentajeLegalMes)}
                    </span>
                  </div>
                </div>

                <div className="capacidad-summary-card">
                  <div className="summary-card-head">
                    <h5>Resumen del consultor</h5>
                    <span className="summary-badge">100% = {fmtHours(item.metaLegalMes)}</span>
                  </div>

                  <div className="summary-grid">
                    <div className="summary-item">
                      <span className="summary-label">Meta legal fija</span>
                      <strong>{fmtHours(item.metaLegalMes)}</strong>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Horas registradas mes</span>
                      <strong>{fmtHours(item.horasMes)}</strong>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">% sobre meta legal</span>
                      <strong>{fmtPct(item.porcentajeLegalMes)}</strong>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Meta operativa mes</span>
                      <strong>{fmtHours(item.metaOperativaMes)}</strong>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Días de trabajo</span>
                      <strong>{item.diasTrabajoTexto}</strong>
                      <small>{item.diasLaborablesMes} días del periodo</small>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Meta del día</span>
                      <strong>{fmtHours(item.metaDiaObjetivo)}</strong>
                    </div>
                  </div>

                  <div className="summary-progress">
                    <div className="progress-row">
                      <span>Cumplimiento meta legal</span>
                      <span>{fmtPct(item.porcentajeLegalMes)}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${pctClass(item.porcentajeLegalMes)}`}
                        style={{ width: barWidth(item.porcentajeLegalMes) }}
                      />
                    </div>
                  </div>
                </div>

                <div className="capacidad-semanas-grid">
                  {(item.semanas || []).map((semana, i) => (
                    <article className="semana-card" key={`${item.consultor}-sem-${i}`}>
                      <div className="semana-card-head">
                        <div>
                          <h5>{semana.label}</h5>
                          <p>
                            {semana.inicio} — {semana.fin}
                          </p>
                        </div>

                        <span className={`pill ${pctClass(semana.porcentajeSemanal)}`}>
                          {fmtPct(semana.porcentajeSemanal)}
                        </span>
                      </div>

                      <div className="semana-metrics">
                        <div>
                          <span className="mini-label">Horas semana</span>
                          <strong>{fmtHours(semana.horasSemana)}</strong>
                        </div>

                        <div>
                          <span className="mini-label">Meta semana</span>
                          <strong>{fmtHours(semana.metaSemanal)}</strong>
                        </div>

                        <div>
                          <span className="mini-label">% sobre meta legal</span>
                          <strong>{fmtPct(semana.aporteMesLegalPct)}</strong>
                        </div>

                        <div>
                          <span className="mini-label">Diferencia</span>
                          <strong>{fmtHours(semana.diferenciaSemana)}</strong>
                        </div>
                      </div>

                      <div className="progress-block">
                        <div className="progress-row">
                          <span>Llenado de la semana</span>
                          <span>{fmtPct(semana.porcentajeSemanal)}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${pctClass(semana.porcentajeSemanal)}`}
                            style={{ width: barWidth(semana.porcentajeSemanal) }}
                          />
                        </div>
                      </div>

                      <div className="progress-block">
                        <div className="progress-row">
                          <span>Aporte sobre 43 h</span>
                          <span>{fmtPct(semana.aporteMesLegalPct)}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill is-month"
                            style={{ width: barWidth(semana.aporteMesLegalPct) }}
                          />
                        </div>
                      </div>

                      {!!semana.dias?.length && (
                        <div className="dias-table">
                          <div className="dias-head">
                            <span>Fecha</span>
                            <span>Horas</span>
                            <span>Meta día</span>
                          </div>

                          {semana.dias.map((d, ix) => (
                            <div className="dias-row" key={`${semana.label}-${ix}`}>
                              <span>{d.fecha}</span>
                              <span>{fmtHours(d.horas)}</span>
                              <span>{fmtHours(d.metaDia)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </Modal>
  );
}
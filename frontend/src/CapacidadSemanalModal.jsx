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

export default function CapacidadSemanalModal({
  isOpen,
  onClose,
  filtroEquipo,
  filtroConsultor,
  filtroMes,
  filtroAnio,
  equipoBloqueado = false,
}) {
  const today = new Date();
  const defaultMonth = Number(filtroMes || today.getMonth() + 1);
  const defaultYear = Number(filtroAnio || today.getFullYear());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  const [selectedEquipo, setSelectedEquipo] = useState(normalizeUpper(filtroEquipo));
  const [selectedConsultor, setSelectedConsultor] = useState(normalizeText(filtroConsultor));
  const [selectedMes, setSelectedMes] = useState(defaultMonth);
  const [selectedAnio, setSelectedAnio] = useState(defaultYear);
  const [selectedCumplimiento, setSelectedCumplimiento] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor(normalizeText(filtroConsultor));
    setSelectedMes(Number(filtroMes || today.getMonth() + 1));
    setSelectedAnio(Number(filtroAnio || today.getFullYear()));
    setSelectedCumplimiento("");
  }, [isOpen, filtroEquipo, filtroConsultor, filtroMes, filtroAnio]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();
        qs.set("mes", String(selectedMes));
        qs.set("anio", String(selectedAnio));

        if (equipoBloqueado && selectedEquipo) {
          qs.set("equipo", selectedEquipo);
        }

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
  }, [isOpen, selectedMes, selectedAnio, selectedEquipo, equipoBloqueado]);

  const equiposDisponibles = useMemo(() => {
    const items = Array.from(
      new Set(
        rows
          .map((r) => normalizeUpper(r.equipo))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));
    return items;
  }, [rows]);

  const consultoresDisponibles = useMemo(() => {
    const base = rows.filter((r) => {
      if (!selectedEquipo) return true;
      return normalizeUpper(r.equipo) === selectedEquipo;
    });

    return Array.from(
      new Set(
        base
          .map((r) => normalizeText(r.consultor))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, selectedEquipo]);

  useEffect(() => {
    if (!selectedConsultor) return;
    if (!consultoresDisponibles.includes(selectedConsultor)) {
      setSelectedConsultor("");
    }
  }, [consultoresDisponibles, selectedConsultor]);

  useEffect(() => {
    if (equipoBloqueado) {
      setSelectedEquipo(normalizeUpper(filtroEquipo));
      return;
    }

    if (!selectedEquipo) return;
    if (!equiposDisponibles.includes(selectedEquipo)) {
      setSelectedEquipo("");
    }
  }, [equiposDisponibles, selectedEquipo, equipoBloqueado, filtroEquipo]);

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      const equipoOk = !selectedEquipo || normalizeUpper(item.equipo) === selectedEquipo;
      const consultorOk =
        !selectedConsultor || normalizeText(item.consultor) === selectedConsultor;
      const cumplimientoOk =
        !selectedCumplimiento ||
        cumplimientoBucket(item.porcentajeMes) === selectedCumplimiento;

      return equipoOk && consultorOk && cumplimientoOk;
    });
  }, [rows, selectedEquipo, selectedConsultor, selectedCumplimiento]);

  const resumenGeneral = useMemo(() => {
    const totalMetaMes = filteredRows.reduce(
      (acc, r) => acc + Number(r.metaMes || 0),
      0
    );
    const totalHorasMes = filteredRows.reduce(
      (acc, r) => acc + Number(r.horasMes || 0),
      0
    );
    const totalDiff = totalMetaMes - totalHorasMes;
    const totalPct =
      totalMetaMes > 0 ? (totalHorasMes / totalMetaMes) * 100 : 0;

    return {
      totalMetaMes,
      totalHorasMes,
      totalDiff,
      totalPct,
      totalConsultores: filteredRows.length,
    };
  }, [filteredRows]);

  const yearOptions = useMemo(() => buildYearOptions(selectedAnio), [selectedAnio]);

  const clearFilters = () => {
    setSelectedEquipo(normalizeUpper(filtroEquipo));
    setSelectedConsultor("");
    setSelectedCumplimiento("");
    setSelectedMes(Number(filtroMes || today.getMonth() + 1));
    setSelectedAnio(Number(filtroAnio || today.getFullYear()));
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
              Seguimiento del porcentaje de llenado por semana frente a la meta
              mensual y la meta semanal calculada por horario.
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
            <label>Estado cumplimiento</label>
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
            <span className="label">Meta mensual</span>
            <strong>{fmtHours(resumenGeneral.totalMetaMes)}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Horas registradas</span>
            <strong>{fmtHours(resumenGeneral.totalHorasMes)}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Diferencia</span>
            <strong>{fmtHours(resumenGeneral.totalDiff)}</strong>
          </div>

          <div className={`capacidad-card ${pctClass(resumenGeneral.totalPct)}`}>
            <span className="label">% cumplimiento mes</span>
            <strong>{fmtPct(resumenGeneral.totalPct)}</strong>
          </div>

          <div className="capacidad-card">
            <span className="label">Consultores visibles</span>
            <strong>{resumenGeneral.totalConsultores}</strong>
          </div>
        </div>

        <div className="capacidad-body">
          {loading && (
            <div className="capacidad-state">Cargando capacidad semanal…</div>
          )}

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
              <section
                className="capacidad-consultor"
                key={`${item.consultor}-${idx}`}
              >
                <div className="capacidad-consultor-head">
                  <div>
                    <h4>{item.consultor || "Sin nombre"}</h4>
                    <p>{item.equipo || "Sin equipo"}</p>
                  </div>

                  <div className="capacidad-consultor-stats">
                    <span>
                      <b>Mes:</b> {fmtHours(item.horasMes)} /{" "}
                      {fmtHours(item.metaMes)}
                    </span>
                    <span className={`pill ${pctClass(item.porcentajeMes)}`}>
                      {fmtPct(item.porcentajeMes)}
                    </span>
                  </div>
                </div>

                <div className="capacidad-semanas-grid">
                  {(item.semanas || []).map((semana, i) => {
                    const semanalPct = Math.max(
                      0,
                      Math.min(100, Number(semana.porcentajeSemanal || 0))
                    );
                    const aporteMesPct = Math.max(
                      0,
                      Math.min(100, Number(semana.aporteMesPct || 0))
                    );

                    return (
                      <article
                        className="semana-card"
                        key={`${item.consultor}-sem-${i}`}
                      >
                        <div className="semana-card-head">
                          <div>
                            <h5>{semana.label}</h5>
                            <p>
                              {semana.inicio} — {semana.fin}
                            </p>
                          </div>

                          <span
                            className={`pill ${pctClass(
                              semana.porcentajeSemanal
                            )}`}
                          >
                            {fmtPct(semana.porcentajeSemanal)}
                          </span>
                        </div>

                        <div className="semana-metrics">
                          <div>
                            <span className="mini-label">Horas</span>
                            <strong>{fmtHours(semana.horasSemana)}</strong>
                          </div>
                          <div>
                            <span className="mini-label">Meta semanal</span>
                            <strong>{fmtHours(semana.metaSemanal)}</strong>
                          </div>
                          <div>
                            <span className="mini-label">Aporte al mes</span>
                            <strong>{fmtPct(semana.aporteMesPct)}</strong>
                          </div>
                          <div>
                            <span className="mini-label">Diferencia</span>
                            <strong>{fmtHours(semana.diferenciaSemana)}</strong>
                          </div>
                        </div>

                        <div className="progress-block">
                          <div className="progress-row">
                            <span>Llenado semanal</span>
                            <span>{fmtPct(semana.porcentajeSemanal)}</span>
                          </div>
                          <div className="progress-bar">
                            <div
                              className={`progress-fill ${pctClass(
                                semana.porcentajeSemanal
                              )}`}
                              style={{ width: `${semanalPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="progress-block">
                          <div className="progress-row">
                            <span>% del 100% mensual</span>
                            <span>{fmtPct(semana.aporteMesPct)}</span>
                          </div>
                          <div className="progress-bar">
                            <div
                              className="progress-fill is-month"
                              style={{ width: `${aporteMesPct}%` }}
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
                              <div
                                className="dias-row"
                                key={`${semana.label}-${ix}`}
                              >
                                <span>{d.fecha}</span>
                                <span>{fmtHours(d.horas)}</span>
                                <span>{fmtHours(d.metaDia)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      </div>
    </Modal>
  );
}
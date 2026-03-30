import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import { jfetch } from "./lib/api";
import "./CapacidadSemanalModal.css";

Modal.setAppElement("#root");

const nf = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

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

export default function CapacidadSemanalModal({
  isOpen,
  onClose,
  filtroEquipo,
  filtroConsultor,
  filtroMes,
  filtroAnio,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();
        if (filtroEquipo) qs.set("equipo", filtroEquipo);
        if (filtroConsultor) qs.set("consultor", filtroConsultor);
        if (filtroMes) qs.set("mes", String(filtroMes));
        if (filtroAnio) qs.set("anio", String(filtroAnio));

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
  }, [isOpen, filtroEquipo, filtroConsultor, filtroMes, filtroAnio]);

  const resumenGeneral = useMemo(() => {
    const totalMetaMes = rows.reduce((acc, r) => acc + Number(r.metaMes || 0), 0);
    const totalHorasMes = rows.reduce((acc, r) => acc + Number(r.horasMes || 0), 0);
    const totalDiff = totalMetaMes - totalHorasMes;
    const totalPct = totalMetaMes > 0 ? (totalHorasMes / totalMetaMes) * 100 : 0;

    return {
      totalMetaMes,
      totalHorasMes,
      totalDiff,
      totalPct,
    };
  }, [rows]);

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
              Seguimiento del porcentaje de llenado por semana frente a la meta mensual
              y la meta semanal calculada por horario.
            </p>
          </div>

          <button type="button" className="capacidad-close" onClick={onClose}>
            ✖
          </button>
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
        </div>

        <div className="capacidad-body">
          {loading && <div className="capacidad-state">Cargando capacidad semanal…</div>}
          {!loading && error && <div className="capacidad-state error">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="capacidad-state">No hay información para los filtros seleccionados.</div>
          )}

          {!loading &&
            !error &&
            rows.map((item, idx) => (
              <section className="capacidad-consultor" key={`${item.consultor}-${idx}`}>
                <div className="capacidad-consultor-head">
                  <div>
                    <h4>{item.consultor || "Sin nombre"}</h4>
                    <p>{item.equipo || "Sin equipo"}</p>
                  </div>

                  <div className="capacidad-consultor-stats">
                    <span>
                      <b>Mes:</b> {fmtHours(item.horasMes)} / {fmtHours(item.metaMes)}
                    </span>
                    <span className={`pill ${pctClass(item.porcentajeMes)}`}>
                      {fmtPct(item.porcentajeMes)}
                    </span>
                  </div>
                </div>

                <div className="capacidad-semanas-grid">
                  {(item.semanas || []).map((semana, i) => {
                    const semanalPct = Math.max(0, Math.min(100, Number(semana.porcentajeSemanal || 0)));
                    const aporteMesPct = Math.max(0, Math.min(100, Number(semana.aporteMesPct || 0)));

                    return (
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
                              className={`progress-fill ${pctClass(semana.porcentajeSemanal)}`}
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
                              <div className="dias-row" key={`${semana.label}-${ix}`}>
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
import React, { useMemo, useState } from 'react';
import Modal from 'react-modal';
import { agruparOcupaciones, ocupacionDeRegistro, resumirRegistros } from './consultorDetalle';

export default function ConsultorOcupacionesModal({ persona, rows, periodo, onClose }) {
  const [seleccion, setSeleccion] = useState(null);
  const ocupaciones = useMemo(() => agruparOcupaciones(rows), [rows]);
  const visibles = useMemo(() => rows.filter((r) => seleccion === null || seleccion.includes(ocupacionDeRegistro(r).key)), [rows, seleccion]);
  const resumen = useMemo(() => resumirRegistros(visibles), [visibles]);
  const porOcupacion = useMemo(() => agruparOcupaciones(visibles), [visibles]);
  const toggle = (key) => setSeleccion((prev) => {
    const keys = prev === null ? ocupaciones.map((o) => o.key) : prev;
    return keys.includes(key) ? keys.filter((v) => v !== key) : [...keys, key];
  });
  return (
    <Modal isOpen onRequestClose={onClose} contentLabel={`Ocupaciones de ${persona.nombre}`}
      className="pgx-modal-content pgx-consultor-modal" overlayClassName="pgx-modal-overlay"
      bodyOpenClassName="pgx-modal-body-open" htmlOpenClassName="pgx-modal-html-open"
      shouldReturnFocusAfterClose={false}>
      <header className="pgx-modal-header pgx-modal-header-gradient">
        <div><span className="pgx-detail-eyebrow">Detalle por consultor</span><h3 className="pgx-modal-title">{persona.nombre}</h3><p>{persona.usuario} · {periodo}</p></div>
        <button type="button" className="pgx-close-button" onClick={onClose} aria-label="Volver al equipo">×</button>
      </header>
      <div className="pgx-modal-body pgx-modal-body-scroll">
        <div className="pgx-consultor-kpis">
          <div><span>Horas registradas</span><strong>{resumen.horas.toFixed(2)} h</strong></div>
          <div><span>Registros</span><strong>{resumen.registros}</strong></div>
          <div><span>Casos cliente distintos</span><strong>{resumen.casosCliente}</strong><small>{resumen.registrosCliente} registros con caso</small></div>
          <div><span>Casos internos distintos</span><strong>{resumen.casosInterno}</strong><small>{resumen.registrosInterno} registros con caso</small></div>
        </div>
        <p className="pgx-detail-note">Datos del período y filtros aplicados en la gráfica. Cada identificador completo cuenta una vez en su campo; se omiten vacíos, 0 y N/A. Un caso repetido en varias ocupaciones cuenta una sola vez en el total general.</p>
        <section className="pgx-occupation-picker" aria-label="Seleccionar ocupaciones">
          <div className="pgx-detail-section-title"><h4>Ocupaciones registradas</h4><div><button type="button" onClick={() => setSeleccion(null)}>Seleccionar todas</button><button type="button" onClick={() => setSeleccion([])}>Quitar selección</button></div></div>
          <div className="pgx-occupation-options">{ocupaciones.map((o) => <label key={o.key}><input type="checkbox" checked={seleccion === null || seleccion.includes(o.key)} onChange={() => toggle(o.key)} /><span>{o.label}</span><small>{o.registros} registros</small></label>)}</div>
        </section>
        {rows.length === 0 ? <div className="pgx-empty">El consultor no tiene registros para los filtros aplicados.</div> : visibles.length === 0 ? <div className="pgx-empty">Selecciona una ocupación para calcular sus resultados.</div> : <>
          <h4>Resumen por ocupación</h4>
          <div className="pgx-table-responsive"><table className="pgx-detail-table"><thead><tr><th>Ocupación</th><th>Registros</th><th>Horas</th><th>Casos cliente distintos</th><th>Casos internos distintos</th></tr></thead><tbody>{porOcupacion.map((o) => <tr key={o.key}><td>{o.label}</td><td className="pgx-num">{o.registros}</td><td className="pgx-num">{o.horas.toFixed(2)}</td><td className="pgx-num">{o.casosCliente}</td><td className="pgx-num">{o.casosInterno}</td></tr>)}</tbody><tfoot><tr><th>Total general sin duplicar casos</th><td className="pgx-num">{resumen.registros}</td><td className="pgx-num">{resumen.horas.toFixed(2)}</td><td className="pgx-num">{resumen.casosCliente}</td><td className="pgx-num">{resumen.casosInterno}</td></tr></tfoot></table></div>
          <details className="pgx-source-details"><summary>Ver los {visibles.length} registros utilizados en el cálculo</summary><div className="pgx-table-responsive"><table className="pgx-detail-table"><thead><tr><th>ID</th><th>Fecha</th><th>Ocupación</th><th>Cliente</th><th>Nro. caso cliente</th><th>Nro. caso interno</th><th>Horas</th></tr></thead><tbody>{[...visibles].sort((a,b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.id)-Number(b.id)).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.fecha}</td><td>{ocupacionDeRegistro(r).label}</td><td>{r.cliente || '—'}</td><td>{r.nroCasoCliente || '—'}</td><td>{r.nroCasoInterno || '—'}</td><td className="pgx-num">{Number(r.tiempoInvertido || 0).toFixed(2)}</td></tr>)}</tbody></table></div></details>
        </>}
      </div>
      <footer className="pgx-modal-footer-total"><strong>Casos cliente + internos: {resumen.totalCasos}</strong><span className="pgx-detail-note">Los totales se recalculan al seleccionar ocupaciones.</span><button type="button" className="pgx-back-team" onClick={onClose}>← Volver al equipo</button></footer>
    </Modal>
  );
}

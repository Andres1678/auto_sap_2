import React, { useMemo, useState } from 'react';
import Modal from 'react-modal';
import { agruparCasos, agruparOcupaciones, ocupacionDeRegistro, resumirRegistros } from './consultorDetalle';

export default function ConsultorOcupacionesModal({ persona, rows, periodo, onClose }) {
  const [seleccion, setSeleccion] = useState(null);
  const ocupaciones = useMemo(() => agruparOcupaciones(rows), [rows]);
  const visibles = useMemo(() => rows.filter((r) => seleccion === null || seleccion.includes(ocupacionDeRegistro(r).key)), [rows, seleccion]);
  const resumen = useMemo(() => resumirRegistros(visibles), [visibles]);
  const porOcupacion = useMemo(() => agruparOcupaciones(visibles), [visibles]);
  const casosAgrupados = useMemo(() => [
    { titulo: 'Casos cliente', campo: 'nroCasoCliente', grupos: agruparCasos(visibles, 'nroCasoCliente') },
    { titulo: 'Casos internos', campo: 'nroCasoInterno', grupos: agruparCasos(visibles, 'nroCasoInterno') },
  ], [visibles]);
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
          <h4>Casos agrupados por número</h4>
          <p className="pgx-detail-note">Cada número aparece una sola vez en su tabla, con la suma de todas sus horas en las ocupaciones seleccionadas. Las dos tablas se calculan por separado: un registro puede tener caso cliente e interno, por lo que sus horas no se deben sumar entre tablas.</p>
          {casosAgrupados.map(({ titulo, campo, grupos }) => (
            <section key={campo} className="pgx-source-details" aria-label={titulo}>
              <h4 style={{ padding: '0 16px' }}>{titulo} · {grupos.length} números distintos</h4>
              {grupos.length === 0 ? <div className="pgx-empty">Sin casos válidos en este campo.</div> :
                <div className="pgx-table-responsive"><table className="pgx-detail-table">
                  <thead><tr><th>Número de caso</th><th>Clientes</th><th>Ocupaciones</th><th>Período registrado</th><th>Registros agrupados</th><th>Horas acumuladas</th></tr></thead>
                  <tbody>{grupos.map((g) => <tr key={g.numero}>
                    <td>{g.numero}</td><td>{g.clientes.join(', ') || '—'}</td><td>{g.ocupaciones.join(', ')}</td>
                    <td>{g.desde === g.hasta ? g.desde : `${g.desde} al ${g.hasta}`}</td>
                    <td className="pgx-num">{g.registros}</td><td className="pgx-num">{g.horas.toFixed(2)}</td>
                  </tr>)}</tbody>
                  <tfoot><tr><th colSpan={4}>Total de este campo</th><td className="pgx-num">{grupos.reduce((n,g) => n + g.registros, 0)}</td><td className="pgx-num">{grupos.reduce((n,g) => n + g.horas, 0).toFixed(2)}</td></tr></tfoot>
                </table></div>}
            </section>
          ))}
          <details className="pgx-source-details"><summary>Ver las {visibles.length} filas originales (sin agrupar)</summary><div className="pgx-table-responsive"><table className="pgx-detail-table"><thead><tr><th>ID</th><th>Fecha</th><th>Ocupación</th><th>Cliente</th><th>Nro. caso cliente</th><th>Nro. caso interno</th><th>Horas</th></tr></thead><tbody>{[...visibles].sort((a,b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.id)-Number(b.id)).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.fecha}</td><td>{ocupacionDeRegistro(r).label}</td><td>{r.cliente || '—'}</td><td>{r.nroCasoCliente || '—'}</td><td>{r.nroCasoInterno || '—'}</td><td className="pgx-num">{Number(r.tiempoInvertido || 0).toFixed(2)}</td></tr>)}</tbody></table></div></details>
        </>}
      </div>
      <footer className="pgx-modal-footer-total"><strong>Casos cliente + internos: {resumen.totalCasos}</strong><span className="pgx-detail-note">Los totales se recalculan al seleccionar ocupaciones.</span><button type="button" className="pgx-back-team" onClick={onClose}>← Volver al equipo</button></footer>
    </Modal>
  );
}

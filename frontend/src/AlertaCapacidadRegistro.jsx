import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { jfetch } from './lib/api';
import './AlertaCapacidadRegistro.css';

const CADA_DOS_HORAS = 2 * 60 * 60 * 1000;
const REVISAR_CADA = 5 * 60 * 1000;
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const fechaTexto = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

export default function AlertaCapacidadRegistro({ userData }) {
  const usuario = String(userData?.usuario ?? userData?.user?.usuario ?? '').trim().toLowerCase();
  const [datos, setDatos] = useState(null);
  const [visible, setVisible] = useState(false);
  const [detalle, setDetalle] = useState(false);
  const visibleRef = useRef(false);
  useEffect(() => {
    if (!usuario) return undefined;
    let vigente = true;
    let enCurso = false;
    let primeraConsulta = true;
    let controller = null;
    const key = `recordatorio-capacidad:${usuario}`;
    const leerUltimo = () => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } };
    let ultimo = leerUltimo();
    const consultar = async () => {
      if (!vigente || enCurso || document.visibilityState === 'hidden') return;
      enCurso = true;
      controller = new AbortController();
      try {
        const res = await jfetch('/registros/recordatorio-capacidad', { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!vigente || !Array.isArray(data?.pendientes)) return;
        setDatos(data);
        if (!data.tiene_pendientes) {
          visibleRef.current = false; setVisible(false);
        } else if (visibleRef.current || primeraConsulta || Date.now() - Math.max(ultimo, leerUltimo()) >= CADA_DOS_HORAS) {
          visibleRef.current = true; setVisible(true);
          if (primeraConsulta || Date.now() - ultimo >= CADA_DOS_HORAS) {
            ultimo = Date.now();
            try { localStorage.setItem(key, String(ultimo)); } catch {}
          }
        }
        primeraConsulta = false;
      } catch { /* Volver a consultar en la siguiente revisión sin interrumpir el registro. */ }
      finally { enCurso = false; }
    };
    visibleRef.current = false; setVisible(false); setDetalle(false);
    consultar();
    const timer = window.setInterval(consultar, REVISAR_CADA);
    const alVolver = () => { if (document.visibilityState === 'visible') consultar(); };
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('resumen-actualizar', consultar);
    return () => {
      vigente = false; controller?.abort(); window.clearInterval(timer);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('resumen-actualizar', consultar);
    };
  }, [usuario]);
  if (!visible || !datos?.tiene_pendientes) return null;
  const cerrar = () => { visibleRef.current = false; setVisible(false); setDetalle(false); };
  return <aside className='acr-alerta' role='status' aria-live='polite' aria-labelledby='acr-titulo'>
    <div className='acr-cabecera'><strong id='acr-titulo'>Tienes días pendientes por completar</strong>
      <button type='button' onClick={cerrar} aria-label='Cerrar recordatorio'>×</button></div>
    <p>Hay {datos.pendientes.length} días con registros faltantes o incompletos.</p>
    <div className='acr-metricas'>
      {[['Semana', datos.semana], ['Mes', datos.mes]].map(([titulo, r]) => <div key={titulo}>
        <strong>{titulo}: {numero.format(r.registradas)} / {numero.format(r.esperadas)} h</strong>
        <span>{r.dias_pendientes} días anteriores por completar · {numero.format(r.faltantes_vencidas)} h pendientes</span>
      </div>)}
    </div>
    <p className='acr-nota'>Solo se revisan días anteriores a hoy, sin fines de semana ni festivos de Colombia.</p>
    <div className='acr-acciones'>
      <Link to='/' onClick={cerrar}>Completar registros</Link>
      <button type='button' aria-expanded={detalle} onClick={() => setDetalle(v => !v)}>{detalle ? 'Ocultar días' : 'Ver días pendientes'}</button>
    </div>
    {detalle && <ul className='acr-dias'>{datos.pendientes.map(d => <li key={d.fecha}>
      <strong>{fechaTexto(d.fecha)}</strong><span>{d.sin_registro ? 'Sin registro' : `${numero.format(d.registradas)} / ${numero.format(d.esperadas)} h`} · faltan {numero.format(d.faltantes)} h</span>
    </li>)}</ul>}
  </aside>;
}

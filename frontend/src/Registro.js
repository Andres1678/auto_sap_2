import React, { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import Swal from 'sweetalert2';
import './Registro.css';

Modal.setAppElement('#root');

function initRegistro() {
  return {
    id: null,
    fecha: '',
    cliente: '',
    nroCasoCliente: '',
    nroCasoInterno: '',
    nroCasoEscaladoSap: '',
    tipoTarea: '',
    horaInicio: '',
    horaFin: '',
    tiempoInvertido: 0,
    actividadMalla: '',
    tiempoFacturable: '',
    horasAdicionales: '',
    oncall: '',
    desborde: '',
    descripcion: '',
    totalHoras: 0,
    modulo: ''
  };
}

/* ===== Helpers ===== */
const parseHHMM = (s) => {
  if (!s || typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
};
const parseRange = (range) => {
  if (!range || typeof range !== 'string' || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(range)) return null;
  const [ini, fin] = range.split('-');
  const a = parseHHMM(ini);
  const b = parseHHMM(fin);
  if (!a || !b) return null;
  if (b.h < a.h || (b.h === a.h && b.m <= a.m)) return null;
  return { ini: a, fin: b };
};
const toMinutes = ({ h, m }) => h * 60 + m;
const calcularTiempo = (inicio, fin) => {
  const a = parseHHMM(inicio);
  const b = parseHHMM(fin);
  if (!a || !b) return 0;
  const mins = (b.h * 60 + b.m) - (a.h * 60 + a.m);
  return mins > 0 ? parseFloat((mins / 60).toFixed(2)) : 0;
};
const calcularHorasAdicionales = (horaInicio, horaFin, horarioUsuario) => {
  const ini = parseHHMM(horaInicio);
  const fin = parseHHMM(horaFin);
  const rango = parseRange(horarioUsuario);
  if (!ini || !fin || !rango) return 'N/D';
  const start = toMinutes(ini);
  const end = toMinutes(fin);
  const inWorkStart = toMinutes(rango.ini);
  const inWorkEnd = toMinutes(rango.fin);
  return (start < inWorkStart || end > inWorkEnd) ? 'Sí' : 'No';
};
const asArray = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []);
function buildLocalResumen(registros, nombre) {
  if (!Array.isArray(registros)) return [];
  const byFecha = new Map();
  registros.forEach(r => {
    const fecha = r?.fecha;
    const horas = Number(r?.tiempoInvertido ?? 0);
    if (!fecha) return;
    byFecha.set(fecha, (byFecha.get(fecha) || 0) + (isNaN(horas) ? 0 : horas));
  });
  return Array.from(byFecha.entries()).map(([fecha, total]) => ({
    consultor: nombre || (registros[0]?.consultor ?? ''),
    fecha,
    total_horas: Math.round(total * 100) / 100,
    estado: total >= 9 ? 'Al día' : 'Incompleto'
  }));
}
/* módulos desde userData */
const getModulosLocal = (u) => {
  const arr = u?.modulos ?? u?.user?.modulos;
  if (Array.isArray(arr) && arr.length) return arr;
  const single = u?.modulo ?? u?.user?.modulo;
  return single ? [single] : [];
};

const Registro = ({ userData }) => {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [registros, setRegistros]   = useState([]);
  const [resumen, setResumen]       = useState([]);
  const [error, setError]           = useState('');

  const [registro, setRegistro] = useState(initRegistro());
  const [modoEdicion, setModoEdicion] = useState(false);

  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroTarea, setFiltroTarea] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');

  // Usuario
  const horarioUsuario = (userData?.horario ?? userData?.user?.horario ?? userData?.user?.horarioSesion ?? '');
  const rol = (userData?.rol ?? userData?.user?.rol);
  const nombreUser = (userData?.nombre ?? userData?.user?.nombre) || '';
  const moduloUser = (userData?.modulo ?? userData?.user?.modulo) || '';
  const equipoUser = (userData?.equipo ?? userData?.user?.equipo) || '';
  const usuarioLogin = (userData?.usuario ?? userData?.user?.usuario) || '';

  // ====== Reglas de equipo (tabla vs formulario) ======
  const userEquipoUpper = String(equipoUser || '').toUpperCase();
  const isAdmin = (rol === 'ADMIN' || rol === 'ADMIN_BASIS' || rol === 'ADMIN_FUNCIONAL');

  // El ADMIN puede cambiar la vista de la TABLA siempre.
  const initialVista = () => {
    const persisted = localStorage.getItem('equipoView');
    if (persisted === 'BASIS' || persisted === 'FUNCIONAL') return persisted;
    return (userEquipoUpper === 'BASIS') ? 'BASIS' : 'FUNCIONAL';
  };
  const [vistaEquipo, setVistaEquipo] = useState(initialVista);
  useEffect(() => { localStorage.setItem('equipoView', vistaEquipo); }, [vistaEquipo]);

  // Tabla: usa toggle si ADMIN, si no, el del usuario
  const isBASISTable = isAdmin ? (vistaEquipo === 'BASIS') : (userEquipoUpper === 'BASIS');
  const isFUNCIONALTable = !isBASISTable;

  // Formulario:
  // - Si ADMIN con equipo BASIS o FUNCIONAL asignado -> el form se bloquea a ese equipo.
  // - Si ADMIN TRANSVERSAL (o cualquier otro) -> el form sigue el toggle.
  const adminBloqueadoPorEquipo =
    isAdmin && (userEquipoUpper === 'BASIS' || userEquipoUpper === 'FUNCIONAL');
  const equipoFormulario = adminBloqueadoPorEquipo
    ? userEquipoUpper
    : (isAdmin ? vistaEquipo : (userEquipoUpper === 'BASIS' ? 'BASIS' : 'FUNCIONAL'));

  const isBASISForm = (equipoFormulario === 'BASIS');
  const isFUNCIONALForm = (equipoFormulario === 'FUNCIONAL');

  // Módulos
  const [modulos, setModulos] = useState(getModulosLocal(userData));
  const [moduloElegido, setModuloElegido] = useState('');
  useEffect(() => {
    const locals = getModulosLocal(userData);
    setModulos(locals);
    setModuloElegido(locals.length === 1 ? locals[0] : '');
  }, [userData]);

  // Si no llegaron módulos, intenta obtenerlos al abrir el modal
  useEffect(() => {
    const needFetch = modalIsOpen && usuarioLogin && modulos.length <= 1;
    if (!needFetch) return;
    (async () => {
      try {
        const r = await fetch(`http://localhost:5000/api/consultores/modulos?usuario=${encodeURIComponent(usuarioLogin)}`);
        const j = await r.json().catch(()=>({}));
        if (r.ok && Array.isArray(j?.modulos) && j.modulos.length) {
          setModulos(j.modulos);
          if (j.modulos.length === 1) setModuloElegido(j.modulos[0]);
        }
      } catch {}
    })();
  }, [modalIsOpen, usuarioLogin, modulos.length]);

  // Catálogos
  const clientes = [
    'AIRE - Air-e','ALUMINA','ANTILLANA','AVIANCA','ANABA','CAMARA DE COMERCIO','CEET-EL TIEMPO',
    'CERAMICA ITALIA','CERESCOS','CLARO ANDINA','CLARO COLOMBIA','COLSUBSIDIO','COMFENALCO CARTAGENA',
    'COOLECHERA','CRYSTAL S.A.S','DON POLLO','EMI','ETERNA','EVOAGRO','FABRICATO',
    'FUNDACION GRUPO SANTANDER','HACEB','HITSS/CLARO','ILUMNO','JGB','LACTALIS',
    'PRND-PROINDESA','PROCAPS','SATENA','STOP JEANS','TINTATEX','UNIBAN','GREELAND',
    'TRIPLE AAA','ESENTIA','COLPENSIONES','VANTI','COOSALUD','FEDERACION NACIONAL DE CAFETEROS','SURA'
  ];
  const tiposTarea = [
    '01 - Atencion Casos','02 - Atencion de Casos VAR','03 - Atencion de Proyectos','04- Apoyo Preventa','05 - Generacion Informes',
    '06 - Seguimiento y Supervision Equipo','07 - Reuniones Internas','08 - Seguimiento de Casos internos','09 - Capacitaciones',
    '10 - Reporte Hots','11 - Reporte Azure','12 - Reporte Tiempo consumido (Lista-Sharepoint)','13 - Pausas Activas',
    '14 -  Permisos por horas / Dia Familia / Cumpleaños','15 - Vacaciones / Incapacidades','16 - DIA NO LABORAL','17 - Proyectos Internos',
    '18 - DISPONIBLE','19 - Hora de traslado Triara a Casa','20 - Cambios','21 - Monitoreo','22 - Reunión Cliente','23 - Atención SOX',
    '24 - Outlook - Teams','25 - NO DILIGENCIO','26 - Reuniones Externas','27 - Daily','28 - KickOff','29 - Handover','30 - Seguimiento Proyecto',
    '31 - Gestión Documental Operación','32 - Gestión Documental Proyectos','33 - Elaboración de Oferta','34 - Actualización Tableros',
    '35 - Gestion Documental','36 - Levantamiento de Información'
  ];
  const actividadMalla = ['AC','CRU1','CRU2','CRU3','DC','DE','DF','IN','ON','T1E','T1I','T1X','T2E','T2I','T2X','T3','VC','N/APLICA'];
  const oncall = ['SI','NO','N/A'];
  const desborde = ['SI','NO','N/A'];

  // Fetch de datos
  const fetchRegistros = async () => {
    setError('');
    try {
      const res = await fetch('http://localhost:5000/api/registros', {
        method: isAdmin ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isAdmin ? { 'X-User-Rol': 'ADMIN' } : {})
        },
        ...(isAdmin ? {} : { body: JSON.stringify({ rol, nombre: nombreUser }) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);
      setRegistros(asArray(data));
    } catch (e) {
      setRegistros([]);
      setError(String(e.message || e));
    }
  };
  const fetchResumen = async () => {
    if (!isAdmin) { setResumen([]); return; }
    setError('');
    try {
      const res = await fetch('http://localhost:5000/api/resumen-horas', {
        headers: { 'X-User-Rol': 'ADMIN' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);
      setResumen(asArray(data));
    } catch (e) {
      setResumen([]);
      setError(String(e.message || e));
    }
  };
  useEffect(() => {
    const hasId = (userData && (userData.id || userData?.user?.id));
    if (hasId) {
      fetchRegistros();
      fetchResumen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Filtros/Resumen memo
  const consultoresUnicos = useMemo(() =>
    Array.isArray(registros)
      ? [...new Set(registros.map(r => r?.consultor).filter(Boolean))]
      : []
  , [registros]);
  const registrosFiltrados = useMemo(() => (
    Array.isArray(registros)
      ? registros.filter((r) => (
          (!filtroFecha || r.fecha === filtroFecha) &&
          (!filtroCliente || r.cliente === filtroCliente) &&
          (!filtroTarea || r.tipoTarea === filtroTarea) &&
          (!filtroConsultor || r.consultor === filtroConsultor)
        ))
      : []
  ), [registros, filtroFecha, filtroCliente, filtroTarea, filtroConsultor]);
  const resumenVisible = useMemo(() => (
    isAdmin ? resumen : buildLocalResumen(registros, nombreUser)
  ), [isAdmin, resumen, registros, nombreUser]);

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!registro.horaInicio || !registro.horaFin) {
      return Swal.fire({ icon: 'warning', title: 'Completa las horas de inicio y fin' });
    }
    const tiempo = calcularTiempo(registro.horaInicio, registro.horaFin);
    if (tiempo <= 0) {
      return Swal.fire({ icon: 'error', title: 'Hora fin debe ser mayor a inicio' });
    }
    const horasAdic = calcularHorasAdicionales(
      registro.horaInicio,
      registro.horaFin,
      /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(horarioUsuario) ? horarioUsuario : null
    );
    const moduloFinal = (moduloElegido || modulos[0] || moduloUser || '').trim();

    const base = {
      ...registro,
      tiempoInvertido: tiempo,
      horasAdicionales: horasAdic,
      modulo: moduloFinal,
      consultor: nombreUser,
      totalHoras: tiempo,
      rol
    };

    // Limpia campos de BASIS si el formulario es FUNCIONAL
    const payload = { ...base };
    if (!isBASISForm) {
      delete payload.nroCasoEscaladoSap;
      delete payload.actividadMalla;
      delete payload.oncall;
      delete payload.desborde;
    }

    try {
      const url = modoEdicion
        ? `http://localhost:5000/api/editar-registro/${registro.id}`
        : 'http://localhost:5000/api/registrar-hora';
      const method = modoEdicion ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await resp.json().catch(()=> ({}));
      if (!resp.ok) throw new Error(j?.mensaje || `HTTP ${resp.status}`);

      Swal.fire({ icon: 'success', title: modoEdicion ? 'Registro actualizado' : 'Registro guardado' });
      fetchRegistros();
      if (isAdmin) fetchResumen();
      setRegistro(initRegistro());
      setModuloElegido(modulos.length === 1 ? modulos[0] : '');
      setModoEdicion(false);
      setModalIsOpen(false);
    } catch (e) {
      Swal.fire({ icon: 'error', title: String(e.message || e) });
    }
  };

  const handleEditar = (reg) => {
    setRegistro({ ...initRegistro(), ...reg });
    if (reg?.modulo) {
      setModuloElegido(reg.modulo);
    } else if (modulos.length === 1) {
      setModuloElegido(modulos[0]);
    } else {
      setModuloElegido('');
    }
    setModoEdicion(true);
    setModalIsOpen(true);
  };

  const handleEliminar = async (id) => {
    const res = await Swal.fire({
      title: '¿Seguro?',
      text: '¡No podrás revertir esto!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (res.isConfirmed) {
      const resp = await fetch(`http://localhost:5000/api/eliminar-registro/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol, nombre: nombreUser })
      });
      if (!resp.ok) {
        const j = await resp.json().catch(()=> ({}));
        return Swal.fire({ icon:'error', title: j?.mensaje || `HTTP ${resp.status}` });
      }
      Swal.fire({ icon:'success', title:'Eliminado' });
      fetchRegistros();
      if (isAdmin) fetchResumen();
    }
  };

  const handleCopiar = (reg) => {
    const copia = { ...reg };
    delete copia.id;
    setRegistro({ ...initRegistro(), ...copia });
    setModuloElegido(reg?.modulo || (modulos.length === 1 ? modulos[0] : ''));
    setModoEdicion(false);
    setModalIsOpen(true);
  };

  const toggleBloqueado = async (id) => {
    try {
      const resp = await fetch(`http://localhost:5000/api/toggle-bloqueado/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol })
      });
      if (!resp.ok) throw new Error((await resp.json().catch(()=>({})))?.mensaje || `HTTP ${resp.status}`);
      fetchRegistros();
    } catch (e) {
      console.error('Error al actualizar estado de bloqueo', e);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div className="page-title">
          <h2>Registro de Horas</h2>
          <p className="subtitle">Filtra por fecha, cliente, tarea o consultor</p>
        </div>
        <div className="page-actions" style={{display:'flex', gap:12, alignItems:'center'}}>
          {isAdmin && (
            <div className="team-toggle" role="tablist" aria-label="Vista por equipo">
              <button
                type="button"
                className={`team-btn ${isBASISTable ? 'is-active' : ''}`}
                onClick={() => setVistaEquipo('BASIS')}
                aria-selected={isBASISTable}
              >
                BASIS
              </button>
              <button
                type="button"
                className={`team-btn ${isFUNCIONALTable ? 'is-active' : ''}`}
                onClick={() => setVistaEquipo('FUNCIONAL')}
                aria-selected={isFUNCIONALTable}
              >
                FUNCIONAL
              </button>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={() => { setModalIsOpen(true); setModoEdicion(false); setRegistro(initRegistro()); setModuloElegido(modulos.length === 1 ? modulos[0] : ''); }}
          >
            Agregar Registro
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-card">
        <div className="filter-grid">
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
          </select>
          <select
            value={filtroTarea}
            onChange={(e) => setFiltroTarea(e.target.value)}
          >
            <option value="">Todas las tareas</option>
            {tiposTarea.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
          </select>
          <select
            value={filtroConsultor}
            onChange={(e) => setFiltroConsultor(e.target.value)}
          >
            <option value="">Todos los consultores</option>
            {consultoresUnicos.map((c, idx) => (
              <option key={idx} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button
            className="btn btn-outline"
            onClick={() => {
              setFiltroFecha('');
              setFiltroCliente('');
              setFiltroTarea('');
              setFiltroConsultor('');
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => setModalIsOpen(false)}
        className="modal-content"
        overlayClassName="modal-overlay"
        contentLabel="Registro"
      >
        <div>
          <div className="modal-header">
            <h3 className="modal-title">{modoEdicion ? 'Editar Registro' : 'Nuevo Registro'}</h3>
            <button className="close-button" onClick={() => setModalIsOpen(false)} aria-label="Cerrar">✖</button>
          </div>

          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                {/* Módulo: select si 2+; readOnly si 1 */}
                {modulos.length > 1 ? (
                  <select
                    value={moduloElegido}
                    onChange={(e) => { setModuloElegido(e.target.value); setRegistro(r => ({ ...r, modulo: e.target.value })); }}
                    required
                  >
                    <option value="">Seleccionar Módulo</option>
                    {modulos.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={modulos[0] || ''}
                    readOnly
                    placeholder="Módulo"
                  />
                )}

                {/* Comunes */}
                <input
                  type="date"
                  value={registro.fecha}
                  onChange={(e) => setRegistro({ ...registro, fecha: e.target.value })}
                  required
                />
                <select
                  value={registro.cliente}
                  onChange={(e) => setRegistro({ ...registro, cliente: e.target.value })}
                  required
                >
                  <option value="">Seleccionar Cliente</option>
                  {clientes.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Nro Caso Cliente"
                  value={registro.nroCasoCliente}
                  onChange={(e) => setRegistro({ ...registro, nroCasoCliente: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Nro Caso Interno"
                  value={registro.nroCasoInterno}
                  onChange={(e) => setRegistro({ ...registro, nroCasoInterno: e.target.value })}
                />
                <select
                  value={registro.tipoTarea}
                  onChange={(e) => setRegistro({ ...registro, tipoTarea: e.target.value })}
                  required
                >
                  <option value="">Seleccionar Tarea Azure</option>
                  {tiposTarea.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                </select>
                <div className="inline-2">
                  <input
                    type="time"
                    value={registro.horaInicio}
                    onChange={(e) => setRegistro({ ...registro, horaInicio: e.target.value })}
                    required
                  />
                  <input
                    type="time"
                    value={registro.horaFin}
                    onChange={(e) => setRegistro({ ...registro, horaFin: e.target.value })}
                    required
                  />
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Tiempo Facturable"
                  value={registro.tiempoFacturable}
                  onChange={(e) => setRegistro({ ...registro, tiempoFacturable: e.target.value })}
                />

                {/* === SOLO BASIS (en FORM segun equipoFormulario) === */}
                {isBASISForm && (
                  <>
                    <input
                      type="text"
                      placeholder="Nro Caso Escalado SAP"
                      value={registro.nroCasoEscaladoSap}
                      onChange={(e) => setRegistro({ ...registro, nroCasoEscaladoSap: e.target.value })}
                    />
                    <select
                      value={registro.actividadMalla}
                      onChange={(e) => setRegistro({ ...registro, actividadMalla: e.target.value })}
                    >
                      <option value="">Seleccionar Actividad de Malla</option>
                      {actividadMalla.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={registro.oncall}
                      onChange={(e) => setRegistro({ ...registro, oncall: e.target.value })}
                    >
                      <option value="">ONCALL</option>
                      {oncall.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={registro.desborde}
                      onChange={(e) => setRegistro({ ...registro, desborde: e.target.value })}
                    >
                      <option value="">Desborde</option>
                      {desborde.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                    </select>
                  </>
                )}

                {/* === SOLO FUNCIONAL: añade aquí si hay campos exclusivos === */}
                {isFUNCIONALForm && <></>}

                <textarea
                  placeholder="Descripción"
                  value={registro.descripcion}
                  onChange={(e) => setRegistro({ ...registro, descripcion: e.target.value })}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalIsOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{modoEdicion ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      {/* Tabla principal */}
      <div className="table-wrap">
        <div className="table-scroll sticky-actions">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Módulo</th>
                <th>Cliente</th>
                <th>Nro. Caso Cliente</th>
                <th>Nro. Caso Interno</th>
                {isBASISTable && <th>Nro. Caso Escalado SAP</th>}
                <th>Tipo Tarea Azure</th>
                <th>Consultor</th>
                <th>Hora Inicio</th>
                <th>Hora Fin</th>
                <th className="num">Tiempo Invertido</th>
                <th className="num">Tiempo Facturable</th>
                {isBASISTable && <th>ONCALL</th>}
                {isBASISTable && <th>Desborde</th>}
                <th>Horas Adicionales</th>
                <th className="truncate">Descripción</th>
                <th className="actions">Acciones</th>
                {isAdmin && <th>Bloqueado</th>}
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha}</td>
                  <td>{r.modulo ?? moduloUser}</td>
                  <td>{r.cliente}</td>
                  <td>{r.nroCasoCliente}</td>
                  <td>{r.nroCasoInterno}</td>
                  {isBASISTable && <td>{r.nroCasoEscaladoSap}</td>}
                  <td>{r.tipoTarea}</td>
                  <td>{r.consultor ?? nombreUser}</td>
                  <td>{r.horaInicio}</td>
                  <td>{r.horaFin}</td>
                  <td className="num">{r.tiempoInvertido}</td>
                  <td className="num">{r.tiempoFacturable}</td>
                  {isBASISTable && <td>{r.oncall}</td>}
                  {isBASISTable && <td>{r.desborde}</td>}
                  <td>{r.horasAdicionales}</td>
                  <td className="truncate" title={r.descripcion}>{r.descripcion}</td>
                  <td className="actions">
                    <button className="icon-btn" onClick={() => handleEditar(r)} disabled={r.bloqueado} title="Editar">✏️</button>
                    <button className="icon-btn danger" onClick={() => handleEliminar(r.id)} disabled={r.bloqueado} title="Eliminar">🗑️</button>
                    <button className="icon-btn" onClick={() => handleCopiar(r)} title="Copiar">📋</button>
                  </td>
                  {isAdmin && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!!r.bloqueado}
                        onChange={() => toggleBloqueado(r.id)}
                        aria-label="Bloquear/Desbloquear fila"
                      />
                    </td>
                  )}
                </tr>
              ))}
              {!registrosFiltrados.length && (
                <tr><td colSpan={isAdmin ? 17 : 16} className="muted">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mensaje de error global */}
      {error && <div style={{color:'crimson', marginTop:10}}>Error: {error}</div>}

      {/* Resumen */}
      <h3>Resumen de Horas</h3>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Fecha</th>
                <th className="num">Total Horas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(resumenVisible) ? resumenVisible : []).map((r, idx) => (
                <tr key={idx}>
                  <td>{r.consultor}</td>
                  <td>{r.fecha}</td>
                  <td className="num">{r.total_horas}</td>
                  <td>
                    <span className={`badge ${
                      r.estado === 'Al día' ? 'badge-success'
                      : r.estado === 'Incompleto' ? 'badge-warning'
                      : 'badge-danger'
                    }`}>
                      {r.estado}
                    </span>
                  </td>
                </tr>
              ))}
              {!resumenVisible?.length && (
                <tr><td colSpan={4} className="muted">Sin datos de resumen</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Registro;

import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./OcupacionesTareasPage.css";
import { jfetch } from "./lib/api";

export default function OcupacionesTareasPage() {
  const [ocupaciones, setOcupaciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [selectedOcupacion, setSelectedOcupacion] = useState(null);
  const [tareasOcupacion, setTareasOcupacion] = useState([]);

  const [loading, setLoading] = useState(false);

  // Formularios
  const [formOcupacion, setFormOcupacion] = useState({
    id: null,
    codigo: "",
    nombre: "",
    descripcion: "",
  });

  const [formTarea, setFormTarea] = useState({
    id: null,
    codigo: "",
    nombre: "",
    descripcion: "",
  });

  const [tareaAsignarId, setTareaAsignarId] = useState("");

  // ==========================
  // CARGA INICIAL
  // ==========================
  useEffect(() => {
    cargarOcupaciones();
    cargarTareas();
  }, []);

  useEffect(() => {
    if (selectedOcupacion) {
      cargarTareasPorOcupacion(selectedOcupacion.id);
    } else {
      setTareasOcupacion([]);
    }
  }, [selectedOcupacion]);

  // ==========================
  // API — CARGAS GENERALES
  // ==========================
  const cargarOcupaciones = async () => {
    try {
      const res = await jfetch(`/ocupaciones`);
      const data = await res.json();
      setOcupaciones(data || []);

      if (!selectedOcupacion && data.length > 0) {
        setSelectedOcupacion(data[0]);
      }
    } catch (err) {
      Swal.fire("Error", "No se pudieron cargar las ocupaciones", "error");
    }
  };

  const cargarTareas = async () => {
    try {
      const res = await jfetch(`/tareas`);
      const data = await res.json();
      setTareas(data || []);
    } catch (err) {
      Swal.fire("Error", "No se pudieron cargar las tareas", "error");
    }
  };

  const cargarTareasPorOcupacion = async (id) => {
    try {
      const res = await jfetch(`/ocupaciones/${id}/tareas`);
      const data = await res.json();
      setTareasOcupacion(data || []);
    } catch (err) {
      Swal.fire("Error", "No se pudieron cargar las tareas de la ocupación", "error");
    }
  };

  // ==========================
  // CRUD OCUPACIONES
  // ==========================
  const limpiarFormOcupacion = () => {
    setFormOcupacion({
      id: null,
      codigo: "",
      nombre: "",
      descripcion: "",
    });
  };

  const editarOcupacion = (oc) => {
    setFormOcupacion({
      id: oc.id,
      codigo: oc.codigo,
      nombre: oc.nombre,
      descripcion: oc.descripcion || "",
    });
    setSelectedOcupacion(oc);
  };

  const guardarOcupacion = async (e) => {
    e.preventDefault();
    const { id, codigo, nombre, descripcion } = formOcupacion;

    if (!codigo.trim() || !nombre.trim()) {
      Swal.fire("Campos requeridos", "Código y nombre son obligatorios", "warning");
      return;
    }

    setLoading(true);
    try {
      const payload = { codigo, nombre, descripcion };
      const method = id ? "PUT" : "POST";
      const url = id
        ? `/ocupaciones/${id}`
        : `/ocupaciones`;

      const res = await jfetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Éxito", data.mensaje, "success");
      limpiarFormOcupacion();
      await cargarOcupaciones();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const eliminarOcupacion = async (oc) => {
    const confirm = await Swal.fire({
      title: `¿Eliminar ocupación "${oc.nombre}"?`,
      text: "Se perderán sus relaciones con tareas.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await jfetch(`/ocupaciones/${oc.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Eliminada", data.mensaje, "success");

      if (selectedOcupacion?.id === oc.id) {
        setSelectedOcupacion(null);
        setTareasOcupacion([]);
      }

      await cargarOcupaciones();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  // ==========================
  // CRUD TAREAS
  // ==========================
  const limpiarFormTarea = () => {
    setFormTarea({ id: null, codigo: "", nombre: "", descripcion: "" });
  };

  const editarTarea = (t) => {
    setFormTarea({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion || "",
    });
  };

  const guardarTarea = async (e) => {
    e.preventDefault();

    const { id, codigo, nombre, descripcion } = formTarea;

    if (!codigo.trim() || !nombre.trim()) {
      Swal.fire("Campos requeridos", "Código y nombre son obligatorios", "warning");
      return;
    }

    setLoading(true);
    try {
      const payload = { codigo, nombre, descripcion };
      const method = id ? "PUT" : "POST";
      const url = id ? `/tareas/${id}` : `/tareas`;

      const res = await jfetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Éxito", data.mensaje, "success");
      limpiarFormTarea();
      await cargarTareas();

      if (selectedOcupacion) {
        await cargarTareasPorOcupacion(selectedOcupacion.id);
      }
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const eliminarTarea = async (t) => {
    const confirm = await Swal.fire({
      title: `¿Eliminar tarea "${t.nombre}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await jfetch(`/tareas/${t.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Eliminada", data.mensaje, "success");

      await cargarTareas();
      if (selectedOcupacion) {
        await cargarTareasPorOcupacion(selectedOcupacion.id);
      }
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  // ==========================
  // RELACIÓN OCUPACIÓN ↔ TAREAS
  // ==========================
  const asignarTareaAOcupacion = async () => {
    if (!selectedOcupacion) {
      Swal.fire("Ocupación requerida", "Seleccione primero una ocupación", "warning");
      return;
    }

    if (!tareaAsignarId) {
      Swal.fire("Tarea requerida", "Seleccione una tarea", "warning");
      return;
    }

    if (!tareasNoAsignadas.some(t => t.id === Number(tareaAsignarId))) {
      Swal.fire(
        "No permitido",
        "Esta tarea ya está asignada a la ocupación",
        "warning"
      );
      return;
    }

    try {
      const res = await jfetch(
        `/ocupaciones/${selectedOcupacion.id}/tareas`,
        {
          method: "POST",
          body: JSON.stringify({ tarea_id: Number(tareaAsignarId) }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Listo", data.mensaje, "success");

      setTareaAsignarId("");
      await cargarTareasPorOcupacion(selectedOcupacion.id);
    } catch (err) {
      Swal.fire("Error", err.mensaje, "error");
    }
  };

  const quitarTareaDeOcupacion = async (id) => {
    const tarea = tareasOcupacion.find((t) => t.id === id);

    const confirm = await Swal.fire({
      title: `¿Quitar "${tarea?.nombre}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Quitar",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await jfetch(
        `/ocupaciones/${selectedOcupacion.id}/tareas/${id}`,
        { method: "DELETE" }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);

      Swal.fire("Listo", data.mensaje, "success");
      await cargarTareasPorOcupacion(selectedOcupacion.id);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  // Lista de tareas NO asignadas
  const tareasNoAsignadas = tareas.filter(
    (t) => !tareasOcupacion.some((ta) => ta.id === t.id)
  );

  // ==========================
  // RENDER UI
  // ==========================
  return (
    <div className="ocp-wrapper">

      {/* Header */}
      <div className="ocp-header">
        <h1>🧩 Ocupaciones & Tareas</h1>
        <p>Gestiona qué tareas pertenecen a cada ocupación.</p>
      </div>

      <div className="ocp-layout">

        {/* COLUMNA IZQUIERDA */}
        <div className="ocp-left">
          <div className="ocp-panel">

            <div className="ocp-panel-header">
              <h2>Ocupaciones</h2>
              <button className="ocp-btn ocp-btn-secondary" onClick={limpiarFormOcupacion}>
                Nueva
              </button>
            </div>

            {/* Lista de ocupaciones */}
            <ul className="ocp-list">
              {ocupaciones.map((oc) => (
                <li
                  key={oc.id}
                  className={
                    selectedOcupacion?.id === oc.id
                      ? "ocp-list-item ocp-list-item--active"
                      : "ocp-list-item"
                  }
                  onClick={() => setSelectedOcupacion(oc)}
                >
                  <div className="ocp-list-main">
                    <span className="ocp-list-code">{oc.codigo}</span>
                    <span className="ocp-list-name">{oc.nombre}</span>
                  </div>

                  <div className="ocp-list-actions">
                    <button
                      className="ocp-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        editarOcupacion(oc);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="ocp-link ocp-link-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarOcupacion(oc);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}

              {ocupaciones.length === 0 && (
                <li className="ocp-list-empty">No hay ocupaciones registradas.</li>
              )}
            </ul>

            {/* Form ocupación */}
            <form className="ocp-form" onSubmit={guardarOcupacion}>
              <h3>{formOcupacion.id ? "Editar Ocupación" : "Nueva Ocupación"}</h3>

              <label>Código</label>
              <input
                type="text"
                value={formOcupacion.codigo}
                onChange={(e) =>
                  setFormOcupacion({ ...formOcupacion, codigo: e.target.value })
                }
              />

              <label>Nombre</label>
              <input
                type="text"
                value={formOcupacion.nombre}
                onChange={(e) =>
                  setFormOcupacion({ ...formOcupacion, nombre: e.target.value })
                }
              />

              <label>Descripción</label>
              <textarea
                rows={3}
                value={formOcupacion.descripcion}
                onChange={(e) =>
                  setFormOcupacion({ ...formOcupacion, descripcion: e.target.value })
                }
              />

              <button className="ocp-btn ocp-btn-primary" disabled={loading}>
                {loading
                  ? "Guardando…"
                  : formOcupacion.id
                  ? "Actualizar"
                  : "Crear"}
              </button>
            </form>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="ocp-right">
          <div className="ocp-panel">

            <div className="ocp-panel-header">
              <h2>
                {selectedOcupacion
                  ? `Tareas de: ${selectedOcupacion.nombre}`
                  : "Selecciona una ocupación"}
              </h2>
            </div>

            {/* Tareas asignadas */}
            <div className="ocp-section">
              <h3>Tareas asignadas</h3>

              <div className="ocp-chips">
                {tareasOcupacion.length > 0 ? (
                  tareasOcupacion.map((t) => (
                    <div key={t.id} className="ocp-chip">
                      <span className="ocp-chip-code">{t.codigo}</span>
                      <span className="ocp-chip-name">{t.nombre}</span>
                      <button
                        className="ocp-chip-remove"
                        onClick={() => quitarTareaDeOcupacion(t.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="ocp-hint">
                    {selectedOcupacion
                      ? "Esta ocupación aun no tiene tareas asignadas."
                      : "Selecciona una ocupación."}
                  </p>
                )}
              </div>
            </div>

            {/* Asignar tarea */}
            {selectedOcupacion && tareasNoAsignadas.length > 0 && (
              <div className="ocp-section">
                <h3>Asignar tarea</h3>

                <div className="ocp-inline">
                  <select
                    value={tareaAsignarId}
                    onChange={(e) => setTareaAsignarId(e.target.value)}
                  >
                    <option value="">Seleccionar tarea…</option>

                    {tareasNoAsignadas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} – {t.nombre}
                      </option>
                    ))}
                  </select>

                  <button
                    className="ocp-btn ocp-btn-primary"
                    onClick={asignarTareaAOcupacion}
                  >
                    Asignar
                  </button>
                </div>

                <p className="ocp-hint">
                  Solo se muestran tareas no asignadas a esta ocupación.
                </p>
              </div>
            )}

            {selectedOcupacion && tareasNoAsignadas.length === 0 && (
              <div className="ocp-section">
                <p className="ocp-hint">
                  ✅ Todas las tareas ya están asignadas a esta ocupación.
                </p>
              </div>
            )}


            {/* CRUD TAREAS */}
            <div className="ocp-section">
              <div className="ocp-panel-header">
                <h3>Catálogo de tareas</h3>
                <button className="ocp-btn ocp-btn-secondary" onClick={limpiarFormTarea}>
                  Nueva tarea
                </button>
              </div>

              <div className="ocp-tasks-list">
                {tareas.map((t) => (
                  <div key={t.id} className="ocp-task-row">
                    <div className="ocp-task-main">
                      <span className="ocp-task-code">{t.codigo}</span>
                      <span className="ocp-task-name">{t.nombre}</span>
                    </div>

                    <div className="ocp-task-actions">
                      <button className="ocp-link" onClick={() => editarTarea(t)}>
                        Editar
                      </button>
                      <button
                        className="ocp-link ocp-link-danger"
                        onClick={() => eliminarTarea(t)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}

                {tareas.length === 0 && (
                  <p className="ocp-hint">Aún no hay tareas registradas.</p>
                )}
              </div>

              {/* Form tarea */}
              <form className="ocp-form" onSubmit={guardarTarea}>
                <h4>{formTarea.id ? "Editar tarea" : "Nueva tarea"}</h4>

                <label>Código</label>
                <input
                  type="text"
                  value={formTarea.codigo}
                  onChange={(e) =>
                    setFormTarea({ ...formTarea, codigo: e.target.value })
                  }
                />

                <label>Nombre</label>
                <input
                  type="text"
                  value={formTarea.nombre}
                  onChange={(e) =>
                    setFormTarea({ ...formTarea, nombre: e.target.value })
                  }
                />

                <label>Descripción</label>
                <textarea
                  rows={3}
                  value={formTarea.descripcion}
                  onChange={(e) =>
                    setFormTarea({ ...formTarea, descripcion: e.target.value })
                  }
                />

                <button className="ocp-btn ocp-btn-primary" disabled={loading}>
                  {loading
                    ? "Guardando…"
                    : formTarea.id
                    ? "Actualizar"
                    : "Crear"}
                </button>
              </form>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

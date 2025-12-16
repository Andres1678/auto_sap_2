import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./EquiposPage.css";
import { API_URL } from "../src/config.js";

/* ============================================================
   COMPONENTE MODAL (Unificado en este archivo)
============================================================== */
function EquipoModal({
  open,
  title,
  value,
  setValue,
  onClose,
  onConfirm,
  confirmText = "Guardar",
}) {
  if (!open) return null;

  return (
    <div className="emodal-overlay">
      <div className="emodal-content scaleFade">
        <h2 className="emodal-title">{title}</h2>

        <input
          type="text"
          className="emodal-input"
          placeholder="Nombre del equipo..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <div className="emodal-buttons">
          <button className="emodal-btn cancel" onClick={onClose}>
            Cancelar
          </button>

          <button className="emodal-btn confirm" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PÁGINA PRINCIPAL
============================================================== */
export default function EquiposPage() {
  const [equipos, setEquipos] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [selectedEquipo, setSelectedEquipo] = useState(null);
  const [selectedConsultor, setSelectedConsultor] = useState("");

  const [nuevoEquipo, setNuevoEquipo] = useState("");
  const [editNombre, setEditNombre] = useState("");

  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  const userData = JSON.parse(localStorage.getItem("userData") || "{}");

  const api = (endpoint, options = {}) =>
    fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-User-Usuario": userData.usuario,
        "X-User-Rol": userData.rol,
      },
    });

  /* ============================================================
     CARGA INICIAL
  ============================================================ */
  const loadEquipos = async () => {
    const res = await api("/equipos");
    const data = await res.json();
    setEquipos(data);
  };

  const loadConsultores = async () => {
    const res = await api("/consultores");
    const data = await res.json();
    setConsultores(data);
  };

  useEffect(() => {
    loadEquipos();
    loadConsultores();
  }, []);

  /* ============================================================
     CREAR EQUIPO
  ============================================================ */
  const confirmarCrear = async () => {
    if (!nuevoEquipo.trim())
      return Swal.fire("Error", "Ingrese un nombre para el equipo", "warning");

    const res = await api("/equipos", {
      method: "POST",
      body: JSON.stringify({ nombre: nuevoEquipo }),
    });

    const data = await res.json();
    if (!res.ok) return Swal.fire("Error", data.mensaje, "error");

    Swal.fire("✔ Equipo creado", "", "success");
    setNuevoEquipo("");
    setModalCrear(false);
    loadEquipos();
  };

  /* ============================================================
     EDITAR EQUIPO
  ============================================================ */
  const abrirEditar = (equipo) => {
    setSelectedEquipo(equipo);
    setEditNombre(equipo.nombre);
    setModalEditar(true);
  };

  const confirmarEditar = async () => {
    if (!editNombre.trim())
      return Swal.fire("Error", "El nombre no puede estar vacío", "warning");

    const res = await api(`/equipos/${selectedEquipo.id}`, {
      method: "PUT",
      body: JSON.stringify({ nombre: editNombre }),
    });

    const data = await res.json();
    if (!res.ok) return Swal.fire("Error", data.mensaje, "error");

    Swal.fire("✔ Cambios guardados", "", "success");
    setModalEditar(false);
    loadEquipos();
  };

  /* ============================================================
     ELIMINAR EQUIPO
  ============================================================ */
  const eliminarEquipo = async (equipo) => {
    const r = await Swal.fire({
      title: "¿Eliminar equipo?",
      text: `Se eliminará: ${equipo.nombre}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
    });

    if (!r.isConfirmed) return;

    const res = await api(`/equipos/${equipo.id}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (!res.ok) return Swal.fire("Error", data.mensaje, "error");

    Swal.fire("✔ Equipo eliminado", "", "success");
    loadEquipos();
  };

  /* ============================================================
     ASIGNAR EQUIPO A CONSULTOR
  ============================================================ */
  const asignarEquipo = async () => {
    if (!selectedEquipo || !selectedConsultor)
      return Swal.fire("Seleccione equipo y consultor", "", "warning");

    const res = await api(`/api/consultores/${selectedConsultor}/equipo`, {
      method: "PUT",
      body: JSON.stringify({ equipo_id: selectedEquipo.id }),
    });

    const data = await res.json();
    if (!res.ok) return Swal.fire("Error", data.mensaje, "error");

    Swal.fire("✔ Equipo asignado", "", "success");
    setSelectedConsultor("");
    loadConsultores();
  };

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="equipos-wrapper">
      <h1 className="equipos-title">🧩 Administración de Equipos</h1>

      <div className="equipos-grid">
        {/* LISTA DE EQUIPOS */}
        <div className="equipos-card">
          <h2>Equipos Existentes</h2>

          <button className="eq-btn-create" onClick={() => setModalCrear(true)}>
            + Crear Equipo
          </button>

          <ul className="equipos-list">
            {equipos.map((e) => (
              <li
                key={e.id}
                className={selectedEquipo?.id === e.id ? "active" : ""}
                onClick={() => setSelectedEquipo(e)}
              >
                <span>{e.nombre}</span>

                <div className="eq-actions">
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      abrirEditar(e);
                    }}
                  >
                    ✏
                  </button>

                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      eliminarEquipo(e);
                    }}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ASIGNAR A CONSULTOR */}
        <div className="equipos-card">
          <h2>Asignar Equipo a Consultor</h2>

          {!selectedEquipo ? (
            <p className="equipos-empty">Seleccione un equipo para asignarlo</p>
          ) : (
            <>
              <h3>
                Equipo seleccionado: <b>{selectedEquipo.nombre}</b>
              </h3>

              <select
                className="eq-select"
                value={selectedConsultor}
                onChange={(e) => setSelectedConsultor(e.target.value)}
              >
                <option value="">Seleccionar consultor...</option>
                {consultores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>

              <button className="eq-btn-assign" onClick={asignarEquipo}>
                Asignar Equipo
              </button>
            </>
          )}
        </div>
      </div>

      {/* MODALES */}
      <EquipoModal
        open={modalCrear}
        title="🆕 Crear Equipo"
        value={nuevoEquipo}
        setValue={setNuevoEquipo}
        onClose={() => setModalCrear(false)}
        onConfirm={confirmarCrear}
        confirmText="Crear Equipo"
      />

      <EquipoModal
        open={modalEditar}
        title="✏️ Editar Equipo"
        value={editNombre}
        setValue={setEditNombre}
        onClose={() => setModalEditar(false)}
        onConfirm={confirmarEditar}
        confirmText="Guardar Cambios"
      />
    </div>
  );
}

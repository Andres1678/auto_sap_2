import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import "./EquiposPage.css";
import { jfetch, jsonOrThrow } from "./lib/api";

/* ================= MODAL ================= */
function EquipoModal({ open, title, value, setValue, onClose, onConfirm }) {
  if (!open) return null;

  return (
    <div className="emodal-overlay">
      <div className="emodal-content">
        <h2>{title}</h2>

        <input
          className="emodal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nombre del equipo"
          autoFocus
        />

        <div className="emodal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={onConfirm}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ================= PAGE ================= */
export default function EquiposPage() {
  const [equipos, setEquipos] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [consultoresEquipo, setConsultoresEquipo] = useState([]);

  const [selectedEquipo, setSelectedEquipo] = useState(null);
  const [selectedConsultor, setSelectedConsultor] = useState("");

  const [nuevoEquipo, setNuevoEquipo] = useState("");
  const [editNombre, setEditNombre] = useState("");

  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [search, setSearch] = useState("");

  /* ================= LOAD ================= */
  useEffect(() => {
    loadEquipos();
    loadConsultores();
  }, []);

  useEffect(() => {
    if (selectedEquipo) loadConsultoresEquipo(selectedEquipo.id);
    else setConsultoresEquipo([]);
  }, [selectedEquipo]);

  const loadEquipos = async () => {
    const res = await jfetch("/equipos");
    setEquipos(await jsonOrThrow(res));
  };

  const loadConsultores = async () => {
    const res = await jfetch("/consultores");
    setConsultores(await jsonOrThrow(res));
  };

  const loadConsultoresEquipo = async (id) => {
    const res = await jfetch(`/equipos/${id}/consultores`);
    setConsultoresEquipo(await jsonOrThrow(res));
  };

  /* ================= FILTER ================= */
  const equiposFiltrados = useMemo(() => {
    if (!search.trim()) return equipos;
    return equipos.filter(e =>
      e.nombre.toLowerCase().includes(search.toLowerCase())
    );
  }, [equipos, search]);

  /* ================= CRUD ================= */
  const crearEquipo = async () => {
    if (!nuevoEquipo.trim()) return Swal.fire("Ingrese nombre", "", "warning");

    await jfetch("/equipos", {
      method: "POST",
      body: { nombre: nuevoEquipo }
    }).then(jsonOrThrow);

    Swal.fire("✔ Equipo creado", "", "success");
    setModalCrear(false);
    setNuevoEquipo("");
    loadEquipos();
  };

  const editarEquipo = async () => {
    await jfetch(`/equipos/${selectedEquipo.id}`, {
      method: "PUT",
      body: { nombre: editNombre }
    }).then(jsonOrThrow);

    Swal.fire("✔ Equipo actualizado", "", "success");
    setModalEditar(false);
    loadEquipos();
  };

  const eliminarEquipo = async (equipo) => {
    const r = await Swal.fire({
      title: "¿Eliminar equipo?",
      text: equipo.nombre,
      icon: "warning",
      showCancelButton: true
    });

    if (!r.isConfirmed) return;

    await jfetch(`/equipos/${equipo.id}`, { method: "DELETE" }).then(jsonOrThrow);
    setSelectedEquipo(null);
    loadEquipos();
  };

  const asignarConsultor = async () => {
    if (!selectedConsultor) return;

    await jfetch(`/consultores/${selectedConsultor}/equipo`, {
      method: "PUT",
      body: { equipo_id: selectedEquipo.id }
    }).then(jsonOrThrow);

    setSelectedConsultor("");
    loadConsultores();
    loadConsultoresEquipo(selectedEquipo.id);
  };

  const removerConsultor = async (c) => {
    await jfetch(`/consultores/${c.id}/equipo/remove`, {
      method: "PUT"
    }).then(jsonOrThrow);

    loadConsultores();
    loadConsultoresEquipo(selectedEquipo.id);
  };

  /* ================= RENDER ================= */
  return (
    <div className="equipos-wrapper">
      <h1 className="equipos-title">🧩 Administración de Equipos</h1>

      <div className="equipos-grid">
        {/* EQUIPOS */}
        <div className="equipos-card">
          <div className="header">
            <h2>Equipos</h2>
            <button onClick={() => setModalCrear(true)}>+ Crear</button>
          </div>

          <input
            className="search"
            placeholder="Buscar equipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <ul className="equipos-list">
            {equiposFiltrados.map(e => (
              <li
                key={e.id}
                className={selectedEquipo?.id === e.id ? "active" : ""}
                onClick={() => setSelectedEquipo(e)}
              >
                <span>{e.nombre}</span>

                <div className="actions">
                  <button onClick={(ev) => {
                    ev.stopPropagation();
                    setEditNombre(e.nombre);
                    setSelectedEquipo(e);
                    setModalEditar(true);
                  }}>✏</button>

                  <button onClick={(ev) => {
                    ev.stopPropagation();
                    eliminarEquipo(e);
                  }}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* CONSULTORES */}
        <div className="equipos-card">
          <h2>Consultores del equipo</h2>

          {!selectedEquipo ? (
            <p className="empty">Seleccione un equipo</p>
          ) : (
            <>
              <h3>{selectedEquipo.nombre}</h3>

              <ul className="consultores-list">
                {consultoresEquipo.map(c => (
                  <li key={c.id}>
                    {c.nombre}
                    <button onClick={() => removerConsultor(c)}>❌</button>
                  </li>
                ))}
              </ul>

              <div className="assign-row">
                <select
                  value={selectedConsultor}
                  onChange={(e) => setSelectedConsultor(e.target.value)}
                >
                  <option value="">Asignar consultor…</option>
                  {consultores
                    .filter(c => !consultoresEquipo.some(ce => ce.id === c.id))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                </select>

                <button onClick={asignarConsultor}>Asignar</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODALES */}
      <EquipoModal
        open={modalCrear}
        title="Crear Equipo"
        value={nuevoEquipo}
        setValue={setNuevoEquipo}
        onClose={() => setModalCrear(false)}
        onConfirm={crearEquipo}
      />

      <EquipoModal
        open={modalEditar}
        title="Editar Equipo"
        value={editNombre}
        setValue={setEditNombre}
        onClose={() => setModalEditar(false)}
        onConfirm={editarEquipo}
      />
    </div>
  );
}

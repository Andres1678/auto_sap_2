import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import "./ClientesTable.css";
import { jfetch } from "./lib/api";

const API_URL = "/clientes";

export default function ClientesTable() {
  const [clientes, setClientes] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [ordenAsc, setOrdenAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [form, setForm] = useState({
    nombre_cliente: "",
  });

  /* ============================================================
     CARGA CLIENTES (ÚNICO PUNTO)
  ============================================================ */
  const cargarClientes = async () => {
    try {
      setCargando(true);

      const res = await jfetch(API_URL);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.mensaje || "Error cargando clientes");
      }

      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];

      // Filtro
      let filtrados = lista.filter((c) =>
        (c.nombre_cliente || "")
          .toLowerCase()
          .includes(filtroNombre.toLowerCase())
      );

      // Orden
      filtrados.sort((a, b) => {
        const aN = a.nombre_cliente || "";
        const bN = b.nombre_cliente || "";
        return ordenAsc ? aN.localeCompare(bN) : bN.localeCompare(aN);
      });

      setClientes(filtrados);
    } catch (err) {
      console.error("❌ Error al cargar clientes:", err);
      Swal.fire("Error", err.message, "error");
    } finally {
      setCargando(false);
    }
  };

  /* ============================================================
     DEBOUNCE BÚSQUEDA
  ============================================================ */
  useEffect(() => {
    const timeout = setTimeout(() => {
      cargarClientes();
    }, 300);

    return () => clearTimeout(timeout);
  }, [filtroNombre, ordenAsc]);

  /* ============================================================
     CARGA INICIAL
  ============================================================ */
  useEffect(() => {
    cargarClientes();
  }, []);

  /* ============================================================
     MODAL
  ============================================================ */
  const abrirModal = (cliente = null) => {
    setEditando(cliente);
    setForm({
      nombre_cliente: cliente?.nombre_cliente || "",
    });
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditando(null);
    setForm({ nombre_cliente: "" });
  };

  /* ============================================================
     GUARDAR (CREAR / EDITAR)
  ============================================================ */
  const guardarCliente = async () => {
    if (!form.nombre_cliente.trim()) {
      return Swal.fire(
        "Campo requerido",
        "El nombre del cliente es obligatorio",
        "warning"
      );
    }

    const method = editando ? "PUT" : "POST";
    const url = editando ? `${API_URL}/${editando.id}` : API_URL;

    try {
      const res = await jfetch(url, {
        method,
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.mensaje || "Error guardando cliente");
      }

      Swal.fire("Éxito", "Cliente guardado correctamente", "success");
      cerrarModal();
      cargarClientes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  /* ============================================================
     ELIMINAR
  ============================================================ */
  const eliminarCliente = async (id) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar cliente?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await jfetch(`${API_URL}/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.mensaje || "Error eliminando cliente");
      }

      Swal.fire("Eliminado", "Cliente eliminado correctamente", "success");
      cargarClientes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="clientes-wrapper">
      <h2>🗂️ Gestión de Clientes</h2>

      {/* Filtros */}
      <div className="clientes-filtros">
        <div className="clientes-input-icon">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={filtroNombre}
            onChange={(e) => setFiltroNombre(e.target.value)}
          />
        </div>

        {filtroNombre && (
          <button className="clientes-btn-limpiar" onClick={() => setFiltroNombre("")}>
            Limpiar ✖
          </button>
        )}

        <button className="clientes-btn-agregar" onClick={() => abrirModal()}>
          + Cliente
        </button>
      </div>

      {/* Contador */}
      <div className="clientes-contador">
        Mostrando <strong>{clientes.length}</strong> cliente(s)
      </div>

      {cargando && <p className="clientes-loader">Cargando...</p>}

      {/* Tabla */}
      <div className="clientes-tabla-envuelta">
        <table className="clientes-tabla">
          <thead>
            <tr>
              <th onClick={() => setOrdenAsc(!ordenAsc)}>
                Cliente {ordenAsc ? "⬆" : "⬇"}
              </th>
              <th style={{ width: "150px" }}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {clientes.length ? (
              clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre_cliente}</td>
                  <td>
                    <div className="clientes-acciones">
                      <button
                        className="clientes-btn clientes-btn-warning"
                        onClick={() => abrirModal(c)}
                      >
                        ✏️
                      </button>

                      <button
                        className="clientes-btn clientes-btn-danger"
                        onClick={() => eliminarCliente(c.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="clientes-no-data">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="clientes-modal-backdrop">
          <div className="clientes-modal">
            <div className="clientes-modal-header">
              <h5>{editando ? "Editar Cliente" : "Nuevo Cliente"}</h5>
              <button className="clientes-btn-close" onClick={cerrarModal}>
                ×
              </button>
            </div>

            <div className="clientes-modal-body">
              <label>Nombre del Cliente</label>
              <input
                type="text"
                value={form.nombre_cliente}
                onChange={(e) =>
                  setForm({ nombre_cliente: e.target.value })
                }
              />
            </div>

            <div className="clientes-modal-footer">
              <button
                className="clientes-btn clientes-btn-secondary"
                onClick={cerrarModal}
              >
                Cancelar
              </button>
              <button
                className="clientes-btn clientes-btn-primary"
                onClick={guardarCliente}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";

export default function ModalMapeoProyecto({ isOpen, onClose, proyecto }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    id: null,
    valor_origen: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRows = async () => {
    if (!proyecto?.id) return;
    setLoading(true);
    try {
      const res = await jfetch(`/proyectos/${proyecto.id}/mapeos`);
      const json = await res.json().catch(() => []);
      if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
      setRows(Array.isArray(json) ? json : []);
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: String(e.message || e) });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchRows();
  }, [isOpen, proyecto?.id]);

  const resetForm = () => {
    setForm({ id: null, valor_origen: "" });
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!form.valor_origen.trim()) {
      return Swal.fire({ icon: "warning", title: "Completa el valor origen" });
    }

    try {
      setSaving(true);

      const url = form.id
        ? `/proyecto-mapeos/${form.id}`
        : `/proyectos/${proyecto.id}/mapeos`;

      const method = form.id ? "PUT" : "POST";

      const res = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor_origen: form.valor_origen.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);

      resetForm();
      fetchRows();

      Swal.fire({
        icon: "success",
        title: form.id ? "Mapeo actualizado" : "Mapeo agregado",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e2) {
      Swal.fire({ icon: "error", title: "Error guardando", text: String(e2.message || e2) });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row) => {
    setForm({
      id: row.id,
      valor_origen: row.valor_origen || "",
    });
  };

  const removeRow = async (row) => {
    const ok = await Swal.fire({
      icon: "warning",
      title: "Eliminar mapeo",
      text: `¿Eliminar "${row.valor_origen}"?`,
      showCancelButton: true,
      confirmButtonText: "Sí",
      cancelButtonText: "Cancelar",
    });

    if (!ok.isConfirmed) return;

    try {
      const res = await jfetch(`/proyecto-mapeos/${row.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.mensaje || `HTTP ${res.status}`);
      fetchRows();
      if (form.id === row.id) resetForm();
    } catch (e) {
      Swal.fire({ icon: "error", title: "No se pudo eliminar", text: String(e.message || e) });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div className="modal-header">
        <h3>Mapeos — {proyecto?.codigo} - {proyecto?.nombre}</h3>
        <button type="button" onClick={onClose} aria-label="Cerrar modal">✖</button>
      </div>

      <form onSubmit={onSubmit}>
        <input
          value={form.valor_origen}
          onChange={(e) => setForm((f) => ({ ...f, valor_origen: e.target.value }))}
          placeholder="Valor origen"
        />

        <button type="submit" disabled={saving}>
          {form.id ? "Actualizar" : "Agregar"}
        </button>

        {form.id && (
          <button type="button" onClick={resetForm}>
            Cancelar
          </button>
        )}
      </form>

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Origen</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.valor_origen}</td>
                <td>
                  <button type="button" onClick={() => startEdit(r)}>✏️</button>
                  <button type="button" onClick={() => removeRow(r)}>🗑️</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="2">Sin mapeos</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Swal from "sweetalert2";
import "./ConsultoresTable.css";
import { jfetch } from "./lib/api";

const isActiveValue = (v) => {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "si" || s === "sí";
};

const emptyForm = () => ({
  id: null,
  usuario: "",
  nombre: "",
  password: "",
  rol_id: "",
  equipo_id: "",
  horario_id: "",
  modulos: [], // array de IDs
  activo: true,
});

export default function ConsultoresTable() {
  const [loading, setLoading] = useState(false);
  const [consultores, setConsultores] = useState([]);

  // filtros
  const [fUsuario, setFUsuario] = useState("");
  const [fNombre, setFNombre] = useState("");
  const [fEquipo, setFEquipo] = useState("");
  const [fRol, setFRol] = useState("");

  // catálogos
  const [roles, setRoles] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [modulos, setModulos] = useState([]);

  // modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const fetchCatalogos = useCallback(async () => {
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        jfetch("/roles"),
        jfetch("/equipos"),
        jfetch("/horarios"),
        jfetch("/modulos"),
      ]);

      const [j1, j2, j3, j4] = await Promise.all([
        r1.json().catch(() => []),
        r2.json().catch(() => []),
        r3.json().catch(() => []),
        r4.json().catch(() => []),
      ]);

      setRoles(Array.isArray(j1) ? j1 : []);
      setEquipos(Array.isArray(j2) ? j2 : []);
      setHorarios(Array.isArray(j3) ? j3 : []);
      setModulos(Array.isArray(j4) ? j4 : []);
    } catch {
      setRoles([]); setEquipos([]); setHorarios([]); setModulos([]);
    }
  }, []);

  const fetchConsultores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jfetch("/consultores");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      // normaliza activo a boolean por si viene 0/1/string
      const normalized = (Array.isArray(data) ? data : []).map((c) => ({
        ...c,
        activo: isActiveValue(c.activo),
      }));

      setConsultores(normalized);
    } catch (e) {
      setConsultores([]);
      Swal.fire({ icon: "error", title: "Error cargando consultores", text: String(e.message || e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogos();
    fetchConsultores();
  }, [fetchCatalogos, fetchConsultores]);

  const filtered = useMemo(() => {
    const u = fUsuario.trim().toLowerCase();
    const n = fNombre.trim().toLowerCase();
    const eq = fEquipo.trim().toLowerCase();
    const rl = fRol.trim().toLowerCase();

    return (consultores || []).filter((c) => {
      const usuario = String(c.usuario || "").toLowerCase();
      const nombre = String(c.nombre || "").toLowerCase();
      const equipoLabel = String(c.equipo_nombre ?? c.equipo ?? "").toLowerCase();
      const rolLabel = String(c.rol_nombre ?? c.rol ?? "").toLowerCase();

      if (u && !usuario.includes(u)) return false;
      if (n && !nombre.includes(n)) return false;
      if (eq && !equipoLabel.includes(eq)) return false;
      if (rl && !rolLabel.includes(rl)) return false;
      return true;
    });
  }, [consultores, fUsuario, fNombre, fEquipo, fRol]);

  const abrirNuevo = () => {
    setEditing(false);
    setForm(emptyForm());
    setOpen(true);
  };

  const abrirEditar = (c) => {
    setEditing(true);

    const mods = (c.modulos || []).map((m) => Number(m.id ?? m)).filter(Boolean);

    setForm({
      id: c.id,
      usuario: c.usuario || "",
      nombre: c.nombre || "",
      password: "", 
      rol_id: c.rol_id ?? "",
      equipo_id: c.equipo_id ?? "",
      horario_id: c.horario_id ?? "",
      modulos: mods,
      activo: isActiveValue(c.activo),
    });
    setOpen(true);
  };

  const cerrar = () => {
    setOpen(false);
    setForm(emptyForm());
  };

  const onChange = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();

    if (!form.usuario.trim() || !form.nombre.trim()) {
      return Swal.fire({ icon: "warning", title: "Usuario y nombre son obligatorios" });
    }
    if (!editing && !form.password.trim()) {
      return Swal.fire({ icon: "warning", title: "La contraseña es obligatoria al crear" });
    }

    const payload = {
      usuario: form.usuario.trim(),
      nombre: form.nombre.trim(),
      rol_id: form.rol_id ? Number(form.rol_id) : null,
      equipo_id: form.equipo_id ? Number(form.equipo_id) : null,
      horario_id: form.horario_id ? Number(form.horario_id) : null,
      modulos: (form.modulos || []).map(Number).filter(Boolean),
      activo: !!form.activo,
    };

    // solo crear: password
    if (!editing) payload.password = form.password;

    try {
      const url = editing ? `/consultores/${form.id}` : "/consultores";
      const method = editing ? "PUT" : "POST";

      const res = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      await Swal.fire({
        icon: "success",
        title: editing ? "Consultor actualizado" : "Consultor creado",
      });

      cerrar();
      fetchConsultores();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error guardando", text: String(err.message || err) });
    }
  };

  const eliminar = async (id) => {
    const ok = await Swal.fire({
      title: "¿Eliminar consultor?",
      text: "Esta acción no se puede revertir.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!ok.isConfirmed) return;

    try {
      const res = await jfetch(`/consultores/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({ icon: "success", title: "Eliminado" });
      fetchConsultores();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error eliminando", text: String(err.message || err) });
    }
  };

  // ✅ Switch activo desde tabla
  const toggleActivo = async (c) => {
    const nuevo = !isActiveValue(c.activo);

    try {
      const res = await jfetch(`/consultores/${c.id}/activo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      // actualiza local optimista
      setConsultores((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, activo: nuevo } : x))
      );
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error cambiando estado", text: String(err.message || err) });
    }
  };

  return (
    <div className="cst-wrapper">
      <h2 className="cst-title">Consultores</h2>

      <div className="cst-filtros">
        <input
          value={fUsuario}
          onChange={(e) => setFUsuario(e.target.value)}
          placeholder="Filtrar por usuario..."
        />
        <input
          value={fNombre}
          onChange={(e) => setFNombre(e.target.value)}
          placeholder="Filtrar por nombre..."
        />
        <input
          value={fEquipo}
          onChange={(e) => setFEquipo(e.target.value)}
          placeholder="Filtrar por equipo..."
        />
        <input
          value={fRol}
          onChange={(e) => setFRol(e.target.value)}
          placeholder="Filtrar por rol..."
        />

        <button className="cst-btn-add" onClick={abrirNuevo}>
          + Agregar
        </button>
      </div>

      <div className="cst-table-wrapper">
        <table className="cst-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Equipo</th>
              <th>Horario</th>
              <th>Módulos</th>
              <th>Activo</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="cst-empty" colSpan={8}>Cargando…</td>
              </tr>
            ) : filtered.length ? (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td title={c.usuario}>{c.usuario}</td>
                  <td title={c.nombre}>{c.nombre}</td>

                  <td title={c.rol_nombre ?? c.rol ?? ""}>
                    {c.rol_nombre ?? c.rol ?? "—"}
                  </td>

                  <td title={c.equipo_nombre ?? c.equipo ?? ""}>
                    {c.equipo_nombre ?? c.equipo ?? "—"}
                  </td>

                  <td title={c.horario_rango ?? c.horario ?? ""}>
                    {c.horario_rango ?? c.horario ?? "—"}
                  </td>

                  <td
                    className="cst-wrap"
                    title={(c.modulos || []).map(m => m.nombre ?? m).join(", ")}
                  >
                    {(c.modulos || []).map((m) => (m.nombre ?? m)).join(", ") || "—"}
                  </td>

                  <td>
                    <span className={`cst-badge ${isActiveValue(c.activo) ? "on" : "off"}`}>
                      {isActiveValue(c.activo) ? "Sí" : "No"}
                    </span>

                    <div style={{ height: 8 }} />

                    <label className="cst-switch" title="Activar / Desactivar">
                      <input
                        type="checkbox"
                        checked={isActiveValue(c.activo)}
                        onChange={() => toggleActivo(c)}
                      />
                      <span className="track">
                        <span className="thumb" />
                      </span>
                    </label>
                  </td>

                  <td>
                    <div className="cst-actions">
                      <button className="cst-edit" onClick={() => abrirEditar(c)} title="Editar">
                        ✏️
                      </button>
                      <button className="cst-delete" onClick={() => eliminar(c.id)} title="Eliminar">
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="cst-empty" colSpan={8}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {open && (
        <div className="cst-modal-backdrop" onClick={cerrar}>
          <div className="cst-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cst-modal-header">
              <h3>{editing ? "Editar Consultor" : "Nuevo Consultor"}</h3>
              <button className="cst-close" onClick={cerrar} aria-label="Cerrar">
                ✖
              </button>
            </div>

            <form onSubmit={submit}>
              <div className="cst-modal-body">
                <input
                  value={form.usuario}
                  onChange={(e) => onChange("usuario", e.target.value)}
                  placeholder="Usuario"
                  disabled={editing} /* si no quieres permitir cambiar usuario */
                />

                <input
                  value={form.nombre}
                  onChange={(e) => onChange("nombre", e.target.value)}
                  placeholder="Nombre"
                />

                {!editing && (
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => onChange("password", e.target.value)}
                    placeholder="Contraseña"
                  />
                )}

                <select value={form.rol_id} onChange={(e) => onChange("rol_id", e.target.value)}>
                  <option value="">Rol (opcional)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>

                <select value={form.equipo_id} onChange={(e) => onChange("equipo_id", e.target.value)}>
                  <option value="">Equipo (opcional)</option>
                  {equipos.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nombre}
                    </option>
                  ))}
                </select>

                <select value={form.horario_id} onChange={(e) => onChange("horario_id", e.target.value)}>
                  <option value="">Horario (opcional)</option>
                  {horarios.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.rango ?? h.nombre ?? `Horario ${h.id}`}
                    </option>
                  ))}
                </select>

                <select
                  multiple
                  value={(form.modulos || []).map(String)}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    onChange("modulos", values);
                  }}
                >
                  {modulos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                  <span style={{ fontWeight: 800 }}>Activo</span>

                  <label className="cst-switch">
                    <input
                      type="checkbox"
                      checked={!!form.activo}
                      onChange={(e) => onChange("activo", e.target.checked)}
                    />
                    <span className="track">
                      <span className="thumb" />
                    </span>
                  </label>

                  <span className={`cst-badge ${form.activo ? "on" : "off"}`}>
                    {form.activo ? "Sí" : "No"}
                  </span>
                </div>
              </div>

              <div className="cst-modal-footer">
                <button type="button" className="cst-secondary" onClick={cerrar}>
                  Cancelar
                </button>
                <button type="submit" className="cst-primary">
                  {editing ? "Guardar cambios" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

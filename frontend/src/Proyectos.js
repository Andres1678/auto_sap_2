import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./Proyectos.css";

const emptyForm = () => ({
  id: null,
  codigo: "",
  nombre: "",
  fase: "",
  activo: true,
  modulos_ids: [], 
});

const norm = (s) => String(s ?? "").trim();

export default function Proyectos() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [proyectos, setProyectos] = useState([]);
  const [modulos, setModulos] = useState([]);

  const [q, setQ] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [form, setForm] = useState(emptyForm());
  const isEdit = !!form.id;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        jfetch("/api/proyectos"),
        jfetch("/api/modulos"),
      ]);

      const pData = await pRes.json().catch(() => []);
      const mData = await mRes.json().catch(() => []);

      if (!pRes.ok) throw new Error(pData?.mensaje || `HTTP ${pRes.status}`);
      if (!mRes.ok) throw new Error(mData?.mensaje || `HTTP ${mRes.status}`);

      setProyectos(Array.isArray(pData) ? pData : []);
      setModulos(Array.isArray(mData) ? mData : []);
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: "error", title: "Error cargando datos", text: String(e.message || e) });
      setProyectos([]);
      setModulos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const modulosMap = useMemo(() => {
    const m = new Map();
    (modulos || []).forEach((x) => m.set(Number(x.id), x.nombre));
    return m;
  }, [modulos]);

  const proyectosFiltrados = useMemo(() => {
    const needle = norm(q).toLowerCase();
    return (proyectos || []).filter((p) => {
      if (soloActivos && !p.activo) return false;
      if (!needle) return true;
      const hay =
        String(p.codigo || "").toLowerCase().includes(needle) ||
        String(p.nombre || "").toLowerCase().includes(needle) ||
        String(p.fase || "").toLowerCase().includes(needle);
      return hay;
    });
  }, [proyectos, q, soloActivos]);

  const toggleModulo = (id) => {
    const mid = Number(id);
    setForm((f) => {
      const set = new Set((f.modulos_ids || []).map(Number));
      if (set.has(mid)) set.delete(mid);
      else set.add(mid);
      return { ...f, modulos_ids: Array.from(set) };
    });
  };

  const resetForm = () => setForm(emptyForm());

  const startEdit = (p) => {
    setForm({
      id: p.id,
      codigo: p.codigo || "",
      nombre: p.nombre || "",
      fase: p.fase || "",
      activo: !!p.activo,
      // backend puede devolver modulos como ids o como objects; soporta ambos
      modulos_ids: Array.isArray(p.modulos_ids)
        ? p.modulos_ids.map(Number)
        : Array.isArray(p.modulos)
          ? p.modulos.map((x) => Number(x.id ?? x))
          : [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = async (p) => {
    const res = await Swal.fire({
      icon: "warning",
      title: "Eliminar proyecto",
      text: `¿Seguro de eliminar "${p.codigo} - ${p.nombre}"?`,
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });
    if (!res.isConfirmed) return;

    try {
      setSaving(true);
      const r = await jfetch(`/api/proyectos/${p.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);
      Swal.fire({ icon: "success", title: "Eliminado" });
      fetchAll();
      if (form.id === p.id) resetForm();
    } catch (e) {
      Swal.fire({ icon: "error", title: "No se pudo eliminar", text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p) => {
    try {
      setSaving(true);
      // opción A: endpoint PATCH activo
      const r = await jfetch(`/api/proyectos/${p.id}/activo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !p.activo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);
      fetchAll();
    } catch (e) {
      Swal.fire({ icon: "error", title: "No se pudo cambiar estado", text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    if (!norm(form.codigo)) return "El código es obligatorio";
    if (!norm(form.nombre)) return "El nombre es obligatorio";
    if (!norm(form.fase)) return "La fase es obligatoria";
    if (!Array.isArray(form.modulos_ids) || form.modulos_ids.length === 0)
      return "Debes seleccionar al menos 1 módulo";
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const err = validateForm();
    if (err) return Swal.fire({ icon: "warning", title: err });

    const payload = {
      codigo: norm(form.codigo).toUpperCase(),
      nombre: norm(form.nombre),
      fase: norm(form.fase),
      activo: !!form.activo,
      modulos_ids: (form.modulos_ids || []).map(Number),
    };

    try {
      setSaving(true);

      const url = isEdit ? `/api/proyectos/${form.id}` : "/api/proyectos";
      const method = isEdit ? "PUT" : "POST";

      const r = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);

      Swal.fire({ icon: "success", title: isEdit ? "Proyecto actualizado" : "Proyecto creado" });

      resetForm();
      fetchAll();
    } catch (e2) {
      Swal.fire({ icon: "error", title: "Error guardando", text: String(e2.message || e2) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proj-page">
      <div className="proj-head">
        <div>
          <h2 className="proj-title">Gestión de Proyectos</h2>
          <p className="proj-subtitle">
            Crear / editar proyectos, asignar módulos permitidos, fase y estado activo.
          </p>
        </div>

        <div className="proj-head-actions">
          <button className="btn btn-outline" onClick={fetchAll} disabled={loading || saving}>
            {loading ? "Cargando…" : "Refrescar"}
          </button>
        </div>
      </div>

      {/* FORM */}
      <div className="proj-card">
        <div className="proj-card-head">
          <h3>{isEdit ? "Editar proyecto" : "Nuevo proyecto"}</h3>
          {isEdit && (
            <button className="btn btn-ghost" type="button" onClick={resetForm} disabled={saving}>
              Cancelar edición
            </button>
          )}
        </div>

        <form onSubmit={onSubmit} className="proj-form">
          <div className="grid-3">
            <div className="field">
              <label>Código</label>
              <input
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="Ej: PRY-001"
              />
            </div>

            <div className="field">
              <label>Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Proyecto Migración"
              />
            </div>

            <div className="field">
              <label>Fase</label>
              <input
                value={form.fase}
                onChange={(e) => setForm((f) => ({ ...f, fase: e.target.value }))}
                placeholder="Ej: Diagnóstico / Ejecución / Cierre"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Módulos permitidos</label>
              <div className="mods-box">
                {modulos.length === 0 ? (
                  <div className="muted">No hay módulos cargados</div>
                ) : (
                  modulos.map((m) => {
                    const checked = (form.modulos_ids || []).map(Number).includes(Number(m.id));
                    return (
                      <label key={m.id} className={`mod-chip ${checked ? "is-on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModulo(m.id)}
                        />
                        <span>{m.nombre}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="field">
              <label>Estado</label>
              <div className="inline">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={!!form.activo}
                    onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  />
                  <span className="slider" />
                </label>
                <span className="muted">{form.activo ? "Activo" : "Inactivo"}</span>
              </div>

              <div className="proj-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Guardando…" : isEdit ? "Actualizar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* LISTADO */}
      <div className="proj-card">
        <div className="proj-list-head">
          <h3>Proyectos</h3>
          <div className="proj-list-filters">
            <input
              className="search"
              placeholder="Buscar por código, nombre o fase…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={soloActivos}
                onChange={(e) => setSoloActivos(e.target.checked)}
              />
              <span>Solo activos</span>
            </label>
          </div>
        </div>

        <div className="proj-table-wrap">
          <table className="proj-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Fase</th>
                <th>Activo</th>
                <th>Módulos</th>
                <th className="actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proyectosFiltrados.map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.id}</td>
                  <td className="mono">{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{p.fase}</td>
                  <td>
                    <span className={`badge ${p.activo ? "ok" : "off"}`}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="mods-cell">
                    {(Array.isArray(p.modulos_ids) ? p.modulos_ids : (p.modulos || [])).slice(0, 6).map((x, idx) => {
                      const id = Number(x?.id ?? x);
                      const label = x?.nombre ?? modulosMap.get(id) ?? String(id);
                      return (
                        <span key={`${p.id}-${id}-${idx}`} className="pill">
                          {label}
                        </span>
                      );
                    })}
                    {(Array.isArray(p.modulos_ids) ? p.modulos_ids : (p.modulos || [])).length > 6 && (
                      <span className="pill more">+ más…</span>
                    )}
                  </td>
                  <td className="actions">
                    <button className="icon-btn" onClick={() => startEdit(p)} disabled={saving}>
                      ✏️
                    </button>
                    <button className="icon-btn" onClick={() => toggleActivo(p)} disabled={saving}>
                      {p.activo ? "⛔" : "✅"}
                    </button>
                    <button className="icon-btn danger" onClick={() => confirmDelete(p)} disabled={saving}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}

              {proyectosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ padding: 14 }}>
                    Sin proyectos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Total: <b>{proyectosFiltrados.length}</b>
        </div>
      </div>
    </div>
  );
}
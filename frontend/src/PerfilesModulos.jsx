import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./Proyectos.css";

const emptyPerfil = () => ({
  id: null,
  codigo: "",
  nombre: "",
  descripcion: "",
  orden: 0,
  activo: true,
  modulos: [],
});

const toArrayResponse = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
};

const norm = (v) => String(v ?? "").trim();

const normCode = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

const asBool = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || v === 1 || s === "1" || s === "true";
};

const getModuloIdsFromPerfil = (perfil) => {
  if (!Array.isArray(perfil?.modulos)) return [];

  return perfil.modulos
    .map((m) => Number(m?.id ?? m?.modulo_id ?? m?.modulo?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
};

export default function PerfilesModulos() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [perfiles, setPerfiles] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [q, setQ] = useState("");

  const [form, setForm] = useState(emptyPerfil());
  const isEdit = !!form.id;

  const fetchAll = async () => {
    setLoading(true);

    try {
      const [pRes, mRes] = await Promise.all([
        jfetch("/perfiles?include_modulos=1"),
        jfetch("/modulos"),
      ]);

      const pData = await pRes.json().catch(() => []);
      const mData = await mRes.json().catch(() => []);

      if (!pRes.ok) throw new Error(pData?.mensaje || `HTTP ${pRes.status}`);
      if (!mRes.ok) throw new Error(mData?.mensaje || `HTTP ${mRes.status}`);

      setPerfiles(
        toArrayResponse(pData).map((p) => ({
          ...p,
          activo: asBool(p?.activo),
          modulos: getModuloIdsFromPerfil(p),
        }))
      );

      setModulos(toArrayResponse(mData));
    } catch (e) {
      console.error(e);

      Swal.fire({
        icon: "error",
        title: "Error cargando perfiles",
        text: String(e.message || e),
      });

      setPerfiles([]);
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

    (modulos || []).forEach((x) => {
      const id = Number(x?.id);
      if (Number.isFinite(id)) {
        m.set(id, String(x?.nombre || ""));
      }
    });

    return m;
  }, [modulos]);

  const perfilesFiltrados = useMemo(() => {
    const needle = norm(q).toLowerCase();

    return (perfiles || []).filter((p) => {
      if (!needle) return true;

      const modulosTxt = (p.modulos || [])
        .map((id) => modulosMap.get(Number(id)) || "")
        .join(" ")
        .toLowerCase();

      return (
        String(p.codigo || "").toLowerCase().includes(needle) ||
        String(p.nombre || "").toLowerCase().includes(needle) ||
        String(p.descripcion || "").toLowerCase().includes(needle) ||
        modulosTxt.includes(needle)
      );
    });
  }, [perfiles, q, modulosMap]);

  const resetForm = () => {
    setForm(emptyPerfil());
  };

  const startEdit = (perfil) => {
    setForm({
      id: perfil.id,
      codigo: perfil.codigo || "",
      nombre: perfil.nombre || "",
      descripcion: perfil.descripcion || "",
      orden: perfil.orden ?? 0,
      activo: asBool(perfil.activo),
      modulos: getModuloIdsFromPerfil(perfil),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleModulo = (moduloId) => {
    const mid = Number(moduloId);

    setForm((prev) => {
      const set = new Set((prev.modulos || []).map(Number));

      if (set.has(mid)) {
        set.delete(mid);
      } else {
        set.add(mid);
      }

      return {
        ...prev,
        modulos: Array.from(set),
      };
    });
  };

  const validateForm = () => {
    if (!norm(form.nombre)) return "El nombre del perfil es obligatorio";

    if (!Array.isArray(form.modulos) || form.modulos.length === 0) {
      return "Debes asignar al menos un módulo al perfil";
    }

    return null;
  };

  const onNombreChange = (value) => {
    setForm((prev) => ({
      ...prev,
      nombre: value,
      codigo: prev.codigo ? prev.codigo : normCode(value),
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const err = validateForm();
    if (err) {
      return Swal.fire({
        icon: "warning",
        title: err,
      });
    }

    const payload = {
      codigo: norm(form.codigo || normCode(form.nombre)).toUpperCase(),
      nombre: norm(form.nombre),
      descripcion: norm(form.descripcion) || null,
      orden: Number(form.orden || 0),
      activo: !!form.activo,
      modulos: (form.modulos || [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    };

    try {
      setSaving(true);

      const url = isEdit ? `/perfiles/${form.id}` : "/perfiles";
      const method = isEdit ? "PUT" : "POST";

      const res = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      Swal.fire({
        icon: "success",
        title: isEdit ? "Perfil actualizado" : "Perfil creado",
      });

      resetForm();
      await fetchAll();
    } catch (e2) {
      Swal.fire({
        icon: "error",
        title: "Error guardando",
        text: String(e2.message || e2),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async (perfil) => {
    const res = await Swal.fire({
      icon: "warning",
      title: "Desactivar perfil",
      text: `¿Seguro de desactivar "${perfil.nombre}"?`,
      showCancelButton: true,
      confirmButtonText: "Sí, desactivar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!res.isConfirmed) return;

    try {
      setSaving(true);

      const r = await jfetch(`/perfiles/${perfil.id}`, {
        method: "DELETE",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(j?.mensaje || `HTTP ${r.status}`);
      }

      Swal.fire({
        icon: "success",
        title: "Perfil desactivado",
      });

      await fetchAll();

      if (form.id === perfil.id) resetForm();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "No se pudo desactivar",
        text: String(e.message || e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proyectos-page-scope">
      <div className="proj-page">
        <div className="proj-head">
          <div>
            <h2 className="proj-title">Perfiles y módulos</h2>
            <p className="proj-subtitle">
              Configura qué módulos puede trabajar cada perfil. Un perfil puede
              tener varios módulos y un módulo puede pertenecer a varios perfiles.
            </p>
          </div>

          <div className="proj-head-actions">
            <button
              className="btn btn-outline"
              type="button"
              onClick={fetchAll}
              disabled={loading || saving}
            >
              {loading ? "Cargando…" : "Refrescar"}
            </button>
          </div>
        </div>

        <div className="proj-card">
          <div className="proj-card-head">
            <h3>{isEdit ? "Editar perfil" : "Nuevo perfil"}</h3>

            {isEdit && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                Cancelar edición
              </button>
            )}
          </div>

          <form className="proj-form" onSubmit={onSubmit}>
            <div className="grid-2">
              <div className="field">
                <label>Nombre del perfil</label>
                <input
                  value={form.nombre}
                  onChange={(e) => onNombreChange(e.target.value)}
                  placeholder="Ej: CONSULTOR SAP BASIS N3"
                />
              </div>

              <div className="field">
                <label>Código</label>
                <input
                  value={form.codigo}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      codigo: normCode(e.target.value),
                    }))
                  }
                  placeholder="Ej: CONSULTOR_SAP_BASIS_N3"
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Orden</label>
                <input
                  type="number"
                  value={form.orden}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      orden: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label>Estado</label>

                <div className="inline">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={!!form.activo}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          activo: e.target.checked,
                        }))
                      }
                    />
                    <span className="slider" />
                  </label>

                  <span className="muted">
                    {form.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid-1">
              <div className="field">
                <label>Descripción</label>
                <textarea
                  value={form.descripcion || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      descripcion: e.target.value,
                    }))
                  }
                  placeholder="Descripción opcional del perfil"
                  rows={3}
                />
              </div>
            </div>

            <div className="grid-1">
              <div className="field">
                <label>Módulos asignados al perfil</label>

                <div className="mods-box">
                  {modulos.length === 0 ? (
                    <div className="muted">No hay módulos cargados</div>
                  ) : (
                    modulos.map((m) => {
                      const checked = (form.modulos || [])
                        .map(Number)
                        .includes(Number(m.id));

                      return (
                        <label
                          key={m.id}
                          className={`mod-chip ${checked ? "is-on" : ""}`}
                        >
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

                <div className="muted">
                  Esta configuración alimentará la creación de proyectos y la
                  planeación por perfil.
                </div>
              </div>
            </div>

            <div className="proj-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Guardando…" : isEdit ? "Actualizar" : "Crear"}
              </button>
            </div>
          </form>
        </div>

        <div className="proj-card">
          <div className="proj-list-head">
            <h3>Perfiles configurados</h3>

            <div className="proj-list-filters">
              <input
                className="search"
                placeholder="Buscar por perfil, código o módulo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="proj-table-wrap">
            <table className="proj-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Módulos</th>
                  <th className="actions">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {perfilesFiltrados.map((p) => {
                  const activo = asBool(p.activo);
                  const moduloNames = (p.modulos || [])
                    .map((mid) => modulosMap.get(Number(mid)))
                    .filter(Boolean);

                  return (
                    <tr key={p.id}>
                      <td className="num">{p.id}</td>
                      <td className="mono">{p.codigo}</td>
                      <td>{p.nombre}</td>

                      <td>
                        <span className={`badge ${activo ? "ok" : "off"}`}>
                          {activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      <td className="mods-cell">
                        {moduloNames.length === 0 && (
                          <span className="muted">Sin módulos</span>
                        )}

                        {moduloNames.slice(0, 8).map((label, idx) => (
                          <span
                            key={`${p.id}-${label}-${idx}`}
                            className="pill"
                          >
                            {label}
                          </span>
                        ))}

                        {moduloNames.length > 8 && (
                          <span className="pill more">+ más…</span>
                        )}
                      </td>

                      <td className="actions">
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => startEdit(p)}
                          disabled={saving}
                          title="Editar"
                        >
                          ✏️
                        </button>

                        <button
                          className="icon-btn danger"
                          type="button"
                          onClick={() => confirmDeactivate(p)}
                          disabled={saving}
                          title="Desactivar"
                        >
                          ⛔
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {perfilesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 14 }}>
                      Sin perfiles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Total: <b>{perfilesFiltrados.length}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
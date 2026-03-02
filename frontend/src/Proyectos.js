import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./Proyectos.css";

const DEFAULT_FASES = [
  { id: "__DESCUBRIR__", nombre: "Descubrir" },
  { id: "__PREPARAR__", nombre: "Preparar" },
  { id: "__EXPLORAR__", nombre: "Explorar" },
  { id: "__REALIZAR__", nombre: "Realizar" },
  { id: "__DESPLEGAR__", nombre: "Desplegar" },
  { id: "__OPERAR__", nombre: "Operar" },
];

const emptyForm = () => ({
  id: null,
  codigo: "",
  nombre: "",
  fases: [],
  activo: true,
  modulos: [],
  cliente_id: "", 
});

const norm = (s) => String(s ?? "").trim();
const normKey = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const getProyectoFasesIds = (p) => {
  if (Array.isArray(p?.fases_ids)) return p.fases_ids.map(String).filter(Boolean);
  if (Array.isArray(p?.fases)) return p.fases.map((x) => String(x?.id)).filter(Boolean);
  return [];
};

const getProyectoFasesNames = (p, fasesMap) => {
  if (Array.isArray(p?.fases) && p.fases.length) {
    const names = p.fases.map((f) => String(f?.nombre || "").trim()).filter(Boolean);
    if (names.length) return names;
  }
  const ids = getProyectoFasesIds(p);
  return ids.map((id) => fasesMap.get(String(id))).filter(Boolean);
};

export default function Proyectos() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [proyectos, setProyectos] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [fases, setFases] = useState([]);
  const [clientes, setClientes] = useState([]); 

  const [q, setQ] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [form, setForm] = useState(emptyForm());
  const isEdit = !!form.id;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, mRes, fRes, cRes] = await Promise.all([
        jfetch("/proyectos?include_modulos=1&include_fases=1"),
        jfetch("/modulos"),
        jfetch("/proyecto-fases"),
        jfetch("/clientes"), // ✅
      ]);

      const pData = await pRes.json().catch(() => []);
      const mData = await mRes.json().catch(() => []);
      const fData = await fRes.json().catch(() => []);
      const cData = await cRes.json().catch(() => []);

      if (!pRes.ok) throw new Error(pData?.mensaje || `HTTP ${pRes.status}`);
      if (!mRes.ok) throw new Error(mData?.mensaje || `HTTP ${mRes.status}`);
      if (!fRes.ok) throw new Error(fData?.mensaje || `HTTP ${fRes.status}`);
      if (!cRes.ok) throw new Error(cData?.mensaje || `HTTP ${cRes.status}`);

      setProyectos(Array.isArray(pData) ? pData : []);
      setModulos(Array.isArray(mData) ? mData : []);
      setClientes(Array.isArray(cData) ? cData : []);

      const backendFases = Array.isArray(fData) ? fData : [];
      const byName = new Map();
      backendFases.forEach((x) => byName.set(normKey(x?.nombre), x));

      const merged = [...backendFases];
      DEFAULT_FASES.forEach((df) => {
        if (!byName.has(normKey(df.nombre))) {
          merged.push({ id: df.id, nombre: df.nombre, activo: true, orden: 0 });
        }
      });

      merged.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
      setFases(merged);
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: "Error cargando datos",
        text: String(e.message || e),
      });
      setProyectos([]);
      setModulos([]);
      setFases(DEFAULT_FASES);
      setClientes([]);
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

  const fasesMap = useMemo(() => {
    const m = new Map();
    (fases || []).forEach((x) => {
      if (x?.id != null) m.set(String(x.id), String(x.nombre || ""));
    });
    return m;
  }, [fases]);

  const clientesMap = useMemo(() => {
    const m = new Map();
    (clientes || []).forEach((c) => {
      const id = Number(c?.id);
      const name = c?.nombre_cliente ?? c?.nombre ?? "";
      if (Number.isFinite(id)) m.set(id, String(name));
    });
    return m;
  }, [clientes]);

  const proyectosFiltrados = useMemo(() => {
    const needle = norm(q).toLowerCase();

    return (proyectos || []).filter((p) => {
      if (soloActivos && !p.activo) return false;
      if (!needle) return true;

      const fasesTxt = getProyectoFasesNames(p, fasesMap).join(" ");

      const clienteTxt =
        String(
          p?.cliente?.nombre_cliente ??
            p?.cliente?.nombre ??
            (p?.cliente_id != null ? clientesMap.get(Number(p?.cliente_id)) : "") ??
            ""
        ).toLowerCase();

      return (
        String(p.codigo || "").toLowerCase().includes(needle) ||
        String(p.nombre || "").toLowerCase().includes(needle) ||
        fasesTxt.toLowerCase().includes(needle) ||
        clienteTxt.includes(needle)
      );
    });
  }, [proyectos, q, soloActivos, fasesMap, clientesMap]);

  const toggleModulo = (id) => {
    const mid = Number(id);
    setForm((f) => {
      const set = new Set((f.modulos || []).map(Number));
      if (set.has(mid)) set.delete(mid);
      else set.add(mid);
      return { ...f, modulos: Array.from(set) };
    });
  };

  const toggleFase = (faseId) => {
    const fid = String(faseId);
    setForm((f) => {
      const set = new Set((f.fases || []).map(String));
      if (set.has(fid)) set.delete(fid);
      else set.add(fid);
      return { ...f, fases: Array.from(set) };
    });
  };

  const resetForm = () => setForm(emptyForm());

  const startEdit = (p) => {
    const fasesIds = getProyectoFasesIds(p);

    setForm({
      id: p.id,
      codigo: p.codigo || "",
      nombre: p.nombre || "",
      activo: !!p.activo,
      modulos: Array.isArray(p.modulos) ? p.modulos.map((x) => Number(x.id)) : [],
      fases: fasesIds,

      // ✅ cliente_id robusto
      cliente_id: p?.cliente_id != null ? String(p.cliente_id) : "",
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
      const r = await jfetch(`/proyectos/${p.id}`, { method: "DELETE" });
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
      const r = await jfetch(`/proyectos/${p.id}/toggle-activo`, { method: "PUT" });
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
    if (!Array.isArray(form.modulos) || form.modulos.length === 0) return "Debes seleccionar al menos 1 módulo";

    // ✅ si lo quieres obligatorio:
    // if (!String(form.cliente_id || "").trim()) return "Debes seleccionar un cliente";

    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const err = validateForm();
    if (err) return Swal.fire({ icon: "warning", title: err });

    const fasesIds = (form.fases || [])
      .map(String)
      .filter((x) => x && !x.startsWith("__"))
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    const clienteIdClean = String(form.cliente_id || "").trim();

    const payload = {
      codigo: norm(form.codigo).toUpperCase(),
      nombre: norm(form.nombre),
      activo: !!form.activo,
      modulos: (form.modulos || []).map(Number),
      fases: fasesIds,

      // ✅ cliente_id
      cliente_id: clienteIdClean ? Number(clienteIdClean) : null,
    };

    try {
      setSaving(true);

      const url = isEdit ? `/proyectos/${form.id}` : "/proyectos";
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
            Crear / editar proyectos, asignar cliente, módulos permitidos, múltiples fases y estado activo.
          </p>
        </div>

        <div className="proj-head-actions">
          <button className="btn btn-outline" onClick={fetchAll} disabled={loading || saving}>
            {loading ? "Cargando…" : "Refrescar"}
          </button>
        </div>
      </div>

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
          <div className="grid-2">
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
          </div>

          {/* ✅ Cliente */}
          <div className="grid-1">
            <div className="field">
              <label>Cliente</label>
              <select
                value={form.cliente_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}
              >
                <option value="">— Sin cliente —</option>
                {(clientes || []).map((c) => {
                  const id = c?.id;
                  const name = c?.nombre_cliente ?? c?.nombre ?? "";
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>

              <div className="muted" style={{ marginTop: 6 }}>
                Si seleccionas un cliente, el proyecto queda ligado para reportes y filtros.
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Fases permitidas (multi)</label>
              <div className="mods-box">
                {(fases || []).length === 0 ? (
                  <div className="muted">No hay fases cargadas</div>
                ) : (
                  (fases || []).map((fx) => {
                    const fid = String(fx.id);
                    const checked = (form.fases || []).map(String).includes(fid);
                    return (
                      <label key={fid} className={`mod-chip ${checked ? "is-on" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleFase(fid)} />
                        <span>{fx.nombre}</span>
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

          <div className="grid-1">
            <div className="field">
              <label>Módulos permitidos</label>
              <div className="mods-box">
                {modulos.length === 0 ? (
                  <div className="muted">No hay módulos cargados</div>
                ) : (
                  modulos.map((m) => {
                    const checked = (form.modulos || []).map(Number).includes(Number(m.id));
                    return (
                      <label key={m.id} className={`mod-chip ${checked ? "is-on" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleModulo(m.id)} />
                        <span>{m.nombre}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="proj-card">
        <div className="proj-list-head">
          <h3>Proyectos</h3>
          <div className="proj-list-filters">
            <input
              className="search"
              placeholder="Buscar por código, nombre, cliente o fases…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="check">
              <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
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
                <th>Cliente</th>
                <th>Fases</th>
                <th>Activo</th>
                <th>Módulos</th>
                <th className="actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proyectosFiltrados.map((p) => {
                const fasesNames = getProyectoFasesNames(p, fasesMap);
                const fasesTxt = fasesNames.length ? fasesNames.join(", ") : "—";

                const clienteTxt =
                  p?.cliente?.nombre_cliente ??
                  p?.cliente?.nombre ??
                  (p?.cliente_id != null ? clientesMap.get(Number(p.cliente_id)) : "") ??
                  "";

                return (
                  <tr key={p.id}>
                    <td className="num">{p.id}</td>
                    <td className="mono">{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td>{clienteTxt || "—"}</td>
                    <td>{fasesTxt}</td>
                    <td>
                      <span className={`badge ${p.activo ? "ok" : "off"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td className="mods-cell">
                      {(Array.isArray(p.modulos) ? p.modulos : [])
                        .slice(0, 6)
                        .map((x, idx) => {
                          const id = Number(x?.id ?? x);
                          const label = x?.nombre ?? modulosMap.get(id) ?? String(id);
                          return (
                            <span key={`${p.id}-${id}-${idx}`} className="pill">
                              {label}
                            </span>
                          );
                        })}
                      {(Array.isArray(p.modulos) ? p.modulos : []).length > 6 && (
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
                );
              })}

              {proyectosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 14 }}>
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
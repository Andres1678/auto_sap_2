import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModalModuloPerfiles.css";

const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function ModalModuloPerfiles({ isOpen, onClose, modulo }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [perfiles, setPerfiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [q, setQ] = useState("");

  const fetchData = async () => {
    if (!modulo?.id) return;

    setLoading(true);
    try {
      const [perfilesRes, moduloPerfilesRes] = await Promise.all([
        jfetch("/perfiles?solo_activos=1"),
        jfetch(`/modulos/${modulo.id}/perfiles`),
      ]);

      const perfilesData = await perfilesRes.json().catch(() => []);
      const moduloPerfilesData = await moduloPerfilesRes.json().catch(() => ({}));

      if (!perfilesRes.ok) throw new Error(perfilesData?.mensaje || `HTTP ${perfilesRes.status}`);
      if (!moduloPerfilesRes.ok) throw new Error(moduloPerfilesData?.mensaje || `HTTP ${moduloPerfilesRes.status}`);

      const perfilesRows = Array.isArray(perfilesData) ? perfilesData : [];
      const asignados = Array.isArray(moduloPerfilesData?.perfiles)
        ? moduloPerfilesData.perfiles.map((x) => Number(x?.perfil_id)).filter(Boolean)
        : [];

      setPerfiles(perfilesRows);
      setSelectedIds(asignados);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error cargando perfiles del módulo",
        text: String(e.message || e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && modulo?.id) {
      fetchData();
    }
  }, [isOpen, modulo?.id]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return perfiles;

    return perfiles.filter((p) => {
      return (
        norm(p.codigo).includes(needle) ||
        norm(p.nombre).includes(needle)
      );
    });
  }, [perfiles, q]);

  const togglePerfil = (perfilId) => {
    const id = Number(perfilId);

    setSelectedIds((prev) => {
      const set = new Set(prev.map(Number));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const guardar = async () => {
    try {
      setSaving(true);

      const res = await jfetch(`/modulos/${modulo.id}/perfiles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfil_ids: selectedIds,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({
        icon: "success",
        title: "Perfiles del módulo actualizados",
      });

      onClose?.(true);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: String(e.message || e),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mmp-backdrop" onClick={() => onClose?.(false)}>
      <div className="mmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mmp-head">
          <div>
            <h3>Perfiles del módulo</h3>
            <p>{modulo?.nombre || "—"}</p>
          </div>

          <button className="mmp-close" type="button" onClick={() => onClose?.(false)}>
            ✕
          </button>
        </div>

        <div className="mmp-toolbar">
          <input
            className="mmp-search"
            placeholder="Buscar perfil..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button className="mmp-btn secondary" type="button" onClick={fetchData} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="mmp-body">
          {filtered.length === 0 ? (
            <div className="mmp-empty">Sin perfiles disponibles</div>
          ) : (
            <div className="mmp-grid">
              {filtered.map((p) => {
                const checked = selectedIds.map(Number).includes(Number(p.id));

                return (
                  <label key={p.id} className={`mmp-chip ${checked ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerfil(p.id)}
                    />
                    <span className="mmp-chip-code">{p.codigo}</span>
                    <span className="mmp-chip-name">{p.nombre}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="mmp-foot">
          <button className="mmp-btn ghost" type="button" onClick={() => onClose?.(false)}>
            Cancelar
          </button>

          <button className="mmp-btn primary" type="button" onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
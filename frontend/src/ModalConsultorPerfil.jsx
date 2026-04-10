import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ModalConsultorPerfiles.css";

const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function ModalConsultorPerfiles({ isOpen, onClose, consultor }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [perfiles, setPerfiles] = useState([]);
  const [selectedMap, setSelectedMap] = useState({});
  const [q, setQ] = useState("");

  const fetchData = async () => {
    if (!consultor?.id) return;

    setLoading(true);
    try {
      const [perfilesRes, consultorPerfilesRes] = await Promise.all([
        jfetch("/perfiles?solo_activos=1"),
        jfetch(`/consultores/${consultor.id}/perfiles`),
      ]);

      const perfilesData = await perfilesRes.json().catch(() => []);
      const consultorPerfilesData = await consultorPerfilesRes.json().catch(() => ({}));

      if (!perfilesRes.ok) throw new Error(perfilesData?.mensaje || `HTTP ${perfilesRes.status}`);
      if (!consultorPerfilesRes.ok) throw new Error(consultorPerfilesData?.mensaje || `HTTP ${consultorPerfilesRes.status}`);

      const perfilesRows = Array.isArray(perfilesData) ? perfilesData : [];
      const currentRows = Array.isArray(consultorPerfilesData?.perfiles)
        ? consultorPerfilesData.perfiles
        : [];

      const map = {};
      currentRows.forEach((row) => {
        map[String(row.perfil_id)] = {
          checked: true,
          activo: !!row.activo,
          fecha_inicio: row.fecha_inicio || "",
          fecha_fin: row.fecha_fin || "",
        };
      });

      setPerfiles(perfilesRows);
      setSelectedMap(map);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error cargando perfiles del consultor",
        text: String(e.message || e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && consultor?.id) {
      fetchData();
    }
  }, [isOpen, consultor?.id]);

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
    const key = String(perfilId);

    setSelectedMap((prev) => {
      const current = prev[key];
      if (current?.checked) {
        const clone = { ...prev };
        delete clone[key];
        return clone;
      }

      return {
        ...prev,
        [key]: {
          checked: true,
          activo: true,
          fecha_inicio: "",
          fecha_fin: "",
        },
      };
    });
  };

  const updateSelectedField = (perfilId, field, value) => {
    const key = String(perfilId);

    setSelectedMap((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {
          checked: true,
          activo: true,
          fecha_inicio: "",
          fecha_fin: "",
        }),
        [field]: value,
      },
    }));
  };

  const guardar = async () => {
    try {
      setSaving(true);

      const rows = Object.entries(selectedMap)
        .filter(([, value]) => value?.checked)
        .map(([perfilId, value]) => ({
          perfil_id: Number(perfilId),
          activo: !!value.activo,
          fecha_inicio: value.fecha_inicio || null,
          fecha_fin: value.fecha_fin || null,
        }));

      const res = await jfetch(`/consultores/${consultor.id}/perfiles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({
        icon: "success",
        title: "Perfiles del consultor actualizados",
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
    <div className="mcp-backdrop" onClick={() => onClose?.(false)}>
      <div className="mcp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-head">
          <div>
            <h3>Perfiles del consultor</h3>
            <p>
              {consultor?.nombre || "—"} {consultor?.usuario ? `(${consultor.usuario})` : ""}
            </p>
          </div>

          <button className="mcp-close" type="button" onClick={() => onClose?.(false)}>
            ✕
          </button>
        </div>

        <div className="mcp-toolbar">
          <input
            className="mcp-search"
            placeholder="Buscar perfil..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button className="mcp-btn secondary" type="button" onClick={fetchData} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="mcp-body">
          {filtered.length === 0 ? (
            <div className="mcp-empty">Sin perfiles disponibles</div>
          ) : (
            <div className="mcp-grid">
              {filtered.map((p) => {
                const key = String(p.id);
                const current = selectedMap[key] || null;
                const checked = !!current?.checked;

                return (
                  <div key={p.id} className={`mcp-card ${checked ? "is-on" : ""}`}>
                    <label className="mcp-top">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerfil(p.id)}
                      />
                      <div>
                        <div className="mcp-code">{p.codigo}</div>
                        <div className="mcp-name">{p.nombre}</div>
                      </div>
                    </label>

                    {checked && (
                      <div className="mcp-fields">
                        <div className="mcp-field">
                          <label>Fecha inicio</label>
                          <input
                            type="date"
                            value={current?.fecha_inicio || ""}
                            onChange={(e) => updateSelectedField(p.id, "fecha_inicio", e.target.value)}
                          />
                        </div>

                        <div className="mcp-field">
                          <label>Fecha fin</label>
                          <input
                            type="date"
                            value={current?.fecha_fin || ""}
                            onChange={(e) => updateSelectedField(p.id, "fecha_fin", e.target.value)}
                          />
                        </div>

                        <div className="mcp-field">
                          <label>Activo</label>
                          <select
                            value={current?.activo ? "1" : "0"}
                            onChange={(e) => updateSelectedField(p.id, "activo", e.target.value === "1")}
                          >
                            <option value="1">Activo</option>
                            <option value="0">Inactivo</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mcp-foot">
          <button className="mcp-btn ghost" type="button" onClick={() => onClose?.(false)}>
            Cancelar
          </button>

          <button className="mcp-btn primary" type="button" onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
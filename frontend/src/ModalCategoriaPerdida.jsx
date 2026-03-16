import React, { useEffect, useMemo } from "react";
import "./ModalCategoriaPerdida.css";

function normalizeLabel(v) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export default function ModalCategoriaPerdida({
  isOpen,
  onClose,
  categoriesMap = {},
  title = "Categoría Perdida y Subcategoría Perdida",
}) {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const rows = useMemo(() => {
    return Object.entries(categoriesMap || {})
      .map(([categoria, subcategorias]) => ({
        categoria: normalizeLabel(categoria),
        subcategorias: Array.isArray(subcategorias)
          ? [...new Set(subcategorias.map(normalizeLabel).filter(Boolean))].sort((a, b) =>
              a.localeCompare(b, "es", { sensitivity: "base" })
            )
          : [],
      }))
      .sort((a, b) =>
        a.categoria.localeCompare(b.categoria, "es", { sensitivity: "base" })
      );
  }, [categoriesMap]);

  const totalSubcategorias = useMemo(() => {
    return rows.reduce((acc, item) => acc + item.subcategorias.length, 0);
  }, [rows]);

  if (!isOpen) return null;

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-header">
          <div>
            <h3 className="cp-modal-title">{title}</h3>
            <div className="cp-modal-subtitle">
              Consulta rápida de categorías y subcategorías configuradas.
            </div>
          </div>

          <button
            type="button"
            className="cp-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="cp-summary">
          <div className="cp-summary-chip">
            <strong>{rows.length}</strong> categorías
          </div>
          <div className="cp-summary-chip">
            <strong>{totalSubcategorias}</strong> subcategorías
          </div>
        </div>

        <div className="cp-grid">
          {rows.map((item) => (
            <div key={item.categoria} className="cp-card">
              <div className="cp-card-head">
                <div className="cp-card-title">{item.categoria}</div>
                <div className="cp-card-badge">{item.subcategorias.length}</div>
              </div>

              {item.subcategorias.length ? (
                <ul className="cp-list">
                  {item.subcategorias.map((sub) => (
                    <li key={`${item.categoria}-${sub}`} className="cp-list-item">
                      {sub}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="cp-empty">Sin subcategorías</div>
              )}
            </div>
          ))}
        </div>

        <div className="cp-modal-footer">
          <button type="button" className="cp-footer-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
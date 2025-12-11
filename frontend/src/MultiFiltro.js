import { useState } from "react";
import "./MultiFiltro.css";

export default function MultiFiltro({
  titulo = "Filtro",
  opciones = [],
  seleccion = [],
  onChange,
  placeholder = "Seleccionar…",
}) {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen(!open);

  const handleSelect = (valor) => {
    let nuevo = [];

    if (seleccion.includes(valor)) {
      nuevo = seleccion.filter((v) => v !== valor);
    } else {
      nuevo = [...seleccion, valor];
    }

    onChange(nuevo);
  };

  return (
    <div className="mf-wrapper">
      <button className="mf-trigger" onClick={toggle} type="button">
        {seleccion.length === 0 ? (
          <span className="mf-placeholder">{placeholder}</span>
        ) : (
          <span className="mf-selected">
            {seleccion.length === 1
              ? seleccion[0]
              : `${seleccion.length} seleccionados`}
          </span>
        )}
        <span className="mf-arrow">▾</span>
      </button>

      {open && (
        <div className="mf-panel">
          <div className="mf-title">{titulo}</div>

          <div className="mf-grid">
            {opciones.map((op) => (
              <label className="mf-item" key={op}>
                <input
                  type="checkbox"
                  checked={seleccion.includes(op)}
                  onChange={() => handleSelect(op)}
                />
                <span>{op}</span>
              </label>
            ))}
          </div>

          <div className="mf-footer">
            <button
              className="mf-clear"
              type="button"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>

            <button className="mf-close" type="button" onClick={toggle}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

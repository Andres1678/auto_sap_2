import React, { useMemo, useState } from "react";
import "./ModalResumenCerradas.css";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").trim();
}

function normalizeForCompare(value) {
  return normalizeText(value).toUpperCase();
}

function toIsoDate(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNumberSmart(input) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input === "number") return Number.isFinite(input) ? input : "";

  let s = String(input).trim();
  if (!s) return "";

  s = s.replace(/\s/g, "");
  s = s.replace(/[$€£]/g, "");
  s = s.replace(/%/g, "");
  s = s.replace(/\b(COP|USD)\b/gi, "");

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : "";
  }

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("");
    if (decimalSep === ",") s = s.replace(",", ".");
  } else if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1) {
      const after = s.slice(lastComma + 1);
      const before = s.slice(0, lastComma).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(",", "");
      else s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (dotCount > 0 && commaCount === 0) {
    if (dotCount === 1) {
      const after = s.slice(lastDot + 1);
      const before = s.slice(0, lastDot).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(".", "");
    } else {
      s = s.replace(/\./g, "");
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");
  if (!s || s === "-" || s === "." || s === "-.") return "";

  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function money(value) {
  const parsed = parseNumberSmart(value);
  return parsed === "" ? "-" : `$ ${nf.format(parsed)}`;
}

function uniqueOptions(rows, field) {
  return [...new Set((rows || []).map((row) => normalizeText(row?.[field])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export default function ModalResumenCerradas({ isOpen, onClose, rows = [] }) {
  const [clienteFilter, setClienteFilter] = useState("");
  const [servicioFilter, setServicioFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [monedaFilter, setMonedaFilter] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const clienteOptions = useMemo(() => uniqueOptions(rows, "nombre_cliente"), [rows]);
  const servicioOptions = useMemo(() => uniqueOptions(rows, "servicio"), [rows]);
  const estadoOptions = useMemo(() => uniqueOptions(rows, "estado"), [rows]);
  const monedaOptions = useMemo(() => uniqueOptions(rows, "tipo_moneda"), [rows]);

  const filteredRows = useMemo(() => {
    return (rows || []).filter((row) => {
      const fecha = toIsoDate(row?.fecha_cierre_oportunidad);

      if (clienteFilter && normalizeForCompare(row?.nombre_cliente) !== normalizeForCompare(clienteFilter)) {
        return false;
      }

      if (servicioFilter && normalizeForCompare(row?.servicio) !== normalizeForCompare(servicioFilter)) {
        return false;
      }

      if (estadoFilter && normalizeForCompare(row?.estado) !== normalizeForCompare(estadoFilter)) {
        return false;
      }

      if (monedaFilter && normalizeForCompare(row?.tipo_moneda) !== normalizeForCompare(monedaFilter)) {
        return false;
      }

      if (fechaDesde && (!fecha || fecha < fechaDesde)) {
        return false;
      }

      if (fechaHasta && (!fecha || fecha > fechaHasta)) {
        return false;
      }

      return true;
    });
  }, [rows, clienteFilter, servicioFilter, estadoFilter, monedaFilter, fechaDesde, fechaHasta]);

  const totalValor = useMemo(() => {
    const total = filteredRows.reduce((acc, row) => {
      const n = parseNumberSmart(row?.valor);
      return n === "" ? acc : acc + Number(n);
    }, 0);

    return Number(total.toFixed(2));
  }, [filteredRows]);

  const hasFilters = Boolean(
    clienteFilter || servicioFilter || estadoFilter || monedaFilter || fechaDesde || fechaHasta
  );

  const clearFilters = () => {
    setClienteFilter("");
    setServicioFilter("");
    setEstadoFilter("");
    setMonedaFilter("");
    setFechaDesde("");
    setFechaHasta("");
  };

  if (!isOpen) return null;

  return (
    <div className="mrc-overlay" role="dialog" aria-modal="true">
      <div className="mrc-modal">
        <div className="mrc-header">
          <div>
            <h3>Resumen oportunidades cerradas</h3>
            <p>Valor calculado desde la suma de las OTs/suboportunidades asignadas a cada principal.</p>
          </div>

          <button type="button" className="mrc-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="mrc-toolbar">
          <div className="mrc-filters-grid">
            <label>
              Cliente
              <select value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)}>
                <option value="">Todos</option>
                {clienteOptions.map((cliente) => (
                  <option key={cliente} value={cliente}>{cliente}</option>
                ))}
              </select>
            </label>

            <label>
              Servicio
              <select value={servicioFilter} onChange={(e) => setServicioFilter(e.target.value)}>
                <option value="">Todos</option>
                {servicioOptions.map((servicio) => (
                  <option key={servicio} value={servicio}>{servicio}</option>
                ))}
              </select>
            </label>

            <label>
              Estado
              <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}>
                <option value="">Todos</option>
                {estadoOptions.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </label>

            <label>
              Tipo moneda
              <select value={monedaFilter} onChange={(e) => setMonedaFilter(e.target.value)}>
                <option value="">Todos</option>
                {monedaOptions.map((moneda) => (
                  <option key={moneda} value={moneda}>{moneda}</option>
                ))}
              </select>
            </label>

            <label>
              Cierre desde
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </label>

            <label>
              Cierre hasta
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </label>
          </div>

          <div className="mrc-actions-row">
            <button type="button" className="mrc-clear" onClick={clearFilters} disabled={!hasFilters}>
              Limpiar filtros
            </button>

            <div className="mrc-counter">
              <strong>{filteredRows.length}</strong> registro{filteredRows.length === 1 ? "" : "s"}
            </div>

            <div className="mrc-total">
              Total valor: <strong>{money(totalValor)}</strong>
            </div>
          </div>
        </div>

        <div className="mrc-table-wrap">
          <table className="mrc-table">
            <thead>
              <tr>
                <th>NOMBRE CLIENTE</th>
                <th>SERVICIO</th>
                <th>ESTADO</th>
                <th>FECHA CIERRE OPORTUNIDAD</th>
                <th>TIPO MONEDA</th>
                <th>VALOR</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={`resumen-${row.id}`}>
                    <td>{row.nombre_cliente || "-"}</td>
                    <td>{row.servicio || "-"}</td>
                    <td>
                      <span className="mrc-status-pill">{row.estado || "-"}</span>
                    </td>
                    <td>{row.fecha_cierre_oportunidad || "-"}</td>
                    <td>{row.tipo_moneda || "-"}</td>
                    <td className="mrc-money">{money(row.valor)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="mrc-empty">
                    No hay oportunidades cerradas para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

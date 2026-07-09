import React, { useMemo, useState } from "react";
import Select from "react-select";
import * as XLSX from "xlsx";
import "./ModalResumenCerradas.css";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const EMPTY_VALUE = "__EMPTY__";
const EMPTY_LABEL = "(Blanco)";

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

  const ddmmyyyy = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function toDisplayDateDDMMYYYY(v) {
  if (!v) return "";

  const s = String(v).trim();

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}/${mm}/${yyyy}`;
  }

  const ddmmyyyyDash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const [, dd, mm, yyyy] = ddmmyyyyDash;
    return `${dd}/${mm}/${yyyy}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
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

function buildOptions(rows, field) {
  const values = (rows || []).map((row) => normalizeText(row?.[field]));
  const hasBlank = values.some((value) => !value);

  const unique = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  const options = unique.map((value) => ({
    value,
    label: value,
  }));

  if (hasBlank) {
    options.unshift({
      value: EMPTY_VALUE,
      label: EMPTY_LABEL,
    });
  }

  return options;
}

function matchesMultiFilter(rawValue, selected = []) {
  if (!selected.length) return true;

  const normalizedValue = normalizeText(rawValue);
  const isBlank = !normalizedValue;

  return selected.some((item) => {
    if (item.value === EMPTY_VALUE) return isBlank;

    return normalizeForCompare(item.value) === normalizeForCompare(normalizedValue);
  });
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function numberForExport(value) {
  const parsed = parseNumberSmart(value);
  return parsed === "" ? "" : Number(parsed);
}

function exportResumenExcel(rowsToExport, fileName) {
  const exportRows = (rowsToExport || []).map((row) => ({
    "NOMBRE CLIENTE": row.nombre_cliente || "-",
    SERVICIO: row.servicio || "-",
    ESTADO: row.estado || "-",
    "FECHA CIERRE OPORTUNIDAD": toDisplayDateDDMMYYYY(row.fecha_cierre_oportunidad) || "-",
    "TIPO MONEDA": row.tipo_moneda || "-",
    OTC: numberForExport(row.otc),
    MRC: numberForExport(row.mrc),
    "MRC NORMALIZADO": numberForExport(row.mrc_normalizado),
    "VALOR OFERTA CLARO": numberForExport(row.valor_oferta_claro ?? row.valor),
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen cerradas");
  XLSX.writeFile(workbook, fileName);
}

export default function ModalResumenCerradas({ isOpen, onClose, rows = [] }) {
  const [clienteFilter, setClienteFilter] = useState([]);
  const [servicioFilter, setServicioFilter] = useState([]);
  const [estadoFilter, setEstadoFilter] = useState([]);
  const [monedaFilter, setMonedaFilter] = useState([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const clienteOptions = useMemo(() => buildOptions(rows, "nombre_cliente"), [rows]);
  const servicioOptions = useMemo(() => buildOptions(rows, "servicio"), [rows]);
  const estadoOptions = useMemo(() => buildOptions(rows, "estado"), [rows]);
  const monedaOptions = useMemo(() => buildOptions(rows, "tipo_moneda"), [rows]);

  const filteredRows = useMemo(() => {
    return (rows || []).filter((row) => {
      const fecha = toIsoDate(row?.fecha_cierre_oportunidad);

      if (!matchesMultiFilter(row?.nombre_cliente, clienteFilter)) return false;
      if (!matchesMultiFilter(row?.servicio, servicioFilter)) return false;
      if (!matchesMultiFilter(row?.estado, estadoFilter)) return false;
      if (!matchesMultiFilter(row?.tipo_moneda, monedaFilter)) return false;

      if (fechaDesde && (!fecha || fecha < fechaDesde)) return false;
      if (fechaHasta && (!fecha || fecha > fechaHasta)) return false;

      return true;
    });
  }, [rows, clienteFilter, servicioFilter, estadoFilter, monedaFilter, fechaDesde, fechaHasta]);

  const totalValor = useMemo(() => {
    const total = filteredRows.reduce((acc, row) => {
      const n = parseNumberSmart(row?.valor_oferta_claro ?? row?.valor);
      return n === "" ? acc : acc + Number(n);
    }, 0);

    return Number(total.toFixed(2));
  }, [filteredRows]);

  const hasFilters = Boolean(
    clienteFilter.length ||
      servicioFilter.length ||
      estadoFilter.length ||
      monedaFilter.length ||
      fechaDesde ||
      fechaHasta
  );

  const clearFilters = () => {
    setClienteFilter([]);
    setServicioFilter([]);
    setEstadoFilter([]);
    setMonedaFilter([]);
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
            <p>Este resumen se filtra únicamente con los filtros de este modal.</p>
          </div>

          <button type="button" className="mrc-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="mrc-toolbar">
          <div className="mrc-filters-grid">
            <label>
              Cliente
              <Select
                isMulti
                isClearable
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                options={clienteOptions}
                value={clienteFilter}
                onChange={(value) => setClienteFilter(value || [])}
                placeholder="Todos"
                classNamePrefix="mrc-rs"
              />
            </label>

            <label>
              Servicio
              <Select
                isMulti
                isClearable
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                options={servicioOptions}
                value={servicioFilter}
                onChange={(value) => setServicioFilter(value || [])}
                placeholder="Todos"
                classNamePrefix="mrc-rs"
              />
            </label>

            <label>
              Estado
              <Select
                isMulti
                isClearable
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                options={estadoOptions}
                value={estadoFilter}
                onChange={(value) => setEstadoFilter(value || [])}
                placeholder="Todos"
                classNamePrefix="mrc-rs"
              />
            </label>

            <label>
              Tipo moneda
              <Select
                isMulti
                isClearable
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                options={monedaOptions}
                value={monedaFilter}
                onChange={(value) => setMonedaFilter(value || [])}
                placeholder="Todos"
                classNamePrefix="mrc-rs"
              />
            </label>

            <label>
              Cierre desde
              <input
                type="date"
                value={fechaDesde}
                onChange={(event) => setFechaDesde(event.target.value)}
              />
            </label>

            <label>
              Cierre hasta
              <input
                type="date"
                value={fechaHasta}
                onChange={(event) => setFechaHasta(event.target.value)}
              />
            </label>
          </div>

          <div className="mrc-actions-row">
            <button type="button" className="mrc-clear" onClick={clearFilters} disabled={!hasFilters}>
              Limpiar filtros
            </button>

            <button
              type="button"
              className="mrc-export"
              onClick={() => exportResumenExcel(rows, `resumen_cerradas_completo_${todayStamp()}.xlsx`)}
              disabled={!rows.length}
            >
              Exportar completo
            </button>

            <button
              type="button"
              className="mrc-export mrc-export-filtered"
              onClick={() => exportResumenExcel(filteredRows, `resumen_cerradas_filtrado_${todayStamp()}.xlsx`)}
              disabled={!filteredRows.length}
            >
              Exportar filtrado
            </button>

            <div className="mrc-counter">
              <strong>{filteredRows.length}</strong> registro{filteredRows.length === 1 ? "" : "s"}
            </div>

            <div className="mrc-total">
              Total valor oferta Claro: <strong>{money(totalValor)}</strong>
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
                <th>OTC</th>
                <th>MRC</th>
                <th>MRC NORMALIZADO</th>
                <th>VALOR OFERTA CLARO</th>
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
                    <td>{toDisplayDateDDMMYYYY(row.fecha_cierre_oportunidad) || "-"}</td>
                    <td>{row.tipo_moneda || "-"}</td>
                    <td className="mrc-money">{money(row.otc)}</td>
                    <td className="mrc-money">{money(row.mrc)}</td>
                    <td className="mrc-money">{money(row.mrc_normalizado)}</td>
                    <td className="mrc-money">{money(row.valor_oferta_claro ?? row.valor)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="mrc-empty">
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

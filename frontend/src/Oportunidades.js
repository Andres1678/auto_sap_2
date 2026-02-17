import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import "./Oportunidades.css";
import { jfetch } from "./lib/api";

const NUMERIC_COLS = new Set([
  "otc",
  "mrc",
  "mrc_normalizado",
  "valor_oferta_claro",
  "duracion",
  "proyeccion_ingreso",
]);

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

function isNumericCol(col) {
  return NUMERIC_COLS.has(col);
}

function parseNumberSmart(input) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input === "number") return Number.isFinite(input) ? input : "";

  let s = String(input).trim();
  if (!s) return "";

  s = s.replace(/\s/g, "");
  s = s.replace(/[$€£]/g, "");
  s = s.replace(/%/g, "");

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
      const parts = s.split(".");
      const last = parts[parts.length - 1];
      const mid = parts.slice(1, -1);

      const midAll3 = mid.every((p) => p.length === 3);
      const firstOk = parts[0].replace(/^[+-]/, "").length <= 3;
      const looksLikeGrouped = midAll3 && firstOk;

      if (looksLikeGrouped && last.length !== 3) {
        const intPart = parts.slice(0, -1).join("");
        s = intPart + "." + last;
      } else {
        s = s.replace(/\./g, "");
      }
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");
  if (!s || s === "-" || s === "." || s === "-.") return "";

  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}


function formatCell(col, value) {
  if (!isNumericCol(col)) return value ?? "-";
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : parseNumberSmart(value);
  if (n === "") return value ?? "-";
  return nf.format(n);
}

export default function Oportunidades() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [uniqueValues, setUniqueValues] = useState({});
  const [filters, setFilters] = useState({});
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState({ row: null, col: null });
  const [newRow, setNewRow] = useState(null);
  const [loading, setLoading] = useState(false);

  const columnOrder = [
    "nombre_cliente", "servicio", "fecha_creacion", "semestre", "tipo_cliente",
    "tipo_solicitud", "caso_sm", "fecha_cierre_sm", "salesforce",
    "ultimos_6_meses", "ultimo_mes", "retraso", "estado_oferta",
    "resultado_oferta", "calificacion_oportunidad", "origen_oportunidad",
    "direccion_comercial", "gerencia_comercial", "comercial_asignado",
    "consultor_comercial", "comercial_asignado_hitss", "observaciones",
    "categoria_perdida", "subcategoria_perdida",
    "fecha_entrega_oferta_final", "vigencia_propuesta",
    "fecha_aceptacion_oferta", "tipo_moneda",
    "otc", "mrc", "mrc_normalizado", "valor_oferta_claro",
    "duracion", "pais", "fecha_cierre_oportunidad",
    "codigo_prc", "fecha_firma_aos", "pm_asignado_claro",
    "pm_asignado_global_hitss", "descripcion_ot",
    "num_enlace", "num_incidente", "num_ot", "estado_ot",
    "proyeccion_ingreso", "fecha_compromiso", "fecha_cierre",
    "estado_proyecto", "anio_creacion_ot", "fecha_acta_cierre_ot",
    "seguimiento_ot", "tipo_servicio", "semestre_ejecucion",
    "publicacion_sharepoint"
  ];

  
  function normalizeRowFromApi(r) {
    const obj = r || {};
    const otcValue = obj.otc ?? obj.otr ?? obj.OTR ?? "";
    const { otr, OTR, ...rest } = obj;
    return { ...rest, otc: otcValue };
  }

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await jfetch("/oportunidades?q=");
      const json = await res.json();

      if (!Array.isArray(json)) {
        setData([]);
        setFilteredData([]);
        return;
      }

      const normalized = json.map(normalizeRowFromApi);

      setData(normalized);
      setFilteredData(normalized);

      const uniq = {};
      columnOrder.forEach((col) => {
        const values = [...new Set(normalized.map((r) => r?.[col] ?? ""))];
        uniq[col] = values.map((v) => ({
          label: v?.toString() || "-",
          value: v ?? ""
        }));
      });

      setUniqueValues(uniq);
    } catch {
      Swal.fire("Error", "No se pudo cargar la información", "error");
    } finally {
      setLoading(false);
    }
  };

  const toDbPayload = (row) => {
    const out = {};
    for (const col of columnOrder) {
      const v = row?.[col];

      if (isNumericCol(col)) {
        const parsed = parseNumberSmart(v);
        out[col] = parsed === "" ? null : parsed;
      } else {
        out[col] = (v === undefined || v === null) ? null : v;
      }
    }
    return out;
  };



  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async () => {
    if (!file) return Swal.fire("Seleccione un archivo Excel");

    const form = new FormData();
    form.append("file", file);

    setLoading(true);

    try {
      const res = await jfetch("/oportunidades/import", {
        method: "POST",
        body: form
      });

      const json = await res.json();
      Swal.fire({
        icon: res.ok ? "success" : "error",
        title: json.mensaje || "Resultado de carga"
      });

      fetchData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (column, option) => {
    const value = option?.value || "";
    const newFilters = { ...filters, [column]: value };
    setFilters(newFilters);

    let result = [...data];

    Object.entries(newFilters).forEach(([col, val]) => {
      if (val !== "") {
        result = result.filter((r) => (r[col] ?? "").toString() === val.toString());
      }
    });

    setFilteredData(result);
  };

  const [editValue, setEditValue] = useState("");

  const startEdit = (rowIndex, col) => {
    const row = filteredData[rowIndex];
    if (!row) return;

    setEditing({ row: rowIndex, col });

    const v = row[col];
    if (!isNumericCol(col)) {
      setEditValue(v ?? "");
    } else {
      const n = typeof v === "number" ? v : parseNumberSmart(v);
      setEditValue(n === "" ? (v ?? "") : String(n));
    }
  };


  const saveEdit = async (rowIndex, col, newValue) => {
    const row = filteredData?.[rowIndex];

    if (!row || !row.id) {
      setEditing({ row: null, col: null });
      return;
    }

    const original = row?.[col];
    if (String(original ?? "") === String(newValue ?? "")) {
      setEditing({ row: null, col: null });
      return;
    }

    try {
      const coercedValue = isNumericCol(col) ? parseNumberSmart(newValue) : newValue;

      const payload = toDbPayload({ ...row, [col]: coercedValue });

      const resp = await jfetch(`/oportunidades/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        Swal.fire("Error", j?.mensaje || j?.error || `HTTP ${resp.status}`, "error");
        setEditing({ row: null, col: null });
        return;
      }

      
      setData((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));
      setFilteredData((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));

      highlightRow(rowIndex);
      setEditing({ row: null, col: null });
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
      setEditing({ row: null, col: null });
    }
  };

  const highlightRow = (index) => {
    setTimeout(() => {
      const rows = document.querySelectorAll("tbody tr");
      const offset = newRow ? 1 : 0; 
      rows[index + offset]?.classList.add("row-success");
      setTimeout(() => rows[index + offset]?.classList.remove("row-success"), 1600);
    }, 50);
  };

  const addRow = () => {
    const empty = {};
    columnOrder.forEach((c) => (empty[c] = ""));
    setNewRow(empty);
  };

  const saveNewRow = async () => {
    try {
      setLoading(true);

      const payload = toDbPayload(newRow);

      const res = await jfetch("/oportunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        Swal.fire("Error", json?.mensaje || `HTTP ${res.status}`, "error");
        return;
      }

      await fetchData();
      Swal.fire("Guardado", "Nueva fila creada", "success");
      setNewRow(null);
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oportunidades-wrapper">
      <h2>Gestión de Oportunidades</h2>

      <div className="upload-section">
        <label className="custom-file-upload">
          <i className="fa fa-file-excel"></i> Seleccionar Archivo
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        </label>

        <span className="file-name">{file?.name || "Ningún archivo seleccionado"}</span>

        <button className="upload-btn" onClick={handleUpload} disabled={loading}>
          {loading ? "Cargando..." : "Subir Excel"}
        </button>
      </div>

      <div className="tabla-scroll">
        <table className="tabla-oportunidades">
          <thead>
            <tr>
              {columnOrder.map((col) => (
                <th key={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
              ))}
              <th>ACCIONES</th>
            </tr>

            <tr className="filtros-columnas">
              {columnOrder.map((col) => (
                <th key={col}>
                  <Select
                    options={uniqueValues[col] || []}
                    onChange={(opt) => handleFilterChange(col, opt)}
                    placeholder="Filtrar..."
                    className="select-filter"
                    classNamePrefix="react-select"
                    isClearable
                  />
                </th>
              ))}
              <th></th>
            </tr>
          </thead>

          <tbody>
            {newRow && (
              <tr className="new-row">
                {columnOrder.map((col) => (
                  <td key={col}>
                    <input
                      className="cell-input"
                      value={newRow[col]}
                      inputMode={isNumericCol(col) ? "decimal" : undefined}
                      onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                      onBlur={(e) => {
                        if (!isNumericCol(col)) return;
                        const parsed = parseNumberSmart(e.target.value);
                        setNewRow((p) => ({ ...p, [col]: parsed === "" ? "" : parsed }));
                      }}
                    />
                  </td>
                ))}
                <td className="acciones">
                  <button className="btn-save" onClick={saveNewRow}>Guardar</button>
                  <button className="btn-cancel" onClick={() => setNewRow(null)}>Cancelar</button>
                </td>
              </tr>
            )}

            {filteredData.map((row, i) => (
              <tr key={row.id ?? i}>
                {columnOrder.map((col) => (
                  <td
                    key={col}
                    onDoubleClick={() => startEdit(i, col)}
                    className={editing.row === i && editing.col === col ? "editing" : ""}
                  >
                    {editing.row === i && editing.col === col ? (
                      <input
                        className="cell-input"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        inputMode={isNumericCol(col) ? "decimal" : undefined}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur(); 
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing({ row: null, col: null });
                          }
                        }}
                        onBlur={() => saveEdit(i, col, editValue)}  
                      />
                    ) : (
                      formatCell(col, row[col])
                    )}
                  </td>
                ))}

                <td className="acciones"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="floating-add-btn" onClick={addRow}>+</button>
    </div>
  );
}

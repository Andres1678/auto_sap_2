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

const DATE_COLS = new Set([
  "fecha_creacion",
  "fecha_cierre_sm",
  "fecha_entrega_oferta_final",
  "fecha_cierre_oportunidad",
  "fecha_firma_aos",
  "fecha_compromiso",
  "fecha_cierre",
]);

const REMOVE_COLS = new Set([
  "semestre",
  "vigencia_propuesta",
  "fecha_aceptacion_oferta",
  "fecha_acta_cierre_ot",
  "tipo_servicio",
  "semestre_ejecucion",
  "publicacion_sharepoint",
]);

const ESTADO_RESULTADO = {
  REGISTRO: ["OPORTUNIDAD EN PROCESO"],
  PROSPECCION: ["OPORTUNIDAD EN PROCESO"],
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACIÓN": ["OPORTUNIDAD EN PROCESO"],
  "PENDIENTE APROBACION SAP": ["PENDIENTE APROBACION SAP"],
  "EN ELABORACION": ["OPORTUNIDAD EN PROCESO"],
  "RFI PRESENTADO": ["A LA ESPERA DEL RFP"],
  "ENTREGA COMERCIAL": ["OPORTUNIDAD EN PROCESO"],
  GANADA: [
    "BOLSA DE HORAS / CONTINUIDAD DE LA OPERACIÓN",
    "EVOLUTIVO",
    "PROYECTO",
    "VAR",
    "VALORES AGREGADOS",
    "LICENCIAMIENTO",
  ],
  PERDIDA: ["OPORTUNIDAD PERDIDA"],
  "PERDIDA - SIN FEEDBACK": ["OPORTUNIDAD CERRADA"],
  DECLINADA: ["OPORTUNIDAD CERRADA"],
  SUSPENDIDA: ["OPORTUNIDAD CERRADA"],
  "0TL": ["0TL"],
  "0TP": ["0TP"],
  "0TE": ["0TE"],
  "N/A": ["N/A"],
};

const CATEGORIA_SUBCATEGORIA = {
  CLIENTE: ["PRESUPUESTO NO ASIGNADO", "SUSPENDE POR DIRECTRIZ INTERNA"],
  COMPETENCIA: ["MEJOR POSICIONAMIENTO", "CONDICIONES CONTRACTUALES", "PRESENCIA LOCAL"],
  PRECIO: ["TARIFA NO COMPETITIVA", "NO CUMPLE PRESUPUESTO"],
  PRODUCTO: [
    "OTRO PORTAFOLIO DE SOLUCION",
    "PRODUCTO NO SATISFACE LAS NECESIDADES",
    "SOLUCION PROPUESTA NO CUMPLIO",
    "TARIFA NO COMPETITIVA",
  ],
  REASIGNADO: ["SERVICIO DE CLARO EXISTENTE", "REASIGNADO"],
  SEGUIMIENTO: ["COMERCIAL", "CLIENTE NO RESPONDE"],
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

function isNumericCol(col) {
  return NUMERIC_COLS.has(col);
}

function isDateCol(col) {
  return DATE_COLS.has(col);
}

function isObservationsCol(col) {
  return col === "observaciones" || col === "seguimiento_ot";
}

function toIsoDate(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
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
  if (isDateCol(col)) return value ? toIsoDate(value) : "-";
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
  const [editingContext, setEditingContext] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editValue, setEditValue] = useState("");

  const baseColumnOrder = useMemo(
    () => [
      "nombre_cliente",
      "servicio",
      "fecha_creacion",
      "semestre",
      "tipo_cliente",
      "tipo_solicitud",
      "caso_sm",
      "fecha_cierre_sm",
      "salesforce",
      "ultimos_6_meses",
      "ultimo_mes",
      "retraso",
      "estado_oferta",
      "resultado_oferta",
      "calificacion_oportunidad",
      "origen_oportunidad",
      "direccion_comercial",
      "gerencia_comercial",
      "comercial_asignado",
      "consultor_comercial",
      "comercial_asignado_hitss",
      "observaciones",
      "categoria_perdida",
      "subcategoria_perdida",
      "fecha_entrega_oferta_final",
      "vigencia_propuesta",
      "fecha_aceptacion_oferta",
      "tipo_moneda",
      "otc",
      "mrc",
      "mrc_normalizado",
      "valor_oferta_claro",
      "duracion",
      "pais",
      "fecha_cierre_oportunidad",
      "codigo_prc",
      "fecha_firma_aos",
      "pm_asignado_claro",
      "pm_asignado_global_hitss",
      "descripcion_ot",
      "num_enlace",
      "num_incidente",
      "num_ot",
      "estado_ot",
      "proyeccion_ingreso",
      "fecha_compromiso",
      "fecha_cierre",
      "estado_proyecto",
      "anio_creacion_ot",
      "fecha_acta_cierre_ot",
      "seguimiento_ot",
      "tipo_servicio",
      "semestre_ejecucion",
      "publicacion_sharepoint",
    ],
    []
  );

  const columnOrder = useMemo(
    () => baseColumnOrder.filter((c) => !REMOVE_COLS.has(c)),
    [baseColumnOrder]
  );

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
          value: v ?? "",
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
      if (isDateCol(col)) out[col] = v ? toIsoDate(v) : null;
      else if (isNumericCol(col)) {
        if (col === "mrc_normalizado") out[col] = null;
        else {
          const parsed = parseNumberSmart(v);
          out[col] = parsed === "" ? null : parsed;
        }
      } else out[col] = v === undefined || v === null ? null : v;
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
        body: form,
      });

      const json = await res.json();
      Swal.fire({
        icon: res.ok ? "success" : "error",
        title: json.mensaje || "Resultado de carga",
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

  const highlightRow = (index) => {
    setTimeout(() => {
      const rows = document.querySelectorAll("tbody tr");
      const offset = newRow ? 1 : 0;
      rows[index + offset]?.classList.add("row-success");
      setTimeout(() => rows[index + offset]?.classList.remove("row-success"), 1600);
    }, 50);
  };

  const startEdit = (rowIndex, col) => {
    const row = filteredData[rowIndex];
    if (!row) return;

    if (col === "mrc_normalizado") {
      Swal.fire("Info", "Este campo se calcula automáticamente (OTC/12 + MRC).", "info");
      return;
    }

    setEditing({ row: rowIndex, col });
    setEditingContext({
      cliente: row?.nombre_cliente ?? "-",
      servicio: row?.servicio ?? "-",
      col,
    });

    const v = row[col];
    if (isDateCol(col)) setEditValue(toIsoDate(v));
    else if (!isNumericCol(col)) setEditValue(v ?? "");
    else {
      const n = typeof v === "number" ? v : parseNumberSmart(v);
      setEditValue(n === "" ? (v ?? "") : String(n));
    }
  };

  const saveEdit = async (rowIndex, col, newValue) => {
    const row = filteredData?.[rowIndex];

    if (!row || !row.id) {
      setEditing({ row: null, col: null });
      setEditingContext(null);
      return;
    }

    const original = row?.[col];
    if (String(original ?? "") === String(newValue ?? "")) {
      setEditing({ row: null, col: null });
      setEditingContext(null);
      return;
    }

    try {
      let coercedValue = newValue;

      if (isDateCol(col)) coercedValue = toIsoDate(newValue);
      else if (isNumericCol(col)) coercedValue = parseNumberSmart(newValue);

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
        setEditingContext(null);
        return;
      }

      setData((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));
      setFilteredData((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));

      highlightRow(rowIndex);
      setEditing({ row: null, col: null });
      setEditingContext(null);
    } catch (e) {
      Swal.fire("Error", e?.message || "Error inesperado", "error");
      setEditing({ row: null, col: null });
      setEditingContext(null);
    }
  };

  const editLongText = async (rowIndex, col) => {
    const row = filteredData[rowIndex];
    if (!row?.id) return;

    const cliente = row?.nombre_cliente ?? "-";
    const servicio = row?.servicio ?? "-";

    const current = row?.[col] ?? "";
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const stamp = `${yyyy}-${mm}-${dd}`;

    const res = await Swal.fire({
      title: col === "observaciones" ? "Observaciones" : "Seguimiento OT",
      html: `<div style="text-align:left;font-size:13px;margin-bottom:8px;">
              <b>Cliente:</b> ${cliente}<br/>
              <b>Servicio:</b> ${servicio}
            </div>`,
      input: "textarea",
      inputValue: current,
      inputAttributes: { style: "min-height:220px" },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      showDenyButton: true,
      denyButtonText: "Agregar entrada semanal",
      preConfirm: (val) => val,
    });

    if (res.isDismissed) return;

    if (res.isDenied) {
      const nextValue = `${current ? current + "\n" : ""}${stamp} - `;
      await saveEdit(rowIndex, col, nextValue);
      return;
    }

    if (res.isConfirmed) {
      await saveEdit(rowIndex, col, res.value ?? "");
    }
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

  const renderEditorCell = (row, i, col) => {
    if (editing.row !== i || editing.col !== col) return null;

    if (isDateCol(col)) {
      return (
        <input
          className="cell-input"
          type="date"
          autoFocus
          value={toIsoDate(editValue)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing({ row: null, col: null });
              setEditingContext(null);
            }
          }}
          onBlur={() => saveEdit(i, col, toIsoDate(editValue))}
        />
      );
    }

    if (col === "tipo_moneda") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(i, col, editValue)}
        >
          <option value="">-</option>
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
      );
    }

    if (col === "estado_oferta") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const estado = e.target.value;
            setEditValue(estado);
            const allowed = ESTADO_RESULTADO[estado] || [];
            const auto = allowed.length === 1 ? allowed[0] : "";
            setData((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? { ...r, estado_oferta: estado, resultado_oferta: auto || r.resultado_oferta }
                  : r
              )
            );
            setFilteredData((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? { ...r, estado_oferta: estado, resultado_oferta: auto || r.resultado_oferta }
                  : r
              )
            );
          }}
          onBlur={() => saveEdit(i, col, editValue)}
        >
          <option value="">-</option>
          {Object.keys(ESTADO_RESULTADO).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "resultado_oferta") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(i, col, editValue)}
        >
          <option value="">-</option>
          {(ESTADO_RESULTADO[row.estado_oferta] || []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "categoria_perdida") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => {
            const cat = e.target.value;
            setEditValue(cat);
            const allowed = CATEGORIA_SUBCATEGORIA[cat] || [];
            const auto = allowed.length === 1 ? allowed[0] : "";
            setData((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? { ...r, categoria_perdida: cat, subcategoria_perdida: auto || r.subcategoria_perdida }
                  : r
              )
            );
            setFilteredData((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? { ...r, categoria_perdida: cat, subcategoria_perdida: auto || r.subcategoria_perdida }
                  : r
              )
            );
          }}
          onBlur={() => saveEdit(i, col, editValue)}
        >
          <option value="">-</option>
          {Object.keys(CATEGORIA_SUBCATEGORIA).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col === "subcategoria_perdida") {
      return (
        <select
          className="cell-input"
          autoFocus
          value={editValue ?? ""}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(i, col, editValue)}
        >
          <option value="">-</option>
          {(CATEGORIA_SUBCATEGORIA[row.categoria_perdida] || []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    return (
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
            setEditingContext(null);
          }
        }}
        onBlur={() => saveEdit(i, col, editValue)}
      />
    );
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

      {editingContext && (
        <div className="edit-context-bar">
          <strong>Editando:</strong> {editingContext.cliente} | {editingContext.servicio}
          <span style={{ marginLeft: 10 }}>
            <strong>Campo:</strong> {editingContext.col}
          </span>
        </div>
      )}

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
                    {col === "mrc_normalizado" ? (
                      <span>-</span>
                    ) : isDateCol(col) ? (
                      <input
                        className="cell-input"
                        type="date"
                        value={toIsoDate(newRow[col])}
                        onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                      />
                    ) : col === "tipo_moneda" ? (
                      <select
                        className="cell-input"
                        value={newRow[col] ?? ""}
                        onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                      >
                        <option value="">-</option>
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                      </select>
                    ) : col === "resultado_oferta" ? (
                      <select
                        className="cell-input"
                        value={newRow[col] ?? ""}
                        onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                      >
                        <option value="">-</option>
                        {(ESTADO_RESULTADO[newRow.estado_oferta] || []).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : col === "estado_oferta" ? (
                      <select
                        className="cell-input"
                        value={newRow[col] ?? ""}
                        onChange={(e) => {
                          const estado = e.target.value;
                          const allowed = ESTADO_RESULTADO[estado] || [];
                          const auto = allowed.length === 1 ? allowed[0] : "";
                          setNewRow((p) => ({
                            ...p,
                            estado_oferta: estado,
                            resultado_oferta: auto || p.resultado_oferta,
                          }));
                        }}
                      >
                        <option value="">-</option>
                        {Object.keys(ESTADO_RESULTADO).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : col === "subcategoria_perdida" ? (
                      <select
                        className="cell-input"
                        value={newRow[col] ?? ""}
                        onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                      >
                        <option value="">-</option>
                        {(CATEGORIA_SUBCATEGORIA[newRow.categoria_perdida] || []).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : col === "categoria_perdida" ? (
                      <select
                        className="cell-input"
                        value={newRow[col] ?? ""}
                        onChange={(e) => {
                          const cat = e.target.value;
                          const allowed = CATEGORIA_SUBCATEGORIA[cat] || [];
                          const auto = allowed.length === 1 ? allowed[0] : "";
                          setNewRow((p) => ({
                            ...p,
                            categoria_perdida: cat,
                            subcategoria_perdida: auto || p.subcategoria_perdida,
                          }));
                        }}
                      >
                        <option value="">-</option>
                        {Object.keys(CATEGORIA_SUBCATEGORIA).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : isObservationsCol(col) ? (
                      <button
                        className="btn-edit-long"
                        onClick={() => editLongText(-1, col)}
                        disabled
                      >
                        Editar
                      </button>
                    ) : (
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
                    )}
                  </td>
                ))}
                <td className="acciones">
                  <button className="btn-save" onClick={saveNewRow} disabled={loading}>
                    Guardar
                  </button>
                  <button className="btn-cancel" onClick={() => setNewRow(null)} disabled={loading}>
                    Cancelar
                  </button>
                </td>
              </tr>
            )}

            {filteredData.map((row, i) => (
              <tr key={row.id ?? i}>
                {columnOrder.map((col) => (
                  <td
                    key={col}
                    onDoubleClick={() => {
                      if (isObservationsCol(col)) return editLongText(i, col);
                      startEdit(i, col);
                    }}
                    className={editing.row === i && editing.col === col ? "editing" : ""}
                  >
                    {editing.row === i && editing.col === col ? (
                      renderEditorCell(row, i, col)
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

      <button className="floating-add-btn" onClick={addRow} disabled={loading}>
        +
      </button>
    </div>
  );
}

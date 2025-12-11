import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import "./Oportunidades.css";
import { jfetch } from "./lib/api";

export default function Oportunidades() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [uniqueValues, setUniqueValues] = useState({});
  const [filters, setFilters] = useState({});
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState({ row: null, col: null });
  const [newRow, setNewRow] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ORDEN EXACTO COMO VIENE DEL EXCEL */
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

      setData(json);
      setFilteredData(json);

      // Construir valores únicos para filtros
      const uniq = {};
      columnOrder.forEach((col) => {
        const values = [...new Set(json.map((r) => r[col] ?? ""))];
        uniq[col] = values.map((v) => ({
          label: v?.toString() || "-",
          value: v ?? ""
        }));
      });

      setUniqueValues(uniq);

    } catch {
      Swal.fire("Error", "No se pudo cargar la información", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* =======================================================
        SUBIR ARCHIVO
  ======================================================= */
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

  /* =======================================================
        FILTROS TIPO EXCEL
  ======================================================= */
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

  /* =======================================================
        EDICIÓN DE CELDAS
  ======================================================= */
  const startEdit = (rowIndex, col) => {
    setEditing({ row: rowIndex, col });
  };

  const saveEdit = async (rowIndex, col, newValue) => {
    const row = filteredData[rowIndex];
    const updated = { ...row, [col]: newValue };

    await jfetch(`/oportunidades/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    });

    const updatedList = [...filteredData];
    updatedList[rowIndex] = updated;
    setFilteredData(updatedList);

    highlightRow(rowIndex);
    setEditing({ row: null, col: null });
  };

  const highlightRow = (index) => {
    setTimeout(() => {
      const rows = document.querySelectorAll("tbody tr");
      rows[index]?.classList.add("row-success");
      setTimeout(() => rows[index]?.classList.remove("row-success"), 1600);
    }, 50);
  };

  /* =======================================================
        AGREGAR NUEVA FILA
  ======================================================= */
  const addRow = () => {
    const empty = {};
    columnOrder.forEach((c) => (empty[c] = ""));
    setNewRow(empty);
  };

  const saveNewRow = async () => {
    const res = await jfetch("/oportunidades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRow),
    });

    const json = await res.json();

    if (res.ok) {
      setFilteredData((prev) => [...prev, json]);
      Swal.fire("Guardado", "Nueva fila creada", "success");
      setNewRow(null);
    } else {
      Swal.fire("Error", json.mensaje || "No se pudo crear el registro", "error");
    }
  };

  /* =======================================================
        RENDER
  ======================================================= */
  return (
    <div className="oportunidades-wrapper">
      <h2>Gestión de Oportunidades</h2>

      {/* SUBIR ARCHIVO */}
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

      {/* TABLA */}
      <div className="tabla-scroll">
        <table className="tabla-oportunidades">
          <thead>
            {/* HEADER */}
            <tr>
              {columnOrder.map((col) => (
                <th key={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
              ))}
              <th>ACCIONES</th>
            </tr>

            {/* FILTROS */}
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

            {/* NUEVA FILA */}
            {newRow && (
              <tr className="new-row">
                {columnOrder.map((col) => (
                  <td key={col}>
                    <input
                      className="cell-input"
                      value={newRow[col]}
                      onChange={(e) =>
                        setNewRow({ ...newRow, [col]: e.target.value })
                      }
                    />
                  </td>
                ))}
                <td className="acciones">
                  <button className="btn-save" onClick={saveNewRow}>Guardar</button>
                  <button className="btn-cancel" onClick={() => setNewRow(null)}>Cancelar</button>
                </td>
              </tr>
            )}

            {/* DATOS */}
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
                        defaultValue={row[col]}
                        onBlur={(e) => saveEdit(i, col, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(i, col, e.target.value)}
                      />
                    ) : (
                      row[col] ?? "-"
                    )}
                  </td>
                ))}

                <td className="acciones">
                  {/* En el futuro puedes poner botones "Editar" / "Eliminar" aquí */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* BOTÓN FLOTANTE */}
      <button className="floating-add-btn" onClick={addRow}>+</button>
    </div>
  );
}

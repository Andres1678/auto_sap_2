import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const INITIAL_FILTERS = {
  q: "",
  estado: "",
  prioridad: "",
  categoria: "",
  compania: "",
  asignado_a: "",
  fecha_desde: "",
  fecha_hasta: "",
};

function getAuthHeaders() {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("token") ||
    "";

  let user = null;

  try {
    user = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || "{}");
  } catch {
    user = {};
  }

  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (user?.usuario) {
    headers["X-User-Usuario"] = user.usuario;
  }

  if (user?.rol) {
    headers["X-User-Rol"] = user.rol;
  }

  return headers;
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      searchParams.append(key, String(value).trim());
    }
  });

  return searchParams.toString();
}

function formatBool(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function BaseCoeSapFuncional() {
  const principalInputRef = useRef(null);
  const adicionalInputRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [filtersOptions, setFiltersOptions] = useState({
    categoria: [],
    prioridad: [],
    estado: [],
    asignado_a: [],
    compania: [],
    subcategoria: [],
    modelo: [],
    impacto: [],
    urgencia: [],
  });

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [uploadingPrincipal, setUploadingPrincipal] = useState(false);
  const [uploadingAdicional, setUploadingAdicional] = useState(false);

  const queryString = useMemo(() => {
    return buildQuery({
      ...appliedFilters,
      page,
      page_size: pageSize,
    });
  }, [appliedFilters, page, pageSize]);

  const fetchFilters = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/coe-sap-funcional/filters`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.mensaje || data?.error || "No se pudieron cargar los filtros");
      }

      setFiltersOptions({
        categoria: data.categoria || [],
        prioridad: data.prioridad || [],
        estado: data.estado || [],
        asignado_a: data.asignado_a || [],
        compania: data.compania || [],
        subcategoria: data.subcategoria || [],
        modelo: data.modelo || [],
        impacto: data.impacto || [],
        urgencia: data.urgencia || [],
      });
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/coe-sap-funcional?${queryString}`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.mensaje || data?.error || "No se pudo cargar la información");
      }

      setRows(data.data || []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.total_pages || 1));
    } catch (error) {
      console.error(error);

      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo cargar la base COE SAP Funcional",
      });
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const uploadFile = async ({ type }) => {
    const isPrincipal = type === "principal";
    const inputRef = isPrincipal ? principalInputRef : adicionalInputRef;
    const file = inputRef.current?.files?.[0];

    if (!file) {
      Swal.fire({
        icon: "warning",
        title: "Archivo requerido",
        text: "Selecciona un archivo Excel o CSV para continuar.",
      });
      return;
    }

    if (isPrincipal) {
      const confirm = await Swal.fire({
        icon: "warning",
        title: "Carga principal",
        text: "La carga principal reemplaza toda la información actual de esta base. ¿Deseas continuar?",
        showCancelButton: true,
        confirmButtonText: "Sí, cargar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#DA291C",
      });

      if (!confirm.isConfirmed) return;
    }

    const formData = new FormData();
    formData.append("file", file);

    if (isPrincipal) {
      setUploadingPrincipal(true);
    } else {
      setUploadingAdicional(true);
    }

    try {
      const endpoint = isPrincipal
        ? `${API_BASE}/coe-sap-funcional/import-principal`
        : `${API_BASE}/coe-sap-funcional/import-adicional`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.mensaje || data?.error || "No se pudo procesar el archivo");
      }

      inputRef.current.value = "";

      await Swal.fire({
        icon: "success",
        title: "Carga realizada",
        html: `
          <div style="text-align:left">
            <p><b>Mensaje:</b> ${data.mensaje || "Proceso finalizado"}</p>
            <p><b>Total recibidos:</b> ${data.total_recibidos ?? "-"}</p>
            <p><b>Insertados:</b> ${data.insertados ?? "-"}</p>
            ${
              data.actualizados !== undefined
                ? `<p><b>Actualizados:</b> ${data.actualizados}</p>`
                : ""
            }
          </div>
        `,
      });

      fetchFilters();
      fetchRows();
    } catch (error) {
      console.error(error);

      Swal.fire({
        icon: "error",
        title: "Error en la carga",
        text: error.message || "No se pudo cargar el archivo",
      });
    } finally {
      setUploadingPrincipal(false);
      setUploadingAdicional(false);
    }
  };

  const renderSelect = (label, field, options) => (
    <div className="coe-filter-field">
      <label>{label}</label>
      <select
        value={filters[field]}
        onChange={(e) => handleFilterChange(field, e.target.value)}
      >
        <option value="">Todos</option>
        {(options || []).map((item) => (
          <option key={`${field}-${item}`} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="coe-page">
      <div className="coe-header">
        <div>
          <h1>BASE DE REGISTRO DE INFORMACION COE SAP FUNCIONAL</h1>
          <p>
            Consulta, filtra y carga información principal o adicional de la base COE SAP
            Funcional.
          </p>
        </div>
      </div>

      <div className="coe-upload-grid">
        <div className="coe-upload-card">
          <h3>Carga principal</h3>
          <p>
            Reemplaza toda la información actual de la base y carga el archivo como fuente
            principal.
          </p>

          <div className="coe-upload-actions">
            <input
              ref={principalInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploadingPrincipal || uploadingAdicional}
            />

            <button
              type="button"
              className="btn btn-danger"
              disabled={uploadingPrincipal || uploadingAdicional}
              onClick={() => uploadFile({ type: "principal" })}
            >
              {uploadingPrincipal ? "Cargando..." : "Cargar principal"}
            </button>
          </div>
        </div>

        <div className="coe-upload-card">
          <h3>Carga adicional</h3>
          <p>
            Agrega nuevos registros o actualiza los existentes usando el campo{" "}
            <b>Número</b> como identificador.
          </p>

          <div className="coe-upload-actions">
            <input
              ref={adicionalInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploadingPrincipal || uploadingAdicional}
            />

            <button
              type="button"
              className="btn btn-dark"
              disabled={uploadingPrincipal || uploadingAdicional}
              onClick={() => uploadFile({ type: "adicional" })}
            >
              {uploadingAdicional ? "Cargando..." : "Cargar adicional"}
            </button>
          </div>
        </div>
      </div>

      <div className="coe-filters-card">
        <div className="coe-filters-title">
          <h3>Filtros</h3>
        </div>

        <div className="coe-filters-grid">
          <div className="coe-filter-field coe-filter-search">
            <label>Búsqueda general</label>
            <input
              type="text"
              value={filters.q}
              placeholder="Número, título, asignado, contacto, compañía..."
              onChange={(e) => handleFilterChange("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleApplyFilters();
                }
              }}
            />
          </div>

          {renderSelect("Estado", "estado", filtersOptions.estado)}
          {renderSelect("Prioridad", "prioridad", filtersOptions.prioridad)}
          {renderSelect("Categoría", "categoria", filtersOptions.categoria)}
          {renderSelect("Compañía", "compania", filtersOptions.compania)}
          {renderSelect("Asignado a", "asignado_a", filtersOptions.asignado_a)}

          <div className="coe-filter-field">
            <label>Fecha desde</label>
            <input
              type="date"
              value={filters.fecha_desde}
              onChange={(e) => handleFilterChange("fecha_desde", e.target.value)}
            />
          </div>

          <div className="coe-filter-field">
            <label>Fecha hasta</label>
            <input
              type="date"
              value={filters.fecha_hasta}
              onChange={(e) => handleFilterChange("fecha_hasta", e.target.value)}
            />
          </div>
        </div>

        <div className="coe-filters-actions">
          <button type="button" className="btn btn-danger" onClick={handleApplyFilters}>
            Buscar
          </button>

          <button type="button" className="btn btn-light" onClick={handleClearFilters}>
            Limpiar
          </button>
        </div>
      </div>

      <div className="coe-table-card">
        <div className="coe-table-toolbar">
          <div>
            <h3>Información cargada</h3>
            <span>{total} registros encontrados</span>
          </div>

          <div className="coe-page-size">
            <label>Mostrar</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="coe-table-wrapper">
          <table className="coe-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Categoría</th>
                <th>Fecha de entrega</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Título</th>
                <th>Fecha resolución</th>
                <th>Asignado a</th>
                <th>Contacto</th>
                <th>Incumplimiento SLA</th>
                <th>Alerta</th>
                <th>Estado alerta ANS</th>
                <th>Impacto</th>
                <th>Urgencia</th>
                <th>Compañía</th>
                <th>Subcategoría</th>
                <th>Modelo</th>
                <th>ID interacción</th>
                <th>Origen cargue</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={19} className="coe-empty">
                    Cargando información...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={19} className="coe-empty">
                    No hay información para mostrar.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id || row.numero}>
                    <td>{formatText(row.numero)}</td>
                    <td>{formatText(row.categoria)}</td>
                    <td>{formatText(row.fechaEntrega)}</td>
                    <td>{formatText(row.prioridad)}</td>
                    <td>{formatText(row.estado)}</td>
                    <td className="coe-title-cell" title={row.titulo || ""}>
                      {formatText(row.titulo)}
                    </td>
                    <td>{formatText(row.fechaResolucion)}</td>
                    <td>{formatText(row.asignadoA)}</td>
                    <td>{formatText(row.nombreCompletoContacto)}</td>
                    <td>{formatBool(row.incumplimientoSla)}</td>
                    <td>{formatBool(row.alerta)}</td>
                    <td>{formatText(row.estadoAlertaAns)}</td>
                    <td>{formatText(row.impacto)}</td>
                    <td>{formatText(row.urgencia)}</td>
                    <td>{formatText(row.compania)}</td>
                    <td>{formatText(row.subcategoria)}</td>
                    <td>{formatText(row.modelo)}</td>
                    <td>{formatText(row.idInteraccion)}</td>
                    <td>{formatText(row.origenCargue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="coe-pagination">
          <button
            type="button"
            className="btn btn-light"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          >
            Anterior
          </button>

          <span>
            Página <b>{page}</b> de <b>{totalPages}</b>
          </span>

          <button
            type="button"
            className="btn btn-light"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./BaseCoeSapFuncional.css";

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

const COLUMNS = [
  { key: "numero", label: "Número", w: 16, cls: "mono strong" },
  { key: "categoria", label: "Categoría", w: 22 },
  { key: "fechaEntrega", label: "Fecha entrega", w: 20, cls: "mono" },
  { key: "prioridad", label: "Prioridad", w: 14, cls: "pill-priority" },
  { key: "estado", label: "Estado", w: 18, cls: "pill-status" },
  { key: "titulo", label: "Título", w: 50, cls: "clip-2" },
  { key: "fechaResolucion", label: "Fecha resolución", w: 20, cls: "mono" },
  { key: "asignadoA", label: "Asignado a", w: 26 },
  { key: "nombreCompletoContacto", label: "Contacto", w: 28 },
  { key: "incumplimientoSla", label: "Inc. SLA", w: 12, cls: "center" },
  { key: "alerta", label: "Alerta", w: 11, cls: "center" },
  { key: "estadoAlertaAns", label: "Estado ANS", w: 15 },
  { key: "impacto", label: "Impacto", w: 14 },
  { key: "urgencia", label: "Urgencia", w: 14 },
  { key: "compania", label: "Compañía", w: 32 },
  { key: "subcategoria", label: "Subcategoría", w: 24 },
  { key: "modelo", label: "Modelo", w: 26 },
  { key: "idInteraccion", label: "ID interacción", w: 18, cls: "mono" },
  { key: "origenCargue", label: "Origen", w: 14, cls: "center" },
];

function readStoredUser() {
  try {
    const raw =
      localStorage.getItem("userData") ||
      localStorage.getItem("user") ||
      sessionStorage.getItem("userData") ||
      sessionStorage.getItem("user") ||
      "{}";

    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizePermisos(user) {
  const raw = user?.permisos || user?.user?.permisos || [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((p) => (typeof p === "string" ? p : p?.codigo || p?.code || p?.nombre))
    .filter(Boolean)
    .map((p) => String(p).trim().toUpperCase());
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatBool(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "—";
}

function getStatusClass(value) {
  const s = String(value || "").toUpperCase();

  if (s.includes("RESUELTO") || s.includes("CERRADO") || s.includes("SOLUCIONADO")) {
    return "ok";
  }

  if (s.includes("PENDIENTE") || s.includes("ABIERTO") || s.includes("ASIGNADO")) {
    return "warn";
  }

  if (s.includes("VENCIDO") || s.includes("INCUMPL")) {
    return "danger";
  }

  return "neutral";
}

function getPriorityClass(value) {
  const s = String(value || "").toUpperCase();

  if (s.includes("CRITICA") || s.includes("CRÍTICA") || s.includes("ALTA")) {
    return "danger";
  }

  if (s.includes("MEDIA")) {
    return "warn";
  }

  if (s.includes("BAJA")) {
    return "ok";
  }

  return "neutral";
}

export default function BaseCoeSapFuncional() {
  const principalInputRef = useRef(null);
  const adicionalInputRef = useRef(null);

  const user = useMemo(() => readStoredUser(), []);
  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const nombre = user?.nombre || user?.user?.nombre || "";
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");
  const canImport = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

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
  const [totalPagesApi, setTotalPagesApi] = useState(1);

  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [uploadingPrincipal, setUploadingPrincipal] = useState(false);
  const [uploadingAdicional, setUploadingAdicional] = useState(false);

  const totalPages = Math.max(1, Number(totalPagesApi || Math.ceil(total / pageSize) || 1));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams();

    qs.set("page", String(page));
    qs.set("page_size", String(pageSize));

    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        qs.set(key, String(value).trim());
      }
    });

    return qs.toString();
  }, [page, pageSize, appliedFilters]);

  const fetchFilters = useCallback(async () => {
    if (!canView) return;

    setLoadingFilters(true);

    try {
      const res = await jfetch("/coe-sap-funcional/filters", {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = data?.error || data?.detalle || data?.trace || "";
        throw new Error(
            detail
            ? `${data?.mensaje || "Error procesando archivo"}: ${detail}`
            : data?.mensaje || `HTTP ${res.status}`
        );
        }

      setFiltersOptions({
        categoria: data?.categoria || [],
        prioridad: data?.prioridad || [],
        estado: data?.estado || [],
        asignado_a: data?.asignado_a || [],
        compania: data?.compania || [],
        subcategoria: data?.subcategoria || [],
        modelo: data?.modelo || [],
        impacto: data?.impacto || [],
        urgencia: data?.urgencia || [],
      });
    } catch (error) {
      console.error("Error cargando filtros COE SAP Funcional:", error);
    } finally {
      setLoadingFilters(false);
    }
  }, [canView, commonHeaders]);

  const fetchRows = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery();

      const res = await jfetch(`/coe-sap-funcional?${qs}`, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
      }

      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.total || 0));
      setTotalPagesApi(Number(data?.total_pages || 1));
    } catch (error) {
      console.error("Error listando COE SAP Funcional:", error);
      setRows([]);
      setTotal(0);
      setTotalPagesApi(1);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar la base",
        text:
          error?.message ||
          "Revisa que el backend esté activo y que la ruta /coe-sap-funcional exista.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, buildQuery]);

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

  const handleBuscar = () => {
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const limpiarFiltros = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const triggerPrincipal = () => {
    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para importar esta base.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    principalInputRef.current?.click();
  };

  const triggerAdicional = () => {
    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para importar esta base.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    adicionalInputRef.current?.click();
  };

  const uploadFile = async (file, tipo) => {
    if (!file) return;

    const isPrincipal = tipo === "principal";

    if (isPrincipal) {
      const confirm = await Swal.fire({
        icon: "warning",
        title: "Carga principal",
        text: "Esta acción reemplazará toda la información actual de la base COE SAP Funcional.",
        showCancelButton: true,
        confirmButtonText: "Sí, reemplazar",
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
        ? "/coe-sap-funcional/import-principal"
        : "/coe-sap-funcional/import-adicional";

      const res = await jfetch(endpoint, {
        method: "POST",
        headers: commonHeaders,
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Carga realizada",
        html: `
          <div style="text-align:left">
            <p><b>Mensaje:</b> ${data?.mensaje || "Proceso finalizado"}</p>
            <p><b>Total recibidos:</b> ${data?.total_recibidos ?? "—"}</p>
            <p><b>Insertados:</b> ${data?.insertados ?? "—"}</p>
            ${
              data?.actualizados !== undefined
                ? `<p><b>Actualizados:</b> ${data.actualizados}</p>`
                : ""
            }
          </div>
        `,
        confirmButtonColor: "#008C67",
      });

      if (principalInputRef.current) principalInputRef.current.value = "";
      if (adicionalInputRef.current) adicionalInputRef.current.value = "";

      fetchFilters();
      fetchRows();
    } catch (error) {
      console.error("Error importando COE SAP Funcional:", error);

      Swal.fire({
        icon: "error",
        title: "Error en la carga",
        text: error?.message || "No se pudo procesar el archivo.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setUploadingPrincipal(false);
      setUploadingAdicional(false);
    }
  };

  const renderSelect = (label, field, options) => (
    <label className="coe-filter">
      <span>{label}</span>
      <select
        value={filters[field]}
        onChange={(e) => handleFilterChange(field, e.target.value)}
        disabled={loadingFilters}
      >
        <option value="">Todos</option>
        {(options || []).map((item) => (
          <option key={`${field}-${item}`} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );

  if (!canView) {
    return (
      <div className="coe-page">
        <div className="coe-access-card">
          <div className="coe-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta información.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coe-page">
      <section className="coe-hero">
        <div>
          <span className="coe-eyebrow">Base principal</span>
          <h1>BASE DE REGISTRO DE INFORMACION COE SAP FUNCIONAL</h1>
          <p>
            Consulta, filtra y carga información principal o adicional desde archivos
            Excel o CSV.
          </p>
        </div>

        <div className="coe-hero-stats">
          <div className="coe-stat">
            <span>Total registros</span>
            <strong>{total.toLocaleString("es-CO")}</strong>
          </div>
          <div className="coe-stat">
            <span>Usuario</span>
            <strong>{nombre || "Usuario"}</strong>
          </div>
        </div>
      </section>

      <section className="coe-upload-grid">
        <article className="coe-upload-card principal">
          <div className="coe-upload-icon">📌</div>
          <div>
            <h3>Carga principal</h3>
            <p>Reemplaza toda la información actual y deja el archivo como base oficial.</p>
          </div>

          <input
            ref={principalInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => uploadFile(e.target.files?.[0], "principal")}
          />

          <button
            type="button"
            className="coe-btn danger"
            onClick={triggerPrincipal}
            disabled={uploadingPrincipal || uploadingAdicional}
          >
            {uploadingPrincipal ? "Cargando..." : "Cargar principal"}
          </button>
        </article>

        <article className="coe-upload-card adicional">
          <div className="coe-upload-icon">➕</div>
          <div>
            <h3>Carga adicional</h3>
            <p>Inserta nuevos registros o actualiza los existentes usando el campo Número.</p>
          </div>

          <input
            ref={adicionalInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => uploadFile(e.target.files?.[0], "adicional")}
          />

          <button
            type="button"
            className="coe-btn dark"
            onClick={triggerAdicional}
            disabled={uploadingPrincipal || uploadingAdicional}
          >
            {uploadingAdicional ? "Cargando..." : "Cargar adicional"}
          </button>
        </article>
      </section>

      <section className="coe-card coe-filters-card">
        <div className="coe-card-head">
          <div>
            <h2>Filtros de consulta</h2>
            <p>Busca por número, título, asignado, compañía, estado o rango de fechas.</p>
          </div>

          <button className="coe-btn ghost" type="button" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>

        <div className="coe-filters-grid">
          <label className="coe-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="Número, título, contacto, compañía..."
              onChange={(e) => handleFilterChange("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBuscar();
              }}
            />
          </label>

          {renderSelect("Estado", "estado", filtersOptions.estado)}
          {renderSelect("Prioridad", "prioridad", filtersOptions.prioridad)}
          {renderSelect("Categoría", "categoria", filtersOptions.categoria)}
          {renderSelect("Compañía", "compania", filtersOptions.compania)}
          {renderSelect("Asignado a", "asignado_a", filtersOptions.asignado_a)}

          <label className="coe-filter">
            <span>Fecha desde</span>
            <input
              type="date"
              value={filters.fecha_desde}
              onChange={(e) => handleFilterChange("fecha_desde", e.target.value)}
            />
          </label>

          <label className="coe-filter">
            <span>Fecha hasta</span>
            <input
              type="date"
              value={filters.fecha_hasta}
              onChange={(e) => handleFilterChange("fecha_hasta", e.target.value)}
            />
          </label>
        </div>

        <div className="coe-actions">
          <button className="coe-btn danger" type="button" onClick={handleBuscar} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>

          <button className="coe-btn light" type="button" onClick={limpiarFiltros} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      <section className="coe-card coe-table-card">
        <div className="coe-table-head">
          <div>
            <h2>Información cargada</h2>
            <p>
              Total: <b>{total.toLocaleString("es-CO")}</b> registros • Página{" "}
              <b>{page}</b> de <b>{totalPages}</b>
            </p>
          </div>

          <div className="coe-page-size">
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              {[25, 50, 100, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}/página
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="coe-table-wrap">
          <table className="coe-table">
            <colgroup>
              {COLUMNS.map((col) => (
                <col key={col.key} style={{ width: `${col.w}ch` }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="coe-empty">
                    <div className="coe-loader" />
                    Cargando información...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="coe-empty">
                    No hay información para mostrar.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.id || row.numero || "row"}-${index}`}>
                    {COLUMNS.map((col) => {
                      const value = row[col.key];

                      if (col.key === "incumplimientoSla" || col.key === "alerta") {
                        const boolValue = formatBool(value);
                        return (
                          <td key={col.key} className="center">
                            <span
                              className={`coe-mini-pill ${
                                value === true ? "danger" : value === false ? "ok" : "neutral"
                              }`}
                            >
                              {boolValue}
                            </span>
                          </td>
                        );
                      }

                      if (col.key === "estado") {
                        return (
                          <td key={col.key}>
                            <span className={`coe-pill ${getStatusClass(value)}`}>
                              {formatCell(value)}
                            </span>
                          </td>
                        );
                      }

                      if (col.key === "prioridad") {
                        return (
                          <td key={col.key}>
                            <span className={`coe-pill ${getPriorityClass(value)}`}>
                              {formatCell(value)}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={col.cls || ""}
                          title={col.cls?.includes("clip") ? formatCell(value) : undefined}
                        >
                          {formatCell(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="coe-pager">
          <button
            className="coe-btn icon"
            type="button"
            onClick={() => setPage(1)}
            disabled={!canPrev || loading}
          >
            ⏮
          </button>

          <button
            className="coe-btn icon"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev || loading}
          >
            ◀
          </button>

          <span>
            Página <b>{page}</b> de <b>{totalPages}</b>
          </span>

          <button
            className="coe-btn icon"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canNext || loading}
          >
            ▶
          </button>

          <button
            className="coe-btn icon"
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={!canNext || loading}
          >
            ⏭
          </button>
        </div>
      </section>
    </div>
  );
}
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./CalificacionCoeSapFuncional.css";

const INITIAL_FILTERS = {
  q: "",
  estado: "",
  sociedad: "",
  asignado_a: "",
  sistema: "",
  modulo: "",
  estado_consolidado: "",
};

const INITIAL_HOUR_FORM = {
  tipo: "ESTIMADA",
  modulo: "FI",
  horas: "",
  observacion: "",
};

const HOUR_TYPES = [
  { value: "ESTIMADA", label: "Estimada" },
  { value: "EJECUTADA", label: "Ejecutada" },
  { value: "GARANTIA", label: "Garantía" },
  { value: "PROYECTO_ABAP", label: "Proyecto ABAP" },
];

const MODULES = [
  "FI",
  "MM",
  "SD",
  "CO",
  "PS",
  "SLCM",
  "CRM",
  "CRM2",
  "PCA",
  "FM",
  "PP",
  "PM",
  "HCM",
  "SSFF",
  "FIORI",
  "WF",
  "ABAP",
  "BASIS",
  "PMO",
];

const TABLE_COLUMNS = [
  { key: "numero", label: "ID", w: 15, cls: "mono strong" },
  { key: "sistema", label: "Sistema", w: 10, cls: "center" },
  { key: "casoSm", label: "Caso SM", w: 17, cls: "mono" },
  { key: "sociedad", label: "Sociedad", w: 30 },
  { key: "asunto", label: "Asunto", w: 46, cls: "clip-2" },
  { key: "nombreSolicitante", label: "Solicitante", w: 25 },
  { key: "estado", label: "Estado", w: 18, cls: "status" },
  { key: "estadoConsolidado", label: "Estado consolidado", w: 20, cls: "status" },
  { key: "responsableEstado", label: "Responsable estado", w: 20 },
  { key: "asignadoA", label: "Asignado a", w: 25 },
  { key: "modulo", label: "Módulo", w: 12, cls: "center" },
  { key: "categoria", label: "Categoría", w: 22 },
  { key: "subcategoria", label: "Subcategoría", w: 22 },
  { key: "articulo", label: "Artículo", w: 24 },
  { key: "fechaAsignacion", label: "Fecha asignación", w: 20, cls: "mono" },
  { key: "fechaRespuesta", label: "Fecha respuesta", w: 20, cls: "mono" },
  { key: "fechaResolucion", label: "Fecha resolución", w: 20, cls: "mono" },
  { key: "fechaFinalizacionCierre", label: "Fecha cierre", w: 20, cls: "mono" },
  { key: "tiempoRespuesta", label: "T. respuesta", w: 13, cls: "right" },
  { key: "tiempoResolucion", label: "T. resolución", w: 13, cls: "right" },
  { key: "tiempoFinalizacionCierre", label: "T. cierre", w: 13, cls: "right" },
  { key: "fechaEstimacion", label: "Fecha estimación", w: 20, cls: "mono" },
  { key: "diasEntregaEstimacion", label: "Días estimación", w: 15, cls: "right" },
  { key: "estadoEstimacion", label: "Estado estimación", w: 18 },
  { key: "totalHorasFuncionales", label: "Total H. funcionales", w: 18, cls: "right number" },
  { key: "totalHorasEstimadas", label: "Total H. estimadas", w: 18, cls: "right number" },
  { key: "totalHorasEstimadas2", label: "Total H. estimadas 2", w: 20, cls: "right number" },
  { key: "horasGarantia", label: "H. garantía", w: 14, cls: "right number" },
  { key: "horasProyectoAbap", label: "H. proyecto ABAP", w: 18, cls: "right number" },
];

const EDIT_FIELDS = [
  { key: "documentacion", label: "Documentación", type: "text" },
  { key: "casoTransporte", label: "Caso transporte", type: "text" },
  { key: "controlHoras", label: "Control horas", type: "text" },
  { key: "errorSap", label: "Error SAP", type: "text" },
  { key: "notaOssSap", label: "Nota OSS SAP", type: "text" },
  { key: "tipoContrato", label: "Tipo contrato", type: "text" },
  { key: "tipoSolicitud", label: "Tipo solicitud", type: "text" },
  { key: "modulo", label: "Módulo", type: "text" },
  { key: "categoria", label: "Categoría", type: "text" },
  { key: "subcategoria", label: "Subcategoría", type: "text" },
  { key: "articulo", label: "Artículo", type: "text" },
  { key: "apoyo1", label: "Apoyo 1", type: "text" },
  { key: "apoyo2", label: "Apoyo 2", type: "text" },
  { key: "apoyo3", label: "Apoyo 3", type: "text" },
  { key: "requiereAbap", label: "Requiere ABAP", type: "text" },
  { key: "asignacionAbap", label: "Asignación ABAP", type: "text" },
  { key: "fechaRespuesta", label: "Fecha respuesta", type: "date" },
  { key: "fechaCompromiso", label: "Fecha compromiso", type: "date" },
  { key: "liderClaro", label: "Líder Claro", type: "text" },
  { key: "tipoIngreso", label: "Tipo ingreso", type: "text" },
  { key: "fechaEstimacion", label: "Fecha estimación", type: "date" },
  { key: "fechaAprobacionEstimacion", label: "Fecha aprobación estimación", type: "date" },
  { key: "estadoEstimacion", label: "Estado estimación", type: "text" },
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

function cleanText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function numberText(value) {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function toDateInput(value) {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function getStatusClass(value) {
  const s = String(value || "").toUpperCase();

  if (s.includes("CERR") || s.includes("RESUEL") || s.includes("SOLUCION")) {
    return "ok";
  }

  if (s.includes("CANCEL") || s.includes("ANUL")) {
    return "neutral";
  }

  if (s.includes("ESPERA") || s.includes("PEND")) {
    return "warn";
  }

  if (s.includes("ABIER") || s.includes("ASIGN") || s.includes("PROCES")) {
    return "info";
  }

  return "neutral";
}

function createEditForm(row) {
  const form = {};

  EDIT_FIELDS.forEach((field) => {
    const value = row?.[field.key];

    if (field.type === "date") {
      form[field.key] = toDateInput(value);
    } else {
      form[field.key] = value || "";
    }
  });

  return form;
}

export default function CalificacionCoeSapFuncional() {
  const fileInputRef = useRef(null);

  const user = useMemo(() => readStoredUser(), []);
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");
  const canImport = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPagesApi, setTotalPagesApi] = useState(1);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursRow, setHoursRow] = useState(null);
  const [hoursRows, setHoursRows] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hourForm, setHourForm] = useState(INITIAL_HOUR_FORM);
  const [addingHours, setAddingHours] = useState(false);

  const totalPages = Math.max(1, Number(totalPagesApi || Math.ceil(total / pageSize) || 1));
  const canPrev = page > 1;
  const canNext = page < totalPages;

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

  const fetchRows = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery();

      const res = await jfetch(`/coe-sap-funcional/calificacion?${qs}`, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.total || 0));
      setTotalPagesApi(Number(data?.total_pages || 1));
    } catch (error) {
      console.error("Error listando calificación COE SAP Funcional:", error);

      setRows([]);
      setTotal(0);
      setTotalPagesApi(1);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar la calificación",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, buildQuery, commonHeaders]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const buscar = () => {
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const limpiarFiltros = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const generarDesdeBase = async () => {
    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para generar la calificación.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Generar calificación",
      text: "Se crearán o actualizarán registros tomando como fuente la base COE SAP Funcional.",
      showCancelButton: true,
      confirmButtonText: "Sí, generar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) return;

    setGenerating(true);

    try {
      const res = await jfetch("/coe-sap-funcional/calificacion/generar", {
        method: "POST",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Proceso finalizado",
        html: `
          <div style="text-align:left">
            <p><b>Mensaje:</b> ${data?.mensaje || "Calificación generada"}</p>
            <p><b>Base registros:</b> ${data?.base_registros ?? "—"}</p>
            <p><b>Creados:</b> ${data?.creados ?? "—"}</p>
            <p><b>Actualizados:</b> ${data?.actualizados ?? "—"}</p>
          </div>
        `,
        confirmButtonColor: "#008C67",
      });

      fetchRows();
    } catch (error) {
      console.error("Error generando calificación:", error);

      Swal.fire({
        icon: "error",
        title: "Error generando calificación",
        text: error?.message || "No se pudo generar la información.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setGenerating(false);
    }
  };

  const triggerExcel = () => {
    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para cargar el Excel histórico.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    fileInputRef.current?.click();
  };

  const importarExcelHistorico = async (file) => {
    if (!file) return;

    const confirm = await Swal.fire({
      icon: "question",
      title: "Importar Excel histórico",
      text: "Se cruzará el Excel contra la calificación y se actualizarán campos manuales y horas.",
      showCancelButton: true,
      confirmButtonText: "Sí, importar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadingExcel(true);

    try {
      const res = await jfetch("/coe-sap-funcional/calificacion/import-excel", {
        method: "POST",
        headers: commonHeaders,
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      const diferencias = Array.isArray(data?.diferencias_muestra)
        ? data.diferencias_muestra.length
        : 0;

      await Swal.fire({
        icon: "success",
        title: "Excel procesado",
        html: `
          <div style="text-align:left">
            <p><b>Filas Excel:</b> ${data?.filas_excel ?? "—"}</p>
            <p><b>Casos únicos:</b> ${data?.casos_unicos_excel ?? "—"}</p>
            <p><b>Creados:</b> ${data?.creados ?? "—"}</p>
            <p><b>Actualizados:</b> ${data?.actualizados ?? "—"}</p>
            <p><b>Solo Excel:</b> ${data?.creados_solo_excel ?? "—"}</p>
            <p><b>No encontrados en base:</b> ${data?.no_encontrados_en_base ?? "—"}</p>
            <p><b>Duplicados Excel:</b> ${data?.duplicados_excel ?? "—"}</p>
            <p><b>Movimientos de horas:</b> ${data?.horas_movimientos ?? "—"}</p>
            <p><b>Diferencias muestra:</b> ${diferencias}</p>
          </div>
        `,
        confirmButtonColor: "#008C67",
      });

      if (fileInputRef.current) fileInputRef.current.value = "";

      fetchRows();
    } catch (error) {
      console.error("Error importando Excel histórico:", error);

      Swal.fire({
        icon: "error",
        title: "Error importando Excel",
        text: error?.message || "No se pudo procesar el archivo.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setUploadingExcel(false);
    }
  };

  const openEdit = (row) => {
    setEditRow(row);
    setEditForm(createEditForm(row));
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditOpen(false);
    setEditRow(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editRow?.id) return;

    setSavingEdit(true);

    try {
      const res = await jfetch(`/coe-sap-funcional/calificacion/${editRow.id}`, {
        method: "PATCH",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Guardado",
        text: data?.mensaje || "Registro actualizado correctamente.",
        confirmButtonColor: "#008C67",
      });

      setEditOpen(false);
      setEditRow(null);
      setEditForm({});
      fetchRows();
    } catch (error) {
      console.error("Error guardando calificación:", error);

      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchHours = async (row) => {
    if (!row?.id) return;

    setHoursLoading(true);

    try {
      const res = await jfetch(`/coe-sap-funcional/calificacion/${row.id}/horas`, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setHoursRows(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      console.error("Error listando horas:", error);
      setHoursRows([]);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar horas",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setHoursLoading(false);
    }
  };

  const openHours = (row) => {
    setHoursRow(row);
    setHourForm(INITIAL_HOUR_FORM);
    setHoursRows([]);
    setHoursOpen(true);
    fetchHours(row);
  };

  const closeHours = () => {
    if (addingHours) return;
    setHoursOpen(false);
    setHoursRow(null);
    setHoursRows([]);
    setHourForm(INITIAL_HOUR_FORM);
  };

  const addHours = async () => {
    if (!hoursRow?.id) return;

    setAddingHours(true);

    try {
      const res = await jfetch(`/coe-sap-funcional/calificacion/${hoursRow.id}/horas`, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(hourForm),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Horas agregadas",
        text: data?.mensaje || "Horas agregadas correctamente.",
        confirmButtonColor: "#008C67",
      });

      setHourForm(INITIAL_HOUR_FORM);
      fetchHours(hoursRow);
      fetchRows();
    } catch (error) {
      console.error("Error agregando horas:", error);

      Swal.fire({
        icon: "error",
        title: "No se pudieron agregar horas",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setAddingHours(false);
    }
  };

  const renderCell = (row, col) => {
    const value = row[col.key];

    if (col.cls?.includes("number") || col.cls?.includes("right")) {
      return numberText(value);
    }

    if (col.cls?.includes("status")) {
      return (
        <span className={`calcoe-pill ${getStatusClass(value)}`}>
          {cleanText(value)}
        </span>
      );
    }

    return cleanText(value);
  };

  if (!canView) {
    return (
      <div className="calcoe-page">
        <div className="calcoe-access-card">
          <div className="calcoe-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="calcoe-page">
      <section className="calcoe-hero">
        <div>
          <span className="calcoe-eyebrow">Calificación</span>
          <h1>Calificación COE SAP Funcional</h1>
          <p>
            Genera la calificación desde la base principal, importa el Excel histórico,
            edita campos manuales y registra horas sin duplicar casos.
          </p>
        </div>

        <div className="calcoe-hero-actions">
          <button
            type="button"
            className="calcoe-btn danger"
            onClick={generarDesdeBase}
            disabled={generating || uploadingExcel}
          >
            {generating ? "Generando..." : "Generar desde base"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            style={{ display: "none" }}
            onChange={(e) => importarExcelHistorico(e.target.files?.[0])}
          />

          <button
            type="button"
            className="calcoe-btn dark"
            onClick={triggerExcel}
            disabled={generating || uploadingExcel}
          >
            {uploadingExcel ? "Importando..." : "Importar Excel histórico"}
          </button>
        </div>
      </section>

      <section className="calcoe-summary-grid">
        <article className="calcoe-summary-card">
          <span>Registros</span>
          <strong>{total.toLocaleString("es-CO")}</strong>
        </article>

        <article className="calcoe-summary-card">
          <span>Página</span>
          <strong>
            {page} / {totalPages}
          </strong>
        </article>

        <article className="calcoe-summary-card">
          <span>Vista</span>
          <strong>Calificación</strong>
        </article>
      </section>

      <section className="calcoe-card calcoe-filters-card">
        <div className="calcoe-card-head">
          <div>
            <h2>Filtros</h2>
            <p>Busca por ID, caso SM, sociedad, estado, asignado, módulo o categoría.</p>
          </div>

          <button type="button" className="calcoe-btn ghost" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>

        <div className="calcoe-filters-grid">
          <label className="calcoe-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="ID, caso SM, asunto, solicitante..."
              onChange={(e) => handleFilterChange("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
            />
          </label>

          <label className="calcoe-filter">
            <span>Estado</span>
            <input
              type="text"
              value={filters.estado}
              placeholder="Estado"
              onChange={(e) => handleFilterChange("estado", e.target.value)}
            />
          </label>

          <label className="calcoe-filter">
            <span>Estado consolidado</span>
            <input
              type="text"
              value={filters.estado_consolidado}
              placeholder="Abierto, cerrado..."
              onChange={(e) => handleFilterChange("estado_consolidado", e.target.value)}
            />
          </label>

          <label className="calcoe-filter">
            <span>Sociedad</span>
            <input
              type="text"
              value={filters.sociedad}
              placeholder="Sociedad"
              onChange={(e) => handleFilterChange("sociedad", e.target.value)}
            />
          </label>

          <label className="calcoe-filter">
            <span>Asignado a</span>
            <input
              type="text"
              value={filters.asignado_a}
              placeholder="Asignado a"
              onChange={(e) => handleFilterChange("asignado_a", e.target.value)}
            />
          </label>

          <label className="calcoe-filter">
            <span>Sistema</span>
            <input
              type="text"
              value={filters.sistema}
              placeholder="SD, FI..."
              onChange={(e) => handleFilterChange("sistema", e.target.value)}
            />
          </label>

          <label className="calcoe-filter">
            <span>Módulo</span>
            <input
              type="text"
              value={filters.modulo}
              placeholder="FI, MM, SD..."
              onChange={(e) => handleFilterChange("modulo", e.target.value)}
            />
          </label>
        </div>

        <div className="calcoe-actions">
          <button className="calcoe-btn danger" type="button" onClick={buscar} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>

          <button className="calcoe-btn light" type="button" onClick={limpiarFiltros} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      <section className="calcoe-card calcoe-table-card">
        <div className="calcoe-table-head">
          <div>
            <h2>Base de calificación</h2>
            <p>
              Total: <b>{total.toLocaleString("es-CO")}</b> registros • Página{" "}
              <b>{page}</b> de <b>{totalPages}</b>
            </p>
          </div>

          <div className="calcoe-page-size">
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

        <div className="calcoe-table-wrap">
          <table className="calcoe-table">
            <colgroup>
              {TABLE_COLUMNS.map((col) => (
                <col key={col.key} style={{ width: `${col.w}ch` }} />
              ))}
              <col style={{ width: "18ch" }} />
            </colgroup>

            <thead>
              <tr>
                {TABLE_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th className="sticky-actions">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="calcoe-empty">
                    <div className="calcoe-loader" />
                    Cargando calificación...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="calcoe-empty">
                    No hay registros para mostrar.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.id || row.numero || "row"}-${index}`}>
                    {TABLE_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={col.cls || ""}
                        title={col.cls?.includes("clip") ? cleanText(row[col.key]) : undefined}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}

                    <td className="sticky-actions calcoe-row-actions">
                      <button
                        type="button"
                        className="calcoe-mini-btn"
                        onClick={() => openEdit(row)}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className="calcoe-mini-btn dark"
                        onClick={() => openHours(row)}
                      >
                        Horas
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="calcoe-pager">
          <button
            className="calcoe-btn icon"
            type="button"
            onClick={() => setPage(1)}
            disabled={!canPrev || loading}
          >
            ⏮
          </button>

          <button
            className="calcoe-btn icon"
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
            className="calcoe-btn icon"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canNext || loading}
          >
            ▶
          </button>

          <button
            className="calcoe-btn icon"
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={!canNext || loading}
          >
            ⏭
          </button>
        </div>
      </section>

      {editOpen && (
        <div className="calcoe-modal-overlay">
          <div className="calcoe-modal large">
            <div className="calcoe-modal-head">
              <div>
                <h3>Editar campos manuales</h3>
                <p>
                  Caso <b>{editRow?.numero}</b> • Los campos automáticos se conservan desde la base principal.
                </p>
              </div>

              <button type="button" className="calcoe-close" onClick={closeEdit} disabled={savingEdit}>
                ✕
              </button>
            </div>

            <div className="calcoe-modal-body">
              <div className="calcoe-edit-grid">
                {EDIT_FIELDS.map((field) => (
                  <label key={field.key} className="calcoe-filter">
                    <span>{field.label}</span>
                    <input
                      type={field.type}
                      value={editForm[field.key] || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="calcoe-modal-foot">
              <button type="button" className="calcoe-btn light" onClick={closeEdit} disabled={savingEdit}>
                Cancelar
              </button>

              <button type="button" className="calcoe-btn danger" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {hoursOpen && (
        <div className="calcoe-modal-overlay">
          <div className="calcoe-modal large">
            <div className="calcoe-modal-head">
              <div>
                <h3>Horas del caso</h3>
                <p>
                  Caso <b>{hoursRow?.numero}</b> • Total estimadas:{" "}
                  <b>{numberText(hoursRow?.totalHorasEstimadas)}</b>
                </p>
              </div>

              <button type="button" className="calcoe-close" onClick={closeHours} disabled={addingHours}>
                ✕
              </button>
            </div>

            <div className="calcoe-modal-body">
              <div className="calcoe-hours-form">
                <label className="calcoe-filter">
                  <span>Tipo</span>
                  <select
                    value={hourForm.tipo}
                    onChange={(e) =>
                      setHourForm((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                  >
                    {HOUR_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="calcoe-filter">
                  <span>Módulo</span>
                  <select
                    value={hourForm.modulo}
                    onChange={(e) =>
                      setHourForm((prev) => ({
                        ...prev,
                        modulo: e.target.value,
                      }))
                    }
                  >
                    {MODULES.map((modulo) => (
                      <option key={modulo} value={modulo}>
                        {modulo}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="calcoe-filter">
                  <span>Horas</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={hourForm.horas}
                    placeholder="Ej: 2"
                    onChange={(e) =>
                      setHourForm((prev) => ({
                        ...prev,
                        horas: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="calcoe-filter obs">
                  <span>Observación</span>
                  <input
                    type="text"
                    value={hourForm.observacion}
                    placeholder="Detalle de la adición de horas"
                    onChange={(e) =>
                      setHourForm((prev) => ({
                        ...prev,
                        observacion: e.target.value,
                      }))
                    }
                  />
                </label>

                <button
                  type="button"
                  className="calcoe-btn danger"
                  onClick={addHours}
                  disabled={addingHours}
                >
                  {addingHours ? "Agregando..." : "Agregar horas"}
                </button>
              </div>

              <div className="calcoe-hours-summary">
                <div>
                  <span>Total funcionales</span>
                  <strong>{numberText(hoursRow?.totalHorasFuncionales)}</strong>
                </div>

                <div>
                  <span>Total estimadas</span>
                  <strong>{numberText(hoursRow?.totalHorasEstimadas)}</strong>
                </div>

                <div>
                  <span>Garantía</span>
                  <strong>{numberText(hoursRow?.horasGarantia)}</strong>
                </div>

                <div>
                  <span>Proyecto ABAP</span>
                  <strong>{numberText(hoursRow?.horasProyectoAbap)}</strong>
                </div>
              </div>

              <div className="calcoe-hours-table-wrap">
                <table className="calcoe-hours-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Módulo</th>
                      <th>Horas</th>
                      <th>Origen</th>
                      <th>Fila Excel</th>
                      <th>Usuario</th>
                      <th>Observación</th>
                    </tr>
                  </thead>

                  <tbody>
                    {hoursLoading ? (
                      <tr>
                        <td colSpan="8" className="calcoe-empty small">
                          Cargando horas...
                        </td>
                      </tr>
                    ) : hoursRows.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="calcoe-empty small">
                          No hay movimientos de horas.
                        </td>
                      </tr>
                    ) : (
                      hoursRows.map((h) => (
                        <tr key={h.id}>
                          <td className="mono">{cleanText(h.createdAt)}</td>
                          <td>
                            <span className="calcoe-mini-pill">{cleanText(h.tipo)}</span>
                          </td>
                          <td>{cleanText(h.modulo)}</td>
                          <td className="right">{numberText(h.horas)}</td>
                          <td>{cleanText(h.origen)}</td>
                          <td className="center">{cleanText(h.excelFila)}</td>
                          <td>{cleanText(h.usuarioRegistro)}</td>
                          <td>{cleanText(h.observacion)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="calcoe-modal-foot">
              <button type="button" className="calcoe-btn light" onClick={closeHours} disabled={addingHours}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
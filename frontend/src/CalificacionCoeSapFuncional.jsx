import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import Select from "react-select";
import { jfetch } from "./lib/api";
import "./CalificacionCoeSapFuncional.css";

const EMPTY_FILTER_VALUE = "__EMPTY__";
const EMPTY_FILTER_LABEL = "(Blanco)";

const STORAGE_VISIBLE_COLUMNS = "calcoe_visible_columns_v2";
const STORAGE_FILTER_COLUMNS = "calcoe_filter_columns_v3_all";

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
  { key: "numero", label: "ID", w: 15, cls: "mono strong sticky-col sticky-col-1", group: "auto" },
  { key: "sistema", label: "Sistema", w: 10, cls: "center sticky-col sticky-col-2", group: "calc" },
  { key: "casoSm", label: "Caso SM", w: 17, cls: "mono", group: "auto" },
  { key: "doc1", label: "DOC 1", w: 15, group: "manual" },
  { key: "manejo", label: "Manejo", w: 16, group: "manual" },
  { key: "tiqueteProveedorExterno", label: "Tiquete proveedor externo", w: 26, group: "manual" },
  { key: "sociedad", label: "Sociedad", w: 30, group: "auto" },
  { key: "clienteAsociadoNombre", label: "Cliente asociado", w: 30, group: "calc" },
  { key: "validarCliente", label: "Validar cliente", w: 17, cls: "validation", group: "validation" },
  { key: "estadoPrincipal", label: "Estado principal", w: 20, cls: "status", group: "calc" },
  { key: "subestado", label: "Subestado", w: 22, cls: "status", group: "calc" },
  { key: "validarEstadoControl", label: "Validar estado control", w: 22, cls: "validation", group: "validation" },
  { key: "asunto", label: "Asunto", w: 44, cls: "text-long", group: "auto" },
  { key: "observaciones", label: "Observaciones / Seguimiento semanal", w: 64, cls: "obs-col", group: "manual" },
  { key: "nombreSolicitante", label: "Solicitante", w: 26, group: "auto" },
  { key: "impacto", label: "Impacto", w: 13, group: "auto" },
  { key: "urgencia", label: "Urgencia", w: 13, group: "auto" },
  { key: "prioridad", label: "Prioridad", w: 13, group: "auto" },
  { key: "estado", label: "Estado", w: 18, cls: "status", group: "auto" },
  { key: "estadoHerramientaGestion", label: "Estado herramienta gestión", w: 24, cls: "status", group: "manual" },
  { key: "estadoConsolidado", label: "Estado consolidado", w: 20, cls: "status", group: "calc" },
  { key: "responsableEstado", label: "Responsable estado", w: 20, group: "calc" },
  { key: "asignadoA", label: "Asignado a", w: 25, group: "auto" },
  { key: "documentacion", label: "Documentación", w: 18, group: "manual" },
  { key: "casoTransporte", label: "Caso transporte", w: 20, group: "manual" },
  { key: "controlHoras", label: "Control horas", w: 18, group: "manual" },
  { key: "errorSap", label: "Error SAP", w: 16, group: "manual" },
  { key: "notaOssSap", label: "Nota OSS SAP", w: 18, group: "manual" },
  { key: "tipoContrato", label: "Tipo contrato", w: 18, group: "manual" },
  { key: "tipoSolicitud", label: "Tipo solicitud", w: 20, group: "manual" },
  { key: "modulo", label: "Módulo", w: 12, cls: "center", group: "manual" },
  { key: "categoria", label: "Categoría", w: 22, group: "manual" },
  { key: "subcategoria", label: "Subcategoría", w: 22, group: "manual" },
  { key: "articulo", label: "Artículo", w: 24, group: "manual" },
  { key: "apoyo1", label: "Apoyo 1", w: 22, group: "manual" },
  { key: "apoyo2", label: "Apoyo 2", w: 22, group: "manual" },
  { key: "apoyo3", label: "Apoyo 3", w: 22, group: "manual" },
  { key: "requiereAbap", label: "Requiere ABAP", w: 16, group: "manual" },
  { key: "asignacionAbap", label: "Asignación ABAP", w: 22, group: "manual" },
  { key: "fechaAsignacion", label: "Fecha asignación", w: 20, cls: "mono", group: "auto" },
  { key: "fechaAsignacionSistemaGestion", label: "Fecha asignación sistema gestión", w: 25, cls: "mono", group: "source" },
  { key: "difFechaAsignacion", label: "Dif. fecha asignación", w: 18, cls: "right number", group: "validation" },
  { key: "validarFechaAsignacion", label: "Validar fecha asignación", w: 20, cls: "validation", group: "validation" },
  { key: "diaCreacion", label: "Día creación", w: 12, cls: "right", group: "calc" },
  { key: "mesCreacion", label: "Mes creación", w: 12, cls: "right", group: "calc" },
  { key: "anioCreacion", label: "Año creación", w: 12, cls: "right", group: "calc" },
  { key: "horaUltimaActualizacion", label: "Hora última actualización", w: 22, cls: "mono", group: "auto" },
  { key: "horaUltimaActualizacionSistemaGestion", label: "Hora última act. sistema gestión", w: 26, cls: "mono", group: "source" },
  { key: "validarFechaActualizacion", label: "Validar actualización", w: 19, cls: "validation", group: "validation" },
  { key: "fechaRespuesta", label: "Fecha respuesta", w: 20, cls: "mono", group: "manual" },
  { key: "fechaResolucion", label: "Fecha resolución", w: 20, cls: "mono", group: "auto" },
  { key: "fechaResolucionSistemaGestion", label: "Fecha resolución sistema gestión", w: 25, cls: "mono", group: "source" },
  { key: "difFechaResolucion", label: "Dif. fecha resolución", w: 18, cls: "right number", group: "validation" },
  { key: "validarFechaResolucion", label: "Validar fecha resolución", w: 20, cls: "validation", group: "validation" },
  { key: "fechaFinalizacionCierre", label: "Fecha cierre", w: 20, cls: "mono", group: "auto" },
  { key: "fechaFinalizacionCierreSistemaGestion", label: "Fecha cierre sistema gestión", w: 25, cls: "mono", group: "source" },
  { key: "difFechaCierre", label: "Dif. fecha cierre", w: 16, cls: "right number", group: "validation" },
  { key: "validarFechaCierre", label: "Validar fecha cierre", w: 18, cls: "validation", group: "validation" },
  { key: "diaCierre", label: "Día cierre", w: 12, cls: "right", group: "calc" },
  { key: "mesCierre", label: "Mes cierre", w: 12, cls: "right", group: "calc" },
  { key: "anioCierre", label: "Año cierre", w: 12, cls: "right", group: "calc" },
  { key: "tiempoRespuesta", label: "T. respuesta", w: 13, cls: "right number", group: "calc" },
  { key: "tiempoResolucion", label: "T. resolución", w: 13, cls: "right number", group: "calc" },
  { key: "tiempoFinalizacionCierre", label: "T. cierre", w: 13, cls: "right number", group: "calc" },
  { key: "fechaCompromiso", label: "Fecha compromiso", w: 20, cls: "mono", group: "manual" },
  { key: "liderClaro", label: "Líder Claro", w: 22, group: "manual" },
  { key: "tipoIngreso", label: "Tipo ingreso", w: 18, group: "manual" },
  { key: "estadoFacturacionOt", label: "Estado facturación OT", w: 22, cls: "status", group: "ot" },
  { key: "nroOt", label: "N° OT", w: 15, cls: "mono", group: "ot" },
  { key: "valorOt", label: "Valor OT", w: 16, cls: "right number", group: "ot" },
  { key: "horasOferta", label: "Horas oferta", w: 16, cls: "right number", group: "ot" },
  { key: "fechaEstimacion", label: "Fecha estimación", w: 20, cls: "mono", group: "manual" },
  { key: "diasEntregaEstimacion", label: "Días entrega estimación", w: 17, cls: "right", group: "calc" },
  { key: "mesEstimacion", label: "Mes estimación", w: 14, cls: "right", group: "calc" },
  { key: "anioEstimacion", label: "Año estimación", w: 14, cls: "right", group: "calc" },
  { key: "fechaAprobacionEstimacion", label: "Fecha aprobación estimación", w: 24, cls: "mono", group: "manual" },
  { key: "mesAprobadoEstimacion", label: "Mes aprobado estimación", w: 20, cls: "right", group: "calc" },
  { key: "anioAprobadoEstimacion", label: "Año aprobado estimación", w: 20, cls: "right", group: "calc" },
  { key: "estadoEstimacion", label: "Estado estimación", w: 18, group: "manual" },
  { key: "validarSubcategoria", label: "Validar subcategoría", w: 19, cls: "validation", group: "validation" },
  { key: "validarArticulo", label: "Validar artículo", w: 17, cls: "validation", group: "validation" },
  { key: "soloExcel", label: "Solo Excel", w: 13, cls: "source-flag", group: "source" },
  { key: "cruceSm", label: "Cruce SM", w: 13, cls: "source-flag", group: "source" },
  { key: "cruceItop", label: "Cruce ITOP", w: 14, cls: "source-flag", group: "source" },
  { key: "camposEditadosManual", label: "Campos manuales", w: 22, group: "source" },
  { key: "origenDatos", label: "Origen datos", w: 22, group: "source" },

  { key: "horasEstimadasFi", label: "H. estimadas FI", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasMm", label: "H. estimadas MM", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasSd", label: "H. estimadas SD", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasCo", label: "H. estimadas CO", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasPs", label: "H. estimadas PS", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasSlcm", label: "H. estimadas SLCM", w: 17, cls: "right number", group: "hours" },
  { key: "horasEstimadasCrm", label: "H. estimadas CRM", w: 16, cls: "right number", group: "hours" },
  { key: "horasEstimadasCrm2", label: "H. estimadas CRM2", w: 17, cls: "right number", group: "hours" },
  { key: "horasEstimadasPca", label: "H. estimadas PCA", w: 16, cls: "right number", group: "hours" },
  { key: "horasEstimadasFm", label: "H. estimadas FM", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasPp", label: "H. estimadas PP", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasPm", label: "H. estimadas PM", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasHcm", label: "H. estimadas HCM", w: 16, cls: "right number", group: "hours" },
  { key: "horasEstimadasSsff", label: "H. estimadas SSFF", w: 16, cls: "right number", group: "hours" },
  { key: "horasEstimadasFiori", label: "H. estimadas FIORI", w: 18, cls: "right number", group: "hours" },
  { key: "horasEstimadasWf", label: "H. estimadas WF", w: 15, cls: "right number", group: "hours" },
  { key: "horasEstimadasAbap", label: "H. estimadas ABAP", w: 18, cls: "right number", group: "hours" },
  { key: "horasEstimadasBasis", label: "H. estimadas BASIS", w: 18, cls: "right number", group: "hours" },
  { key: "horasEstimadasPmo", label: "H. estimadas PMO", w: 17, cls: "right number", group: "hours" },

  { key: "totalHorasFuncionales", label: "Total H. funcionales", w: 19, cls: "right number total-cell", group: "calc" },
  { key: "totalHorasEstimadas", label: "Total H. estimadas", w: 19, cls: "right number total-cell", group: "calc" },
  { key: "totalHorasEstimadas2", label: "Total H. estimadas 2", w: 21, cls: "right number total-cell", group: "calc" },

  { key: "horasEjecutadasFi", label: "H. ejecutadas FI", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasMm", label: "H. ejecutadas MM", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasSd", label: "H. ejecutadas SD", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasCo", label: "H. ejecutadas CO", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasPs", label: "H. ejecutadas PS", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasPca", label: "H. ejecutadas PCA", w: 17, cls: "right number", group: "hours" },
  { key: "horasEjecutadasFm", label: "H. ejecutadas FM", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasHcm", label: "H. ejecutadas HCM", w: 17, cls: "right number", group: "hours" },
  { key: "horasEjecutadasSsff", label: "H. ejecutadas SSFF", w: 18, cls: "right number", group: "hours" },
  { key: "horasEjecutadasFiori", label: "H. ejecutadas FIORI", w: 19, cls: "right number", group: "hours" },
  { key: "horasEjecutadasWf", label: "H. ejecutadas WF", w: 16, cls: "right number", group: "hours" },
  { key: "horasEjecutadasAbap", label: "H. ejecutadas ABAP", w: 19, cls: "right number", group: "hours" },
  { key: "horasEjecutadasBasis", label: "H. ejecutadas BASIS", w: 19, cls: "right number", group: "hours" },
  { key: "horasGarantia", label: "H. garantía", w: 14, cls: "right number total-cell", group: "hours" },
  { key: "horasProyectoAbap", label: "H. proyecto ABAP", w: 18, cls: "right number total-cell", group: "hours" },
];

const EDIT_FIELDS = [
  {
    key: "comentarioSeguimiento",
    label: "Comentario de seguimiento de hoy",
    type: "textarea",
    wide: true,
    transient: true,
  },
  { key: "doc1", label: "DOC 1", type: "text" },
  { key: "documentacion", label: "Documentación", type: "text" },
  { key: "casoTransporte", label: "Caso transporte", type: "text" },
  { key: "controlHoras", label: "Control horas", type: "text" },
  { key: "manejo", label: "Manejo", type: "text" },
  { key: "errorSap", label: "Error SAP", type: "text" },
  { key: "notaOssSap", label: "Nota OSS SAP", type: "text" },
  { key: "tiqueteProveedorExterno", label: "Tiquete proveedor externo", type: "text" },
  { key: "tipoContrato", label: "Tipo contrato", type: "text" },

  { key: "impacto", label: "Impacto", type: "select", catalog: "IMPACTO" },
  { key: "urgencia", label: "Urgencia", type: "select", catalog: "URGENCIA" },
  { key: "prioridad", label: "Prioridad", type: "select", catalog: "PRIORIDAD" },
  { key: "tipoSolicitud", label: "Tipo solicitud", type: "select", catalog: "TIPO_SOLICITUD" },
  { key: "modulo", label: "Módulo", type: "select", catalog: "MODULO" },
  { key: "categoria", label: "Categoría", type: "select", dependent: "categoria" },
  { key: "subcategoria", label: "Subcategoría", type: "select", dependent: "subcategoria" },
  { key: "articulo", label: "Artículo", type: "select", dependent: "articulo" },

  { key: "estadoHerramientaGestion", label: "Estado herramienta gestión", type: "text" },

  // Campos que no se completan desde la base principal y pueden ajustarse manualmente.
  { key: "fechaAsignacionSistemaGestion", label: "Fecha asignación sistema gestión", type: "datetime" },
  { key: "horaUltimaActualizacionSistemaGestion", label: "Hora última act. sistema gestión", type: "datetime" },
  { key: "fechaResolucionSistemaGestion", label: "Fecha resolución sistema gestión", type: "datetime" },
  { key: "fechaFinalizacionCierreSistemaGestion", label: "Fecha cierre sistema gestión", type: "datetime" },

  { key: "subestadoCatalogoId", label: "Subestado controlado", type: "select", source: "subestadoControl", wide: true },
  { key: "estadoPrincipal", label: "Estado principal", type: "readonly" },
  { key: "subestado", label: "Subestado aplicado", type: "readonly" },
  { key: "validarEstadoControl", label: "Validación estado", type: "readonly" },
  { key: "responsableEstado", label: "Responsable estado", type: "readonly" },
  { key: "estadoConsolidado", label: "Estado consolidado", type: "readonly" },
  { key: "observacionCambioEstado", label: "Observación cambio de estado", type: "textarea", wide: true, transient: true },
  { key: "clienteAsociadoNombre", label: "Cliente asociado", type: "readonly" },

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
  { key: "estadoEstimacion", label: "Estado estimación", type: "select", catalog: "ESTADO_ESTIMACION" },

  // Horas manuales: no vienen de la base principal y se conservan como ajuste del usuario.
  { key: "horasEstimadasFi", label: "H. estimadas FI", type: "number" },
  { key: "horasEstimadasMm", label: "H. estimadas MM", type: "number" },
  { key: "horasEstimadasSd", label: "H. estimadas SD", type: "number" },
  { key: "horasEstimadasCo", label: "H. estimadas CO", type: "number" },
  { key: "horasEstimadasPs", label: "H. estimadas PS", type: "number" },
  { key: "horasEstimadasSlcm", label: "H. estimadas SLCM", type: "number" },
  { key: "horasEstimadasCrm", label: "H. estimadas CRM", type: "number" },
  { key: "horasEstimadasCrm2", label: "H. estimadas CRM2", type: "number" },
  { key: "horasEstimadasPca", label: "H. estimadas PCA", type: "number" },
  { key: "horasEstimadasFm", label: "H. estimadas FM", type: "number" },
  { key: "horasEstimadasPp", label: "H. estimadas PP", type: "number" },
  { key: "horasEstimadasPm", label: "H. estimadas PM", type: "number" },
  { key: "horasEstimadasHcm", label: "H. estimadas HCM", type: "number" },
  { key: "horasEstimadasSsff", label: "H. estimadas SSFF", type: "number" },
  { key: "horasEstimadasFiori", label: "H. estimadas FIORI", type: "number" },
  { key: "horasEstimadasWf", label: "H. estimadas WF", type: "number" },
  { key: "horasEstimadasAbap", label: "H. estimadas ABAP", type: "number" },
  { key: "horasEstimadasBasis", label: "H. estimadas BASIS", type: "number" },
  { key: "horasEstimadasPmo", label: "H. estimadas PMO", type: "number" },

  { key: "horasEjecutadasFi", label: "H. ejecutadas FI", type: "number" },
  { key: "horasEjecutadasMm", label: "H. ejecutadas MM", type: "number" },
  { key: "horasEjecutadasSd", label: "H. ejecutadas SD", type: "number" },
  { key: "horasEjecutadasCo", label: "H. ejecutadas CO", type: "number" },
  { key: "horasEjecutadasPs", label: "H. ejecutadas PS", type: "number" },
  { key: "horasEjecutadasPca", label: "H. ejecutadas PCA", type: "number" },
  { key: "horasEjecutadasFm", label: "H. ejecutadas FM", type: "number" },
  { key: "horasEjecutadasHcm", label: "H. ejecutadas HCM", type: "number" },
  { key: "horasEjecutadasSsff", label: "H. ejecutadas SSFF", type: "number" },
  { key: "horasEjecutadasFiori", label: "H. ejecutadas FIORI", type: "number" },
  { key: "horasEjecutadasWf", label: "H. ejecutadas WF", type: "number" },
  { key: "horasEjecutadasAbap", label: "H. ejecutadas ABAP", type: "number" },
  { key: "horasEjecutadasBasis", label: "H. ejecutadas BASIS", type: "number" },
  { key: "horasGarantia", label: "H. garantía", type: "number" },
  { key: "horasProyectoAbap", label: "H. proyecto ABAP", type: "number" },

  { key: "estadoFacturacionOt", label: "Estado facturación OT", type: "select", catalog: "ESTADO_FACTURACION_OT" },
  { key: "nroOt", label: "N° OT", type: "text" },
  { key: "valorOt", label: "Valor OT", type: "number" },
  { key: "horasOferta", label: "Horas oferta", type: "number" },

  { key: "fechaReasignacionClaro", label: "Fecha reasignación Claro", type: "date" },
  { key: "fecha1ReasignacionClaro", label: "Fecha 1 reasignación Claro", type: "date" },
  { key: "fecha2ReasignacionClaro", label: "Fecha 2 reasignación Claro", type: "date" },
  { key: "fecha3ReasignacionClaro", label: "Fecha 3 reasignación Claro", type: "date" },
  { key: "fecha4ReasignacionClaro", label: "Fecha 4 reasignación Claro", type: "date" },
  { key: "fecha5ReasignacionClaro", label: "Fecha 5 reasignación Claro", type: "date" },
  { key: "fecha6ReasignacionClaro", label: "Fecha 6 reasignación Claro", type: "date" },
  { key: "fecha7ReasignacionClaro", label: "Fecha 7 reasignación Claro", type: "date" },
  { key: "fecha8ReasignacionClaro", label: "Fecha 8 reasignación Claro", type: "date" },
  { key: "fecha9ReasignacionClaro", label: "Fecha 9 reasignación Claro", type: "date" },
  { key: "fecha10ReasignacionClaro", label: "Fecha 10 reasignación Claro", type: "date" },
];

const DEFAULT_FILTER_COLUMNS = TABLE_COLUMNS.map((col) => col.key);

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

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").trim();
}


function getFilenameFromDisposition(disposition, fallback) {
  const header = disposition || "";
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const normalMatch = header.match(/filename="?([^";]+)"?/i);
  if (normalMatch?.[1]) return normalMatch[1];

  return fallback;
}

async function downloadExcelFile(url, headers, fallbackName) {
  const res = await jfetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {}

    throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const filename = getFilenameFromDisposition(
    res.headers.get("Content-Disposition"),
    fallbackName
  );

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function normalizeForCompare(value) {
  return normalizeText(value).toUpperCase();
}

function cleanText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function toDatetimeLocalInput(value) {
  if (!value) return "";
  const s = String(value).trim();

  // Backend normalmente devuelve YYYY-MM-DD HH:mm:ss.
  // datetime-local necesita YYYY-MM-DDTHH:mm.
  const match = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (match) return `${match[1]}T${match[2]}`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;

  return "";
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTodaySeguimiento(observaciones) {
  const hoy = todayStamp();
  const lineas = String(observaciones || "").split(/\r?\n/);
  const patron = new RegExp(`^\\s*${hoy}(?:\\s+\\d{2}:\\d{2})?\\s*-\\s*Seguimiento\\s+por\\s+[^:]+:\\s*(.*)$`, "i");
  const patronLegado = new RegExp(`^\\s*${hoy}(?:\\s+\\d{2}:\\d{2})?\\s*-\\s*(.*)$`, "i");

  for (const linea of lineas) {
    const match = linea.match(patron);
    if (match) return match[1] || "";

    const legado = linea.match(patronLegado);
    if (legado && !/^Cambio de estado controlado\b/i.test(legado[1] || "")) {
      return legado[1] || "";
    }
  }
  return "";
}

function getStatusClass(value) {
  const s = String(value || "").toUpperCase();

  if (s.includes("CERR") || s.includes("RESUEL") || s.includes("SOLUCION")) return "ok";
  if (s.includes("CANCEL") || s.includes("ANUL")) return "neutral";
  if (s.includes("ESPERA") || s.includes("PEND")) return "warn";
  if (s.includes("ABIER") || s.includes("ASIGN") || s.includes("PROCES")) return "info";

  return "neutral";
}

function getColumnGroupClass(group) {
  if (group === "manual") return "col-manual";
  if (group === "calc") return "col-calc";
  if (group === "hours") return "col-hours";
  if (group === "validation") return "col-validation";
  if (group === "source") return "col-source";
  if (group === "ot") return "col-ot";
  return "col-auto";
}

function getValidationClass(value) {
  const s = String(value || "").toUpperCase();
  if (!s || s === "—") return "neutral";
  if (s.includes("OK")) return "ok";
  if (s.includes("VALIDAR") || s.includes("ERROR")) return "danger";
  return "warn";
}

function getBooleanClass(value) {
  return value ? "ok" : "neutral";
}

function objectSummary(value) {
  if (!value || typeof value !== "object") return "—";

  const keys = Object.keys(value).filter((k) => value[k]);
  if (!keys.length) return "—";

  return keys.slice(0, 4).join(", ") + (keys.length > 4 ? ` +${keys.length - 4}` : "");
}

function originSummary(value) {
  if (!value || typeof value !== "object") return "—";

  const origins = [...new Set(Object.values(value).filter(Boolean))];
  if (!origins.length) return "—";

  return origins.slice(0, 4).join(", ") + (origins.length > 4 ? ` +${origins.length - 4}` : "");
}

function createEditForm(row) {
  const form = {};

  EDIT_FIELDS.forEach((field) => {
    const value = row?.[field.key];

    if (field.type === "date") {
      form[field.key] = toDateInput(value);
    } else if (field.type === "datetime") {
      form[field.key] = toDatetimeLocalInput(value);
    } else if (field.key === "comentarioSeguimiento") {
      form[field.key] = getTodaySeguimiento(row?.observaciones);
    } else {
      form[field.key] = value || "";
    }
  });

  return form;
}

function getStorageArray(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveStorageArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getCellValue(row, key) {
  const value = row?.[key];

  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);

  return normalizeText(value);
}

function getFilterCellValue(row, key) {
  const value = getCellValue(row, key);
  return value === "—" ? "" : value;
}

function toFilterOption(value) {
  return {
    value,
    label: value === EMPTY_FILTER_VALUE ? EMPTY_FILTER_LABEL : value,
  };
}

function buildSelectOptionsFromRows(rows, key) {
  const mappedValues = (rows || []).map((row) => getFilterCellValue(row, key));
  const hasBlank = mappedValues.some((value) => value === "");

  const uniqueNonBlank = [...new Set(mappedValues.filter((value) => value !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }))
    .slice(0, 500);

  const options = uniqueNonBlank.map((value) => ({
    label: value,
    value,
  }));

  if (hasBlank) {
    options.unshift({
      label: EMPTY_FILTER_LABEL,
      value: EMPTY_FILTER_VALUE,
    });
  }

  return options;
}

function applyColumnFilters(rows, filters) {
  let result = [...(rows || [])];

  Object.entries(filters || {}).forEach(([key, values]) => {
    if (!Array.isArray(values) || values.length === 0) return;

    result = result.filter((row) => {
      const cell = getFilterCellValue(row, key);
      const isBlank = cell === "";

      return values.some((selected) => {
        if (selected === EMPTY_FILTER_VALUE) return isBlank;
        return normalizeForCompare(selected) === normalizeForCompare(cell);
      });
    });
  });

  return result;
}

function applyQuickSearch(rows, q, columns) {
  const query = normalizeForCompare(q);

  if (!query) return rows;

  const keys = columns.map((col) => col.key);

  return (rows || []).filter((row) => {
    return keys.some((key) => normalizeForCompare(getCellValue(row, key)).includes(query));
  });
}

const DATE_AT_START = /^\s*(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]?\s*/;
const DATE_ANYWHERE = /(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–—]\s*/g;

function normalizeCommentText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function splitDatedEntries(raw) {
  const text = normalizeCommentText(raw);
  if (!text) return [];

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const out = [];

  for (const line of lines) {
    const parts = [];
    let lastIndex = 0;
    const matches = [...line.matchAll(DATE_ANYWHERE)];

    if (matches.length <= 1) {
      parts.push(line);
    } else {
      for (let i = 0; i < matches.length; i += 1) {
        const start = matches[i].index ?? 0;

        if (i === 0 && start !== 0) {
          const pre = line.slice(0, start).trim();
          if (pre) parts.push(pre);
        }

        if (i > 0) {
          const chunk = line.slice(lastIndex, start).trim();
          if (chunk) parts.push(chunk);
        }

        lastIndex = start;
      }

      const tail = line.slice(lastIndex).trim();
      if (tail) parts.push(tail);
    }

    for (const part of parts) {
      const match = part.match(DATE_AT_START);

      if (match) {
        const date = match[1];
        const body = part.replace(DATE_AT_START, "").trim();
        out.push({ date, text: body || "-" });
      } else {
        out.push({ date: null, text: part });
      }
    }
  }

  return out;
}

function renderObservaciones(value) {
  const items = splitDatedEntries(value);

  if (!items.length) {
    return <span className="calcoe-empty-text">—</span>;
  }

  return (
    <div className="calcoe-obs-list">
      {items.map((item, index) => (
        <div key={`${item.date || "obs"}-${index}`} className="calcoe-obs-item">
          {item.date && <span className="calcoe-obs-date">{item.date}</span>}
          <span className="calcoe-obs-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function uniqueOptions(values) {
  return [...new Set((values || []).filter(Boolean).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .map((value) => ({ value, label: value }));
}


function subestadoOptionLabel(item) {
  const subestado = item?.valor || item?.nombre || item?.subestado || "Sin subestado";
  const principal = item?.estadoPrincipal || item?.estado_principal || item?.estadoPrincipalNombre || item?.estadoNombre || item?.estado || "Sin estado principal";
  const estadoActivo = item?.activo === false ? " · Inactivo" : "";
  return `${subestado} — ${principal}${estadoActivo}`;
}

function buildSubestadoOptions(items) {
  return (items || [])
    .map((item) => ({
      value: String(item.id),
      label: subestadoOptionLabel(item),
      raw: item,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}

const CATALOG_TYPES_TO_LOAD = [
  "IMPACTO",
  "URGENCIA",
  "PRIORIDAD",
  "TIPO_SOLICITUD",
  "MODULO",
  "ESTADO_ESTIMACION",
  "ESTADO_FACTURACION_OT",
];

export default function CalificacionCoeSapFuncional() {
  const fileInputRef = useRef(null);

  const user = useMemo(() => readStoredUser(), []);
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");
  const canImport = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

  const [catalogos, setCatalogos] = useState({});
  const [categoriasCatalogo, setCategoriasCatalogo] = useState([]);
  const [subestadosControl, setSubestadosControl] = useState([]);

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const fetchCatalogos = useCallback(async () => {
    if (!canView) return;

    try {
      const nextCatalogos = {};

      await Promise.all(
        CATALOG_TYPES_TO_LOAD.map(async (tipo) => {
          const res = await jfetch(`/coe-sap-funcional/calificacion/catalogos?tipo=${encodeURIComponent(tipo)}`, {
            method: "GET",
            headers: commonHeaders,
          });

          const data = await res.json().catch(() => ({}));
          nextCatalogos[tipo] = Array.isArray(data?.data)
            ? data.data.map((item) => item.valor).filter(Boolean)
            : [];
        })
      );

      const catRes = await jfetch("/coe-sap-funcional/calificacion/catalogos", {
        method: "GET",
        headers: commonHeaders,
      });

      const catData = await catRes.json().catch(() => ({}));

      const subestadosRes = await jfetch("/coe-sap-funcional/config/subestados?include_inactive=1", {
        method: "GET",
        headers: commonHeaders,
      });

      const subestadosData = await subestadosRes.json().catch(() => ({}));

      setCatalogos(nextCatalogos);
      setCategoriasCatalogo(Array.isArray(catData?.categorias) ? catData.categorias : []);
      setSubestadosControl(Array.isArray(subestadosData?.data) ? subestadosData.data : []);
    } catch (error) {
      console.warn("No se pudieron cargar catálogos COE SAP Funcional", error);
    }
  }, [canView, commonHeaders]);

  const allColumnKeys = useMemo(() => TABLE_COLUMNS.map((col) => col.key), []);

  const [allRows, setAllRows] = useState([]);
  const [backendTotal, setBackendTotal] = useState(0);

  const [quickSearch, setQuickSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});

  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() =>
    getStorageArray(STORAGE_VISIBLE_COLUMNS, allColumnKeys)
  );

  const [filterColumnKeys, setFilterColumnKeys] = useState(() => {
    const stored = getStorageArray(STORAGE_FILTER_COLUMNS, DEFAULT_FILTER_COLUMNS);
    const merged = new Set([
      ...allColumnKeys,
      ...(Array.isArray(stored) ? stored : []),
    ]);

    return allColumnKeys.filter((key) => merged.has(key));
  });

  const [showFilters, setShowFilters] = useState(true);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [configSearch, setConfigSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

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

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const visibleColumns = useMemo(() => {
    const visibleSet = new Set(visibleColumnKeys);
    const cols = TABLE_COLUMNS.filter((col) => visibleSet.has(col.key));

    if (!cols.length) {
      return TABLE_COLUMNS.filter((col) => ["numero", "observaciones"].includes(col.key));
    }

    return cols;
  }, [visibleColumnKeys]);

  const filteredByColumns = useMemo(() => {
    const selected = applyColumnFilters(allRows, columnFilters);
    return applyQuickSearch(selected, quickSearch, TABLE_COLUMNS);
  }, [allRows, columnFilters, quickSearch]);

  const totalFiltered = filteredByColumns.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const pagedRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredByColumns.slice(start, start + pageSize);
  }, [filteredByColumns, page, pageSize, totalPages]);

  const activeFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((values) => Array.isArray(values) && values.length > 0).length;
  }, [columnFilters]);

  const rowsForFilterOptions = useCallback(
    (key) => {
      const otherFilters = Object.fromEntries(
        Object.entries(columnFilters).filter(([filterKey]) => filterKey !== key)
      );

      return applyQuickSearch(applyColumnFilters(allRows, otherFilters), quickSearch, TABLE_COLUMNS);
    },
    [allRows, columnFilters, quickSearch]
  );

  const uniqueValues = useMemo(() => {
    const map = {};

    TABLE_COLUMNS.forEach((col) => {
      const dynamicOptions = buildSelectOptionsFromRows(rowsForFilterOptions(col.key), col.key);
      const selectedOptions = (columnFilters[col.key] || []).map(toFilterOption);
      const merged = [...dynamicOptions];

      selectedOptions.forEach((selected) => {
        const exists = merged.some(
          (option) => normalizeForCompare(option.value) === normalizeForCompare(selected.value)
        );

        if (!exists) merged.unshift(selected);
      });

      map[col.key] = merged;
    });

    return map;
  }, [columnFilters, rowsForFilterOptions]);

  useEffect(() => {
    saveStorageArray(STORAGE_VISIBLE_COLUMNS, visibleColumnKeys);
  }, [visibleColumnKeys]);

  useEffect(() => {
    saveStorageArray(STORAGE_FILTER_COLUMNS, filterColumnKeys);
  }, [filterColumnKeys]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const fetchRows = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const pageSizeApi = 1000;

      const firstRes = await jfetch(`/coe-sap-funcional/calificacion?page=1&page_size=${pageSizeApi}`, {
        method: "GET",
        headers: commonHeaders,
      });

      const firstData = await firstRes.json().catch(() => ({}));

      if (!firstRes.ok) {
        throw new Error(firstData?.error || firstData?.mensaje || `HTTP ${firstRes.status}`);
      }

      let combined = Array.isArray(firstData?.data) ? firstData.data : [];
      const apiTotalPages = Number(firstData?.total_pages || 1);
      const apiTotal = Number(firstData?.total || combined.length || 0);

      for (let currentPage = 2; currentPage <= apiTotalPages; currentPage += 1) {
        const res = await jfetch(`/coe-sap-funcional/calificacion?page=${currentPage}&page_size=${pageSizeApi}`, {
          method: "GET",
          headers: commonHeaders,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
        }

        combined = combined.concat(Array.isArray(data?.data) ? data.data : []);
      }

      setAllRows(combined);
      setBackendTotal(apiTotal);
      setPage(1);
    } catch (error) {
      console.error("Error listando calificación COE SAP Funcional:", error);

      setAllRows([]);
      setBackendTotal(0);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar la calificación",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchCatalogos();
  }, [fetchCatalogos]);

  const handleFilterChange = (column, selectedOptions) => {
    const values = Array.isArray(selectedOptions)
      ? selectedOptions.map((option) => option.value)
      : [];

    setColumnFilters((prev) => ({
      ...prev,
      [column]: values,
    }));

    setPage(1);
  };

  const clearAllFilters = () => {
    setQuickSearch("");
    setColumnFilters({});
    setPage(1);
  };

  const toggleVisibleColumn = (key) => {
    setVisibleColumnKeys((prev) => {
      const exists = prev.includes(key);

      if (exists && prev.length <= 1) return prev;

      return exists ? prev.filter((item) => item !== key) : [...prev, key];
    });
  };

  const toggleFilterColumn = (key) => {
    setFilterColumnKeys((prev) => {
      const exists = prev.includes(key);

      if (exists) {
        setColumnFilters((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });

        return prev.filter((item) => item !== key);
      }

      return [...prev, key];
    });
  };

  const setColumnsByGroup = (group) => {
    if (group === "all") {
      setVisibleColumnKeys(allColumnKeys);
      return;
    }

    if (group === "seguimiento") {
      setVisibleColumnKeys([
        "numero",
        "sistema",
        "casoSm",
        "sociedad",
        "asunto",
        "observaciones",
        "nombreSolicitante",
        "estado",
        "estadoConsolidado",
        "responsableEstado",
        "asignadoA",
        "modulo",
        "categoria",
        "subcategoria",
        "articulo",
        "fechaAsignacion",
        "fechaRespuesta",
        "fechaResolucion",
        "fechaFinalizacionCierre",
        "fechaEstimacion",
        "diasEntregaEstimacion",
        "estadoEstimacion",
        "validarSubcategoria",
        "validarArticulo",
        "cruceSm",
        "cruceItop",
        "soloExcel",
        "estadoFacturacionOt",
        "nroOt",
        "totalHorasFuncionales",
        "totalHorasEstimadas",
      ]);
      return;
    }

    setVisibleColumnKeys(TABLE_COLUMNS.filter((col) => col.group === group).map((col) => col.key));
  };

  const setFilterColumnsByGroup = (group) => {
    if (group === "all") {
      setFilterColumnKeys(allColumnKeys);
      return;
    }

    if (group === "default") {
      setFilterColumnKeys(DEFAULT_FILTER_COLUMNS);
      return;
    }

    setFilterColumnKeys(TABLE_COLUMNS.filter((col) => col.group === group).map((col) => col.key));
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

    const { value: opcionesSync, isConfirmed } = await Swal.fire({
      icon: "question",
      title: "Sincronizar calificación",
      html: `
        <div style="text-align:left;line-height:1.6">
          <p>Se crearán o actualizarán los registros tomando <b>únicamente la Base Principal COE SAP</b>.</p>
          <p><b>No se sincronizarán fuentes SM ni ITOP.</b></p>

          <label for="calcoe-sync-mode" style="display:block;font-weight:700;margin-top:14px">
            Modo de sincronización
          </label>
          <select id="calcoe-sync-mode" class="swal2-select" style="display:block;width:100%;margin:8px 0 14px">
            <option value="preservar_manual">Preservar campos manuales</option>
            <option value="solo_vacios">Solo completar campos vacíos</option>
            <option value="forzar">Forzar actualización desde la Base Principal</option>
          </select>

          <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #e8e8e8;border-radius:12px;background:#f8fafc">
            <input id="calcoe-completar-maestros" type="checkbox" checked style="margin-top:5px" />
            <span>
              <b>Completar automáticamente desde tablas maestras</b><br />
              <small>
                Llena vacíos, normaliza el consultor y completa su módulo cuando sea inequívoco.
                Los clientes y los campos manuales no se modifican.
              </small>
            </span>
          </label>
        </div>
      `,
      preConfirm: () => ({
        modo: document.getElementById("calcoe-sync-mode")?.value || "preservar_manual",
        completarMaestros: Boolean(document.getElementById("calcoe-completar-maestros")?.checked),
      }),

      showCancelButton: true,
      confirmButtonText: "Sí, sincronizar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!isConfirmed) return;

    const modo = opcionesSync?.modo || "preservar_manual";
    const completarMaestros = opcionesSync?.completarMaestros !== false;

    setGenerating(true);

    let offsetBase = 0;

    let totalBase = 0;
    let totalProcesados = 0;
    let totalCreados = 0;
    let totalActualizados = 0;
    let totalCrucesBase = 0;
    let loteActual = 0;
    let maestrosModificados = 0;
    let camposCompletados = 0;
    let consultoresNormalizados = 0;
    let modulosCompletados = 0;
    const consultoresSinResolver = new Set();

    try {
      Swal.fire({
        title: "Sincronizando Base Principal...",
        html: `
          <div style="text-align:left;line-height:1.6">

            <p id="calcoe-sync-message">
              Iniciando sincronización...
            </p>

            <p>
              <b>Procesados:</b>
              <span id="calcoe-sync-processed">0</span>
            </p>

            <p>
              <b>Total:</b>
              <span id="calcoe-sync-total">—</span>
            </p>

            <p>
              <b>Lote:</b>
              <span id="calcoe-sync-batch">0</span>
            </p>

            <div
              style="
                width:100%;
                height:10px;
                background:#e9ecef;
                border-radius:10px;
                overflow:hidden;
                margin-top:15px;
              "
            >
              <div
                id="calcoe-sync-progress"
                style="
                  width:0%;
                  height:100%;
                  background:#DA291C;
                  transition:width .3s ease;
                "
              ></div>
            </div>

            <p
              id="calcoe-sync-percent"
              style="
                text-align:center;
                margin-top:8px;
                font-weight:700;
              "
            >
              0%
            </p>

          </div>
        `,

        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCancelButton: false,
      });

      while (true) {
        loteActual += 1;

        const offsetAnterior = offsetBase;

        const res = await jfetch(
          "/coe-sap-funcional/calificacion/sincronizar-lote",
          {
            method: "POST",

            headers: {
              ...commonHeaders,
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              modo: modo || "preservar_manual",

              // SOLO BASE PRINCIPAL
              crear_desde_base: true,

              // IMPORTANTE:
              // No procesar SM ni ITOP
              crear_desde_fuentes: false,

              // Tamaño controlado
              limit: 300,

              // Continuación del proceso
              offset_base: offsetBase,
            }),
          }
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data?.error ||
            data?.mensaje ||
            `HTTP ${res.status}`
          );
        }

        // ---------------------------------------------------------
        // ACUMULAR RESULTADOS
        // ---------------------------------------------------------

        totalBase = Number(
          data?.totalBase ??
          data?.total_base ??
          totalBase
        );

        totalProcesados += Number(
          data?.procesados ?? 0
        );

        totalCreados += Number(
          data?.creados ?? 0
        );

        totalActualizados += Number(
          data?.actualizados ?? 0
        );

        totalCrucesBase += Number(
          data?.cruzadosBase ??
          data?.cruzados_base ??
          0
        );

        // ---------------------------------------------------------
        // SIGUIENTE OFFSET
        // ---------------------------------------------------------

        const siguienteOffset = Number(
          data?.offsetBase ??
          data?.offset_base ??
          offsetBase
        );

        // ---------------------------------------------------------
        // ACTUALIZAR PROGRESO
        // ---------------------------------------------------------

        const porcentaje =
          totalBase > 0
            ? Math.min(
                100,
                Math.round(
                  (siguienteOffset / totalBase) * 100
                )
              )
            : 0;

        const processedElement =
          document.getElementById(
            "calcoe-sync-processed"
          );

        const totalElement =
          document.getElementById(
            "calcoe-sync-total"
          );

        const batchElement =
          document.getElementById(
            "calcoe-sync-batch"
          );

        const messageElement =
          document.getElementById(
            "calcoe-sync-message"
          );

        const progressElement =
          document.getElementById(
            "calcoe-sync-progress"
          );

        const percentElement =
          document.getElementById(
            "calcoe-sync-percent"
          );

        if (processedElement) {
          processedElement.textContent =
            siguienteOffset.toLocaleString("es-CO");
        }

        if (totalElement) {
          totalElement.textContent =
            totalBase.toLocaleString("es-CO");
        }

        if (batchElement) {
          batchElement.textContent =
            loteActual;
        }

        if (messageElement) {
          messageElement.textContent =
            data?.terminado
              ? "Finalizando sincronización..."
              : "Procesando Base Principal...";
        }

        if (progressElement) {
          progressElement.style.width =
            `${porcentaje}%`;
        }

        if (percentElement) {
          percentElement.textContent =
            `${porcentaje}%`;
        }

        // ---------------------------------------------------------
        // TERMINÓ
        // ---------------------------------------------------------

        if (data?.terminado === true) {
          offsetBase = siguienteOffset;
          break;
        }

        // ---------------------------------------------------------
        // PROTECCIÓN CONTRA LOOP INFINITO
        // ---------------------------------------------------------

        if (siguienteOffset <= offsetAnterior) {
          throw new Error(
            "La sincronización no pudo avanzar al siguiente lote. " +
            `Offset actual: ${offsetAnterior}. ` +
            `Offset recibido: ${siguienteOffset}.`
          );
        }

        offsetBase = siguienteOffset;
      }

      if (completarMaestros) {
        let offsetMaestros = 0;
        let totalMaestros = 0;

        while (true) {
          const offsetAnterior = offsetMaestros;
          const messageElement = document.getElementById("calcoe-sync-message");
          if (messageElement) messageElement.textContent = "Completando desde tablas maestras...";

          const res = await jfetch(
            "/coe-sap-funcional/calificacion/completar-desde-maestros",
            {
              method: "POST",
              headers: { ...commonHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ offset: offsetMaestros, limit: 300 }),
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
          }

          totalMaestros = Number(data?.total ?? totalMaestros);
          maestrosModificados += Number(data?.registrosModificados ?? 0);
          camposCompletados += Number(data?.camposCompletados ?? 0);
          consultoresNormalizados += Number(data?.consultoresNormalizados ?? 0);
          modulosCompletados += Number(data?.modulosCompletados ?? 0);
          (data?.consultoresSinResolver || []).forEach((nombre) => consultoresSinResolver.add(nombre));
          offsetMaestros = Number(data?.offset ?? offsetMaestros);

          const porcentaje = totalMaestros > 0
            ? Math.min(100, Math.round((offsetMaestros / totalMaestros) * 100))
            : 100;
          const processedElement = document.getElementById("calcoe-sync-processed");
          const totalElement = document.getElementById("calcoe-sync-total");
          const progressElement = document.getElementById("calcoe-sync-progress");
          const percentElement = document.getElementById("calcoe-sync-percent");
          if (processedElement) processedElement.textContent = offsetMaestros.toLocaleString("es-CO");
          if (totalElement) totalElement.textContent = totalMaestros.toLocaleString("es-CO");
          if (progressElement) progressElement.style.width = `${porcentaje}%`;
          if (percentElement) percentElement.textContent = `${porcentaje}%`;

          if (data?.terminado === true) break;
          if (offsetMaestros <= offsetAnterior) {
            throw new Error("El autocompletado desde maestros no pudo avanzar al siguiente lote.");
          }
        }
      }

      Swal.close();

      await Swal.fire({
        icon: "success",
        title: "Sincronización finalizada",

        html: `
          <div style="text-align:left;line-height:1.6">

            <p>
              <b>Fuente:</b>
              Base Principal COE SAP
            </p>

            <p>
              <b>Total Base:</b>
              ${totalBase.toLocaleString("es-CO")}
            </p>

            <p>
              <b>Procesados:</b>
              ${totalProcesados.toLocaleString("es-CO")}
            </p>

            <p>
              <b>Creados:</b>
              ${totalCreados.toLocaleString("es-CO")}
            </p>

            <p>
              <b>Actualizados:</b>
              ${totalActualizados.toLocaleString("es-CO")}
            </p>

            <p>
              <b>Cruces con Base:</b>
              ${totalCrucesBase.toLocaleString("es-CO")}
            </p>

            <p>
              <b>Lotes procesados:</b>
              ${loteActual.toLocaleString("es-CO")}
            </p>

            <hr>

            <p>
              <b>SM:</b> No sincronizado
            </p>

            <p>
              <b>ITOP:</b> No sincronizado
            </p>

            <hr>

            <p><b>Autocompletado desde maestros:</b> ${completarMaestros ? "Ejecutado" : "Omitido"}</p>
            ${completarMaestros ? `
              <p><b>Registros modificados:</b> ${maestrosModificados.toLocaleString("es-CO")}</p>
              <p><b>Campos completados:</b> ${camposCompletados.toLocaleString("es-CO")}</p>
              <p><b>Consultores normalizados:</b> ${consultoresNormalizados.toLocaleString("es-CO")}</p>
              <p><b>Módulos completados:</b> ${modulosCompletados.toLocaleString("es-CO")}</p>
              <p><b>Consultores sin coincidencia segura:</b> ${consultoresSinResolver.size.toLocaleString("es-CO")}</p>
              <p><b>Clientes modificados:</b> 0</p>
            ` : ""}

          </div>
        `,

        confirmButtonColor: "#008C67",
      });

      await fetchRows();

    } catch (error) {

      console.error(
        "Error sincronizando calificación COE SAP:",
        error
      );

      Swal.close();

      await Swal.fire({
        icon: "error",
        title: "Error sincronizando calificación",
        text:
          error?.message ||
          "No se pudo completar la sincronización de la Base Principal.",
        confirmButtonColor: "#DA291C",
      });

    } finally {
      setGenerating(false);
    }
  };



  const descargarExcel = async () => {
    setDownloadingExcel(true);

    try {
      const qs = new URLSearchParams();

      if (quickSearch.trim()) {
        qs.set("q", quickSearch.trim());
      }

      const filterMap = {
        sociedad: "sociedad",
        clienteAsociadoNombre: "clienteAsociadoNombre",
        validarCliente: "validarCliente",
        estado: "estado",
        estadoPrincipal: "estadoPrincipal",
        subestado: "subestado",
        validarEstadoControl: "validarEstadoControl",
        estadoConsolidado: "estadoConsolidado",
        responsableEstado: "responsableEstado",
        modulo: "modulo",
        tipoSolicitud: "tipoSolicitud",
        controlHoras: "controlHoras",
        asignadoA: "asignadoA",
        sistema: "sistema",
        categoria: "categoria",
        subcategoria: "subcategoria",
        articulo: "articulo",
      };

      Object.entries(filterMap).forEach(([columnKey, queryKey]) => {
        const values = columnFilters[columnKey] || [];
        values.forEach((value) => {
          if (value === EMPTY_FILTER_VALUE) return;
          const clean = String(value ?? "").trim();
          if (clean) qs.append(queryKey, clean);
        });
      });

      const url = `/coe-sap-funcional/calificacion/export-excel${qs.toString() ? `?${qs.toString()}` : ""}`;

      await downloadExcelFile(
        url,
        commonHeaders,
        "calificacion_coe_sap_funcional.xlsx"
      );
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo descargar el Excel",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setDownloadingExcel(false);
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
    if (!canImport) return;

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

  const editObservaciones = async (row) => {
    if (!row?.id) return;

    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para editar observaciones.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    const current = getTodaySeguimiento(row?.observaciones);
    const history = row?.observaciones || "Sin observaciones anteriores.";
    const stamp = todayStamp();

    const result = await Swal.fire({
      title: "Observaciones / Seguimiento semanal",
      html: `
        <div class="calcoe-swal-info">
          <b>ID:</b> ${escapeHtml(row?.numero || "-")}<br/>
          <b>Sociedad:</b> ${escapeHtml(row?.sociedad || "-")}<br/>
          <b>Asunto:</b> ${escapeHtml(row?.asunto || "-")}<br/>
          <b>Estado:</b> ${escapeHtml(row?.estado || "-")}
        </div>
        <div style="margin:12px 0 6px;text-align:left;font-weight:800">
          Comentario de hoy (${stamp})
        </div>
        <div style="margin-top:14px;text-align:left">
          <b>Historial protegido</b>
          <pre style="max-height:220px;overflow:auto;white-space:pre-wrap;padding:12px;border:1px solid #e8e8e8;border-radius:10px;background:#f8fafc">${escapeHtml(history)}</pre>
        </div>
      `,
      input: "textarea",
      inputValue: current,
      inputAttributes: {
        placeholder: "Escribe el seguimiento de hoy. La fecha y el usuario se agregan automáticamente.",
      },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
      cancelButtonColor: "#6b7280",
      customClass: {
        popup: "calcoe-swal-popup",
        input: "calcoe-swal-textarea",
      },
    });

    if (!result.isConfirmed) return;

    const nextValue = result.value ?? "";

    try {
      const res = await jfetch(`/coe-sap-funcional/calificacion/${row.id}`, {
        method: "PATCH",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comentarioSeguimiento: nextValue,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Seguimiento actualizado",
        text: "El comentario de hoy quedó arriba del historial.",
        confirmButtonColor: "#008C67",
      });

      fetchRows();
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    }
  };

  const saveEdit = async () => {
    if (!editRow?.id) return;

    setSavingEdit(true);

    try {
      const payload = { ...editForm };

      // No reescribir el seguimiento de hoy cuando se guardan otros campos.
      if (
        String(payload.comentarioSeguimiento || "").trim() ===
        String(getTodaySeguimiento(editRow?.observaciones) || "").trim()
      ) {
        delete payload.comentarioSeguimiento;
      }

      // Estos campos son derivados del catálogo oficial y no se envían como texto libre.
      [
        "estadoPrincipal",
        "subestado",
        "validarEstadoControl",
        "responsableEstado",
        "estadoConsolidado",
        "clienteAsociadoNombre",
      ].forEach((key) => delete payload[key]);

      const res = await jfetch(`/coe-sap-funcional/calificacion/${editRow.id}`, {
        method: "PATCH",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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


  const getEditOptions = useCallback((field) => {
    if (field.source === "subestadoControl") {
      return buildSubestadoOptions(subestadosControl);
    }

    if (field.catalog) {
      const baseOptions = catalogos[field.catalog] || [];
      if (field.catalog === "MODULO" && baseOptions.length === 0) {
        return MODULES.map((value) => ({ value, label: value }));
      }
      return uniqueOptions(baseOptions);
    }

    if (field.dependent === "categoria") {
      const modulo = normalizeForCompare(editForm.modulo);
      return uniqueOptions(
        categoriasCatalogo
          .filter((item) => !modulo || normalizeForCompare(item.modulo) === modulo)
          .map((item) => item.categoria)
      );
    }

    if (field.dependent === "subcategoria") {
      const modulo = normalizeForCompare(editForm.modulo);
      const categoria = normalizeForCompare(editForm.categoria);
      return uniqueOptions(
        categoriasCatalogo
          .filter((item) => !modulo || normalizeForCompare(item.modulo) === modulo)
          .filter((item) => !categoria || normalizeForCompare(item.categoria) === categoria)
          .map((item) => item.subcategoria)
      );
    }

    if (field.dependent === "articulo") {
      const modulo = normalizeForCompare(editForm.modulo);
      const categoria = normalizeForCompare(editForm.categoria);
      const subcategoria = normalizeForCompare(editForm.subcategoria);
      return uniqueOptions(
        categoriasCatalogo
          .filter((item) => !modulo || normalizeForCompare(item.modulo) === modulo)
          .filter((item) => !categoria || normalizeForCompare(item.categoria) === categoria)
          .filter((item) => !subcategoria || normalizeForCompare(item.subcategoria) === subcategoria)
          .map((item) => item.articulo)
      );
    }

    return [];
  }, [catalogos, categoriasCatalogo, editForm, subestadosControl]);

  const renderEditField = (field) => {
    if (field.type === "readonly") {
      return (
        <div className="calcoe-readonly-box">
          {cleanText(editForm[field.key])}
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <textarea
          value={editForm[field.key] || ""}
          onChange={(e) =>
            setEditForm((prev) => ({
              ...prev,
              [field.key]: e.target.value,
            }))
          }
          placeholder={`${todayStamp()} - Escribe el seguimiento...`}
        />
      );
    }

    if (field.type === "select") {
      const options = getEditOptions(field);

      return (
        <select
          value={editForm[field.key] || ""}
          onChange={(e) =>
            setEditForm((prev) => {
              const next = {
                ...prev,
                [field.key]: e.target.value,
              };

              if (field.key === "subestadoCatalogoId") {
                const selected = subestadosControl.find((item) => String(item.id) === String(e.target.value));
                next.subestado = selected?.valor || selected?.nombre || "";
                next.estadoPrincipal = selected?.estadoPrincipal || selected?.estado_principal || selected?.estadoPrincipalNombre || selected?.estadoNombre || "";
                next.validarEstadoControl = selected ? (selected.activo === false ? "INACTIVO" : "OK") : "";

                if (!next.observacionCambioEstado) {
                  next.observacionCambioEstado = `${todayStamp()} - `;
                }
              }

              if (field.key === "modulo") {
                next.categoria = "";
                next.subcategoria = "";
                next.articulo = "";
              }

              if (field.key === "categoria") {
                next.subcategoria = "";
                next.articulo = "";
              }

              if (field.key === "subcategoria") {
                next.articulo = "";
              }

              return next;
            })
          }
        >
          <option value="">Seleccione...</option>
          {options.map((option) => (
            <option key={`${field.key}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    const inputType = field.type === "datetime" ? "datetime-local" : field.type;

    return (
      <input
        type={inputType}
        step={field.type === "number" ? "0.25" : undefined}
        value={editForm[field.key] || ""}
        onChange={(e) =>
          setEditForm((prev) => ({
            ...prev,
            [field.key]: e.target.value,
          }))
        }
      />
    );
  };

  const renderCell = (row, col) => {
    const value = row[col.key];

    if (col.key === "observaciones") {
      return renderObservaciones(value);
    }

    if (["validarFechaAsignacion", "validarFechaActualizacion", "validarFechaResolucion", "validarFechaCierre", "validarSubcategoria", "validarArticulo"].includes(col.key)) {
      return <span className={`calcoe-pill ${getValidationClass(value)}`}>{cleanText(value)}</span>;
    }

    if (["cruceSm", "cruceItop", "soloExcel"].includes(col.key)) {
      return <span className={`calcoe-pill ${getBooleanClass(Boolean(value))}`}>{value ? "Sí" : "No"}</span>;
    }

    if (col.key === "camposEditadosManual") {
      return objectSummary(value);
    }

    if (col.key === "origenDatos") {
      return originSummary(value);
    }

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

  const configColumns = useMemo(() => {
    const q = normalizeForCompare(configSearch);

    return TABLE_COLUMNS.filter((col) => {
      if (!q) return true;
      return normalizeForCompare(`${col.label} ${col.key} ${col.group}`).includes(q);
    });
  }, [configSearch]);

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
          <h1>Calificación COE SAP</h1>
          <p>
            Consulta, filtra por columnas, selecciona qué columnas ver y lleva el
            seguimiento semanal desde Observaciones.
          </p>
        </div>

        <div className="calcoe-hero-actions">
          <button
            type="button"
            className="calcoe-btn danger"
            onClick={generarDesdeBase}
            disabled={generating || uploadingExcel}
          >
            {generating ? "Sincronizando..." : "Sincronizar calificación"}
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

          <button
            type="button"
            className="calcoe-btn light"
            onClick={descargarExcel}
            disabled={generating || uploadingExcel || downloadingExcel}
          >
            {downloadingExcel ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>
      </section>

      <section className="calcoe-toolbar-card">
        <div className="calcoe-toolbar-left">
          <label className="calcoe-search">
            <span>Buscar en toda la tabla</span>
            <input
              type="text"
              value={quickSearch}
              placeholder="ID, asunto, observaciones, estado, sociedad..."
              onChange={(e) => {
                setQuickSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <div className="calcoe-metrics">
            <div>
              <span>Total cargado</span>
              <strong>{backendTotal.toLocaleString("es-CO")}</strong>
            </div>

            <div>
              <span>Filtrado</span>
              <strong>{totalFiltered.toLocaleString("es-CO")}</strong>
            </div>

            <div>
              <span>Filtros activos</span>
              <strong>{activeFiltersCount}</strong>
            </div>
          </div>
        </div>

        <div className="calcoe-toolbar-actions">
          <button
            type="button"
            className={`calcoe-btn ${showFilters ? "danger" : "light"}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
          </button>

          <button
            type="button"
            className="calcoe-btn light"
            onClick={() => {
              setColumnPanelOpen(true);
              setFilterPanelOpen(false);
            }}
          >
            Columnas visibles
          </button>

          <button
            type="button"
            className="calcoe-btn light"
            onClick={() => {
              setFilterColumnKeys(allColumnKeys);
              setFilterPanelOpen(false);
              setColumnPanelOpen(false);
              setShowFilters(true);
            }}
          >
            Filtros en todas
          </button>

          <button
            type="button"
            className="calcoe-btn ghost"
            onClick={clearAllFilters}
            disabled={!quickSearch && activeFiltersCount === 0}
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            className="calcoe-btn dark"
            onClick={fetchRows}
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </section>

      {(columnPanelOpen || filterPanelOpen) && (
        <section className="calcoe-config-panel">
          <div className="calcoe-config-head">
            <div>
              <h2>{columnPanelOpen ? "Seleccionar columnas visibles" : "Filtros activos por columna"}</h2>
              <p>
                Puedes buscar columnas y ajustar la vista. Los filtros de la tabla quedan activos en todas las columnas visibles.
              </p>
            </div>

            <button
              type="button"
              className="calcoe-close small"
              onClick={() => {
                setColumnPanelOpen(false);
                setFilterPanelOpen(false);
                setConfigSearch("");
              }}
            >
              ✕
            </button>
          </div>

          <div className="calcoe-config-actions">
            <input
              type="text"
              value={configSearch}
              placeholder="Buscar columna..."
              onChange={(e) => setConfigSearch(e.target.value)}
            />

            {columnPanelOpen ? (
              <>
                <button type="button" onClick={() => setColumnsByGroup("all")}>Todas</button>
                <button type="button" onClick={() => setColumnsByGroup("seguimiento")}>Seguimiento</button>
                <button type="button" onClick={() => setColumnsByGroup("auto")}>Automáticas</button>
                <button type="button" onClick={() => setColumnsByGroup("manual")}>Manuales</button>
                <button type="button" onClick={() => setColumnsByGroup("calc")}>Calculadas</button>
                <button type="button" onClick={() => setColumnsByGroup("hours")}>Horas</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setFilterColumnsByGroup("all")}>Todos</button>
                <button type="button" onClick={() => setFilterColumnsByGroup("default")}>Recomendados</button>
                <button type="button" onClick={() => setFilterColumnsByGroup("manual")}>Manuales</button>
                <button type="button" onClick={() => setFilterColumnsByGroup("calc")}>Calculados</button>
                <button type="button" onClick={() => setFilterColumnsByGroup("hours")}>Horas</button>
              </>
            )}
          </div>

          <div className="calcoe-column-picker">
            {configColumns.map((col) => {
              const checked = columnPanelOpen
                ? visibleColumnKeys.includes(col.key)
                : filterColumnKeys.includes(col.key);

              return (
                <label key={`${columnPanelOpen ? "col" : "filter"}-${col.key}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => columnPanelOpen ? toggleVisibleColumn(col.key) : toggleFilterColumn(col.key)}
                  />

                  <span className={`calcoe-col-dot ${getColumnGroupClass(col.group)}`} />

                  <span>
                    <strong>{col.label}</strong>
                    <small>{col.group === "auto" ? "Automática" : col.group === "manual" ? "Manual" : col.group === "calc" ? "Calculada" : "Horas"}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section className="calcoe-card calcoe-table-card">
        <div className="calcoe-table-head">
          <div>
            <h2>Base de calificación</h2>
            <p>
              Mostrando <b>{pagedRows.length}</b> de <b>{totalFiltered.toLocaleString("es-CO")}</b>{" "}
              registros filtrados • Página <b>{page}</b> de <b>{totalPages}</b>
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
              {visibleColumns.map((col) => (
                <col key={col.key} style={{ width: `${col.w}ch` }} />
              ))}
              <col style={{ width: "19ch" }} />
            </colgroup>

            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.cls || ""} ${getColumnGroupClass(col.group)}`}
                  >
                    <span>{col.label}</span>
                  </th>
                ))}
                <th className="sticky-actions">Acciones</th>
              </tr>

              {showFilters && (
                <tr className="calcoe-filter-row">
                  {visibleColumns.map((col) => (
                    <th
                      key={`filter-${col.key}`}
                      className={`${col.cls || ""} ${getColumnGroupClass(col.group)}`}
                    >
                      <Select
                        options={uniqueValues[col.key] || []}
                        value={(columnFilters[col.key] || []).map(toFilterOption)}
                        onChange={(opts) => handleFilterChange(col.key, opts)}
                        placeholder="Filtrar..."
                        className="calcoe-select-filter"
                        classNamePrefix="calcoe-react-select"
                        isMulti
                        isClearable
                        isSearchable
                        closeMenuOnSelect={false}
                        hideSelectedOptions={false}
                        noOptionsMessage={() => "Sin opciones"}
                        menuPortalTarget={portalTarget}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 99999 }),
                        }}
                      />
                    </th>
                  ))}
                  <th className="sticky-actions" />
                </tr>
              )}
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="calcoe-empty">
                    <div className="calcoe-loader" />
                    Cargando calificación...
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="calcoe-empty">
                    No hay registros para mostrar.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, index) => (
                  <tr key={`${row.id || row.numero || "row"}-${index}`}>
                    {visibleColumns.map((col) => (
                      <td
                        key={`${row.id}-${col.key}`}
                        className={`${col.cls || ""} ${getColumnGroupClass(col.group)} ${
                          col.key === "observaciones" ? "editable-observaciones" : ""
                        }`}
                        title={
                          col.key === "observaciones"
                            ? "Doble clic para editar observaciones"
                            : String(row[col.key] ?? "").length > 40
                              ? cleanText(row[col.key])
                              : undefined
                        }
                        onDoubleClick={() => {
                          if (col.key === "observaciones") {
                            editObservaciones(row);
                          }
                        }}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}

                    <td className="sticky-actions calcoe-row-actions">
                      <button
                        type="button"
                        className="calcoe-mini-btn"
                        onClick={() => openEdit(row)}
                        disabled={!canImport}
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
                <h3>Editar campos manuales / no automáticos</h3>
                <p>
                  Caso <b>{editRow?.numero}</b> • El estado se controla desde la lista oficial de subestados.
                </p>
              </div>

              <button type="button" className="calcoe-close" onClick={closeEdit} disabled={savingEdit}>
                ✕
              </button>
            </div>

            <div className="calcoe-modal-body">
              <div className="calcoe-edit-grid">
                {EDIT_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className={`calcoe-filter ${field.wide ? "wide" : ""}`}
                  >
                    <span>
                      {field.label}
                      {field.key === "comentarioSeguimiento" && (
                        <small className="calcoe-field-help">
                          Solo la entrada del día actual se puede corregir; el historial anterior permanece bloqueado.
                        </small>
                      )}
                    </span>

{renderEditField(field)}
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
                  Caso <b>{hoursRow?.numero}</b> • Total estimadas: {" "}
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

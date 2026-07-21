import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./DetalleSeguimientoClienteCoeSap.css";

const EMPTY_FILTERS = {
  q: "",
  sociedad: "",
  clienteAsociadoNombre: "",
  validarCliente: "",
  anio: "",
  mes: "",
  estadoConsolidado: "",
  estado: "",
  estadoPrincipal: "",
  subestado: "",
  validarEstadoControl: "",
  responsableEstado: "",
  modulo: "",
  tipoSolicitud: "",
  asignadoA: "",
};

const PAGE_SIZES = [25, 50, 100, 200, 500];


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
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("es-CO");
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildQuery(filters, page, pageSize) {
  const qs = new URLSearchParams();

  qs.set("page", String(page));
  qs.set("page_size", String(pageSize));

  Object.entries(filters || {}).forEach(([key, value]) => {
    const s = String(value ?? "").trim();
    if (!s) return;

    qs.set(key, s);
  });

  return qs.toString();
}

function optionItems(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          value: item.value ?? item.label ?? "",
          label: item.label ?? item.value ?? "",
        };
      }

      return {
        value: item,
        label: item,
      };
    })
    .filter((item) => String(item.value ?? "").trim() !== "");
}

function SimpleSelect({ label, value, options, onChange }) {
  return (
    <label className="coedetail-filter">
      <span>{label}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {optionItems(options).map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function statusClass(value) {
  const s = String(value || "").toUpperCase();

  if (s.includes("CERR") || s.includes("SOLUC")) return "ok";
  if (s.includes("ESPERA") || s.includes("PEND")) return "warn";
  if (s.includes("ABIER") || s.includes("PROCES") || s.includes("ASIGN")) return "info";
  if (s.includes("CANCEL")) return "neutral";

  return "neutral";
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
    return <span className="coedetail-empty-text">—</span>;
  }

  return (
    <div className="coedetail-obs-list">
      {items.map((item, index) => (
        <div key={`${item.date || "obs"}-${index}`} className="coedetail-obs-item">
          {item.date && <span className="coedetail-obs-date">{item.date}</span>}
          <span className="coedetail-obs-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function DetalleSeguimientoClienteCoeSap() {
  const user = useMemo(() => readStoredUser(), []);
  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");
  const canEdit = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [opciones, setOpciones] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchDetalle = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery(appliedFilters, page, pageSize);
      const res = await jfetch(`/coe-sap-funcional/calificacion/detalle-cliente?${qs}`, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setRows(Array.isArray(data?.data) ? data.data : []);
      setResumen(Array.isArray(data?.resumen) ? data.resumen : []);
      setOpciones(data?.opciones || {});
      setTotal(Number(data?.total || 0));
      setTotalPages(Number(data?.total_pages || 1));
    } catch (error) {
      console.error("Error detalle seguimiento COE SAP:", error);
      setRows([]);
      setResumen([]);
      setTotal(0);
      setTotalPages(1);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar el detalle",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, appliedFilters, page, pageSize]);



  const descargarExcel = useCallback(async () => {
    setDownloadingExcel(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/detalle-cliente/export-excel${qs ? `?${qs}` : ""}`;

      await downloadExcelFile(
        url,
        commonHeaders,
        "detalle_seguimiento_cliente_coe_sap_funcional.xlsx"
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
  }, [appliedFilters, commonHeaders]);

  useEffect(() => {
    fetchDetalle();
  }, [fetchDetalle]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const editObservaciones = async (row) => {
    if (!row?.id) return;

    if (!canEdit) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para editar observaciones.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    const stamp = todayStamp();
    const current = row?.observaciones || "";

    const result = await Swal.fire({
      title: "Seguimiento semanal",
      html: `
        <div class="coedetail-swal-info">
          <b>ID:</b> ${escapeHtml(row?.numero || "-")}<br/>
          <b>Sociedad:</b> ${escapeHtml(row?.sociedad || "-")}<br/>
          <b>Cliente asociado:</b> ${escapeHtml(row?.clienteAsociadoNombre || "-")}<br/>
          <b>Asunto:</b> ${escapeHtml(row?.asunto || "-")}<br/>
          <b>Estado:</b> ${escapeHtml(row?.estado || "-")}
        </div>
        <button type="button" id="coedetail-add-weekly-entry" class="coedetail-swal-weekly-btn">
          + Agregar entrada semanal (${stamp})
        </button>
      `,
      input: "textarea",
      inputValue: current,
      inputAttributes: {
        placeholder: `${stamp} - Escribe aquí el seguimiento semanal...`,
      },
      didOpen: () => {
        const btn = document.getElementById("coedetail-add-weekly-entry");
        const textarea = Swal.getInput();

        if (btn && textarea) {
          btn.addEventListener("click", () => {
            const prefix = textarea.value ? `${textarea.value}\n` : "";
            textarea.value = `${prefix}${stamp} - `;
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          });
        }
      },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
      cancelButtonColor: "#6b7280",
      customClass: {
        popup: "coedetail-swal-popup",
        input: "coedetail-swal-textarea",
      },
    });

    if (!result.isConfirmed) return;

    try {
      const res = await jfetch(`/coe-sap-funcional/calificacion/${row.id}`, {
        method: "PATCH",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observaciones: result.value ?? "",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      await Swal.fire({
        icon: "success",
        title: "Observaciones actualizadas",
        text: "El seguimiento fue guardado correctamente.",
        confirmButtonColor: "#008C67",
      });

      fetchDetalle();
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    }
  };

  if (!canView) {
    return (
      <div className="coedetail-page">
        <div className="coedetail-access-card">
          <div className="coedetail-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coedetail-page">
      <section className="coedetail-hero">
        <div>
          <span className="coedetail-eyebrow">Detalle seguimiento</span>
          <h1>Seguimiento por cliente COE SAP Funcional</h1>
          <p>
            Vista tipo detalle del Excel para reuniones semanales: responsable, estado,
            ID, asunto y observaciones.
          </p>
        </div>

        <div className="coedetail-hero-actions">
          <button type="button" className="coedetail-btn light" onClick={fetchDetalle} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <button type="button" className="coedetail-btn danger" onClick={descargarExcel} disabled={loading || downloadingExcel}>
            {downloadingExcel ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>
      </section>

      <section className="coedetail-card coedetail-filters-card">
        <div className="coedetail-card-head">
          <div>
            <h2>Filtros</h2>
            <p>Filtra por sociedad, estado, responsable, módulo, asignado o búsqueda general.</p>
          </div>

          <button type="button" className="coedetail-btn ghost" onClick={clearFilters} disabled={loading}>
            Limpiar
          </button>
        </div>

        <div className="coedetail-filters-grid">
          <label className="coedetail-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="ID, asunto, observaciones, sociedad..."
              onChange={(e) => updateFilter("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>

          <SimpleSelect label="Sociedad" value={filters.sociedad} options={opciones.sociedad} onChange={(v) => updateFilter("sociedad", v)} />
          <SimpleSelect label="Cliente asociado" value={filters.clienteAsociadoNombre} options={opciones.clienteAsociadoNombre} onChange={(v) => updateFilter("clienteAsociadoNombre", v)} />
          <SimpleSelect label="Validar cliente" value={filters.validarCliente} options={opciones.validarCliente} onChange={(v) => updateFilter("validarCliente", v)} />
          <SimpleSelect label="Año" value={filters.anio} options={opciones.anio} onChange={(v) => updateFilter("anio", v)} />
          <SimpleSelect label="Mes" value={filters.mes} options={opciones.mes} onChange={(v) => updateFilter("mes", v)} />
          <SimpleSelect label="Estado consolidado" value={filters.estadoConsolidado} options={opciones.estadoConsolidado} onChange={(v) => updateFilter("estadoConsolidado", v)} />
          <SimpleSelect label="Estado original" value={filters.estado} options={opciones.estado} onChange={(v) => updateFilter("estado", v)} />
          <SimpleSelect label="Estado principal" value={filters.estadoPrincipal} options={opciones.estadoPrincipal} onChange={(v) => updateFilter("estadoPrincipal", v)} />
          <SimpleSelect label="Subestado" value={filters.subestado} options={opciones.subestado} onChange={(v) => updateFilter("subestado", v)} />
          <SimpleSelect label="Validar estado" value={filters.validarEstadoControl} options={opciones.validarEstadoControl} onChange={(v) => updateFilter("validarEstadoControl", v)} />
          <SimpleSelect label="Responsable" value={filters.responsableEstado} options={opciones.responsableEstado} onChange={(v) => updateFilter("responsableEstado", v)} />
          <SimpleSelect label="Módulo" value={filters.modulo} options={opciones.modulo} onChange={(v) => updateFilter("modulo", v)} />
          <SimpleSelect label="Tipo solicitud" value={filters.tipoSolicitud} options={opciones.tipoSolicitud} onChange={(v) => updateFilter("tipoSolicitud", v)} />
          <SimpleSelect label="Asignado a" value={filters.asignadoA} options={opciones.asignadoA} onChange={(v) => updateFilter("asignadoA", v)} />
        </div>

        <div className="coedetail-actions">
          <button type="button" className="coedetail-btn danger" onClick={applyFilters} disabled={loading}>
            {loading ? "Consultando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="coedetail-btn light" onClick={clearFilters} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      <section className="coedetail-summary-grid">
        <article className="coedetail-summary-card total">
          <span>Total registros</span>
          <strong>{numberText(total)}</strong>
          <small>Según filtros aplicados</small>
        </article>

        <article className="coedetail-resumen-card">
          <div className="coedetail-card-head compact">
            <div>
              <h2>Resumen por responsable y estado</h2>
              <p>Equivalente al agrupado del detalle.</p>
            </div>
          </div>

          <div className="coedetail-resumen-list">
            {!resumen.length ? (
              <div className="coedetail-empty small">Sin resumen.</div>
            ) : (
              resumen.slice(0, 12).map((item, index) => (
                <div key={`res-${index}-${item.responsableEstado}-${item.estado}`}>
                  <span>{cleanText(item.responsableEstado)}</span>
                  <em>{cleanText(item.estado)}</em>
                  <strong>{numberText(item.cantidad)}</strong>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="coedetail-card coedetail-table-card">
        <div className="coedetail-table-head">
          <div>
            <h2>Detalle de seguimiento</h2>
            <p>
              Mostrando <b>{rows.length}</b> de <b>{numberText(total)}</b> registros • Página <b>{page}</b> de <b>{totalPages}</b>
            </p>
          </div>

          <div className="coedetail-page-size">
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}/página</option>
              ))}
            </select>
          </div>
        </div>

        <div className="coedetail-table-wrap">
          <table className="coedetail-table">
            <thead>
              <tr>
                <th>Responsable</th>
                <th>Estado original</th>
                <th>Estado principal</th>
                <th>Subestado</th>
                <th>Consolidado</th>
                <th>ID</th>
                <th>Sociedad</th>
                <th>Cliente asociado</th>
                <th>Asunto</th>
                <th>Observaciones / seguimiento</th>
                <th>Módulo</th>
                <th>Tipo solicitud</th>
                <th>Asignado a</th>
                <th>Fecha asignación</th>
                <th>Fecha cierre</th>
                <th>Acción</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="16" className="coedetail-empty">
                    <div className="coedetail-loader" />
                    Cargando detalle...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="16" className="coedetail-empty">No hay registros para mostrar.</td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.id || row.numero}-${index}`}>
                    <td>{cleanText(row.responsableEstado)}</td>
                    <td>
                      <span className={`coedetail-pill ${statusClass(row.estado)}`}>{cleanText(row.estado)}</span>
                    </td>
                    <td>
                      <span className={`coedetail-pill ${statusClass(row.estadoPrincipal)}`}>{cleanText(row.estadoPrincipal)}</span>
                    </td>
                    <td>
                      <span className={`coedetail-pill ${statusClass(row.subestado)}`}>{cleanText(row.subestado)}</span>
                    </td>
                    <td>
                      <span className={`coedetail-pill ${statusClass(row.estadoConsolidado)}`}>{cleanText(row.estadoConsolidado)}</span>
                    </td>
                    <td className="mono strong">{cleanText(row.numero)}</td>
                    <td>{cleanText(row.sociedad)}</td>
                    <td>{cleanText(row.clienteAsociadoNombre)}</td>
                    <td className="coedetail-asunto" title={cleanText(row.asunto)}>{cleanText(row.asunto)}</td>
                    <td
                      className="coedetail-observaciones editable"
                      title="Doble clic para editar observaciones"
                      onDoubleClick={() => editObservaciones(row)}
                    >
                      {renderObservaciones(row.observaciones)}
                    </td>
                    <td className="center mono">{cleanText(row.modulo)}</td>
                    <td>{cleanText(row.tipoSolicitud)}</td>
                    <td>{cleanText(row.asignadoA)}</td>
                    <td className="mono">{cleanText(row.fechaAsignacion)}</td>
                    <td className="mono">{cleanText(row.fechaFinalizacionCierre)}</td>
                    <td className="center">
                      <button
                        type="button"
                        className="coedetail-mini-btn"
                        disabled={!canEdit}
                        onClick={() => editObservaciones(row)}
                      >
                        Observaciones
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="coedetail-pager">
          <button className="coedetail-btn icon" type="button" onClick={() => setPage(1)} disabled={!canPrev || loading}>⏮</button>
          <button className="coedetail-btn icon" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canPrev || loading}>◀</button>
          <span>Página <b>{page}</b> de <b>{totalPages}</b></span>
          <button className="coedetail-btn icon" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={!canNext || loading}>▶</button>
          <button className="coedetail-btn icon" type="button" onClick={() => setPage(totalPages)} disabled={!canNext || loading}>⏭</button>
        </div>
      </section>
    </div>
  );
}

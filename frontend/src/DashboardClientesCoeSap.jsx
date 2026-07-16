import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./DashboardClientesCoeSap.css";

const EMPTY_FILTERS = {
  q: "",
  sociedad: "",
  anio: "",
  mes: "",
  estadoConsolidado: "",
  modulo: "",
  tipoSolicitud: "",
  responsableEstado: "",
  controlHoras: "",
  asignadoA: "",
};

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

function numberText(value, decimals = 0) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";

  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function moneyText(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "$0";

  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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

function buildQuery(filters) {
  const qs = new URLSearchParams();

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
    <label className="coedash-filter">
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

function MetricCard({ title, value, sub, tone = "default" }) {
  return (
    <article className={`coedash-metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}

function BarList({ title, rows, labelKey, valueKey = "cantidad", emptyText = "Sin datos" }) {
  const max = useMemo(() => {
    const nums = (rows || []).map((r) => Number(r?.[valueKey] || 0));
    return Math.max(...nums, 0);
  }, [rows, valueKey]);

  return (
    <section className="coedash-panel">
      <div className="coedash-panel-head">
        <h2>{title}</h2>
      </div>

      <div className="coedash-bar-list">
        {!rows?.length ? (
          <div className="coedash-empty small">{emptyText}</div>
        ) : (
          rows.map((row, index) => {
            const value = Number(row?.[valueKey] || 0);
            const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;

            return (
              <div key={`${title}-${index}-${row?.[labelKey]}`} className="coedash-bar-row">
                <div className="coedash-bar-info">
                  <span>{cleanText(row?.[labelKey])}</span>
                  <strong>{numberText(value)}</strong>
                </div>
                <div className="coedash-bar-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function HorasModuloTable({ rows }) {
  return (
    <section className="coedash-panel coedash-wide-panel">
      <div className="coedash-panel-head">
        <h2>Horas por módulo</h2>
        <p>Estimadas vs ejecutadas según la calificación.</p>
      </div>

      <div className="coedash-table-wrap small">
        <table className="coedash-table">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Horas estimadas</th>
              <th>Horas ejecutadas</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan="4" className="coedash-empty small">Sin horas registradas.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const estimadas = Number(row.estimadas || 0);
                const ejecutadas = Number(row.ejecutadas || 0);

                return (
                  <tr key={`hora-${row.modulo}`}>
                    <td className="mono strong">{cleanText(row.modulo)}</td>
                    <td className="right">{numberText(estimadas, 2)}</td>
                    <td className="right">{numberText(ejecutadas, 2)}</td>
                    <td className="right">{numberText(estimadas - ejecutadas, 2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FacturacionTable({ rows }) {
  return (
    <section className="coedash-panel coedash-wide-panel">
      <div className="coedash-panel-head">
        <h2>OT / Facturación</h2>
        <p>Resumen por estado de facturación de la OT.</p>
      </div>

      <div className="coedash-table-wrap small">
        <table className="coedash-table">
          <thead>
            <tr>
              <th>Estado facturación OT</th>
              <th>Cantidad</th>
              <th>Valor OT</th>
              <th>Horas oferta</th>
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan="4" className="coedash-empty small">Sin datos de facturación.</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`ot-${index}-${row.estadoFacturacionOt}`}>
                  <td>{cleanText(row.estadoFacturacionOt)}</td>
                  <td className="right">{numberText(row.cantidad)}</td>
                  <td className="right">{moneyText(row.valor)}</td>
                  <td className="right">{numberText(row.horas, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DashboardClientesCoeSap() {
  const user = useMemo(() => readStoredUser(), []);
  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const resumen = payload?.resumen || {};
  const opciones = payload?.opciones || {};

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchDashboard = useCallback(async () => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/dashboard-clientes${qs ? `?${qs}` : ""}`;

      const res = await jfetch(url, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setPayload(data);
    } catch (error) {
      console.error("Error dashboard clientes COE SAP:", error);
      setPayload(null);

      Swal.fire({
        icon: "error",
        title: "No se pudo consultar el dashboard",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, appliedFilters]);



  const descargarExcel = useCallback(async () => {
    setDownloadingExcel(true);

    try {
      const qs = buildQuery(appliedFilters);
      const url = `/coe-sap-funcional/calificacion/dashboard-clientes/export-excel${qs ? `?${qs}` : ""}`;

      await downloadExcelFile(
        url,
        commonHeaders,
        "dashboard_clientes_coe_sap_funcional.xlsx"
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
    fetchDashboard();
  }, [fetchDashboard]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  if (!canView) {
    return (
      <div className="coedash-page">
        <div className="coedash-access-card">
          <div className="coedash-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coedash-page">
      <section className="coedash-hero">
        <div>
          <span className="coedash-eyebrow">Dashboard clientes</span>
          <h1>Dashboard COE SAP Funcional</h1>
          <p>
            Resumen tipo tabla dinámica por cliente, estado, módulo, estimaciones,
            horas y facturación.
          </p>
        </div>

        <div className="coedash-hero-actions">
          <button type="button" className="coedash-btn light" onClick={fetchDashboard} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <button type="button" className="coedash-btn danger" onClick={descargarExcel} disabled={loading || downloadingExcel}>
            {downloadingExcel ? "Descargando..." : "Descargar Excel"}
          </button>
        </div>
      </section>

      <section className="coedash-card coedash-filters-card">
        <div className="coedash-card-head">
          <div>
            <h2>Filtros</h2>
            <p>Filtra por sociedad, año, mes, estado, módulo o texto general.</p>
          </div>

          <button type="button" className="coedash-btn ghost" onClick={clearFilters} disabled={loading}>
            Limpiar
          </button>
        </div>

        <div className="coedash-filters-grid">
          <label className="coedash-filter search">
            <span>Búsqueda general</span>
            <input
              type="text"
              value={filters.q}
              placeholder="ID, asunto, sociedad, observación..."
              onChange={(e) => updateFilter("q", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>

          <SimpleSelect label="Sociedad" value={filters.sociedad} options={opciones.sociedad} onChange={(v) => updateFilter("sociedad", v)} />
          <SimpleSelect label="Año" value={filters.anio} options={opciones.anio} onChange={(v) => updateFilter("anio", v)} />
          <SimpleSelect label="Mes" value={filters.mes} options={opciones.mes} onChange={(v) => updateFilter("mes", v)} />
          <SimpleSelect label="Estado consolidado" value={filters.estadoConsolidado} options={opciones.estadoConsolidado} onChange={(v) => updateFilter("estadoConsolidado", v)} />
          <SimpleSelect label="Módulo" value={filters.modulo} options={opciones.modulo} onChange={(v) => updateFilter("modulo", v)} />
          <SimpleSelect label="Tipo solicitud" value={filters.tipoSolicitud} options={opciones.tipoSolicitud} onChange={(v) => updateFilter("tipoSolicitud", v)} />
          <SimpleSelect label="Responsable estado" value={filters.responsableEstado} options={opciones.responsableEstado} onChange={(v) => updateFilter("responsableEstado", v)} />
          <SimpleSelect label="Control horas" value={filters.controlHoras} options={opciones.controlHoras} onChange={(v) => updateFilter("controlHoras", v)} />
          <SimpleSelect label="Asignado a" value={filters.asignadoA} options={opciones.asignadoA} onChange={(v) => updateFilter("asignadoA", v)} />
        </div>

        <div className="coedash-actions">
          <button type="button" className="coedash-btn danger" onClick={applyFilters} disabled={loading}>
            {loading ? "Consultando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="coedash-btn light" onClick={clearFilters} disabled={loading}>
            Restablecer
          </button>
        </div>
      </section>

      {loading && !payload ? (
        <section className="coedash-card coedash-loading-card">
          <div className="coedash-loader" />
          Cargando dashboard...
        </section>
      ) : (
        <>
          <section className="coedash-metrics-grid">
            <MetricCard title="Total casos" value={numberText(resumen.totalCasos)} sub="Casos filtrados" tone="dark" />
            <MetricCard title="Abiertos" value={numberText(resumen.abiertos)} sub="Sin cerrar / abiertos" tone="warn" />
            <MetricCard title="Cerrados" value={numberText(resumen.cerrados)} sub="Cerrados o solucionados" tone="ok" />
            <MetricCard title="Cruce SM" value={numberText(resumen.conSm)} sub="Casos cruzados SM" tone="info" />
            <MetricCard title="Cruce ITOP" value={numberText(resumen.conItop)} sub="Casos cruzados ITOP" tone="info" />
            <MetricCard title="Solo Excel" value={numberText(resumen.soloExcel)} sub="Sin cruce completo" tone="neutral" />
            <MetricCard title="H. funcionales" value={numberText(resumen.totalHorasFuncionales, 2)} sub="Total funcional" tone="ok" />
            <MetricCard title="H. estimadas" value={numberText(resumen.totalHorasEstimadas, 2)} sub="Total estimado" tone="dark" />
            <MetricCard title="Valor OT" value={moneyText(resumen.valorOt)} sub="Suma valor OT" tone="money" />
          </section>

          <section className="coedash-grid-panels">
            <BarList title="Casos por estado" rows={payload?.casosPorEstado || []} labelKey="estado" />
            <BarList title="Estado consolidado" rows={payload?.casosPorEstadoConsolidado || []} labelKey="estadoConsolidado" />
            <BarList title="Casos por módulo" rows={payload?.casosPorModulo || []} labelKey="modulo" />
            <BarList title="Tipo de solicitud" rows={payload?.casosPorTipoSolicitud || []} labelKey="tipoSolicitud" />
            <BarList title="Responsable estado" rows={payload?.casosPorResponsable || []} labelKey="responsableEstado" />
            <BarList title="Estado estimación" rows={payload?.estimacionesPorEstado || []} labelKey="estadoEstimacion" />
          </section>

          <section className="coedash-grid-panels two">
            <BarList title="Cerrados por mes" rows={payload?.cerradosPorMes || []} labelKey="periodo" />
            <HorasModuloTable rows={payload?.horasPorModulo || []} />
            <FacturacionTable rows={payload?.otFacturacion || []} />
          </section>
        </>
      )}
    </div>
  );
}

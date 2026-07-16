import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./CargarBasesAuxiliaresCoeSap.css";


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
  return n.toLocaleString("es-CO");
}

const UPLOAD_ACTIONS = [
  {
    key: "catalogos",
    title: "Catálogos / Listas",
    subtitle: "Carga LISTAS y hojas por módulo del Excel maestro.",
    icon: "📚",
    endpoint: "/coe-sap-funcional/calificacion/catalogos/import-excel",
    fileLabel: "Seleccionar Excel de listas",
    accept: ".xlsx,.xls,.xlsm",
  },
  {
    key: "sm",
    title: "Base Datos SM",
    subtitle: "Carga los casos SD para cruzarlos contra la calificación.",
    icon: "🟢",
    endpoint: "/coe-sap-funcional/calificacion/fuentes/import-sm",
    fileLabel: "Seleccionar Excel SM",
    accept: ".xlsx,.xls,.xlsm,.csv",
  },
  {
    key: "itop",
    title: "Base Datos ITOP",
    subtitle: "Carga los casos R- u otros casos de ITOP.",
    icon: "🔵",
    endpoint: "/coe-sap-funcional/calificacion/fuentes/import-itop",
    fileLabel: "Seleccionar Excel ITOP",
    accept: ".xlsx,.xls,.xlsm,.csv",
  },
];

export default function CargarBasesAuxiliaresCoeSap() {
  const refs = {
    catalogos: useRef(null),
    sm: useRef(null),
    itop: useRef(null),
  };

  const user = useMemo(() => readStoredUser(), []);
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const isAdmin = rol === "ADMIN";
  const canImport = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

  const commonHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [loadingKey, setLoadingKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState("preservar_manual");
  const [lastResults, setLastResults] = useState([]);
  const [importaciones, setImportaciones] = useState([]);
  const [loadingImportaciones, setLoadingImportaciones] = useState(false);
  const [downloadingImportaciones, setDownloadingImportaciones] = useState(false);

  const pushResult = (type, title, payload, ok = true) => {
    setLastResults((prev) => [
      {
        id: `${Date.now()}-${type}`,
        type,
        title,
        ok,
        payload,
        at: new Date().toLocaleString("es-CO"),
      },
      ...prev,
    ].slice(0, 8));
  };



  const fetchImportaciones = useCallback(async () => {
    setLoadingImportaciones(true);

    try {
      const res = await jfetch("/coe-sap-funcional/calificacion/importaciones?page=1&page_size=20", {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      setImportaciones(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      console.error("Error consultando importaciones COE SAP:", error);
      setImportaciones([]);
    } finally {
      setLoadingImportaciones(false);
    }
  }, [commonHeaders]);

  useEffect(() => {
    fetchImportaciones();
  }, [fetchImportaciones]);

  const descargarImportacionesExcel = async () => {
    setDownloadingImportaciones(true);

    try {
      await downloadExcelFile(
        "/coe-sap-funcional/calificacion/importaciones/export-excel",
        commonHeaders,
        "importaciones_coe_sap_funcional.xlsx"
      );
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo descargar el Excel",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setDownloadingImportaciones(false);
    }
  };

  const triggerFile = (key) => {
    if (!canImport) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "No tienes permiso para cargar bases auxiliares.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    refs[key]?.current?.click();
  };

  const uploadFile = async (action, file) => {
    if (!file) return;

    const confirm = await Swal.fire({
      icon: "question",
      title: action.title,
      text: `Se cargará el archivo: ${file.name}`,
      showCancelButton: true,
      confirmButtonText: "Sí, cargar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) {
      if (refs[action.key]?.current) refs[action.key].current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoadingKey(action.key);

    try {
      const res = await jfetch(action.endpoint, {
        method: "POST",
        headers: commonHeaders,
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      pushResult(action.key, action.title, data, true);
      fetchImportaciones();

      await Swal.fire({
        icon: "success",
        title: "Carga finalizada",
        html: renderSummaryHtml(data),
        confirmButtonColor: "#008C67",
      });
    } catch (error) {
      pushResult(action.key, action.title, { error: error?.message }, false);

      Swal.fire({
        icon: "error",
        title: "No se pudo cargar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoadingKey("");
      if (refs[action.key]?.current) refs[action.key].current.value = "";
    }
  };

  const syncCalificacion = async () => {
    if (!canImport) return;

    const confirm = await Swal.fire({
      icon: "question",
      title: "Sincronizar calificación",
      html: `
        <div style="text-align:left;line-height:1.5">
          <p>Se cruzará la calificación con la base principal, SM e ITOP.</p>
          <p><b>Modo seleccionado:</b> ${syncMode}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, sincronizar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) return;

    setSyncing(true);

    try {
      const res = await jfetch("/coe-sap-funcional/calificacion/sincronizar", {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: syncMode,
          crear_desde_base: true,
          crear_desde_fuentes: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      pushResult("sync", "Sincronización", data, true);
      fetchImportaciones();

      await Swal.fire({
        icon: "success",
        title: "Sincronización finalizada",
        html: renderSummaryHtml(data),
        confirmButtonColor: "#008C67",
      });
    } catch (error) {
      pushResult("sync", "Sincronización", { error: error?.message }, false);

      Swal.fire({
        icon: "error",
        title: "No se pudo sincronizar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!canImport) {
    return (
      <div className="coeload-page">
        <div className="coeload-access-card">
          <div className="coeload-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_IMPORTAR para cargar bases auxiliares.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coeload-page">
      <section className="coeload-hero">
        <div>
          <span className="coeload-eyebrow">COE SAP Funcional</span>
          <h1>Cargar bases auxiliares</h1>
          <p>
            Importa catálogos, Base Datos SM, Base Datos ITOP y ejecuta la sincronización
            para completar automáticamente la calificación sin perder campos manuales.
          </p>
        </div>
      </section>

      <section className="coeload-flow-card">
        <h2>Flujo recomendado</h2>
        <div className="coeload-steps">
          <div><b>1</b><span>Catálogos / Listas</span></div>
          <div><b>2</b><span>Base principal COE</span></div>
          <div><b>3</b><span>Base Datos SM</span></div>
          <div><b>4</b><span>Base Datos ITOP</span></div>
          <div><b>5</b><span>Sincronizar</span></div>
        </div>
      </section>

      <section className="coeload-grid">
        {UPLOAD_ACTIONS.map((action) => (
          <article key={action.key} className="coeload-card">
            <div className="coeload-card-icon">{action.icon}</div>
            <h2>{action.title}</h2>
            <p>{action.subtitle}</p>

            <input
              ref={refs[action.key]}
              type="file"
              accept={action.accept}
              className="coeload-hidden"
              onChange={(e) => uploadFile(action, e.target.files?.[0])}
            />

            <button
              type="button"
              className="coeload-btn danger"
              onClick={() => triggerFile(action.key)}
              disabled={Boolean(loadingKey) || syncing}
            >
              {loadingKey === action.key ? "Cargando..." : action.fileLabel}
            </button>
          </article>
        ))}

        <article className="coeload-card sync">
          <div className="coeload-card-icon">🔄</div>
          <h2>Sincronizar calificación</h2>
          <p>
            Cruza base principal, SM e ITOP. Crea casos faltantes y completa información automática.
          </p>

          <label className="coeload-field">
            <span>Modo de sincronización</span>
            <select value={syncMode} onChange={(e) => setSyncMode(e.target.value)}>
              <option value="preservar_manual">Preservar campos manuales</option>
              <option value="solo_vacios">Solo completar campos vacíos</option>
              <option value="forzar">Forzar actualización desde bases</option>
            </select>
          </label>

          <button
            type="button"
            className="coeload-btn dark"
            onClick={syncCalificacion}
            disabled={Boolean(loadingKey) || syncing}
          >
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
        </article>
      </section>



      <section className="coeload-results-card">
        <div className="coeload-results-head">
          <div>
            <h2>Histórico de importaciones</h2>
            <p>Últimas cargas registradas en base de datos.</p>
          </div>

          <div className="coeload-history-actions">
            <button type="button" className="coeload-btn light" onClick={fetchImportaciones} disabled={loadingImportaciones}>
              {loadingImportaciones ? "Actualizando..." : "Actualizar"}
            </button>
            <button type="button" className="coeload-btn danger" onClick={descargarImportacionesExcel} disabled={downloadingImportaciones}>
              {downloadingImportaciones ? "Descargando..." : "Descargar Excel"}
            </button>
          </div>
        </div>

        <div className="coeload-history-table-wrap">
          <table className="coeload-history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Archivo</th>
                <th>Filas</th>
                <th>Insertados</th>
                <th>Actualizados</th>
                <th>Errores</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {loadingImportaciones ? (
                <tr>
                  <td colSpan="8" className="coeload-empty">Consultando histórico...</td>
                </tr>
              ) : importaciones.length === 0 ? (
                <tr>
                  <td colSpan="8" className="coeload-empty">Todavía no hay importaciones registradas.</td>
                </tr>
              ) : (
                importaciones.map((row) => (
                  <tr key={row.id}>
                    <td>{cleanText(row.createdAt)}</td>
                    <td><span className="coeload-mini-pill">{cleanText(row.tipo)}</span></td>
                    <td>{cleanText(row.archivoNombre)}</td>
                    <td>{numberText(row.filas)}</td>
                    <td>{numberText(row.insertados)}</td>
                    <td>{numberText(row.actualizados)}</td>
                    <td>{numberText(row.errores)}</td>
                    <td>{cleanText(row.usuario)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="coeload-results-card">
        <div className="coeload-results-head">
          <div>
            <h2>Últimos resultados</h2>
            <p>Resumen local de las cargas ejecutadas en esta sesión.</p>
          </div>

          <button type="button" className="coeload-btn ghost" onClick={() => setLastResults([])}>
            Limpiar
          </button>
        </div>

        {lastResults.length === 0 ? (
          <div className="coeload-empty">Todavía no se han ejecutado cargas en esta sesión.</div>
        ) : (
          <div className="coeload-results-list">
            {lastResults.map((item) => (
              <article key={item.id} className={`coeload-result ${item.ok ? "ok" : "error"}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.at}</span>
                </div>

                <pre>{JSON.stringify(item.payload, null, 2)}</pre>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function renderSummaryHtml(data) {
  const pairs = Object.entries(data || {}).filter(([, value]) => {
    return ["string", "number", "boolean"].includes(typeof value) || value === null;
  });

  if (!pairs.length) {
    return "<p>Proceso finalizado correctamente.</p>";
  }

  return `
    <div style="text-align:left">
      ${pairs.map(([key, value]) => `<p><b>${key}:</b> ${cleanText(value)}</p>`).join("")}
    </div>
  `;
}

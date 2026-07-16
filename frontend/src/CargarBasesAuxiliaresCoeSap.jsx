import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  const res = await jfetch(url, { method: "GET", headers });

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

function text(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function numberText(value) {
  return Number(value || 0).toLocaleString("es-CO");
}

const EMPTY_ESTADO = {
  id: null,
  nombre: "",
  descripcion: "",
  orden: 0,
  activo: true,
};

const EMPTY_SUBESTADO = {
  id: null,
  estadoId: "",
  nombre: "",
  descripcion: "",
  orden: 0,
  activo: true,
};

export default function CargarBasesAuxiliaresCoeSap() {
  const user = useMemo(() => readStoredUser(), []);
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const isAdmin = rol === "ADMIN";
  const canImport = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");
  const canView = canImport || permisos.includes("BASE_REGISTRO_VER");

  const commonHeaders = useMemo(() => {
    return {
      "Content-Type": "application/json",
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const downloadHeaders = useMemo(() => {
    return {
      "X-User-Rol": rol,
      "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
    };
  }, [rol, user]);

  const [activeTab, setActiveTab] = useState("estados");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState("preservar_manual");

  const [estados, setEstados] = useState([]);
  const [subestados, setSubestados] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clientePendientes, setClientePendientes] = useState(0);
  const [importaciones, setImportaciones] = useState([]);

  const [estadoForm, setEstadoForm] = useState(EMPTY_ESTADO);
  const [subestadoForm, setSubestadoForm] = useState(EMPTY_SUBESTADO);
  const [clienteManual, setClienteManual] = useState({ sociedad: "", clienteId: "" });
  const [lastResults, setLastResults] = useState([]);

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

  const requestJson = useCallback(
    async (url, options = {}) => {
      const res = await jfetch(url, {
        ...options,
        headers: {
          ...commonHeaders,
          ...(options.headers || {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.mensaje || `HTTP ${res.status}`);
      }

      return data;
    },
    [commonHeaders]
  );

  const fetchEstados = useCallback(async () => {
    const data = await requestJson("/coe-sap-funcional/config/estados?include_inactive=1", {
      method: "GET",
    });
    setEstados(Array.isArray(data?.data) ? data.data : []);
  }, [requestJson]);

  const fetchSubestados = useCallback(async () => {
    const data = await requestJson("/coe-sap-funcional/config/subestados?include_inactive=1", {
      method: "GET",
    });
    setSubestados(Array.isArray(data?.data) ? data.data : []);
  }, [requestJson]);

  const fetchClientes = useCallback(async () => {
    const data = await requestJson("/coe-sap-funcional/config/clientes", { method: "GET" });
    setClientes(Array.isArray(data?.data) ? data.data : []);
    setClientePendientes(Number(data?.pendientes || 0));
  }, [requestJson]);

  const fetchImportaciones = useCallback(async () => {
    const data = await requestJson("/coe-sap-funcional/calificacion/importaciones?page=1&page_size=20", {
      method: "GET",
    });
    setImportaciones(Array.isArray(data?.data) ? data.data : []);
  }, [requestJson]);

  const fetchAll = useCallback(async () => {
    if (!canView) return;

    setLoading(true);
    try {
      await Promise.all([
        fetchEstados(),
        fetchSubestados(),
        fetchClientes(),
        fetchImportaciones(),
      ]);
    } catch (error) {
      console.error("Error cargando configuración COE SAP:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo cargar la configuración",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, fetchEstados, fetchSubestados, fetchClientes, fetchImportaciones]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const requireImport = () => {
    if (canImport) return true;
    Swal.fire({
      icon: "warning",
      title: "Sin permiso",
      text: "No tienes permiso para modificar la configuración.",
      confirmButtonColor: "#DA291C",
    });
    return false;
  };

  const saveEstado = async () => {
    if (!requireImport()) return;
    if (!String(estadoForm.nombre || "").trim()) {
      Swal.fire({ icon: "warning", title: "Nombre requerido", confirmButtonColor: "#DA291C" });
      return;
    }

    try {
      const isEdit = Boolean(estadoForm.id);
      const data = await requestJson(
        isEdit
          ? `/coe-sap-funcional/config/estados/${estadoForm.id}`
          : "/coe-sap-funcional/config/estados",
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(estadoForm),
        }
      );

      pushResult("estado", isEdit ? "Estado actualizado" : "Estado creado", data, true);
      setEstadoForm(EMPTY_ESTADO);
      await fetchEstados();
      await fetchSubestados();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error guardando estado", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const saveSubestado = async () => {
    if (!requireImport()) return;
    if (!subestadoForm.estadoId) {
      Swal.fire({ icon: "warning", title: "Selecciona el estado principal", confirmButtonColor: "#DA291C" });
      return;
    }
    if (!String(subestadoForm.nombre || "").trim()) {
      Swal.fire({ icon: "warning", title: "Nombre requerido", confirmButtonColor: "#DA291C" });
      return;
    }

    try {
      const isEdit = Boolean(subestadoForm.id);
      const data = await requestJson(
        isEdit
          ? `/coe-sap-funcional/config/subestados/${subestadoForm.id}`
          : "/coe-sap-funcional/config/subestados",
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(subestadoForm),
        }
      );

      pushResult("subestado", isEdit ? "Subestado actualizado" : "Subestado creado", data, true);
      setSubestadoForm(EMPTY_SUBESTADO);
      await fetchSubestados();
      await fetchEstados();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error guardando subestado", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const deleteEstado = async (row) => {
    if (!requireImport()) return;

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Inactivar estado",
      text: `Se inactivará el estado ${row.valor} y sus subestados.`,
      showCancelButton: true,
      confirmButtonText: "Sí, inactivar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) return;

    try {
      const data = await requestJson(`/coe-sap-funcional/config/estados/${row.id}`, { method: "DELETE" });
      pushResult("estado", "Estado inactivado", data, true);
      await fetchEstados();
      await fetchSubestados();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error inactivando estado", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const deleteSubestado = async (row) => {
    if (!requireImport()) return;

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Inactivar subestado",
      text: `Se inactivará el subestado ${row.valor}.`,
      showCancelButton: true,
      confirmButtonText: "Sí, inactivar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) return;

    try {
      const data = await requestJson(`/coe-sap-funcional/config/subestados/${row.id}`, { method: "DELETE" });
      pushResult("subestado", "Subestado inactivado", data, true);
      await fetchSubestados();
      await fetchEstados();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error inactivando subestado", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const asociarClientesAuto = async () => {
    if (!requireImport()) return;

    try {
      const data = await requestJson("/coe-sap-funcional/config/asociar-clientes", {
        method: "POST",
        body: JSON.stringify({ modo: "auto" }),
      });
      pushResult("clientes", "Asociación automática de clientes", data, true);
      await fetchClientes();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error asociando clientes", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const asociarClienteManual = async () => {
    if (!requireImport()) return;
    if (!clienteManual.sociedad || !clienteManual.clienteId) {
      Swal.fire({
        icon: "warning",
        title: "Datos incompletos",
        text: "Debes escribir la sociedad y seleccionar el cliente.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    try {
      const data = await requestJson("/coe-sap-funcional/config/asociar-clientes", {
        method: "POST",
        body: JSON.stringify({ ...clienteManual, modo: "manual" }),
      });
      pushResult("clientes", "Asociación manual de cliente", data, true);
      setClienteManual({ sociedad: "", clienteId: "" });
      await fetchClientes();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error asociando cliente", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  const sincronizarCalificacion = async () => {
    if (!requireImport()) return;

    const confirm = await Swal.fire({
      icon: "question",
      title: "Sincronizar calificación",
      html: "Se sincronizará desde la base principal y luego se aplicarán clientes, estados y subestados controlados.<br><b>No se usarán cargues SM ni ITOP.</b>",
      showCancelButton: true,
      confirmButtonText: "Sí, sincronizar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#DA291C",
    });

    if (!confirm.isConfirmed) return;

    setSyncing(true);

    try {
      const syncBase = await requestJson("/coe-sap-funcional/calificacion/sincronizar", {
        method: "POST",
        body: JSON.stringify({
          modo: syncMode,
          crear_desde_base: true,
          crear_desde_fuentes: false,
        }),
      });

      const syncCatalogos = await requestJson("/coe-sap-funcional/config/sincronizar-catalogos", {
        method: "POST",
        body: JSON.stringify({}),
      });

      pushResult("sync", "Sincronización finalizada", { syncBase, syncCatalogos }, true);
      await fetchClientes();

      Swal.fire({
        icon: "success",
        title: "Sincronización realizada",
        html: `
          <div style="text-align:left">
            <p><b>Creados:</b> ${syncBase?.creados ?? "—"}</p>
            <p><b>Actualizados:</b> ${syncBase?.actualizados ?? "—"}</p>
            <p><b>Clientes OK:</b> ${syncCatalogos?.clientesOk ?? "—"}</p>
            <p><b>Clientes por validar:</b> ${syncCatalogos?.clientesValidar ?? "—"}</p>
            <p><b>Estados OK:</b> ${syncCatalogos?.estadosOk ?? "—"}</p>
            <p><b>Estados por validar:</b> ${syncCatalogos?.estadosValidar ?? "—"}</p>
          </div>
        `,
        confirmButtonColor: "#008C67",
      });
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error sincronizando", text: error.message, confirmButtonColor: "#DA291C" });
    } finally {
      setSyncing(false);
    }
  };

  const descargarImportacionesExcel = async () => {
    try {
      await downloadExcelFile(
        "/coe-sap-funcional/calificacion/importaciones/export-excel",
        downloadHeaders,
        "importaciones_coe_sap_funcional.xlsx"
      );
    } catch (error) {
      Swal.fire({ icon: "error", title: "No se pudo descargar el Excel", text: error.message, confirmButtonColor: "#DA291C" });
    }
  };

  if (!canView) {
    return (
      <div className="coeload-page">
        <div className="coeload-access-card">
          <div className="coeload-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas permiso BASE_REGISTRO_VER para consultar esta configuración.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coeload-page">
      <section className="coeload-hero">
        <span className="coeload-eyebrow">Configuración controlada</span>
        <h1>Configuración COE SAP Funcional</h1>
        <p>
          Administra estados principales, subestados y asociación de clientes directamente
          desde el aplicativo. Se eliminan los cargues auxiliares de Base Datos SM e ITOP.
        </p>
      </section>

      <section className="coeload-tabs">
        {[
          ["estados", "Estados y subestados"],
          ["clientes", "Clientes"],
          ["sync", "Sincronización"],
          ["historial", "Histórico"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "active" : ""}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </section>

      {loading ? (
        <section className="coeload-card-panel">
          <div className="coeload-loader" />
          <p>Cargando configuración...</p>
        </section>
      ) : null}

      {activeTab === "estados" && (
        <section className="coeload-two-col">
          <article className="coeload-card-panel">
            <div className="coeload-panel-head">
              <div>
                <h2>{estadoForm.id ? "Editar estado principal" : "Crear estado principal"}</h2>
                <p>Ejemplo: EN CURSO, CERRADO, SUSPENDIDO.</p>
              </div>
              {estadoForm.id && (
                <button className="coeload-btn ghost" type="button" onClick={() => setEstadoForm(EMPTY_ESTADO)}>
                  Nuevo
                </button>
              )}
            </div>

            <div className="coeload-form-grid">
              <label className="coeload-field wide">
                <span>Nombre del estado</span>
                <input
                  value={estadoForm.nombre}
                  placeholder="EN CURSO"
                  onChange={(e) => setEstadoForm((p) => ({ ...p, nombre: e.target.value }))}
                />
              </label>

              <label className="coeload-field wide">
                <span>Descripción</span>
                <input
                  value={estadoForm.descripcion || ""}
                  placeholder="Casos activos o en gestión"
                  onChange={(e) => setEstadoForm((p) => ({ ...p, descripcion: e.target.value }))}
                />
              </label>

              <label className="coeload-field">
                <span>Orden</span>
                <input
                  type="number"
                  value={estadoForm.orden}
                  onChange={(e) => setEstadoForm((p) => ({ ...p, orden: e.target.value }))}
                />
              </label>

              <label className="coeload-check">
                <input
                  type="checkbox"
                  checked={Boolean(estadoForm.activo)}
                  onChange={(e) => setEstadoForm((p) => ({ ...p, activo: e.target.checked }))}
                />
                <span>Activo</span>
              </label>
            </div>

            <button className="coeload-btn danger" type="button" onClick={saveEstado} disabled={!canImport}>
              {estadoForm.id ? "Guardar estado" : "Crear estado"}
            </button>
          </article>

          <article className="coeload-card-panel">
            <div className="coeload-panel-head">
              <div>
                <h2>{subestadoForm.id ? "Editar subestado" : "Crear subestado"}</h2>
                <p>Ejemplo: EN PROCESO, EN ESTIMACIÓN, EN ESPERA DE USUARIO.</p>
              </div>
              {subestadoForm.id && (
                <button className="coeload-btn ghost" type="button" onClick={() => setSubestadoForm(EMPTY_SUBESTADO)}>
                  Nuevo
                </button>
              )}
            </div>

            <div className="coeload-form-grid">
              <label className="coeload-field wide">
                <span>Estado principal</span>
                <select
                  value={subestadoForm.estadoId}
                  onChange={(e) => setSubestadoForm((p) => ({ ...p, estadoId: e.target.value }))}
                >
                  <option value="">Selecciona...</option>
                  {estados.filter((x) => x.activo).map((estado) => (
                    <option key={estado.id} value={estado.id}>{estado.valor}</option>
                  ))}
                </select>
              </label>

              <label className="coeload-field wide">
                <span>Nombre del subestado</span>
                <input
                  value={subestadoForm.nombre}
                  placeholder="EN PROCESO"
                  onChange={(e) => setSubestadoForm((p) => ({ ...p, nombre: e.target.value }))}
                />
              </label>

              <label className="coeload-field wide">
                <span>Descripción</span>
                <input
                  value={subestadoForm.descripcion || ""}
                  placeholder="Caso activo en ejecución"
                  onChange={(e) => setSubestadoForm((p) => ({ ...p, descripcion: e.target.value }))}
                />
              </label>

              <label className="coeload-field">
                <span>Orden</span>
                <input
                  type="number"
                  value={subestadoForm.orden}
                  onChange={(e) => setSubestadoForm((p) => ({ ...p, orden: e.target.value }))}
                />
              </label>

              <label className="coeload-check">
                <input
                  type="checkbox"
                  checked={Boolean(subestadoForm.activo)}
                  onChange={(e) => setSubestadoForm((p) => ({ ...p, activo: e.target.checked }))}
                />
                <span>Activo</span>
              </label>
            </div>

            <button className="coeload-btn danger" type="button" onClick={saveSubestado} disabled={!canImport}>
              {subestadoForm.id ? "Guardar subestado" : "Crear subestado"}
            </button>
          </article>

          <article className="coeload-card-panel wide-panel">
            <div className="coeload-panel-head">
              <div>
                <h2>Estados principales</h2>
                <p>{numberText(estados.length)} registros configurados.</p>
              </div>
            </div>

            <div className="coeload-table-wrap">
              <table className="coeload-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Descripción</th>
                    <th>Subestados</th>
                    <th>Activo</th>
                    <th>Orden</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estados.length === 0 ? (
                    <tr><td colSpan="6" className="coeload-empty">No hay estados configurados.</td></tr>
                  ) : estados.map((row) => (
                    <tr key={row.id}>
                      <td><b>{text(row.valor)}</b></td>
                      <td>{text(row.descripcion)}</td>
                      <td>{numberText(row.totalSubestados)}</td>
                      <td><span className={`coeload-pill ${row.activo ? "ok" : "danger"}`}>{row.activo ? "Activo" : "Inactivo"}</span></td>
                      <td>{numberText(row.orden)}</td>
                      <td className="coeload-actions-cell">
                        <button className="coeload-btn small" type="button" onClick={() => setEstadoForm({ id: row.id, nombre: row.valor, descripcion: row.descripcion || "", orden: row.orden || 0, activo: row.activo })}>Editar</button>
                        <button className="coeload-btn small ghost" type="button" onClick={() => deleteEstado(row)} disabled={!row.activo}>Inactivar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="coeload-card-panel wide-panel">
            <div className="coeload-panel-head">
              <div>
                <h2>Subestados</h2>
                <p>{numberText(subestados.length)} registros configurados.</p>
              </div>
            </div>

            <div className="coeload-table-wrap">
              <table className="coeload-table">
                <thead>
                  <tr>
                    <th>Subestado</th>
                    <th>Estado principal</th>
                    <th>Descripción</th>
                    <th>Activo</th>
                    <th>Orden</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {subestados.length === 0 ? (
                    <tr><td colSpan="6" className="coeload-empty">No hay subestados configurados.</td></tr>
                  ) : subestados.map((row) => (
                    <tr key={row.id}>
                      <td><b>{text(row.valor)}</b></td>
                      <td>{text(row.estadoNombre)}</td>
                      <td>{text(row.descripcion)}</td>
                      <td><span className={`coeload-pill ${row.activo ? "ok" : "danger"}`}>{row.activo ? "Activo" : "Inactivo"}</span></td>
                      <td>{numberText(row.orden)}</td>
                      <td className="coeload-actions-cell">
                        <button className="coeload-btn small" type="button" onClick={() => setSubestadoForm({ id: row.id, estadoId: row.estadoId || "", nombre: row.valor, descripcion: row.descripcion || "", orden: row.orden || 0, activo: row.activo })}>Editar</button>
                        <button className="coeload-btn small ghost" type="button" onClick={() => deleteSubestado(row)} disabled={!row.activo}>Inactivar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === "clientes" && (
        <section className="coeload-two-col">
          <article className="coeload-card-panel">
            <h2>Asociación automática</h2>
            <p className="coeload-muted">
              Se comparan las sociedades de la calificación contra la tabla Clientes.
              Pendientes por validar: <b>{numberText(clientePendientes)}</b>
            </p>
            <button className="coeload-btn danger" type="button" onClick={asociarClientesAuto} disabled={!canImport}>
              Asociar clientes automáticamente
            </button>
          </article>

          <article className="coeload-card-panel">
            <h2>Asociación manual</h2>
            <p className="coeload-muted">Usa esta opción cuando el nombre de sociedad no coincide exactamente con el cliente.</p>
            <div className="coeload-form-grid">
              <label className="coeload-field wide">
                <span>Sociedad en calificación</span>
                <input
                  value={clienteManual.sociedad}
                  placeholder="Nombre como viene en la base"
                  onChange={(e) => setClienteManual((p) => ({ ...p, sociedad: e.target.value }))}
                />
              </label>

              <label className="coeload-field wide">
                <span>Cliente destino</span>
                <select
                  value={clienteManual.clienteId}
                  onChange={(e) => setClienteManual((p) => ({ ...p, clienteId: e.target.value }))}
                >
                  <option value="">Selecciona...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombreCliente}</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="coeload-btn danger" type="button" onClick={asociarClienteManual} disabled={!canImport}>
              Asociar manualmente
            </button>
          </article>

          <article className="coeload-card-panel wide-panel">
            <div className="coeload-panel-head">
              <div>
                <h2>Clientes registrados</h2>
                <p>La lista viene de la tabla Clientes del aplicativo.</p>
              </div>
            </div>

            <div className="coeload-table-wrap">
              <table className="coeload-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Casos asociados</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.length === 0 ? (
                    <tr><td colSpan="2" className="coeload-empty">No hay clientes registrados.</td></tr>
                  ) : clientes.map((row) => (
                    <tr key={row.id}>
                      <td><b>{text(row.nombreCliente)}</b></td>
                      <td>{numberText(row.totalCasosAsociados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === "sync" && (
        <section className="coeload-two-col">
          <article className="coeload-card-panel">
            <h2>Sincronizar calificación</h2>
            <p className="coeload-muted">
              Crea o actualiza casos desde la base principal, preservando campos manuales según el modo seleccionado.
              Las fuentes SM e ITOP ya no se cargan desde esta vista.
            </p>

            <label className="coeload-field wide">
              <span>Modo de sincronización</span>
              <select value={syncMode} onChange={(e) => setSyncMode(e.target.value)}>
                <option value="preservar_manual">Preservar campos manuales</option>
                <option value="solo_vacios">Completar solo vacíos</option>
                <option value="forzar">Forzar actualización automática</option>
              </select>
            </label>

            <button className="coeload-btn danger" type="button" onClick={sincronizarCalificacion} disabled={syncing || !canImport}>
              {syncing ? "Sincronizando..." : "Sincronizar calificación"}
            </button>
          </article>

          <article className="coeload-card-panel">
            <h2>Resultado reciente</h2>
            {lastResults.length === 0 ? (
              <p className="coeload-muted">Aún no hay acciones recientes.</p>
            ) : (
              <div className="coeload-results-list">
                {lastResults.map((result) => (
                  <div key={result.id} className={`coeload-result ${result.ok ? "ok" : "danger"}`}>
                    <b>{result.title}</b>
                    <span>{result.at}</span>
                    <pre>{JSON.stringify(result.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {activeTab === "historial" && (
        <section className="coeload-card-panel">
          <div className="coeload-panel-head">
            <div>
              <h2>Histórico de importaciones</h2>
              <p>Se conserva para auditoría de cargas históricas y procesos ejecutados.</p>
            </div>
            <button className="coeload-btn dark" type="button" onClick={descargarImportacionesExcel}>
              Descargar Excel
            </button>
          </div>

          <div className="coeload-table-wrap">
            <table className="coeload-table">
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
                {importaciones.length === 0 ? (
                  <tr><td colSpan="8" className="coeload-empty">No hay importaciones registradas.</td></tr>
                ) : importaciones.map((row) => (
                  <tr key={row.id}>
                    <td>{text(row.createdAt)}</td>
                    <td><span className="coeload-pill source">{text(row.tipo)}</span></td>
                    <td>{text(row.archivoNombre)}</td>
                    <td>{numberText(row.filas)}</td>
                    <td>{numberText(row.insertados)}</td>
                    <td>{numberText(row.actualizados)}</td>
                    <td>{numberText(row.errores)}</td>
                    <td>{text(row.usuario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

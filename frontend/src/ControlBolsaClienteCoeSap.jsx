import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./ControlBolsaClienteCoeSap.css";

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

function currentYear() {
  return new Date().getFullYear();
}

function numberValue(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function formatNumber(value, decimals = 2) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function defaultMonths() {
  const names = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  return names.map((name, index) => ({
    mesNumero: index + 1,
    mesNombre: name,
    valorMesContrato: 0,
    valorConsumido: 0,
    horasNoFacturadasBolsa: 0,
    saldo: 0,
    observacion: "",
  }));
}

function calculateRows(saldoInicial, rows) {
  let saldo = numberValue(saldoInicial);

  return (rows || []).map((row) => {
    const valorMesContrato = numberValue(row.valorMesContrato);
    const valorConsumido = numberValue(row.valorConsumido);
    const horasNoFacturadasBolsa = numberValue(row.horasNoFacturadasBolsa);

    saldo = saldo + valorMesContrato - valorConsumido - horasNoFacturadasBolsa;

    return {
      ...row,
      valorMesContrato,
      valorConsumido,
      horasNoFacturadasBolsa,
      saldo,
    };
  });
}

function totals(rows) {
  return (rows || []).reduce((acc, row) => {
    acc.valorMesContrato += numberValue(row.valorMesContrato);
    acc.valorConsumido += numberValue(row.valorConsumido);
    acc.horasNoFacturadasBolsa += numberValue(row.horasNoFacturadasBolsa);
    acc.saldoFinal = numberValue(row.saldo);
    return acc;
  }, {
    valorMesContrato: 0,
    valorConsumido: 0,
    horasNoFacturadasBolsa: 0,
    saldoFinal: 0,
  });
}

export default function ControlBolsaClienteCoeSap() {
  const user = useMemo(() => readStoredUser(), []);
  const rol = String(user?.rol || user?.user?.rol || "").toUpperCase();
  const permisos = useMemo(() => normalizePermisos(user), [user]);

  const isAdmin = rol === "ADMIN";
  const canView = isAdmin || permisos.includes("BASE_REGISTRO_VER");
  const canEdit = isAdmin || permisos.includes("BASE_REGISTRO_IMPORTAR");

  const commonHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    "X-User-Rol": rol,
    "X-User-Usuario": user?.usuario || user?.user?.usuario || "",
  }), [rol, user]);

  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [anio, setAnio] = useState(currentYear());
  const [controlId, setControlId] = useState(null);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [rows, setRows] = useState(defaultMonths());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const calculatedRows = useMemo(() => calculateRows(saldoInicial, rows), [saldoInicial, rows]);
  const resumen = useMemo(() => totals(calculatedRows), [calculatedRows]);

  const fetchData = useCallback(async (forcedClienteId = clienteId, forcedAnio = anio) => {
    if (!canView) return;

    setLoading(true);

    try {
      const qs = new URLSearchParams();
      if (forcedClienteId) qs.set("cliente_id", forcedClienteId);
      if (forcedAnio) qs.set("anio", forcedAnio);

      const res = await jfetch(`/coe-sap-funcional/calificacion/control-bolsa${qs.toString() ? `?${qs.toString()}` : ""}`, {
        method: "GET",
        headers: commonHeaders,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      const clientesData = Array.isArray(data?.clientes) ? data.clientes : [];
      setClientes(clientesData);

      let nextClienteId = forcedClienteId;
      if (!nextClienteId && clientesData.length) {
        nextClienteId = String(clientesData[0].id);
        setClienteId(nextClienteId);
      }

      if (data?.data) {
        setControlId(data.data.id || null);
        setClienteId(String(data.data.clienteId || nextClienteId || ""));
        setAnio(Number(data.data.anio || forcedAnio || currentYear()));
        setSaldoInicial(numberValue(data.data.saldoInicial));
        setRows(Array.isArray(data.data.meses) && data.data.meses.length ? data.data.meses : defaultMonths());
      } else {
        setControlId(null);
        setSaldoInicial(0);
        setRows(defaultMonths());
      }
    } catch (error) {
      console.error("Error consultando control de bolsa:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo consultar el control",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setLoading(false);
    }
  }, [canView, commonHeaders, clienteId, anio]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeCliente = (value) => {
    setClienteId(value);
    if (value) fetchData(value, anio);
  };

  const changeAnio = (value) => {
    const next = Number(value || currentYear());
    setAnio(next);
    if (clienteId) fetchData(clienteId, next);
  };

  const updateCell = (mesNumero, key, value) => {
    setRows((prev) => prev.map((row) => (
      Number(row.mesNumero) === Number(mesNumero)
        ? { ...row, [key]: value }
        : row
    )));
  };

  const saveControl = async () => {
    if (!canEdit) {
      Swal.fire({
        icon: "warning",
        title: "Sin permiso",
        text: "Necesitas el permiso BASE_REGISTRO_IMPORTAR para modificar este control.",
        confirmButtonColor: "#DA291C",
      });
      return;
    }

    if (!clienteId) {
      Swal.fire({ icon: "warning", title: "Selecciona un cliente", confirmButtonColor: "#DA291C" });
      return;
    }

    setSaving(true);

    try {
      const res = await jfetch("/coe-sap-funcional/calificacion/control-bolsa", {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({
          clienteId: Number(clienteId),
          anio: Number(anio),
          saldoInicial: numberValue(saldoInicial),
          meses: calculatedRows.map((row) => ({
            mesNumero: row.mesNumero,
            valorMesContrato: numberValue(row.valorMesContrato),
            valorConsumido: numberValue(row.valorConsumido),
            horasNoFacturadasBolsa: numberValue(row.horasNoFacturadasBolsa),
            observacion: row.observacion || "",
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);

      if (data?.data) {
        setControlId(data.data.id || null);
        setSaldoInicial(numberValue(data.data.saldoInicial));
        setRows(Array.isArray(data.data.meses) ? data.data.meses : calculatedRows);
      }

      Swal.fire({
        icon: "success",
        title: "Control guardado",
        text: "La bolsa del cliente quedó actualizada.",
        confirmButtonColor: "#DA291C",
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error?.message || "Revisa el backend.",
        confirmButtonColor: "#DA291C",
      });
    } finally {
      setSaving(false);
    }
  };

  const clearCurrent = () => {
    setControlId(null);
    setSaldoInicial(0);
    setRows(defaultMonths());
  };

  if (!canView) {
    return (
      <div className="coebag-page">
        <div className="coebag-access-card">
          <div className="coebag-access-icon">🔒</div>
          <h2>Acceso restringido</h2>
          <p>Necesitas el permiso BASE_REGISTRO_VER para consultar esta vista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coebag-page">
      <section className="coebag-hero">
        <div>
          <span className="coebag-eyebrow">Control manual por cliente</span>
          <h1>Control de bolsa COE SAP Funcional</h1>
          <p>
            Tabla independiente por cliente y año. El saldo se calcula automáticamente
            con las fórmulas de suma y resta, como en el Excel.
          </p>
        </div>

        <div className="coebag-hero-actions">
          <button type="button" className="coebag-btn light" onClick={() => fetchData(clienteId, anio)} disabled={loading}>
            {loading ? "Consultando..." : "Actualizar"}
          </button>
          <button type="button" className="coebag-btn danger" onClick={saveControl} disabled={saving || loading || !canEdit}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </section>

      <section className="coebag-card coebag-config-card">
        <div className="coebag-card-head">
          <div>
            <h2>Cliente y periodo</h2>
            <p>Selecciona el cliente para administrar su control de bolsa.</p>
          </div>
          {controlId && <span className="coebag-pill ok">Registro #{controlId}</span>}
        </div>

        <div className="coebag-filter-grid">
          <label className="coebag-field">
            <span>Cliente</span>
            <select value={clienteId} onChange={(e) => changeCliente(e.target.value)}>
              <option value="">Selecciona...</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nombreCliente}</option>
              ))}
            </select>
          </label>

          <label className="coebag-field">
            <span>Año</span>
            <input type="number" value={anio} onChange={(e) => changeAnio(e.target.value)} />
          </label>

          <label className="coebag-field">
            <span>Saldo inicial {anio}</span>
            <input
              type="number"
              step="0.01"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
              disabled={!canEdit}
            />
          </label>
        </div>

        <div className="coebag-actions">
          <button type="button" className="coebag-btn light" onClick={clearCurrent} disabled={!canEdit || loading}>
            Limpiar tabla local
          </button>
          <button type="button" className="coebag-btn danger" onClick={saveControl} disabled={saving || loading || !canEdit}>
            Guardar control
          </button>
        </div>
      </section>

      <section className="coebag-card coebag-table-card">
        <div className="coebag-table-head">
          <div>
            <h2>Bolsa mensual</h2>
            <p>
              Fórmula: saldo = saldo anterior + valor mes contrato - valor consumido - horas no facturadas.
            </p>
          </div>
          <strong>Saldo final: {formatNumber(resumen.saldoFinal, 2)}</strong>
        </div>

        <div className="coebag-table-wrap">
          <table className="coebag-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Valor mes contrato</th>
                <th>Valor consumido</th>
                <th>Horas no facturadas que pasan por la bolsa</th>
                <th>Saldo</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              <tr className="coebag-start-row">
                <td>Saldo inicial {anio}</td>
                <td />
                <td />
                <td />
                <td className="right strong">{formatNumber(saldoInicial, 2)}</td>
                <td />
              </tr>

              {calculatedRows.map((row) => (
                <tr key={`mes-${row.mesNumero}`}>
                  <td className="strong">{row.mesNombre}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={row.valorMesContrato}
                      onChange={(e) => updateCell(row.mesNumero, "valorMesContrato", e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={row.valorConsumido}
                      onChange={(e) => updateCell(row.mesNumero, "valorConsumido", e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={row.horasNoFacturadasBolsa}
                      onChange={(e) => updateCell(row.mesNumero, "horasNoFacturadasBolsa", e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td className={`right strong ${Number(row.saldo || 0) < 0 ? "danger" : "ok"}`}>
                    {formatNumber(row.saldo, 2)}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.observacion || ""}
                      onChange={(e) => updateCell(row.mesNumero, "observacion", e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                </tr>
              ))}

              <tr className="coebag-total-row">
                <td>Saldo final {Number(anio) + 1}</td>
                <td className="right">{formatNumber(resumen.valorMesContrato, 2)}</td>
                <td className="right">{formatNumber(resumen.valorConsumido, 2)}</td>
                <td className="right">{formatNumber(resumen.horasNoFacturadasBolsa, 2)}</td>
                <td className="right">{formatNumber(resumen.saldoFinal, 2)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

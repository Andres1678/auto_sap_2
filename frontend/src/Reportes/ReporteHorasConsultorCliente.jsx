import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "../lib/api";
import "./ReporteHorasConsultorCliente.css";
import PresupuestoConsultorImport from "../PresupuestoConsultorImport";

const moneyCOP = (n) => {
  const v = Number(n || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtHours = (n) => `${Number(n || 0).toFixed(2)} h`;

const ecuacionValorHora = (vrPerfil, horasBaseMes, valorHora) =>
  `${moneyCOP(vrPerfil)} / ${fmtHours(horasBaseMes)} = ${moneyCOP(valorHora)}`;

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("userData") || "{}");
  } catch {
    return {};
  }
}

function getAuthHeaders() {
  const u = getStoredUser();
  const usuario =
    u?.usuario ||
    u?.user?.usuario ||
    "";

  const rol =
    u?.rol ||
    u?.user?.rol ||
    u?.rol_ref?.nombre ||
    "";

  return {
    "X-User-Usuario": String(usuario || "").trim().toLowerCase(),
    "X-User-Rol": String(rol || "").trim().toUpperCase(),
  };
}

export default function PresupuestoYCostoCliente() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [equipo, setEquipo] = useState("");
  const [modulo, setModulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [consultorNombre, setConsultorNombre] = useState("");

  const [verCosto, setVerCosto] = useState(true);
  const [verConsultores, setVerConsultores] = useState(false);
  const [loading, setLoading] = useState(false);

  const [clientesCols, setClientesCols] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalesClienteHoras, setTotalesClienteHoras] = useState({});
  const [totalesClienteCosto, setTotalesClienteCosto] = useState({});
  const [totalGeneralHoras, setTotalGeneralHoras] = useState(0);
  const [totalGeneralCosto, setTotalGeneralCosto] = useState(0);

  const today = new Date();
  const [anioResumen, setAnioResumen] = useState(today.getFullYear());
  const [mesResumen, setMesResumen] = useState(today.getMonth() + 1);
  const [resumenPresupuesto, setResumenPresupuesto] = useState([]);
  const [loadingResumenPresupuesto, setLoadingResumenPresupuesto] = useState(false);

  const cols = useMemo(() => clientesCols || [], [clientesCols]);

  const buildUrlReporte = () => {
    const params = new URLSearchParams();
    if (desde) params.append("desde", desde);
    if (hasta) params.append("hasta", hasta);
    if (equipo) params.append("equipo", equipo);
    if (modulo) params.append("modulo", modulo);
    if (cliente) params.append("cliente", cliente);
    if (consultorNombre) params.append("consultor", consultorNombre);
    return `/reporte/costos-cliente-dia?${params.toString()}`;
  };

  const cargarReporte = async () => {
    setLoading(true);
    try {
      const res = await jfetch(buildUrlReporte(), {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }

      const data = await res.json();

      setClientesCols(data?.clientes || []);
      setRows(data?.rows || []);
      setTotalesClienteHoras(data?.totalesClienteHoras || {});
      setTotalesClienteCosto(data?.totalesClienteCosto || {});
      setTotalGeneralHoras(Number(data?.totalGeneralHoras || 0));
      setTotalGeneralCosto(Number(data?.totalGeneralCosto || 0));
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e.message || "No se pudo cargar el reporte",
      });
    } finally {
      setLoading(false);
    }
  };

  const cargarResumenPresupuesto = async (anioArg = anioResumen, mesArg = mesResumen) => {
    setLoadingResumenPresupuesto(true);
    try {
      const res = await jfetch(`/presupuestos/consultor?anio=${anioArg}&mes=${mesArg}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }

      const data = await res.json();

      const normalizados = (Array.isArray(data) ? data : []).map((item) => {
        const vrPerfil = Number(item?.vrPerfil || 0);
        const horasBaseMes = Number(item?.horasBaseMes || 0);
        const valorHora =
          Number(item?.valorHora || (horasBaseMes > 0 ? vrPerfil / horasBaseMes : 0));

        return {
          consultorId: item?.consultorId,
          nombre: item?.nombre || "—",
          usuario: item?.usuario || "—",
          vrPerfil,
          horasBaseMes,
          valorHora,
          diasHabilesMes:
            item?.diasHabilesMes ??
            item?.diasLaborablesMes ??
            item?.dias_laborables_mes ??
            "—",
        };
      });

      setResumenPresupuesto(normalizados);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error resumen presupuesto",
        text: e.message || "No se pudo cargar el resumen del presupuesto",
      });
      setResumenPresupuesto([]);
    } finally {
      setLoadingResumenPresupuesto(false);
    }
  };

  useEffect(() => {
    cargarReporte();
    cargarResumenPresupuesto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarResumenPresupuesto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anioResumen, mesResumen]);

  const abrirDetalleConsultores = (r) => {
    const list = r?.consultoresList || [];
    Swal.fire({
      title: `Consultores (${list.length})`,
      html: list.length
        ? `<div style="text-align:left;line-height:1.6">${list.map((n) => `• ${n}`).join("<br/>")}</div>`
        : "Sin consultores",
      icon: "info",
      confirmButtonText: "Cerrar",
    });
  };

  const handleImportedBudget = async ({ anio, mes }) => {
    setAnioResumen(anio);
    setMesResumen(mes);
    await cargarResumenPresupuesto(anio, mes);
  };

  return (
    <div className="rhc-shell">
      <div className="rhc-import-wrap">
        <PresupuestoConsultorImport onImported={handleImportedBudget} />
      </div>

      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Resumen presupuesto del período</h2>
          <p className="rhc-sub">
            Lista de consultores con salario, días hábiles del mes, horas base y ecuación del valor hora.
          </p>
        </div>

        <div className="rhc-actions" style={{ gap: 10 }}>
          <div className="rhc-field" style={{ minWidth: 120 }}>
            <label>Año</label>
            <input
              type="number"
              value={anioResumen}
              onChange={(e) => setAnioResumen(Number(e.target.value || 0))}
            />
          </div>

          <div className="rhc-field" style={{ minWidth: 120 }}>
            <label>Mes</label>
            <input
              type="number"
              min={1}
              max={12}
              value={mesResumen}
              onChange={(e) => setMesResumen(Number(e.target.value || 0))}
            />
          </div>

          <button
            className="rhc-btn"
            onClick={() => cargarResumenPresupuesto()}
            disabled={loadingResumenPresupuesto}
          >
            {loadingResumenPresupuesto ? "Cargando..." : "Actualizar resumen"}
          </button>
        </div>
      </div>

      <div className="rhc-card" style={{ marginBottom: 18 }}>
        <div className="rhc-tableWrap">
          <table className="rhc-table">
            <thead>
              <tr>
                <th className="sticky-left">Consultor</th>
                <th>Usuario</th>
                <th className="num">Salario</th>
                <th className="num">Días hábiles</th>
                <th className="num">Horas base mes</th>
                <th>Ecuación valor hora</th>
                <th className="num sticky-right">Valor hora</th>
              </tr>
            </thead>

            <tbody>
              {resumenPresupuesto.map((p) => (
                <tr key={p.consultorId}>
                  <td className="sticky-left">{p.nombre}</td>
                  <td>{p.usuario}</td>
                  <td className="num">{moneyCOP(p.vrPerfil)}</td>
                  <td className="num">{p.diasHabilesMes}</td>
                  <td className="num">{fmtHours(p.horasBaseMes)}</td>
                  <td>{ecuacionValorHora(p.vrPerfil, p.horasBaseMes, p.valorHora)}</td>
                  <td className="num sticky-right">{moneyCOP(p.valorHora)}</td>
                </tr>
              ))}

              {!resumenPresupuesto.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, textAlign: "center" }}>
                    Sin consultores para el período seleccionado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Costo por cliente y por día (agregado)</h2>
          <p className="rhc-sub">
            Horas y costos agregados por día. Totales al final por cliente (mensual en el rango).
          </p>
        </div>

        <div className="rhc-actions">
          <label className="rhc-check">
            <input type="checkbox" checked={verCosto} onChange={(e) => setVerCosto(e.target.checked)} />
            <span>Ver costo</span>
          </label>

          <label className="rhc-check">
            <input
              type="checkbox"
              checked={verConsultores}
              onChange={(e) => setVerConsultores(e.target.checked)}
            />
            <span>Ver consultores</span>
          </label>

          <button className="rhc-btn" onClick={cargarReporte} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar reporte"}
          </button>
        </div>
      </div>

      <div className="rhc-filters">
        <div className="rhc-field">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>

        <div className="rhc-field">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>

        <div className="rhc-field">
          <label>Equipo</label>
          <input
            value={equipo}
            onChange={(e) => setEquipo(e.target.value.toUpperCase())}
            placeholder="BASIS / FUNCIONAL"
          />
        </div>

        <div className="rhc-field">
          <label>Módulo</label>
          <input
            value={modulo}
            onChange={(e) => setModulo(e.target.value.toUpperCase())}
            placeholder="FI / CO / ..."
          />
        </div>

        <div className="rhc-field">
          <label>Cliente</label>
          <input
            value={cliente}
            onChange={(e) => setCliente(e.target.value.toUpperCase())}
            placeholder="CLARO / HITSS / ..."
          />
        </div>

        <div className="rhc-field">
          <label>Consultor (filtro opcional)</label>
          <input
            value={consultorNombre}
            onChange={(e) => setConsultorNombre(e.target.value)}
            placeholder="Ej: Andres"
          />
        </div>
      </div>

      <div className="rhc-card">
        <div className="rhc-tableWrap">
          <table className="rhc-table">
            <thead>
              <tr>
                <th className="sticky-left">Fecha</th>
                <th className="num">Consultores</th>

                {cols.map((c) => (
                  <th key={c} className="num">
                    {verCosto ? `${c} (H / $)` : c}
                  </th>
                ))}

                <th className="num sticky-right-2">Total $</th>
                <th className="num sticky-right">Total Horas</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="sticky-left">{r.fecha || "—"}</td>

                  <td className="num">
                    {verConsultores ? (
                      <button
                        type="button"
                        className="rhc-pill"
                        onClick={() => abrirDetalleConsultores(r)}
                      >
                        {`Consultores: ${Number(r?.consultoresCount || 0)}`}
                      </button>
                    ) : (
                      <span className="rhc-muted">—</span>
                    )}
                  </td>

                  {cols.map((c) => {
                    const h = Number(r?.clientesHoras?.[c] || 0);
                    const cost = Number(r?.clientesCosto?.[c] || 0);

                    return (
                      <td key={c} className="num">
                        {verCosto ? (
                          <>
                            <div>{h.toFixed(2)}</div>
                            <div style={{ opacity: 0.7 }}>{moneyCOP(cost)}</div>
                          </>
                        ) : (
                          h.toFixed(2)
                        )}
                      </td>
                    );
                  })}

                  {verCosto && (
                    <td className="num sticky-right-2">
                      {moneyCOP(r.totalCosto)}
                    </td>
                  )}
                  <td className="num sticky-right">
                    {Number(r.totalHoras || 0).toFixed(2)}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td
                    colSpan={(verCosto ? 4 : 3) + cols.length}
                    style={{ padding: 16, textAlign: "center" }}
                  >
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>

            {!!rows.length && (
              <tfoot>
                <tr>
                  <th className="sticky-left">Totales</th>
                  <th className="num">—</th>

                  {cols.map((c) => {
                    const th = Number(totalesClienteHoras?.[c] || 0);
                    const tc = Number(totalesClienteCosto?.[c] || 0);

                    return (
                      <th key={c} className="num">
                        {verCosto ? (
                          <>
                            <div>{th.toFixed(2)}</div>
                            <div style={{ opacity: 0.7 }}>{moneyCOP(tc)}</div>
                          </>
                        ) : (
                          th.toFixed(2)
                        )}
                      </th>
                    );
                  })}

                  {verCosto && (
                    <th className="num sticky-right-2">
                      {moneyCOP(totalGeneralCosto)}
                    </th>
                  )}
                  <th className="num sticky-right">
                    {Number(totalGeneralHoras || 0).toFixed(2)}
                  </th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
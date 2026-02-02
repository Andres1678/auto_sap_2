import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "../lib/api";
import "./ReporteHorasConsultorCliente.css";

const moneyCOP = (n) => {
  const v = Number(n || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
};

export default function PresupuestoYCostoCliente() {
  // --------- filtros reporte ----------
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [equipo, setEquipo] = useState("");
  const [modulo, setModulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [consultorNombre, setConsultorNombre] = useState("");

  const [verCosto, setVerCosto] = useState(true);
  const [verConsultores, setVerConsultores] = useState(false);
  const [loading, setLoading] = useState(false);

  // --------- reporte cliente/día ----------
  const [clientesCols, setClientesCols] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalesClienteHoras, setTotalesClienteHoras] = useState({});
  const [totalesClienteCosto, setTotalesClienteCosto] = useState({});
  const [totalGeneralHoras, setTotalGeneralHoras] = useState(0);
  const [totalGeneralCosto, setTotalGeneralCosto] = useState(0);

  // --------- presupuestos ----------
  const today = new Date();
  const [anio, setAnio] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [presupuestos, setPresupuestos] = useState([]);
  const [saving, setSaving] = useState(false);

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
      const res = await jfetch(buildUrlReporte());
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

  const cargarPresupuestos = async () => {
    try {
      const res = await jfetch(`/presupuestos/consultor?anio=${anio}&mes=${mes}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setPresupuestos(data || []);
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error presupuestos", text: e.message });
    }
  };

  const onChangePresupuesto = (consultorId, field, value) => {
    setPresupuestos((prev) =>
      prev.map((p) => {
        if (p.consultorId !== consultorId) return p;
        const next = { ...p, [field]: value };

        const vr = Number(next.vrPerfil || 0);
        const hb = Number(next.horasBaseMes || 0);
        next.valorHora = hb > 0 ? Math.round((vr / hb) * 100) / 100 : 0;

        return next;
      })
    );
  };

  const guardarPresupuestos = async () => {
    setSaving(true);
    try {
      const items = presupuestos.map((p) => ({
        consultorId: p.consultorId,
        anio,
        mes,
        vrPerfil: Number(p.vrPerfil || 0),
        horasBaseMes: Number(p.horasBaseMes || 0),
      }));

      const res = await jfetch(`/presupuestos/consultor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }

      Swal.fire({ icon: "success", title: "OK", text: "Presupuestos guardados" });

      // recargar reporte para reflejar costos nuevos
      await cargarReporte();
      await cargarPresupuestos();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    cargarPresupuestos();
    cargarReporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarPresupuestos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes]);

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

  return (
    <div className="rhc-shell">
      {/* ===================== PRESUPUESTOS ===================== */}
      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Presupuesto consultores</h2>
          <p className="rhc-sub">Carga VR perfil y horas base del mes. Se calcula automáticamente el valor/hora.</p>
        </div>

        <div className="rhc-actions" style={{ gap: 10 }}>
          <div className="rhc-field" style={{ minWidth: 120 }}>
            <label>Año</label>
            <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value || 0))} />
          </div>
          <div className="rhc-field" style={{ minWidth: 120 }}>
            <label>Mes</label>
            <input type="number" value={mes} min={1} max={12} onChange={(e) => setMes(Number(e.target.value || 0))} />
          </div>

          <button className="rhc-btn" onClick={guardarPresupuestos} disabled={saving}>
            {saving ? "Guardando..." : "Guardar presupuestos"}
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
                <th className="num">VR Perfil</th>
                <th className="num">Horas base mes</th>
                <th className="num sticky-right">Valor / hora</th>
              </tr>
            </thead>
            <tbody>
              {presupuestos.map((p) => (
                <tr key={p.consultorId}>
                  <td className="sticky-left">{p.nombre}</td>
                  <td>{p.usuario}</td>

                  <td className="num">
                    <input
                      style={{ width: 150 }}
                      type="number"
                      value={p.vrPerfil ?? 0}
                      onChange={(e) => onChangePresupuesto(p.consultorId, "vrPerfil", e.target.value)}
                    />
                  </td>

                  <td className="num">
                    <input
                      style={{ width: 120 }}
                      type="number"
                      value={p.horasBaseMes ?? 0}
                      onChange={(e) => onChangePresupuesto(p.consultorId, "horasBaseMes", e.target.value)}
                    />
                  </td>

                  <td className="num sticky-right">{moneyCOP(p.valorHora)}</td>
                </tr>
              ))}

              {!presupuestos.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: "center" }}>Sin consultores</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== REPORTE CLIENTE/DÍA ===================== */}
      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Costo por cliente y por día (agregado)</h2>
          <p className="rhc-sub">Horas y costos agregados por día. Totales al final por cliente (mensual en el rango).</p>
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
          <input value={equipo} onChange={(e) => setEquipo(e.target.value.toUpperCase())} placeholder="BASIS / FUNCIONAL" />
        </div>

        <div className="rhc-field">
          <label>Módulo</label>
          <input value={modulo} onChange={(e) => setModulo(e.target.value.toUpperCase())} placeholder="FI / CO / ..." />
        </div>

        <div className="rhc-field">
          <label>Cliente</label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value.toUpperCase())} placeholder="CLARO / HITSS / ..." />
        </div>

        <div className="rhc-field">
          <label>Consultor (filtro opcional)</label>
          <input value={consultorNombre} onChange={(e) => setConsultorNombre(e.target.value)} placeholder="Ej: Andres" />
        </div>
      </div>

      <div className="rhc-card">
        <div className="rhc-tableWrap">
          <table className="rhc-table">
            <thead>
              <tr>
                <th className="sticky-left">Fecha</th>

                {/* columna discreta */}
                <th className="num">Consultores</th>

                {cols.map((c) => (
                  <th key={c} className="num">
                    {verCosto ? `${c} (H / $)` : c}
                  </th>
                ))}

                <th className="num sticky-right">Total Horas</th>
                {verCosto && <th className="num sticky-right-2">Total $</th>}
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="sticky-left">{r.fecha || "—"}</td>

                  <td className="num">
                    {verConsultores ? (
                      <button type="button" className="rhc-pill" onClick={() => abrirDetalleConsultores(r)}>
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

                  <td className="num sticky-right">{Number(r.totalHoras || 0).toFixed(2)}</td>
                  {verCosto && <td className="num sticky-right-2">{moneyCOP(r.totalCosto)}</td>}
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={(verCosto ? 4 : 3) + cols.length} style={{ padding: 16, textAlign: "center" }}>
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

                  <th className="num sticky-right">{Number(totalGeneralHoras || 0).toFixed(2)}</th>
                  {verCosto && <th className="num sticky-right-2">{moneyCOP(totalGeneralCosto)}</th>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

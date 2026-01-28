import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "../../lib/api";
import "./ReporteHorasConsultorCliente.css";

const getUserData = () => {
  try { return JSON.parse(localStorage.getItem("userData") || "{}"); }
  catch { return {}; }
};

const hasPerm = (code) => {
  const u = getUserData();
  const perms = u?.permisos || [];
  return perms.includes(code);
};

export default function ReporteHorasConsultorCliente() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [equipo, setEquipo] = useState(""); 
  const [equipos, setEquipos] = useState([]);

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalesCliente, setTotalesCliente] = useState({});
  const [totalGeneral, setTotalGeneral] = useState(0);

  
  useEffect(() => {
    if (!hasPerm("PAGE_REPORTE_HORAS_CONSULTOR")) {
      Swal.fire({
        icon: "error",
        title: "Sin acceso",
        text: "No tienes permiso para ver este reporte."
      });
    }
  }, []);

  // cargar equipos (para filtro)
  useEffect(() => {
    const loadEquipos = async () => {
      try {
        const res = await jfetch("/equipos");
        if (!res.ok) return;
        const data = await res.json();
        setEquipos((data || []).map(x => (x.nombre || "").toUpperCase()).filter(Boolean));
      } catch (e) {}
    };
    loadEquipos();
  }, []);

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (desde) params.append("desde", desde);
    if (hasta) params.append("hasta", hasta);
    if (equipo) params.append("equipo", equipo);
    return `/reporte/horas-consultor-cliente?${params.toString()}`;
  };

  const cargar = async () => {
    // permiso de API
    if (!hasPerm("REPORTE_HORAS_CONSULTOR_CLIENTE_VER")) {
      Swal.fire({ icon: "error", title: "Sin permiso", text: "No puedes consultar este reporte." });
      return;
    }

    setLoading(true);
    try {
      const res = await jfetch(buildUrl());
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.mensaje || `Error ${res.status}`);
      }
      const data = await res.json();

      setClientes(data?.clientes || []);
      setRows(data?.rows || []);
      setTotalesCliente(data?.totalesCliente || {});
      setTotalGeneral(Number(data?.totalGeneral || 0));
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message || "No se pudo cargar el reporte" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // carga inicial
    if (hasPerm("PAGE_REPORTE_HORAS_CONSULTOR")) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols = useMemo(() => clientes || [], [clientes]);

  return (
    <div className="rhc-shell">
      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Reporte — Horas por consultor y cliente</h2>
          <p className="rhc-sub">Matriz (pivot) con totales por consultor y columnas dinámicas por cliente.</p>
        </div>

        <div className="rhc-actions">
          <button className="rhc-btn" onClick={cargar} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
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
          <select value={equipo} onChange={(e) => setEquipo(e.target.value.toUpperCase())}>
            <option value="">Todos</option>
            {equipos.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rhc-card">
        <div className="rhc-tableWrap">
          <table className="rhc-table">
            <thead>
              <tr>
                <th className="sticky-left">Consultor</th>
                <th className="sticky-left-2">Usuario</th>
                <th>Equipo</th>
                {cols.map((c) => (
                  <th key={c} className="num">{c}</th>
                ))}
                <th className="num sticky-right">Total</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.consultorId}>
                  <td className="sticky-left">{r.consultor}</td>
                  <td className="sticky-left-2">{r.usuario}</td>
                  <td>{r.equipo}</td>

                  {cols.map((c) => (
                    <td key={c} className="num">
                      {Number(r?.clientes?.[c] || 0).toFixed(2)}
                    </td>
                  ))}

                  <td className="num sticky-right">
                    {Number(r.totalHoras || 0).toFixed(2)}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={4 + cols.length} style={{ padding: 16, textAlign: "center" }}>
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>

            {!!rows.length && (
              <tfoot>
                <tr>
                  <th className="sticky-left">Totales</th>
                  <th className="sticky-left-2">—</th>
                  <th>—</th>

                  {cols.map((c) => (
                    <th key={c} className="num">
                      {Number(totalesCliente?.[c] || 0).toFixed(2)}
                    </th>
                  ))}

                  <th className="num sticky-right">{Number(totalGeneral || 0).toFixed(2)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

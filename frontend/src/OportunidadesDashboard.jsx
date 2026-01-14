import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import GraficoCantidadGanadas from "./GraficoCantidadGanadas";
import GraficoActivasCerradas from "./GraficoActivasCerradas";
import ResumenCalificacion from "./ResumenCalificacion";
import "./DashboardOportunidades.css";
import { jfetch } from "./lib/api";

/* =========================
   CONSTANTES
========================= */

const ESTADOS_ACTIVOS = [
  "EN PROCESO",
  "REGISTRO",
  "PROSPECCION",
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
  "PENDIENTE APROBACION SAP",
  "EN ELABORACION",
  "ENTREGA COMERCIAL",
];

const ESTADOS_CERRADOS = [
  "CERRADO",
  "CERRADA",
  "CERRADOS",
  "PERDIDA",
  "PERDIDO",
  "DECLINADA",
  "DECLINADO",
  "SUSPENDIDA",
  "SUSPENDIDO",
];

const ESTADO_GANADA = "GANADA";

const estadosOrden = [
  "GANADA",
  "DECLINADA",
  "ENTREGA COMERCIAL",
  "PERDIDA - SIN FEEDBACK",
  "PERDIDA",
  "PROSPECCION",
  "EN ELABORACION",
  "SUSPENDIDA",
  "REGISTRO",
  "PENDIENTE APROBACIÓN SAP",
  "RFI PRESENTADO",
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
];

const estadosResultado = [
  "OPORTUNIDAD CERRADA",
  "OPORTUNIDAD EN PROCESO",
  "BOLSA DE HORAS / CONTINUIDAD DE LA OPERACION",
  "EVOLUTIVO",
  "OPORTUNIDAD PERDIDA",
  "PROYECTO",
  "VAR",
  "A LA ESPERA DEL RFP",
];

export default function OportunidadesDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filtros, setFiltros] = useState({
    anio: "",
    mes: "",
    tipo: "",
  });

  /* =========================
     UTIL
  ========================= */

  const normalizar = (txt) =>
    (txt || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

  // ✅ parse robusto: soporta YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ss...
  const parseFecha = (v) => {
    if (!v) return null;
    const raw = String(v).trim();
    const solo = raw.includes("T") ? raw.split("T")[0] : raw.split(" ")[0];
    const [y, m, d] = solo.split("-").map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  /* =========================
     CARGA DATA
  ========================= */

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await jfetch("/oportunidades?q=");
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      Swal.fire("Error", "No se pudo obtener la información", "error");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* =========================
     OPCIONES DE FILTRO
  ========================= */

  const opcionesAnio = useMemo(() => {
    const set = new Set();
    data.forEach((row) => {
      const d = parseFecha(row.fecha_creacion);
      if (d) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

  const opcionesMes = useMemo(() => {
    const set = new Set();
    data.forEach((row) => {
      const d = parseFecha(row.fecha_creacion);
      if (d) set.add(d.getMonth() + 1);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

  /* =========================
     DATA FILTRADA
  ========================= */

  const dataFiltrada = useMemo(() => {
    if (!data.length) return [];

    return data.filter((row) => {
      const d = parseFecha(row.fecha_creacion);
      const estado = normalizar(row.estado_oferta || row.resultado_oferta);

      if (filtros.anio) {
        if (!d || d.getFullYear() !== Number(filtros.anio)) return false;
      }

      if (filtros.mes) {
        if (!d || d.getMonth() + 1 !== Number(filtros.mes)) return false;
      }

      if (filtros.tipo === "GANADA" && estado !== ESTADO_GANADA) return false;
      if (filtros.tipo === "ACTIVA" && !ESTADOS_ACTIVOS.includes(estado)) return false;
      if (filtros.tipo === "CERRADA" && !ESTADOS_CERRADOS.includes(estado)) return false;

      return true;
    });
  }, [data, filtros]);

  /* =========================
     KPIs
  ========================= */

  const kpis = useMemo(() => {
    let activas = 0;
    let cerradas = 0;
    let ganadas = 0;

    dataFiltrada.forEach((op) => {
      const estado = normalizar(op.estado_oferta || op.resultado_oferta);
      if (ESTADOS_ACTIVOS.includes(estado)) activas++;
      if (ESTADOS_CERRADOS.includes(estado)) cerradas++;
      if (estado === ESTADO_GANADA) ganadas++;
    });

    const total = dataFiltrada.length;

    return {
      total,
      activas,
      cerradas,
      ganadas,
      porcentajeGanadas: total ? (ganadas / total) * 100 : 0,
    };
  }, [dataFiltrada]);

  /* =========================
     TABLAS
  ========================= */

  const tablaEstado = useMemo(() => {
    const conteo = Object.fromEntries(estadosOrden.map((e) => [normalizar(e), 0]));

    dataFiltrada.forEach((row) => {
      const estado = normalizar(row.estado_oferta || row.resultado_oferta);
      if (conteo[estado] !== undefined) conteo[estado]++;
    });

    const total = Object.values(conteo).reduce((a, b) => a + b, 0);

    return {
      total,
      filas: estadosOrden.map((estadoLabel) => {
        const key = normalizar(estadoLabel);
        const cant = conteo[key] ?? 0;
        return {
          estado: estadoLabel,
          cantidad: cant,
          porcentaje: total ? (cant / total) * 100 : 0,
        };
      }),
    };
  }, [dataFiltrada]);

  const tablaResultado = useMemo(() => {
    const conteo = Object.fromEntries(estadosResultado.map((e) => [normalizar(e), 0]));

    dataFiltrada.forEach((row) => {
      const estado = normalizar(row.resultado_oferta || row.estado_oferta);
      if (conteo[estado] !== undefined) conteo[estado]++;
    });

    const total = Object.values(conteo).reduce((a, b) => a + b, 0);

    return {
      total,
      filas: estadosResultado.map((estadoLabel) => {
        const key = normalizar(estadoLabel);
        const cant = conteo[key] ?? 0;
        return {
          estado: estadoLabel,
          cantidad: cant,
          porcentaje: total ? (cant / total) * 100 : 0,
        };
      }),
    };
  }, [dataFiltrada]);

  /* =========================
     RENDER
  ========================= */

  return (
    <div className="oport-dash-wrapper">
      <h2 className="oport-dash-title">Consultorías y oportunidades comerciales CoE SAP</h2>

      <div className="dashboard-layout">
        {/* MAIN */}
        <main className="dashboard-main">
          {loading && <p className="oport-dash-loading">Cargando datos...</p>}

          {/* KPIs */}
          <section className="kpi-grid">
            <div className="kpi-card kpi-total">
              <span className="kpi-label">Cantidad</span>
              <span className="kpi-value">{kpis.total}</span>
            </div>

            <div className="kpi-card kpi-activas">
              <span className="kpi-label">Activas</span>
              <span className="kpi-value">{kpis.activas}</span>
            </div>

            <div className="kpi-card kpi-cerradas">
              <span className="kpi-label">Cerradas</span>
              <span className="kpi-value">{kpis.cerradas}</span>
            </div>

            <div className="kpi-card kpi-ganadas">
              <span className="kpi-label">%Ganadas</span>
              <span className="kpi-value">{kpis.porcentajeGanadas.toFixed(2)}%</span>
              <span className="kpi-sub">
                {kpis.ganadas} de {kpis.total}
              </span>
            </div>
          </section>

          {/* TABLAS + GRÁFICOS */}
          <section className="main-grid">
            {/* IZQUIERDA */}
            <div className="main-col">
              <div className="estado-oferta-card">
                <h3 className="estado-title">Estado de Oferta</h3>
                <table className="estado-table">
                  <thead>
                    <tr>
                      <th>ESTADO_OFERTA</th>
                      <th>Cantidad</th>
                      <th>%Part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaEstado.filas.map((r, i) => (
                      <tr key={i}>
                        <td>{r.estado}</td>
                        <td>{r.cantidad}</td>
                        <td>{r.porcentaje.toFixed(2)}%</td>
                      </tr>
                    ))}
                    <tr className="estado-total">
                      <td>Total</td>
                      <td>{tablaEstado.total}</td>
                      <td>{tablaEstado.total ? "100%" : "0%"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="estado-oferta-card">
                <h3 className="estado-title">Resultado de Oferta</h3>
                <table className="estado-table">
                  <thead>
                    <tr>
                      <th>RESULTADO_OFERTA</th>
                      <th>Cantidad</th>
                      <th>%Part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaResultado.filas.map((r, i) => (
                      <tr key={i}>
                        <td>{r.estado}</td>
                        <td>{r.cantidad}</td>
                        <td>{r.porcentaje.toFixed(2)}%</td>
                      </tr>
                    ))}
                    <tr className="estado-total">
                      <td>Total</td>
                      <td>{tablaResultado.total}</td>
                      <td>{tablaResultado.total ? "100%" : "0%"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* DERECHA ✅ ahora es side-col */}
            <div className="side-col">
              <div className="grafico-card">
                <h3 className="grafico-title">Cantidad y Ganadas/Adjudicadas por Año y Mes</h3>
                <GraficoCantidadGanadas data={dataFiltrada} />
              </div>

              <div className="grafico-card">
                <h3 className="grafico-title">Activas y Cerradas por Año y Mes</h3>
                <GraficoActivasCerradas data={dataFiltrada} />
              </div>

              <div className="grafico-card">
                <h3 className="grafico-title">Resumen Calificación</h3>
                <ResumenCalificacion data={dataFiltrada} />
              </div>
            </div>
          </section>

          {/* DETALLE */}
          <section className="grid-1">
            <div className="detalle-card">
              <h3 className="detalle-title">Detalle de Oportunidades</h3>

              <div className="detalle-scroll">
                <table className="detalle-table">
                  <thead>
                    <tr>
                      <th>NOMBRE CLIENTE</th>
                      <th>SERVICIO</th>
                      <th>FECHA</th>
                      <th>CALIFICACION OPORTUNIDAD</th>
                      <th>ESTADO OFERTA</th>
                      <th>RESULTADO_OFERTA_GLOBAL</th>
                      <th>TIPO MONEDA</th>
                      <th>OTC</th>
                      <th>MRC</th>
                      <th>DURACION</th>
                      <th>FECHA CIERRE OPORTUNIDAD</th>
                      <th>UNICO</th>
                      <th>GERENCIA COMERCIAL</th>
                      <th>COMERCIAL ASIGNADO</th>
                      <th>OBSERVACIONES</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dataFiltrada.map((row, i) => (
                      <tr key={i}>
                        <td>{row.nombre_cliente ?? "-"}</td>
                        <td>{row.servicio ?? "-"}</td>
                        <td>{row.fecha_creacion ?? "-"}</td>
                        <td>{row.calificacion_oportunidad ?? "-"}</td>
                        <td>{row.estado_oferta ?? "-"}</td>
                        <td>{row.resultado_oferta ?? "-"}</td>
                        <td>{row.tipo_moneda ?? "-"}</td>
                        <td>{row.otc ?? "-"}</td>
                        <td>{row.mrc ?? "-"}</td>
                        <td>{row.duracion ?? "-"}</td>
                        <td>{row.fecha_cierre_oportunidad ?? "-"}</td>
                        <td>{row.codigo_prc ?? "-"}</td>
                        <td>{row.gerencia_comercial ?? "-"}</td>
                        <td>{row.comercial_asignado ?? "-"}</td>
                        <td className="td-wrap">{row.observaciones ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>

        {/* SIDEBAR */}
        <aside className="dashboard-filtros">
          <div className="filtro-item">
            <label>Año</label>
            <select
              value={filtros.anio}
              onChange={(e) => setFiltros((p) => ({ ...p, anio: e.target.value }))}
            >
              <option value="">Todos</option>
              {opcionesAnio.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="filtro-item">
            <label>Mes</label>
            <select
              value={filtros.mes}
              onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))}
            >
              <option value="">Todos</option>
              {opcionesMes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="filtro-item">
            <label>Tipo</label>
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros((p) => ({ ...p, tipo: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="GANADA">Ganadas</option>
              <option value="ACTIVA">Activas</option>
              <option value="CERRADA">Cerradas</option>
            </select>
          </div>

          <div className="filtro-actions">
            <button className="btn-clear" onClick={() => setFiltros({ anio: "", mes: "", tipo: "" })}>
              Borrar todas las segmentaciones
            </button>

            <button className="btn-refresh" onClick={fetchData} disabled={loading}>
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>

          <div className="sidebar-foot">
            <span>
              Mostrando <b>{dataFiltrada.length}</b> de <b>{data.length}</b>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import GraficoCantidadGanadas from "./GraficoCantidadGanadas";
import GraficoActivasCerradas from "./GraficoActivasCerradas";
import "./DashboardOportunidades.css";
import { jfetch } from "./lib/api";

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

  const normalizar = (txt) =>
    (txt || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

  const fetchData = async () => {
    setLoading(true);
    try {  
        const res = await jfetch("/oportunidades?q=");
      const json = await res.json();

      if (!Array.isArray(json)) {
        setData([]);
        return;
      }

      setData(json);
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

  const kpis = useMemo(() => {
    if (!data.length) {
      return { total: 0, activas: 0, cerradas: 0, ganadas: 0, porcentajeGanadas: 0 };
    }

    let total = data.length;
    let activas = 0;
    let cerradas = 0;
    let ganadas = 0;

    data.forEach((op) => {
      const estado = normalizar(op.estado_oferta || op.resultado_oferta);

      if (ESTADOS_ACTIVOS.includes(estado)) activas++;
      if (ESTADOS_CERRADOS.includes(estado)) cerradas++;
      if (estado === ESTADO_GANADA) ganadas++;
    });

    return {
      total,
      activas,
      cerradas,
      ganadas,
      porcentajeGanadas: total > 0 ? (ganadas / total) * 100 : 0,
    };
  }, [data]);

  const tablaEstado = useMemo(() => {
    if (!data.length) return { filas: [], total: 0 };

    const conteo = {};
    estadosOrden.forEach((e) => (conteo[e] = 0));

    data.forEach((row) => {
        const estado = normalizar(row.estado_oferta || row.resultado_oferta);
        if (conteo[estado] !== undefined) conteo[estado]++;
    });

    
    const totalGeneral = Object.values(conteo).reduce((a, b) => a + b, 0);

    const filas = estadosOrden.map((estado) => ({
        estado,
        cantidad: conteo[estado],
        porcentaje: totalGeneral ? (conteo[estado] / totalGeneral) * 100 : 0,
    }));

    return { filas, total: totalGeneral };
    }, [data]);

    const tablaResultado = useMemo(() => {
        if (!data || data.length === 0) return { filas: [], total: 0 };

        const conteo = {};
        estadosResultado.forEach((e) => (conteo[e] = 0));

        data.forEach((row) => {
            const estado = normalizar(row.resultado_oferta || row.estado_oferta);
            if (conteo[estado] !== undefined) conteo[estado]++;
        });

        
        const totalGeneral = Object.values(conteo).reduce((a, b) => a + b, 0);

        const filas = estadosResultado.map((estado) => ({
            estado,
            cantidad: conteo[estado],
            porcentaje: totalGeneral > 0 ? (conteo[estado] / totalGeneral) * 100 : 0,
        }));

        return { filas, total: totalGeneral };
        }, [data]);



  return (
    <div className="oport-dash-wrapper">

      {/* ======================= TÍTULO ======================= */}
      <h2 className="oport-dash-title">
        Consultorías y oportunidades comerciales CoE SAP
      </h2>

      {loading && <p className="oport-dash-loading">Cargando datos...</p>}

      {/* ======================= KPIs ======================= */}
      <div className="kpi-grid">
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
          <span className="kpi-label">% Ganadas</span>
          <span className="kpi-value">{kpis.porcentajeGanadas.toFixed(2)}%</span>
          <span className="kpi-sub">{kpis.ganadas} de {kpis.total}</span>
        </div>
      </div>

      {/* ======================= TABLA ESTADO_OFERTA ======================= */}
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
            {tablaEstado.filas.map((row, i) => (
              <tr key={i}>
                <td>{row.estado}</td>
                <td>{row.cantidad}</td>
                <td>{row.porcentaje.toFixed(2)}%</td>
              </tr>
            ))}
            <tr className="estado-total">
              <td><strong>Total</strong></td>
              <td><strong>{tablaEstado.total}</strong></td>
              <td><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================= TABLA RESULTADO_OFERTA ======================= */}
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
            {tablaResultado.filas.map((row, i) => (
              <tr key={i}>
                <td>{row.estado}</td>
                <td>{row.cantidad}</td>
                <td>{row.porcentaje.toFixed(2)}%</td>
              </tr>
            ))}
            <tr className="estado-total">
              <td><strong>Total</strong></td>
              <td><strong>{tablaResultado.total}</strong></td>
              <td><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

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
                {data.map((row, i) => (
                <tr key={i}>
                    <td>{row.nombre_cliente}</td>
                    <td>{row.servicio}</td>
                    <td>{row.fecha_creacion}</td>
                    <td>{row.calificacion_oportunidad}</td>
                    <td>{row.estado_oferta}</td>
                    <td>{row.resultado_oferta}</td>
                    <td>{row.tipo_moneda}</td>
                    <td>{row.otc}</td>
                    <td>{row.mrc}</td>
                    <td>{row.duracion}</td>
                    <td>{row.fecha_cierre_oportunidad}</td>
                    <td>{row.codigo_prc}</td>
                    <td>{row.gerencia_comercial}</td>
                    <td>{row.comercial_asignado}</td>
                    <td>{row.observaciones}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        </div>

        <div className="grafico-wrapper">
            <GraficoCantidadGanadas data={data} />
        </div>

        <div className="grafico-wrapper">
            <GraficoActivasCerradas data={data} />
        </div>
    </div>
  );
}

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function GraficoActivasCerradas({ data }) {
  const normalizar = (txt) =>
    (txt || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

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

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const meses = [
      "enero","febrero","marzo","abril","mayo","junio",
      "julio","agosto","septiembre","octubre","noviembre","diciembre"
    ];

    const base = meses.map((mes) => ({
      mes,
      activas: 0,
      cerradas: 0,
    }));

    data.forEach((row) => {
      if (!row.fecha_creacion) return;

      const fecha = new Date(row.fecha_creacion);
      if (isNaN(fecha)) return;

      const mesIndex = fecha.getMonth();
      const estado = normalizar(row.estado_oferta || row.resultado_oferta);

      if (ESTADOS_ACTIVOS.includes(estado)) base[mesIndex].activas++;
      if (ESTADOS_CERRADOS.includes(estado)) base[mesIndex].cerradas++;
    });

    return base;
  }, [data]);

  return (
    <div className="grafico-card">
      <h3 className="grafico-title">Activas y Cerradas por Año y Mes</h3>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="mes" stroke="#475569" />
          <YAxis stroke="#475569" />
          <Tooltip />
          <Legend />

          {/* Línea Activas (Azul claro) */}
          <Line
            type="monotone"
            dataKey="activas"
            stroke="#0ea5e9"
            strokeWidth={3}
            dot={{ r: 4 }}
            name="Activas"
          />

          {/* Línea Cerradas (Azul oscuro) */}
          <Line
            type="monotone"
            dataKey="cerradas"
            stroke="#1e3a8a"
            strokeWidth={3}
            dot={{ r: 4 }}
            name="Cerradas"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

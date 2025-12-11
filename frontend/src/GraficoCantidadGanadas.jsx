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

export default function GraficoCantidadGanadas({ data }) {
  const normalizar = (txt) =>
    (txt || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const meses = [
      "enero","febrero","marzo","abril","mayo","junio",
      "julio","agosto","septiembre","octubre","noviembre","diciembre"
    ];

    const base = meses.map((mes, i) => ({
      mes,
      cantidad: 0,
      ganadas: 0,
    }));

    data.forEach((row) => {
      if (!row.fecha_creacion) return;

      const fecha = new Date(row.fecha_creacion);
      if (isNaN(fecha)) return;

      const mesIndex = fecha.getMonth();
      const estado = normalizar(row.estado_oferta || row.resultado_oferta);

      
      base[mesIndex].cantidad++;

      
      if (estado === "GANADA") {
        base[mesIndex].ganadas++;
      }
    });

    return base;
  }, [data]);

  return (
    <div className="grafico-card">
      <h3 className="grafico-title">
        Cantidad y Ganadas por Año y Mes
      </h3>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="mes" stroke="#475569" />
          <YAxis stroke="#475569" />
          <Tooltip />
          <Legend />

          <Line
            type="monotone"
            dataKey="cantidad"
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ r: 4 }}
            name="Cantidad"
          />

          <Line
            type="monotone"
            dataKey="ganadas"
            stroke="#16a34a"
            strokeWidth={3}
            dot={{ r: 4 }}
            name="Ganadas"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

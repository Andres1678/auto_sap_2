import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function parseFecha(v) {
  if (!v) return null;
  const raw = String(v).trim();
  const solo = raw.includes("T") ? raw.split("T")[0] : raw.split(" ")[0]; // ✅ clave
  const [y, m, d] = solo.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d); // ✅ sin timezone raro
}

const normalizar = (txt) =>
  (txt || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export default function GraficoCantidadGanadas({ data }) {
  const chartData = useMemo(() => {
    const base = MESES.map((mes) => ({ mes, cantidad: 0, ganadas: 0 }));

    (data || []).forEach((row) => {
      const fecha = parseFecha(row.fecha_creacion);
      if (!fecha) return;

      const idx = fecha.getMonth();
      if (idx < 0 || idx > 11) return;

      const estado = normalizar(row.estado_oferta || row.resultado_oferta);

      base[idx].cantidad += 1;
      if (estado === "GANADA") base[idx].ganadas += 1;
    });

    return base;
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend verticalAlign="bottom" align="center" iconSize={10} />

        <Line type="monotone" dataKey="cantidad" stroke="#2563eb" strokeWidth={3} dot={false} name="Cantidad" />
        <Line type="monotone" dataKey="ganadas"  stroke="#16a34a" strokeWidth={3} dot={false} name="Ganadas" />
      </LineChart>
    </ResponsiveContainer>
  );
}

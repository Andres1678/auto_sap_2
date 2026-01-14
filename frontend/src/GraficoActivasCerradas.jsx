import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

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
  "CERRADO","CERRADA","CERRADOS",
  "PERDIDA","PERDIDO",
  "DECLINADA","DECLINADO",
  "SUSPENDIDA","SUSPENDIDO",
];

function parseFecha(v) {
  if (!v) return null;
  const raw = String(v).trim();
  const solo = raw.includes("T") ? raw.split("T")[0] : raw.split(" ")[0]; // ✅ clave
  const [y, m, d] = solo.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const normalizar = (txt) =>
  (txt || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export default function GraficoActivasCerradas({ data }) {
  const chartData = useMemo(() => {
    const base = MESES.map((mes) => ({ mes, activas: 0, cerradas: 0 }));

    (data || []).forEach((row) => {
      const fecha = parseFecha(row.fecha_creacion);
      if (!fecha) return;

      const idx = fecha.getMonth();
      if (idx < 0 || idx > 11) return;

      const estado = normalizar(row.estado_oferta || row.resultado_oferta);

      if (ESTADOS_ACTIVOS.includes(estado)) base[idx].activas += 1;
      if (ESTADOS_CERRADOS.includes(estado)) base[idx].cerradas += 1;
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

        <Line type="monotone" dataKey="activas"  stroke="#0ea5e9" strokeWidth={3} dot={false} name="Activas" />
        <Line type="monotone" dataKey="cerradas" stroke="#1e3a8a" strokeWidth={3} dot={false} name="Cerradas" />
      </LineChart>
    </ResponsiveContainer>
  );
}

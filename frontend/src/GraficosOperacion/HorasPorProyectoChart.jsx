import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorProyectoChart({
  data,
  isAdmin,
  filtroMes,
  filtroEquipo,
}) {
  const title =
    `${isAdmin ? "Horas por Proyecto" : "Tus horas por Proyecto"}` +
    `${filtroMes ? ` (${filtroMes})` : ""}` +
    `${filtroEquipo?.length ? ` — Equipo: ${filtroEquipo.join(", ")}` : ""}`;

  return (
    <BaseHorizontalBarChart
      title={title}
      data={data}
      dataKeyLabel="proyecto"
      gradId="pgx-gradProyecto"
      yMin={220}
      yMax={360}
      yPad={32}
    />
  );
}
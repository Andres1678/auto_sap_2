import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorModuloChart({
  data,
  isAdmin,
  filtroMes,
  filtroEquipo,
  onOpenDetail,
}) {
  const title =
    `${isAdmin ? "Horas por Módulo" : "Tus horas por Módulo"}` +
    `${filtroMes ? ` (${filtroMes})` : ""}` +
    `${filtroEquipo?.length ? ` — Equipo: ${filtroEquipo.join(", ")}` : ""}`;

  return (
    <BaseHorizontalBarChart
      title={title}
      data={data}
      dataKeyLabel="modulo"
      gradId="pgx-gradModulo"
      yMin={140}
      yMax={360}
      yPad={32}
      onBarClick={(entry) => onOpenDetail?.("modulo", entry.modulo, "Módulo")}
    />
  );
}
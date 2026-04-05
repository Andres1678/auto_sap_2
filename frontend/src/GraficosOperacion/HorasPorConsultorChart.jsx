import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorConsultorChart({
  data,
  isAdmin,
  filtroMes,
  filtroEquipo,
  metaMensual,
  onOpenDetail,
}) {
  const title =
    `${isAdmin ? "Horas por Consultor" : "Tus horas por Consultor"}` +
    `${filtroMes ? ` (${filtroMes})` : ""}` +
    `${filtroEquipo?.length ? ` — Equipo: ${filtroEquipo.join(", ")}` : ""}`;

  return (
    <BaseHorizontalBarChart
      title={title}
      data={data}
      dataKeyLabel="consultor"
      gradId="pgx-gradConsultor"
      yMin={140}
      yMax={360}
      yPad={32}
      metaMensual={metaMensual}
      onBarClick={(entry) => onOpenDetail?.("consultor", entry.consultor, "Consultor")}
    />
  );
}
import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorClienteChart({
  data,
  isAdmin,
  filtroMes,
  filtroEquipo,
  onOpenDetail,
}) {
  const title =
    `${isAdmin ? "Horas por Cliente" : "Tus horas por Cliente"}` +
    `${filtroMes ? ` (${filtroMes})` : ""}` +
    `${filtroEquipo?.length ? ` — Equipo: ${filtroEquipo.join(", ")}` : ""}`;

  return (
    <BaseHorizontalBarChart
      title={title}
      data={data}
      dataKeyLabel="cliente"
      gradId="pgx-gradCliente"
      yMin={160}
      yMax={380}
      yPad={32}
      onBarClick={(entry) => onOpenDetail?.("cliente", entry.cliente, "Cliente")}
    />
  );
}
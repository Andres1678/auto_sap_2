import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorTareaChart({ data, isAdmin, onOpenDetail }) {
  return (
    <BaseHorizontalBarChart
      title={isAdmin ? "Horas por Tipo de Tarea" : "Tus horas por Tipo de Tarea"}
      data={data}
      dataKeyLabel="tipoTarea"
      gradId="pgx-gradTarea"
      yMin={160}
      yMax={380}
      yPad={32}
      onBarClick={(entry) => onOpenDetail?.("tipoTarea", entry.tipoTarea, "Tipo de Tarea")}
    />
  );
}
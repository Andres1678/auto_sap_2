import React from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorOcupacionChart({ data, isAdmin, onOpenDetail }) {
  return (
    <BaseHorizontalBarChart
      title={isAdmin ? "Horas por Ocupación" : "Tus horas por Ocupación"}
      data={data}
      dataKeyLabel="ocupacion"
      gradId="pgx-gradOcupacion"
      yMin={160}
      yMax={380}
      yPad={32}
      onBarClick={(entry) =>
        onOpenDetail?.("ocupacion", entry.ocupacion, "Ocupación")
      }
    />
  );
}
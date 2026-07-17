import React, { useMemo } from "react";
import BaseHorizontalBarChart from "./BaseHorizontalBarChart";

export default function HorasPorConsultorChart({
  data = [],
  isAdmin,
  filtroMes,
  filtroEquipo,
  metaMensual,
  onOpenDetail,
}) {
  const chartData = useMemo(() => {
    return (Array.isArray(data) ? data : [])
      .map((row) => ({
        ...row,
        consultor: String(row?.consultor || "SIN CONSULTOR").trim(),
        horas: Number(row?.horas || 0),
      }))
      .sort((a, b) => {
        if (b.horas !== a.horas) return b.horas - a.horas;
        return a.consultor.localeCompare(b.consultor, "es");
      });
  }, [data]);

  const title =
    `${isAdmin ? "Horas por Consultor" : "Tus horas por Consultor"}` +
    `${filtroMes ? ` (${filtroMes})` : ""}` +
    `${
      filtroEquipo?.length
        ? ` — Equipo: ${filtroEquipo.join(", ")}`
        : ""
    }`;

  /*
   * El valor anterior yMax={360} comprimía todas las filas.
   * Ahora la altura crece según la cantidad de consultores.
   */
  const dynamicHeight = Math.max(
    360,
    chartData.length * 42 + 90
  );

  return (
    <BaseHorizontalBarChart
      title={title}
      data={chartData}
      dataKeyLabel="consultor"
      gradId="pgx-gradConsultor"
      yMin={360}
      yMax={dynamicHeight}
      yPad={42}
      metaMensual={metaMensual}
      forceAllLabels
      onBarClick={(entry) =>
        onOpenDetail?.(
          "consultor",
          entry.consultor,
          "Consultor"
        )
      }
    />
  );
}

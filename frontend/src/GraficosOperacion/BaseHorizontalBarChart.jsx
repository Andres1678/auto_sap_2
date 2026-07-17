import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  BrandDefs,
  WrapTickPx,
  yWidthFromPx,
} from "./chartUtils";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function BaseHorizontalBarChart({
  title,
  data = [],
  dataKeyLabel,
  gradId,
  emptyText = "Sin datos para los filtros seleccionados.",

  // Altura mínima de la gráfica.
  heightMin = 340,

  // Espacio vertical reservado por cada registro.
  rowHeight = 42,

  // Ancho mínimo y máximo del eje de nombres.
  yMin = 210,
  yMax = 420,
  yPad = 40,

  // Alto máximo visible antes de mostrar desplazamiento vertical.
  maxVisibleHeight = 650,

  onBarClick,
  metaMensual = null,
}) {
  const chartData = useMemo(() => {
    return (Array.isArray(data) ? data : [])
      .map((entry) => ({
        ...entry,
        [dataKeyLabel]:
          String(entry?.[dataKeyLabel] || "SIN INFORMACIÓN").trim(),
        horas: toNumber(entry?.horas),
      }))
      .sort((a, b) => {
        if (b.horas !== a.horas) {
          return b.horas - a.horas;
        }

        return String(a[dataKeyLabel]).localeCompare(
          String(b[dataKeyLabel]),
          "es"
        );
      });
  }, [data, dataKeyLabel]);

  /*
   * Se suma espacio adicional para las márgenes superiores
   * e inferiores del gráfico.
   */
  const chartHeight = Math.max(
    heightMin,
    chartData.length * rowHeight + 45
  );

  /*
   * Calcula el espacio del eje Y según la longitud real
   * de los nombres.
   */
  const yWidth = useMemo(() => {
    return yWidthFromPx(
      chartData.map((entry) => entry[dataKeyLabel]),
      {
        min: yMin,
        max: yMax,
        pad: yPad,
      }
    );
  }, [
    chartData,
    dataKeyLabel,
    yMin,
    yMax,
    yPad,
  ]);

  const chartMinWidth = Math.max(
    760,
    yWidth + 520
  );

  return (
    <div className="pgx-card">
      <h3>{title}</h3>

      {!chartData.length ? (
        <div className="pgx-empty">
          {emptyText}
        </div>
      ) : (
        <div
          className="pgx-chart-scroll"
          style={{
            width: "100%",
            maxHeight: `${maxVisibleHeight}px`,
            overflowX: "auto",
            overflowY:
              chartHeight > maxVisibleHeight
                ? "auto"
                : "hidden",
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              width: "100%",
              minWidth: `${chartMinWidth}px`,
              height: `${chartHeight}px`,
            }}
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 14,
                  right: 90,
                  left: 8,
                  bottom: 14,
                }}
                barCategoryGap={10}
                barSize={22}
              >
                <BrandDefs id={gradId} />

                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal
                  vertical
                />

                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "#475569",
                  }}
                />

                <YAxis
                  type="category"
                  dataKey={dataKeyLabel}
                  width={yWidth}

                  /*
                   * Esta propiedad obliga a Recharts a mostrar
                   * todos los nombres, sin saltarse ninguno.
                   */
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={
                    <WrapTickPx
                      maxWidth={Math.max(
                        100,
                        yWidth - 22
                      )}
                      fontSize={12}
                    />
                  }
                />

                <Tooltip
                  formatter={(value) => [
                    `${toNumber(value).toFixed(2)} h`,
                    "Horas",
                  ]}
                  labelFormatter={(_, payload) => {
                    const label =
                      payload?.[0]?.payload?.[
                        dataKeyLabel
                      ];

                    return label || "";
                  }}
                />

                {metaMensual && (
                  <ReferenceLine
                    x={toNumber(metaMensual.limite)}
                    stroke="#ef4444"
                    strokeDasharray="6 6"
                    label={{
                      value:
                        `Meta: ${toNumber(
                          metaMensual.limite
                        ).toFixed(0)} h ` +
                        `(${metaMensual.diasHabiles} días)`,
                      position: "top",
                      fill: "#ef4444",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />
                )}

                <Bar
                  dataKey="horas"
                  name="Horas"
                  radius={[0, 5, 5, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="horas"
                    position="right"
                    formatter={(value) => {
                      const number = toNumber(value);

                      return number > 0
                        ? number.toFixed(1)
                        : "";
                    }}
                    style={{
                      fill: "#6b7280",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />

                  {chartData.map((entry, idx) => (
                    <Cell
                      key={`${gradId}-${
                        entry?.[dataKeyLabel] || idx
                      }-${idx}`}
                      fill={`url(#${gradId})`}
                      onClick={() =>
                        onBarClick?.(entry)
                      }
                      style={{
                        cursor: onBarClick
                          ? "pointer"
                          : "default",
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
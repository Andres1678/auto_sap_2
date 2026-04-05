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
import { BrandDefs, WrapTickPx, yWidthFromPx } from "./chartUtils";

export default function BaseHorizontalBarChart({
  title,
  data,
  dataKeyLabel,
  gradId,
  emptyText = "Sin datos para los filtros seleccionados.",
  heightMin = 320,
  rowHeight = 30,
  yMin = 140,
  yMax = 380,
  yPad = 32,
  onBarClick,
  metaMensual = null,
}) {
  const height = Math.max(heightMin, (data?.length || 0) * rowHeight);

  const yWidth = useMemo(() => {
    return yWidthFromPx(
      (data || []).map((d) => d[dataKeyLabel]),
      { min: yMin, max: yMax, pad: yPad }
    );
  }, [data, dataKeyLabel, yMin, yMax, yPad]);

  return (
    <div className="pgx-card">
      <h3>{title}</h3>

      {!data?.length ? (
        <div className="pgx-empty">{emptyText}</div>
      ) : (
        <div className="pgx-chart-scroll">
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 80, left: 8, bottom: 8 }}
              barCategoryGap={12}
              barSize={20}
            >
              <BrandDefs id={gradId} />
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey={dataKeyLabel}
                width={yWidth}
                tick={<WrapTickPx maxWidth={yWidth - 18} fontSize={12} />}
              />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]} />

              {metaMensual && (
                <ReferenceLine
                  x={metaMensual.limite}
                  stroke="#ef4444"
                  strokeDasharray="6 6"
                  label={{
                    value: `Meta: ${metaMensual.limite.toFixed(0)} h (${metaMensual.diasHabiles} días)`,
                    position: "top",
                    fill: "#ef4444",
                    fontSize: 12,
                    fontWeight: 700
                  }}
                />
              )}

              <Bar dataKey="horas" name="Horas">
                <LabelList
                  dataKey="horas"
                  position="right"
                  formatter={(value) => Number(value).toFixed(1)}
                  style={{ fill: "#6b7280", fontSize: 12, fontWeight: 600 }}
                />
                {(data || []).map((entry, idx) => (
                  <Cell
                    key={`${gradId}-${idx}`}
                    fill={`url(#${gradId})`}
                    onClick={() => onBarClick?.(entry)}
                    style={{ cursor: onBarClick ? "pointer" : "default" }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
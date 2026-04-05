import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Cell,
} from "recharts";
import {
  PIE_COLORS,
  darkenHex,
  truncateTxt,
  makeSmartPieLabelRenderer,
  TaskPieTooltip,
} from "./chartUtils";

export default function PieTareasChart({
  data,
  otrosDetalle,
  totalHoras,
  filtroMes,
  filtroEquipo,
}) {
  const taskPieLabelRenderer = useMemo(
    () =>
      makeSmartPieLabelRenderer(data, {
        startAngle: 210,
        endAngle: -30,
        minPercent: 1.6,
        maxLabels: 11,
        offset: 28,
        minGap: 20,
        digits: 1,
        color: "#334155",
        fontSize: 12,
        fontWeight: 800,
      }),
    [data]
  );

  return (
    <div className="pgx-card">
      <h3>
        Distribución por Tipo de Tarea (%)
        {filtroMes && ` (${filtroMes})`}
        {filtroEquipo?.length > 0 && ` — Equipo: ${filtroEquipo.join(", ")}`}
      </h3>

      {!data?.length ? (
        <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
      ) : (
        <div className="pgx-pie-3d-layout">
          <div className="pgx-pie-3d-chart">
            <ResponsiveContainer width="100%" height={520}>
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Tooltip content={<TaskPieTooltip otrosDetalle={otrosDetalle} />} />

                {[...Array(12)].map((_, layerIndex) => (
                  <Pie
                    key={`task-depth-${layerIndex}`}
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy={250 + (12 - layerIndex)}
                    startAngle={210}
                    endAngle={-30}
                    innerRadius={74}
                    outerRadius={128}
                    paddingAngle={2}
                    isAnimationActive={false}
                    stroke="none"
                    legendType="none"
                  >
                    {data.map((entry, i) => (
                      <Cell
                        key={`task-depth-cell-${layerIndex}-${i}`}
                        fill={darkenHex(PIE_COLORS[i % PIE_COLORS.length], 0.42)}
                      />
                    ))}
                  </Pie>
                ))}

                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy={250}
                  startAngle={210}
                  endAngle={-30}
                  innerRadius={74}
                  outerRadius={128}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  labelLine={false}
                  label={taskPieLabelRenderer}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={`task-top-cell-${i}`}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>

                <text x="50%" y="242" textAnchor="middle" className="pgx-pie-center-big">
                  {`${Number(totalHoras || 0).toFixed(1)} h`}
                </text>
                <text x="50%" y="265" textAnchor="middle" className="pgx-pie-center-small">
                  Total mes
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="pgx-pie-legend-box">
            {data.map((entry, index) => (
              <div
                key={`task-legend-${index}`}
                className="pgx-pie-legend-item"
                title={`${entry.name} — ${entry.value.toFixed(2)}%`}
              >
                <span
                  className="pgx-pie-legend-dot"
                  style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                />
                <span className="pgx-pie-legend-text">{truncateTxt(entry.name, 38)}</span>
                <strong className="pgx-pie-legend-val">{entry.value.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
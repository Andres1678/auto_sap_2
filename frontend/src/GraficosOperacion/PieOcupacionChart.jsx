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
} from "./chartUtils";

export default function PieOcupacionChart({
  data,
  totalHoras,
  filtroMes,
  filtroEquipo,
}) {
  const ocupPieLabelRenderer = useMemo(
    () =>
      makeSmartPieLabelRenderer(data, {
        startAngle: 90,
        endAngle: -270,
        minPercent: 0.8,
        maxLabels: 14,
        offset: 28,
        minGap: 18,
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
        Distribución por Ocupación (%)
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
                <Tooltip
                  formatter={(v, n, p) => [
                    `${Number(v).toFixed(2)}% — ${Number(p.payload.horas).toFixed(2)} h`,
                    p.payload.name,
                  ]}
                />

                {[...Array(10)].map((_, layerIndex) => (
                  <Pie
                    key={`ocup-depth-${layerIndex}`}
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy={250 + (10 - layerIndex)}
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={0}
                    outerRadius={128}
                    paddingAngle={1.2}
                    isAnimationActive={false}
                    stroke="none"
                    legendType="none"
                  >
                    {data.map((entry, i) => (
                      <Cell
                        key={`ocup-depth-cell-${layerIndex}-${i}`}
                        fill={darkenHex(PIE_COLORS[i % PIE_COLORS.length], 0.40)}
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
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={0}
                  outerRadius={128}
                  paddingAngle={1.2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  labelLine={false}
                  label={ocupPieLabelRenderer}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={`ocup-top-cell-${i}`}
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
                key={`ocup-legend-${index}`}
                className="pgx-pie-legend-item"
                title={`${entry.name} — ${entry.value.toFixed(2)}% — ${entry.horas.toFixed(2)} h`}
              >
                <span
                  className="pgx-pie-legend-dot"
                  style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                />
                <span className="pgx-pie-legend-text">
                  {truncateTxt(entry.name, 38)}
                </span>
                <strong className="pgx-pie-legend-val">{entry.value.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
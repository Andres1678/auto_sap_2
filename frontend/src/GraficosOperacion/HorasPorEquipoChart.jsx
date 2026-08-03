import React, { useMemo } from "react";
import "./HorasPorEquipoChart.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

const numberFormat = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const safeHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatHours = (value) => `${numberFormat.format(safeHours(value))} h`;

export default function HorasPorEquipoChart({
  data = [],
  filtroMes = "",
  desde = "",
  hasta = "",
  filtroEquipo = [],
  onOpenDetail,
}) {
  const rows = useMemo(() => {
    return (Array.isArray(data) ? data : [])
      .map((row) => ({
        equipo: String(row?.equipo || "SIN EQUIPO").trim().toUpperCase(),
        horas: safeHours(row?.horas),
      }))
      .filter((row) => row.horas > 0)
      .sort((a, b) => b.horas - a.horas);
  }, [data]);

  const totalHoras = useMemo(
    () => rows.reduce((total, row) => total + row.horas, 0),
    [rows]
  );

  const periodoTexto = useMemo(() => {
    if (filtroMes) return `Mes ${filtroMes}`;
    if (desde && hasta) return `${desde} a ${hasta}`;
    return "Período aplicado";
  }, [filtroMes, desde, hasta]);

  const equiposTexto = useMemo(() => {
    if (Array.isArray(filtroEquipo)) {
      return filtroEquipo.length ? filtroEquipo.join(", ") : "Todos";
    }

    return String(filtroEquipo || "").trim() || "Todos";
  }, [filtroEquipo]);

  const chartHeight = Math.max(300, rows.length * 58 + 110);

  const openDetail = (entry) => {
    const equipo = String(
      entry?.equipo || entry?.payload?.equipo || ""
    ).trim();

    if (!equipo || typeof onOpenDetail !== "function") return;
    onOpenDetail("equipo", equipo, "Equipo");
  };

  return (
    <section className="pgx-team-chart">
      <div className="pgx-team-chart__head">
        <div>
          <h3>Horas por equipo</h3>
          <p>
            {periodoTexto} · Equipo: {equiposTexto}
          </p>
        </div>

        <span className="pgx-team-chart__total">
          {formatHours(totalHoras)}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="pgx-team-chart__empty">
          Sin datos por equipo con los filtros aplicados.
        </div>
      ) : (
        <div className="pgx-team-chart__canvas" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 12, right: 88, left: 12, bottom: 12 }}
              barCategoryGap="28%"
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />

              <XAxis
                type="number"
                tickFormatter={formatHours}
                tick={{ fontSize: 12, fill: "#64748b" }}
              />

              <YAxis
                type="category"
                dataKey="equipo"
                width={180}
                interval={0}
                tick={{ fontSize: 12, fontWeight: 700, fill: "#334155" }}
              />

              <Tooltip
                formatter={(value) => [formatHours(value), "Horas"]}
                labelFormatter={(label) => `Equipo: ${label}`}
              />

              <Bar
                dataKey="horas"
                name="Horas"
                fill="#DA291C"
                radius={[0, 9, 9, 0]}
                onClick={openDetail}
                style={{ cursor: "pointer" }}
              >
                <LabelList
                  dataKey="horas"
                  position="right"
                  formatter={formatHours}
                  style={{
                    fill: "#334155",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

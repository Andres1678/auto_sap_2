import React from "react";
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
} from "recharts";
import { BrandDefs } from "./chartUtils";

export default function HorasPorDiaChart({
  data,
  filtroMes,
  filtroEquipo,
  onOpenDetail,
}) {
  const hDias = 380;

  return (
    <div className="pgx-card">
      <h3>
        Horas por Día (mes)
        {filtroMes && ` (${filtroMes})`}
        {filtroEquipo?.length > 0 && ` — Equipo: ${filtroEquipo.join(", ")}`}
      </h3>

      {!data?.length ? (
        <div className="pgx-empty">Sin datos para los filtros seleccionados.</div>
      ) : (
        <ResponsiveContainer width="100%" height={hDias}>
          <BarChart
            data={data}
            margin={{ top: 24, right: 24, left: 8, bottom: 16 }}
            barCategoryGap={6}
          >
            <BrandDefs id="pgx-gradDia" />
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} />
            <YAxis />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(2)} h`, "Horas"]}
              labelFormatter={(label, payload) => {
                if (payload && payload[0] && payload[0].payload?.fecha) {
                  return payload[0].payload.fecha;
                }
                return String(label);
              }}
            />
            <Bar dataKey="horas" name="Horas" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="horas"
                position="top"
                formatter={(value) => Number(value).toFixed(1)}
                style={{ fill: "#6b7280", fontSize: 12, fontWeight: 600 }}
              />
              {(data || []).map((entry, idx) => (
                <Cell
                  key={`d-${entry.fecha}-${idx}`}
                  fill="url(#pgx-gradDia)"
                  onClick={() => onOpenDetail?.("fecha", entry.fecha, "Fecha")}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
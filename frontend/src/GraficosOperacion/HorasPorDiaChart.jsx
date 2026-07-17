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
} from "recharts";
import { BrandDefs } from "./chartUtils";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizeFecha = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

export default function HorasPorDiaChart({
  data = [],
  filtroMes,
  filtroEquipo,
  onOpenDetail,
}) {
  /*
   * Se vuelve a agrupar por fecha como protección.
   * Así nunca aparecerán varias barras para el mismo día.
   */
  const chartData = useMemo(() => {
    const acumulado = new Map();

    (Array.isArray(data) ? data : []).forEach((row) => {
      const fecha = normalizeFecha(row?.fecha);

      if (!fecha) return;

      acumulado.set(
        fecha,
        (acumulado.get(fecha) || 0) + toNumber(row?.horas)
      );
    });

    return Array.from(acumulado, ([fecha, horas]) => {
      const dia = Number(fecha.slice(8, 10));
      const mes = fecha.slice(5, 7);

      return {
        fecha,
        day: dia,
        label: filtroMes ? String(dia) : `${String(dia).padStart(2, "0")}/${mes}`,
        horas: Number(horas.toFixed(2)),
      };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [data, filtroMes]);

  /*
   * Cada barra recibe espacio suficiente.
   * Si existen muchos días se activa scroll horizontal.
   */
  const minChartWidth = Math.max(900, chartData.length * 58);
  const hDias = 400;

  const equipoTexto =
    Array.isArray(filtroEquipo) && filtroEquipo.length > 0
      ? ` — Equipo: ${filtroEquipo.join(", ")}`
      : "";

  return (
    <div className="pgx-card">
      <h3>
        Horas por Día {filtroMes ? "(mes)" : "(rango)"}
        {filtroMes && ` (${filtroMes})`}
        {equipoTexto}
      </h3>

      {!chartData.length ? (
        <div className="pgx-empty">
          Sin datos para los filtros seleccionados.
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            overflowX: "auto",
            overflowY: "hidden",
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              width: `${minChartWidth}px`,
              minWidth: "100%",
              height: `${hDias}px`,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 32, right: 28, left: 8, bottom: 20 }}
                barCategoryGap="25%"
              >
                <BrandDefs id="pgx-gradDia" />

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  interval={0}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />

                <YAxis
                  tick={{ fontSize: 11 }}
                  width={55}
                />

                <Tooltip
                  formatter={(value) => [
                    `${toNumber(value).toFixed(2)} h`,
                    "Horas",
                  ]}
                  labelFormatter={(_, payload) => {
                    const fecha = payload?.[0]?.payload?.fecha;
                    return fecha || "";
                  }}
                />

                <Bar
                  dataKey="horas"
                  name="Horas"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                >
                  <LabelList
                    dataKey="horas"
                    position="top"
                    formatter={(value) =>
                      toNumber(value) > 0
                        ? toNumber(value).toFixed(1)
                        : ""
                    }
                    style={{
                      fill: "#6b7280",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />

                  {chartData.map((entry, idx) => (
                    <Cell
                      key={`d-${entry.fecha}-${idx}`}
                      fill="url(#pgx-gradDia)"
                      onClick={() =>
                        onOpenDetail?.("fecha", entry.fecha, "Fecha")
                      }
                      style={{ cursor: "pointer" }}
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

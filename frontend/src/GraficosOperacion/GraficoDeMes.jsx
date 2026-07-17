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

const CHART_BLUE = "#0055B8";

const MONTHS_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(
    String(value)
      .trim()
      .replace(",", ".")
  );

  return Number.isFinite(number) ? number : 0;
};

const normalizeDateOnly = (value) => {
  if (!value) return "";

  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) {
    return match[1];
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const isMonthKey = (value) =>
  /^\d{4}-\d{2}$/.test(String(value || ""));

const getMonthKeyFromDate = (value) => {
  const date = normalizeDateOnly(value);

  if (!date) {
    return "";
  }

  return date.slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  if (!isMonthKey(monthKey)) {
    return monthKey || "SIN MES";
  }

  const [year, month] = monthKey.split("-");
  const monthIndex = Number(month) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return monthKey;
  }

  return `${MONTHS_ES[monthIndex]} ${year}`;
};

const getHours = (row) =>
  toNumber(
    row?.tiempoInvertido ??
      row?.tiempo_invertido ??
      row?.horasNum ??
      row?.total_horas ??
      row?.totalHoras ??
      row?.horas ??
      0
  );

const getModule = (row) =>
  String(
    row?.modulo ??
      row?.moduloNormalizado ??
      row?.modulo_nombre ??
      "SIN MÓDULO"
  ).trim() || "SIN MÓDULO";

const buildMonthSeries = (startMonth, endMonth) => {
  if (!isMonthKey(startMonth) || !isMonthKey(endMonth)) {
    return [];
  }

  let [year, month] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);

  const result = [];

  while (
    year < endYear ||
    (year === endYear && month <= endMonthNumber)
  ) {
    const key =
      `${String(year).padStart(4, "0")}-` +
      `${String(month).padStart(2, "0")}`;

    result.push({
      key,
      name: formatMonthLabel(key),
      horas: 0,
      totalModulos: 0,
      modulosDetalle: [],
    });

    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return result;
};

const normalizePeriod = ({
  filtroMes,
  desde,
  hasta,
  groupedRows,
}) => {
  if (isMonthKey(filtroMes)) {
    return {
      startMonth: filtroMes,
      endMonth: filtroMes,
    };
  }

  const fromMonth = getMonthKeyFromDate(desde);
  const toMonth = getMonthKeyFromDate(hasta);

  if (fromMonth || toMonth) {
    const start = fromMonth || toMonth;
    const end = toMonth || fromMonth;

    return start <= end
      ? { startMonth: start, endMonth: end }
      : { startMonth: end, endMonth: start };
  }

  if (groupedRows.length > 0) {
    return {
      startMonth: groupedRows[0].key,
      endMonth: groupedRows[groupedRows.length - 1].key,
    };
  }

  return {
    startMonth: "",
    endMonth: "",
  };
};

function MesModuloTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload || {};
  const modules = Array.isArray(row?.modulosDetalle)
    ? row.modulosDetalle
    : [];

  return (
    <div
      style={{
        minWidth: 250,
        maxWidth: 360,
        padding: 12,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
      }}
    >
      <div
        style={{
          marginBottom: 8,
          color: "#0f172a",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginBottom: modules.length > 0 ? 10 : 0,
          color: "#334155",
          fontSize: 12,
        }}
      >
        <strong>Total:</strong>{" "}
        {toNumber(row?.horas).toFixed(2)} h
      </div>

      {modules.length > 0 && (
        <div
          style={{
            maxHeight: 230,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          <div
            style={{
              marginBottom: 6,
              color: "#64748b",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Módulos ({modules.length})
          </div>

          {modules.map((module) => (
            <div
              key={module.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 14,
                padding: "4px 0",
                borderBottom: "1px solid #f1f5f9",
                color: "#334155",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {module.name}
              </span>

              <strong style={{ flex: "0 0 auto" }}>
                {toNumber(module.horas).toFixed(2)} h
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraficoDeMes({
  data = [],
  filtroMes = "",
  desde = "",
  hasta = "",
  filtroEquipo = [],
  onOpenDetail,
}) {
  const chartData = useMemo(() => {
    const monthsMap = new Map();

    (Array.isArray(data) ? data : []).forEach((row) => {
      const monthKey = getMonthKeyFromDate(row?.fecha);

      if (!monthKey) {
        return;
      }

      const moduleName = getModule(row);
      const hours = getHours(row);

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          key: monthKey,
          name: formatMonthLabel(monthKey),
          horas: 0,
          modulosMap: new Map(),
        });
      }

      const monthRow = monthsMap.get(monthKey);
      monthRow.horas += hours;

      monthRow.modulosMap.set(
        moduleName,
        toNumber(monthRow.modulosMap.get(moduleName)) + hours
      );
    });

    const groupedRows = Array.from(monthsMap.values())
      .map((row) => {
        const modules = Array.from(row.modulosMap.entries())
          .map(([name, hours]) => ({
            name,
            horas: Number(toNumber(hours).toFixed(2)),
          }))
          .sort((a, b) => {
            if (b.horas !== a.horas) {
              return b.horas - a.horas;
            }

            return a.name.localeCompare(b.name, "es");
          });

        return {
          key: row.key,
          name: row.name,
          horas: Number(toNumber(row.horas).toFixed(2)),
          totalModulos: modules.length,
          modulosDetalle: modules,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    const byMonth = new Map(
      groupedRows.map((row) => [row.key, row])
    );

    const { startMonth, endMonth } = normalizePeriod({
      filtroMes,
      desde,
      hasta,
      groupedRows,
    });

    if (!startMonth || !endMonth) {
      return groupedRows;
    }

    return buildMonthSeries(startMonth, endMonth).map(
      (baseRow) => byMonth.get(baseRow.key) || baseRow
    );
  }, [data, filtroMes, desde, hasta]);

  const teamText =
    Array.isArray(filtroEquipo) && filtroEquipo.length > 0
      ? ` — Equipo: ${filtroEquipo.join(", ")}`
      : "";

  const chartWidth = Math.max(
    900,
    chartData.length * 125
  );

  const barSize =
    chartData.length <= 1
      ? 92
      : chartData.length === 2
        ? 76
        : chartData.length <= 4
          ? 58
          : 44;

  return (
    <div
      className="pgx-card"
      style={{
        gridColumn: "1 / -1",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0 }}>
          Horas por Mes y Módulo{teamText}
        </h3>

        <span
          style={{
            flex: "0 0 auto",
            padding: "5px 10px",
            borderRadius: 999,
            background: "#f1f5f9",
            color: "#334155",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {chartData.length}{" "}
          {chartData.length === 1 ? "mes" : "meses"}
        </span>
      </div>

      {chartData.length === 0 ? (
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
              width: `${chartWidth}px`,
              minWidth: "100%",
              height: 430,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 38,
                  right: 30,
                  left: 10,
                  bottom: 64,
                }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={56}
                  tick={{
                    fontSize: 12,
                    fill: "#475569",
                    fontWeight: 700,
                  }}
                />

                <YAxis
                  width={60}
                  tickFormatter={(value) =>
                    `${toNumber(value).toFixed(0)}`
                  }
                  tick={{
                    fontSize: 12,
                    fill: "#475569",
                    fontWeight: 700,
                  }}
                />

                <Tooltip content={<MesModuloTooltip />} />

                <Bar
                  dataKey="horas"
                  name="Horas"
                  fill={CHART_BLUE}
                  radius={[10, 10, 0, 0]}
                  barSize={barSize}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="horas"
                    position="top"
                    formatter={(value) =>
                      toNumber(value) > 0
                        ? `${toNumber(value).toFixed(1)} h`
                        : ""
                    }
                    style={{
                      fill: "#334155",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />

                  {chartData.map((entry, index) => (
                    <Cell
                      key={`mes-modulo-${entry.key}-${index}`}
                      fill={CHART_BLUE}
                      onClick={() =>
                        onOpenDetail?.(
                          "mes",
                          entry.key,
                          "Mes",
                          entry.name
                        )
                      }
                      style={{
                        cursor:
                          toNumber(entry.horas) > 0
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

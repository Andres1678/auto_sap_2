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

const integerFormat = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeHours = (value) => Math.max(0, safeNumber(value));
const safeInteger = (value) => Math.max(0, Math.trunc(safeNumber(value)));
const formatHours = (value) => `${numberFormat.format(safeHours(value))} h`;

function TeamValidationTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload || {};
  const totalPersonas = safeInteger(row.totalPersonas);
  const registraron = Math.min(safeInteger(row.registraron), totalPersonas);
  const noRegistraron = Math.max(
    safeInteger(row.noRegistraron),
    totalPersonas - registraron
  );
  const porcentaje = totalPersonas > 0
    ? (registraron * 100) / totalPersonas
    : 0;

  return (
    <div className="pgx-team-tooltip">
      <div className="pgx-team-tooltip__title">
        {String(row.equipo || "SIN EQUIPO")}
      </div>

      <div className="pgx-team-tooltip__hours">
        <span>Horas registradas</span>
        <strong>{formatHours(row.horas)}</strong>
      </div>

      <div className="pgx-team-tooltip__divider" />

      <div className="pgx-team-tooltip__row">
        <span>Personas activas en el equipo</span>
        <strong>{integerFormat.format(totalPersonas)}</strong>
      </div>

      <div className="pgx-team-tooltip__row is-success">
        <span>Registraron en el período</span>
        <strong>{integerFormat.format(registraron)}</strong>
      </div>

      <div className="pgx-team-tooltip__row is-danger">
        <span>No registraron en el período</span>
        <strong>{integerFormat.format(noRegistraron)}</strong>
      </div>

      <div className="pgx-team-tooltip__progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }} />
      </div>

      <div className="pgx-team-tooltip__percent">
        Cobertura de registro: {numberFormat.format(porcentaje)}%
      </div>
    </div>
  );
}

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
      .map((row) => {
        const totalPersonas = safeInteger(row?.totalPersonas);
        const registraron = Math.min(
          safeInteger(row?.registraron),
          totalPersonas
        );

        return {
          equipo: String(row?.equipo || "SIN EQUIPO").trim().toUpperCase(),
          horas: safeHours(row?.horas),
          totalPersonas,
          registraron,
          noRegistraron: Math.max(
            safeInteger(row?.noRegistraron),
            totalPersonas - registraron
          ),
          porcentajeRegistro: totalPersonas > 0
            ? +((registraron * 100) / totalPersonas).toFixed(2)
            : 0,
        };
      })
      .filter((row) => row.horas > 0 || row.totalPersonas > 0)
      .sort((a, b) => {
        const diffHoras = b.horas - a.horas;
        if (diffHoras !== 0) return diffHoras;
        return a.equipo.localeCompare(b.equipo);
      });
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

  const chartHeight = Math.max(320, rows.length * 62 + 115);

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
          <span className="pgx-team-chart__hint">
            Pasa el mouse para ver el cumplimiento y haz clic para consultar las personas activas que registraron y las que no.
          </span>
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
                allowDecimals
              />

              <YAxis
                type="category"
                dataKey="equipo"
                width={180}
                interval={0}
                tick={{ fontSize: 12, fontWeight: 700, fill: "#334155" }}
              />

              <Tooltip
                content={<TeamValidationTooltip />}
                cursor={{ fill: "rgba(148, 163, 184, 0.10)" }}
              />

              <Bar
                dataKey="horas"
                name="Horas"
                fill="#DA291C"
                radius={[0, 9, 9, 0]}
                minPointSize={4}
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

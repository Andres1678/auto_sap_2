import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { jfetch } from "../lib/api";
import "./ProyectoCostosGraficas.css";

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value, currency = "COP") => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("es-CO")}`;
  }
};

const formatNumber = (value, digits = 2) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const chartMoneyTick = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
};

const buildQuery = (periodo, filtros = {}) => {
  const params = new URLSearchParams();

  const [anio, mes] = String(periodo || "").split("-");
  if (anio) params.set("anio", anio);
  if (mes) params.set("mes", mes);

  (filtros?.equipos || []).forEach((equipo) => {
    if (equipo) params.append("equipo", equipo);
  });

  (filtros?.modulos || []).forEach((modulo) => {
    if (modulo) params.append("modulo", modulo);
  });

  (filtros?.consultores || []).forEach((consultor) => {
    if (consultor) params.append("consultor", consultor);
  });

  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

const normalizePeriods = (resumen) => {
  const set = new Set();

  (Array.isArray(resumen?.meses) ? resumen.meses : []).forEach((row) => {
    if (row?.periodo) set.add(String(row.periodo));
  });

  return Array.from(set).sort();
};

const chartHeight = (count) => Math.max(320, count * 56);

export default function ProyectoCostosGraficas({
  proyectoId,
  filtros = { equipos: [], modulos: [], consultores: [] },
  moneda = "COP",
  periodosOptions = [],
  defaultOpen = true,
}) {
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState("");
  const [graficas, setGraficas] = useState(null);

  const horasPorPerfilData = Array.isArray(graficas?.horas_por_perfil)
    ? graficas.horas_por_perfil
    : [];

  const costosPorPerfilData = Array.isArray(graficas?.costos_por_perfil)
    ? graficas.costos_por_perfil
    : [];

  const acumuladoHorasPorPerfilData = Array.isArray(
    graficas?.acumulado_horas_por_perfil
  )
    ? graficas.acumulado_horas_por_perfil
    : [];

  const fetchPeriodsFromResumen = async () => {
    if (!proyectoId) return [];

    setLoadingPeriods(true);
    try {
      const res = await jfetch(
        `/proyectos/${proyectoId}/costos/resumen${buildQuery("", filtros)}`
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      return normalizePeriods(data);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error cargando períodos de gráficas",
        text: String(e.message || e),
      });
      return [];
    } finally {
      setLoadingPeriods(false);
    }
  };

  const fetchGraficas = async (periodoToLoad) => {
    if (!proyectoId || !periodoToLoad) return;

    setLoadingCharts(true);
    try {
      const res = await jfetch(
        `/proyectos/${proyectoId}/costos/graficas${buildQuery(periodoToLoad, filtros)}`
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.mensaje || `HTTP ${res.status}`);
      }

      setGraficas(data || null);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error cargando gráficas",
        text: String(e.message || e),
      });
    } finally {
      setLoadingCharts(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!proyectoId) return;

      let nextPeriods = Array.isArray(periodosOptions) ? periodosOptions : [];
      nextPeriods = nextPeriods
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .sort();

      if (nextPeriods.length === 0) {
        nextPeriods = await fetchPeriodsFromResumen();
      }

      if (!mounted) return;

      setPeriodos(nextPeriods);

      const nextPeriodo =
        nextPeriods.includes(periodo) && periodo
          ? periodo
          : nextPeriods[nextPeriods.length - 1] || "";

      setPeriodo(nextPeriodo);

      if (nextPeriodo) {
        await fetchGraficas(nextPeriodo);
      } else {
        setGraficas(null);
      }
    };

    run();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, JSON.stringify(periodosOptions), JSON.stringify(filtros)]);

  useEffect(() => {
    if (!proyectoId || !periodo) return;
    fetchGraficas(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const resumenCards = useMemo(() => {
    const horasEstimadas = horasPorPerfilData.reduce(
      (acc, row) => acc + toNumber(row.estimadas),
      0
    );

    const horasReales = horasPorPerfilData.reduce(
      (acc, row) => acc + toNumber(row.reales),
      0
    );

    const costoEstimado = costosPorPerfilData.reduce(
      (acc, row) => acc + toNumber(row.estimado),
      0
    );

    const costoReal = costosPorPerfilData.reduce(
      (acc, row) => acc + toNumber(row.real),
      0
    );

    return {
      horasEstimadas,
      horasReales,
      costoEstimado,
      costoReal,
    };
  }, [horasPorPerfilData, costosPorPerfilData]);

  if (!proyectoId) return null;

  return (
    <section className="pcg-section">
      <div className="pcg-head">
        <button
          type="button"
          className="pcg-collapse-trigger"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          <div>
            <h3>Gráficas por perfil</h3>
            <p className="pcg-note">
              Comparativo planeado vs real por perfil para el período
              seleccionado.
            </p>
          </div>
          <span className="pcg-collapse-icon">{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <div className="pcg-actions">
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              disabled={loadingPeriods || periodos.length === 0}
            >
              {periodos.length === 0 && <option value="">Sin períodos</option>}
              {periodos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="pcg-btn secondary"
              onClick={() => fetchGraficas(periodo)}
              disabled={!periodo || loadingCharts}
            >
              {loadingCharts ? "Cargando..." : "Recargar"}
            </button>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="pcg-cards">
            <div className="pcg-card">
              <span>Horas estimadas</span>
              <strong>{formatNumber(resumenCards.horasEstimadas)}</strong>
            </div>

            <div className="pcg-card">
              <span>Horas reales</span>
              <strong>{formatNumber(resumenCards.horasReales)}</strong>
            </div>

            <div className="pcg-card">
              <span>Costo estimado</span>
              <strong>{formatMoney(resumenCards.costoEstimado, moneda)}</strong>
            </div>

            <div className="pcg-card">
              <span>Costo real</span>
              <strong>{formatMoney(resumenCards.costoReal, moneda)}</strong>
            </div>
          </div>

          <div className="pcg-grid">
            <div className="pcg-chart-card">
              <h4>Horas estimadas vs reales por perfil</h4>

              {horasPorPerfilData.length === 0 ? (
                <div className="pcg-empty">Sin datos para esta gráfica</div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: chartHeight(horasPorPerfilData.length),
                  }}
                >
                  <ResponsiveContainer>
                    <BarChart
                      data={horasPorPerfilData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="perfil"
                        width={240}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value) => formatNumber(value)}
                      />
                      <Legend />
                      <Bar
                        dataKey="estimadas"
                        name="Horas estimadas"
                        fill="#2563eb"
                      />
                      <Bar
                        dataKey="reales"
                        name="Horas reales"
                        fill="#16a34a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="pcg-chart-card">
              <h4>Costo estimado vs real por perfil</h4>

              {costosPorPerfilData.length === 0 ? (
                <div className="pcg-empty">Sin datos para esta gráfica</div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: chartHeight(costosPorPerfilData.length),
                  }}
                >
                  <ResponsiveContainer>
                    <BarChart
                      data={costosPorPerfilData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={chartMoneyTick}
                      />
                      <YAxis
                        type="category"
                        dataKey="perfil"
                        width={240}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value) => formatMoney(value, moneda)}
                      />
                      <Legend />
                      <Bar
                        dataKey="estimado"
                        name="Costo estimado"
                        fill="#9333ea"
                      />
                      <Bar
                        dataKey="real"
                        name="Costo real"
                        fill="#f59e0b"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="pcg-chart-card pcg-chart-card-full">
            <h4>Acumulado horas estimadas vs reales por perfil</h4>

            {acumuladoHorasPorPerfilData.length === 0 ? (
              <div className="pcg-empty">Sin datos para esta gráfica</div>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: Math.max(
                    380,
                    acumuladoHorasPorPerfilData.length * 48
                  ),
                }}
              >
                <ResponsiveContainer>
                  <LineChart
                    data={acumuladoHorasPorPerfilData}
                    margin={{ top: 10, right: 20, left: 20, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="perfil"
                      tick={{ fontSize: 12 }}
                      angle={-20}
                      textAnchor="end"
                      height={90}
                    />
                    <YAxis />
                    <Tooltip formatter={(value) => formatNumber(value)} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="estimadas"
                      name="Horas estimadas acumuladas"
                      stroke="#2563eb"
                      strokeWidth={3}
                    />
                    <Line
                      type="monotone"
                      dataKey="reales"
                      name="Horas reales acumuladas"
                      stroke="#16a34a"
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
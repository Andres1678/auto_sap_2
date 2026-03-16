import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import "./ModalWinRate.css";

/* ===================== Helpers ===================== */
function normKeyForMatch(v) {
  let s = String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  s = s.replace(/\b0TP\b/g, "OTP").replace(/\b0TE\b/g, "OTE").replace(/\b0TL\b/g, "OTL");
  return s;
}

function displayLabel(v) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const EXCLUDE_SET = new Set(
  [
    "OTP",
    "OTE",
    "OTL",
    "PROSPECCION",
    "REGISTRO",
    "PENDIENTE APROBACION SAP",
    "0TP",
    "0TE",
    "0TL",
    "OT",
  ].map(normKeyForMatch)
);

function isExcludedLabel(raw) {
  const k = normKeyForMatch(raw);
  if (!k) return false;
  if (EXCLUDE_SET.has(k)) return true;

  for (const x of EXCLUDE_SET) {
    if (k.includes(x)) return true;
  }
  return false;
}

function sumPivotRows(rows) {
  return (rows || []).reduce(
    (acc, r) => {
      acc.count += r.count || 0;
      return acc;
    },
    { count: 0 }
  );
}

function uniqueOptions(values) {
  const map = new Map();

  (values || []).forEach((v) => {
    const raw = String(v ?? "").replace(/\u00A0/g, " ").trim();
    if (!raw) return;

    const key = normKeyForMatch(raw);
    if (!map.has(key)) {
      map.set(key, {
        value: raw,
        label: displayLabel(raw),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "es", { sensitivity: "base" })
  );
}

function matchMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;
  const current = normKeyForMatch(value);
  return selected.some((opt) => normKeyForMatch(opt?.value) === current);
}

/* ===================== Año / Mes robustos ===================== */
const MONTH_NAMES = {
  "01": "ENERO",
  "02": "FEBRERO",
  "03": "MARZO",
  "04": "ABRIL",
  "05": "MAYO",
  "06": "JUNIO",
  "07": "JULIO",
  "08": "AGOSTO",
  "09": "SEPTIEMBRE",
  "10": "OCTUBRE",
  "11": "NOVIEMBRE",
  "12": "DICIEMBRE",
};

const MONTH_NAME_TO_NUM = {
  ENERO: "01",
  FEBRERO: "02",
  MARZO: "03",
  ABRIL: "04",
  MAYO: "05",
  JUNIO: "06",
  JULIO: "07",
  AGOSTO: "08",
  SEPTIEMBRE: "09",
  SETIEMBRE: "09",
  OCTUBRE: "10",
  NOVIEMBRE: "11",
  DICIEMBRE: "12",
};

function extractYearFromRow(row) {
  if (row?.anio !== null && row?.anio !== undefined && String(row.anio).trim() !== "") {
    return String(row.anio).trim();
  }

  const raw = String(row?.fecha_creacion ?? "").trim();
  const m = raw.match(/^(\d{4})[-/]/);
  if (m) return m[1];

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return String(d.getFullYear());

  return "";
}

function normalizeMonthNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 12) return String(n).padStart(2, "0");
  }

  const normalized = normKeyForMatch(s);
  if (MONTH_NAME_TO_NUM[normalized]) return MONTH_NAME_TO_NUM[normalized];

  return "";
}

function getMonthAliasesFromValue(value) {
  const aliases = new Set();
  const raw = String(value ?? "").trim();
  if (!raw) return aliases;

  aliases.add(normKeyForMatch(raw));

  const num = normalizeMonthNumber(raw);
  if (num) {
    aliases.add(num);
    aliases.add(normKeyForMatch(MONTH_NAMES[num]));
  }

  return aliases;
}

function getMonthAliasesFromRow(row) {
  const aliases = new Set();

  if (row?.mes !== null && row?.mes !== undefined && String(row.mes).trim() !== "") {
    getMonthAliasesFromValue(row.mes).forEach((x) => aliases.add(x));
  }

  const rawFecha = String(row?.fecha_creacion ?? "").trim();
  const d = new Date(rawFecha);
  if (!Number.isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    aliases.add(mm);
    aliases.add(normKeyForMatch(MONTH_NAMES[mm]));
  } else {
    const m = rawFecha.match(/^\d{4}-(\d{2})-\d{2}$/);
    if (m?.[1]) {
      aliases.add(m[1]);
      aliases.add(normKeyForMatch(MONTH_NAMES[m[1]]));
    }
  }

  return aliases;
}

function matchMonthMulti(row, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const rowAliases = getMonthAliasesFromRow(row);
  if (!rowAliases.size) return false;

  return selected.some((opt) => {
    const selectedAliases = getMonthAliasesFromValue(opt?.value);
    for (const a of selectedAliases) {
      if (rowAliases.has(a)) return true;
    }
    return false;
  });
}

/* ===================== Configuración del indicador ===================== */
const WIN_RATE_GANADAS = new Set(["GANADA"].map(normKeyForMatch));
const WIN_RATE_PERDIDAS = new Set(["PERDIDA"].map(normKeyForMatch));
const WIN_RATE_EN_PROCESO = new Set(["ENTREGA COMERCIAL"].map(normKeyForMatch));

function isWinRateEstado(estadoN) {
  return (
    WIN_RATE_GANADAS.has(estadoN) ||
    WIN_RATE_PERDIDAS.has(estadoN) ||
    WIN_RATE_EN_PROCESO.has(estadoN)
  );
}

function bucketByEstado(estadoN) {
  if (WIN_RATE_GANADAS.has(estadoN)) return "ganada";
  if (WIN_RATE_PERDIDAS.has(estadoN)) return "perdida";
  if (WIN_RATE_EN_PROCESO.has(estadoN)) return "proceso";
  return "otro";
}

function buildWinRateSummary(rows) {
  const cleanRows = (Array.isArray(rows) ? rows : []).filter((r) => {
    const estadoRaw = r?.estado_oferta ?? "";
    const estadoN = normKeyForMatch(estadoRaw);

    return !isExcludedLabel(estadoRaw) && isWinRateEstado(estadoN);
  });

  let ganadas = 0;
  let perdidas = 0;
  let enProceso = 0;

  const map = new Map();

  cleanRows.forEach((r) => {
    const rawEstado = r?.estado_oferta ?? "";
    const estadoN = normKeyForMatch(rawEstado);
    const bucket = bucketByEstado(estadoN);

    if (bucket === "ganada") ganadas += 1;
    if (bucket === "perdida") perdidas += 1;
    if (bucket === "proceso") enProceso += 1;

    const prev = map.get(estadoN) || {
      key: estadoN,
      label: displayLabel(rawEstado),
      count: 0,
      bucket,
    };

    prev.count += 1;
    map.set(estadoN, prev);
  });

  const rowsBreakdown = Array.from(map.values()).sort((a, b) => {
    return (
      b.count - a.count ||
      a.label.localeCompare(b.label, "es", { sensitivity: "base" })
    );
  });

  const totalsBreakdown = sumPivotRows(rowsBreakdown);
  const total = ganadas + perdidas + enProceso;
  const indicador = total ? (ganadas / total) * 100 : 0;

  return {
    ganadas,
    perdidas,
    enProceso,
    total,
    indicador,
    rowsBreakdown,
    totalsBreakdown,
    recordsUsed: cleanRows.length,
  };
}

function buildScopeLabel(filters) {
  const chunks = [];

  if (filters.gerenciaComercial?.length) {
    chunks.push(`Gerencia: ${filters.gerenciaComercial.map((x) => x.label).join(", ")}`);
  } else if (filters.direccionComercial?.length) {
    chunks.push(`Dirección: ${filters.direccionComercial.map((x) => x.label).join(", ")}`);
  }

  if (filters.cliente?.length) {
    chunks.push(`Cliente: ${filters.cliente.map((x) => x.label).join(", ")}`);
  }

  if (filters.comercial?.length) {
    chunks.push(`Comercial: ${filters.comercial.map((x) => x.label).join(", ")}`);
  }

  const periodo = [];
  if (filters.anios?.length) periodo.push(filters.anios.map((x) => x.label).join(", "));
  if (filters.meses?.length) periodo.push(filters.meses.map((x) => x.label).join(", "));
  if (periodo.length) chunks.push(`Periodo: ${periodo.join(" / ")}`);

  return chunks.length ? chunks.join(" · ") : "Segmento filtrado";
}

export default function ModalWinRate({
  isOpen,
  onClose,
  rows = [],
  options = {},
  selectCommon = {},
  baseTitle = "Base actual",
}) {
  const [filters, setFilters] = useState({
    anios: [],
    meses: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    comercial: [],
  });

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  const comercialOptions = useMemo(
    () => uniqueOptions(rows.map((r) => r?.comercial_asignado)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      return (
        matchMulti(extractYearFromRow(row), filters.anios) &&
        matchMonthMulti(row, filters.meses) &&
        matchMulti(row?.direccion_comercial, filters.direccionComercial) &&
        matchMulti(row?.gerencia_comercial, filters.gerenciaComercial) &&
        matchMulti(row?.nombre_cliente, filters.cliente) &&
        matchMulti(row?.comercial_asignado, filters.comercial)
      );
    });
  }, [rows, filters]);

  const baseSummary = useMemo(() => buildWinRateSummary(rows), [rows]);
  const filteredSummary = useMemo(() => buildWinRateSummary(filteredRows), [filteredRows]);
  const scopeLabel = useMemo(() => buildScopeLabel(filters), [filters]);

  const clearFilters = () => {
    setFilters({
      anios: [],
      meses: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      comercial: [],
    });
  };

  if (!isOpen) return null;

  return (
    <div className="wr-modal-overlay" onClick={onClose}>
      <div className="wr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wr-modal-header">
          <div>
            <h3 className="wr-modal-title">Indicador Win Rate</h3>
            <div className="wr-modal-subtitle">
              El modal respeta primero los filtros del dashboard y luego estos filtros internos.
            </div>
          </div>

          <div className="wr-header-actions">
            <button
              type="button"
              className="wr-btn wr-btn-light"
              onClick={clearFilters}
            >
              Limpiar filtros internos
            </button>

            <button
              type="button"
              className="wr-btn wr-btn-close"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="wr-formula-box">
          <strong>Fórmula actual:</strong> GANADA / (GANADA + PERDIDA + ENTREGA COMERCIAL)
        </div>

        <div className="wr-filters-grid">
          <div className="wr-filter-item">
            <label>Año</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={options.anios || []}
              value={filters.anios}
              onChange={(v) => setFilters((p) => ({ ...p, anios: v || [] }))}
            />
          </div>

          <div className="wr-filter-item">
            <label>Mes</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={options.meses || []}
              value={filters.meses}
              onChange={(v) => setFilters((p) => ({ ...p, meses: v || [] }))}
            />
          </div>

          <div className="wr-filter-item">
            <label>Dirección Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.direccionComercial || []}
              value={filters.direccionComercial}
              onChange={(v) => setFilters((p) => ({ ...p, direccionComercial: v || [] }))}
            />
          </div>

          <div className="wr-filter-item">
            <label>Gerencia Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={options.gerenciaComercial || []}
              value={filters.gerenciaComercial}
              onChange={(v) => setFilters((p) => ({ ...p, gerenciaComercial: v || [] }))}
            />
          </div>

          <div className="wr-filter-item">
            <label>Nombre Cliente</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={options.cliente || []}
              value={filters.cliente}
              onChange={(v) => setFilters((p) => ({ ...p, cliente: v || [] }))}
            />
          </div>

          <div className="wr-filter-item">
            <label>Comercial Asignado</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={comercialOptions}
              value={filters.comercial}
              onChange={(v) => setFilters((p) => ({ ...p, comercial: v || [] }))}
            />
          </div>
        </div>

        <div className="wr-content-grid">
          <div className="wr-card">
            <div className="wr-card-title">Resumen comparativo</div>

            <div className="wr-meta-line">
              <span>
                <strong>Base izquierda:</strong> {baseSummary.recordsUsed} registros evaluados
              </span>
              <span>
                <strong>Base derecha:</strong> {filteredSummary.recordsUsed} registros evaluados
              </span>
            </div>

            <div className="wr-table-scroll">
              <table className="wr-summary-table">
                <thead>
                  <tr>
                    <th>WIN RATE</th>
                    <th>{baseTitle}</th>
                    <th>{scopeLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="wr-summary-row wr-summary-row-ganada">
                    <td>TOTAL GANADAS</td>
                    <td>{baseSummary.ganadas}</td>
                    <td>{filteredSummary.ganadas}</td>
                  </tr>

                  <tr className="wr-summary-row wr-summary-row-perdida">
                    <td>TOTAL OFERTAS PERDIDAS</td>
                    <td>{baseSummary.perdidas}</td>
                    <td>{filteredSummary.perdidas}</td>
                  </tr>

                  <tr className="wr-summary-row wr-summary-row-proceso">
                    <td>TOTAL OFERTAS EN PROCESO</td>
                    <td>{baseSummary.enProceso}</td>
                    <td>{filteredSummary.enProceso}</td>
                  </tr>

                  <tr className="is-total">
                    <td>TOTAL</td>
                    <td>{baseSummary.total}</td>
                    <td>{filteredSummary.total}</td>
                  </tr>

                  <tr className="is-indicator">
                    <td>Indicador Win Rate</td>
                    <td>{baseSummary.indicador.toFixed(2)}%</td>
                    <td>{filteredSummary.indicador.toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="wr-card">
            <div className="wr-card-title">Estado Oferta del segmento</div>

            <div className="wr-table-scroll">
              <table className="wr-breakdown-table">
                <thead>
                  <tr>
                    <th>ESTADO_OFERTA</th>
                    <th>Cantidad</th>
                    <th>%Part</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummary.rowsBreakdown.length ? (
                    <>
                      {filteredSummary.rowsBreakdown.map((it) => {
                        const pct = filteredSummary.totalsBreakdown.count
                          ? ((it.count / filteredSummary.totalsBreakdown.count) * 100).toFixed(2)
                          : "0.00";

                        return (
                          <tr
                            key={it.key}
                            className={[
                              it.bucket === "ganada" ? "row-ganada" : "",
                              it.bucket === "proceso" ? "row-proceso" : "",
                              it.bucket === "perdida" ? "row-perdida" : "",
                            ]
                              .join(" ")
                              .trim()}
                          >
                            <td>{it.label}</td>
                            <td>{it.count}</td>
                            <td>{pct}%</td>
                          </tr>
                        );
                      })}

                      <tr className="table-total">
                        <td>Total</td>
                        <td>{filteredSummary.totalsBreakdown.count}</td>
                        <td>
                          {filteredSummary.totalsBreakdown.count ? "100.00%" : "0.00%"}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={3} className="wr-empty-cell">
                        No hay registros para calcular el Win Rate con los filtros actuales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="wr-legend">
              <span className="wr-tag wr-tag-ganada">Ganada</span>
              <span className="wr-tag wr-tag-proceso">En proceso</span>
              <span className="wr-tag wr-tag-perdida">Pérdida</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
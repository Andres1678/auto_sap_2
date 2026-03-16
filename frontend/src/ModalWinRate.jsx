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

const nfMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function toNumberSmart(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/COP/gi, "")
    .replace(/[$€£]/g, "")
    .replace(/%/g, "");

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("");
    if (decimalSep === ",") s = s.replace(",", ".");
  } else if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1) {
      const after = s.slice(lastComma + 1);
      const before = s.slice(0, lastComma).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(",", "");
      else s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (dotCount > 0 && commaCount === 0) {
    if (dotCount === 1) {
      const after = s.slice(lastDot + 1);
      const before = s.slice(0, lastDot).replace(/^[+-]/, "");
      if (after.length === 3 && before.length <= 3) s = s.replace(".", "");
    } else {
      const parts = s.split(".");
      const last = parts[parts.length - 1];
      const mid = parts.slice(1, -1);
      const midAll3 = mid.every((p) => p.length === 3);
      const firstOk = parts[0].replace(/^[+-]/, "").length <= 3;
      const looksLikeGrouped = midAll3 && firstOk;

      if (looksLikeGrouped && last.length !== 3) {
        const intPart = parts.slice(0, -1).join("");
        s = intPart + "." + last;
      } else {
        s = s.replace(/\./g, "");
      }
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n) {
  return nfMoney.format(n || 0);
}

function readMoney(row, keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return toNumberSmart(v);
  }
  return 0;
}

function sumPivotRows(rows) {
  return (rows || []).reduce(
    (acc, r) => {
      acc.count += r.count || 0;
      acc.otc += r.otc || 0;
      acc.mrc += r.mrc || 0;
      return acc;
    },
    { count: 0, otc: 0, mrc: 0 }
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

function getRowYear(row) {
  if (row?.anio) return String(row.anio).trim();

  const raw = String(row?.fecha_creacion ?? "").trim();
  const m = raw.match(/^(\d{4})[-/]/);
  if (m) return m[1];

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return String(d.getFullYear());

  return "";
}

function getRowMonth(row) {
  if (row?.mes) return String(row.mes).trim();

  const raw = String(row?.fecha_creacion ?? "").trim();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return String(d.getMonth() + 1).padStart(2, "0");

  return "";
}

/* ===================== Configuración del indicador ===================== */
/* Ajusta aquí si luego quieres incluir más estados */
const WIN_RATE_GANADAS = new Set(["GANADA"].map(normKeyForMatch));
const WIN_RATE_PERDIDAS = new Set(["PERDIDA"].map(normKeyForMatch));
const WIN_RATE_EN_PROCESO = new Set(["ENTREGA COMERCIAL"].map(normKeyForMatch));

function bucketByEstado(estadoN) {
  if (WIN_RATE_GANADAS.has(estadoN)) return "ganada";
  if (WIN_RATE_PERDIDAS.has(estadoN)) return "perdida";
  if (WIN_RATE_EN_PROCESO.has(estadoN)) return "proceso";
  return "otro";
}

function buildWinRateSummary(rows) {
  const cleanRows = (Array.isArray(rows) ? rows : []).filter(
    (r) => !isExcludedLabel(r?.estado_oferta ?? "")
  );

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
      otc: 0,
      mrc: 0,
      bucket,
    };

    prev.count += 1;
    prev.otc += readMoney(r, ["otc", "otr", "OTC", "OTR"]);
    prev.mrc += readMoney(r, ["mrc", "MRC"]);

    map.set(estadoN, prev);
  });

  const rowsBreakdown = Array.from(map.values()).sort((a, b) => b.count - a.count);
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
  };
}

function buildScopeLabel(filters) {
  const chunks = [];

  if (filters.gerenciaComercial?.length) {
    chunks.push(filters.gerenciaComercial.map((x) => x.label).join(", "));
  } else if (filters.direccionComercial?.length) {
    chunks.push(filters.direccionComercial.map((x) => x.label).join(", "));
  }

  if (filters.cliente?.length) {
    chunks.push(filters.cliente.map((x) => x.label).join(", "));
  }

  if (filters.comercial?.length) {
    chunks.push(filters.comercial.map((x) => x.label).join(", "));
  }

  const periodo = [];
  if (filters.anios?.length) periodo.push(filters.anios.map((x) => x.label).join(", "));
  if (filters.meses?.length) periodo.push(filters.meses.map((x) => x.label).join(", "));
  if (periodo.length) chunks.push(periodo.join(" / "));

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

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = prev;
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
        matchMulti(getRowYear(row), filters.anios) &&
        matchMulti(getRowMonth(row), filters.meses) &&
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
            <button className="wr-btn wr-btn-light" onClick={clearFilters}>
              Limpiar filtros internos
            </button>
            <button className="wr-btn wr-btn-close" onClick={onClose}>
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
                  <tr>
                    <td>TOTAL GANADAS</td>
                    <td>{baseSummary.ganadas}</td>
                    <td>{filteredSummary.ganadas}</td>
                  </tr>
                  <tr>
                    <td>TOTAL OFERTAS PERDIDAS</td>
                    <td>{baseSummary.perdidas}</td>
                    <td>{filteredSummary.perdidas}</td>
                  </tr>
                  <tr>
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
                    <th>MRC</th>
                    <th>OTC</th>
                  </tr>
                </thead>
                <tbody>
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
                        <td>{fmtMoney(it.mrc)}</td>
                        <td>{fmtMoney(it.otc)}</td>
                      </tr>
                    );
                  })}

                  <tr className="table-total">
                    <td>Total</td>
                    <td>{filteredSummary.totalsBreakdown.count}</td>
                    <td>{filteredSummary.totalsBreakdown.count ? "100.00%" : "0.00%"}</td>
                    <td>{fmtMoney(filteredSummary.totalsBreakdown.mrc)}</td>
                    <td>{fmtMoney(filteredSummary.totalsBreakdown.otc)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="wr-legend">
              <span className="wr-tag wr-tag-ganada">Ganada</span>
              <span className="wr-tag wr-tag-proceso">En proceso</span>
              <span className="wr-tag wr-tag-perdida">Perdida</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
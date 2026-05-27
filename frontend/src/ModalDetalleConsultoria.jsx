import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import "./ModalDetalleConsultoria.css";

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

function displayText(value) {
  const s = String(value ?? "").replace(/\u00A0/g, " ").trim();
  return s || "-";
}

function matchMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = normKeyForMatch(value);

  return selected.some((opt) => normKeyForMatch(opt?.value) === current);
}

function toNumberSmart(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/COP/gi, "")
    .replace(/USD/gi, "")
    .replace(/[$€£]/g, "")
    .replace(/%/g, "");

  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
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
      s = s.replace(/\./g, "");
    }
  }

  s = s.replace(/[^\d.+-eE]/g, "");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getMoneyValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return toNumberSmart(value);
    }
  }

  return null;
}

function formatMoney(row, keys) {
  const n = getMoneyValue(row, keys);
  if (n === null) return "-";

  const currency = String(row?.tipo_moneda ?? "COP").trim().toUpperCase() || "COP";

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateShort(value) {
  if (!value) return "-";

  const raw = String(value).trim();

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}/${mm}/${yyyy}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function formatDateLong(value) {
  if (!value) return "-";

  const raw = String(value).trim();

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  let d;

  if (iso) {
    const [, yyyy, mm, dd] = iso;
    d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } else {
    d = new Date(raw);
  }

  if (Number.isNaN(d.getTime())) return raw;

  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/* ===================== Año / Mes ===================== */
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
  const iso = rawFecha.match(/^\d{4}-(\d{2})-\d{2}/);

  if (iso?.[1]) {
    aliases.add(iso[1]);
    aliases.add(normKeyForMatch(MONTH_NAMES[iso[1]]));
    return aliases;
  }

  const d = new Date(rawFecha);

  if (!Number.isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    aliases.add(mm);
    aliases.add(normKeyForMatch(MONTH_NAMES[mm]));
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

function normalizeDateKey(value) {
  if (!value) return "";

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) return raw;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function matchDateMulti(value, selected) {
  if (!Array.isArray(selected) || !selected.length) return true;

  const current = normalizeDateKey(value);

  return selected.some((opt) => normalizeDateKey(opt?.value) === current);
}

/* ===================== Componente ===================== */
export default function ModalDetalleConsultoria({
  isOpen,
  onClose,
  rows = [],
  options = {},
  selectCommon = {},
}) {
  const [filters, setFilters] = useState({
    anios: [],
    meses: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    fechaActaCierreOT: [],
    fechaCierreOportunidad: [],
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

  const filteredRows = useMemo(() => {
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      return (
        matchMulti(extractYearFromRow(row), filters.anios) &&
        matchMonthMulti(row, filters.meses) &&
        matchMulti(row?.direccion_comercial, filters.direccionComercial) &&
        matchMulti(row?.gerencia_comercial, filters.gerenciaComercial) &&
        matchMulti(row?.nombre_cliente, filters.cliente) &&
        matchMulti(row?.estado_oferta, filters.estadoOferta) &&
        matchMulti(row?.resultado_oferta, filters.resultadoOferta) &&
        matchDateMulti(row?.fecha_acta_cierre_ot, filters.fechaActaCierreOT) &&
        matchDateMulti(row?.fecha_cierre_oportunidad, filters.fechaCierreOportunidad)
      );
    });
  }, [rows, filters]);

  const clearFilters = () => {
    setFilters({
      anios: [],
      meses: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      estadoOferta: [],
      resultadoOferta: [],
      fechaActaCierreOT: [],
      fechaCierreOportunidad: [],
    });
  };

  if (!isOpen) return null;

  return (
    <div className="dc-modal-overlay" onClick={onClose}>
      <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="dc-modal-header">
          <div>
            <h3 className="dc-modal-title">Detalle Consultoría</h3>
            <p className="dc-modal-subtitle">
              Consulta detallada de oportunidades comerciales. Primero respeta los filtros del dashboard y luego los filtros internos de este modal.
            </p>
          </div>

          <div className="dc-header-actions">
            <button type="button" className="dc-btn dc-btn-light" onClick={clearFilters}>
              Borrar todas las segmentaciones
            </button>

            <button type="button" className="dc-btn dc-btn-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        <div className="dc-body">
          <section className="dc-table-panel">
            <div className="dc-table-meta">
              <strong>{filteredRows.length}</strong> registros visibles de <strong>{rows.length}</strong>
            </div>

            <div className="dc-table-scroll">
              <table className="dc-table">
                <colgroup>
                  <col className="dc-col-cliente" />
                  <col className="dc-col-servicio" />
                  <col className="dc-col-fecha" />
                  <col className="dc-col-estado" />
                  <col className="dc-col-resultado" />
                  <col className="dc-col-moneda" />
                  <col className="dc-col-money" />
                  <col className="dc-col-money" />
                  <col className="dc-col-duracion" />
                  <col className="dc-col-cierre" />
                </colgroup>

                <thead>
                  <tr>
                    <th>NOMBRE CLIENTE</th>
                    <th>SERVICIO</th>
                    <th>Fecha</th>
                    <th>Estado oferta</th>
                    <th>RESULTADO_OFERTA_GLOBAL</th>
                    <th>TIPO DE MONEDA</th>
                    <th>OTC</th>
                    <th>MRC</th>
                    <th>DURACION</th>
                    <th>FECHA DE CIERRE OPORTUNIDAD</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length ? (
                    filteredRows.map((row, index) => (
                      <tr key={row.id ?? index}>
                        <td title={displayText(row.nombre_cliente)}>{displayText(row.nombre_cliente)}</td>
                        <td className="dc-wrap" title={displayText(row.servicio)}>
                          {displayText(row.servicio)}
                        </td>
                        <td>{formatDateShort(row.fecha_creacion)}</td>
                        <td>{displayText(row.estado_oferta)}</td>
                        <td className="dc-wrap">{displayText(row.resultado_oferta)}</td>
                        <td>{displayText(row.tipo_moneda)}</td>
                        <td className="dc-money">{formatMoney(row, ["otc", "otr", "OTC", "OTR"])}</td>
                        <td className="dc-money">{formatMoney(row, ["mrc", "MRC"])}</td>
                        <td>{displayText(row.duracion)}</td>
                        <td>{formatDateLong(row.fecha_cierre_oportunidad)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="dc-empty">
                        No hay registros para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="dc-filters">
            <div className="dc-logo-circle">Claro</div>

            <div className="dc-filter-item">
              <label>Año, Mes</label>

              <div className="dc-two-col">
                <Select
                  {...selectCommon}
                  placeholder="Año"
                  options={options.anios || []}
                  value={filters.anios}
                  onChange={(v) => setFilters((p) => ({ ...p, anios: v || [] }))}
                />

                <Select
                  {...selectCommon}
                  placeholder="Mes"
                  options={options.meses || []}
                  value={filters.meses}
                  onChange={(v) => setFilters((p) => ({ ...p, meses: v || [] }))}
                />
              </div>
            </div>

            <div className="dc-filter-item">
              <label>Dirección Comercial</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.direccionComercial || []}
                value={filters.direccionComercial}
                onChange={(v) => setFilters((p) => ({ ...p, direccionComercial: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>Gerencia Comercial</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.gerenciaComercial || []}
                value={filters.gerenciaComercial}
                onChange={(v) => setFilters((p) => ({ ...p, gerenciaComercial: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>Nombre Cliente</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.cliente || []}
                value={filters.cliente}
                onChange={(v) => setFilters((p) => ({ ...p, cliente: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>ESTADO_OFERTA_GLOBAL</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.estadoOferta || []}
                value={filters.estadoOferta}
                onChange={(v) => setFilters((p) => ({ ...p, estadoOferta: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>RESULTADO_OFERTA_GLOBAL</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.resultadoOferta || []}
                value={filters.resultadoOferta}
                onChange={(v) => setFilters((p) => ({ ...p, resultadoOferta: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>FECHA ACTA DE CIERRE Y/O OT</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.fechaActaCierreOT || []}
                value={filters.fechaActaCierreOT}
                onChange={(v) => setFilters((p) => ({ ...p, fechaActaCierreOT: v || [] }))}
              />
            </div>

            <div className="dc-filter-item">
              <label>FECHA CIERRE OPORTUNIDAD</label>
              <Select
                {...selectCommon}
                placeholder="Todas"
                options={options.fechaCierreOportunidad || []}
                value={filters.fechaCierreOportunidad}
                onChange={(v) =>
                  setFilters((p) => ({ ...p, fechaCierreOportunidad: v || [] }))
                }
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
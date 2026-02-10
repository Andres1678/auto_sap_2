import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Select, { components } from "react-select";
import GraficoCantidadGanadas from "./GraficoCantidadGanadas";
import GraficoActivasCerradas from "./GraficoActivasCerradas";
import ResumenCalificacion from "./ResumenCalificacion";
import "./DashboardOportunidades.css";
import { jfetch } from "./lib/api";

const rsStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 10,
    borderColor: state.isFocused ? "#cbd5e1" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(148,163,184,.25)" : "none",
    ":hover": { borderColor: "#cbd5e1" },
    fontSize: 13,
  }),
  valueContainer: (base) => ({ ...base, padding: "0 10px" }),
  multiValue: (base) => ({ ...base, borderRadius: 999 }),
  multiValueLabel: (base) => ({ ...base, fontWeight: 800, fontSize: 12 }),
  placeholder: (base) => ({ ...base, color: "#64748b", fontWeight: 700 }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menu: (base) => ({ ...base, zIndex: 9999 }),
  option: (base) => ({ ...base, display: "flex", alignItems: "center", gap: 10 }),
};

function normKeyForMatch(v) {
  let s = String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  s = s
  .replace(/\b0TP\b/g, "OTP")
  .replace(/\b0TE\b/g, "OTE")
  .replace(/\b0TL\b/g, "OTL");

  return s;
}

const EXCLUDE_LIST = [
  "OTP",
  "OTE",
  "OTL",
  "PROSPECCION",
  "REGISTRO",
  "PENDIENTE APROBACION SAP",
  "0TP",
  "0TE",
  "0TL",
];

function isExcludedLabel(raw) {
  const k = normKeyForMatch(raw);
  if (!k) return false;
  for (const x of EXCLUDE_LIST) {
    if (k === x) return true;
    if (k.includes(x)) return true;
  }
  return false;
}

const ESTADOS_ACTIVOS_N = new Set([
  "EN PROCESO",
  "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
  "EN ELABORACION",
  "ENTREGA COMERCIAL",
].map(normKeyForMatch));

const ESTADOS_CERRADOS_N = new Set([
  "GANADA",
  "PERDIDA",
  "DECLINADA",
  "SUSPENDIDA",
  "PERDIDA - SIN FEEDBACK",
  "RFI PRESENTADO",
  "RFP PRESENTADO",
].map(normKeyForMatch));

function toOptions(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => ({ value: v, label: String(v) }));
}

function valuesOf(sel) {
  return Array.isArray(sel) ? sel.map((o) => o.value) : [];
}

function toQuery(f) {
  const p = new URLSearchParams();
  const add = (k, arr) => (arr || []).forEach((v) => p.append(`${k}[]`, v));

  add("anio", valuesOf(f.anios));
  add("mes", valuesOf(f.meses));
  add("tipo", valuesOf(f.tipos));

  add("direccion_comercial", valuesOf(f.direccionComercial));
  add("gerencia_comercial", valuesOf(f.gerenciaComercial));
  add("nombre_cliente", valuesOf(f.cliente));

  add("estado_oferta", valuesOf(f.estadoOferta));
  add("resultado_oferta", valuesOf(f.resultadoOferta));

  add("fecha_acta_cierre_ot", valuesOf(f.fechaActaCierreOT));
  add("fecha_cierre_oportunidad", valuesOf(f.fechaCierreOportunidad));

  add("estado_ot", valuesOf(f.estadoOT));
  add("ultimo_mes", valuesOf(f.ultimoMes));
  add("calificacion_oportunidad", valuesOf(f.calificacion));

  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

const portalTarget = typeof document !== "undefined" ? document.body : null;

function CheckboxOption(props) {
  const selected = props.isSelected;
  const disabled = props.isDisabled;

  return (
    <components.Option {...props}>
      <span className={`rs-check ${selected ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}>
        {selected ? "✓" : ""}
      </span>
      <span className="rs-label">{props.label}</span>
    </components.Option>
  );
}

const nfMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

function toNumberSmart(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s.replace(/\s/g, "").replace(/[$€£]/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  if (hasComma && hasDot) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "");
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, "") + "." + parts[1];
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (!hasComma && hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0].replace(/,/g, "") + "." + parts[1];
    } else {
      s = s.replace(/\./g, "");
    }
  }

  s = s.replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n) {
  return nfMoney.format(n || 0);
}

function buildPivot(rows, field, { skipBlank = true, sumFields = ["otc", "mrc"] } = {}) {
  const m = new Map();

  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const raw = String(r?.[field] ?? "").replace(/\u00A0/g, " ").trim();
    if (skipBlank && !raw) return;

    const key = normKeyForMatch(raw);
    if (!key) return;

    const prev =
      m.get(key) ||
      {
        label: key,       
        count: 0,
        otc: 0,
        mrc: 0,
      };

    prev.count += 1;

    // sumas
    if (sumFields.includes("otc")) prev.otc += toNumberSmart(r?.otc);
    if (sumFields.includes("mrc")) prev.mrc += toNumberSmart(r?.mrc);

    m.set(key, prev);
  });

  const pivotRows = Array.from(m.values()).sort((a, b) => b.count - a.count);
  const total = pivotRows.reduce((s, x) => s + x.count, 0);
  const totalOtc = pivotRows.reduce((s, x) => s + (x.otc || 0), 0);
  const totalMrc = pivotRows.reduce((s, x) => s + (x.mrc || 0), 0);

  return { rows: pivotRows, total, totalOtc, totalMrc };
}


export default function DashboardOportunidades() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const [filtros, setFiltros] = useState({
    anios: [],
    meses: [],
    tipos: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    fechaActaCierreOT: [],
    fechaCierreOportunidad: [],
    estadoOT: [],
    ultimoMes: [],
    calificacion: [],
  });

  const [opciones, setOpciones] = useState({
    anios: [],
    meses: [],
    tipos: [],
    direccionComercial: [],
    gerenciaComercial: [],
    cliente: [],
    estadoOferta: [],
    resultadoOferta: [],
    fechaActaCierreOT: [],
    fechaCierreOportunidad: [],
    estadoOT: [],
    ultimoMes: [],
    calificacion: [],
  });

  const filtrosDebounced = useDebouncedValue(filtros, 400);
  const dataFiltrada = useMemo(() => {
    return (Array.isArray(data) ? data : []).filter((op) => {
      const e = op?.estado_oferta ?? "";
      if (isExcludedLabel(e)) return false;
      return true;
    });
  }, [data]);


  const fetchFilters = async (current) => {
    const res = await jfetch(`/oportunidades/filters${toQuery(current)}`);
    if (!res.ok) throw new Error("filters");
    const json = await res.json();

    setOpciones({
      anios: toOptions(json.anios),
      meses: toOptions(json.meses),
      tipos: toOptions(json.tipos),
      direccionComercial: toOptions(json.direccion_comercial),
      gerenciaComercial: toOptions(json.gerencia_comercial),
      cliente: toOptions(json.nombre_cliente),
      estadoOferta: toOptions(json.estado_oferta),
      resultadoOferta: toOptions(json.resultado_oferta),
      fechaActaCierreOT: toOptions(json.fecha_acta_cierre_ot),
      fechaCierreOportunidad: toOptions(json.fecha_cierre_oportunidad),
      estadoOT: toOptions(json.estado_ot),
      ultimoMes: toOptions(json.ultimo_mes),
      calificacion: toOptions(json.calificacion_oportunidad),
    });
  };

  const fetchData = async (current) => {
    setLoading(true);
    try {
      const res = await jfetch(`/oportunidades${toQuery(current)}`);
      if (!res.ok) throw new Error("data");
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (e) {
      Swal.fire("Error", "No se pudo consultar oportunidades", "error");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchFilters(filtros);
        await fetchData(filtros);
      } catch (e) {
        Swal.fire("Error", "No se pudo inicializar", "error");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await fetchFilters(filtrosDebounced);
        await fetchData(filtrosDebounced);
      } catch (e) {}
    })();
  }, [filtrosDebounced]);

  
  const kpis = useMemo(() => {
    const base = Array.isArray(data) ? data : [];

    const total = base.length;
    let activas = 0;
    let cerradas = 0;
    let ganadas = 0;

    base.forEach((op) => {
      const estadoN = normKeyForMatch(op?.estado_oferta ?? "");
      if (ESTADOS_ACTIVOS_N.has(estadoN)) activas++;
      if (ESTADOS_CERRADOS_N.has(estadoN)) cerradas++;
      if (estadoN === "GANADA") ganadas++;
    });

    return {
      total,
      activas,
      cerradas,
      ganadas,
      porcentajeGanadas: total ? (ganadas / total) * 100 : 0,
    };
  }, [dataFiltrada]);

  const resumenEstado = useMemo(
    () => buildPivot(dataFiltrada, "estado_oferta"),
    [dataFiltrada]
  );

  const resumenResultado = useMemo(
    () => buildPivot(dataFiltrada, "resultado_oferta"),
    [dataFiltrada]
  );

  const limpiar = () => {
    setFiltros({
      anios: [],
      meses: [],
      tipos: [],
      direccionComercial: [],
      gerenciaComercial: [],
      cliente: [],
      estadoOferta: [],
      resultadoOferta: [],
      fechaActaCierreOT: [],
      fechaCierreOportunidad: [],
      estadoOT: [],
      ultimoMes: [],
      calificacion: [],
    });
  };

  const selectCommon = {
    isMulti: true,
    closeMenuOnSelect: false,
    hideSelectedOptions: false,
    styles: rsStyles,
    menuPortalTarget: portalTarget,
    getOptionValue: (o) => String(o.value),
    getOptionLabel: (o) => String(o.label),
    components: { Option: CheckboxOption },
    classNamePrefix: "rs",
  };

  return (
    <div className="oport-dash-wrapper">
      <div className="oport-topbar">
        <div>
          <h2 className="oport-dash-title">Consultorías y oportunidades comerciales CoE SAP</h2>
          <div className="oport-dash-subtitle">KPIs, filtros y detalle consolidado</div>
        </div>

        <button className="oport-btn" onClick={limpiar} disabled={loading}>
          Limpiar filtros
        </button>
      </div>

      <div className="dashboard-layout">
        <main className="dashboard-main">
          {loading && <div className="oport-loading">Cargando...</div>}

          <section className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Cantidad</div>
              <div className="kpi-value">{kpis.total}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Activas</div>
              <div className="kpi-value">{kpis.activas}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Cerradas</div>
              <div className="kpi-value">{kpis.cerradas}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">% Ganadas</div>
              <div className="kpi-value">{kpis.porcentajeGanadas.toFixed(2)}%</div>
              <div className="kpi-sub">
                {kpis.ganadas} de {kpis.total}
              </div>
            </div>
          </section>

          <section className="main-grid">
            <div className="main-col">
              <div className="card">
                <div className="card-title">Estado de Oferta</div>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ESTADO</th>
                        <th>Cant</th>
                        <th>OTC</th>
                        <th>MRC</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenResultado.rows.map((it) => (
                        <tr key={it.label}>
                          <td>{it.label}</td>
                          <td>{it.count}</td>
                          <td>{fmtMoney(it.otc)}</td>
                          <td>{fmtMoney(it.mrc)}</td>
                          <td>
                            {resumenResultado.total
                              ? ((it.count / resumenResultado.total) * 100).toFixed(2)
                              : "0.00"}
                            %
                          </td>
                        </tr>
                      ))}
                      <tr className="table-total">
                        <td>Total</td>
                        <td>{resumenResultado.total}</td>
                        <td>{fmtMoney(resumenEstado.totalOtc)}</td>
                        <td>{fmtMoney(resumenEstado.totalMrc)}</td>
                        <td>{resumenResultado.total ? "100%" : "0%"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-title">Resultado de Oferta</div>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>RESULTADO</th>
                        <th>Cant</th>
                        <th>OTC</th>
                        <th>MRC</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenEstado.rows.map((it) => (
                        <tr key={it.label}>
                          <td>{it.label}</td>
                          <td>{it.count}</td>
                          <td>{fmtMoney(it.otc)}</td>
                          <td>{fmtMoney(it.mrc)}</td>
                          <td>
                            {resumenEstado.total
                              ? ((it.count / resumenEstado.total) * 100).toFixed(2)
                              : "0.00"}
                            %
                          </td>
                        </tr>
                      ))}
                      <tr className="table-total">
                        <td>Total</td>
                        <td>{resumenEstado.total}</td>
                        <td>{fmtMoney(resumenResultado.totalOtc)}</td>
                        <td>{fmtMoney(resumenResultado.totalMrc)}</td>
                        <td>{resumenEstado.total ? "100%" : "0%"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="side-col">
              <div className="card">
                <div className="card-title">Cantidad y Ganadas/Adjudicadas por Año y Mes</div>
                <GraficoCantidadGanadas data={dataFiltrada} />
              </div>

              <div className="card">
                <div className="card-title">Activas y Cerradas por Año y Mes</div>
                <GraficoActivasCerradas data={dataFiltrada} />
              </div>

              <div className="card">
                <div className="card-title">Resumen Calificación</div>
                <ResumenCalificacion data={dataFiltrada} />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">Detalle de Oportunidades</div>

            <div className="detalle-scroll">
              <table className="table table-detalle">
                <thead>
                  <tr>
                    <th>NOMBRE CLIENTE</th>
                    <th>SERVICIO</th>
                    <th>FECHA</th>
                    <th>CALIFICACION</th>
                    <th>ESTADO OFERTA</th>
                    <th>RESULTADO OFERTA</th>
                    <th>OTC</th>
                    <th>MRC</th>
                    <th>GERENCIA</th>
                    <th>COMERCIAL</th>
                    <th>OBSERVACIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {dataFiltrada.map((row, i) => (
                    <tr key={row.id ?? i}>
                      <td>{row.nombre_cliente ?? "-"}</td>
                      <td>{row.servicio ?? "-"}</td>
                      <td>{row.fecha_creacion ?? "-"}</td>
                      <td>{row.calificacion_oportunidad ?? "-"}</td>
                      <td>{row.estado_oferta ?? "-"}</td>
                      <td>{row.resultado_oferta ?? "-"}</td>
                      <td>{row.otc ?? "-"}</td>
                      <td>{row.mrc ?? "-"}</td>
                      <td>{row.gerencia_comercial ?? "-"}</td>
                      <td>{row.comercial_asignado ?? "-"}</td>
                      <td className="td-wrap">{row.observaciones ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="dashboard-filtros">
          <div className="filters-head">
            <div className="filters-title">Filtros</div>
          </div>

          <div className="filtro-item">
            <label>Año / Mes</label>
            <div className="two-col">
              <Select
                {...selectCommon}
                placeholder="Año"
                options={opciones.anios}
                value={filtros.anios}
                onChange={(v) => setFiltros((p) => ({ ...p, anios: v || [] }))}
              />
              <Select
                {...selectCommon}
                placeholder="Mes"
                options={opciones.meses}
                value={filtros.meses}
                onChange={(v) => setFiltros((p) => ({ ...p, meses: v || [] }))}
              />
            </div>
          </div>

          <div className="filtro-item">
            <label>Tipo</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.tipos}
              value={filtros.tipos}
              onChange={(v) => setFiltros((p) => ({ ...p, tipos: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Dirección Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.direccionComercial}
              value={filtros.direccionComercial}
              onChange={(v) => setFiltros((p) => ({ ...p, direccionComercial: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Gerencia Comercial</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.gerenciaComercial}
              value={filtros.gerenciaComercial}
              onChange={(v) => setFiltros((p) => ({ ...p, gerenciaComercial: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Nombre Cliente</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.cliente}
              value={filtros.cliente}
              onChange={(v) => setFiltros((p) => ({ ...p, cliente: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Estado Oferta</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.estadoOferta}
              value={filtros.estadoOferta}
              onChange={(v) => setFiltros((p) => ({ ...p, estadoOferta: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Resultado Oferta</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.resultadoOferta}
              value={filtros.resultadoOferta}
              onChange={(v) => setFiltros((p) => ({ ...p, resultadoOferta: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Fecha Acta Cierre OT</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.fechaActaCierreOT}
              value={filtros.fechaActaCierreOT}
              onChange={(v) => setFiltros((p) => ({ ...p, fechaActaCierreOT: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Fecha Cierre Oportunidad</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.fechaCierreOportunidad}
              value={filtros.fechaCierreOportunidad}
              onChange={(v) => setFiltros((p) => ({ ...p, fechaCierreOportunidad: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Estado OT</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.estadoOT}
              value={filtros.estadoOT}
              onChange={(v) => setFiltros((p) => ({ ...p, estadoOT: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Último Mes</label>
            <Select
              {...selectCommon}
              placeholder="Todos"
              options={opciones.ultimoMes}
              value={filtros.ultimoMes}
              onChange={(v) => setFiltros((p) => ({ ...p, ultimoMes: v || [] }))}
            />
          </div>

          <div className="filtro-item">
            <label>Calificación Oportunidad</label>
            <Select
              {...selectCommon}
              placeholder="Todas"
              options={opciones.calificacion}
              value={filtros.calificacion}
              onChange={(v) => setFiltros((p) => ({ ...p, calificacion: v || [] }))}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

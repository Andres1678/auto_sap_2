// src/GraficoBase.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./GraficoBase.css";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { jfetch } from "./lib/api";  

const TARGET_HOURS = 180;
const BAR_BLUE = "#3b82f6";

const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#84cc16", "#f97316", "#e11d48", "#22c55e",
  "#a855f7", "#0ea5e9", "#14b8a6", "#64748b", "#eab308",
];

const calcBarHeight = (n, { base = 140, perItem = 28, min = 320, max = 1400 } = {}) =>
  Math.max(min, Math.min(max, base + n * perItem));

const calcYAxisWidth = (arr, key = "name") => {
  const maxChars = Array.isArray(arr) && arr.length
    ? arr.reduce((m, d) => Math.max(m, String(d?.[key] ?? "").length), 0)
    : 0;
  return Math.min(480, Math.max(120, Math.round(maxChars * 8)));
};

export default function GraficoBase() {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  }, []);
  const rol = (user?.rol || user?.user?.rol || "").toUpperCase();

  
  const [q, setQ] = useState("");
  const [modulo, setModulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [fdesde, setFdesde] = useState("");
  const [fhasta, setFhasta] = useState("");
  const [consultorSel, setConsultorSel] = useState("");
  const [mesSel, setMesSel] = useState("");
  const [campoCategoria, setCampoCategoria] = useState("tipo_tarea");

  
  const [ordenMes, setOrdenMes] = useState("asc");
  const [ordenTareas, setOrdenTareas] = useState("desc");
  const [ordenClientes, setOrdenClientes] = useState("desc");
  const [maxSlicesPie, setMaxSlicesPie] = useState(12);
  const [labelMinPct, setLabelMinPct] = useState(4);
  const [topNTareas, setTopNTareas] = useState(12);
  const [agrupaOtrosTareas, setAgrupaOtrosTareas] = useState(true);
  const [umbralOtrosPie, setUmbralOtrosPie] = useState(2);
  const [topNClientes, setTopNClientes] = useState(10);
  const [agrupaOtrosClientes, setAgrupaOtrosClientes] = useState(true);

  
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [consultoresOpt, setConsultoresOpt] = useState([]);
  const [mesesOpt, setMesesOpt] = useState([]);

  const [dataMes, setDataMes] = useState([]);
  const [dataPieTareas, setDataPieTareas] = useState([]);
  const [dataBarTareas, setDataBarTareas] = useState([]);
  const [dataBarClientes, setDataBarClientes] = useState([]);

 
  const norm = (s) => (s || "").trim().toLowerCase();
  const yyyymm = (fecha) => (fecha || "").slice(0, 7);
  const isYYYYMM = (s) => /^\d{4}-\d{2}$/.test(s);
  const formatMonthLabel = (yyyyMM) => {
    if (!yyyyMM) return "";
    try {
      return new Date(`${yyyyMM}-01T00:00:00`).toLocaleDateString("es-CO", { month: "short", year: "numeric" });
    } catch { return yyyyMM; }
  };
  const toHours = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (!s) return 0;
    const num = Number(s.replace(",", "."));
    if (!Number.isNaN(num) && !s.includes(":")) return num;
    const m = s.match(/^(\d+)\s*:\s*(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10) || 0;
      const mi = parseInt(m[2], 10) || 0;
      const se = parseInt(m[3] || "0", 10) || 0;
      return h + mi / 60 + se / 3600;
    }
    return 0;
  };

  
  const fetchingRef = useRef(false);
  const lastResultRef = useRef([]);
  const didInitRef = useRef(false);

  const fetchAllFiltered = useCallback(async () => {
    if (fetchingRef.current) return lastResultRef.current;
    fetchingRef.current = true;
    try {
      const pageSizeLocal = 1000;
      let all = [];
      let page = 1;

      while (true) {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", String(pageSizeLocal));
        if (q) params.set("q", q);
        if (modulo) params.set("modulo", modulo);
        if (cliente) params.set("cliente", cliente);
        if (fdesde) params.set("fecha_desde", fdesde);
        if (fhasta) params.set("fecha_hasta", fhasta);

        
        const res = await jfetch(`/base-registros?${params.toString()}`, {
          headers: { "X-User-Rol": rol },
        });

        let payload = {};
        try { payload = await res.json(); } catch { payload = {}; }
        if (!res.ok) throw new Error(payload?.mensaje || `HTTP ${res.status}`);

        const list = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload) ? payload : [];

        all = all.concat(list);

        const total = Number(payload?.total ?? all.length);
        if (all.length >= total || list.length < pageSizeLocal) break;

        page += 1;
        if (page > 5000) break; 
      }

      lastResultRef.current = all;
      return all;
    } finally {
      fetchingRef.current = false;
    }
  }, [q, modulo, cliente, fdesde, fhasta, rol]);

  
  const buildConsultorIndex = useCallback((recs) => {
    const idx = new Map();
    for (const r of recs) {
      const raw = (r?.consultor || "").trim();
      const key = norm(raw);
      const m = yyyymm(r?.fecha);
      if (!isYYYYMM(m)) continue;
      if (!idx.has(key)) idx.set(key, { label: raw || "Sin consultor", months: new Set() });
      idx.get(key).months.add(m);
    }
    return idx;
  }, []);

  const applySharedFilters = useCallback((recs) =>
    recs.filter((r) => {
      if (consultorSel && norm(r?.consultor) !== consultorSel) return false;
      if (mesSel) {
        const m = yyyymm(r?.fecha);
        if (m !== mesSel) return false;
      }
      return true;
    }), [consultorSel, mesSel]);

  const buildMonthly = useCallback((recs) => {
    const sum = new Map();
    for (const r of recs) {
      const m = yyyymm(r?.fecha);
      if (!isYYYYMM(m)) continue;
      const h = toHours(r?.tiempo_invertido ?? r?.horas_convertidas ?? r?.total_horas);
      sum.set(m, (sum.get(m) || 0) + h);
    }
    return Array.from(sum.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, horas]) => ({ month, horas: Number(horas.toFixed(2)) }));
  }, []);

  const buildByCategory = useCallback((recs, campo) => {
    const sum = new Map();
    for (const r of recs) {
      const raw =
        (r?.[campo] && String(r[campo]).trim()) ||
        (campo !== "tarea_azure" && r?.tarea_azure && String(r.tarea_azure).trim()) ||
        "Sin categoría";
      const h = toHours(r?.tiempo_invertido ?? r?.horas_convertidas ?? r?.total_horas);
      sum.set(raw, (sum.get(raw) || 0) + h);
    }
    let arr = Array.from(sum.entries()).map(([name, value]) => ({
      name, value: Number(value.toFixed(2)),
    }));
    arr.sort((a, b) => b.value - a.value);
    const total = arr.reduce((a, b) => a + b.value, 0);
    return { arr, total };
  }, []);

  const buildTopNFromCategory = useCallback((recs, campo, topN, agrupaOtros) => {
    const { arr, total } = buildByCategory(recs, campo);
    if (total <= 0) return [];
    if (topN < 1 || topN >= arr.length)
      return arr.map((d) => ({ ...d, pct: (d.value / total) * 100 }));
    const top = arr.slice(0, topN);
    const rest = arr.slice(topN);
    if (agrupaOtros) {
      const restSum = rest.reduce((a, b) => a + b.value, 0);
      if (restSum > 0) top.push({ name: "Otros", value: Number(restSum.toFixed(2)) });
    }
    return top.map((d) => ({ ...d, pct: (d.value / total) * 100 }));
  }, [buildByCategory]);

  const buildByClient = useCallback((recs, topN, agrupaOtros) => {
    const sum = new Map();
    for (const r of recs) {
      const cli = (r?.cliente && String(r.cliente).trim()) || "Sin cliente";
      const h = toHours(r?.tiempo_invertido ?? r?.horas_convertidas ?? r?.total_horas);
      sum.set(cli, (sum.get(cli) || 0) + h);
    }
    let arr = Array.from(sum.entries()).map(([name, value]) => ({
      name, value: Number(value.toFixed(2)),
    }));
    arr.sort((a, b) => b.value - a.value);
    const total = arr.reduce((a, b) => a + b.value, 0);
    if (total <= 0) return [];
    if (topN < 1 || topN >= arr.length)
      return arr.map((d) => ({ ...d, pct: (d.value / total) * 100 }));
    const top = arr.slice(0, topN);
    const rest = arr.slice(topN);
    if (agrupaOtros) {
      const restSum = rest.reduce((a, b) => a + b.value, 0);
      if (restSum > 0) top.push({ name: "Otros", value: Number(restSum.toFixed(2)) });
    }
    return top.map((d) => ({ ...d, pct: (d.value / total) * 100 }));
  }, []);

  const buildPieFromCategory = useCallback((recs, campo, umbralPct, maxSlices) => {
    const { arr, total } = buildByCategory(recs, campo);
    if (total <= 0) return [];
    let list = arr.map((d) => ({ ...d, pct: (d.value / total) * 100 }));

    
    if (maxSlices && list.length > maxSlices) {
      const top = list.slice(0, maxSlices - 1);
      const rest = list.slice(maxSlices - 1);
      const restSum = rest.reduce((a, b) => a + b.value, 0);
      if (restSum > 0) {
        top.push({ name: "Otros", value: Number(restSum.toFixed(2)), pct: (restSum / total) * 100, _otros: true });
      }
      list = top;
    }

    
    const small = list.filter((d) => !d._otros && d.pct < umbralPct);
    if (small.length) {
      const big = list.filter((d) => d._otros || d.pct >= umbralPct);
      const sumSmall = small.reduce((a, b) => a + b.value, 0);
      if (sumSmall > 0) {
        const existingOtros = big.find((d) => d._otros);
        if (existingOtros) {
          existingOtros.value = Number((existingOtros.value + sumSmall).toFixed(2));
          existingOtros.pct = (existingOtros.value / total) * 100;
        } else {
          big.push({ name: "Otros", value: Number(sumSmall.toFixed(2)), pct: (sumSmall / total) * 100, _otros: true });
        }
      }
      list = big;
    }

    return list;
  }, [buildByCategory]);

  const sortBars = (arr, orden) => {
    const a = [...arr];
    if (orden === "alpha") a.sort((x, y) => String(x.name).localeCompare(String(y.name), "es", { sensitivity: "base" }));
    else if (orden === "asc") a.sort((x, y) => (x.value - y.value));
    else a.sort((x, y) => (y.value - x.value));
    return a;
  };

  
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      const all = await fetchAllFiltered();
      setRecords(all);

      const idx = buildConsultorIndex(all);
      const optsC = Array.from(idx.entries())
        .map(([value, { label }]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
      setConsultoresOpt([{ value: "", label: "Todos" }, ...optsC]);

      const monthsSet = new Set();
      if (consultorSel && idx.has(consultorSel)) {
        for (const m of idx.get(consultorSel).months) monthsSet.add(m);
      } else {
        for (const { months } of idx.values()) for (const m of months) monthsSet.add(m);
      }
      const optsM = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
      setMesesOpt(["", ...optsM]);
      if (mesSel && !optsM.includes(mesSel)) setMesSel("");
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [fetchAllFiltered, buildConsultorIndex, consultorSel, mesSel]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const idx = buildConsultorIndex(records);
    const monthsSet = new Set();
    if (consultorSel && idx.has(consultorSel)) {
      for (const m of idx.get(consultorSel).months) monthsSet.add(m);
    } else {
      for (const { months } of idx.values()) for (const m of months) monthsSet.add(m);
    }
    const optsM = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
    setMesesOpt(["", ...optsM]);
    if (mesSel && !optsM.includes(mesSel)) setMesSel("");
  }, [consultorSel, records, buildConsultorIndex, mesSel]);

  useEffect(() => {
    const base = applySharedFilters(records);

    let monthly = buildMonthly(base);
    if (ordenMes === "desc") monthly = [...monthly].reverse();
    setDataMes(monthly);

    setDataPieTareas(buildPieFromCategory(base, campoCategoria, umbralOtrosPie, maxSlicesPie));

    let tareas = buildTopNFromCategory(base, campoCategoria, topNTareas, agrupaOtrosTareas);
    tareas = sortBars(tareas, ordenTareas);
    setDataBarTareas(tareas);

    let clientes = buildByClient(base, topNClientes, agrupaOtrosClientes);
    clientes = sortBars(clientes, ordenClientes);
    setDataBarClientes(clientes);
  }, [
    records, consultorSel, mesSel, campoCategoria, topNTareas, agrupaOtrosTareas,
    umbralOtrosPie, maxSlicesPie, ordenMes, ordenTareas, ordenClientes,
    applySharedFilters, buildMonthly, buildPieFromCategory, buildTopNFromCategory, buildByClient,
  ]);

  const tareasHeight = calcBarHeight(dataBarTareas.length);
  const clientesHeight = calcBarHeight(dataBarClientes.length);
  const tareasYAxisW = calcYAxisWidth(dataBarTareas);
  const clientesYAxisW = calcYAxisWidth(dataBarClientes);

  const renderPieLabel = (p) => {
    const pct = p?.payload?.pct || 0;
    if (pct < labelMinPct) return null;
    const nm = p?.name || p?.payload?.name || "";
    return `${nm} ${pct.toFixed(0)}%`;
  };

  return (
    <div className="grafico-base">
      {/* Filtros */}
      <div className="br-card" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Gráficos – Resumen</h3>

        <div className="br-toolbar gb-cols">
          <input className="br-input" placeholder="Buscar (q)" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="br-input" placeholder="Módulo" value={modulo} onChange={(e) => setModulo(e.target.value)} />
          <input className="br-input" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <input className="br-input" type="date" value={fdesde} onChange={(e) => setFdesde(e.target.value)} />
          <input className="br-input" type="date" value={fhasta} onChange={(e) => setFhasta(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="br-btn primary" onClick={refreshData} disabled={loading}>
              {loading ? "Cargando..." : "Aplicar filtros"}
            </button>
            <button
              type="button"
              className="br-btn"
              onClick={() => { setQ(""); setModulo(""); setCliente(""); setFdesde(""); setFhasta(""); }}
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Controles extra */}
        <div className="br-toolbar gb-cols" style={{ marginTop: 10 }}>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Consultor</label>
            <select className="br-select" value={consultorSel} onChange={(e) => setConsultorSel(e.target.value)}>
              {consultoresOpt.map((c) => (
                <option key={c.value || "all"} value={c.value}>{c.label || "Todos"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Mes</label>
            <select className="br-select" value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
              {mesesOpt.map((m) => (
                <option key={m || "all"} value={m}>{m ? formatMonthLabel(m) : "Todos"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Orden meses</label>
            <select className="br-select" value={ordenMes} onChange={(e) => setOrdenMes(e.target.value)}>
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Categoría de tarea</label>
            <select className="br-select" value={campoCategoria} onChange={(e) => setCampoCategoria(e.target.value)}>
              <option value="tipo_tarea">Tipo de tarea</option>
              <option value="tarea_azure">Tarea Azure</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Orden tareas</label>
            <select className="br-select" value={ordenTareas} onChange={(e) => setOrdenTareas(e.target.value)}>
              <option value="desc">Por horas (↓)</option>
              <option value="asc">Por horas (↑)</option>
              <option value="alpha">Alfabético</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Orden clientes</label>
            <select className="br-select" value={ordenClientes} onChange={(e) => setOrdenClientes(e.target.value)}>
              <option value="desc">Por horas (↓)</option>
              <option value="asc">Por horas (↑)</option>
              <option value="alpha">Alfabético</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Máx sectores (pie)</label>
            <input type="number" min={4} max={20} step={1} className="br-input"
                   value={maxSlicesPie}
                   onChange={(e) => setMaxSlicesPie(Math.max(4, Math.min(20, Number(e.target.value) || 12)))} />
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Ocultar etiquetas &lt; %</label>
            <input type="number" min={0} max={20} step={1} className="br-input"
                   value={labelMinPct}
                   onChange={(e) => setLabelMinPct(Math.max(0, Math.min(20, Number(e.target.value) || 4)))} />
          </div>
        </div>

        {/* Top N / Agrupar otros */}
        <div className="br-toolbar gb-cols" style={{ marginTop: 10 }}>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Top N (tareas)</label>
            <input type="number" min={1} max={50} step={1} className="br-input"
                   value={topNTareas}
                   onChange={(e) => setTopNTareas(Math.max(1, Math.min(50, Number(e.target.value) || 12)))} />
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Top N (clientes)</label>
            <input type="number" min={1} max={50} step={1} className="br-input"
                   value={topNClientes}
                   onChange={(e) => setTopNClientes(Math.max(1, Math.min(50, Number(e.target.value) || 10)))} />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={agrupaOtrosTareas}
                     onChange={(e) => setAgrupaOtrosTareas(e.target.checked)} />
              Agrupar “Otros” (tareas)
            </label>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={agrupaOtrosClientes}
                     onChange={(e) => setAgrupaOtrosClientes(e.target.checked)} />
              Agrupar “Otros” (clientes)
            </label>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Umbral Pie %
              <input type="number" min={0} max={20} step={1} className="br-input" style={{ width: 70, marginLeft: 6 }}
                     value={umbralOtrosPie}
                     onChange={(e) => setUmbralOtrosPie(Math.max(0, Math.min(20, Number(e.target.value) || 2)))} />
            </label>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="br-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
        {/* Horas por mes */}
        <div className="br-card">
          <div className="br-card-head">
            <h4 style={{ margin: 0 }}>Horas por mes</h4>
            <span className="muted">Línea roja: {TARGET_HOURS} h</span>
          </div>
          {dataMes.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataMes} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} />
                  <YAxis domain={[0, (max) => Math.max(200, Math.ceil(Math.max(TARGET_HOURS, max || 0) * 1.1))]} />
                  <Tooltip labelFormatter={formatMonthLabel} formatter={(v) => [`${v.toFixed?.(2) ?? v} h`, "Horas"]} />
                  <Legend />
                  <Bar dataKey="horas" name="Horas invertidas" fill={BAR_BLUE} radius={[6, 6, 0, 0]} />
                  <ReferenceLine y={TARGET_HOURS} stroke="red" strokeWidth={2}
                                 label={{ value: `${TARGET_HOURS} h`, position: "right", fill: "red" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pie por tarea */}
        <div className="br-card">
          <div className="br-card-head">
            <h4 style={{ margin: 0 }}>Enfoque de tiempo por tarea</h4>
            <span className="muted">{campoCategoria === "tipo_tarea" ? "Tipo de tarea" : "Tarea Azure"}</span>
          </div>
          {dataPieTareas.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v, n, p) => [
                    `${(v ?? 0).toFixed?.(2) ?? v} h (${(p?.payload?.pct || 0).toFixed(1)}%)`, "Horas"
                  ]}/>
                  <Legend />
                  <Pie data={dataPieTareas} dataKey="value" nameKey="name"
                       cx="50%" cy="50%" innerRadius={70} outerRadius={120}
                       paddingAngle={1} labelLine={false} label={renderPieLabel}>
                    {dataPieTareas.map((_, i) => (
                      <Cell key={`pie-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Barras por tarea */}
        <div className="br-card">
          <div className="br-card-head">
            <h4 style={{ margin: 0 }}>
              Inversión de tiempo por tarea (Top {topNTareas}{agrupaOtrosTareas ? " + Otros" : ""})
            </h4>
            <span className="muted">{campoCategoria === "tipo_tarea" ? "Tipo de tarea" : "Tarea Azure"}</span>
          </div>
          {dataBarTareas.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: calcBarHeight(dataBarTareas.length) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataBarTareas} layout="vertical"
                          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                          barCategoryGap={18} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={calcYAxisWidth(dataBarTareas)} />
                  <Tooltip formatter={(v, n, p) => [
                    `${(v ?? 0).toFixed?.(2) ?? v} h (${p?.payload?.pct?.toFixed(1)}%)`, "Horas"
                  ]}/>
                  <Legend />
                  <Bar dataKey="value" name="Horas invertidas" fill={BAR_BLUE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Barras por cliente */}
        <div className="br-card">
          <div className="br-card-head">
            <h4 style={{ margin: 0 }}>
              % Cliente (Top {topNClientes}{agrupaOtrosClientes ? " + Otros" : ""})
            </h4>
          </div>
          {dataBarClientes.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: calcBarHeight(dataBarClientes.length) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataBarClientes} layout="vertical"
                          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                          barCategoryGap={18} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={calcYAxisWidth(dataBarClientes)} />
                  <Tooltip formatter={(v, n, p) => [
                    `${(v ?? 0).toFixed?.(2) ?? v} h (${p?.payload?.pct?.toFixed(1)}%)`, "Horas"
                  ]}/>
                  <Legend />
                  <Bar dataKey="value" name="Total" fill={BAR_BLUE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

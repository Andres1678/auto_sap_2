import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./GraficoBase.css";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const API = "http://localhost:5000";
const TARGET_HOURS = 180;

// Color corporativo para barras
const BAR_BLUE = "#3b82f6";

const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#84cc16", "#f97316", "#e11d48", "#22c55e",
  "#a855f7", "#0ea5e9", "#14b8a6", "#64748b", "#eab308",
];

export default function GraficoBase() {
  // ======= Usuario / rol =======
  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);
  const rol = (user?.rol || user?.user?.rol || "").toUpperCase();

  // ======= Estado filtros =======
  const [q, setQ] = useState("");
  const [modulo, setModulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [fdesde, setFdesde] = useState("");
  const [fhasta, setFhasta] = useState("");
  const [consultorSel, setConsultorSel] = useState("");
  const [mesSel, setMesSel] = useState("");
  const [campoCategoria, setCampoCategoria] = useState("tipo_tarea");

  const [topNTareas, setTopNTareas] = useState(12);
  const [agrupaOtrosTareas, setAgrupaOtrosTareas] = useState(true);
  const [umbralOtrosPie, setUmbralOtrosPie] = useState(2);

  const [topNClientes, setTopNClientes] = useState(10);
  const [agrupaOtrosClientes, setAgrupaOtrosClientes] = useState(true);

  // ======= Estado data =======
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [consultoresOpt, setConsultoresOpt] = useState([]);
  const [mesesOpt, setMesesOpt] = useState([]);

  const [dataMes, setDataMes] = useState([]);
  const [dataPieTareas, setDataPieTareas] = useState([]);
  const [dataBarTareas, setDataBarTareas] = useState([]);
  const [dataBarClientes, setDataBarClientes] = useState([]);

  // ======= Utils =======
  const norm = (s) => (s || "").trim().toLowerCase();
  const yyyymm = (fecha) => (fecha || "").slice(0, 7);
  const isYYYYMM = (s) => /^\d{4}-\d{2}$/.test(s);
  const formatMonthLabel = (yyyyMM) => {
    if (!yyyyMM) return "";
    try {
      return new Date(`${yyyyMM}-01T00:00:00`).toLocaleDateString("es-CO", {
        month: "short",
        year: "numeric",
      });
    } catch {
      return yyyyMM;
    }
  };

  // Convierte "HH:MM" / "HH:MM:SS" o "123,5" a horas (número)
  const toHours = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (!s) return 0;

    // 123.5 o 123,5
    const num = Number(s.replace(",", "."));
    if (!Number.isNaN(num) && !s.includes(":")) return num;

    // HH:MM(:SS)
    const m = s.match(/^(\d+)\s*:\s*(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10) || 0;
      const mi = parseInt(m[2], 10) || 0;
      const se = parseInt(m[3] || "0", 10) || 0;
      return h + mi / 60 + se / 3600;
    }
    return 0;
  };

  // ======= Fetch con paginado (tolerante a array directo) =======
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
      let got = 0;
      let expected = Infinity;

      while (got < expected) {
        const url = new URL(`${API}/api/base-registros`);
        url.searchParams.set("page", String(page));
        url.searchParams.set("page_size", String(pageSizeLocal));
        if (q) url.searchParams.set("q", q);
        if (modulo) url.searchParams.set("modulo", modulo);
        if (cliente) url.searchParams.set("cliente", cliente);
        if (fdesde) url.searchParams.set("fecha_desde", fdesde);
        if (fhasta) url.searchParams.set("fecha_hasta", fhasta);

        const res = await fetch(url, { headers: { "X-User-Rol": rol } });
        let payload = {};
        try {
          payload = await res.json();
        } catch {
          payload = {};
        }
        if (!res.ok) {
          throw new Error(payload?.mensaje || `HTTP ${res.status}`);
        }

        // Soporta {data, total} o un array directo
        const list = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        all = all.concat(list);
        got += list.length;
        expected = Number(payload?.total ?? got);

        if (list.length < pageSizeLocal) break;
        page++;
        if (page > 5000) break;
      }

      lastResultRef.current = all;
      return all;
    } finally {
      fetchingRef.current = false;
    }
  }, [q, modulo, cliente, fdesde, fhasta, rol]);

  // ======= Construcción de opciones =======
  const buildConsultorIndex = (recs) => {
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
  };

  const refreshData = async () => {
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
  };

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    refreshData();
  }, []); // eslint-disable-line

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
  }, [consultorSel, records]); // eslint-disable-line

  // ======= Filtros compartidos (consultor / mes) =======
  const applySharedFilters = (recs) =>
    recs.filter((r) => {
      if (consultorSel && norm(r?.consultor) !== consultorSel) return false;
      if (mesSel) {
        const m = yyyymm(r?.fecha);
        if (m !== mesSel) return false;
      }
      return true;
    });

  // ======= Agregaciones =======
  const buildMonthly = (recs) => {
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
  };

  const buildByCategory = (recs, campo) => {
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
      name,
      value: Number(value.toFixed(2)),
    }));
    arr.sort((a, b) => b.value - a.value);
    const total = arr.reduce((a, b) => a + b.value, 0);
    return { arr, total };
  };

  const buildPieFromCategory = (recs, campo, umbralPct) => {
    const { arr, total } = buildByCategory(recs, campo);
    if (total <= 0) return [];
    const withPct = arr.map((d) => ({ ...d, pct: (d.value / total) * 100 }));
    if (umbralPct > 0) {
      const big = withPct.filter((d) => d.pct >= umbralPct);
      const small = withPct.filter((d) => d.pct < umbralPct);
      const rest = small.reduce((a, b) => a + b.value, 0);
      if (rest > 0)
        big.push({
          name: "Otros",
          value: Number(rest.toFixed(2)),
          pct: (rest / total) * 100,
          _otros: true,
        });
      return big;
    }
    return withPct;
  };

  const buildTopNFromCategory = (recs, campo, topN, agrupaOtros) => {
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
  };

  const buildByClient = (recs, topN, agrupaOtros) => {
    const sum = new Map();
    for (const r of recs) {
      const cli = (r?.cliente && String(r.cliente).trim()) || "Sin cliente";
      const h = toHours(r?.tiempo_invertido ?? r?.horas_convertidas ?? r?.total_horas);
      sum.set(cli, (sum.get(cli) || 0) + h);
    }
    let arr = Array.from(sum.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
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
  };

  // ======= Recalcular datasets al cambiar filtros compartidos =======
  useEffect(() => {
    const base = applySharedFilters(records);
    setDataMes(buildMonthly(base));
    setDataPieTareas(buildPieFromCategory(base, campoCategoria, umbralOtrosPie));
    setDataBarTareas(buildTopNFromCategory(base, campoCategoria, topNTareas, agrupaOtrosTareas));
    setDataBarClientes(buildByClient(base, topNClientes, agrupaOtrosClientes));
  }, [
    records,
    consultorSel,
    mesSel,
    campoCategoria,
    topNTareas,
    agrupaOtrosTareas,
    umbralOtrosPie,
    topNClientes,
    agrupaOtrosClientes,
  ]);

  // ======= UI =======
  return (
    <div className="grafico-base">
      {/* Filtros */}
      <div className="br-card" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Gráficos – Resumen</h3>

        {/* Usa la clase gb-cols definida en tu CSS para responsive */}
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
              onClick={() => {
                setQ("");
                setModulo("");
                setCliente("");
                setFdesde("");
                setFhasta("");
              }}
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="br-toolbar gb-cols" style={{ marginTop: 10 }}>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>
              Consultor
            </label>
            <select className="br-select" value={consultorSel} onChange={(e) => setConsultorSel(e.target.value)}>
              {consultoresOpt.map((c) => (
                <option key={c.value || "all"} value={c.value}>
                  {c.label || "Todos"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>
              Mes
            </label>
            <select className="br-select" value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
              {mesesOpt.map((m) => (
                <option key={m || "all"} value={m}>
                  {m ? formatMonthLabel(m) : "Todos"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>
              Categoría de tarea
            </label>
            <select className="br-select" value={campoCategoria} onChange={(e) => setCampoCategoria(e.target.value)}>
              <option value="tipo_tarea">Tipo de tarea</option>
              <option value="tarea_azure">Tarea Azure</option>
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>
              Top N (tareas)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              className="br-input"
              value={topNTareas}
              onChange={(e) => setTopNTareas(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
            />
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>
              Top N (clientes)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              className="br-input"
              value={topNClientes}
              onChange={(e) => setTopNClientes(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
            />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={agrupaOtrosTareas}
                onChange={(e) => setAgrupaOtrosTareas(e.target.checked)}
              />
              Agrupar “Otros” (tareas)
            </label>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={agrupaOtrosClientes}
                onChange={(e) => setAgrupaOtrosClientes(e.target.checked)}
              />
              Agrupar “Otros” (clientes)
            </label>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Umbral Pie %
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                className="br-input"
                style={{ width: 70, marginLeft: 6 }}
                value={umbralOtrosPie}
                onChange={(e) => setUmbralOtrosPie(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              />
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
                  {/* Azul + esquinas superiores redondeadas */}
                  <Bar dataKey="horas" name="Horas invertidas" fill={BAR_BLUE} radius={[6, 6, 0, 0]} />
                  <ReferenceLine
                    y={TARGET_HOURS}
                    stroke="red"
                    strokeWidth={2}
                    label={{ value: `${TARGET_HOURS} h`, position: "right", fill: "red" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pie tareas */}
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
                  <Tooltip
                    formatter={(v, n, p) => [
                      `${(v ?? 0).toFixed?.(2) ?? v} h (${(p?.payload?.pct || 0).toFixed(1)}%)`,
                      "Horas",
                    ]}
                  />
                  <Legend />
                  <Pie
                    data={dataPieTareas}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    labelLine={false}
                    label={(p) => `${p.name} ${p.payload.pct.toFixed(0)}%`}
                  >
                    {dataPieTareas.map((_, i) => (
                      <Cell key={`pie-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Barras por tarea (Top N) */}
        <div className="br-card">
          <div className="br-card-head">
            <h4 style={{ margin: 0 }}>
              Inversión de tiempo por tarea (Top {topNTareas}
              {agrupaOtrosTareas ? " + Otros" : ""})
            </h4>
            <span className="muted">{campoCategoria === "tipo_tarea" ? "Tipo de tarea" : "Tarea Azure"}</span>
          </div>
          {dataBarTareas.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dataBarTareas}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  barCategoryGap={14}
                  barSize={20}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={320} />
                  <Tooltip
                    formatter={(v, n, p) => [
                      `${(v ?? 0).toFixed?.(2) ?? v} h (${p?.payload?.pct?.toFixed(1)}%)`,
                      "Horas",
                    ]}
                  />
                  <Legend />
                  {/* Azul + redondeo en el lado derecho */}
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
              % Cliente (Top {topNClientes}
              {agrupaOtrosClientes ? " + Otros" : ""})
            </h4>
          </div>
          {dataBarClientes.length === 0 ? (
            <div className="muted">Sin datos con los filtros.</div>
          ) : (
            <div style={{ width: "100%", height: 460 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dataBarClientes}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  barCategoryGap={14}
                  barSize={20}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={340} />
                  <Tooltip
                    formatter={(v, n, p) => [
                      `${(v ?? 0).toFixed?.(2) ?? v} h (${p?.payload?.pct?.toFixed(1)}%)`,
                      "Horas",
                    ]}
                  />
                  <Legend />
                  {/* Azul + redondeo en el lado derecho */}
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

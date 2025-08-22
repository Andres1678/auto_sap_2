import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-modal";
import * as XLSX from "xlsx";
import "./BaseRegistros.css";

Modal.setAppElement("#root");

const API = "http://localhost:5000";

const COLUMNS = [
  { key: "fecha",              label: "Fecha",               w: 11 },
  { key: "modulo",             label: "Módulo",              w: 16 },
  { key: "cliente",            label: "Cliente",             w: 22 },
  { key: "nro_caso_cliente",   label: "Nro. Caso Cliente",   w: 18 },
  { key: "nro_caso_interno",   label: "Nro. Caso Interno",   w: 18 },
  { key: "tipo_tarea",         label: "Tipo Tarea",          w: 18 },
  { key: "consultor",          label: "Consultor",           w: 18 },
  { key: "hora_inicio",        label: "Inicio",              w: 10,  cls: "mono" },
  { key: "hora_fin",           label: "Fin",                 w: 10,  cls: "mono" },
  { key: "tiempo_invertido",   label: "Tiempo Invertido",    w: 13,  cls: "mono" },
  { key: "tiempo_facturable",  label: "Facturable",          w: 11,  cls: "right mono" },
  { key: "horas_adicionales",  label: "Horas Adicionales",   w: 13,  cls: "right mono" },
  { key: "descripcion",        label: "Descripción",         w: 44,  cls: "clip-3" },
  { key: "consolidado_cliente",label: "Consolidado Cliente", w: 26,  cls: "clip-3" },
  { key: "ocupacion_azure",    label: "Ocupación Azure",     w: 16,  cls: "clip-3" },
  { key: "tarea_azure",        label: "Tarea Azure",         w: 16,  cls: "clip-3" },
  { key: "horas_convertidas",  label: "Horas Convertidas",   w: 12,  cls: "right mono" },
  { key: "promedio",           label: "Promedio",            w: 10,  cls: "right mono" },
  { key: "extemporaneo",       label: "Extemporáneo",        w: 12 },
  { key: "equipo",             label: "Equipo",              w: 14 },
];

// Sanitiza saltos de línea y espacios raros al pintar
function formatCell(key, value) {
  if (value == null) return "";
  let text = String(value);
  if (["descripcion", "consolidado_cliente", "ocupacion_azure", "tarea_azure"].includes(key)) {
    text = text.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  }
  return text;
}

// Normaliza una fecha v a 'YYYY-MM-DD' (acepta Date o string)
function ensureISO(v) {
  if (!v && v !== 0) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // si ya viene ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // d/m/Y o d-m-Y
  const m = s.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*$/);
  if (m) {
    const d = String(Math.max(1, Math.min(31, parseInt(m[1], 10)))).padStart(2, "0");
    const mo = String(Math.max(1, Math.min(12, parseInt(m[2], 10)))).padStart(2, "0");
    let y = parseInt(m[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    return `${y}-${mo}-${d}`;
  }
  return s;
}

export default function BaseRegistros() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [modulo, setModulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [consultor, setConsultor] = useState("");
  const [fdesde, setFdesde] = useState("");
  const [fhasta, setFhasta] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadRowsCount, setUploadRowsCount] = useState(0);
  const [uploadCols, setUploadCols] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);
  const rol = (user?.rol || user?.user?.rol || "").toUpperCase();
  const isAdmin = rol === "ADMIN";

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = new URL(`${API}/api/base-registros`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(pageSize));
      if (q) url.searchParams.set("q", q);
      if (modulo) url.searchParams.set("modulo", modulo);
      if (cliente) url.searchParams.set("cliente", cliente);
      if (consultor) url.searchParams.set("consultor", consultor);
      if (fdesde) url.searchParams.set("fecha_desde", fdesde);
      if (fhasta) url.searchParams.set("fecha_hasta", fhasta);

      const res = await fetch(url, { headers: { "X-User-Rol": rol } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.mensaje || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.total || 0));
    } catch (e) {
      console.error("Error listando base-registros:", e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const handleBuscar = () => {
    setPage(1);
    fetchData();
  };

  const limpiarFiltros = () => {
    setQ(""); setModulo(""); setCliente(""); setConsultor(""); setFdesde(""); setFhasta("");
    setPage(1);
    fetchData();
  };

  const triggerFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      // cellDates:true + dateNF -> XLSX normaliza a Date y lo exporta en 'yyyy-mm-dd'
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, dateNF: "yyyy-mm-dd" });

      // Limpia filas vacías y fuerza FECHA a ISO (por si quedó texto)
      const nonEmpty = raw
        .map((row) => {
          const r = { ...row };
          if (r.FECHA != null) r.FECHA = ensureISO(r.FECHA);
          return r;
        })
        .filter((row) => {
          const vals = Object.values(row).map((v) => (v == null ? "" : String(v).trim()));
          return vals.some((v) => v !== "" && v !== "0" && v !== "0.0" && v !== "0,0");
        });

      setUploadRowsCount(nonEmpty.length);
      setUploadCols(nonEmpty.length ? Object.keys(nonEmpty[0]) : []);
      setUploadProgress({ done: 0, total: nonEmpty.length });
      setUploadOpen(true);
      fileInputRef.current.__lastRows = nonEmpty;   // guardo las filas ya normalizadas
    } catch (err) {
      console.error("Error leyendo Excel:", err);
      alert("No se pudo leer el archivo. Asegúrate de que sea .xlsx o .xls");
    } finally {
      e.target.value = "";
    }
  };

  const subirEnLotes = async () => {
    const allRows = fileInputRef.current?.__lastRows || [];
    if (!allRows.length) return;
    setIsUploading(true);
    setUploadProgress({ done: 0, total: allRows.length });

    const BATCH = 1500;
    let okTotal = 0, failTotal = 0;

    try {
      for (let i = 0; i < allRows.length; i += BATCH) {
        const slice = allRows.slice(i, i + BATCH);
        const url = i === 0
          ? `${API}/api/cargar-registros-excel?replace=1`
          : `${API}/api/cargar-registros-excel`;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Rol": rol,
          },
          body: JSON.stringify({ registros: slice }),
        });

        let payload = {};
        try { payload = await res.json(); } catch {}

        if (!res.ok) {
          console.error("Lote falló:", payload);
          failTotal += slice.length;
        } else {
          okTotal += Number(payload?.insertados || 0);
          failTotal += Number(payload?.fallidos || 0);
        }

        setUploadProgress({
          done: Math.min(i + slice.length, allRows.length),
          total: allRows.length,
        });
      }

      alert(`Carga finalizada.\nInsertados: ${okTotal}\nFallidos: ${failTotal}`);
      setUploadOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error subiendo lotes:", err);
      alert("Hubo un problema durante la carga.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) delete fileInputRef.current.__lastRows;
    }
  };

  if (!isAdmin) {
    return (
      <div className="br">
        <div className="br-card">
          <h3>Acceso restringido</h3>
          <p>Este módulo es solo para <strong>ADMIN</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="base-registros br">
      <div className="br-card" style={{ marginBottom: 12 }}>
        <div className="br-toolbar" style={{ gridTemplateColumns: "repeat(6, minmax(200px, 1fr))" }}>
          <input className="br-input" placeholder="Buscar (q)" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="br-input" placeholder="Módulo" value={modulo} onChange={(e) => setModulo(e.target.value)} />
          <input className="br-input" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <input className="br-input" placeholder="Consultor" value={consultor} onChange={(e) => setConsultor(e.target.value)} />
          <input className="br-input" type="date" value={fdesde} onChange={(e) => setFdesde(e.target.value)} />
          <input className="br-input" type="date" value={fhasta} onChange={(e) => setFhasta(e.target.value)} />
        </div>

        <div className="br-actions">
          <button className="br-btn primary" onClick={handleBuscar} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
          <button className="br-btn" onClick={limpiarFiltros} disabled={loading}>Limpiar</button>

          <div className="br-spacer" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
          <button className="br-btn accent" onClick={triggerFile}>Cargar Excel…</button>
        </div>
      </div>

      <div className="br-card">
        <div className="br-table-wrap">
          <table className="br-table" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.key} style={c.w ? { width: `${c.w}ch` } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((c) => (<th key={c.key}>{c.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`br-${r.id ?? "x"}-${idx}`}>
                  {COLUMNS.map((c) => {
                    const text = formatCell(c.key, r[c.key]);
                    return (
                      <td key={c.key} className={`br-td ${c.cls || ""}`} title={c.cls?.includes("clip-") ? text : undefined}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td className="br-td" colSpan={COLUMNS.length}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="br-pager">
          <span className="br-pageinfo">Total: {total.toLocaleString()} • Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
          <div className="br-spacer" />
          <button className="br-btn icon" onClick={() => setPage(1)} disabled={!canPrev}>⏮</button>
          <button className="br-btn icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canPrev}>◀</button>
          <button className="br-btn icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={!canNext}>▶</button>
          <button className="br-btn icon" onClick={() => setPage(totalPages)} disabled={!canNext}>⏭</button>
          <select className="br-select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: 110 }}>
            {[50, 100, 200, 500, 1000].map((n) => (<option key={n} value={n}>{n}/página</option>))}
          </select>
        </div>
      </div>

      <Modal
        isOpen={uploadOpen}
        onRequestClose={() => (isUploading ? null : setUploadOpen(false))}
        className="br-modal"
        overlayClassName="br-modal-overlay"
        closeTimeoutMS={120}
        shouldCloseOnOverlayClick={!isUploading}
        ariaHideApp={false}
        parentSelector={() => document.querySelector(".base-registros") || document.body}
      >
        <div className="br-modal-head">
          <h3>Subir registros desde Excel</h3>
          <button className="br-close" onClick={() => !isUploading && setUploadOpen(false)} disabled={isUploading}>✖</button>
        </div>

        <div className="br-modal-body">
          <p><strong>Filas detectadas:</strong> {uploadRowsCount.toLocaleString()}</p>
          <p><strong>Columnas del archivo:</strong> {uploadCols.length ? uploadCols.join(", ") : "—"}</p>
          <p className="muted">Se subirá en lotes y al finalizar se recargará la tabla con lo guardado en la BD.</p>
          {isUploading && (
            <div style={{ marginTop: 10 }}>
              <div className="muted">Progreso: {uploadProgress.done}/{uploadProgress.total}</div>
              <div className="br-progress">
                <div className="br-progress-bar" style={{ width: uploadProgress.total ? `${(100*uploadProgress.done)/uploadProgress.total}%` : "0%" }} />
              </div>
            </div>
          )}
        </div>

        <div className="br-modal-foot">
          <button className="br-btn" onClick={() => setUploadOpen(false)} disabled={isUploading}>Cancelar</button>
          <button className="br-btn primary" onClick={subirEnLotes} disabled={isUploading || uploadRowsCount === 0}>
            {isUploading ? `Subiendo… ${uploadProgress.done}/${uploadProgress.total}` : `Subir ${uploadRowsCount.toLocaleString()} registros`}
          </button>
        </div>
      </Modal>
    </div>
  );
}


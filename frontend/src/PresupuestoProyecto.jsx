import React, { useEffect, useMemo, useState } from "react";

export default function ReporteHorasConsultorCliente() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [equipo, setEquipo] = useState("");
  const [loading, setLoading] = useState(false);

  const [clientes, setClientes] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalesCliente, setTotalesCliente] = useState({});
  const [totalGeneral, setTotalGeneral] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.append("desde", desde);
      if (hasta) params.append("hasta", hasta);
      if (equipo) params.append("equipo", equipo);

      const res = await fetch(`/api/reporte/horas-consultor-cliente?${params.toString()}`, {
        headers: {
          // tu app ya usa estos headers
          "X-User-Usuario": localStorage.getItem("usuario") || "",
          "X-User-Rol": localStorage.getItem("rol") || "ADMIN",
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error consultando reporte");

      setClientes(data.clientes || []);
      setRows(data.rows || []);
      setTotalesCliente(data.totalesCliente || {});
      setTotalGeneral(data.totalGeneral || 0);
    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, []);

  const headers = useMemo(() => {
    return ["Consultor", "Equipo", "Presupuesto", "Total", "Dif", "%Uso", ...clientes];
  }, [clientes]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Reporte: Horas por Consultor y Cliente</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <label>Desde</label><br />
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label><br />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div>
          <label>Equipo</label><br />
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)}>
            <option value="">(Todos)</option>
            <option value="BASIS">BASIS</option>
            <option value="FUNCIONAL">FUNCIONAL</option>
            <option value="IMPLEMENTACION">IMPLEMENTACION</option>
            <option value="CONSULTORIA">CONSULTORIA</option>
            <option value="ARQUITECTURA">ARQUITECTURA</option>
          </select>
        </div>

        <button onClick={fetchData} disabled={loading} style={{ height: 36, alignSelf: "end" }}>
          {loading ? "Cargando..." : "Consultar"}
        </button>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    position: h === "Consultor" ? "sticky" : "static",
                    left: h === "Consultor" ? 0 : undefined,
                    background: "#f3f3f3",
                    borderBottom: "1px solid #ddd",
                    padding: "10px 8px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    zIndex: h === "Consultor" ? 2 : 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.consultorId}>
                <td style={{
                  position: "sticky", left: 0, background: "white", zIndex: 1,
                  borderBottom: "1px solid #eee", padding: "8px", whiteSpace: "nowrap"
                }}>
                  {r.consultor}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px", whiteSpace: "nowrap" }}>
                  {r.equipo}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {Number(r.presupuestoHoras || 0).toFixed(2)}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {Number(r.totalHoras || 0).toFixed(2)}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {Number(r.diferenciaHoras || 0).toFixed(2)}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {r.porcentajeUso == null ? "—" : `${r.porcentajeUso.toFixed(2)}%`}
                </td>

                {clientes.map((c) => (
                  <td key={c} style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                    {Number(r.clientes?.[c] || 0).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}

            {/* footer totales */}
            <tr>
              <td style={{
                position: "sticky", left: 0, background: "#fafafa", zIndex: 1,
                borderTop: "2px solid #ddd", padding: "10px 8px", fontWeight: 700
              }}>
                TOTAL
              </td>
              <td style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px" }} />
              <td style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px" }} />
              <td style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px", fontWeight: 700 }}>
                {Number(totalGeneral || 0).toFixed(2)}
              </td>
              <td style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px" }} />
              <td style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px" }} />

              {clientes.map((c) => (
                <td key={c} style={{ background: "#fafafa", borderTop: "2px solid #ddd", padding: "10px 8px", fontWeight: 700 }}>
                  {Number(totalesCliente?.[c] || 0).toFixed(2)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

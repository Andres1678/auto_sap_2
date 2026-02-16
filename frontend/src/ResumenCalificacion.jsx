import React, { useMemo } from "react";
import "./DashboardGraficos.css";

function normalizar(txt) {
  return (txt ?? "")
    .toString()
    .replace(/\u00A0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function esEnProceso(row) {
  const estado = normalizar(row?.estado_oportunidad);
  return estado === "OPORTUNIDAD EN PROCESO";
}

function clasificarCalificacion(raw) {
  const k = normalizar(raw);
  if (!k) return null;

  
  if (k === "ALTO" || k === "ALTA") return "ALTO";
  if (k === "BAJO" || k === "BAJA") return "BAJO";
  if (k === "MEDIO" || k === "MEDIA") return "MEDIO";

  return null;
}

export default function ResumenCalificacion({ data }) {
  const resumen = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    let alto = 0,
      bajo = 0,
      medio = 0;

    for (const row of rows) {
      if (!esEnProceso(row)) continue;

      const c = clasificarCalificacion(row?.calificacion_oportunidad);
      if (c === "ALTO") alto++;
      else if (c === "BAJO") bajo++;
      else if (c === "MEDIO") medio++;
    }
    const total = alto + bajo + medio;
    return { alto, bajo, medio, total };
  }, [data]);

  return (
    <div className="calificacion-card">
      <h3 className="estado-title">Calificación de Oportunidades</h3>

      <table className="estado-table calificacion-table">
        <thead>
          <tr>
            <th>ALTO</th>
            <th>BAJO</th>
            <th>MEDIO</th>
            <th>TOTAL</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>{resumen.alto}</td>
            <td>{resumen.bajo}</td>
            <td>{resumen.medio}</td>
            <td>{resumen.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

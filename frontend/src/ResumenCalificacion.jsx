import React, { useMemo } from "react";
import "./DashboardGraficos.css";

export default function ResumenCalificacion({ data }) {

  const normalizar = (txt) =>
    (txt || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

  const resumen = useMemo(() => {
    let alto = 0;
    let bajo = 0;
    let medio = 0;

    data.forEach((row) => {
      const calificacion = normalizar(row.calificacion_oportunidad);

      if (calificacion === "ALTO") alto++;
      if (calificacion === "BAJO") bajo++;
      if (calificacion === "MEDIO") medio++;
    });

    return { alto, bajo, medio };
  }, [data]);

  return (
    <div className="calificacion-card">
      <h3 className="estado-title">Calificación de Oportunidades</h3>

      <table className="estado-table calificacion-table">
        <thead>
          <tr>
            <th></th>
            <th>ALTO</th>
            <th>BAJO</th>
            <th>MEDIO</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td><strong>Cantidad</strong></td>
            <td>{resumen.alto}</td>
            <td>{resumen.bajo}</td>
            <td>{resumen.medio}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

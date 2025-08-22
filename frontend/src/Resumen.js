import React, { useEffect, useState } from 'react';

const ResumenHoras = () => {
  const [resumen, setResumen] = useState([]);

  useEffect(() => {
    const fetchResumen = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/resumen-horas');
        const data = await res.json();
        setResumen(data);
      } catch (error) {
        console.error('Error al obtener resumen:', error);
      }
    };

    fetchResumen();
  }, []);

  return (
    <div style={styles.container}>
      <h2>Resumen de Horas por Consultor</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Consultor</th>
            <th>Fecha</th>
            <th>Total Horas</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {resumen.map((r, idx) => (
            <tr key={idx}>
              <td>{r.consultor}</td>
              <td>{r.fecha}</td>
              <td>{r.total_horas}</td>
              <td style={{ color: r.estado === 'Al día' ? 'green' : 'red' }}>
                {r.estado}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


export default ResumenHoras;

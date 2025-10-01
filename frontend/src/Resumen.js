import React, { useEffect, useState } from 'react';

const ResumenHoras = () => {
  const [resumen, setResumen] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResumen = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/resumen-horas');
        const data = await res.json();

        const ordenado = (Array.isArray(data) ? data : [])
          .slice()
          .sort((a, b) => {
            const da = new Date(a.fecha || '1970-01-01');
            const db = new Date(b.fecha || '1970-01-01');
            return da - db; 
          });

        setResumen(ordenado);
      } catch (e) {
        console.error('Error al obtener resumen:', e);
        setError('No se pudo cargar el resumen');
      }
    };

    fetchResumen();
  }, []);

  return (
    <div style={styles.container}>
      <h2>Resumen de Horas por Consultor</h2>

      {error && <div style={styles.error}>{error}</div>}

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
          {!resumen.length && !error && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: '#666' }}>
                Sin datos
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const styles = {
  container: { padding: 16, maxWidth: 900, margin: '0 auto' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  error: {
    margin: '8px 0 16px',
    padding: '8px 12px',
    background: '#ffe6e8',
    color: '#a40010',
    border: '1px solid #f5c2c7',
    borderRadius: 8,
  },
};

export default ResumenHoras;

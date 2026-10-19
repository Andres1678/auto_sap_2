// Cada identificador completo cuenta una vez; no se separan campos compuestos.
export function casoValido(value) {
  const text = String(value ?? '').trim();
  return ['', '0', 'N/A', 'NA', 'NULL', 'NONE', '-', 'SIN CASO'].includes(text.toUpperCase()) ? '' : text;
}

export function ocupacionDeRegistro(row) {
  const codigo = String(row.ocupacion_codigo ?? '').trim();
  const nombre = String(row.ocupacion_nombre ?? '').trim();
  return {
    key: row.ocupacion_id != null ? `id:${row.ocupacion_id}` : `texto:${codigo}|${nombre}`,
    label: [codigo, nombre].filter(Boolean).join(' - ') || 'Sin ocupación',
  };
}

export function resumirRegistros(rows) {
  const cliente = new Set();
  const interno = new Set();
  let horas = 0, registrosCliente = 0, registrosInterno = 0;
  rows.forEach((r) => {
    const c = casoValido(r.nroCasoCliente ?? r.nro_caso_cliente);
    const i = casoValido(r.nroCasoInterno ?? r.nro_caso_interno);
    if (c) { cliente.add(c); registrosCliente += 1; }
    if (i) { interno.add(i); registrosInterno += 1; }
    const h = Number(r.tiempoInvertido ?? r.tiempo_invertido ?? r.total_horas ?? 0);
    if (Number.isFinite(h)) horas += h;
  });
  return {
    registros: rows.length, horas,
    casosCliente: cliente.size, casosInterno: interno.size,
    registrosCliente, registrosInterno,
    totalCasos: cliente.size + interno.size,
  };
}

export function agruparOcupaciones(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const ocupacion = ocupacionDeRegistro(r);
    if (!map.has(ocupacion.key)) map.set(ocupacion.key, { ...ocupacion, rows: [] });
    map.get(ocupacion.key).rows.push(r);
  });
  return [...map.values()].map((o) => ({ ...o, ...resumirRegistros(o.rows) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

// Se agrupa cada campo por separado para no duplicar horas mediante cruces.
export function agruparCasos(rows, campo) {
  const map = new Map();
  rows.forEach((row) => {
    const alias = campo === 'nroCasoCliente' ? 'nro_caso_cliente' : 'nro_caso_interno';
    const numero = casoValido(row[campo] ?? row[alias]);
    if (!numero) return;
    if (!map.has(numero)) map.set(numero, { numero, rows: [] });
    map.get(numero).rows.push(row);
  });
  return [...map.values()].map((group) => {
    const resumen = resumirRegistros(group.rows);
    const fechas = group.rows.map((r) => String(r.fecha || '')).filter(Boolean).sort();
    return {
      numero: group.numero,
      registros: group.rows.length,
      horas: resumen.horas,
      clientes: [...new Set(group.rows.map((r) => String(r.cliente || '').trim()).filter(Boolean))],
      ocupaciones: [...new Set(group.rows.map((r) => ocupacionDeRegistro(r).label))],
      desde: fechas[0] || '',
      hasta: fechas[fechas.length - 1] || '',
    };
  }).sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }));
}

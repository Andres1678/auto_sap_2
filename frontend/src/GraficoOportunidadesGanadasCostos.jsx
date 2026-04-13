import React from "react";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function fmtMoney(v) {
  return money.format(Number(v || 0));
}

export default function GraficoOportunidadesGanadasCostos({ rows = [] }) {
  const max = Math.max(...rows.map((r) => Number(r?.mrcNormalizado || 0)), 0);

  return (
    <section className="dc-panel">
      <div className="dc-section-head">
        <h3>Oportunidades ganadas por PRC</h3>
        <span>{rows.length} PRC</span>
      </div>

      {!rows.length ? (
        <div className="dc-empty">Sin oportunidades ganadas para los filtros aplicados.</div>
      ) : (
        <>
          <div className="dc-chart-list">
            {rows.map((item) => {
              const value = Number(item?.mrcNormalizado || 0);
              const width = max > 0 ? (value / max) * 100 : 0;

              return (
                <div className="dc-chart-row" key={item.name}>
                  <div className="dc-chart-label" title={item.name}>
                    {item.name}
                  </div>

                  <div className="dc-chart-bar-wrap">
                    <div
                      className="dc-chart-bar"
                      style={{ width: `${Math.max(width, 4)}%` }}
                    />
                  </div>

                  <div className="dc-chart-value">{fmtMoney(value)}</div>
                </div>
              );
            })}
          </div>

          <div className="dc-table-wrap" style={{ marginTop: 16 }}>
            <table className="dc-table dc-table-small">
              <thead>
                <tr>
                  <th>PRC</th>
                  <th className="num">Cant.</th>
                  <th className="num">OTC</th>
                  <th className="num">MRC</th>
                  <th className="num">MRC Normalizado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`tbl-${item.name}`}>
                    <td>{item.name}</td>
                    <td className="num">{item.count || 0}</td>
                    <td className="num">{fmtMoney(item.otc)}</td>
                    <td className="num">{fmtMoney(item.mrc)}</td>
                    <td className="num">{fmtMoney(item.mrcNormalizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
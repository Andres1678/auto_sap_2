import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Select from "react-select";

import "./OtsServicio.css";
import ModalOtServicio from "./ModalOtServicio";
import {
  eliminarOtServicio,
  listarPrincipales,
  obtenerCatalogosOt,
  obtenerDetallePrincipal,
} from "./lib/otsServicioApi";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

function principalFromQuery() {
  return new URLSearchParams(window.location.search).get("principal") || "";
}

function exportCsv(principal, rows) {
  const columns = [
    ["codigo_ot", "CÓDIGO OT"],
    ["numero_ot", "NÚMERO OT"],
    ["tipo", "TIPO"],
    ["area", "ÁREA"],
    ["nombre_servicio", "SERVICIO"],
    ["otc", "OTC"],
    ["mrc", "MRC MENSUAL"],
    ["cantidad_meses", "MESES"],
    ["mrc_contrato", "MRC CONTRATO"],
    ["mrc_normalizado", "MRC NORMALIZADO"],
    ["valor_total", "VALOR TOTAL"],
    ["estado", "ESTADO"],
  ];

  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const lines = [columns.map(([, label]) => escape(label)).join(";")];

  rows.forEach((row) => {
    const mapped = {
      ...row,
      tipo: row.tipo_ot?.nombre || "",
      area: row.area_ot?.nombre || "",
    };
    lines.push(columns.map(([key]) => escape(mapped[key])).join(";"));
  });

  const blob = new Blob(["\ufeff" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ots_${principal?.codigo_control || principal?.id || "principal"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function OtsServicio() {
  const [principales, setPrincipales] = useState([]);
  const [principalId, setPrincipalId] = useState(principalFromQuery());
  const [principal, setPrincipal] = useState(null);
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [catalogos, setCatalogos] = useState({ tipos: [], areas: [], estados: [] });
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOt, setEditOt] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    Promise.all([listarPrincipales(), obtenerCatalogosOt()])
      .then(([principalesData, catalogosData]) => {
        setPrincipales(Array.isArray(principalesData) ? principalesData : []);
        setCatalogos(catalogosData || { tipos: [], areas: [], estados: [] });
      })
      .catch((error) => {
        Swal.fire("Error", error.message || "No se pudieron cargar los catálogos.", "error");
      });
  }, []);

  const loadDetail = useCallback(async () => {
    if (!principalId) {
      setPrincipal(null);
      setRows([]);
      setResumen(null);
      return;
    }

    try {
      setLoading(true);
      const data = await obtenerDetallePrincipal(principalId, showInactive);
      setPrincipal(data.principal || null);
      setRows(data.ots || []);
      setResumen(data.resumen || null);
    } catch (error) {
      Swal.fire("Error", error.message || "No se pudo cargar la principal.", "error");
    } finally {
      setLoading(false);
    }
  }, [principalId, showInactive]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (principalId) url.searchParams.set("principal", principalId);
    else url.searchParams.delete("principal");
    window.history.replaceState({}, "", url.toString());
  }, [principalId]);

  const principalOptions = useMemo(
    () =>
      principales.map((item) => ({
        value: item.id,
        label: `${item.codigo_control || item.id} · ${item.nombre_cliente || "SIN CLIENTE"} · ${item.servicio || "SIN SERVICIO"}`,
      })),
    [principales]
  );

  const removeOt = async (ot) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Desactivar OT",
      html: `La OT <b>${ot.codigo_ot}</b> dejará de sumar en el consolidado.`,
      showCancelButton: true,
      confirmButtonText: "Desactivar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await eliminarOtServicio(ot.id);
      await loadDetail();
      Swal.fire("Listo", "La OT fue desactivada.", "success");
    } catch (error) {
      Swal.fire("Error", error.message || "No se pudo desactivar.", "error");
    }
  };

  const openCreate = () => {
    setEditOt(null);
    setModalOpen(true);
  };

  const openEdit = (ot) => {
    setEditOt(ot);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditOt(null);
  };

  return (
    <main className="ots-page">
      <section className="ots-page__hero">
        <div>
          <span className="ots-page__eyebrow">TABLERO DE OPORTUNIDADES</span>
          <h1>Gestión de OTs de servicio</h1>
          <p>
            Selecciona una oportunidad principal y administra sus OTs, OTC, MRC y valores finales.
          </p>
        </div>

        <div className="ots-page__selector">
          <label>Oportunidad principal</label>
          <Select
            options={principalOptions}
            value={principalOptions.find(
              (item) => String(item.value) === String(principalId)
            ) || null}
            onChange={(option) => setPrincipalId(option?.value || "")}
            placeholder="Selecciona una principal"
            isClearable
            classNamePrefix="principal-select"
          />
        </div>
      </section>

      {!principalId && (
        <section className="ots-empty">
          <strong>Selecciona una oportunidad principal</strong>
          <span>La pantalla cargará su cliente, servicio, moneda y OTs asociadas.</span>
        </section>
      )}

      {principalId && loading && <section className="ots-empty">Cargando información...</section>}

      {principal && !loading && (
        <>
          <section className="ots-principal-card">
            <div>
              <span>Código principal</span>
              <strong>{principal.codigo_control || principal.id}</strong>
            </div>
            <div>
              <span>Cliente</span>
              <strong>{principal.cliente || "-"}</strong>
            </div>
            <div className="ots-principal-card__service">
              <span>Servicio</span>
              <strong>{principal.servicio || "-"}</strong>
            </div>
            <div>
              <span>Moneda</span>
              <strong>{principal.moneda || "COP"}</strong>
            </div>
          </section>

          <section className="ots-cards">
            <article>
              <span>OTs activas</span>
              <strong>{resumen?.cantidad_activas || 0}</strong>
              <small>{resumen?.cantidad_total || 0} registradas</small>
            </article>
            <article>
              <span>OTC total</span>
              <strong>{money.format(resumen?.otc_total || 0)}</strong>
            </article>
            <article>
              <span>MRC mensual</span>
              <strong>{money.format(resumen?.mrc_mensual_total || 0)}</strong>
            </article>
            <article>
              <span>MRC contrato</span>
              <strong>{money.format(resumen?.mrc_contrato_total || 0)}</strong>
            </article>
            <article>
              <span>MRC normalizado</span>
              <strong>{money.format(resumen?.mrc_normalizado || 0)}</strong>
            </article>
            <article className="ots-cards__total">
              <span>Valor final</span>
              <strong>{money.format(resumen?.valor_final || 0)}</strong>
            </article>
          </section>

          <section className="ots-toolbar">
            <div>
              <button type="button" className="ot-btn ot-btn--primary" onClick={openCreate}>
                + Crear OT de servicio
              </button>
              <button type="button" className="ot-btn ot-btn--secondary" onClick={loadDetail}>
                Actualizar
              </button>
              <button
                type="button"
                className="ot-btn ot-btn--ghost"
                onClick={() => exportCsv(principal, rows)}
                disabled={!rows.length}
              >
                Exportar CSV
              </button>
            </div>

            <label className="ots-toolbar__check">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Mostrar inactivas
            </label>
          </section>

          <section className="ots-table-wrap">
            <table className="ots-table">
              <thead>
                <tr>
                  <th>ID OT</th>
                  <th>Número OT</th>
                  <th>Tipo</th>
                  <th>Área</th>
                  <th>Servicio</th>
                  <th>OTC</th>
                  <th>MRC mensual</th>
                  <th>Meses</th>
                  <th>MRC contrato</th>
                  <th>MRC normalizado</th>
                  <th>Valor total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr>
                    <td colSpan="13" className="ots-table__empty">
                      La oportunidad principal todavía no tiene OTs de servicio.
                    </td>
                  </tr>
                )}

                {rows.map((ot) => (
                  <tr key={ot.id} className={!ot.activo ? "is-inactive" : ""}>
                    <td><strong>{ot.codigo_ot}</strong></td>
                    <td>{ot.numero_ot || "Pendiente"}</td>
                    <td>{ot.tipo_ot?.nombre || "-"}</td>
                    <td>{ot.area_ot?.nombre || "-"}</td>
                    <td className="ots-table__service">{ot.nombre_servicio}</td>
                    <td>{money.format(ot.otc || 0)}</td>
                    <td>{money.format(ot.mrc || 0)}</td>
                    <td>{ot.cantidad_meses}</td>
                    <td>{money.format(ot.mrc_contrato || 0)}</td>
                    <td>{money.format(ot.mrc_normalizado || 0)}</td>
                    <td className="ots-table__total">{money.format(ot.valor_total || 0)}</td>
                    <td>
                      <span className={`ot-status ot-status--${String(ot.estado || "").toLowerCase().replaceAll(" ", "-")}`}>
                        {ot.estado}
                      </span>
                    </td>
                    <td>
                      <div className="ots-table__actions">
                        <button type="button" onClick={() => openEdit(ot)}>Editar</button>
                        {ot.activo && (
                          <button type="button" className="danger" onClick={() => removeOt(ot)}>
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {modalOpen && principal && (
        <ModalOtServicio
          principal={principal}
          catalogos={catalogos}
          editOt={editOt}
          onClose={closeModal}
          onSaved={async () => {
            closeModal();
            await loadDetail();
          }}
        />
      )}
    </main>
  );
}

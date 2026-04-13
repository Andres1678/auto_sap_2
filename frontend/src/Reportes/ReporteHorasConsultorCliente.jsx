import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "../lib/api";
import "./ReporteHorasConsultorCliente.css";
import PresupuestoConsultorImport from "../PresupuestoConsultorImport";

const moneyCOP = (n) => {
  const v = Number(n || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtHours = (n) => `${Number(n || 0).toFixed(2)} h`;

const ecuacionValorHora = (vrPerfil, horasBaseMes, valorHora) =>
  `${moneyCOP(vrPerfil)} / ${fmtHours(horasBaseMes)} = ${moneyCOP(valorHora)}`;

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("userData") || "{}");
  } catch {
    return {};
  }
}

function getAuthHeaders() {
  const u = getStoredUser();
  const usuario =
    u?.usuario ||
    u?.user?.usuario ||
    "";

  const rol =
    u?.rol ||
    u?.user?.rol ||
    u?.rol_ref?.nombre ||
    "";

  return {
    "X-User-Usuario": String(usuario || "").trim().toLowerCase(),
    "X-User-Rol": String(rol || "").trim().toUpperCase(),
  };
}

export default function PresupuestoYCostoCliente() {
  const today = new Date();
  const [anioResumen, setAnioResumen] = useState(today.getFullYear());
  const [mesResumen, setMesResumen] = useState(today.getMonth() + 1);

  const [resumenPresupuesto, setResumenPresupuesto] = useState([]);
  const [loadingResumenPresupuesto, setLoadingResumenPresupuesto] = useState(false);

  const cargarResumenPresupuesto = async (anioArg = anioResumen, mesArg = mesResumen) => {
    setLoadingResumenPresupuesto(true);
    try {
      const res = await jfetch(`/presupuestos/consultor?anio=${anioArg}&mes=${mesArg}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }

      const data = await res.json();

      const normalizados = (Array.isArray(data) ? data : []).map((item) => {
        const vrPerfil = Number(item?.vrPerfil || 0);
        const horasBaseMes = Number(item?.horasBaseMes || 0);
        const valorHora =
          Number(item?.valorHora || (horasBaseMes > 0 ? vrPerfil / horasBaseMes : 0));

        return {
          consultorId: item?.consultorId,
          nombre: item?.nombre || "—",
          usuario: item?.usuario || "—",
          vrPerfil,
          horasBaseMes,
          valorHora,
          diasHabilesMes:
            item?.diasHabilesMes ??
            item?.diasLaborablesMes ??
            item?.dias_laborables_mes ??
            "—",
        };
      });

      setResumenPresupuesto(normalizados);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error resumen presupuesto",
        text: e.message || "No se pudo cargar el resumen del presupuesto",
      });
      setResumenPresupuesto([]);
    } finally {
      setLoadingResumenPresupuesto(false);
    }
  };

  useEffect(() => {
    cargarResumenPresupuesto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarResumenPresupuesto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anioResumen, mesResumen]);

  const handleImportedBudget = async ({ anio, mes }) => {
    setAnioResumen(anio);
    setMesResumen(mes);
    await cargarResumenPresupuesto(anio, mes);
  };

  return (
    <div className="rhc-shell">
      <div className="rhc-import-wrap">
        <PresupuestoConsultorImport onImported={handleImportedBudget} />
      </div>

      <div className="rhc-head">
        <div>
          <h2 className="rhc-title">Resumen presupuesto del período</h2>
          <p className="rhc-sub">
            Lista de consultores con salario, días hábiles del mes, horas base y ecuación del valor hora.
          </p>
        </div>

        <div className="rhc-actions" style={{ gap: 10 }}>
          <div className="rhc-field rhc-mini-field">
            <label>Año</label>
            <input
              type="number"
              value={anioResumen}
              onChange={(e) => setAnioResumen(Number(e.target.value || 0))}
              min={2000}
            />
          </div>

          <div className="rhc-field rhc-mini-field">
            <label>Mes</label>
            <input
              type="number"
              min={1}
              max={12}
              value={mesResumen}
              onChange={(e) => setMesResumen(Number(e.target.value || 0))}
            />
          </div>

          <button
            className="rhc-btn"
            onClick={() => cargarResumenPresupuesto()}
            disabled={loadingResumenPresupuesto}
          >
            {loadingResumenPresupuesto ? "Cargando..." : "Actualizar resumen"}
          </button>
        </div>
      </div>

      <div className="rhc-card">
        <div className="rhc-tableWrap">
          <table className="rhc-table">
            <thead>
              <tr>
                <th className="sticky-left">Consultor</th>
                <th>Usuario</th>
                <th className="num">Salario</th>
                <th className="num">Días hábiles</th>
                <th className="num">Horas base mes</th>
                <th>Ecuación valor hora</th>
                <th className="num sticky-right">Valor hora</th>
              </tr>
            </thead>

            <tbody>
              {resumenPresupuesto.map((p) => (
                <tr key={p.consultorId}>
                  <td className="sticky-left">{p.nombre}</td>
                  <td>{p.usuario}</td>
                  <td className="num">{moneyCOP(p.vrPerfil)}</td>
                  <td className="num">{p.diasHabilesMes}</td>
                  <td className="num">{fmtHours(p.horasBaseMes)}</td>
                  <td className="rhc-eq">{ecuacionValorHora(p.vrPerfil, p.horasBaseMes, p.valorHora)}</td>
                  <td className="num sticky-right">{moneyCOP(p.valorHora)}</td>
                </tr>
              ))}

              {!resumenPresupuesto.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, textAlign: "center" }}>
                    Sin consultores para el período seleccionado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
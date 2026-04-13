import React, { useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import "./PresupuestoConsultorImport.css";

const getUserData = () => {
  try {
    return JSON.parse(localStorage.getItem("userData") || "{}");
  } catch {
    return {};
  }
};

const hasPerm = (code) => {
  const u = getUserData();
  const perms = u?.permisos || [];
  const codes = Array.isArray(perms)
    ? perms
        .map((p) => (typeof p === "string" ? p : p?.codigo))
        .filter(Boolean)
    : [];
  return codes.includes(code);
};

export default function PresupuestoConsultorImport({ onImported }) {
  const today = new Date();
  const [anio, setAnio] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState("");

  const disabled = useMemo(() => loading || !file, [loading, file]);

  const resetInput = () => {
    setFile(null);
    const input = document.getElementById("budgetFileInput");
    if (input) input.value = "";
  };

  const subir = async () => {
    if (!hasPerm("PRESUPUESTO_CONSULTOR_IMPORTAR")) {
      Swal.fire({
        icon: "error",
        title: "Sin permiso",
        text: "No puedes importar presupuestos.",
      });
      return;
    }

    if (!file) {
      Swal.fire({
        icon: "warning",
        title: "Falta archivo",
        text: "Selecciona el Excel.",
      });
      return;
    }

    const anioNum = Number(anio || 0);
    const mesNum = Number(mes || 0);

    if (!anioNum || anioNum < 2000) {
      Swal.fire({
        icon: "warning",
        title: "Año inválido",
        text: "Ingresa un año válido.",
      });
      return;
    }

    if (!mesNum || mesNum < 1 || mesNum > 12) {
      Swal.fire({
        icon: "warning",
        title: "Mes inválido",
        text: "Mes debe estar entre 1 y 12.",
      });
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("anio", String(anioNum));
    fd.append("mes", String(mesNum));
    if (sheet.trim()) fd.append("sheet", sheet.trim());

    setLoading(true);

    try {
      const res = await jfetch("/presupuestos/consultor/import-excel", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
      }

      const nf = (data?.notFound || [])
        .map(
          (x) =>
            `Fila ${x.row}: ${x.nombre}${x.cedula ? ` (CC ${x.cedula})` : ""}`
        )
        .join("<br/>");

      const inv = (data?.invalidRows || [])
        .map((x) => `Fila ${x.row}: ${x.nombre} (${x.valor})`)
        .join("<br/>");

      Swal.fire({
        icon: "success",
        title: "Importación completada",
        html: `
          <div style="text-align:left">
            <b>Periodo:</b> ${data?.anio ?? anioNum}-${String(data?.mes ?? mesNum).padStart(2, "0")}<br/>
            <b>Columna valor detectada:</b> ${data?.columnaValorDetectada ?? "N/D"}<br/>
            <b>Horas base calculadas:</b> ${data?.horasBaseCalculadas ?? "N/D"}<br/>
            <b>Días laborables:</b> ${data?.diasLaborablesMes ?? "N/D"}<br/>
            <b>Festivos:</b> ${data?.diasFestivosMes ?? "N/D"}<br/>
            <b>Creados:</b> ${data?.created ?? 0}<br/>
            <b>Actualizados:</b> ${data?.updated ?? 0}<br/>
            <b>No encontrados:</b> ${data?.notFoundCount ?? 0}<br/>
            <b>Inválidos:</b> ${data?.invalidCount ?? 0}<br/>
            ${nf ? `<hr/><b>No encontrados:</b><br/>${nf}` : ""}
            ${inv ? `<hr/><b>Inválidos:</b><br/>${inv}` : ""}
          </div>
        `,
        width: 760,
      });

      if (typeof onImported === "function") {
        await Promise.resolve(onImported({ anio: anioNum, mes: mesNum }));
      }

      resetInput();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e.message || "No se pudo importar",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pci-shell">
      <h2 className="pci-title">Importar presupuesto por consultor y periodo</h2>

      <p className="pci-sub">
        El Excel debe contener estas columnas:
        <b> NOMBRE COLABORADOR</b>, <b>CEDULA</b> y <b>TOTAL del mes</b>.
        El sistema calculará automáticamente horas base y valor hora.
      </p>

      <div className="pci-card">
        <div className="pci-grid">
          <div className="pci-field col-2">
            <label>Año</label>
            <input
              className="pci-input"
              type="number"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              min={2000}
            />
          </div>

          <div className="pci-field col-2">
            <label>Mes</label>
            <input
              className="pci-input"
              type="number"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              min={1}
              max={12}
            />
          </div>

          <div className="pci-field col-5">
            <label>Archivo Excel</label>
            <input
              id="budgetFileInput"
              className="pci-input pci-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="col-3">
            <button className="pci-btn" onClick={subir} disabled={disabled}>
              {loading ? "Importando..." : "Importar"}
            </button>
          </div>

          <div className="pci-field col-3">
            <label>Hoja (opcional)</label>
            <input
              className="pci-input"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="Ej: Hoja1"
            />
          </div>
        </div>

        <div className="pci-hint">
          <b>Columnas esperadas del Excel:</b>
          <br />
          <b>NOMBRE COLABORADOR</b>, <b>CEDULA</b> y <b>TOTAL MES</b>.
          <br />
          Ejemplo válido: <b>TOTAL ABRIL</b>.
          <br />
          <b>Importante:</b> el sistema no tomará como fuente principal
          <b> DIAS HABILES</b>, <b>VALOR DIA</b> ni <b>VALOR HORA</b>.
        </div>
      </div>
    </div>
  );
}
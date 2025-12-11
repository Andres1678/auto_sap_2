import React, { useEffect, useState, useMemo } from "react";
import "./ResumenHoras.css";
import { jfetch } from "./lib/api";

const API_URL = "/resumen-horas";


function normalizarFecha(fechaStr) {
  if (!fechaStr) return null;

  
  const soloFecha = fechaStr.split(" ")[0];
  const [y, m, d] = soloFecha.split("-").map(Number);

  const fecha = new Date(y, m - 1, d); 

  return isNaN(fecha.getTime()) ? null : fecha;
}

export default function Resumen({ userData }) {
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [consultorActivoId, setConsultorActivoId] = useState(null);
  const [error, setError] = useState("");

 
  const fetchResumen = async (rolActual, usuarioActual) => {
    try {
      const res = await jfetch(API_URL, {
        method: "GET",
        headers: {
          "X-User-Usuario": usuarioActual,
          "X-User-Rol": rolActual,
        },
      });

      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data = await res.json();

      
      const agrupado = Object.values(
        data.reduce((acc, r) => {
          const key = String(r.consultor_id);

          if (!acc[key]) {
            acc[key] = {
              consultor: r.consultor,
              consultor_id: r.consultor_id,
              registros: [],
            };
          }

          acc[key].registros.push({
            fecha: r.fecha,
            fechaNorm: normalizarFecha(r.fecha),
            total_horas: Number(r.total_horas || 0),
            estado: r.estado,
            consultor_id: r.consultor_id,
          });

          return acc;
        }, {})
      );

      setResumen(agrupado);
    } catch (err) {
      console.error("❌ Error al obtener resumen:", err);
      setError("No se pudo cargar el resumen");
    }
  };

  
  useEffect(() => {
    if (userData) {
      const rolUser =
        userData?.rol_ref?.nombre?.toUpperCase?.() ||
        userData?.rol?.toUpperCase?.() ||
        "USER";

      const usuarioActual =
        userData?.usuario ||
        userData?.user?.usuario ||
        userData?.nombre ||
        "";

      const idConsultor =
        userData?.consultor_id ||
        userData?.user?.consultor_id ||
        userData?.id ||
        null;

      setRol(rolUser);
      setConsultorActivoId(idConsultor);

      fetchResumen(rolUser, usuarioActual);
    } else {
      setError("No se detectó sesión activa.");
    }
  }, [userData]);

 
  const datosVisibles = useMemo(() => {
    if (rol === "ADMIN") return resumen;

    return resumen.filter(
      (r) => Number(r.consultor_id) === Number(consultorActivoId)
    );
  }, [rol, resumen, consultorActivoId]);

  
  const CalendarioConsultor = ({ consultor }) => {
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const [mesActual, setMesActual] = useState(mesInicio);
    const [animacion, setAnimacion] = useState("slideInLeft");

    const diasMes = useMemo(() => {
      const y = mesActual.getFullYear();
      const m = mesActual.getMonth();
      const total = new Date(y, m + 1, 0).getDate();
      return Array.from({ length: total }, (_, i) => i + 1);
    }, [mesActual]);

    const nombreMes = mesActual.toLocaleString("es-ES", {
      month: "long",
      year: "numeric",
    });

    
    const registrosMes = consultor.registros.filter((r) => {
      const f = r.fechaNorm;
      if (!f) return false;

      return (
        f.getMonth() === mesActual.getMonth() &&
        f.getFullYear() === mesActual.getFullYear()
      );
    });

    const totalMes = registrosMes.reduce(
      (acc, r) => acc + (r.total_horas || 0),
      0
    );

    const renderDia = (dia) => {
      const f2 = new Date(
        mesActual.getFullYear(),
        mesActual.getMonth(),
        dia
      ).toDateString();

      const registro = registrosMes.find(
        (r) => r.fechaNorm?.toDateString() === f2
      );

      if (!registro)
        return (
          <div key={dia} className="cal-dia none" title="Sin registro">
            {dia}
          </div>
        );

      const horas = Number(registro.total_horas || 0);
      const estado = horas >= 8 ? "ok" : horas > 0 ? "warn" : "none";

      return (
        <div
          key={dia}
          className={`cal-dia ${estado}`}
          title={`${registro.fecha} • ${horas}h`}
        >
          {dia}
          <small>{horas ? `${horas}h` : ""}</small>
        </div>
      );
    };

    return (
      <div className="resumen-card">
        <div className="cal-head">
          <h3>{consultor.consultor}</h3>

          <div className="cal-nav">
            <button
              className="cal-btn"
              onClick={() => {
                setAnimacion("slideInLeft");
                setMesActual(
                  new Date(
                    mesActual.getFullYear(),
                    mesActual.getMonth() - 1,
                    1
                  )
                );
              }}
            >
              ◀
            </button>

            <span>
              {nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}
            </span>

            <button
              className="cal-btn"
              onClick={() => {
                setAnimacion("slideInRight");
                setMesActual(
                  new Date(
                    mesActual.getFullYear(),
                    mesActual.getMonth() + 1,
                    1
                  )
                );
              }}
            >
              ▶
            </button>
          </div>

          <span className="total">Total: {totalMes} h</span>
        </div>

        <div className={`cal-wrapper ${animacion}`}>
          <div className="cal-days-header">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>

          <div className="cal-grid">{diasMes.map((dia) => renderDia(dia))}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="resumen-wrapper">
      <h2 className="resumen-titulo">Resumen de Horas Mensual</h2>

      {error && <div className="resumen-error">{error}</div>}

      {datosVisibles.length === 0 ? (
        <p className="resumen-empty">No hay datos para mostrar</p>
      ) : (
        <div className="resumen-grid">
          {datosVisibles.map((consultor, idx) => (
            <CalendarioConsultor key={idx} consultor={consultor} />
          ))}
        </div>
      )}
    </div>
  );
}

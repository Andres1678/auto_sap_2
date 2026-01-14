import React, { useEffect, useMemo, useState, useCallback } from "react";
import "./ResumenHoras.css";
import { getVisibleUsernames, EXCEPCION_8H_USERS } from "./lib/visibility";

const API_URL = "/resumen-horas"; // 👈 importante: acá va /api

// Extrae YYYY-MM-DD de varios formatos (incluye ISO con T/Z)
function extraerYMD(fechaStr) {
  if (!fechaStr) return null;
  const match = String(fechaStr).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizarFecha(fechaStr) {
  const ymd = extraerYMD(fechaStr);
  if (!ymd) return null;

  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(y, m - 1, d); // local (evita líos UTC)
  return isNaN(fecha.getTime()) ? null : fecha;
}

function keyYMDFromDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Convierte getDay() (Dom=0) a índice con Lunes=0 ... Domingo=6
function mondayIndex(jsGetDay) {
  return (jsGetDay + 6) % 7;
}

export default function Resumen({ userData }) {
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [error, setError] = useState("");

  // ✅ visibles por regla local (lo que ya tienes en tu lib)
  const visibleUsernames = useMemo(() => {
    const u = String(usuarioActual || "").trim().toLowerCase();
    return u ? getVisibleUsernames(u) : [];
  }, [usuarioActual]);

  // ✅ Fetch REAL (no jfetch) para que NO se coma el querystring
  const fetchResumen = useCallback(async () => {
    if (!rol || !usuarioActual) return;

    try {
      const visibles = (visibleUsernames || []).filter(Boolean).join(",");

      const url =
        `${API_URL}` +
        `?usuario=${encodeURIComponent(usuarioActual)}` +
        `&rol=${encodeURIComponent(rol)}` +
        (visibles ? `&visibles=${encodeURIComponent(visibles)}` : "") +
        `&ts=${Date.now()}`; // cache buster

      console.log("📌 fetchResumen URL:", url);

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data = await res.json().catch(() => []);

      const rows = Array.isArray(data) ? data : [];

      // Agrupa por consultor_id para pintar tarjetas/calendarios
      const agrupado = Object.values(
        rows.reduce((acc, r) => {
          const cid = String(r.consultor_id ?? "NA");

          if (!acc[cid]) {
            acc[cid] = {
              consultor: r.consultor,
              consultor_id: r.consultor_id,
              registros: [],
            };
          }

          const fechaNorm = normalizarFecha(r.fecha);

          acc[cid].registros.push({
            fecha: r.fecha,
            fechaNorm,
            fechaKey: fechaNorm ? keyYMDFromDate(fechaNorm) : extraerYMD(r.fecha),
            total_horas: Number(r.total_horas || 0),
            estado: r.estado,
            consultor_id: r.consultor_id,
            usuario: r.usuario || r.usuario_consultor || r.username || null,
          });

          return acc;
        }, {})
      );

      setResumen(agrupado);
      setError("");
    } catch (err) {
      console.error("❌ Error al obtener resumen:", err);
      setError("No se pudo cargar el resumen");
      setResumen([]);
    }
  }, [rol, usuarioActual, visibleUsernames]);

  // Inicializa rol/usuario desde userData
  useEffect(() => {
    if (!userData) {
      setError("No se detectó sesión activa.");
      return;
    }

    const rolUser =
      userData?.rol_ref?.nombre?.toUpperCase?.() ||
      userData?.rol?.toUpperCase?.() ||
      userData?.user?.rol?.toUpperCase?.() ||
      "USER";

    const usuario = String(
      userData?.usuario || userData?.user?.usuario || ""
    )
      .trim()
      .toLowerCase();

    if (!usuario) {
      setError("No se detectó el usuario de sesión.");
      return;
    }

    setRol(rolUser);
    setUsuarioActual(usuario);
  }, [userData]);

  // Primer fetch cuando ya tengo rol/usuario
  useEffect(() => {
    if (!rol || !usuarioActual) return;
    fetchResumen();
  }, [rol, usuarioActual, fetchResumen]);

  // ✅ Refresh inmediato cuando Registro guarda/edita
  useEffect(() => {
    const onUpdate = () => fetchResumen();
    window.addEventListener("resumen-actualizar", onUpdate);
    return () => window.removeEventListener("resumen-actualizar", onUpdate);
  }, [fetchResumen]);

  // ✅ “Tiempo real” (polling)
  useEffect(() => {
    if (!rol || !usuarioActual) return;

    const intervalMs = 30_000;
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchResumen();
    }, intervalMs);

    return () => clearInterval(id);
  }, [rol, usuarioActual, fetchResumen]);

  // Ordena consultores por nombre (opcional)
  const datosVisibles = useMemo(() => {
    const arr = Array.isArray(resumen) ? resumen : [];
    return arr.slice().sort((a, b) =>
      String(a.consultor || "").localeCompare(String(b.consultor || ""))
    );
  }, [resumen]);

  const CalendarioConsultor = ({ consultor }) => {
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [mesActual, setMesActual] = useState(mesInicio);
    const [animacion, setAnimacion] = useState("slideInLeft");

    const y = mesActual.getFullYear();
    const m = mesActual.getMonth();

    const totalDiasMes = useMemo(
      () => new Date(y, m + 1, 0).getDate(),
      [y, m]
    );

    // Offset del primer día del mes (alineación L-M-X-J-V-S-D)
    const offsetInicio = useMemo(() => {
      const primerDia = new Date(y, m, 1);
      return mondayIndex(primerDia.getDay());
    }, [y, m]);

    const nombreMes = useMemo(() => {
      const nm = mesActual.toLocaleString("es-ES", {
        month: "long",
        year: "numeric",
      });
      return nm.charAt(0).toUpperCase() + nm.slice(1);
    }, [mesActual]);

    // Registros SOLO del mes actual
    const registrosMes = useMemo(() => {
      return (consultor.registros || []).filter((r) => {
        const f = r.fechaNorm;
        if (!f) return false;
        return f.getMonth() === m && f.getFullYear() === y;
      });
    }, [consultor.registros, m, y]);

    // Índice rápido: YYYY-MM-DD -> registro
    const mapRegistros = useMemo(() => {
      const map = new Map();
      for (const r of registrosMes) {
        if (r.fechaKey) map.set(r.fechaKey, r);
      }
      return map;
    }, [registrosMes]);

    const totalMes = useMemo(() => {
      return registrosMes.reduce((acc, r) => acc + (Number(r.total_horas) || 0), 0);
    }, [registrosMes]);

    // Celdas: [null,null,null, 1,2,3...]
    const celdas = useMemo(() => {
      const blanks = Array.from({ length: offsetInicio }, () => null);
      const dias = Array.from({ length: totalDiasMes }, (_, i) => i + 1);
      return [...blanks, ...dias];
    }, [offsetInicio, totalDiasMes]);

    const renderCelda = (dia, idx) => {
      if (dia === null) {
        return <div key={`b-${idx}`} className="cal-dia blank" />;
      }

      const fechaCelda = new Date(y, m, dia);
      const key = keyYMDFromDate(fechaCelda);

      const registro = mapRegistros.get(key);

      if (!registro) {
        return (
          <div key={key} className="cal-dia none" title="Sin registro">
            {dia}
          </div>
        );
      }

      const horas = Number(registro.total_horas || 0);

      // meta 8/9 según login actual (el que está viendo)
      const login = String(usuarioActual || "").toLowerCase();
      const metaBase = EXCEPCION_8H_USERS?.has?.(login) ? 8 : 9;

      const estado = horas >= metaBase ? "ok" : horas > 0 ? "warn" : "none";

      return (
        <div
          key={key}
          className={`cal-dia ${estado}`}
          title={`${extraerYMD(registro.fecha) || registro.fecha} • ${horas}h`}
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
                setMesActual(new Date(y, m - 1, 1));
              }}
            >
              ◀
            </button>

            <span>{nombreMes}</span>

            <button
              className="cal-btn"
              onClick={() => {
                setAnimacion("slideInRight");
                setMesActual(new Date(y, m + 1, 1));
              }}
            >
              ▶
            </button>
          </div>

          <span className="total">Total: {Math.round(totalMes * 100) / 100} h</span>
        </div>

        <div className={`cal-wrapper ${animacion}`}>
          <div className="cal-days-header">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>

          <div className="cal-grid">
            {celdas.map((dia, idx) => renderCelda(dia, idx))}
          </div>
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
          {datosVisibles.map((consultor) => (
            <CalendarioConsultor key={consultor.consultor_id} consultor={consultor} />
          ))}
        </div>
      )}
    </div>
  );
}

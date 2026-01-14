import React, { useEffect, useState, useMemo, useCallback } from "react";
import "./ResumenHoras.css";
import { jfetch } from "./lib/api";
import { getVisibleUsernames } from "./lib/visibility";


const API_URL = "/resumen-horas";

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
  const fecha = new Date(y, m - 1, d); // local (evita líos de UTC)
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
  const [visibleConsultorIds, setVisibleConsultorIds] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [consultorActivoId, setConsultorActivoId] = useState(null);
  const [error, setError] = useState("");

  const fetchResumen = useCallback(async (rolActual, usuario) => {
    if (!rolActual || !usuario) return;

    try {
      const res = await jfetch(API_URL, {
        method: "GET",
        headers: {
          "X-User-Usuario": usuario,
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

          const fechaNorm = normalizarFecha(r.fecha);
          acc[key].registros.push({
            fecha: r.fecha,
            fechaNorm,
            // clave estable para comparar días sin depender de toDateString()
            fechaKey: fechaNorm ? keyYMDFromDate(fechaNorm) : extraerYMD(r.fecha),
            total_horas: Number(r.total_horas || 0),
            estado: r.estado,
            consultor_id: r.consultor_id,
          });

          return acc;
        }, {})
      );

      setResumen(agrupado);
      setError("");
    } catch (err) {
      console.error("❌ Error al obtener resumen:", err);
      setError("No se pudo cargar el resumen");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const visiblesUsers = getVisibleUsernames(usuarioActual);

      // si no es supervisor, solo su propio consultor_id
      if (visiblesUsers.length === 1) {
        if (!cancelled) {
          setVisibleConsultorIds([Number(consultorActivoId)].filter(Boolean));
        }
        return;
      }

      try {
        // Trae datos de cada usuario para obtener su consultor_id
        const responses = await Promise.all(
          visiblesUsers.map(async (u) => {
            const r = await jfetch(
              `/consultores/datos?usuario=${encodeURIComponent(u)}`,
              {
                method: "GET",
                headers: {
                  "X-User-Usuario": usuarioActual, // login del que está consultando
                  "X-User-Rol": rol,               // rol real (ADMIN_BASIS, etc.)
                },
              }
            );

            const data = await r.json().catch(() => ({}));
            return data;
          })
        );

        const ids = responses
          .map((d) => Number(d?.consultor_id || d?.id || null))
          .filter((n) => Number.isFinite(n));

        const myId = Number(consultorActivoId);
        const finalIds = Array.from(new Set([myId, ...ids].filter(Boolean)));

        if (!cancelled) setVisibleConsultorIds(finalIds);
      } catch (e) {
        if (!cancelled) {
          setVisibleConsultorIds([Number(consultorActivoId)].filter(Boolean));
        }
      }
    };

    if (usuarioActual && rol) run();

    return () => {
      cancelled = true;
    };
  }, [usuarioActual, consultorActivoId, rol]);


  // Inicializa rol/usuario/consultor y primer fetch
  useEffect(() => {
    if (!userData) {
      setError("No se detectó sesión activa.");
      return;
    }

    const rolUser =
      userData?.rol_ref?.nombre?.toUpperCase?.() ||
      userData?.rol?.toUpperCase?.() ||
      "USER";

    const usuario = String(
      userData?.usuario ||
      userData?.user?.usuario ||
      ""
    ).trim().toLowerCase();

    if (!usuario) {
      setError("No se detectó el usuario de sesión.");
      return;
    }

    const idConsultor =
      userData?.consultor_id ||
      userData?.user?.consultor_id ||
      userData?.id ||
      null;

    setRol(rolUser);
    setUsuarioActual(usuario);
    setConsultorActivoId(idConsultor);

    fetchResumen(rolUser, usuario);
  }, [userData, fetchResumen]);

  // ✅ “Tiempo real” (polling). Ajusta el intervalo a tu gusto.
  useEffect(() => {
    if (!rol || !usuarioActual) return;

    const intervalMs = 30_000; // 30s (puedes poner 60_000)
    const id = setInterval(() => {
      // Evita gastar si la pestaña no está visible
      if (document.hidden) return;
      fetchResumen(rol, usuarioActual);
    }, intervalMs);

    return () => clearInterval(id);
  }, [rol, usuarioActual, fetchResumen]);

  const isAdmin = useMemo(() => (
    ["ADMIN", "ADMIN_BASIS", "ADMIN_FUNCIONAL"].includes(String(rol || "").toUpperCase())
  ), [rol]);

  const datosVisibles = useMemo(() => {
    if (isAdmin) return resumen;
    return resumen.filter((r) => visibleConsultorIds.includes(Number(r.consultor_id)));
  }, [isAdmin, resumen, visibleConsultorIds]);



  const CalendarioConsultor = ({ consultor }) => {
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [mesActual, setMesActual] = useState(mesInicio);
    const [animacion, setAnimacion] = useState("slideInLeft");

    const y = mesActual.getFullYear();
    const m = mesActual.getMonth();

    const totalDiasMes = useMemo(() => new Date(y, m + 1, 0).getDate(), [y, m]);

    // ✅ Offset del primer día del mes (alineación L-M-X-J-V-S-D)
    const offsetInicio = useMemo(() => {
      const primerDia = new Date(y, m, 1);
      return mondayIndex(primerDia.getDay());
    }, [y, m]);

    const nombreMes = useMemo(() => {
      const nm = mesActual.toLocaleString("es-ES", { month: "long", year: "numeric" });
      return nm.charAt(0).toUpperCase() + nm.slice(1);
    }, [mesActual]);

    // Registros SOLO del mes actual
    const registrosMes = useMemo(() => {
      return consultor.registros.filter((r) => {
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
      return registrosMes.reduce((acc, r) => acc + (r.total_horas || 0), 0);
    }, [registrosMes]);

    // ✅ Celdas: [null,null,null, 1,2,3...]
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
      const login = usuarioActual; // ya viene lower
      const metaBase = EXCEPCION_8H_USERS.has(login) ? 8 : 9;
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

          <span className="total">Total: {totalMes} h</span>
        </div>

        <div className={`cal-wrapper ${animacion}`}>
          <div className="cal-days-header">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>

          <div className="cal-grid">{celdas.map((dia, idx) => renderCelda(dia, idx))}</div>
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
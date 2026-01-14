// Resumen.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import "./ResumenHoras.css";
import { jfetch } from "./lib/api";
import * as visibility from "./lib/visibility";

const API_URL = "/resumen-horas";

/* ============================================================
   Helpers: visibilidad (soporta export default o named)
============================================================ */
const getVisibleUsernames =
  visibility.getVisibleUsernames ||
  visibility.default ||
  ((u) => [u].filter(Boolean));

const EXCEPCION_8H_USERS =
  visibility.EXCEPCION_8H_USERS ||
  new Set([
    "serranoel","chaburg","torresfaa","jose.raigosa","camargoje",
    "duqueb","diazstef","castronay","sierrag","tarquinojm","celyfl"
  ]);

/* ============================================================
   Fechas robustas (sin desfase por UTC)
============================================================ */
function extraerYMD(fechaStr) {
  if (!fechaStr) return null;
  const match = String(fechaStr).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizarFecha(fechaStr) {
  const ymd = extraerYMD(fechaStr);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(y, m - 1, d); // local
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

/* ============================================================
   Componente
============================================================ */
export default function Resumen({ userData }) {
  const [visibleConsultorIds, setVisibleConsultorIds] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [consultorActivoId, setConsultorActivoId] = useState(null);
  const [error, setError] = useState("");

  const isAdmin = useMemo(() => (
    ["ADMIN", "ADMIN_BASIS", "ADMIN_FUNCIONAL"].includes(String(rol || "").toUpperCase())
  ), [rol]);

  const visibleUsernames = useMemo(() => {
    return getVisibleUsernames(usuarioActual) || [];
  }, [usuarioActual]);

  /* ============================================================
     1) Calcular IDs visibles (por /consultores/datos)
        - Esto es CLAVE para que el resumen muestre 3 personas,
          aunque el backend aún no filtre por "visibles".
  ============================================================ */
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!usuarioActual || !rol) return;

      const visiblesUsers = (getVisibleUsernames(usuarioActual) || []).filter(Boolean);

      // Si solo está él mismo → solo su consultor_id
      if (visiblesUsers.length <= 1) {
        const myId = Number(consultorActivoId);
        if (!cancelled) setVisibleConsultorIds([myId].filter(Boolean));
        return;
      }

      try {
        const responses = await Promise.all(
          visiblesUsers.map(async (u) => {
            const r = await jfetch(
              `/consultores/datos?usuario=${encodeURIComponent(u)}`,
              {
                method: "GET",
                headers: {
                  "X-User-Usuario": usuarioActual,
                  "X-User-Rol": rol,
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
        const myId = Number(consultorActivoId);
        if (!cancelled) setVisibleConsultorIds([myId].filter(Boolean));
      }
    };

    run();
    return () => { cancelled = true; };
  }, [usuarioActual, rol, consultorActivoId]);

  /* ============================================================
     2) Fetch resumen (envía visibles al backend)
  ============================================================ */
  const fetchResumen = useCallback(async () => {
    if (!rol || !usuarioActual) return;

    try {
      const visibles = (visibleUsernames || []).filter(Boolean).join(",");

      const url =
        `/api/resumen-horas` +
        `?usuario=${encodeURIComponent(usuarioActual)}` +
        `&rol=${encodeURIComponent(rol)}` +
        (visibles ? `&visibles=${encodeURIComponent(visibles)}` : "") +
        `&ts=${Date.now()}`; // cache buster

      // DEBUG (deberías ver la URL con ?... en consola)
      console.log("📌 fetchResumen URL:", url);

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
      });

      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data = await res.json().catch(() => []);

      // ... aquí dejas EXACTAMENTE el mismo reduce/agrupado que ya tienes ...
      const agrupado = Object.values(
        (Array.isArray(data) ? data : []).reduce((acc, r) => {
          const key = String(r.consultor_id ?? "NA");
          if (!acc[key]) {
            acc[key] = { consultor: r.consultor, consultor_id: r.consultor_id, registros: [] };
          }

          const fechaNorm = normalizarFecha(r.fecha);
          acc[key].registros.push({
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

  /* ============================================================
     3) Init sesión + primer fetch
  ============================================================ */
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
  }, [userData]);

  // primer fetch cuando ya hay rol/usuario
  useEffect(() => {
    if (!rol || !usuarioActual) return;
    fetchResumen();
  }, [rol, usuarioActual, fetchResumen]);

  /* ============================================================
     4) Refrescar al guardar (evento global desde Registro)
  ============================================================ */
  useEffect(() => {
    if (!rol || !usuarioActual) return;

    const handler = () => fetchResumen();
    window.addEventListener("resumen-actualizar", handler);
    return () => window.removeEventListener("resumen-actualizar", handler);
  }, [rol, usuarioActual, fetchResumen]);

  /* ============================================================
     5) Polling “tiempo real”
  ============================================================ */
  useEffect(() => {
    if (!rol || !usuarioActual) return;

    const intervalMs = 30_000;
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchResumen();
    }, intervalMs);

    return () => clearInterval(id);
  }, [rol, usuarioActual, fetchResumen]);

  /* ============================================================
     6) Filtrado final visible (ADMIN ve todo)
        - Si NO es admin → filtra por visibleConsultorIds
  ============================================================ */
  const datosVisibles = useMemo(() => {
    if (isAdmin) return resumen;

    const ids = (visibleConsultorIds || []).map(Number).filter(Boolean);
    if (!ids.length) return resumen;

    return resumen.filter((r) => ids.includes(Number(r.consultor_id)));
  }, [isAdmin, resumen, visibleConsultorIds]);

  /* ============================================================
     7) Calendario por consultor
  ============================================================ */
  const CalendarioConsultor = ({ consultor }) => {
    const hoy = new Date();
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [mesActual, setMesActual] = useState(mesInicio);
    const [animacion, setAnimacion] = useState("slideInLeft");

    const y = mesActual.getFullYear();
    const m = mesActual.getMonth();

    const totalDiasMes = useMemo(() => new Date(y, m + 1, 0).getDate(), [y, m]);

    const offsetInicio = useMemo(() => {
      const primerDia = new Date(y, m, 1);
      return mondayIndex(primerDia.getDay());
    }, [y, m]);

    const nombreMes = useMemo(() => {
      const nm = mesActual.toLocaleString("es-ES", { month: "long", year: "numeric" });
      return nm.charAt(0).toUpperCase() + nm.slice(1);
    }, [mesActual]);

    const registrosMes = useMemo(() => {
      return (consultor.registros || []).filter((r) => {
        const f = r.fechaNorm;
        if (!f) return false;
        return f.getMonth() === m && f.getFullYear() === y;
      });
    }, [consultor.registros, m, y]);

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

      // meta por usuario logueado (o por registro.usuario si backend lo manda)
      const login = String(registro.usuario || usuarioActual || "").toLowerCase();
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

  /* ============================================================
     Render
  ============================================================ */
  return (
    <div className="resumen-wrapper">
      <h2 className="resumen-titulo">Resumen de Horas Mensual</h2>

      {error && <div className="resumen-error">{error}</div>}

      {datosVisibles.length === 0 ? (
        <p className="resumen-empty">No hay datos para mostrar</p>
      ) : (
        <div className="resumen-grid">
          {datosVisibles.map((consultor) => (
            <CalendarioConsultor
              key={consultor.consultor_id || consultor.consultor}
              consultor={consultor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

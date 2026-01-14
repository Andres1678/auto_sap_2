import React, { useEffect, useMemo, useState, useCallback } from "react";
import "./ResumenHoras.css";
import { jfetch } from "./lib/api";
import getVisibleUsernames, { EXCEPCION_8H_USERS } from "./lib/visibility";

const API_URL = "/api/resumen-horas";

/**
 * Extrae YYYY-MM-DD de varios formatos (incluye ISO con T/Z)
 */
function extraerYMD(fechaStr) {
  if (!fechaStr) return null;
  const match = String(fechaStr).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Convierte fecha string a Date local estable (sin UTC issues)
 */
function normalizarFecha(fechaStr) {
  const ymd = extraerYMD(fechaStr);
  if (!ymd) return null;

  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
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

// Normaliza equipo para comparar
function equipoUpper(v) {
  return String(v || "").trim().toUpperCase();
}

export default function Resumen({ userData, filtroEquipo = "" }) {
  const [resumen, setResumen] = useState([]); // [{consultor, consultor_id, usuario_consultor, registros:[...]}]
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [error, setError] = useState("");

  /**
   * ✅ Fetch del resumen.
   * - usuario/visibles por query
   * - rol SOLO por header (evita "rol inconsistente")
   */
  const fetchResumen = useCallback(async ({ rolActual, usuario, visibles }) => {
    if (!rolActual || !usuario) return;

    try {
      const params = new URLSearchParams();
      params.set("usuario", usuario);

      if (visibles && visibles.length) {
        params.set("visibles", visibles.join(","));
      }

      // cache-buster
      params.set("ts", Date.now().toString());

      const url = `${API_URL}?${params.toString()}`;
      console.log("📌 fetchResumen URL:", url);

      const res = await jfetch(url, {
        method: "GET",
        headers: {
          "X-User-Usuario": usuario,
          "X-User-Rol": rolActual,
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Error HTTP ${res.status} ${txt ? `- ${txt}` : ""}`);
      }

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];

      /**
       * ✅ Agrupar por usuario_consultor (más estable)
       */
      const agrupado = Object.values(
        rows.reduce((acc, r) => {
          const userKey = String(r.usuario_consultor || "")
            .trim()
            .toLowerCase();

          const key =
            userKey || String(r.consultor_id ?? r.id ?? r.consultor ?? "NA");

          if (!acc[key]) {
            acc[key] = {
              consultor: r.consultor || r.nombre || userKey || "—",
              consultor_id: r.consultor_id ?? r.id ?? null,
              usuario_consultor: userKey || null,
              registros: [],
            };
          }

          const fechaNorm = normalizarFecha(r.fecha);

          acc[key].registros.push({
            fecha: r.fecha,
            fechaNorm,
            fechaKey: fechaNorm
              ? keyYMDFromDate(fechaNorm)
              : extraerYMD(r.fecha),

            total_horas: Number(r.total_horas || r.totalHoras || 0),
            estado: r.estado,

            // ✅ para excepciones 8h
            usuario_consultor: userKey || acc[key].usuario_consultor || null,

            /**
             * ⚠️ Tu backend /resumen-horas hoy NO manda equipo.
             * Si mañana lo implementas, esto empezará a venir.
             */
            equipo: r.equipo || r.EQUIPO || "",
          });

          return acc;
        }, {})
      );

      setResumen(agrupado);
      setError("");
    } catch (err) {
      console.error("❌ Error al obtener resumen:", err);
      setError(err?.message || "No se pudo cargar el resumen");
      setResumen([]);
    }
  }, []);

  /**
   * Inicializa rol/usuario
   */
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

    const usuario = String(userData?.usuario || userData?.user?.usuario || "")
      .trim()
      .toLowerCase();

    if (!usuario) {
      setError("No se detectó el usuario de sesión.");
      return;
    }

    setRol(rolUser);
    setUsuarioActual(usuario);
  }, [userData]);

  /**
   * ✅ Carga inicial (y cuando cambia rol/usuario)
   */
  useEffect(() => {
    if (!rol || !usuarioActual) return;
    const visibles = getVisibleUsernames(usuarioActual) || [];
    fetchResumen({ rolActual: rol, usuario: usuarioActual, visibles });
  }, [rol, usuarioActual, fetchResumen]);

  /**
   * ✅ “Tiempo real” (polling)
   */
  useEffect(() => {
    if (!rol || !usuarioActual) return;

    const intervalMs = 30_000;
    const id = setInterval(() => {
      if (document.hidden) return;
      const visibles = getVisibleUsernames(usuarioActual) || [];
      fetchResumen({ rolActual: rol, usuario: usuarioActual, visibles });
    }, intervalMs);

    return () => clearInterval(id);
  }, [rol, usuarioActual, fetchResumen]);

  /**
   * ✅ refresco inmediato desde Registro (evento custom)
   */
  useEffect(() => {
    const onRefresh = () => {
      if (!rol || !usuarioActual) return;
      const visibles = getVisibleUsernames(usuarioActual) || [];
      fetchResumen({ rolActual: rol, usuario: usuarioActual, visibles });
    };

    window.addEventListener("resumen-actualizar", onRefresh);
    return () => window.removeEventListener("resumen-actualizar", onRefresh);
  }, [rol, usuarioActual, fetchResumen]);

  /**
   * ✅ Filtro por equipo (corregido):
   * Si backend no trae equipo, NO filtramos para no quedar vacío.
   */
  const datosVisibles = useMemo(() => {
    const eq = equipoUpper(filtroEquipo);
    if (!eq) return resumen;

    const hayEquipoEnRespuesta = resumen.some((c) =>
      (c.registros || []).some((r) => equipoUpper(r.equipo))
    );

    // Si no existe equipo en respuesta, no filtramos (evita "No hay datos")
    if (!hayEquipoEnRespuesta) return resumen;

    return resumen
      .map((c) => {
        const regs = (c.registros || []).filter(
          (r) => equipoUpper(r.equipo) === eq
        );
        return { ...c, registros: regs };
      })
      .filter((c) => (c.registros || []).length > 0);
  }, [resumen, filtroEquipo]);

  /**
   * UI: calendario por consultor
   */
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

    // Mapa YYYY-MM-DD -> registro
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

      // ✅ meta 8h para excepciones, 9h normal
      // basado en el usuario del registro (no el logueado)
      const u = String(
        registro.usuario_consultor ||
          consultor.usuario_consultor ||
          usuarioActual ||
          ""
      ).toLowerCase();

      const metaBase = EXCEPCION_8H_USERS?.has?.(u) ? 8 : 9;
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

          <span className="total">
            Total: {Math.round(totalMes * 100) / 100} h
          </span>
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

  /**
   * Render principal
   */
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
              key={
                consultor.usuario_consultor ||
                consultor.consultor_id ||
                consultor.consultor
              }
              consultor={consultor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

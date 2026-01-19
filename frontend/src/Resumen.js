import React, { useEffect, useMemo, useState, useCallback } from "react";
import "./ResumenHoras.css";
import { jfetch } from "./lib/api";
import { EXCEPCION_8H_USERS } from "./lib/visibility";

const API_PATH = "/resumen-horas";

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

function mondayIndex(jsGetDay) {
  return (jsGetDay + 6) % 7;
}

function equipoUpper(v) {
  return String(v || "").trim().toUpperCase();
}

/* ✅ Normalizador para ordenar alfabéticamente (sin tildes, case-insensitive) */
function normalizarNombreParaOrden(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function Resumen({ userData, filtroEquipo = "" }) {
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [error, setError] = useState("");

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
    setError("");
  }, [userData]);

  const fetchResumen = useCallback(async ({ rolActual, usuario, equipo }) => {
    if (!usuario) return;

    try {
      const params = new URLSearchParams();
      params.set("usuario", usuario);
      params.set("ts", Date.now().toString()); // evita caché

      const eq = equipoUpper(equipo);
      if (eq) params.set("equipo", eq);

      const path = `${API_PATH}?${params.toString()}`;
      console.log("📌 fetchResumen URL:", path);

      const res = await jfetch(path, {
        method: "GET",
        headers: {
          "X-User-Usuario": usuario,
          "X-User-Rol": rolActual || "",
        },
      });

      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status} - ${JSON.stringify(data)}`);
      }

      const rows = Array.isArray(data) ? data : [];

      const agrupado = Object.values(
        rows.reduce((acc, r) => {
          const usuarioKey = String(r.usuario_consultor || "").trim().toLowerCase();
          const key = usuarioKey || String(r.consultor_id ?? r.consultor ?? "NA");

          if (!acc[key]) {
            acc[key] = {
              consultor: r.consultor || r.nombre || usuarioKey || "—",
              consultor_id: r.consultor_id ?? null,
              usuario_consultor: usuarioKey || null,
              registros: [],
            };
          }

          const fechaNorm = normalizarFecha(r.fecha);
          acc[key].registros.push({
            fecha: r.fecha,
            fechaNorm,
            fechaKey: fechaNorm ? keyYMDFromDate(fechaNorm) : extraerYMD(r.fecha),
            total_horas: Number(r.total_horas ?? r.totalHoras ?? 0),
            estado: r.estado,
          });

          return acc;
        }, {})
      );

      /* ✅ (Opcional pero recomendado) Ordenar registros por fecha dentro de cada consultor */
      for (const c of agrupado) {
        c.registros.sort((a, b) => {
          const da = a.fechaNorm?.getTime?.() ?? 0;
          const db = b.fechaNorm?.getTime?.() ?? 0;
          return da - db;
        });
      }

      setResumen(agrupado);
      setError("");
    } catch (err) {
      console.error("❌ Error al obtener resumen:", err);
      setResumen([]);
      setError("No se pudo cargar el resumen");
    }
  }, []);

  useEffect(() => {
    if (!usuarioActual) return;
    fetchResumen({
      rolActual: rol,
      usuario: usuarioActual,
      equipo: filtroEquipo || "",
    });
  }, [rol, usuarioActual, filtroEquipo, fetchResumen]);

  useEffect(() => {
    if (!usuarioActual) return;

    const intervalMs = 30_000;
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchResumen({
        rolActual: rol,
        usuario: usuarioActual,
        equipo: filtroEquipo || "",
      });
    }, intervalMs);

    return () => clearInterval(id);
  }, [rol, usuarioActual, filtroEquipo, fetchResumen]);

  useEffect(() => {
    const onRefresh = () => {
      if (!usuarioActual) return;
      fetchResumen({
        rolActual: rol,
        usuario: usuarioActual,
        equipo: filtroEquipo || "",
      });
    };

    window.addEventListener("resumen-actualizar", onRefresh);
    return () => window.removeEventListener("resumen-actualizar", onRefresh);
  }, [rol, usuarioActual, filtroEquipo, fetchResumen]);

  /* ✅ AQUÍ es donde se organiza por alfabeto */
  const datosVisibles = useMemo(() => {
    const copy = Array.isArray(resumen) ? [...resumen] : [];

    copy.sort((a, b) => {
      const na = normalizarNombreParaOrden(a.consultor || a.usuario_consultor || "");
      const nb = normalizarNombreParaOrden(b.consultor || b.usuario_consultor || "");
      return na.localeCompare(nb, "es", { sensitivity: "base" });
    });

    return copy;
  }, [resumen]);

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

    const totalMes = useMemo(
      () => registrosMes.reduce((acc, r) => acc + (r.total_horas || 0), 0),
      [registrosMes]
    );

    const celdas = useMemo(() => {
      const blanks = Array.from({ length: offsetInicio }, () => null);
      const dias = Array.from({ length: totalDiasMes }, (_, i) => i + 1);
      return [...blanks, ...dias];
    }, [offsetInicio, totalDiasMes]);

    const renderCelda = (dia, idx) => {
      if (dia === null) return <div key={`b-${idx}`} className="cal-dia blank" />;

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

      /* ✅ Si la meta depende del consultor (no del usuario logueado), usa el consultor.usuario_consultor */
      const loginParaMeta = String(consultor.usuario_consultor || usuarioActual || "").toLowerCase();
      const metaBase = EXCEPCION_8H_USERS?.has?.(loginParaMeta) ? 8 : 9;

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
            <CalendarioConsultor
              key={consultor.usuario_consultor || consultor.consultor_id || consultor.consultor}
              consultor={consultor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

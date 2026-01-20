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
  const fecha = new Date(y, m - 1, d);
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

function normalizarNombreParaOrden(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export default function Resumen({ userData, filtroEquipo = "", filtroConsultor = "", filtroMes = "", filtroAnio = "" }) {
  const [resumen, setResumen] = useState([]);
  const [rol, setRol] = useState("");
  const [usuarioActual, setUsuarioActual] = useState("");
  const [error, setError] = useState("");

  const [mesGlobal, setMesGlobal] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

  const lockMesAnio = Boolean(String(filtroMes || "").trim() || String(filtroAnio || "").trim());

  useEffect(() => {
    const hoy = new Date();
    const y = String(filtroAnio || "").trim();
    const m = String(filtroMes || "").trim();

    const year = y ? Number(y) : hoy.getFullYear();
    const month = m ? Number(m) : hoy.getMonth() + 1;

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return;

    setMesGlobal(new Date(year, month - 1, 1));
  }, [filtroMes, filtroAnio]);

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
      params.set("ts", Date.now().toString());

      const eq = equipoUpper(equipo);
      if (eq) params.set("equipo", eq);

      const path = `${API_PATH}?${params.toString()}`;

      const res = await jfetch(path, {
        method: "GET",
        headers: {
          "X-User-Usuario": usuario,
          "X-User-Rol": rolActual || "",
        },
      });

      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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

  const datosVisibles = useMemo(() => {
    const copy = Array.isArray(resumen) ? [...resumen] : [];

    const fCons = String(filtroConsultor || "").trim();
    const filtered = fCons
      ? copy.filter((c) => String(c.consultor || "").trim() === fCons)
      : copy;

    filtered.sort((a, b) => {
      const na = normalizarNombreParaOrden(a.consultor || a.usuario_consultor || "");
      const nb = normalizarNombreParaOrden(b.consultor || b.usuario_consultor || "");
      return na.localeCompare(nb, "es", { sensitivity: "base" });
    });

    return filtered;
  }, [resumen, filtroConsultor]);

  const CalendarioConsultor = ({ consultor }) => {
    const [animacion, setAnimacion] = useState("slideInLeft");

    const y = mesGlobal.getFullYear();
    const m = mesGlobal.getMonth();

    const totalDiasMes = useMemo(() => new Date(y, m + 1, 0).getDate(), [y, m]);

    const offsetInicio = useMemo(() => {
      const primerDia = new Date(y, m, 1);
      return mondayIndex(primerDia.getDay());
    }, [y, m]);

    const nombreMes = useMemo(() => {
      const nm = mesGlobal.toLocaleString("es-ES", { month: "long", year: "numeric" });
      return nm.charAt(0).toUpperCase() + nm.slice(1);
    }, [mesGlobal]);

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
              disabled={lockMesAnio}
              onClick={() => {
                setAnimacion("slideInLeft");
                setMesGlobal(new Date(y, m - 1, 1));
              }}
            >
              ◀
            </button>

            <span>{nombreMes}</span>

            <button
              className="cal-btn"
              disabled={lockMesAnio}
              onClick={() => {
                setAnimacion("slideInRight");
                setMesGlobal(new Date(y, m + 1, 1));
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

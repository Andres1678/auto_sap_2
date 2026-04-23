import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "../lib/api";
import "./ProyectoCostosPanel.css";

const emptyCabecera = {
  oportunidad_id: "",
  codigo_ot_principal: "",
  fecha_inicio_ejecucion: "",
  fecha_fin_ejecucion: "",
  fecha_inicio_facturacion: "",
  fecha_fin_facturacion: "",
  moneda: "COP",
  ingreso_total: "",
  costo_objetivo_total: "",
  gasto_operativo_total: "",
  costo_administrativo_total: "",
  margen_objetivo_pct: "",
  ebitda_objetivo: "",
  estado_financiero: "BORRADOR",
  alerta_umbral_1: 70,
  alerta_umbral_2: 85,
  alerta_umbral_3: 95,
};

const monthNow = new Date().getMonth() + 1;
const yearNow = new Date().getFullYear();

const makeRowKey = (prefix = "row") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const newMes = () => ({
  id: null,
  __rowKey: makeRowKey("pm"),
  anio: yearNow,
  mes: monthNow,
  ingreso_planeado: "",
  costo_planeado: "",
  gasto_operativo_planeado: "",
  costo_administrativo_planeado: "",
  ebitda_planeado: "",
  margen_planeado_pct: "",
  activo: true,
});

const newPerfilRow = () => ({
  id: null,
  __rowKey: makeRowKey("pp"),
  anio: yearNow,
  mes: monthNow,
  perfil_id: "",
  modulo_id: "",
  consultor_id: "",
  horas_estimadas: "",
  valor_hora_ingreso: "",
  valor_hora_planeado: "",
  costo_estimado: "",
  ingreso_estimado: "",
  observacion: "",
  activo: true,
});

const newCostoAdicional = () => ({
  id: null,
  __rowKey: makeRowKey("ca"),
  anio: yearNow,
  mes: monthNow,
  tipo_costo: "OTRO",
  categoria: "",
  descripcion: "",
  valor: "",
  activo: true,
});

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const toFixedIfNeeded = (n, digits = 2) => {
  if (!Number.isFinite(n)) return "";
  return Number(n.toFixed(digits));
};

const formatMoney = (value, currency = "COP") => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("es-CO")}`;
  }
};

const formatNumber = (value, digits = 2) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const recalcCabecera = (row) => {
  const ingreso = toNumber(row.ingreso_total);
  const costo = toNumber(row.costo_objetivo_total);
  const gastoOp = toNumber(row.gasto_operativo_total);
  const costoAdm = toNumber(row.costo_administrativo_total);

  const ebitda = ingreso - costo - gastoOp - costoAdm;
  const margenPct = ingreso > 0 ? (ebitda / ingreso) * 100 : 0;

  return {
    ...row,
    ebitda_objetivo:
      row.ebitda_objetivo === "" || row.ebitda_objetivo === null
        ? toFixedIfNeeded(ebitda)
        : row.ebitda_objetivo,
    margen_objetivo_pct:
      row.margen_objetivo_pct === "" || row.margen_objetivo_pct === null
        ? toFixedIfNeeded(margenPct)
        : row.margen_objetivo_pct,
  };
};

const recalcPresupuestoRow = (row) => {
  const ingreso = toNumber(row.ingreso_planeado);
  const costo = toNumber(row.costo_planeado);
  const gastoOp = toNumber(row.gasto_operativo_planeado);
  const costoAdm = toNumber(row.costo_administrativo_planeado);

  const ebitda = ingreso - costo - gastoOp - costoAdm;
  const margen = ingreso > 0 ? (ebitda / ingreso) * 100 : 0;

  return {
    ...row,
    ebitda_planeado: toFixedIfNeeded(ebitda),
    margen_planeado_pct: toFixedIfNeeded(margen),
  };
};

const recalcPerfilRow = (row) => {
  const horas = toNumber(row.horas_estimadas);
  const valorHoraCosto = toNumber(row.valor_hora_planeado);
  const valorHoraIngreso = toNumber(
    row.valor_hora_ingreso ?? row.fte_estimado ?? 0
  );

  const costo = horas * valorHoraCosto;
  const ingreso = horas * valorHoraIngreso;

  return {
    ...row,
    valor_hora_ingreso: row.valor_hora_ingreso ?? row.fte_estimado ?? "",
    fte_estimado: row.valor_hora_ingreso ?? row.fte_estimado ?? "",
    costo_estimado: toFixedIfNeeded(costo),
    ingreso_estimado: toFixedIfNeeded(ingreso),
  };
};

const getAlertClass = (pct, thresholds) => {
  if (pct == null) return "neutral";
  const t1 = toNumber(thresholds.alerta_umbral_1 || 70);
  const t2 = toNumber(thresholds.alerta_umbral_2 || 85);
  const t3 = toNumber(thresholds.alerta_umbral_3 || 95);

  if (pct >= 100) return "danger";
  if (pct >= t3) return "danger";
  if (pct >= t2) return "warn";
  if (pct >= t1) return "info";
  return "ok";
};

const estadoLabelByClass = (cls) => {
  if (cls === "danger") return "Crítico";
  if (cls === "warn") return "Alerta";
  if (cls === "info") return "Seguimiento";
  if (cls === "ok") return "Controlado";
  return "Sin dato";
};

const perfilLabel = (p) => {
  const nombre = String(p?.nombre || "").trim();
  const descripcion = String(p?.descripcion || "").trim();
  return descripcion ? `${nombre} — ${descripcion}` : nombre;
};

const getPeriodo = (row) => {
  const anio = String(row?.anio ?? "").trim();
  const mes = String(row?.mes ?? "").padStart(2, "0");
  if (!anio || !mes) return "";
  return `${anio}-${mes}`;
};

const getMultiValues = (e) =>
  Array.from(e.target.selectedOptions || []).map((opt) => String(opt.value));

export default function ProyectoCostosPanel({ proyectoId }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({
    cabecera: false,
    presupuesto: false,
    perfiles: false,
    adicionales: false,
  });

  const [proyecto, setProyecto] = useState(null);
  const [cabecera, setCabecera] = useState(emptyCabecera);
  const [catalogos, setCatalogos] = useState({
    perfiles: [],
    modulos: [],
    consultores: [],
    equipos: [],
  });

  const [presupuestoMensual, setPresupuestoMensual] = useState([]);
  const [perfilPlan, setPerfilPlan] = useState([]);
  const [costosAdicionales, setCostosAdicionales] = useState([]);
  const [resumen, setResumen] = useState(null);

  const [filtros, setFiltros] = useState({
    equipos: [],
    modulos: [],
    consultores: [],
  });

  const [showUsoCostosColumns, setShowUsoCostosColumns] = useState(false);
  const [showUsoHorasColumns, setShowUsoHorasColumns] = useState(false);

  const [openSections, setOpenSections] = useState({
    resumenReal: true,
    resumenPlaneado: true,
    cabecera: true,
    filtros: true,
    presupuesto: true,
    perfiles: true,
    adicionales: true,
    resumenMensual: true,
    comparativo: true,
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const buildResumenQuery = (currentFiltros = filtros) => {
    const params = new URLSearchParams();

    (currentFiltros.equipos || []).forEach((equipo) => {
      if (equipo) params.append("equipo", equipo);
    });

    (currentFiltros.modulos || []).forEach((modulo) => {
      if (modulo) params.append("modulo", modulo);
    });

    (currentFiltros.consultores || []).forEach((consultor) => {
      if (consultor) params.append("consultor", consultor);
    });

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const fetchAll = async (currentFiltros = filtros) => {
    if (!proyectoId) return;
    setLoading(true);

    try {
      const [cfgRes, resumenRes] = await Promise.all([
        jfetch(`/proyectos/${proyectoId}/costos`),
        jfetch(
          `/proyectos/${proyectoId}/costos/resumen${buildResumenQuery(
            currentFiltros
          )}`
        ),
      ]);

      const cfg = await cfgRes.json().catch(() => ({}));
      const sum = await resumenRes.json().catch(() => ({}));

      if (!cfgRes.ok) throw new Error(cfg?.mensaje || `HTTP ${cfgRes.status}`);
      if (!resumenRes.ok)
        throw new Error(sum?.mensaje || `HTTP ${resumenRes.status}`);

      const p = cfg.proyecto || {};
      const rawCatalogos = cfg.catalogos || {
        perfiles: [],
        modulos: [],
        consultores: [],
      };
      const rawPerfilPlan = Array.isArray(cfg.perfil_plan) ? cfg.perfil_plan : [];

      setProyecto(p);

      setCatalogos({
        perfiles: Array.isArray(rawCatalogos.perfiles)
          ? rawCatalogos.perfiles
          : [],
        modulos: Array.isArray(rawCatalogos.modulos)
          ? rawCatalogos.modulos.map((m) => ({
              id: String(m.nombre || m.id),
              nombre: m.nombre || `Módulo ${m.id}`,
            }))
          : [],
        consultores: Array.isArray(rawCatalogos.consultores)
          ? rawCatalogos.consultores.map((c) => ({
              id: String(c.usuario || c.id),
              nombre: c.nombre,
              usuario: c.usuario,
            }))
          : [],
        equipos: Array.isArray(rawCatalogos.equipos)
          ? rawCatalogos.equipos.map((e) => ({
              id: String(e.nombre || e.id),
              nombre: e.nombre,
            }))
          : [],
      });

      setCabecera({
        oportunidad_id: p.oportunidad_id ?? "",
        codigo_ot_principal: p.codigo_ot_principal ?? "",
        fecha_inicio_ejecucion: p.fecha_inicio_ejecucion ?? "",
        fecha_fin_ejecucion: p.fecha_fin_ejecucion ?? "",
        fecha_inicio_facturacion: p.fecha_inicio_facturacion ?? "",
        fecha_fin_facturacion: p.fecha_fin_facturacion ?? "",
        moneda: p.moneda ?? "COP",
        ingreso_total: p.ingreso_total ?? "",
        costo_objetivo_total: p.costo_objetivo_total ?? "",
        gasto_operativo_total: p.gasto_operativo_total ?? "",
        costo_administrativo_total: p.costo_administrativo_total ?? "",
        margen_objetivo_pct: p.margen_objetivo_pct ?? "",
        ebitda_objetivo: p.ebitda_objetivo ?? "",
        estado_financiero: p.estado_financiero ?? "BORRADOR",
        alerta_umbral_1: p.alerta_umbral_1 ?? 70,
        alerta_umbral_2: p.alerta_umbral_2 ?? 85,
        alerta_umbral_3: p.alerta_umbral_3 ?? 95,
      });

      setPresupuestoMensual(
        (Array.isArray(cfg.presupuesto_mensual) ? cfg.presupuesto_mensual : []).map(
          (row) => ({
            ...row,
            __rowKey: makeRowKey("pm"),
          })
        )
      );

      setPerfilPlan(
        rawPerfilPlan.map((row) => {
          const normalized = {
            ...row,
            __rowKey: makeRowKey("pp"),
            perfil_id: row?.perfil_id ? String(row.perfil_id) : "",
            modulo_id: row?.modulo_id ? String(row.modulo_id) : "",
            consultor_id: row?.consultor_id ? String(row.consultor_id) : "",
            valor_hora_ingreso:
              row?.valor_hora_ingreso ?? row?.fte_estimado ?? "",
          };

          return recalcPerfilRow(normalized);
        })
      );

      setCostosAdicionales(
        (Array.isArray(cfg.costos_adicionales) ? cfg.costos_adicionales : []).map(
          (row) => ({
            ...row,
            __rowKey: makeRowKey("ca"),
          })
        )
      );

      setResumen(sum || null);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error cargando costos",
        text: String(e.message || e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(filtros);
  }, [proyectoId]);

  const onCabeceraChange = (key, value) => {
    setCabecera((prev) => recalcCabecera({ ...prev, [key]: value }));
  };

  const onPresupuestoChange = (index, key, value) => {
    setPresupuestoMensual((prev) =>
      prev.map((row, i) =>
        i === index ? recalcPresupuestoRow({ ...row, [key]: value }) : row
      )
    );
  };

  const onPerfilChange = (index, key, value) => {
    setPerfilPlan((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const next = { ...row, [key]: value };

        if (key === "perfil_id") {
          next.consultor_id = "";
          if (!value) {
            next.modulo_id = "";
          }
        }

        if (key === "modulo_id") {
          next.consultor_id = "";
        }

        if (key === "valor_hora_ingreso") {
          next.fte_estimado = value;
        }

        return recalcPerfilRow(next);
      })
    );
  };

  const onAdicionalChange = (index, key, value) => {
    setCostosAdicionales((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  const copyPresupuestoRow = (index) => {
    setPresupuestoMensual((prev) => {
      const row = prev[index];
      if (!row) return prev;

      const clone = {
        ...row,
        id: null,
        __rowKey: makeRowKey("pm"),
      };

      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const copyPerfilRow = (index) => {
    setPerfilPlan((prev) => {
      const row = prev[index];
      if (!row) return prev;

      const clone = {
        ...row,
        id: null,
        __rowKey: makeRowKey("pp"),
        perfil_id: row?.perfil_id ? String(row.perfil_id) : "",
        modulo_id: row?.modulo_id ? String(row.modulo_id) : "",
        consultor_id: row?.consultor_id ? String(row.consultor_id) : "",
        orden: Number(row.orden ?? index) + 1,
      };

      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const copyCostoAdicionalRow = (index) => {
    setCostosAdicionales((prev) => {
      const row = prev[index];
      if (!row) return prev;

      const clone = {
        ...row,
        id: null,
        __rowKey: makeRowKey("ca"),
      };

      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const addPresupuestoRow = () => {
    setPresupuestoMensual((prev) => [...prev, newMes()]);
  };

  const addPerfilRow = () => {
    setPerfilPlan((prev) => [...prev, newPerfilRow()]);
  };

  const addCostoAdicionalRow = () => {
    setCostosAdicionales((prev) => [...prev, newCostoAdicional()]);
  };

  const removePresupuestoRow = (index) => {
    setPresupuestoMensual((prev) => prev.filter((_, i) => i !== index));
  };

  const removePerfilRow = (index) => {
    setPerfilPlan((prev) => prev.filter((_, i) => i !== index));
  };

  const removeCostoAdicionalRow = (index) => {
    setCostosAdicionales((prev) => prev.filter((_, i) => i !== index));
  };

  const guardarCabecera = async () => {
    try {
      setSaving((s) => ({ ...s, cabecera: true }));

      const res = await jfetch(`/proyectos/${proyectoId}/costos/cabecera`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cabecera),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({ icon: "success", title: "Cabecera guardada" });
      await fetchAll(filtros);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: String(e.message || e),
      });
    } finally {
      setSaving((s) => ({ ...s, cabecera: false }));
    }
  };

  const guardarPresupuestoMensual = async () => {
    try {
      setSaving((s) => ({ ...s, presupuesto: true }));

      const payload = presupuestoMensual.map(({ __rowKey, ...row }) => row);

      const res = await jfetch(
        `/proyectos/${proyectoId}/costos/presupuesto-mensual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({ icon: "success", title: "Presupuesto mensual guardado" });
      await fetchAll(filtros);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: String(e.message || e),
      });
    } finally {
      setSaving((s) => ({ ...s, presupuesto: false }));
    }
  };

  const guardarPerfilPlan = async () => {
    try {
      setSaving((s) => ({ ...s, perfiles: true }));

      const payload = perfilPlan.map(({ __rowKey, ...row }) => ({
        ...row,
        fte_estimado: row.valor_hora_ingreso ?? row.fte_estimado ?? "",
      }));

      const res = await jfetch(`/proyectos/${proyectoId}/costos/perfil-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({ icon: "success", title: "Planeación por perfil guardada" });
      await fetchAll(filtros);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: String(e.message || e),
      });
    } finally {
      setSaving((s) => ({ ...s, perfiles: false }));
    }
  };

  const guardarCostosAdicionales = async () => {
    try {
      setSaving((s) => ({ ...s, adicionales: true }));

      const payload = costosAdicionales.map(({ __rowKey, ...row }) => row);

      const res = await jfetch(
        `/proyectos/${proyectoId}/costos/costos-adicionales`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);

      Swal.fire({ icon: "success", title: "Costos adicionales guardados" });
      await fetchAll(filtros);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: String(e.message || e),
      });
    } finally {
      setSaving((s) => ({ ...s, adicionales: false }));
    }
  };

  const cards = resumen?.cards || {};
  const mesesResumen = Array.isArray(resumen?.meses) ? resumen.meses : [];

  const hayFiltrosActivos =
    filtros.moduloIds.length > 0 || filtros.consultorIds.length > 0;

  const periodosResumenSet = useMemo(() => {
    return new Set((mesesResumen || []).map((row) => String(row.periodo || "")));
  }, [mesesResumen]);

  const shouldKeepByPeriodo = (row) => {
    if (!hayFiltrosActivos) return true;
    if (!periodosResumenSet.size) return false;
    const periodo = getPeriodo(row);
    return periodosResumenSet.has(periodo);
  };

  const presupuestoMensualView = useMemo(() => {
    return (presupuestoMensual || [])
      .map((row, originalIndex) => ({ ...row, __originalIndex: originalIndex }))
      .filter((row) => shouldKeepByPeriodo(row));
  }, [presupuestoMensual, hayFiltrosActivos, periodosResumenSet]);

  const perfilPlanView = useMemo(() => {
    return (perfilPlan || [])
      .map((row, originalIndex) => ({ ...row, __originalIndex: originalIndex }))
      .filter((row) => {
        const okModulo =
          !filtros.modulos.length ||
          filtros.modulos.includes(
            String(
              (catalogos.modulos || []).find(
                (m) => String(m.id) === String(row.modulo_id)
              )?.nombre || row.modulo_id || ""
            )
          );

        const okPeriodo = shouldKeepByPeriodo(row);

        return okModulo && okPeriodo;
      });
  }, [perfilPlan, filtros, catalogos.modulos, hayFiltrosActivos, periodosResumenSet]);

  const costosAdicionalesView = useMemo(() => {
    return (costosAdicionales || [])
      .map((row, originalIndex) => ({ ...row, __originalIndex: originalIndex }))
      .filter((row) => shouldKeepByPeriodo(row));
  }, [costosAdicionales, hayFiltrosActivos, periodosResumenSet]);

  const planeacionPorPeriodo = useMemo(() => {
    const map = new Map();

    (perfilPlanView || []).forEach((row) => {
      if (!row?.activo) return;

      const periodo = getPeriodo(row);
      if (!periodo) return;

      if (!map.has(periodo)) {
        map.set(periodo, {
          periodo,
          horas_estimadas: 0,
          ingreso_estimado: 0,
          costo_estimado: 0,
        });
      }

      const item = map.get(periodo);
      item.horas_estimadas += toNumber(row.horas_estimadas);
      item.ingreso_estimado += toNumber(row.ingreso_estimado);
      item.costo_estimado += toNumber(row.costo_estimado);
    });

    Array.from(map.values()).forEach((item) => {
      item.precio_estimado =
        item.horas_estimadas > 0
          ? item.ingreso_estimado / item.horas_estimadas
          : 0;
    });

    return map;
  }, [perfilPlanView]);

  const totalsPresupuesto = useMemo(() => {
    return presupuestoMensualView.reduce(
      (acc, row) => {
        acc.ingreso += toNumber(row.ingreso_planeado);
        acc.costo += toNumber(row.costo_planeado);
        acc.gastoOp += toNumber(row.gasto_operativo_planeado);
        acc.costoAdm += toNumber(row.costo_administrativo_planeado);
        acc.ebitda += toNumber(row.ebitda_planeado);
        return acc;
      },
      { ingreso: 0, costo: 0, gastoOp: 0, costoAdm: 0, ebitda: 0 }
    );
  }, [presupuestoMensualView]);

  const totalsPerfil = useMemo(() => {
    return perfilPlanView.reduce(
      (acc, row) => {
        acc.horas += toNumber(row.horas_estimadas);
        acc.costo += toNumber(row.costo_estimado);
        acc.ingreso += toNumber(row.ingreso_estimado);
        return acc;
      },
      { horas: 0, costo: 0, ingreso: 0 }
    );
  }, [perfilPlanView]);

  const totalsAdicionales = useMemo(() => {
    return costosAdicionalesView.reduce(
      (acc, row) => acc + toNumber(row.valor),
      0
    );
  }, [costosAdicionalesView]);

  const resumenMensualCostos = useMemo(() => {
    return (mesesResumen || []).map((row) => {
      const periodo = row.periodo;
      const plan = planeacionPorPeriodo.get(periodo) || {
        precio_estimado: 0,
      };

      const costoPlaneado = toNumber(row.costo_planeado);
      const costoAdicional = toNumber(row.costo_adicional);
      const costoReal = toNumber(row.costo_real);
      const baseCostos = costoPlaneado + costoAdicional;

      const variacionCosto = costoReal - baseCostos;
      const pctUsoCostos =
        baseCostos > 0 ? (costoReal / baseCostos) * 100 : null;

      const estadoCostosCls = getAlertClass(pctUsoCostos, cabecera);

      return {
        ...row,
        precio_estimado: plan.precio_estimado || 0,
        variacion_costo: variacionCosto,
        pct_uso_costos: pctUsoCostos,
        estado_costos_cls: estadoCostosCls,
        estado_costos_label: estadoLabelByClass(estadoCostosCls),
      };
    });
  }, [mesesResumen, planeacionPorPeriodo, cabecera]);

  const totalsResumenMensual = useMemo(() => {
    const totalHorasPlan = Array.from(planeacionPorPeriodo.values()).reduce(
      (acc, row) => acc + toNumber(row.horas_estimadas),
      0
    );

    const totalIngresoPlan = Array.from(planeacionPorPeriodo.values()).reduce(
      (acc, row) => acc + toNumber(row.ingreso_estimado),
      0
    );

    const base = resumenMensualCostos.reduce(
      (acc, row) => {
        acc.ingreso_planeado += toNumber(row.ingreso_planeado);
        acc.costo_planeado += toNumber(row.costo_planeado);
        acc.costo_adicional += toNumber(row.costo_adicional);
        acc.costo_real += toNumber(row.costo_real);
        acc.variacion_costo += toNumber(row.variacion_costo);
        return acc;
      },
      {
        ingreso_planeado: 0,
        costo_planeado: 0,
        costo_adicional: 0,
        costo_real: 0,
        variacion_costo: 0,
      }
    );

    const baseCostos = base.costo_planeado + base.costo_adicional;
    base.precio_estimado =
      totalHorasPlan > 0 ? totalIngresoPlan / totalHorasPlan : 0;
    base.pct_uso_costos =
      baseCostos > 0 ? (base.costo_real / baseCostos) * 100 : null;
    base.estado_costos_cls = getAlertClass(base.pct_uso_costos, cabecera);
    base.estado_costos_label = estadoLabelByClass(base.estado_costos_cls);

    return base;
  }, [resumenMensualCostos, planeacionPorPeriodo, cabecera]);

  const comparativoHorasCosto = useMemo(() => {
    const map = new Map();

    Array.from(planeacionPorPeriodo.values()).forEach((item) => {
      map.set(item.periodo, {
        periodo: item.periodo,
        horas_estimadas: toNumber(item.horas_estimadas),
        ingreso_estimado: toNumber(item.ingreso_estimado),
        costo_estimado: toNumber(item.costo_estimado),
        precio_estimado: toNumber(item.precio_estimado),
        horas_reales: 0,
        costo_real: 0,
      });
    });

    (mesesResumen || []).forEach((row) => {
      const periodo = row.periodo;
      if (!periodo) return;

      if (!map.has(periodo)) {
        map.set(periodo, {
          periodo,
          horas_estimadas: 0,
          ingreso_estimado: 0,
          costo_estimado: 0,
          precio_estimado: 0,
          horas_reales: 0,
          costo_real: 0,
        });
      }

      const item = map.get(periodo);
      item.horas_reales += toNumber(row.horas_reales);
      item.costo_real += toNumber(row.costo_real);
    });

    return Array.from(map.values())
      .map((item) => {
        const variacionCosto = item.costo_estimado - item.costo_real;
        const variacionHoras = item.horas_estimadas - item.horas_reales;

        const pctUsoHoras =
          item.horas_estimadas > 0
            ? (item.horas_reales / item.horas_estimadas) * 100
            : null;

        const estadoCls = getAlertClass(pctUsoHoras, cabecera);

        return {
          ...item,
          variacion_costo: variacionCosto,
          variacion_horas: variacionHoras,
          pct_uso_horas: pctUsoHoras,
          estadoCls,
          estadoLabel: estadoLabelByClass(estadoCls),
        };
      })
      .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  }, [planeacionPorPeriodo, mesesResumen, cabecera]);

  const totalsComparativo = useMemo(() => {
    const acc = {
      horas_estimadas: 0,
      ingreso_estimado: 0,
      costo_estimado: 0,
      horas_reales: 0,
      costo_real: 0,
      variacion_costo: 0,
      variacion_horas: 0,
    };

    comparativoHorasCosto.forEach((row) => {
      acc.horas_estimadas += toNumber(row.horas_estimadas);
      acc.ingreso_estimado += toNumber(row.ingreso_estimado);
      acc.costo_estimado += toNumber(row.costo_estimado);
      acc.horas_reales += toNumber(row.horas_reales);
      acc.costo_real += toNumber(row.costo_real);
      acc.variacion_costo += toNumber(row.variacion_costo);
      acc.variacion_horas += toNumber(row.variacion_horas);
    });

    acc.precio_estimado =
      acc.horas_estimadas > 0
        ? acc.ingreso_estimado / acc.horas_estimadas
        : 0;

    acc.pct_uso_horas =
      acc.horas_estimadas > 0
        ? (acc.horas_reales / acc.horas_estimadas) * 100
        : null;

    acc.estadoCls = getAlertClass(acc.pct_uso_horas, cabecera);
    acc.estadoLabel = estadoLabelByClass(acc.estadoCls);

    return acc;
  }, [comparativoHorasCosto, cabecera]);

  const aplicarFiltros = (next) => {
    setFiltros(next);
    fetchAll(next);
  };

  const limpiarFiltros = () => {
    const next = { equipos: [], modulos: [], consultores: [] };
    setFiltros(next);
    fetchAll(next);
  };

  if (!proyectoId) return null;

  const toggleFiltro = (tipo, value) => {
  const current = filtros[tipo] || [];
  const exists = current.includes(value);

  const next = {
    ...filtros,
    [tipo]: exists
      ? current.filter((x) => x !== value)
      : [...current, value],
  };

  setFiltros(next);
  fetchAll(next);
};

  const FilterBox = ({ title, items, tipo }) => (
    <div className="pcp-filter-box">
      <div className="pcp-filter-title">{title}</div>

      <div className="pcp-filter-options">
        {items.length === 0 && (
          <div className="pcp-filter-empty">Sin opciones</div>
        )}

        {items.map((item) => (
          <label key={`${tipo}-${item.id}`} className="pcp-filter-check">
            <input
              type="checkbox"
              checked={(filtros[tipo] || []).includes(String(item.id))}
              onChange={() => toggleFiltro(tipo, String(item.id))}
            />
            <span>{item.nombre}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pcp">
      <div className="pcp-head">
        <div>
          <h2 className="pcp-title">Control financiero del proyecto</h2>
          <p className="pcp-subtitle">
            {proyecto
              ? `${proyecto.codigo} - ${proyecto.nombre}`
              : "Cargando proyecto..."}
          </p>
        </div>

        <button
          type="button"
          className="pcp-refresh"
          onClick={() => fetchAll(filtros)}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Refrescar"}
        </button>
      </div>

      <div className="pcp-card-groups">
        <div className="pcp-card-group">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("resumenReal")}
            aria-expanded={openSections.resumenReal}
          >
            <span className="pcp-card-group-title">Resumen real</span>
            <span className="pcp-collapse-icon">
              {openSections.resumenReal ? "▾" : "▸"}
            </span>
          </button>

          {openSections.resumenReal && (
            <div className="pcp-cards pcp-cards--three">
              <div className="pcp-card">
                <span className="pcp-card-label">Ingreso total</span>
                <strong>{formatMoney(cards.ingreso_total, cabecera.moneda)}</strong>
              </div>

              <div className="pcp-card">
                <span className="pcp-card-label">Costo real acumulado</span>
                <strong>
                  {formatMoney(cards.costo_real_acumulado, cabecera.moneda)}
                </strong>
              </div>

              <div className="pcp-card">
                <span className="pcp-card-label">Margen real</span>
                <strong>{formatMoney(cards.margen_real, cabecera.moneda)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="pcp-card-group">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("resumenPlaneado")}
            aria-expanded={openSections.resumenPlaneado}
          >
            <span className="pcp-card-group-title">Resumen planeado</span>
            <span className="pcp-collapse-icon">
              {openSections.resumenPlaneado ? "▾" : "▸"}
            </span>
          </button>

          {openSections.resumenPlaneado && (
            <div className="pcp-cards pcp-cards--three">
              <div className="pcp-card">
                <span className="pcp-card-label">Ingreso total</span>
                <strong>{formatMoney(cards.ingreso_total, cabecera.moneda)}</strong>
              </div>

              <div className="pcp-card">
                <span className="pcp-card-label">Costo planeado acumulado</span>
                <strong>
                  {formatMoney(cards.costo_planeado_acumulado, cabecera.moneda)}
                </strong>
              </div>

              <div className="pcp-card">
                <span className="pcp-card-label">Margen planeado</span>
                <strong>
                  {formatMoney(cards.margen_planeado, cabecera.moneda)}
                </strong>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("cabecera")}
            aria-expanded={openSections.cabecera}
          >
            <h3>Cabecera financiera</h3>
            <span className="pcp-collapse-icon">
              {openSections.cabecera ? "▾" : "▸"}
            </span>
          </button>

          {openSections.cabecera && (
            <button
              type="button"
              onClick={guardarCabecera}
              disabled={saving.cabecera || loading}
            >
              {saving.cabecera ? "Guardando..." : "Guardar cabecera"}
            </button>
          )}
        </div>

        {openSections.cabecera && (
          <div className="pcp-form-grid">
            <div className="pcp-field">
              <label>Código OT principal</label>
              <input
                value={cabecera.codigo_ot_principal}
                onChange={(e) =>
                  onCabeceraChange("codigo_ot_principal", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Moneda</label>
              <select
                value={cabecera.moneda}
                onChange={(e) => onCabeceraChange("moneda", e.target.value)}
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div className="pcp-field">
              <label>Estado financiero</label>
              <select
                value={cabecera.estado_financiero}
                onChange={(e) =>
                  onCabeceraChange("estado_financiero", e.target.value)
                }
              >
                <option value="BORRADOR">BORRADOR</option>
                <option value="CONFIGURADO">CONFIGURADO</option>
                <option value="ACTIVO">ACTIVO</option>
                <option value="PAUSADO">PAUSADO</option>
                <option value="CERRADO">CERRADO</option>
              </select>
            </div>

            <div className="pcp-field">
              <label>Ingreso total</label>
              <input
                value={cabecera.ingreso_total}
                onChange={(e) => onCabeceraChange("ingreso_total", e.target.value)}
              />
            </div>

            <div className="pcp-field">
              <label>Costo objetivo total</label>
              <input
                value={cabecera.costo_objetivo_total}
                onChange={(e) =>
                  onCabeceraChange("costo_objetivo_total", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Gasto operativo total</label>
              <input
                value={cabecera.gasto_operativo_total}
                onChange={(e) =>
                  onCabeceraChange("gasto_operativo_total", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Costo administrativo total</label>
              <input
                value={cabecera.costo_administrativo_total}
                onChange={(e) =>
                  onCabeceraChange("costo_administrativo_total", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>EBITDA objetivo</label>
              <input
                value={cabecera.ebitda_objetivo}
                onChange={(e) =>
                  onCabeceraChange("ebitda_objetivo", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>% margen objetivo</label>
              <input
                value={cabecera.margen_objetivo_pct}
                onChange={(e) =>
                  onCabeceraChange("margen_objetivo_pct", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Inicio ejecución</label>
              <input
                type="date"
                value={cabecera.fecha_inicio_ejecucion}
                onChange={(e) =>
                  onCabeceraChange("fecha_inicio_ejecucion", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Fin ejecución</label>
              <input
                type="date"
                value={cabecera.fecha_fin_ejecucion}
                onChange={(e) =>
                  onCabeceraChange("fecha_fin_ejecucion", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Inicio facturación</label>
              <input
                type="date"
                value={cabecera.fecha_inicio_facturacion}
                onChange={(e) =>
                  onCabeceraChange("fecha_inicio_facturacion", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Fin facturación</label>
              <input
                type="date"
                value={cabecera.fecha_fin_facturacion}
                onChange={(e) =>
                  onCabeceraChange("fecha_fin_facturacion", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Alerta 1 (%)</label>
              <input
                value={cabecera.alerta_umbral_1}
                onChange={(e) =>
                  onCabeceraChange("alerta_umbral_1", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Alerta 2 (%)</label>
              <input
                value={cabecera.alerta_umbral_2}
                onChange={(e) =>
                  onCabeceraChange("alerta_umbral_2", e.target.value)
                }
              />
            </div>

            <div className="pcp-field">
              <label>Alerta 3 (%)</label>
              <input
                value={cabecera.alerta_umbral_3}
                onChange={(e) =>
                  onCabeceraChange("alerta_umbral_3", e.target.value)
                }
              />
            </div>
          </div>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("filtros")}
            aria-expanded={openSections.filtros}
          >
            <div>
              <h3>Filtros globales</h3>
              <p className="pcp-note">
                Filtran las tablas por módulo y consultor.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.filtros ? "▾" : "▸"}
            </span>
          </button>

          {openSections.filtros && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={limpiarFiltros}
                disabled={loading}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>

        {openSections.filtros && (
          <div className="pcp-form-grid">
            <div className="pcp-filter-grid">
              <FilterBox
                title="Equipos"
                tipo="equipos"
                items={catalogos.equipos || []}
              />

              <FilterBox
                title="Módulos"
                tipo="modulos"
                items={catalogos.modulos || []}
              />

              <FilterBox
                title="Consultores"
                tipo="consultores"
                items={catalogos.consultores || []}
              />
            </div>

            <div className="pcp-field">
              <label>Consultores</label>
              <select
                multiple
                value={filtros.consultorIds}
                onChange={(e) =>
                  aplicarFiltros({
                    ...filtros,
                    consultorIds: getMultiValues(e),
                  })
                }
                size={Math.min(
                  10,
                  Math.max((catalogos.consultores || []).length, 4)
                )}
              >
                {(catalogos.consultores || []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("presupuesto")}
            aria-expanded={openSections.presupuesto}
          >
            <div>
              <h3>Presupuesto mensual</h3>
              <p className="pcp-note">
                Planeación manual de preventa por período.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.presupuesto ? "▾" : "▸"}
            </span>
          </button>

          {openSections.presupuesto && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={addPresupuestoRow}
              >
                + Agregar mes
              </button>
              <button
                type="button"
                onClick={guardarPresupuestoMensual}
                disabled={saving.presupuesto || loading}
              >
                {saving.presupuesto ? "Guardando..." : "Guardar presupuesto"}
              </button>
            </div>
          )}
        </div>

        {openSections.presupuesto && (
          <div className="pcp-table-wrap">
            <table className="pcp-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Mes</th>
                  <th>Ingreso planeado</th>
                  <th>Costo planeado</th>
                  <th>Gasto operativo</th>
                  <th>Costo administrativo</th>
                  <th>EBITDA</th>
                  <th>% Margen</th>
                  <th>Activo</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {presupuestoMensualView.length === 0 && (
                  <tr>
                    <td colSpan={10} className="pcp-empty">
                      Sin meses planeados
                    </td>
                  </tr>
                )}

                {presupuestoMensualView.map((row) => {
                  const index = row.__originalIndex;
                  return (
                    <tr key={row.__rowKey || row.id || `pm-${index}`}>
                      <td>
                        <input
                          value={row.anio}
                          onChange={(e) =>
                            onPresupuestoChange(index, "anio", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.mes}
                          onChange={(e) =>
                            onPresupuestoChange(index, "mes", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.ingreso_planeado ?? ""}
                          onChange={(e) =>
                            onPresupuestoChange(
                              index,
                              "ingreso_planeado",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.costo_planeado ?? ""}
                          onChange={(e) =>
                            onPresupuestoChange(
                              index,
                              "costo_planeado",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.gasto_operativo_planeado ?? ""}
                          onChange={(e) =>
                            onPresupuestoChange(
                              index,
                              "gasto_operativo_planeado",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.costo_administrativo_planeado ?? ""}
                          onChange={(e) =>
                            onPresupuestoChange(
                              index,
                              "costo_administrativo_planeado",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input value={row.ebitda_planeado ?? ""} readOnly />
                      </td>
                      <td>
                        <input value={row.margen_planeado_pct ?? ""} readOnly />
                      </td>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={!!row.activo}
                          onChange={(e) =>
                            onPresupuestoChange(
                              index,
                              "activo",
                              e.target.checked
                            )
                          }
                        />
                      </td>
                      <td className="center">
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                          }}
                        >
                          <button
                            type="button"
                            className="secondary ghost"
                            onClick={() => copyPresupuestoRow(index)}
                          >
                            Copiar
                          </button>

                          <button
                            type="button"
                            className="danger ghost"
                            onClick={() => removePresupuestoRow(index)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th colSpan={2}>Totales</th>
                  <th>{formatMoney(totalsPresupuesto.ingreso, cabecera.moneda)}</th>
                  <th>{formatMoney(totalsPresupuesto.costo, cabecera.moneda)}</th>
                  <th>{formatMoney(totalsPresupuesto.gastoOp, cabecera.moneda)}</th>
                  <th>{formatMoney(totalsPresupuesto.costoAdm, cabecera.moneda)}</th>
                  <th>{formatMoney(totalsPresupuesto.ebitda, cabecera.moneda)}</th>
                  <th colSpan={3}></th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("perfiles")}
            aria-expanded={openSections.perfiles}
          >
            <div>
              <h3>Planeación por perfil</h3>
              <p className="pcp-note">
                Selecciona un perfil general, el módulo y el consultor para la fila.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.perfiles ? "▾" : "▸"}
            </span>
          </button>

          {openSections.perfiles && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={addPerfilRow}
              >
                + Agregar perfil
              </button>
              <button
                type="button"
                onClick={guardarPerfilPlan}
                disabled={saving.perfiles || loading}
              >
                {saving.perfiles ? "Guardando..." : "Guardar perfiles"}
              </button>
            </div>
          )}
        </div>

        {openSections.perfiles && (
          <>
            {(catalogos.modulos || []).length === 0 && (
              <div className="pcp-empty" style={{ marginBottom: 12 }}>
                Este proyecto no tiene módulos configurados.
              </div>
            )}

            <div className="pcp-table-wrap">
              <table className="pcp-table">
                <thead>
                  <tr>
                    <th>Año</th>
                    <th>Mes</th>
                    <th>Perfil</th>
                    <th>Módulo</th>
                    <th>Horas estimadas</th>
                    <th>Valor hora ingreso</th>
                    <th>Valor hora planeado</th>
                    <th>Costo estimado</th>
                    <th>Ingreso estimado</th>
                    <th>Observación</th>
                    <th>Activo</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {perfilPlanView.length === 0 && (
                    <tr>
                      <td colSpan={12} className="pcp-empty">
                        Sin planeación por perfil
                      </td>
                    </tr>
                  )}

                  {perfilPlanView.map((row) => {
                    const index = row.__originalIndex;
                    return (
                      <tr key={row.__rowKey || row.id || `pp-${index}`}>
                        <td>
                          <input
                            value={row.anio}
                            onChange={(e) =>
                              onPerfilChange(index, "anio", e.target.value)
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={row.mes}
                            onChange={(e) =>
                              onPerfilChange(index, "mes", e.target.value)
                            }
                          />
                        </td>

                        <td>
                          <select
                            value={row.perfil_id ?? ""}
                            onChange={(e) =>
                              onPerfilChange(index, "perfil_id", e.target.value)
                            }
                          >
                            <option value="">Seleccione</option>
                            {(catalogos.perfiles || []).map((p) => (
                              <option key={String(p.id)} value={String(p.id)}>
                                {perfilLabel(p)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <select
                            value={row.modulo_id ?? ""}
                            onChange={(e) =>
                              onPerfilChange(index, "modulo_id", e.target.value)
                            }
                            disabled={!row.perfil_id}
                          >
                            <option value="">Seleccione</option>
                            {(catalogos.modulos || []).map((m) => (
                              <option key={String(m.id)} value={String(m.id)}>
                                {m.nombre}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <input
                            value={row.horas_estimadas ?? ""}
                            onChange={(e) =>
                              onPerfilChange(
                                index,
                                "horas_estimadas",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={row.valor_hora_ingreso ?? ""}
                            onChange={(e) =>
                              onPerfilChange(
                                index,
                                "valor_hora_ingreso",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={row.valor_hora_planeado ?? ""}
                            onChange={(e) =>
                              onPerfilChange(
                                index,
                                "valor_hora_planeado",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input value={row.costo_estimado ?? ""} readOnly />
                        </td>

                        <td>
                          <input value={row.ingreso_estimado ?? ""} readOnly />
                        </td>

                        <td>
                          <input
                            value={row.observacion ?? ""}
                            onChange={(e) =>
                              onPerfilChange(
                                index,
                                "observacion",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td className="center">
                          <input
                            type="checkbox"
                            checked={!!row.activo}
                            onChange={(e) =>
                              onPerfilChange(index, "activo", e.target.checked)
                            }
                          />
                        </td>

                        <td className="center">
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              justifyContent: "center",
                            }}
                          >
                            <button
                              type="button"
                              className="secondary ghost"
                              onClick={() => copyPerfilRow(index)}
                            >
                              Copiar
                            </button>

                            <button
                              type="button"
                              className="danger ghost"
                              onClick={() => removePerfilRow(index)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr>
                    <th colSpan={4}>Totales</th>
                    <th>{formatNumber(totalsPerfil.horas)}</th>
                    <th></th>
                    <th></th>
                    <th>{formatMoney(totalsPerfil.costo, cabecera.moneda)}</th>
                    <th>{formatMoney(totalsPerfil.ingreso, cabecera.moneda)}</th>
                    <th colSpan={3}></th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("adicionales")}
            aria-expanded={openSections.adicionales}
          >
            <div>
              <h3>Costos adicionales</h3>
              <p className="pcp-note">
                Costos no incluidos en la planeación por perfil.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.adicionales ? "▾" : "▸"}
            </span>
          </button>

          {openSections.adicionales && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={addCostoAdicionalRow}
              >
                + Agregar costo
              </button>
              <button
                type="button"
                onClick={guardarCostosAdicionales}
                disabled={saving.adicionales || loading}
              >
                {saving.adicionales
                  ? "Guardando..."
                  : "Guardar costos adicionales"}
              </button>
            </div>
          )}
        </div>

        {openSections.adicionales && (
          <div className="pcp-table-wrap">
            <table className="pcp-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Mes</th>
                  <th>Tipo costo</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Valor</th>
                  <th>Activo</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {costosAdicionalesView.length === 0 && (
                  <tr>
                    <td colSpan={8} className="pcp-empty">
                      Sin costos adicionales
                    </td>
                  </tr>
                )}

                {costosAdicionalesView.map((row) => {
                  const index = row.__originalIndex;
                  return (
                    <tr key={row.__rowKey || row.id || `ca-${index}`}>
                      <td>
                        <input
                          value={row.anio}
                          onChange={(e) =>
                            onAdicionalChange(index, "anio", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.mes}
                          onChange={(e) =>
                            onAdicionalChange(index, "mes", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={row.tipo_costo ?? "OTRO"}
                          onChange={(e) =>
                            onAdicionalChange(
                              index,
                              "tipo_costo",
                              e.target.value
                            )
                          }
                        >
                          <option value="OPERATIVO">OPERATIVO</option>
                          <option value="ADMINISTRATIVO">ADMINISTRATIVO</option>
                          <option value="OTRO">OTRO</option>
                        </select>
                      </td>

                      <td>
                        <input
                          value={row.categoria ?? ""}
                          onChange={(e) =>
                            onAdicionalChange(
                              index,
                              "categoria",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.descripcion ?? ""}
                          onChange={(e) =>
                            onAdicionalChange(
                              index,
                              "descripcion",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.valor ?? ""}
                          onChange={(e) =>
                            onAdicionalChange(index, "valor", e.target.value)
                          }
                        />
                      </td>

                      <td className="center">
                        <input
                          type="checkbox"
                          checked={!!row.activo}
                          onChange={(e) =>
                            onAdicionalChange(index, "activo", e.target.checked)
                          }
                        />
                      </td>

                      <td className="center">
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                          }}
                        >
                          <button
                            type="button"
                            className="secondary ghost"
                            onClick={() => copyCostoAdicionalRow(index)}
                          >
                            Copiar
                          </button>

                          <button
                            type="button"
                            className="danger ghost"
                            onClick={() => removeCostoAdicionalRow(index)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th colSpan={5}>Total costos adicionales</th>
                  <th>{formatMoney(totalsAdicionales, cabecera.moneda)}</th>
                  <th colSpan={2}></th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("resumenMensual")}
            aria-expanded={openSections.resumenMensual}
          >
            <div>
              <h3>Resumen mensual real vs planeado</h3>
              <p className="pcp-note">
                Consolidado usando horas reales registradas al proyecto.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.resumenMensual ? "▾" : "▸"}
            </span>
          </button>

          {openSections.resumenMensual && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowUsoCostosColumns((prev) => !prev)}
              >
                {showUsoCostosColumns
                  ? "Ocultar % uso y estado costos"
                  : "Ver % uso y estado costos"}
              </button>
            </div>
          )}
        </div>

        {openSections.resumenMensual && (
          <div className="pcp-table-wrap">
            <table className="pcp-table pcp-table-summary">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Ingreso planeado</th>
                  <th>Precio estimado</th>
                  <th>Costo planeado</th>
                  <th>Adicional</th>
                  <th>Costo real</th>
                  <th>Variación costo</th>
                  {showUsoCostosColumns && <th>% Uso costos</th>}
                  {showUsoCostosColumns && <th>Estado costos</th>}
                </tr>
              </thead>

              <tbody>
                {resumenMensualCostos.length === 0 && (
                  <tr>
                    <td
                      colSpan={showUsoCostosColumns ? 9 : 7}
                      className="pcp-empty"
                    >
                      Aún no hay resumen mensual
                    </td>
                  </tr>
                )}

                {resumenMensualCostos.map((row) => (
                  <tr key={row.periodo}>
                    <td>{row.periodo}</td>
                    <td>{formatMoney(row.ingreso_planeado, cabecera.moneda)}</td>
                    <td>{formatMoney(row.precio_estimado, cabecera.moneda)}</td>
                    <td>{formatMoney(row.costo_planeado, cabecera.moneda)}</td>
                    <td>{formatMoney(row.costo_adicional, cabecera.moneda)}</td>
                    <td>{formatMoney(row.costo_real, cabecera.moneda)}</td>
                    <td>{formatMoney(row.variacion_costo, cabecera.moneda)}</td>

                    {showUsoCostosColumns && (
                      <td>
                        {row.pct_uso_costos == null
                          ? "—"
                          : `${formatNumber(row.pct_uso_costos)}%`}
                      </td>
                    )}

                    {showUsoCostosColumns && (
                      <td>
                        <span className={`pcp-badge ${row.estado_costos_cls}`}>
                          {row.estado_costos_label}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <th>Totales</th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.ingreso_planeado,
                      cabecera.moneda
                    )}
                  </th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.precio_estimado,
                      cabecera.moneda
                    )}
                  </th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.costo_planeado,
                      cabecera.moneda
                    )}
                  </th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.costo_adicional,
                      cabecera.moneda
                    )}
                  </th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.costo_real,
                      cabecera.moneda
                    )}
                  </th>
                  <th>
                    {formatMoney(
                      totalsResumenMensual.variacion_costo,
                      cabecera.moneda
                    )}
                  </th>

                  {showUsoCostosColumns && (
                    <th>
                      {totalsResumenMensual.pct_uso_costos == null
                        ? "—"
                        : `${formatNumber(
                            totalsResumenMensual.pct_uso_costos
                          )}%`}
                    </th>
                  )}

                  {showUsoCostosColumns && (
                    <th>
                      <span
                        className={`pcp-badge ${totalsResumenMensual.estado_costos_cls}`}
                      >
                        {totalsResumenMensual.estado_costos_label}
                      </span>
                    </th>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="pcp-section">
        <div className="pcp-section-head">
          <button
            type="button"
            className="pcp-collapse-trigger"
            onClick={() => toggleSection("comparativo")}
            aria-expanded={openSections.comparativo}
          >
            <div>
              <h3>Comparativo horas y costo estimado vs real</h3>
              <p className="pcp-note">
                Horas estimadas tomadas desde Planeación por perfil y comparadas
                contra horas reales del proyecto.
              </p>
            </div>
            <span className="pcp-collapse-icon">
              {openSections.comparativo ? "▾" : "▸"}
            </span>
          </button>

          {openSections.comparativo && (
            <div className="pcp-section-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowUsoHorasColumns((prev) => !prev)}
              >
                {showUsoHorasColumns
                  ? "Ocultar % uso y estado horas"
                  : "Ver % uso y estado horas"}
              </button>
            </div>
          )}
        </div>

        {openSections.comparativo && (
          <div className="pcp-table-wrap">
            <table className="pcp-table pcp-table-summary">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Horas estimadas</th>
                  <th>Horas reales</th>
                  <th>Variación horas</th>
                  <th>Variación costo</th>
                  {showUsoHorasColumns && <th>% Uso horas</th>}
                  {showUsoHorasColumns && <th>Estado horas</th>}
                </tr>
              </thead>

              <tbody>
                {comparativoHorasCosto.length === 0 && (
                  <tr>
                    <td
                      colSpan={showUsoHorasColumns ? 10 : 8}
                      className="pcp-empty"
                    >
                      Sin comparativo disponible
                    </td>
                  </tr>
                )}

                {comparativoHorasCosto.map((row) => (
                  <tr key={row.periodo}>
                    <td>{row.periodo}</td>
                    <td>{formatNumber(row.horas_estimadas)}</td>
                    <td>{formatNumber(row.horas_reales)}</td>
                    <td>{formatNumber(row.variacion_horas)}</td>

                    {showUsoHorasColumns && (
                      <td>
                        {row.pct_uso_horas == null
                          ? "—"
                          : `${formatNumber(row.pct_uso_horas)}%`}
                      </td>
                    )}

                    {showUsoHorasColumns && (
                      <td>
                        <span className={`pcp-badge ${row.estadoCls}`}>
                          {row.estadoLabel}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <th>Totales</th>
                  <th>{formatNumber(totalsComparativo.horas_estimadas)}</th>
                  <th>{formatNumber(totalsComparativo.horas_reales)}</th>
                  <th>{formatNumber(totalsComparativo.variacion_horas)}</th>

                  {showUsoHorasColumns && (
                    <th>
                      {totalsComparativo.pct_uso_horas == null
                        ? "—"
                        : `${formatNumber(
                            totalsComparativo.pct_uso_horas
                          )}%`}
                    </th>
                  )}

                  {showUsoHorasColumns && (
                    <th>
                      <span className={`pcp-badge ${totalsComparativo.estadoCls}`}>
                        {totalsComparativo.estadoLabel}
                      </span>
                    </th>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
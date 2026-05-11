import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch } from "./lib/api";
import ModalMapeoProyecto from "./ModalMapeoProyecto";
import ProyectoCostosPanel from "./Proyectos/ProyectoCostosPanel";
import "./Proyectos.css";

const DEFAULT_FASES = [
  { id: "__DESCUBRIR__", nombre: "Descubrir" },
  { id: "__PREPARAR__", nombre: "Preparar" },
  { id: "__EXPLORAR__", nombre: "Explorar" },
  { id: "__REALIZAR__", nombre: "Realizar" },
  { id: "__DESPLEGAR__", nombre: "Desplegar" },
  { id: "__OPERAR__", nombre: "Operar" },
];

const emptyForm = () => ({
  id: null,
  oportunidad_id: "",
  codigo: "",
  nombre: "",
  tipo_negocio: "",
  fases: [],
  activo: true,
  perfiles: [],
  perfil_consultores: {},
  cliente_id: "",
});

const norm = (s) => String(s ?? "").trim();

const normKey = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const asBool = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || v === 1 || s === "1" || s === "true";
};

const toArrayResponse = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
};

const getProyectoFasesIds = (p) => {
  if (Array.isArray(p?.fases_ids)) {
    return p.fases_ids.map(String).filter(Boolean);
  }

  if (Array.isArray(p?.fases)) {
    return p.fases
      .map((x) => String(x?.fase_id ?? x?.fase?.id ?? x?.id))
      .filter(Boolean);
  }

  return [];
};

const getProyectoFasesNames = (p, fasesMap) => {
  if (Array.isArray(p?.fases) && p.fases.length) {
    const names = p.fases
      .map((f) => String(f?.fase?.nombre ?? f?.nombre ?? "").trim())
      .filter(Boolean);

    if (names.length) return names;
  }

  const ids = getProyectoFasesIds(p);
  return ids.map((id) => fasesMap.get(String(id))).filter(Boolean);
};

const getProyectoModulosIds = (p) => {
  if (Array.isArray(p?.modulos_ids)) {
    return p.modulos_ids
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  if (Array.isArray(p?.modulos)) {
    return p.modulos
      .map((x) => Number(x?.modulo_id ?? x?.modulo?.id ?? x?.id))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  return [];
};

const getProyectoPerfilesIds = (p) => {
  if (Array.isArray(p?.perfiles_ids)) {
    return p.perfiles_ids
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  if (Array.isArray(p?.perfiles)) {
    return p.perfiles
      .map((x) => Number(x?.perfil_id ?? x?.perfil?.id ?? x?.id))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  return [];
};

const getPerfilModuloIds = (perfil) => {
  if (!Array.isArray(perfil?.modulos)) return [];

  return perfil.modulos
    .map((m) => Number(m?.id ?? m?.modulo_id ?? m?.modulo?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
};

const getPerfilModulos = (perfil) => {
  if (!Array.isArray(perfil?.modulos)) return [];

  return perfil.modulos
    .map((m) => ({
      id: Number(m?.id ?? m?.modulo_id ?? m?.modulo?.id),
      nombre: String(m?.nombre ?? m?.modulo?.nombre ?? "").trim(),
    }))
    .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.nombre);
};

const getProyectoModulosNames = (p, modulosMap) => {
  if (!Array.isArray(p?.modulos)) return [];

  return p.modulos
    .map((x) => {
      const id = Number(x?.modulo_id ?? x?.modulo?.id ?? x?.id);

      return String(
        x?.modulo?.nombre ??
          x?.nombre ??
          modulosMap.get(id) ??
          ""
      ).trim();
    })
    .filter(Boolean);
};

const getProyectoPerfilesNames = (p) => {
  if (!Array.isArray(p?.perfiles)) return [];

  return p.perfiles
    .map((x) =>
      String(
        x?.perfil?.nombre ??
          x?.nombre ??
          ""
      ).trim()
    )
    .filter(Boolean);
};

const findClienteIdByNombre = (clientes, nombreCliente) => {
  const target = normKey(nombreCliente);
  if (!target) return "";

  const found = (clientes || []).find((c) => {
    const name = c?.nombre_cliente ?? c?.nombre ?? "";
    return normKey(name) === target;
  });

  return found?.id ? String(found.id) : "";
};

const oppLabel = (o) => {
  const prc = String(o?.codigo_prc || "").trim();
  const cliente = String(o?.nombre_cliente || "").trim();
  const servicio = String(o?.servicio || "").trim();

  return [prc, cliente, servicio].filter(Boolean).join(" — ");
};

const getProyectoPerfilConsultoresMap = (p) => {
  const out = {};

  const raw =
    p?.perfil_consultores ??
    p?.consultores_por_perfil ??
    p?.perfiles_consultores ??
    null;

  if (!raw) return out;

  if (!Array.isArray(raw) && typeof raw === "object") {
    Object.entries(raw).forEach(([perfilId, consultoresIds]) => {
      const pid = String(perfilId);
      const ids = Array.isArray(consultoresIds) ? consultoresIds : [];

      out[pid] = ids
        .map((x) => Number(x?.consultor_id ?? x?.id ?? x))
        .filter((n) => Number.isFinite(n) && n > 0);
    });

    return out;
  }

  if (Array.isArray(raw)) {
    raw.forEach((row) => {
      const pid = String(row?.perfil_id ?? row?.perfil?.id ?? "");
      const cid = Number(row?.consultor_id ?? row?.consultor?.id ?? row?.id);

      if (!pid || !Number.isFinite(cid) || cid <= 0) return;

      if (!out[pid]) out[pid] = [];

      if (!out[pid].includes(cid)) {
        out[pid].push(cid);
      }
    });
  }

  return out;
};

export default function Proyectos() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [proyectos, setProyectos] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [fases, setFases] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);

  const [q, setQ] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [form, setForm] = useState(emptyForm());
  const isEdit = !!form.id;

  const [mapeoOpen, setMapeoOpen] = useState(false);
  const [proyectoMapeo, setProyectoMapeo] = useState(null);

  const [costosOpen, setCostosOpen] = useState(false);
  const [proyectoCostos, setProyectoCostos] = useState(null);

  const openMapeoModal = (p) => {
    setProyectoMapeo(p);
    setMapeoOpen(true);
  };

  const closeMapeoModal = () => {
    setMapeoOpen(false);
    setProyectoMapeo(null);
  };

  const openCostosPanel = (p) => {
    setProyectoCostos(p);
    setCostosOpen(true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const closeCostosPanel = () => {
    setCostosOpen(false);
    setProyectoCostos(null);
  };

  const fetchAll = async () => {
    setLoading(true);

    try {
      const [pRes, mRes, pfRes, fRes, cRes, oRes, consRes] =
        await Promise.all([
          jfetch(
            "/proyectos?include_modulos=1&include_fases=1&include_perfiles=1&include_consultores=1"
          ),
          jfetch("/modulos"),
          jfetch("/perfiles?include_modulos=1&activos=1"),
          jfetch("/proyecto-fases"),
          jfetch("/clientes"),
          jfetch("/oportunidades/elegibles-proyecto"),
          jfetch("/consultores"),
        ]);

      const pData = await pRes.json().catch(() => []);
      const mData = await mRes.json().catch(() => []);
      const pfData = await pfRes.json().catch(() => []);
      const fData = await fRes.json().catch(() => []);
      const cData = await cRes.json().catch(() => []);
      const oData = await oRes.json().catch(() => []);
      const consData = await consRes.json().catch(() => []);

      if (!pRes.ok) throw new Error(pData?.mensaje || `HTTP ${pRes.status}`);
      if (!mRes.ok) throw new Error(mData?.mensaje || `HTTP ${mRes.status}`);
      if (!pfRes.ok) throw new Error(pfData?.mensaje || `HTTP ${pfRes.status}`);
      if (!fRes.ok) throw new Error(fData?.mensaje || `HTTP ${fRes.status}`);
      if (!cRes.ok) throw new Error(cData?.mensaje || `HTTP ${cRes.status}`);
      if (!oRes.ok) throw new Error(oData?.mensaje || `HTTP ${oRes.status}`);
      if (!consRes.ok) {
        throw new Error(consData?.mensaje || `HTTP ${consRes.status}`);
      }

      setProyectos(
        toArrayResponse(pData).map((p) => ({
          ...p,
          activo: asBool(p?.activo),
        }))
      );

      setModulos(toArrayResponse(mData));

      setPerfiles(
        toArrayResponse(pfData).map((p) => ({
          ...p,
          activo: asBool(p?.activo),
        }))
      );

      setConsultores(
        toArrayResponse(consData).map((c) => ({
          ...c,
          activo: c?.activo === undefined ? true : asBool(c?.activo),
        }))
      );

      setClientes(toArrayResponse(cData));
      setOportunidades(toArrayResponse(oData));

      const backendFases = toArrayResponse(fData);
      const byName = new Map();

      backendFases.forEach((x) => {
        byName.set(normKey(x?.nombre), x);
      });

      const merged = [...backendFases];

      DEFAULT_FASES.forEach((df) => {
        if (!byName.has(normKey(df.nombre))) {
          merged.push({
            id: df.id,
            nombre: df.nombre,
            activo: true,
            orden: 0,
          });
        }
      });

      merged.sort((a, b) => {
        const ao = Number(a?.orden ?? 0);
        const bo = Number(b?.orden ?? 0);

        if (ao !== bo) return ao - bo;

        return String(a?.nombre || "").localeCompare(
          String(b?.nombre || ""),
          "es"
        );
      });

      setFases(merged);
    } catch (e) {
      console.error(e);

      Swal.fire({
        icon: "error",
        title: "Error cargando datos",
        text: String(e.message || e),
      });

      setProyectos([]);
      setModulos([]);
      setPerfiles([]);
      setConsultores([]);
      setFases(DEFAULT_FASES);
      setClientes([]);
      setOportunidades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const modulosMap = useMemo(() => {
    const m = new Map();

    (modulos || []).forEach((x) => {
      const id = Number(x?.id);
      if (Number.isFinite(id)) {
        m.set(id, String(x?.nombre || ""));
      }
    });

    return m;
  }, [modulos]);

  const fasesMap = useMemo(() => {
    const m = new Map();

    (fases || []).forEach((x) => {
      if (x?.id != null) {
        m.set(String(x.id), String(x.nombre || ""));
      }
    });

    return m;
  }, [fases]);

  const clientesMap = useMemo(() => {
    const m = new Map();

    (clientes || []).forEach((c) => {
      const id = Number(c?.id);
      const name = c?.nombre_cliente ?? c?.nombre ?? "";

      if (Number.isFinite(id)) {
        m.set(id, String(name));
      }
    });

    return m;
  }, [clientes]);

  const oportunidadesMap = useMemo(() => {
    const m = new Map();

    (oportunidades || []).forEach((o) => {
      if (o?.id != null) {
        m.set(String(o.id), o);
      }
    });

    return m;
  }, [oportunidades]);

  const perfilesSeleccionados = useMemo(() => {
    const selected = new Set((form.perfiles || []).map(Number));

    return (perfiles || []).filter((p) => selected.has(Number(p.id)));
  }, [form.perfiles, perfiles]);

  const modulosAutomaticosPorPerfil = useMemo(() => {
    const result = new Map();

    perfilesSeleccionados.forEach((perfil) => {
      result.set(Number(perfil.id), getPerfilModulos(perfil));
    });

    return result;
  }, [perfilesSeleccionados]);

  const modulosAutomaticosIds = useMemo(() => {
    const ids = new Set();

    Array.from(modulosAutomaticosPorPerfil.values()).forEach((mods) => {
      mods.forEach((m) => ids.add(Number(m.id)));
    });

    return Array.from(ids).filter((n) => Number.isFinite(n) && n > 0);
  }, [modulosAutomaticosPorPerfil]);

  const modulosAutomaticosNames = useMemo(() => {
    const names = new Map();

    Array.from(modulosAutomaticosPorPerfil.values()).forEach((mods) => {
      mods.forEach((m) => {
        if (m.id && m.nombre) names.set(Number(m.id), m.nombre);
      });
    });

    return Array.from(names.values());
  }, [modulosAutomaticosPorPerfil]);

  const proyectosFiltrados = useMemo(() => {
    const needle = norm(q).toLowerCase();

    return (proyectos || []).filter((p) => {
      const activo = asBool(p?.activo);

      if (soloActivos && !activo) return false;
      if (!needle) return true;

      const fasesTxt = getProyectoFasesNames(p, fasesMap)
        .join(" ")
        .toLowerCase();

      const modulosTxt = getProyectoModulosNames(p, modulosMap)
        .join(" ")
        .toLowerCase();

      const perfilesTxt = getProyectoPerfilesNames(p)
        .join(" ")
        .toLowerCase();

      const clienteTxt = String(
        p?.cliente?.nombre_cliente ??
          p?.cliente?.nombre ??
          (p?.cliente_id != null ? clientesMap.get(Number(p?.cliente_id)) : "") ??
          ""
      ).toLowerCase();

      const tipoTxt = String(p?.tipo_negocio || "").toLowerCase();

      return (
        String(p.codigo || "").toLowerCase().includes(needle) ||
        String(p.nombre || "").toLowerCase().includes(needle) ||
        fasesTxt.includes(needle) ||
        modulosTxt.includes(needle) ||
        perfilesTxt.includes(needle) ||
        clienteTxt.includes(needle) ||
        tipoTxt.includes(needle)
      );
    });
  }, [proyectos, q, soloActivos, fasesMap, modulosMap, clientesMap]);

  const togglePerfil = (id) => {
    const pid = Number(id);

    setForm((f) => {
      const set = new Set((f.perfiles || []).map(Number));
      const perfilConsultores = { ...(f.perfil_consultores || {}) };

      if (set.has(pid)) {
        set.delete(pid);
        delete perfilConsultores[String(pid)];
      } else {
        set.add(pid);
        perfilConsultores[String(pid)] =
          perfilConsultores[String(pid)] || [];
      }

      return {
        ...f,
        perfiles: Array.from(set),
        perfil_consultores: perfilConsultores,
      };
    });
  };

  const toggleConsultorPerfil = (perfilId, consultorId) => {
    const pid = String(perfilId);
    const cid = Number(consultorId);

    setForm((f) => {
      const current = new Set(
        (f.perfil_consultores?.[pid] || []).map(Number)
      );

      if (current.has(cid)) {
        current.delete(cid);
      } else {
        current.add(cid);
      }

      return {
        ...f,
        perfil_consultores: {
          ...(f.perfil_consultores || {}),
          [pid]: Array.from(current),
        },
      };
    });
  };

  const getConsultoresPorPerfil = (perfil) => {
    const modulosPerfil = getPerfilModuloIds(perfil);
    const modulosPerfilSet = new Set(modulosPerfil.map(Number));

    const modsPerfilNombres = (perfil.modulos || [])
      .map((m) =>
        String(m?.nombre ?? m?.modulo?.nombre ?? "")
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);

    return (consultores || []).filter((c) => {
      if (c?.activo === false) return false;

      const modsConsultor = Array.isArray(c.modulos) ? c.modulos : [];

      const idsConsultor = modsConsultor
        .map((m) => Number(m?.id ?? m?.modulo_id ?? m?.modulo?.id))
        .filter((n) => Number.isFinite(n));

      const nombresConsultor = modsConsultor
        .map((m) => String(m?.nombre ?? m).trim().toUpperCase())
        .filter(Boolean);

      const matchPorId = idsConsultor.some((mid) => modulosPerfilSet.has(mid));

      const matchPorNombre = nombresConsultor.some((nombre) =>
        modsPerfilNombres.includes(nombre)
      );

      return matchPorId || matchPorNombre;
    });
  };

  const toggleFase = (faseId) => {
    const fid = String(faseId);

    setForm((f) => {
      const set = new Set((f.fases || []).map(String));

      if (set.has(fid)) {
        set.delete(fid);
      } else {
        set.add(fid);
      }

      return {
        ...f,
        fases: Array.from(set),
      };
    });
  };

  const handleOportunidadChange = (oppId) => {
    const opp = oportunidadesMap.get(String(oppId));

    if (!opp) {
      setForm((f) => ({
        ...f,
        oportunidad_id: "",
        codigo: "",
        tipo_negocio: "",
      }));
      return;
    }

    const clienteIdFound = findClienteIdByNombre(clientes, opp.nombre_cliente);

    setForm((f) => ({
      ...f,
      oportunidad_id: String(opp.id),
      codigo: String(opp.codigo_prc || "").trim().toUpperCase(),
      tipo_negocio: String(opp.tipo_negocio || "").trim().toUpperCase(),
      cliente_id: clienteIdFound || f.cliente_id || "",
    }));
  };

  const resetForm = () => setForm(emptyForm());

  const startEdit = (p) => {
    const oppFromProject = p?.oportunidad_id
      ? oportunidadesMap.get(String(p.oportunidad_id))
      : null;

    const oppByPrc =
      !oppFromProject && p?.codigo
        ? (oportunidades || []).find(
            (o) =>
              String(o.codigo_prc || "").trim().toUpperCase() ===
              String(p.codigo || "").trim().toUpperCase()
          )
        : null;

    const opp = oppFromProject || oppByPrc || null;

    setForm({
      id: p.id,
      oportunidad_id:
        p?.oportunidad_id != null
          ? String(p.oportunidad_id)
          : opp?.id
            ? String(opp.id)
            : "",
      codigo: p.codigo || (opp?.codigo_prc ?? ""),
      nombre: p.nombre || "",
      tipo_negocio: p?.tipo_negocio || (opp?.tipo_negocio ?? ""),
      activo: asBool(p.activo),
      perfiles: getProyectoPerfilesIds(p),
      perfil_consultores: getProyectoPerfilConsultoresMap(p),
      fases: getProyectoFasesIds(p),
      cliente_id: p?.cliente_id != null ? String(p.cliente_id) : "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = async (p) => {
    const res = await Swal.fire({
      icon: "warning",
      title: "Eliminar proyecto",
      text: `¿Seguro de eliminar "${p.codigo} - ${p.nombre}"?`,
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!res.isConfirmed) return;

    try {
      setSaving(true);

      const r = await jfetch(`/proyectos/${p.id}`, {
        method: "DELETE",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);

      Swal.fire({
        icon: "success",
        title: "Eliminado",
      });

      await fetchAll();

      if (form.id === p.id) resetForm();
      if (proyectoCostos?.id === p.id) closeCostosPanel();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "No se pudo eliminar",
        text: String(e.message || e),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p) => {
    try {
      setSaving(true);

      const r = await jfetch(`/proyectos/${p.id}/toggle-activo`, {
        method: "PUT",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);

      await fetchAll();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "No se pudo cambiar estado",
        text: String(e.message || e),
      });
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    if (!String(form.oportunidad_id || "").trim()) {
      return "Debes seleccionar una oportunidad ganada";
    }

    if (!norm(form.codigo)) return "El código PRC es obligatorio";
    if (!norm(form.nombre)) return "El nombre es obligatorio";

    if (!Array.isArray(form.perfiles) || form.perfiles.length === 0) {
      return "Debes seleccionar al menos 1 perfil";
    }

    if (!Array.isArray(modulosAutomaticosIds) || modulosAutomaticosIds.length === 0) {
      return "Los perfiles seleccionados no tienen módulos asociados";
    }

    const perfilesSinConsultor = (form.perfiles || []).filter((perfilId) => {
      const ids = form.perfil_consultores?.[String(perfilId)] || [];
      return ids.length === 0;
    });

    if (perfilesSinConsultor.length > 0) {
      return "Debes seleccionar al menos 1 consultor para cada perfil del proyecto";
    }

    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const err = validateForm();

    if (err) {
      return Swal.fire({
        icon: "warning",
        title: err,
      });
    }

    const fasesIds = (form.fases || [])
      .map(String)
      .filter((x) => x && !x.startsWith("__"))
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    const clienteIdClean = String(form.cliente_id || "").trim();
    const oportunidadIdClean = String(form.oportunidad_id || "").trim();

    const payload = {
      codigo: norm(form.codigo).toUpperCase(),
      nombre: norm(form.nombre),
      activo: !!form.activo,
      perfiles: (form.perfiles || []).map(Number),
      modulos: modulosAutomaticosIds,
      perfil_consultores: form.perfil_consultores || {},
      fases: fasesIds,
      cliente_id: clienteIdClean ? Number(clienteIdClean) : null,
      oportunidad_id: oportunidadIdClean ? Number(oportunidadIdClean) : null,
      tipo_negocio: norm(form.tipo_negocio).toUpperCase() || null,
    };

    try {
      setSaving(true);

      const url = isEdit ? `/proyectos/${form.id}` : "/proyectos";
      const method = isEdit ? "PUT" : "POST";

      const r = await jfetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(j?.mensaje || `HTTP ${r.status}`);

      Swal.fire({
        icon: "success",
        title: isEdit ? "Proyecto actualizado" : "Proyecto creado",
      });

      resetForm();
      await fetchAll();
    } catch (e2) {
      Swal.fire({
        icon: "error",
        title: "Error guardando",
        text: String(e2.message || e2),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proyectos-page-scope">
      <div className="proj-page">
        <div className="proj-head">
          <div>
            <h2 className="proj-title">Gestión de Proyectos</h2>
            <p className="proj-subtitle">
              Crear / editar proyectos desde oportunidades ganadas, asignar cliente,
              perfiles permitidos, módulos automáticos por perfil, consultores por
              perfil, múltiples fases y estado activo.
            </p>
          </div>

          <div className="proj-head-actions">
            <button
              className="btn btn-outline"
              onClick={fetchAll}
              disabled={loading || saving}
              type="button"
            >
              {loading ? "Cargando…" : "Refrescar"}
            </button>
          </div>
        </div>

        <div className="proj-card">
          <div className="proj-card-head">
            <h3>{isEdit ? "Editar proyecto" : "Nuevo proyecto"}</h3>

            {isEdit && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                Cancelar edición
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} className="proj-form">
            <div className="grid-2">
              <div className="field">
                <label>Oportunidad ganada</label>

                <select
                  value={form.oportunidad_id ?? ""}
                  onChange={(e) => handleOportunidadChange(e.target.value)}
                >
                  <option value="">— Selecciona una oportunidad —</option>

                  {(oportunidades || []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {oppLabel(o)}
                    </option>
                  ))}
                </select>

                <div className="muted">
                  Solo se muestran oportunidades ganadas de tipo proyecto o bolsa de horas.
                </div>
              </div>

              <div className="field">
                <label>Código PRC</label>

                <input
                  value={form.codigo}
                  readOnly
                  placeholder="Se llena automáticamente desde la oportunidad"
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Tipo de negocio</label>

                <input
                  value={form.tipo_negocio}
                  readOnly
                  placeholder="Se llena automáticamente"
                />
              </div>

              <div className="field">
                <label>Nombre</label>

                <input
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      nombre: e.target.value,
                    }))
                  }
                  placeholder="Ej: Greenland - Upgrade SAP"
                />
              </div>
            </div>

            <div className="grid-1">
              <div className="field field--cliente">
                <label>Cliente</label>

                <select
                  value={form.cliente_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cliente_id: e.target.value,
                    }))
                  }
                >
                  <option value="">— Sin cliente —</option>

                  {(clientes || []).map((c) => {
                    const id = c?.id;
                    const name = c?.nombre_cliente ?? c?.nombre ?? "";

                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    );
                  })}
                </select>

                <div className="muted">
                  Se intenta autollenar desde la oportunidad; puedes ajustarlo si el catálogo interno no coincide.
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Fases permitidas (multi)</label>

                <div className="mods-box">
                  {(fases || []).length === 0 ? (
                    <div className="muted">No hay fases cargadas</div>
                  ) : (
                    (fases || []).map((fx) => {
                      const fid = String(fx.id);
                      const checked = (form.fases || [])
                        .map(String)
                        .includes(fid);

                      return (
                        <label
                          key={fid}
                          className={`mod-chip ${checked ? "is-on" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFase(fid)}
                          />
                          <span>{fx.nombre}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="field">
                <label>Estado</label>

                <div className="inline">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={!!form.activo}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          activo: e.target.checked,
                        }))
                      }
                    />
                    <span className="slider" />
                  </label>

                  <span className="muted">
                    {form.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="proj-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Guardando…" : isEdit ? "Actualizar" : "Crear"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid-1">
              <div className="field">
                <label>Perfiles permitidos</label>

                <div className="mods-box">
                  {(perfiles || []).length === 0 ? (
                    <div className="muted">
                      No hay perfiles configurados
                    </div>
                  ) : (
                    (perfiles || []).map((p) => {
                      const checked = (form.perfiles || [])
                        .map(Number)
                        .includes(Number(p.id));

                      return (
                        <label
                          key={p.id}
                          className={`mod-chip ${checked ? "is-on" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerfil(p.id)}
                          />
                          <span>{p.nombre}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="muted">
                  Al seleccionar perfiles, los módulos se cargan automáticamente desde la configuración del perfil.
                </div>
              </div>
            </div>

            <div className="grid-1">
              <div className="field">
                <label>Módulos automáticos y consultores por perfil</label>

                {(form.perfiles || []).length === 0 ? (
                  <div className="muted">
                    Primero selecciona uno o más perfiles.
                  </div>
                ) : (
                  <div className="perfil-config-list">
                    {perfilesSeleccionados.map((perfil) => {
                      const perfilId = Number(perfil.id);
                      const modulosPerfil =
                        modulosAutomaticosPorPerfil.get(perfilId) || [];

                      const consultoresPerfil = getConsultoresPorPerfil(perfil);

                      const selectedConsultores =
                        form.perfil_consultores?.[String(perfilId)] || [];

                      return (
                        <div key={perfil.id} className="perfil-config-card">
                          <div className="perfil-config-head">
                            <strong>{perfil.nombre}</strong>

                            <span className="muted">
                              {modulosPerfil.length} módulo(s)
                            </span>
                          </div>

                          <div className="perfil-config-modulos">
                            {modulosPerfil.length === 0 ? (
                              <span className="muted">
                                Sin módulos asociados al perfil
                              </span>
                            ) : (
                              modulosPerfil.map((m) => (
                                <span
                                  key={`${perfil.id}-${m.id}`}
                                  className="pill"
                                >
                                  {m.nombre}
                                </span>
                              ))
                            )}
                          </div>

                          <div className="perfil-config-consultores">
                            <div className="muted" style={{ marginBottom: 6 }}>
                              Consultores disponibles para este perfil:
                            </div>

                            {consultoresPerfil.length === 0 ? (
                              <div className="muted">
                                No hay consultores asociados a los módulos de este perfil.
                              </div>
                            ) : (
                              <div className="mods-box">
                                {consultoresPerfil.map((c) => {
                                  const checked = selectedConsultores
                                    .map(Number)
                                    .includes(Number(c.id));

                                  return (
                                    <label
                                      key={`${perfil.id}-consultor-${c.id}`}
                                      className={`mod-chip ${checked ? "is-on" : ""}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleConsultorPerfil(perfil.id, c.id)
                                        }
                                      />
                                      <span>{c.nombre || c.usuario}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {modulosAutomaticosNames.length > 0 && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Módulos del proyecto:{" "}
                    <b>{modulosAutomaticosNames.join(", ")}</b>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        <div className="proj-card">
          <div className="proj-list-head">
            <h3>Proyectos</h3>

            <div className="proj-list-filters">
              <input
                className="search"
                placeholder="Buscar por PRC, nombre, cliente, perfiles, fases, módulos o tipo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <label className="check">
                <input
                  type="checkbox"
                  checked={soloActivos}
                  onChange={(e) => setSoloActivos(e.target.checked)}
                />
                <span>Solo activos</span>
              </label>
            </div>
          </div>

          <div className="proj-table-wrap">
            <table className="proj-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>PRC</th>
                  <th>Nombre</th>
                  <th className="cliente">Cliente</th>
                  <th>Tipo</th>
                  <th>Fases</th>
                  <th>Activo</th>
                  <th>Perfiles</th>
                  <th>Módulos</th>
                  <th className="actions">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {proyectosFiltrados.map((p) => {
                  const activo = asBool(p.activo);

                  const fasesNames = getProyectoFasesNames(p, fasesMap);
                  const fasesTxt = fasesNames.length
                    ? fasesNames.join(", ")
                    : "—";

                  const clienteTxt =
                    p?.cliente?.nombre_cliente ??
                    p?.cliente?.nombre ??
                    (p?.cliente_id != null
                      ? clientesMap.get(Number(p?.cliente_id))
                      : "") ??
                    "";

                  const perfilesNames = getProyectoPerfilesNames(p);
                  const modulosNames = getProyectoModulosNames(p, modulosMap);

                  const costosSelected =
                    proyectoCostos?.id === p.id && costosOpen;

                  return (
                    <tr key={p.id}>
                      <td className="num">{p.id}</td>
                      <td className="mono">{p.codigo}</td>
                      <td>{p.nombre}</td>
                      <td className="cliente">{clienteTxt || "—"}</td>
                      <td>{p?.tipo_negocio || "—"}</td>
                      <td>{fasesTxt}</td>

                      <td>
                        <span className={`badge ${activo ? "ok" : "off"}`}>
                          {activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      <td className="mods-cell">
                        {perfilesNames.length === 0 && (
                          <span className="muted">—</span>
                        )}

                        {perfilesNames.slice(0, 4).map((label, idx) => (
                          <span
                            key={`${p.id}-perfil-${label}-${idx}`}
                            className="pill"
                          >
                            {label}
                          </span>
                        ))}

                        {perfilesNames.length > 4 && (
                          <span className="pill more">+ más…</span>
                        )}
                      </td>

                      <td className="mods-cell">
                        {modulosNames.length === 0 && (
                          <span className="muted">—</span>
                        )}

                        {modulosNames.slice(0, 6).map((label, idx) => (
                          <span
                            key={`${p.id}-modulo-${label}-${idx}`}
                            className="pill"
                          >
                            {label}
                          </span>
                        ))}

                        {modulosNames.length > 6 && (
                          <span className="pill more">+ más…</span>
                        )}
                      </td>

                      <td className="actions">
                        <button
                          className="icon-btn"
                          onClick={() => startEdit(p)}
                          disabled={saving}
                          title="Editar"
                          type="button"
                        >
                          ✏️
                        </button>

                        <button
                          className="icon-btn"
                          onClick={() => toggleActivo(p)}
                          disabled={saving}
                          title="Activar / desactivar"
                          type="button"
                        >
                          {activo ? "⛔" : "✅"}
                        </button>

                        <button
                          className="icon-btn danger"
                          onClick={() => confirmDelete(p)}
                          disabled={saving}
                          title="Eliminar"
                          type="button"
                        >
                          🗑️
                        </button>

                        <button
                          className={`icon-btn ${costosSelected ? "is-selected" : ""}`}
                          onClick={() => openCostosPanel(p)}
                          disabled={saving}
                          title="Costos"
                          type="button"
                        >
                          💰
                        </button>

                        <button
                          className="icon-btn"
                          onClick={() => openMapeoModal(p)}
                          disabled={saving}
                          title="Mapeos"
                          type="button"
                        >
                          🧩
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {proyectosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ padding: 14 }}>
                      Sin proyectos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Total: <b>{proyectosFiltrados.length}</b>
          </div>
        </div>

        {costosOpen && proyectoCostos && (
          <div className="proj-card proj-costos-shell">
            <div className="proj-card-head">
              <div>
                <h3>Costos del proyecto</h3>
                <div className="muted">
                  {proyectoCostos.codigo} - {proyectoCostos.nombre}
                </div>
              </div>

              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeCostosPanel}
              >
                Cerrar costos
              </button>
            </div>

            <ProyectoCostosPanel proyectoId={proyectoCostos.id} />
          </div>
        )}

        {mapeoOpen && proyectoMapeo && (
          <ModalMapeoProyecto
            isOpen={mapeoOpen}
            onClose={closeMapeoModal}
            proyecto={proyectoMapeo}
          />
        )}
      </div>
    </div>
  );
}
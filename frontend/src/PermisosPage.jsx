import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { jfetch, jsonOrThrow } from "./lib/api";
import "./PermisosPersonasPage.css";

const norm = (value) => String(value || "").trim().toLowerCase();

export default function PermisosPersonasPage() {
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [rol, setRol] = useState("");
  const [equipo, setEquipo] = useState("");
  const [estado, setEstado] = useState("ACTIVOS");
  const [permiso, setPermiso] = useState("");
  const [abiertos, setAbiertos] = useState(() => new Set());

  const isAdmin = useMemo(() => {
    try {
      const data = JSON.parse(localStorage.getItem("userData") || "{}");
      return String(data?.rol || "").trim().toUpperCase() === "ADMIN";
    } catch {
      return false;
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jfetch("/permisos-personas").then(jsonOrThrow);
      setPersonas(Array.isArray(data?.personas) ? data.personas : []);
      setError("");
    } catch (e) {
      setError(e?.message || "No fue posible consultar los permisos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const roles = useMemo(
    () => [...new Set(personas.map((p) => p.rol).filter(Boolean))].sort(),
    [personas]
  );

  const equipos = useMemo(
    () => [...new Set(personas.map((p) => p.equipo).filter(Boolean))].sort(),
    [personas]
  );

  const filtradas = useMemo(() => {
    const texto = norm(busqueda);
    const codigo = norm(permiso);

    return personas.filter((persona) => {
      if (rol && persona.rol !== rol) return false;
      if (equipo && persona.equipo !== equipo) return false;
      if (estado === "ACTIVOS" && !persona.activo) return false;
      if (estado === "INACTIVOS" && persona.activo) return false;

      const coincidePersona = !texto || [persona.nombre, persona.usuario, persona.rol, persona.equipo]
        .some((valor) => norm(valor).includes(texto));
      const coincidePermiso = !codigo || (persona.permisos || []).some((p) =>
        norm(p.codigo).includes(codigo) || norm(p.descripcion).includes(codigo)
      );
      return coincidePersona && coincidePermiso;
    });
  }, [personas, busqueda, rol, equipo, estado, permiso]);

  const toggle = (id) => {
    setAbiertos((actual) => {
      const siguiente = new Set(actual);
      siguiente.has(id) ? siguiente.delete(id) : siguiente.add(id);
      return siguiente;
    });
  };

  const quitarPermiso = async (persona, item, origen) => {
    if (!isAdmin || origen === "ADMIN") return;

    const afectados = origen === "ROL"
      ? personas.filter((p) => p.activo && p.rol_id === persona.rol_id).length
      : origen === "EQUIPO"
        ? personas.filter((p) => p.activo && p.equipo_id === persona.equipo_id).length
        : 1;

    const alcance = origen === "ROL"
      ? `el rol ${persona.rol}`
      : origen === "EQUIPO"
        ? `el equipo ${persona.equipo}`
        : `la persona ${persona.nombre}`;

    const confirmacion = await Swal.fire({
      icon: "warning",
      title: `¿Retirar ${item.codigo}?`,
      html: `Se retirará desde <b>${alcance}</b>.<br>Puede afectar a <b>${afectados}</b> persona(s) activa(s).`,
      showCancelButton: true,
      confirmButtonText: "Sí, retirar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!confirmacion.isConfirmed) return;

    try {
      const resultado = await jfetch("/permisos-personas/quitar", {
        method: "DELETE",
        body: { consultor_id: persona.id, permiso_id: item.id, origen },
      }).then(jsonOrThrow);

      const detalle = resultado?.permiso_sigue_efectivo
        ? `La asignación fue retirada, pero ${persona.nombre} conserva el permiso por: ${(resultado.origenes_restantes || []).join(", ")}.`
        : `El permiso dejó de estar vigente por ese origen. Personas afectadas: ${resultado?.personas_afectadas || afectados}.`;

      await Swal.fire("Permiso actualizado", detalle, "success");
      await cargar();
    } catch (e) {
      Swal.fire("No fue posible retirar", e?.message || "Error desconocido", "error");
    }
  };

  return (
    <main className="pp-page">
      <header className="pp-header">
        <div>
          <span className="pp-kicker">Auditoría de acceso</span>
          <h1>Permisos por persona</h1>
          <p>Consulta el acceso efectivo y distingue si proviene del rol, el equipo o una asignación individual.</p>
        </div>
        <div className="pp-total"><strong>{filtradas.length}</strong><span>personas</span></div>
      </header>

      <section className="pp-filters" aria-label="Filtros">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre o usuario…" />
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {roles.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={equipo} onChange={(e) => setEquipo(e.target.value)}>
          <option value="">Todos los equipos</option>
          {equipos.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="ACTIVOS">Activos</option>
          <option value="INACTIVOS">Inactivos</option>
          <option value="TODOS">Todos</option>
        </select>
        <input value={permiso} onChange={(e) => setPermiso(e.target.value)} placeholder="Buscar permiso…" />
      </section>

      {loading && <div className="pp-message">Cargando permisos…</div>}
      {!loading && error && <div className="pp-message pp-error">{error}</div>}
      {!loading && !error && filtradas.length === 0 && <div className="pp-message">No hay resultados.</div>}

      {!loading && !error && filtradas.map((persona) => {
        const abierto = abiertos.has(persona.id);
        return (
          <article className="pp-person" key={persona.id}>
            <button className="pp-person-head" type="button" onClick={() => toggle(persona.id)} aria-expanded={abierto}>
              <span className="pp-avatar">{String(persona.nombre || "?").charAt(0).toUpperCase()}</span>
              <span className="pp-identity">
                <strong>{persona.nombre}</strong>
                <small>{persona.usuario}</small>
              </span>
              <span className="pp-tags">
                <b>{persona.rol || "SIN ROL"}</b>
                <em>{persona.equipo || "SIN EQUIPO"}</em>
                <i className={persona.activo ? "active" : "inactive"}>{persona.activo ? "Activo" : "Inactivo"}</i>
              </span>
              <span className="pp-count">{persona.total_permisos} permisos</span>
              <span className="pp-chevron">{abierto ? "−" : "+"}</span>
            </button>

            {abierto && (
              <div className="pp-permissions">
                {(persona.permisos || []).map((item) => (
                  <div className="pp-permission" key={item.codigo}>
                    <div><strong>{item.codigo}</strong><span>{item.descripcion || "Sin descripción"}</span></div>
                    <div className="pp-origins">
                      {(item.origenes || []).map((origen) => (
                        <span key={origen} className={`origin-${origen.toLowerCase()}`}>
                          {origen}
                          {isAdmin && origen !== "ADMIN" && (
                            <button
                              type="button"
                              className="pp-remove"
                              title={`Retirar desde ${origen}`}
                              aria-label={`Retirar ${item.codigo} desde ${origen}`}
                              onClick={() => quitarPermiso(persona, item, origen)}
                            >×</button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </main>
  );
}

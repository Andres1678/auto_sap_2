import { useMemo } from "react";

export default function PageGuard(permiso, children) {
  const user = JSON.parse(localStorage.getItem("userData") || "{}");
  const rol = (user?.rol || "").toUpperCase();
  const permisos = Array.isArray(user?.permisos)
    ? user.permisos
        .map((p) => (typeof p === "string" ? p : p?.codigo || p?.code || p?.nombre))
        .filter(Boolean)
        .map((p) => String(p).trim().toUpperCase())
    : [];

  const isAdmin = rol === "ADMIN";

  if (isAdmin || permisos.includes(String(permiso || "").trim().toUpperCase())) {
    return children;
  }

  return (
    <div style={{ padding: 30, textAlign: "center" }}>
      <h2>⛔ No tienes permisos para ver esta página</h2>
    </div>
  );
}

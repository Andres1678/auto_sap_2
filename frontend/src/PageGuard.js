import { useMemo } from "react";

export default function PageGuard(permiso, children) {
  const user = JSON.parse(localStorage.getItem("userData") || "{}");
  const rol = (user?.rol || "").toUpperCase();
  const permisos = user?.permisos?.map(p => p.codigo) || [];

  const isAdmin = rol === "ADMIN";

  if (isAdmin || permisos.includes(permiso)) {
    return children;
  }

  return (
    <div style={{ padding: 30, textAlign: "center" }}>
      <h2>⛔ No tienes permisos para ver esta página</h2>
    </div>
  );
}

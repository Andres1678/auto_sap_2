import React from "react";
import { Navigate } from "react-router-dom";

export default function AdminRoute({ children }) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem("user") || "null"); } catch {}
  const rol = raw?.rol ?? raw?.user?.rol;   
  if (rol !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

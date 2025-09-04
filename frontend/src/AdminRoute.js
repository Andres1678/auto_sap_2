import React from "react";
import { Navigate } from "react-router-dom";



export default function AdminRoute({ children, allow = ['ADMIN'] }) {
  
  let raw = null;
  try {
    raw = JSON.parse(
      localStorage.getItem('userData') ||
      localStorage.getItem('user') ||
      'null'
    );
  } catch {}

  const rol0 = raw?.rol ?? raw?.user?.rol ?? '';
  const rol  = String(rol0).trim().toUpperCase();

  
  const allowed = Array.isArray(allow)
    ? allow.map(r => String(r).trim().toUpperCase())
    : [String(allow).trim().toUpperCase()];

  if (!allowed.includes(rol)) return <Navigate to="/" replace />;
  return children;
}


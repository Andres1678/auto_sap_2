// src/lib/api.js
const hostname =
  typeof window !== "undefined" && window.location ? window.location.hostname : "";
const isDev = hostname === "localhost" || hostname === "127.0.0.1";

export const API_BASE = isDev ? "http://localhost:5000/api" : "/api";


export function jfetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const credentials = options.credentials ?? "omit"; 
  return fetch(url, { ...options, headers, credentials });
}

export function jget(path, options = {}) {
  return jfetch(path, { method: "GET", ...options });
}

export function jpost(path, body, options = {}) {
  return jfetch(path, { method: "POST", body: JSON.stringify(body ?? {}), ...options });
}

export async function jsonOrThrow(res) {
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const msg =
      (data && (data.mensaje || data.error)) ||
      res.statusText ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data ?? {};
}




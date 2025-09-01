const hostname =
  typeof window !== "undefined" && window.location ? window.location.hostname : "";
const isDev = hostname === "localhost" || hostname === "127.0.0.1";

export const API_BASE = isDev ? "http://localhost:5000/api" : "/api";


function joinUrl(base, path) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export function jfetch(path, options = {}) {
  const url = joinUrl(API_BASE, path);

  const headers = { ...(options.headers || {}) };

  
  let body = options.body;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body != null && !isForm && typeof body !== "string") {
    body = JSON.stringify(body);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  } else if (body != null && !isForm) {
    
    if (!headers["Content-Type"] && /^\s*[\{\[]/.test(body)) {
      headers["Content-Type"] = "application/json";
    }
  }
  

  const credentials = options.credentials ?? "omit"; 

  return fetch(url, { ...options, headers, body, credentials });
}

export function jget(path, options = {}) {
  return jfetch(path, { method: "GET", ...options });
}

export function jpost(path, body, options = {}) {
  return jfetch(path, { method: "POST", body, ...options });
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





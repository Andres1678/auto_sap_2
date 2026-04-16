// ============================================================
// Detectar origen actual (funciona en dev y prod)
// ============================================================
const origin =
  typeof window !== "undefined" && window.location ? window.location.origin : "";

// ============================================================
// URL base de la API — automática según entorno
// ============================================================
export const API_URL = `${origin}/api`;

// ============================================================
// Obtener token
// ============================================================
function getToken() {
  return localStorage.getItem("token") || "";
}

// ============================================================
// HEADERS DEL USUARIO (compatibilidad temporal)
// ============================================================
function getUserHeaders() {
  const user = JSON.parse(localStorage.getItem("userData") || "{}");
  const token = getToken();

  return {
    "X-User-Usuario": user.usuario || "",
    "X-User-Name": user.nombre || "",
    "X-User-Rol": user.rol || "",
    "X-Consultor-Id": user.id || "",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ============================================================
// Determina si la ruta es ABSOLUTA
// ============================================================
function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

// ============================================================
// Construir URL final sin duplicaciones
// ============================================================
function buildUrl(path) {
  if (!path) return API_URL;
  if (isAbsoluteUrl(path)) return path;

  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base + p;
}

// ============================================================
// FETCH PRINCIPAL — jfetch (soporta JSON y FormData)
// ============================================================
export function jfetch(path, options = {}) {
  const url = buildUrl(path);

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const baseHeaders = {
    Accept: "application/json",
    ...getUserHeaders(),
  };

  const customHeaders = options.headers || {};

  // customHeaders sobreescribe baseHeaders si hace falta
  const headers = {
    ...baseHeaders,
    ...customHeaders,
  };

  let body = options.body;

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";

    if (body && typeof body !== "string") {
      body = JSON.stringify(body);
    }
  } else {
    if (headers["Content-Type"]) delete headers["Content-Type"];
  }

  return fetch(url, {
    ...options,
    headers,
    body,
  });
}

export function jget(path, options = {}) {
  return jfetch(path, { method: "GET", ...options });
}

export function jpost(path, body, options = {}) {
  return jfetch(path, { method: "POST", body, ...options });
}

export function jput(path, body, options = {}) {
  return jfetch(path, { method: "PUT", body, ...options });
}

export function jdelete(path, options = {}) {
  return jfetch(path, { method: "DELETE", ...options });
}

// ============================================================
// Parser seguro de JSON — jsonOrThrow
// ============================================================
export async function jsonOrThrow(res) {
  let data = null;

  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const msg =
      (data && (data.mensaje || data.error || data.detalle)) ||
      res.statusText ||
      `HTTP ${res.status}`;

    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data ?? {};
}
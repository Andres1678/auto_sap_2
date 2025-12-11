// ============================================================
// Detectar origen actual (funciona en dev y prod)
// ============================================================
const origin =
  typeof window !== "undefined" && window.location
    ? window.location.origin
    : "";

// ============================================================
// URL base de la API — automática según entorno
// ============================================================
export const API_URL = `${origin}/api`;

// ============================================================
// HEADERS DEL USUARIO (token, rol, consultor_id, nombre)
// ============================================================
function getUserHeaders() {
  const user = JSON.parse(localStorage.getItem("userData") || "{}");

  return {
    "X-User-Usuario": user.usuario || "",
    "X-User-Name": user.nombre || "",
    "X-User-Rol": user.rol || "",
    "X-Consultor-Id": user.id || "",
    Authorization: localStorage.getItem("token") || "",
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
// FETCH PRINCIPAL — jfetch
// ============================================================
export function jfetch(path, options = {}) {
  const url = buildUrl(path);

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers || {}),
    ...getUserHeaders(),
  };

  let body = options.body;

  if (body && typeof body !== "string") {
    body = JSON.stringify(body);
  }

  return fetch(url, {
    ...options,
    headers,
    body,
  });
}

// ============================================================
// Helpers GET y POST
// ============================================================
export function jget(path, options = {}) {
  return jfetch(path, { method: "GET", ...options });
}

export function jpost(path, body, options = {}) {
  return jfetch(path, { method: "POST", body, ...options });
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
      (data && (data.mensaje || data.error)) ||
      res.statusText ||
      `HTTP ${res.status}`;

    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data ?? {};
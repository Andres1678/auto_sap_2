
const EXTRA_VISIBILIDAD = {
  johngaravito: ["ramirezalep", "herreraea"],
};


export function getVisibleUsernames(login) {
  const u = String(login || "").trim().toLowerCase();
  const extra = EXTRA_VISIBILIDAD[u] || [];
  return Array.from(new Set([u, ...extra]));
}


export default getVisibleUsernames;

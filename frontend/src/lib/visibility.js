export const EXCEPCION_8H_USERS = new Set([
  "serranoel","chaburg","torresfaa","jose.raigosa","camargoje",
  "duqueb","diazstef","castronay","sierrag","tarquinojm","celyfl"
]);

const EXTRA_VISIBILIDAD = {
  johngaravito: ["ramirezalep", "herreraea"],
};

export function getVisibleUsernames(login) {
  const u = String(login || "").trim().toLowerCase();
  const extra = EXTRA_VISIBILIDAD[u] || [];
  return Array.from(new Set([u, ...extra]));
}

export default getVisibleUsernames;

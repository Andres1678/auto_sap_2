// Normaliza: mayúsculas, quita tildes, limpia símbolos, colapsa espacios
export const norm = (s) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

// Extrae “código candidato” desde el texto digitado.
// Captura: PRC####, P###, o números largos (>=6)
export const extractProjectTokens = (raw) => {
  const s = norm(raw);

  const tokens = new Set();

  // PRC #### (con o sin separadores)
  const prc = s.match(/PRC\s*[- ]?\s*(\d{3,6})/);
  if (prc?.[1]) tokens.add(`PRC${prc[1]}`);

  // P### (ej: P53, P147, P150)
  const p = s.match(/\bP\s*[- ]?\s*(\d{1,4})\b/);
  if (p?.[1]) tokens.add(`P${p[1]}`);

  // números largos (como 17568104, 22308844)
  const nums = s.match(/\b\d{6,}\b/g) || [];
  nums.forEach(n => tokens.add(n));

  return Array.from(tokens);
};

// construye un índice rápido: token_normalizado -> proyecto
export const buildProjectIndex = (ACTIVE_PROJECTS) => {
  const index = new Map();

  for (const p of ACTIVE_PROJECTS) {
    // tokens base desde display
    const baseTokens = extractProjectTokens(p.display);

    // tokens extra desde codes (si los pusiste)
    const codeTokens = (p.codes || []).flatMap(extractProjectTokens);

    const all = [...baseTokens, ...codeTokens].map(norm);

    all.forEach(t => {
      if (!t) return;
      index.set(t, p);
    });

    // también index por id
    index.set(norm(p.id), p);
  }

  return index;
};

// matcher final: retorna { proyecto, token, original, status }
export const matchProject = (raw, projectIndex) => {
  const original = String(raw ?? "").trim();
  if (!original || original === "0") {
    return { status: "EMPTY", proyecto: null, token: "", original };
  }

  const tokens = extractProjectTokens(original).map(norm);

  // 1) match por token exacto
  for (const t of tokens) {
    const hit = projectIndex.get(t);
    if (hit) return { status: "MATCH", proyecto: hit, token: t, original };
  }

  // 2) fallback: contiene “PRC####” o “P###” como substring (por si hay texto raro)
  const s = norm(original);
  for (const [t, proj] of projectIndex.entries()) {
    if (t && s.includes(t)) {
      return { status: "MATCH", proyecto: proj, token: t, original };
    }
  }

  return { status: "NO_MATCH", proyecto: null, token: tokens[0] || "", original };
};
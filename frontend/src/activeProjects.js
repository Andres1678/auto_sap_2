function normalize(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")   // deja espacios para buscar frases
    .replace(/\s+/g, " ")
    .trim();
}

function extractProjectCodes(text) {
  const normalized = normalize(text);
  // incluye OT numérica larga y PRC, P, etc.
  const matches = normalized.match(/\bPRC\s*\d+\b|\bPRC\d+\b|\bP\d+\b|\b\d{7,10}\b/g);
  return (matches || []).map(m => normalize(m).replace(/\s+/g, "")); // PRC 2455 -> PRC2455
}

export function detectProjects(text) {
  if (!text) return [];

  const normText = normalize(text);
  const detectedCodes = new Set(extractProjectCodes(text));

  const matches = [];

  for (const project of ACTIVE_PROJECTS) {
    const projectCodes = (project.codes || []).map(c => normalize(c));
    let hit = false;

    for (const rawCode of projectCodes) {
      const codeNoSpaces = rawCode.replace(/\s+/g, "");

      // 1) match por código extraído (PRC2455, P53, 17568104...)
      if (detectedCodes.has(codeNoSpaces)) {
        hit = true;
        break;
      }

      // 2) match por “contains” (keywords / frases)
      //    - si el code es corto tipo "WF" o "BPC" evita falsos positivos con palabra completa
      if (rawCode.length <= 3) {
        const re = new RegExp(`\\b${rawCode}\\b`, "i");
        if (re.test(normText)) { hit = true; break; }
      } else {
        if (normText.includes(rawCode)) { hit = true; break; }
      }
    }

    if (hit) matches.push(project);
  }

  // opcional: evitar duplicados
  const uniq = new Map(matches.map(p => [p.id, p]));
  return Array.from(uniq.values());
}
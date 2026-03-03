import { ACTIVE_PROJECTS } from "./activeProjects";

function normalize(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProjectCodes(text) {
  const normalized = normalize(text);

  const matches = normalized.match(/\bPRC\s*\d+\b|\bPRC-\s*\d+\b|\bPRC\d+\b|\bP\d+\b|\b\d{7,10}\b/g);

  return (matches || []).map(m => normalize(m).replace(/\s+/g, "").replace(/-/g, ""));
}

export function detectProjects(text) {
  if (!text) return [];

  const normText = normalize(text);
  const detectedCodes = new Set(extractProjectCodes(text));

  const hits = [];

  for (const project of ACTIVE_PROJECTS) {
    const codes = (project.codes || []).map(c => normalize(c));
    let match = false;

    for (const c of codes) {
      const cNoSpaces = c.replace(/\s+/g, "").replace(/-/g, "");

      if (detectedCodes.has(cNoSpaces)) {
        match = true;
        break;
      }

      if (c.length <= 3) {
        const re = new RegExp(`\\b${c}\\b`, "i");
        if (re.test(normText)) { match = true; break; }
      } else {
        if (normText.includes(c)) { match = true; break; }
      }
    }

    if (match) hits.push(project);
  }

  const uniq = new Map(hits.map(p => [p.id, p]));
  return Array.from(uniq.values());
}
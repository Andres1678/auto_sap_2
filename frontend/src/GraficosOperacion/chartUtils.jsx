import React from "react";

export const PIE_COLORS = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#0ea5e9', '#e11d48', '#16a34a', '#ca8a04', '#6d28d9'
];

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d');

function _setFont({
  fontSize = 12,
  fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  fontWeight = 400,
} = {}) {
  _ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
}

export function textWidthPx(text, opts) {
  _setFont(opts);
  return _ctx.measureText(String(text ?? '')).width;
}

export function yWidthFromPx(
  labels,
  { min = 120, max = 360, pad = 28, fontSize = 12, fontWeight = 400 } = {}
) {
  _setFont({ fontSize, fontWeight });
  const w = Math.max(0, ...labels.map(t => textWidthPx(t, { fontSize, fontWeight })));
  return Math.max(min, Math.min(max, Math.ceil(w + pad)));
}

export function wrapByPx(
  text,
  maxWidth,
  { lineHeight = 13, fontSize = 12, fontWeight = 400 } = {}
) {
  _setFont({ fontSize, fontWeight });
  const words = String(text ?? '').split(' ');
  const lines = [];
  let line = '';

  for (const w of words) {
    const tentative = line ? `${line} ${w}` : w;
    if (textWidthPx(tentative, { fontSize, fontWeight }) > maxWidth) {
      if (line) lines.push(line);
      if (textWidthPx(w, { fontSize, fontWeight }) > maxWidth) {
        let buff = '';
        for (const ch of w) {
          if (textWidthPx(buff + ch, { fontSize, fontWeight }) > maxWidth) {
            lines.push(buff);
            buff = ch;
          } else {
            buff += ch;
          }
        }
        line = buff;
      } else {
        line = w;
      }
    } else {
      line = tentative;
    }
  }

  if (line) lines.push(line);
  return { lines, lineHeight };
}

export function WrapTickPx({
  x,
  y,
  payload,
  maxWidth = 160,
  dy = 3,
  fontSize = 12,
  color = '#6b7280'
}) {
  const full = String(payload?.value ?? '');
  const { lines, lineHeight } = wrapByPx(full, maxWidth, { lineHeight: 13, fontSize });

  return (
    <g transform={`translate(${x - 6},${y})`}>
      <title>{full}</title>
      <text textAnchor="end" fontSize={fontSize} fill={color}>
        {lines.map((t, i) => (
          <tspan key={i} x={0} dy={i === 0 ? dy : lineHeight}>
            {t}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function BrandDefs({ id }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#E30613" />
        <stop offset="100%" stopColor="#0055B8" />
      </linearGradient>
    </defs>
  );
}

export const truncateTxt = (txt, max = 30) => {
  const s = String(txt ?? "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export const formatPiePercent = (value, digits = 1) =>
  `${Number(value || 0).toFixed(digits)}%`;

export const darkenHex = (hex, factor = 0.35) => {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return hex;

  const num = parseInt(clean, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.max(0, Math.floor(r * (1 - factor)));
  g = Math.max(0, Math.floor(g * (1 - factor)));
  b = Math.max(0, Math.floor(b * (1 - factor)));

  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
};

export function buildSmartPieLabelLayout(
  data,
  {
    cx,
    cy,
    outerRadius,
    startAngle,
    endAngle,
    minPercent = 2,
    maxLabels = 12,
    offset = 24,
    minGap = 18,
  }
) {
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return new Map();

  const total = rows.reduce((s, r) => s + Number(r.value || 0), 0) || 100;
  const sweepTotal = endAngle - startAngle;

  let cursor = startAngle;

  const raw = rows.map((row, index) => {
    const pct = Number(row.value || 0);
    const sweep = sweepTotal * (pct / total);
    const midAngle = cursor + sweep / 2;
    cursor += sweep;

    const RADIAN = Math.PI / 180;
    const radius = outerRadius + offset;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const side = x >= cx ? "right" : "left";

    return {
      index,
      value: pct,
      x,
      y,
      side,
      textAnchor: side === "right" ? "start" : "end",
    };
  });

  const visibleByValue = [...raw]
    .sort((a, b) => b.value - a.value)
    .slice(0, maxLabels)
    .filter((r) => r.value >= minPercent);

  const visibleSet = new Set(visibleByValue.map((r) => r.index));
  const layout = new Map();

  const minY = cy - outerRadius - 26;
  const maxY = cy + outerRadius + 26;

  const adjustSide = (side) => {
    const items = raw
      .filter((r) => r.side === side && visibleSet.has(r.index))
      .sort((a, b) => a.y - b.y)
      .map((r) => ({ ...r }));

    if (!items.length) return;

    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < minGap) {
        items[i].y = items[i - 1].y + minGap;
      }
    }

    if (items[items.length - 1].y > maxY) {
      items[items.length - 1].y = maxY;
      for (let i = items.length - 2; i >= 0; i--) {
        if (items[i + 1].y - items[i].y < minGap) {
          items[i].y = items[i + 1].y - minGap;
        }
      }
    }

    if (items[0].y < minY) {
      items[0].y = minY;
      for (let i = 1; i < items.length; i++) {
        if (items[i].y - items[i - 1].y < minGap) {
          items[i].y = items[i - 1].y + minGap;
        }
      }
    }

    items.forEach((item) => layout.set(item.index, item));
  };

  adjustSide("left");
  adjustSide("right");

  raw.forEach((r) => {
    if (!layout.has(r.index)) {
      layout.set(r.index, { ...r, hidden: !visibleSet.has(r.index) });
    }
  });

  return layout;
}

export function makeSmartPieLabelRenderer(
  data,
  {
    startAngle,
    endAngle,
    minPercent = 2,
    maxLabels = 12,
    offset = 24,
    minGap = 18,
    digits = 1,
    color = "#334155",
    fontSize = 12,
    fontWeight = 800,
  }
) {
  let cache = null;

  return (props) => {
    const { index, cx, cy, outerRadius } = props;
    if (index == null) return null;

    if (!cache) {
      cache = buildSmartPieLabelLayout(data, {
        cx,
        cy,
        outerRadius,
        startAngle,
        endAngle,
        minPercent,
        maxLabels,
        offset,
        minGap,
      });
    }

    const layout = cache.get(index);
    const row = data[index];

    if (!layout || layout.hidden || !row) return null;

    return (
      <text
        x={layout.x}
        y={layout.y}
        fill={color}
        textAnchor={layout.textAnchor}
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={fontWeight}
      >
        {formatPiePercent(row.value, digits)}
      </text>
    );
  };
}

export function TaskPieTooltip({ active, payload, otrosDetalle = [] }) {
  if (!active || !payload || !payload.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const isOtros = row.name === "Otros" && otrosDetalle.length > 0;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
        boxShadow: "0 10px 30px rgba(15,23,42,.12)",
        minWidth: 250,
        maxWidth: 340,
      }}
    >
      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
        {row.name}
      </div>

      <div style={{ fontSize: 13, color: "#334155", marginBottom: isOtros ? 10 : 0 }}>
        {formatPiePercent(row.value, 2)} — {Number(row.horas).toFixed(2)} h
      </div>

      {isOtros && (
        <div style={{ maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#64748b",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: ".04em",
            }}
          >
            Tareas agrupadas
          </div>

          {otrosDetalle.map((item) => (
            <div
              key={item.name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                fontSize: 12,
                padding: "4px 0",
                borderBottom: "1px dashed #e5e7eb",
              }}
            >
              <span style={{ color: "#334155" }}>{item.name}</span>
              <strong style={{ color: "#0f172a" }}>
                {formatPiePercent(item.value, 1)}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
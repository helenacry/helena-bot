// Mede o contraste (WCAG 2.2) dos pares de cor que o site usa juntos, nos dois temas.
// Lê os tokens de src/styles/tokens.css (oklch + light-dark()), converte para sRGB e
// falha se algum par ficar abaixo do mínimo. Rode com:  npm --prefix site run verify
//
// Para um par novo, acrescente uma linha em PAIRS. Texto normal pede 4,5:1; texto
// grande (24 px ou 19 px em negrito) e componentes de interface pedem 3:1.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url)), "utf8");

// ------------------------------------------------------------ cor
function oklchToSrgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  ];

  return lin.map(v => Math.min(1, Math.max(0, v)));
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(x, y) {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

function parseColor(text) {
  const t = text.trim();

  const o = t.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (o) return oklchToSrgb(Number(o[1]) / 100, Number(o[2]), Number(o[3]));

  const hex = t.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  }

  throw new Error(`cor que o script não entende: ${text}`);
}

// ------------------------------------------------------------ tokens
// Corpo de "--nome: valor;" onde o valor pode ter parênteses aninhados.
function readTokens(css) {
  const tokens = {};
  const re = /--([a-z0-9-]+):\s*/g;
  let m;

  while ((m = re.exec(css))) {
    let depth = 0;
    let i = re.lastIndex;
    const start = i;

    for (; i < css.length; i++) {
      const ch = css[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth === 0) break;
    }

    tokens[m[1]] = css.slice(start, i).trim();
    re.lastIndex = i;
  }

  return tokens;
}

const tokens = readTokens(CSS);

function split(value) {
  // light-dark(A, B) -> [A, B]
  const m = value.match(/^light-dark\((.*)\)$/s);
  if (!m) return [value, value];

  let depth = 0;
  const body = m[1];

  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) return [body.slice(0, i).trim(), body.slice(i + 1).trim()];
  }

  throw new Error(`light-dark inválido: ${value}`);
}

function resolve(name, theme, seen = new Set()) {
  if (seen.has(name)) throw new Error(`token em ciclo: ${name}`);
  seen.add(name);

  const raw = tokens[name];
  if (raw === undefined) throw new Error(`token --${name} não existe`);

  const [light, dark] = split(raw);
  const value = theme === "light" ? light : dark;

  const ref = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) return resolve(ref[1], theme, seen);

  return parseColor(value);
}

// ------------------------------------------------------------ pares
// [texto, fundo, mínimo, onde é usado]
const TEXT = 4.5;
const LARGE = 3;

const PAIRS = [
  ["ink", "paper", TEXT, "texto sobre o papel"],
  ["ink", "paper-sunk", TEXT, "texto no rodapé"],
  ["ink", "paper-raised", TEXT, "texto em objeto"],
  ["ink-soft", "paper", TEXT, "texto de apoio"],
  ["ink-soft", "paper-sunk", TEXT, "texto de apoio no rodapé"],
  ["ink-soft", "paper-raised", TEXT, "texto de apoio em objeto"],
  ["ink-soft", "violet-wash", TEXT, "texto de apoio no bolso do banco"],
  ["ink-soft", "money-wash", TEXT, "texto de apoio no bolso do sujo"],
  ["ink", "violet-wash", TEXT, "código e hover"],
  ["ink", "money-wash", TEXT, "título no bolso do sujo"],
  ["ink-faint", "paper", LARGE, "texto grande ou decorativo"],

  ["violet", "paper", TEXT, "link e rótulo em violeta"],
  ["violet", "paper-raised", TEXT, "rótulo em violeta em objeto"],
  ["on-violet", "violet-fill", TEXT, "botão principal"],
  ["on-violet", "violet-fill-hover", TEXT, "botão principal em hover"],

  ["positive", "paper", TEXT, "carimbo e renda"],
  ["positive", "paper-raised", TEXT, "carimbo em objeto"],
  ["danger", "paper", TEXT, "carimbo e risco"],
  ["danger", "paper-raised", TEXT, "carimbo em objeto"],
  ["money", "paper", TEXT, "dinheiro"],
  ["money", "money-wash", TEXT, "carimbo no bolso do sujo"],
  ["positive", "violet-wash", TEXT, "carimbo no bolso do banco"],

  ["focus", "paper", LARGE, "anel de foco"],
  ["line-strong", "paper", LARGE, "borda de controle"],

  ["chat-ink", "chat-bg", TEXT, "conversa: texto"],
  ["chat-ink-soft", "chat-bg", TEXT, "conversa: apoio"],
  ["chat-ink", "chat-embed", TEXT, "embed: texto"],
  ["chat-ink-soft", "chat-embed", TEXT, "embed: apoio"],
  ["chat-ink", "chat-code", TEXT, "embed: recibo e código"],
  ["chat-ink-soft", "chat-bar", TEXT, "conversa: dica"],
  ["chat-btn-ink", "chat-btn", TEXT, "botão do app"],
  ["on-violet", "chat-ok", TEXT, "botão verde do app"],
  ["on-violet", "chat-danger", TEXT, "botão vermelho do app"],
  ["on-violet", "chat-primary", TEXT, "botão azul do app e selo BOT"]
];

// O recibo é claro nos dois temas.
const FIXED = [
  ["receipt-ink", "receipt", TEXT, "texto do recibo"],
  ["receipt-ink-soft", "receipt", TEXT, "apoio do recibo"]
];

// ------------------------------------------------------------ relatório
let failures = 0;
const rows = [];

for (const theme of ["light", "dark"]) {
  for (const [fg, bg, min, where] of [...PAIRS, ...FIXED]) {
    const ratio = contrast(resolve(fg, theme), resolve(bg, theme));
    const ok = ratio >= min;

    if (!ok) failures++;
    rows.push({ theme, par: `${fg} / ${bg}`, razão: ratio.toFixed(2), mínimo: min, ok: ok ? "ok" : "FALHOU", onde: where });
  }
}

const bad = rows.filter(row => row.ok !== "ok");

if (process.argv.includes("--all")) console.table(rows);

if (bad.length) {
  console.error("Contraste abaixo do mínimo:");
  console.table(bad);
  process.exit(1);
}

console.log(`Contraste: ${rows.length} pares conferidos nos dois temas, todos dentro do mínimo.`);

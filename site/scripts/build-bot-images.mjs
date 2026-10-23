// Gera as imagens que o bot usa nas respostas (miniaturas e ícone) a partir do desenho em vetor da
// pelúcia, em vários humores. Elas ficam em site/public/bot/ e vão ao ar junto com o site (GitHub
// Pages): o bot as cita por endereço (config/theme.mjs, THEME_IMAGES), porque a VSync só aceita
// imagem de embed por https.
//
//   helena.png        ícone pequeno (autor e rodapé do embed)        128 x 128
//   mood-<humor>.png  miniatura do embed, uma por humor              256 x 256
//
// Rode só quando o desenho mudar:  npm --prefix site run bot-images
// Os arquivos gerados são versionados (o build do site não depende do sharp para isso).

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = new URL("../public/bot/", import.meta.url);

await mkdir(OUT, { recursive: true });

const INK = "#14101c";
const LILAC = "#d3b3ff";
const BLUSH = "#c45bff";

// ------------------------------------------------------------ o corpo da pelúcia (128 x 112)
const BODY = `
  <path d="M26 34C19 15 27 6 44 19Zm76 0c7-19-1-28-18-15Z"/>
  <path d="M14 62C14 30 36 14 64 14s50 16 50 48c0 28-22 42-50 42S14 90 14 62Z"/>`;

const body = (rim = null) =>
  `<g fill="${INK}"${rim ? ` stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"` : ""}>${BODY}</g>
   <ellipse cx="42" cy="32" rx="16" ry="7" transform="rotate(-22 42 32)" fill="#fff" opacity=".09"/>`;

const stroke = (d, { width = 7, color = LILAC } = {}) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const blush = (color = BLUSH, opacity = 0.75) =>
  `<g fill="${color}" opacity="${opacity}"><ellipse cx="30" cy="73" rx="9" ry="5.5"/><ellipse cx="98" cy="73" rx="9" ry="5.5"/></g>`;

const smile = `${stroke("M55 73q9 9 18 0", { width: 4 })}${stroke("M58 79l-.8 6M70 79l.8 6", { width: 3.6 })}`;

const heart = (cx, cy, size, color) => {
  const s = size / 10;

  return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 4C-9-3-6-10 0-6 6-10 9-3 0 4Z" fill="${color}"/>`;
};

const star = (cx, cy, r, color) => {
  const points = Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;

    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");

  return `<polygon points="${points}" fill="${color}"/>`;
};

// ------------------------------------------------------------ humores: [cor do fundo, desenho do rosto]
const MOODS = {
  // deu certo, tudo em ordem
  feliz: {
    tile: "#5a2be2",
    face: `${body()}${stroke("M33 61q11-16 22 0")}${stroke("M73 61q11-16 22 0")}${blush()}${smile}`
  },

  // dinheiro entrando: olhos de moeda
  dinheiro: {
    tile: "#e7b643",
    face: `${body()}
      <g><circle cx="44" cy="58" r="11" fill="#f6d77a" stroke="#b8861b" stroke-width="3"/><circle cx="84" cy="58" r="11" fill="#f6d77a" stroke="#b8861b" stroke-width="3"/>
      <path d="M44 51v14M84 51v14" stroke="#b8861b" stroke-width="3.2" stroke-linecap="round"/></g>
      ${blush("#f6d77a", 0.5)}${stroke("M52 74q12 14 24 0", { width: 4 })}`
  },

  // esperando: recarga, energia, volte depois
  dormindo: {
    tile: "#4a5585",
    face: `${body()}${stroke("M33 60h22")}${stroke("M73 60h22")}${blush("#7684b1", 0.7)}${stroke("M58 76q6 4 12 0", { width: 3.6 })}
      ${stroke("M96 28h14l-14 16h14", { width: 4.5 })}${stroke("M108 8h10l-10 11h10", { width: 3.4 })}`
  },

  // atrás das grades: pego, preso
  preso: {
    tile: "#c2364d",
    face: `${body()}${stroke("M36 50l16 14m0-14L36 64")}${stroke("M76 50l16 14m0-14L76 64")}${blush("#ff6367", 0.6)}${stroke("M54 80q10-8 20 0", { width: 4 })}
      <g fill="#cbd0e6" opacity=".92"><rect x="22" y="2" width="7" height="108" rx="3.5"/><rect x="46" y="2" width="7" height="108" rx="3.5"/><rect x="75" y="2" width="7" height="108" rx="3.5"/><rect x="99" y="2" width="7" height="108" rx="3.5"/></g>`
  },

  // casamento, família, carinho
  amor: {
    tile: "#d2488a",
    face: `${body()}${heart(44, 60, 22, "#fa86b6")}${heart(84, 60, 22, "#fa86b6")}${blush("#fa86b6", 0.7)}${stroke("M55 74q9 9 18 0", { width: 4 })}`
  },

  // aviso: confira, falta algo
  alerta: {
    tile: "#f2a23a",
    face: `${body()}<g fill="${LILAC}"><circle cx="44" cy="60" r="9"/><circle cx="84" cy="60" r="9"/></g>
      <g fill="${INK}"><circle cx="46" cy="61" r="4"/><circle cx="82" cy="61" r="4"/></g>${stroke("M58 80q6-5 12 0", { width: 3.6 })}
      <g fill="#fff"><rect x="60" y="-2" width="8" height="15" rx="4"/><circle cx="64" cy="19" r="4.4"/></g>`
  },

  // não deu: erro, recusa, falta de saldo
  triste: {
    tile: "#51618f",
    face: `${body()}${stroke("M33 62q11 12 22 0")}${stroke("M73 62q11 12 22 0")}${blush("#7684b1", 0.7)}${stroke("M55 82q9-9 18 0", { width: 4 })}
      <path d="M99 70c-5 8-8 12-8 16a8 8 0 0 0 16 0c0-4-3-8-8-16Z" fill="#8fd3ff" opacity=".95"/>`
  },

  // crime: a máscara de ladrão
  mascara: {
    tile: "#2b1766",
    face: `${body("#7d55ff")}
      <rect x="16" y="46" width="96" height="26" rx="13" fill="${LILAC}"/>
      <ellipse cx="44" cy="59" rx="9" ry="7" fill="${INK}"/><ellipse cx="84" cy="59" rx="9" ry="7" fill="${INK}"/>
      <circle cx="46" cy="58" r="3" fill="#fff"/><circle cx="86" cy="58" r="3" fill="#fff"/>
      ${stroke("M55 84q9 6 20-3", { width: 4 })}`
  },

  // duelo e combate
  bravo: {
    tile: "#b8442a",
    face: `${body()}${stroke("M30 46l26 9", { width: 6 })}${stroke("M98 46L72 55", { width: 6 })}
      <g fill="${LILAC}"><circle cx="44" cy="64" r="6"/><circle cx="84" cy="64" r="6"/></g>${stroke("M52 82l6-5 6 5 6-5 6 5", { width: 3.6 })}`
  },

  // conquista, missão, subiu de nível
  festa: {
    tile: "#7a49f5",
    face: `${body()}${stroke("M33 61q11-16 22 0")}${stroke("M73 61q11-16 22 0")}${blush()}${stroke("M52 73q12 14 24 0", { width: 4 })}
      ${star(20, 24, 12, "#ffd86b")}${star(110, 20, 9, "#ffd86b")}${star(106, 96, 7, "#fff")}${star(14, 92, 6, "#fff")}`
  }
};

// ------------------------------------------------------------ montagem
const tile = ({ tile: color, face }, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="64" fill="${color}"/>
  <g transform="translate(19 41) scale(1.7)">${face}</g>
</svg>`;

const png = (svg, size, name) => sharp(Buffer.from(svg), { density: 96 }).resize(size, size).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(name, OUT)));

for (const [mood, spec] of Object.entries(MOODS)) {
  await png(tile(spec, 256), 256, `mood-${mood}.png`);
}

// O ícone pequeno: o mesmo desenho do favicon (pelúcia feliz no selo violeta), com contorno um pouco mais forte para 20 px.
await png(tile(MOODS.feliz, 256), 128, "helena.png");

console.log(`site/public/bot/: ${Object.keys(MOODS).length} humores e o ícone atualizados.`);

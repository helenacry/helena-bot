// Gera as imagens fixas do site a partir do desenho em vetor da pelúcia:
//   public/apple-touch-icon.png  180 x 180
//   public/og-default.png        1200 x 630 (compartilhamento em redes e chats)
//   ../docs/assets/banner.png    1600 x 420 (o topo do README)
// Rode só quando o desenho mudar:  npm --prefix site run icons
// Os arquivos gerados são versionados, então o build do site não depende do sharp para isso.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const PUBLIC = new URL("../public/", import.meta.url);
const file = name => fileURLToPath(new URL(name, PUBLIC));

const favicon = await readFile(file("favicon.svg"));

await sharp(favicon, { density: 600 }).resize(180, 180).png().toFile(file("apple-touch-icon.png"));

// A imagem de compartilhamento: papel lilás, a pelúcia, o nome e a frase do herói.
const plush = `
  <g transform="translate(846 122) scale(2.4)">
    <path d="M26 34C19 15 27 6 44 19Zm76 0c7-19-1-28-18-15Z" fill="#14101c"/>
    <path d="M14 62C14 30 36 14 64 14s50 16 50 48c0 28-22 42-50 42S14 90 14 62Z" fill="#14101c" stroke="#5b3fb0" stroke-width="2.5" stroke-linejoin="round"/>
    <g fill="none" stroke="#d3b3ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M33 61q11-16 22 0"/><path d="M73 61q11-16 22 0"/></g>
    <g fill="#c45bff" opacity=".7"><ellipse cx="30" cy="73" rx="9" ry="5.5"/><ellipse cx="98" cy="73" rx="9" ry="5.5"/></g>
    <g fill="none" stroke="#d3b3ff" stroke-width="3.6" stroke-linecap="round"><path d="M55 73q9 9 18 0"/><path d="M58 79l-.8 6M70 79l.8 6"/></g>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f6f1fd"/>
  <rect x="842" y="112" width="312" height="312" rx="34" fill="#5a2be2" transform="rotate(4 998 268)"/>
  ${plush}
  <rect x="64" y="64" width="330" height="40" rx="6" fill="none" stroke="#5a2be2" stroke-width="3"/>
  <text x="80" y="91" font-family="Courier New, monospace" font-weight="700" font-size="20" letter-spacing="2.5" fill="#5a2be2">BOT DE ECONOMIA E RPG</text>
  <text x="64" y="232" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="92" letter-spacing="-3" fill="#1a1326">Trabalhe, lave</text>
  <text x="64" y="330" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="92" letter-spacing="-3" fill="#1a1326">dinheiro, case</text>
  <text x="64" y="428" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="92" letter-spacing="-3" fill="#1a1326">ou vá preso.</text>
  <rect x="64" y="446" width="760" height="12" fill="#d6455b"/>
  <text x="64" y="544" font-family="Arial, sans-serif" font-weight="700" font-size="40" fill="#1a1326">Helena</text>
  <text x="232" y="544" font-family="Arial, sans-serif" font-size="30" fill="#5b4f73">para o Discord</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 96 }).png({ compressionLevel: 9 }).toFile(file("og-default.png"));

console.log("public/apple-touch-icon.png e public/og-default.png atualizados.");

// O banner do README (docs/assets/banner.png): a pelúcia, o nome e a frase, no papel lilás.
const bannerPlush = plush.replace('translate(846 122) scale(2.4)', 'translate(120 70) scale(2.55)');

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="420" viewBox="0 0 1600 420">
  <rect width="1600" height="420" fill="#f6f1fd"/>
  <rect x="96" y="52" width="360" height="330" rx="38" fill="#5a2be2" transform="rotate(-4 276 217)"/>
  ${bannerPlush}
  <text x="560" y="206" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="150" letter-spacing="-6" fill="#1a1326">Helena</text>
  <rect x="566" y="226" width="430" height="14" fill="#d6455b"/>
  <text x="566" y="296" font-family="Arial, sans-serif" font-weight="700" font-size="40" fill="#1a1326">Bot de economia e RPG para o Discord</text>
  <text x="566" y="344" font-family="Courier New, monospace" font-weight="700" font-size="30" letter-spacing="1" fill="#5a2be2">Trabalhe, lave dinheiro, case ou vá preso.</text>
</svg>`;

await sharp(Buffer.from(banner), { density: 96 }).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("../../docs/assets/banner.png", import.meta.url)));

console.log("docs/assets/banner.png atualizado.");

// Gera as imagens de perfil da Helena (1024 x 1024) a partir do desenho em vetor da pelúcia:
//   ../docs/assets/brand/bot-avatar.png    o avatar do bot no Discord (fundo violeta, a pelúcia com sombra dura)
//   ../docs/assets/brand/github-org.png    o avatar da organização helenacry no GitHub (papel lilás + selo violeta)
//   ../docs/assets/brand/server-icon.png   o ícone do servidor oficial no Discord (carimbo redondo, tinta escura)
//   ../docs/assets/brand/app-banner.png    o banner do app no Discord (1500 x 500, tudo no miolo por causa dos recortes)
//   ../assets/helena_pfp.png               a foto da Helena no site e no cartão de exemplo (o avatar do bot, 512 px)
// Rode só quando o desenho mudar:  npm --prefix site run profiles
//
// As plataformas cortam o avatar em círculo ou em quadrado de cantos redondos, então tudo
// importante fica dentro do círculo inscrito (raio 512), com folga. Sem texto: nenhum
// desenho depende de fonte instalada e continua legível em 32 px.

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = new URL("../../docs/assets/brand/", import.meta.url);

await mkdir(OUT, { recursive: true });

// As cores são as mesmas do site (styles/tokens.css, favicon e imagem de compartilhamento).
const INK = "#14101c";
const PAPER = "#f6f1fd";
const VIOLET = "#5a2be2";
const VIOLET_DEEP = "#3a1a9e";
const LILAC = "#d3b3ff";
const BLUSH = "#c45bff";

// A pelúcia (viewBox 128 x 112, igual ao components/ui/Plush.astro), com a escala e a posição
// do canto superior esquerdo. "shadow" desenha uma cópia do corpo deslocada, em cor chapada.
function plush({ x, y, scale, shadow = null, rim = null }) {
  const body = `
    <path d="M26 34C19 15 27 6 44 19Zm76 0c7-19-1-28-18-15Z"/>
    <path d="M14 62C14 30 36 14 64 14s50 16 50 48c0 28-22 42-50 42S14 90 14 62Z"/>`;

  return `
  <g transform="translate(${x} ${y}) scale(${scale})">
    ${shadow ? `<g transform="translate(${shadow.dx / scale} ${shadow.dy / scale})" fill="${shadow.color}">${body}</g>` : ""}
    <g fill="${INK}"${rim ? ` stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"` : ""}>${body}</g>
    <ellipse cx="42" cy="32" rx="16" ry="7" transform="rotate(-22 42 32)" fill="#fff" opacity=".09"/>
    <g fill="none" stroke="${LILAC}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M33 61q11-16 22 0"/><path d="M73 61q11-16 22 0"/>
    </g>
    <g fill="${BLUSH}" opacity=".75"><ellipse cx="30" cy="73" rx="9" ry="5.5"/><ellipse cx="98" cy="73" rx="9" ry="5.5"/></g>
    <g fill="none" stroke="${LILAC}" stroke-linecap="round">
      <path d="M55 73q9 9 18 0" stroke-width="4"/><path d="M58 79l-.8 6M70 79l.8 6" stroke-width="3.6"/>
    </g>
  </g>`;
}

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

// Põe o CENTRO DO CORPO da pelúcia (as orelhas até a base: x de 14 a 114, y de 5 a 104, ou seja,
// o ponto 64 x 54,5 do desenho) em (cx, cy). Centralizar pelo retângulo inteiro (128 x 112) deixava
// a pelúcia baixa, porque embaixo do corpo sobra espaço vazio.
const at = (cx, cy, scale) => ({ x: cx - 64 * scale, y: cy - 54.5 * scale, scale });

// 1. Avatar do bot: fundo violeta chapado (a cor de marca) e a pelúcia com sombra dura, como um objeto.
// A pelúcia ocupa uns 60% da largura e fica dentro do círculo, com folga para o corte.
const bot = svg(`
  <rect width="1024" height="1024" fill="${VIOLET}"/>
  ${plush({ ...at(500, 506, 6.2), shadow: { dx: 24, dy: 24, color: VIOLET_DEEP } })}`);

// 2. Avatar da organização no GitHub: papel lilás, um selo violeta inclinado com contorno e sombra de tinta.
// O conjunto (selo + sombra) é deslocado para ficar no meio do quadro.
const org = svg(`
  <rect width="1024" height="1024" fill="${PAPER}"/>
  <g transform="translate(-13 -13)">
    <g transform="rotate(-5 512 512)">
      <rect x="160" y="160" width="704" height="704" rx="132" fill="${INK}" transform="translate(26 26)"/>
      <rect x="160" y="160" width="704" height="704" rx="132" fill="${VIOLET}" stroke="${INK}" stroke-width="16"/>
    </g>
    ${plush({ ...at(512, 508, 5.4) })}
  </g>`);

// 3. Ícone do servidor: um carimbo redondo (borda dupla em lilás) sobre a tinta, com o disco violeta e a pelúcia.
const server = svg(`
  <rect width="1024" height="1024" fill="${INK}"/>
  <circle cx="512" cy="512" r="462" fill="none" stroke="${LILAC}" stroke-width="10"/>
  <circle cx="512" cy="512" r="436" fill="none" stroke="${LILAC}" stroke-width="4" opacity=".7"/>
  <circle cx="512" cy="512" r="404" fill="${VIOLET}"/>
  ${plush({ ...at(512, 514, 5.2), rim: "#7d55ff" })}`);

for (const [name, markup] of [["bot-avatar", bot], ["github-org", org], ["server-icon", server]]) {
  const file = fileURLToPath(new URL(`${name}.png`, OUT));

  await sharp(Buffer.from(markup), { density: 72 }).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(file);
}

// 4. Banner do app no Discord (1500 x 500). O avatar cobre o canto inferior esquerdo no perfil e o recorte
// muda de lugar para lugar (de 3:1 a 7:1), então tudo fica no miolo: a pelúcia no centro e os quatro
// verbos do jogo dos lados, dentro de uma faixa de 1000 x 200 px no meio do quadro.
const verbs = (x, anchor, lines) => lines.map((line, i) => `
  <text x="${x}" y="${222 + i * 74}" text-anchor="${anchor}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="64" letter-spacing="-2" fill="${PAPER}">${line}</text>`).join("");

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">
  <rect width="1500" height="500" fill="${VIOLET}"/>
  ${verbs(615, "end", ["Trabalhe.", "Lave."])}
  ${verbs(885, "start", ["Case.", "Fuja."])}
  ${plush({ ...at(750, 258, 2.3), shadow: { dx: 10, dy: 10, color: VIOLET_DEEP } })}
</svg>`;

await sharp(Buffer.from(banner), { density: 72 }).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("app-banner.png", OUT)));

// A "foto da Helena" que o site e o cartão de exemplo usam (o avatar da conversa na home e a jogadora
// do cartão) é o mesmo avatar do bot, em 512 px: o site nunca mostra uma Helena diferente da real.
await sharp(Buffer.from(bot), { density: 72 })
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(fileURLToPath(new URL("../../assets/helena_pfp.png", import.meta.url)));

console.log("docs/assets/brand/bot-avatar.png, github-org.png e server-icon.png atualizados, e assets/helena_pfp.png igual ao avatar do bot.");

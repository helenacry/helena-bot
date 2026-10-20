
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import sharp from "sharp";

// ==========================================
// EMOJI COLORIDO NO CARTÃO
// ==========================================

// O Poppins não tem emoji, e o SVG do sharp não desenha emoji colorido (sem uma fonte de emoji o texto
// vira quadradinhos). Então os emojis são achados no texto por um analisador e desenhados como imagem:
//
//   @twemoji/parser  diz onde há emoji no texto e qual é o arquivo de cada um (1f600.svg, 2764.svg,
//                    1f3f3-fe0f-200d-1f308.svg...). Cuida das bandeiras, das teclas (1️⃣), dos tons de
//                    pele e dos emojis compostos (👨‍👩‍👧).
//   @twemoji/svg     os desenhos, um SVG por emoji (3.700 arquivos).
//
// Os desenhos são do Twemoji (© Twitter, Inc. e colaboradores, licença CC-BY 4.0): o crédito está no
// README e na wiki. Se um dos pacotes faltar, o cartão continua funcionando como antes: os emojis
// saem do texto.

const require = createRequire(import.meta.url);

let tools;

// { parse, directory } ou null (pacotes não instalados).
function load() {
    if (tools !== undefined) {
        return tools;
    }

    try {
        tools = {
            parse: require("@twemoji/parser").parse,
            directory: path.dirname(require.resolve("@twemoji/svg/package.json"))
        };

    } catch {
        tools = null;
    }

    return tools;
}

// O resultado de emojiDrawingWorks(): null enquanto ninguém conferiu (vale como "funciona").
let verified = null;

// Os emojis podem ser desenhados neste computador?
export function emojiAvailable() {
    return load() !== null && verified !== false;
}

// Desenha um emoji dentro de um SVG, do jeito que o cartão faz, e confere que a imagem apareceu (o
// centro do 😀 é amarelo). Serve para o log de inicialização avisar se a máquina (o Discloud é Linux)
// não desenha imagem SVG dentro de SVG: nesse caso o cartão volta a tirar os emojis do texto, em vez
// de sair com buracos no lugar deles.
export async function emojiDrawingWorks(file = "1f600.svg") {
    let works = false;

    try {
        const image = load() ? emojiImage(file) : null;

        if (image) {
            const { data } = await sharp(Buffer.from(
                `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><image href="${image}" x="0" y="0" width="40" height="40"/></svg>`
            )).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

            const center = (20 * 40 + 20) * 4;

            works = data[center + 3] > 200 && data[center] > 200 && data[center + 2] < 120;
        }

    } catch {
        works = false;
    }

    verified = works;

    return works;
}

// O arquivo do emoji, se o conjunto de desenhos o tem. O analisador conhece emojis mais novos que o
// conjunto de SVGs; esses ficam sem desenho (e saem do texto). Alguns arquivos levam o seletor de
// variação (fe0f) e outros não, então os dois nomes são tentados.
function fileFor(name) {
    const { directory } = load();

    for (const candidate of [name, name.replace(/-fe0f/g, "")]) {
        if (existsSync(path.join(directory, candidate))) {
            return candidate;
        }
    }

    return null;
}

// Onde há emoji no texto: [{ start, end, file }], com start e end em unidades UTF-16 (como o
// String.slice). Só entram os emojis que têm desenho.
export function findEmoji(text) {
    if (!emojiAvailable()) {
        return [];
    }

    const found = [];

    for (const item of load().parse(String(text ?? ""), { assetType: "svg" })) {
        const file = fileFor(String(item.url).split("/").pop());

        if (file) {
            found.push({ start: item.indices[0], end: item.indices[1], file });
        }
    }

    return found;
}

// Os desenhos já lidos, como data URI (o SVG do cartão leva tudo dentro, sem buscar nada na rede). O
// conjunto de emojis usados é pequeno, mas o limite impede que o cache cresça sem fim.
const images = new Map();

const MAX_IMAGES = 600;

// O desenho do emoji como data URI de SVG, ou null se o arquivo não pôde ser lido.
export function emojiImage(file) {
    if (images.has(file)) {
        return images.get(file);
    }

    let uri = null;

    try {
        const svg = readFileSync(path.join(load().directory, file));

        uri = `data:image/svg+xml;base64,${svg.toString("base64")}`;

    } catch {
        uri = null;
    }

    if (images.size >= MAX_IMAGES) {
        images.delete(images.keys().next().value);
    }

    images.set(file, uri);

    return uri;
}

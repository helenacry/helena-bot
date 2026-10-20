import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import sharp from "sharp";

const { profileSvg, renderProfileCard, rich, cardText, wrap } = await import("../services/social/profile-card.mjs");
const { findEmoji, emojiImage, emojiAvailable, emojiDrawingWorks } = await import("../services/social/card-emoji.mjs");
const { textAdvance, readAdvances, fontFileFor } = await import("../services/social/card-glyphs.mjs");
const { FONTS_DIR } = await import("../services/social/card-fonts.mjs");

// ==========================================
// EMOJI EM CORES NO CARTÃO (Twemoji)
// ==========================================

// Nome, bio e cônjuge mostram os emojis comuns em cores. Eles são achados no texto pelo
// @twemoji/parser e desenhados como imagem (os SVGs do @twemoji/svg) no meio da linha.

const require = createRequire(import.meta.url);

const TWEMOJI_DIR = path.dirname(require.resolve("@twemoji/svg/package.json"));

const BASE = Object.freeze({
    name: "Educado", title: "💰 Rico", bank: 650, wallet: 150, gems: 10, job: "Entregador",
    level: 5, maxLevel: 100, xpProgress: 10, xpRequired: 100, rank: 3, married: true, spouseName: "sakura"
});

const textsOf = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

const textXs = svg => [...svg.matchAll(/<text x="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map(m => ({ x: Number(m[1]), text: m[2] }));

// os emojis desenhados: o SVG de cada um (decodificado) e onde ficam
const imagesOf = svg => [...svg.matchAll(/<image href="data:image\/svg\+xml;base64,([^"]+)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"\/>/g)]
    .map(match => ({
        svg: Buffer.from(match[1], "base64").toString(),
        x: Number(match[2]),
        y: Number(match[3]),
        width: Number(match[4]),
        height: Number(match[5])
    }));

const drawing = file => readFileSync(path.join(TWEMOJI_DIR, file), "utf8");

const MARK = "";

// ==========================================
// ACHAR E CARREGAR
// ==========================================

test("os pacotes do Twemoji estão instalados e cada tipo de emoji acha o seu desenho", () => {
    assert.equal(emojiAvailable(), true);

    for (const [text, file] of [
        ["😀", "1f600.svg"],
        ["❤️", "2764.svg"],
        ["👨‍👩‍👧", "1f468-200d-1f469-200d-1f467.svg"],
        ["🇧🇷", "1f1e7-1f1f7.svg"],
        ["1️⃣", "31-20e3.svg"],
        ["👍🏽", "1f44d-1f3fd.svg"],
        ["🏳️‍🌈", "1f3f3-fe0f-200d-1f308.svg"],
        ["❤️‍🔥", "2764-fe0f-200d-1f525.svg"],
        ["☕", "2615.svg"]
    ]) {
        assert.deepEqual(findEmoji(`a${text}b`).map(found => found.file), [file], text);
    }

    // os índices servem para o String.slice (unidades UTF-16)
    assert.deepEqual(findEmoji("a😀b"), [{ start: 1, end: 3, file: "1f600.svg" }]);
});

test("emoji novo demais para o conjunto de desenhos não é achado (e some do texto)", () => {
    // 🫩 (Emoji 16) existe para o analisador, mas não no @twemoji/svg 15
    assert.deepEqual(findEmoji("oi 🫩"), []);
    assert.equal(rich("oi 🫩 tchau").text, "oi tchau");
});

test("a imagem do emoji é um SVG em data URI, guardada para a próxima vez; arquivo que não existe dá null", () => {
    const first = emojiImage("1f600.svg");

    assert.match(first, /^data:image\/svg\+xml;base64,/);
    assert.equal(Buffer.from(first.split(",")[1], "base64").toString(), drawing("1f600.svg"));

    assert.equal(emojiImage("1f600.svg"), first);
    assert.equal(emojiImage("nao-existe.svg"), null);
});

test("a conferência da subida: desenha um emoji de verdade; se não desenhar, o cartão volta a tirar os emojis do texto", async () => {
    assert.equal(await emojiDrawingWorks(), true);

    // um desenho que não existe = máquina que não desenha: os emojis saem do texto, sem buraco
    assert.equal(await emojiDrawingWorks("nao-existe.svg"), false);
    assert.equal(emojiAvailable(), false);
    assert.deepEqual(findEmoji("oi 😀"), []);

    const svg = await profileSvg({ ...BASE, name: "Ana 😀", bio: "oi 😀 tchau" });

    assert.equal(imagesOf(svg).length, 0);
    assert.ok(textsOf(svg).includes("oi tchau"));
    assert.ok(textsOf(svg).includes("Ana"));

    // e volta ao normal quando a conferência passa
    assert.equal(await emojiDrawingWorks(), true);
    assert.equal(emojiAvailable(), true);
    assert.equal(findEmoji("oi 😀").length, 1);
});

// ==========================================
// TEXTO
// ==========================================

test("rich: o emoji fica no texto como um marcador, na ordem, e o resto passa pelo mesmo filtro do plain", () => {
    const one = rich("oi 😀 tudo 👍🏽");

    assert.equal(one.text, `oi ${MARK} tudo ${MARK}`);
    assert.deepEqual(one.files, ["1f600.svg", "1f44d-1f3fd.svg"]);
    assert.deepEqual(one.glyphs, ["😀", "👍🏽"]);

    // símbolos, outro alfabeto, emoji personalizado e menção saem; o emoji comum fica
    assert.equal(rich("a ★ 😀 <:festa:1-2> <@1234> 日本 b").text, `a ${MARK} b`);

    // bandeira, tecla e emoji composto são um emoji só
    assert.equal(rich("🇧🇷 1️⃣ 👨‍👩‍👧").files.length, 3);

    // quem escreve o próprio marcador (área de uso privado) não engana o cartão
    assert.deepEqual(rich(`x${MARK}y`).files, []);
    assert.equal(rich(`x${MARK}y`).text, "xy");

    // sem emoji, igual ao plain
    assert.equal(rich("  Ação   ™ © \n 5 ").text, "Ação ™ © 5");
});

test("cardText devolve o texto como aparece no cartão, com os emojis de verdade", () => {
    assert.equal(cardText("Olá 🔥 ★ <:a:1> mundo"), "Olá 🔥 mundo");
    assert.equal(cardText("💜💜"), "💜💜");
    assert.equal(cardText("꒰ ✿ ꒱"), "");
});

test("a quebra de linha trata o emoji como mais largo que uma letra", () => {
    // 28 de largura e 2,3 por emoji: no máximo 12 emojis por linha
    const lines = wrap(MARK.repeat(30), 28, 7);

    assert.deepEqual(lines.map(line => line.length), [12, 12, 6]);

    // letras sem emoji continuam valendo 1
    assert.deepEqual(wrap("aaa bbb ccc", 7, 3), ["aaa bbb", "ccc"]);
    assert.deepEqual(wrap("a".repeat(30), 28, 5), ["a".repeat(28), "aa"]);

    // passando das linhas: reticências, sem passar da largura
    const cut = wrap(MARK.repeat(100), 28, 2);

    assert.equal(cut.length, 2);
    assert.ok(cut[1].endsWith("…"));
    assert.ok((cut[1].length - 1) * 2.3 + 1 <= 28);
});

// ==========================================
// DESENHO NO CARTÃO
// ==========================================

test("a bio com emoji é desenhada com o desenho de cada emoji, na ordem, no meio do texto", async () => {
    const svg = await profileSvg({ ...BASE, bio: "Amo 🍕 e 🎮" });

    const images = imagesOf(svg);

    assert.deepEqual(images.map(image => image.svg), [drawing("1f355.svg"), drawing("1f3ae.svg")]);

    assert.ok(textsOf(svg).includes("Amo"));
    assert.ok(textsOf(svg).includes("e"));

    // o 🍕 começa onde o "Amo " termina (largura vinda do Poppins itálico), com a folga do emoji
    const left = 258 + textAdvance("Amo ", 21, { weight: 400, italic: true }) + (21 * 1.25 - 21 * 1.12) / 2;

    assert.ok(Math.abs(images[0].x - left) < 0.2, `${images[0].x} vs ${left}`);

    // o 2º emoji vem depois do "e" e o texto "e" fica entre os dois
    const e = textXs(svg).find(item => item.text === "e");

    assert.ok(e.x > images[0].x + images[0].width && e.x < images[1].x);

    // emoji e texto na mesma linha (o desenho sobe um pouco acima da linha de base, y = 891)
    assert.ok(images.every(image => image.y < 891 && image.y + image.height > 891));
});

test("só emoji: a bio mostra os emojis, não a bio padrão", async () => {
    const svg = await profileSvg({ ...BASE, bio: "💜💜💜" });

    assert.equal(imagesOf(svg).length, 3);
    assert.ok(!textsOf(svg).includes("Nenhuma bio definida."));
});

test("a bio cheia de emoji quebra em linhas que cabem na caixa e termina com reticências", async () => {
    const svg = await profileSvg({ ...BASE, bio: "😀".repeat(100) });

    const images = imagesOf(svg);

    // 7 linhas no máximo; nenhuma passa da borda direita da caixa da bio (577)
    assert.ok(new Set(images.map(image => image.y)).size <= 7);
    assert.ok(images.every(image => image.x >= 258 && image.x + image.width <= 577), "emoji fora da caixa");

    assert.ok(textsOf(svg).includes("…"));
});

test("o nome com emoji fica centralizado como um todo, e o cônjuge começa no lugar de sempre", async () => {
    const svg = await profileSvg({ ...BASE, name: "Ana 😀🔥", spouseName: "João 😎" });

    // nome: texto + 2 emojis, centralizados em 1058
    const total = textAdvance("Ana ", 48, { weight: 700 }) + 2 * 48 * 1.25;

    const ana = textXs(svg).find(item => item.text === "Ana");

    assert.ok(Math.abs(ana.x - (1058 - total / 2)) < 0.2, `${ana.x}`);

    const images = imagesOf(svg);

    assert.equal(images.length, 3);

    // cônjuge: "@João" a partir de 337 e o emoji logo depois
    const joao = textXs(svg).find(item => item.text === "@João");

    assert.equal(joao.x, 337);
    assert.ok(images[2].x > 337 + textAdvance("@João", 18, { weight: 500 }) - 1);
});

test("sem emoji nada muda: o texto sai como um elemento só, sem imagem", async () => {
    const svg = await profileSvg({ ...BASE, bio: "Gosto de café", name: "Maria" });

    assert.equal(imagesOf(svg).length, 0);
    assert.match(svg, /text-anchor="middle"[^>]*>Maria<\/text>/);
    assert.match(svg, /font-style="italic"[^>]*>Gosto de café<\/text>/);
});

test("o emoji é pintado de verdade na imagem (cor, não quadradinho)", async () => {
    // 🔥 é laranja e amarelo: procura pixels dessa cor na caixa da bio
    const flame = async bio => {
        const { data, info } = await sharp(await renderProfileCard({ ...BASE, bio }))
            .extract({ left: 250, top: 860, width: 340, height: 60 })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let orange = 0;

        for (let i = 0; i < info.width * info.height; i++) {
            const [red, green, blue] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

            if (red > 220 && green > 80 && green < 200 && blue < 80) orange++;
        }

        return orange;
    };

    assert.ok(await flame("fogo 🔥🔥🔥") > 150);
    assert.equal(await flame("fogo"), 0);
});

test("tudo junto: bandeira, tom de pele, tecla, família e bio longa viram um cartão PNG válido", async () => {
    const data = {
        ...BASE,
        name: "Ana 🌸 Silva 🇧🇷",
        spouseName: "@maria_🐱💜",
        bio: "Oi! 🔥💜 1️⃣ ❤️‍🔥 👨‍👩‍👧 👍🏽 🏳️‍🌈 " + "tudo bem com você? 😀 ".repeat(8)
    };

    const png = await renderProfileCard(data);

    const meta = await sharp(png).metadata();

    assert.deepEqual([meta.format, meta.width, meta.height], ["png", 1600, 1200]);

    // nenhum pedaço de emoji sobra no texto: tudo é imagem
    const leftovers = textsOf(await profileSvg(data))
        .flatMap(text => [...text])
        .filter(letter => /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Cf}️⃣]/u.test(letter));

    assert.deepEqual(leftovers, []);
});

// ==========================================
// LARGURA DAS LETRAS (para posicionar o emoji)
// ==========================================

// a largura que o sharp desenha de verdade: onde há tinta (sem as folgas das pontas)
async function inkWidth(text, size, weight, italic) {
    const pad = 20;

    const { data, info } = await sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size) + pad * 2}" height="${size * 2}">` +
        `<text x="${pad}" y="${size * 1.4}" font-family="Poppins" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ""} fill="#fff">${text}</text></svg>`
    )).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let left = info.width;
    let right = -1;

    for (let x = 0; x < info.width; x++) {
        for (let y = 0; y < info.height; y++) {
            if (data[(y * info.width + x) * 4 + 3] > 40) {
                left = Math.min(left, x);
                right = Math.max(right, x);

                break;
            }
        }
    }

    return right - left + 1;
}

test("a largura vinda da fonte bate com a que o sharp desenha (até 3%)", async () => {
    for (const [text, size, weight, italic] of [
        ["Nenhuma bio definida.", 21, 400, true],
        ["Eu amo jogar com meus amigos", 21, 400, true],
        ["Matheus Tonon", 48, 700, false],
        ["@fulana de tal", 18, 500, false],
        ["WWWW mmmm iiii", 21, 400, true]
    ]) {
        const ink = await inkWidth(text, size, weight, italic);
        const advance = textAdvance(text, size, { weight, italic });

        assert.ok(Math.abs(advance - ink) <= Math.max(3, ink * 0.03), `${text}: tinta ${ink}, fonte ${advance.toFixed(1)}`);
    }
});

test("fonte por peso e itálico; caractere que a fonte não tem vale 0,6 do tamanho", () => {
    assert.equal(fontFileFor(400, false), "Poppins-Regular.ttf");
    assert.equal(fontFileFor(400, true), "Poppins-Italic.ttf");
    assert.equal(fontFileFor(500, false), "Poppins-Medium.ttf");
    assert.equal(fontFileFor(500, true), "Poppins-MediumItalic.ttf");
    assert.equal(fontFileFor(700, false), "Poppins-Bold.ttf");

    assert.equal(textAdvance("日", 100), 60);
    assert.equal(textAdvance("", 21), 0);

    const font = readAdvances(readFileSync(path.join(FONTS_DIR, "Poppins-Regular.ttf")));

    assert.ok(font.unitsPerEm >= 1000);
    assert.ok(font.advance("a".codePointAt(0)) > 0);
    assert.equal(font.advance("日".codePointAt(0)), null);
});

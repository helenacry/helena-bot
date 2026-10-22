import { db, set } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const { profileSvg, renderProfileCard, wrap, plain } = await import("../services/social/profile-card.mjs");
const { getPlayerRank } = await import("../services/economy/player-rank.mjs");
const { useBundledFonts, FONTS_DIR, FONTS_CONF } = await import("../services/social/card-fonts.mjs");
const { cardFontAvailable } = await import("../services/social/profile-card.mjs");

const SAMPLE = Object.freeze({
    name: "Educado",
    isOwner: true,
    title: "💰 Rico",
    bio: "Algumas pessoas colecionam coisas, eu coleciono momentos.",
    bank: 650,
    wallet: 150,
    gems: 1000,
    job: "Entregador",
    weapon: "🔫 Revólver",
    weaponDamage: 20,
    level: 45,
    maxLevel: 100,
    xpProgress: 1045,
    xpRequired: 4500,
    rank: 34,
    married: true,
    spouseName: "sakura"
});

const textsOf = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

// ==========================================
// IMAGEM
// ==========================================

test("o cartão sai como PNG 1600x1200", async () => {
    const png = await renderProfileCard(SAMPLE);

    const meta = await sharp(png).metadata();

    assert.deepEqual([meta.format, meta.width, meta.height], ["png", 1600, 1200]);
});

test("com avatar em memória o desenho muda, e sem avatar mostra o espaço reservado", async () => {
    const photo = await sharp({
        create: { width: 300, height: 300, channels: 3, background: "#ff00aa" }
    }).png().toBuffer();

    const withAvatar = await profileSvg({ ...SAMPLE, avatarBuffer: photo });
    const without = await profileSvg(SAMPLE);

    assert.match(withAvatar, /<image href="data:image\/png;base64,/);
    assert.doesNotMatch(without, /<image/);

    // a foto fica recortada em pentágono
    assert.match(withAvatar, /clip-path="url\(#pentagon\)"/);
});

test("uma imagem que não é imagem não derruba o cartão", async () => {
    const svg = await profileSvg({ ...SAMPLE, avatarBuffer: Buffer.from("isto não é uma imagem") });

    assert.doesNotMatch(svg, /<image/);
});

// ==========================================
// CONTEÚDO
// ==========================================

test("traz rank, nível, estado civil, cônjuge e os cinco dados", async () => {
    const texts = textsOf(await profileSvg(SAMPLE));

    for (const expected of [
        "RANK", "34", "LEVEL", "45", "23%", "Casado(a)", "@sakura", "Educado", "DEV",
        "Bio", "BANCO", "GEMAS", "CARTEIRA", "ARMA EQUIPADA", "EMPREGO ATUAL",
        "Entregador", "Revólver", "Dano 20", "1.000", "Helena"
    ]) {
        assert.ok(texts.some(t => t.includes(expected)), `falta "${expected}"`);
    }

    assert.ok(texts.some(t => /R\$\s650,00/.test(t)), "banco");
    assert.ok(texts.some(t => /R\$\s150,00/.test(t)), "carteira");
});

test("solteiro, sem rank e sem arma", async () => {
    const texts = textsOf(await profileSvg({
        name: "Novato", level: 1, bank: 0, wallet: 0, gems: 0, rank: null
    }));

    assert.ok(texts.includes("Solteiro(a)"));
    assert.ok(texts.includes("sem cônjuge"));
    assert.ok(texts.includes("—"), "rank desconhecido");
    assert.ok(texts.includes("Nenhuma"), "arma");
    assert.ok(texts.includes("Desempregado(a)"));
    assert.ok(texts.includes("Nenhuma bio definida."));
    assert.ok(texts.includes("Sem título equipado"));
    assert.ok(!texts.includes("DEV"), "só o dono do bot tem o selo");
    assert.ok(texts.includes("0%"));
});

test("o nível máximo mostra 100%", async () => {
    const texts = textsOf(await profileSvg({ ...SAMPLE, level: 100, maxLevel: 100 }));

    assert.ok(texts.includes("100%"));
});

test("emoji de título, emprego e arma saem do texto (o SVG não desenha emoji colorido); o do nome vira imagem", async () => {
    const svg = await profileSvg({ ...SAMPLE, name: "Ana 🌸", title: "👑 Realeza", job: "💼 Chefe", weapon: "🔫 Pistola" });

    assert.doesNotMatch(svg, /\p{Extended_Pictographic}/u);

    const texts = textsOf(svg);

    assert.ok(texts.includes("Ana"));
    assert.ok(texts.includes("Realeza"));
    assert.ok(texts.includes("Pistola"));

    assert.equal(plain("💰 Rico"), "Rico");
    assert.equal(plain("  a   b \n c "), "a b c");
});

test("plain tira bandeira, tom de pele, tecla, emoji composto e bandeira de região", () => {
    assert.equal(plain("Brasil 🇧🇷"), "Brasil");
    assert.equal(plain("ok 👍🏽 ok"), "ok ok");
    assert.equal(plain("passo 1️⃣ e 2️⃣"), "passo e");
    assert.equal(plain("#️⃣ *️⃣ 0⃣"), "");
    assert.equal(plain("fogo ❤️‍🔥 família 👨‍👩‍👧"), "fogo família");
    assert.equal(plain("Reino 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Unido"), "Reino Unido");
    assert.equal(plain("sol ☀️ e ✨"), "sol e");

    // nada de caractere invisível ou de controle sobrando
    assert.equal(plain("a​b‮c\u0000d"), "abcd");

    // texto de verdade fica: acento, ©, ®, ™ e números
    assert.equal(plain("Ação © Nº 5 ™ ®"), "Ação © Nº 5 ™ ®");
    assert.equal(plain("©️"), "");
});

test("nenhum resto de emoji sobra no cartão, em campo nenhum", async () => {
    const svg = await profileSvg({
        ...SAMPLE,
        name: "Ana 🌸 Silva 🇧🇷",
        title: "👑 Magnata 👍🏽",
        bio: "Oi! 🔥💜 1️⃣ ❤️‍🔥 👨‍👩‍👧 fim",
        job: "☕ Barista 🛵",
        weapon: "🔫 Revólver",
        spouseName: "@maria_🐱💜"
    });

    // os emojis viram imagem: no texto do SVG não sobra pedaço de emoji nenhum (nem invisível)
    const leftovers = textsOf(svg)
        .flatMap(text => [...text])
        .filter(letter => /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Cf}️⃣]/u.test(letter));

    assert.deepEqual(leftovers, []);

    const texts = textsOf(svg);

    // o texto de nome e cônjuge fica em pedaços entre os emojis desenhados
    assert.ok(texts.includes("Ana"));
    assert.ok(texts.includes("Silva"));
    assert.ok(texts.includes("@maria_"));

    // título, emprego e arma não levam emoji colorido: saem do texto
    assert.ok(texts.includes("Magnata"));
    assert.ok(texts.includes("Barista"));
    assert.ok(texts.includes("Revólver"));
});

test("o cônjuge só com emoji aparece como '@' e os emojis; sem nada que o cartão desenhe, aparece o traço", async () => {
    const emojis = await profileSvg({ ...SAMPLE, spouseName: "🐱💜" });

    assert.ok(textsOf(emojis).includes("@"));
    assert.equal([...emojis.matchAll(/<image href="data:image\/svg\+xml/g)].length, 2);

    for (const spouseName of ["★☆", "<:festa:1-2>", "日本語"]) {
        const texts = textsOf(await profileSvg({ ...SAMPLE, spouseName }));

        assert.ok(texts.includes("—"), spouseName);
        assert.ok(!texts.includes("@"), spouseName);
    }
});

test("cortar nome e bio não parte um caractere grande ao meio", async () => {
    // letras matemáticas (nomes estilizados) ocupam 2 unidades UTF-16 cada
    const fancy = "𝓗𝓮𝓵𝓮𝓷𝓪".repeat(8);

    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

    const svg = await profileSvg({ ...SAMPLE, name: fancy, bio: fancy.repeat(3) });

    for (const text of textsOf(svg)) {
        assert.doesNotMatch(text, lone);
    }

    for (const line of wrap(fancy, 7, 5)) {
        assert.doesNotMatch(line, lone);
        assert.ok(Array.from(line).length <= 7);
    }

    // continua uma imagem válida
    await sharp(Buffer.from(svg)).png().toBuffer();
});

test("texto vindo do usuário não vira marcação do SVG", async () => {
    const svg = await profileSvg({
        ...SAMPLE,
        name: `<script>alert(1)</script> & "x"`,
        bio: `</text><rect fill="red"/> & <b>`
    });

    assert.doesNotMatch(svg, /<script/);
    assert.doesNotMatch(svg, /<rect fill="red"/);
    assert.match(svg, /&lt;script&gt;/);

    // e o resultado continua sendo uma imagem válida
    await sharp(Buffer.from(svg)).png().toBuffer();
});

test("nomes compridos encolhem e são cortados", async () => {
    const size = svg => Number(/font-size="(\d+)"[^>]*>Eduardo/.exec(svg)?.[1]);

    const normal = size(await profileSvg({ ...SAMPLE, name: "Eduardo" }));
    const long = size(await profileSvg({ ...SAMPLE, name: "Eduardo Montenegro de Albuquerque Filho" }));

    assert.ok(long < normal, `${long} < ${normal}`);

    const texts = textsOf(await profileSvg({ ...SAMPLE, name: "Eduardo Montenegro de Albuquerque Filho" }));

    assert.ok(texts.some(t => t.startsWith("Eduardo") && t.endsWith("…")));
});

test("usa o dano antigo ('Tipo: ... • Dano: 20') se vier só o texto", async () => {
    const texts = textsOf(await profileSvg({
        ...SAMPLE,
        weaponDamage: undefined,
        weaponDetail: "Tipo: Armas de fogo • Dano: 35"
    }));

    assert.ok(texts.includes("Dano 35"));
});

// ==========================================
// FONTE (POPPINS VAI NO PROJETO)
// ==========================================

test("as cinco Poppins e o fonts.conf vão no projeto, e o conf aponta para a própria pasta", () => {
    for (const file of ["Poppins-Regular.ttf", "Poppins-Italic.ttf", "Poppins-Medium.ttf", "Poppins-MediumItalic.ttf", "Poppins-Bold.ttf"]) {
        const buffer = readFileSync(path.join(FONTS_DIR, file));

        // arquivo TrueType de verdade (não um texto de erro salvo com o nome da fonte)
        assert.ok(buffer.length > 100_000, file);
        assert.equal(buffer.readUInt32BE(0), 0x00010000, file);
    }

    const conf = readFileSync(FONTS_CONF, "utf8");

    // relativo: o caminho do projeto muda de máquina para máquina (PC, Discloud, Docker)
    assert.match(conf, /<dir prefix="relative">\.<\/dir>/);
    assert.match(conf, /\/etc\/fonts\/fonts\.conf/);
    assert.match(conf, /WINDOWSFONTDIR/);
});

test("useBundledFonts liga o fonts.conf do projeto, mas respeita quem já definiu o FONTCONFIG_FILE", () => {
    const empty = {};

    assert.equal(useBundledFonts(empty), true);
    assert.equal(empty.FONTCONFIG_FILE, FONTS_CONF);

    const chosen = { FONTCONFIG_FILE: "/outro/fonts.conf" };

    assert.equal(useBundledFonts(chosen), false);
    assert.equal(chosen.FONTCONFIG_FILE, "/outro/fonts.conf");
});

test("o Poppins é achado de verdade (e a checagem do log de início sabe diferenciar da fonte reserva)", async (t) => {
    // No Windows o fontconfig não lê a variável definida de dentro do processo:
    // lá vale o Poppins instalado na máquina, que o teste não pode exigir.
    if (process.platform === "win32") {
        t.skip("no Windows depende do Poppins instalado na máquina");

        return;
    }

    assert.equal(await cardFontAvailable(), true);
});

// ==========================================
// QUEBRA DE LINHA DA BIO
// ==========================================

test("wrap quebra em palavras, parte palavra gigante e termina com reticências", () => {
    assert.deepEqual(wrap("um dois três quatro", 10, 5), ["um dois", "três", "quatro"]);
    assert.deepEqual(wrap("", 10, 3), []);
    assert.deepEqual(wrap("abcdefghijklmno", 6, 5), ["abcdef", "ghijkl", "mno"]);

    const cut = wrap("a b c d e f g h", 3, 2);

    assert.equal(cut.length, 2);
    assert.ok(cut[1].endsWith("…"));
});

test("uma bio no limite de 160 caracteres cabe na caixa", async () => {
    const bio = ("palavra ").repeat(20).trim().slice(0, 160);

    const lines = textsOf(await profileSvg({ ...SAMPLE, bio })).filter(t => t.startsWith("palavra"));

    assert.ok(lines.length >= 1 && lines.length <= 7);
});

// ==========================================
// POSIÇÃO NO RANKING
// ==========================================

test("o rank do cartão é a posição do /ranking de patrimônio", () => {
    const G = "g-rank";

    db.exec("DELETE FROM players");

    const rows = [
        // user, carteira, banco, xp
        ["u-a", 100, 900, 5],
        ["u-b", 500, 500, 50],   // empata em patrimônio com u-a: mais XP, fica na frente
        ["u-c", 5000, 0, 1],
        ["u-d", 1000, 0, 50],    // empata com u-a e u-b em patrimônio e XP com u-b: decide o ID
        ["u-e", 0, 0, 0]
    ];

    for (const [user, wallet, bank, xp] of rows) {
        set(
            "INSERT INTO players (guild_id, user_id, wallet, bank, xp) VALUES (?, ?, ?, ?, ?)",
            G, user, wallet, bank, xp
        );
    }

    // outro servidor não interfere
    set("INSERT INTO players (guild_id, user_id, wallet, bank, xp) VALUES ('outro', 'u-z', 99999, 0, 0)");

    // a mesma ordem do SELECT do ranking
    const expected = db.prepare(`
        SELECT user_id FROM players WHERE guild_id = ?
        ORDER BY wallet + bank DESC, xp DESC, user_id ASC
    `).all(G).map(row => row.user_id);

    assert.deepEqual(expected, ["u-c", "u-b", "u-d", "u-a", "u-e"]);

    for (const [index, user] of expected.entries()) {
        assert.equal(getPlayerRank(G, user), index + 1, user);
    }

    assert.equal(getPlayerRank(G, "ninguem"), null);
    assert.equal(getPlayerRank("servidor-vazio", "u-a"), null);
});

test("a imagem de exemplo do site existe e tem o tamanho certo", async () => {
    const file = new URL("../site/src/assets/helena-card.webp", import.meta.url);

    const meta = await sharp(readFileSync(file)).metadata();

    assert.deepEqual([meta.width, meta.height], [1600, 1200]);
});


// ==========================================
// O DESENHO NOVO (conferido com a imagem de referência)
// ==========================================

const { splitTitle } = await import("../services/social/profile-card.mjs");
const { ACHIEVEMENTS } = await import("../config/achievements.mjs");

// Os dados do cartão de referência (a conta "richcry"), com a foto da Helena no lugar do gato.
const REFERENCE = Object.freeze({
    name: "richcry",
    isOwner: true,
    title: "💰 Rico",
    bio: "swaydif",
    bank: 0,
    wallet: 500,
    gems: 0,
    job: "Entregador",
    level: 1,
    maxLevel: 100,
    xpProgress: 0,
    xpRequired: 100,
    rank: 3,
    married: true,
    spouseName: "flawless tavio"
});

// A caixa dos pixels claros de uma região do cartão (x, y, largura, altura).
function inkBox(raw, info, [x0, y0, x1, y1], minLuminance) {
    let left = Infinity, right = -1, top = Infinity, bottom = -1;

    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const at = (y * info.width + x) * info.channels;

            const lum = 0.299 * raw[at] + 0.587 * raw[at + 1] + 0.114 * raw[at + 2];

            if (lum >= minLuminance) {
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
        }
    }

    return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

test("os textos do cartão ficam onde estão no desenho de referência (até 1 px)", async () => {
    const png = await renderProfileCard(REFERENCE);

    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    // [nome, região, luminância mínima, caixa esperada na referência]
    const expected = [
        ["Casado(a)", [330, 40, 640, 92], 200, { x: 338, y: 50, w: 176, h: 35 }],
        ["@cônjuge", [330, 94, 640, 124], 120, { x: 339, y: 97, w: 140, h: 18 }],
        ["RANK", [40, 128, 190, 162], 120, { x: 79, y: 141, w: 66, h: 17 }],
        ["posição", [40, 168, 190, 240], 200, { x: 101, y: 188, w: 21, h: 31 }],
        ["LEVEL", [1340, 84, 1520, 114], 150, { x: 1401, y: 96, w: 59, h: 15 }],
        ["nível", [1400, 115, 1460, 178], 200, { x: 1421, y: 125, w: 15, h: 40 }],
        ["porcentagem", [1400, 180, 1460, 212], 150, { x: 1416, y: 181, w: 29, h: 16 }],
        ["nome", [880, 590, 1250, 676], 200, { x: 973, y: 616, w: 172, h: 50 }],
        ["DEV", [1470, 684, 1540, 716], 120, { x: 1477, y: 694, w: 33, h: 12 }],
        ["Helena", [40, 1010, 190, 1055], 120, { x: 77, y: 1025, w: 70, h: 15 }],
        ["Bio", [240, 796, 420, 836], 120, { x: 260, y: 806, w: 34, h: 18 }],
        ["texto da bio", [240, 862, 600, 906], 150, { x: 259, y: 876, w: 80, h: 21 }],
        ["valor do banco", [750, 820, 1060, 862], 200, { x: 764, y: 824, w: 109, h: 27 }],
        ["rótulo da carteira", [750, 908, 950, 932], 110, { x: 763, y: 915, w: 80, h: 12 }],
        ["valor do emprego", [975, 1044, 1300, 1086], 200, { x: 988, y: 1049, w: 170, h: 30 }],
        ["o emoji do título", [1015, 672, 1048, 712], 60, { x: 1024, y: 680, w: 20, h: 23 }],
        ["o texto do título", [1049, 672, 1110, 712], 110, { x: 1053, y: 683, w: 40, h: 15 }]
    ];

    for (const [name, region, luminance, want] of expected) {
        const got = inkBox(data, info, region, luminance);

        assert.ok(got, `${name}: nada desenhado`);

        for (const key of ["x", "y", "w", "h"]) {
            assert.ok(
                Math.abs(got[key] - want[key]) <= 1,
                `${name}: ${key} = ${got[key]}, a referência tem ${want[key]}`
            );
        }
    }
});

test("as cores principais seguem a referência (moldura, painel, pílula e círculos)", async () => {
    const png = await renderProfileCard(REFERENCE);

    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const at = (x, y) => {
        const i = (y * info.width + x) * info.channels;

        return [data[i], data[i + 1], data[i + 2]];
    };

    const near = (got, want, tolerance = 6) =>
        got.every((value, index) => Math.abs(value - want[index]) <= tolerance);

    // [ponto, cor da referência]
    const spots = {
        "moldura": [[800, 8], [0x9b, 0x59, 0xf4]],
        "vão escuro": [[800, 14], [0x0d, 0x08, 0x21]],
        "linha clara interna": [[800, 19], [0xd0, 0xa0, 0xff]],
        "lateral": [[112, 600], [0x16, 0x0d, 0x36]],
        "centro do painel": [[1000, 300], [0x55, 0x24, 0x75]],
        "fundo (esquerda, embaixo)": [[240, 1160], [0x29, 0x0f, 0x44]],
        "fundo (direita, embaixo)": [[1560, 1160], [0x11, 0x0a, 0x2b]],
        "chip": [[600, 60], [0x20, 0x0f, 0x3c]],
        "pílula": [[1000, 815], [0x21, 0x15, 0x41]],
        "círculo do banco": [[686, 825], [0xa8, 0x55, 0xf7]],
        "círculo do emprego": [[905, 1050], [0xe9, 0xa0, 0x2e]],
        "bio": [[400, 1000], [0x1a, 0x10, 0x36]]
    };

    for (const [name, [[x, y], want]] of Object.entries(spots)) {
        const got = at(x, y);

        assert.ok(near(got, want), `${name}: ${got} em vez de ${want}`);
    }
});

// ==========================================
// EMOJI DO TÍTULO E ANEL DO NÍVEL
// ==========================================

test("o emoji do título é desenhado em vetor (todos os títulos das conquistas têm o seu)", async () => {
    const emojis = [...new Set(Object.values(ACHIEVEMENTS ?? {}).map(achievement => achievement.titleEmoji).filter(Boolean))];

    assert.ok(emojis.length >= 10, "a lista de títulos mudou?");

    for (const emoji of emojis) {
        const parts = splitTitle(`${emoji} Título`);

        assert.ok(parts.art, `${emoji} sem desenho`);
        assert.equal(parts.text, "Título");

        const svg = await profileSvg({ ...SAMPLE, title: `${emoji} Título` });

        assert.match(svg, /<g transform="translate\([\d.]+,676\.6\) scale\(0\.875\)">/, emoji);
        assert.doesNotMatch(svg, /\p{Extended_Pictographic}/u, "nenhum caractere de emoji no SVG");
    }
});

test("emoji fora da lista, título sem emoji e sem título", async () => {
    // fora da lista: sem desenho, o texto continua e vira a estrelinha de sempre
    const unknown = splitTitle("🦄 Mágico");

    assert.equal(unknown.art, null);
    assert.equal(unknown.text, "Mágico");

    const svg = await profileSvg({ ...SAMPLE, title: "🦄 Mágico" });

    assert.ok(textsOf(svg).includes("Mágico"));
    assert.doesNotMatch(svg, /scale\(0\.875\)/);
    assert.doesNotMatch(svg, /\p{Extended_Pictographic}/u);

    // sem emoji
    const plainTitle = await profileSvg({ ...SAMPLE, title: "Rico" });

    assert.ok(textsOf(plainTitle).includes("Rico"));
    assert.doesNotMatch(plainTitle, /scale\(0\.875\)/);

    // sem título
    assert.ok(textsOf(await profileSvg({ ...SAMPLE, title: "" })).includes("Sem título equipado"));
});

test("o título (com o emoji) fica centralizado na faixa do nome", async () => {
    for (const title of ["💰 Rico", "🌱 Iniciante", "🏅 Campeão"]) {
        const png = await renderProfileCard({ ...REFERENCE, title });

        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });

        const box = inkBox(data, info, [960, 672, 1180, 712], 60);

        // o nome está centrado em 1058; o título (emoji + texto) fica a até 3 px do mesmo centro
        assert.ok(Math.abs(box.x + box.w / 2 - 1058) <= 3, `${title}: centro em ${box.x + box.w / 2}`);
    }
});

test("o anel do nível: no 0% sobra um trecho à esquerda do topo, e o progresso cresce para a esquerda", async () => {
    const svg0 = await profileSvg({ ...REFERENCE, xpProgress: 0 });

    // 6% do círculo, saindo do topo no sentido anti-horário, em traço de 12 px
    assert.match(svg0, /<path d="M1430,67 A81,81 0 0 0 1\d{3}\.\d,\d{2}\.\d" fill="none" stroke="#b66cff" stroke-width="12" stroke-linecap="round"\/>/);

    const png = await renderProfileCard(REFERENCE);

    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const bright = degrees => {
        const radians = degrees * Math.PI / 180;

        const x = Math.round(1430 + 81 * Math.cos(radians));
        const y = Math.round(148 + 81 * Math.sin(radians));

        const i = (y * info.width + x) * info.channels;

        return data[i + 2] > 200;
    };

    assert.ok(bright(-101), "o trecho está à esquerda do topo");
    assert.ok(!bright(-70), "e não à direita");
    assert.ok(!bright(-130), "nem passa do trecho");

    // metade do caminho: o arco grande passa para o outro lado
    assert.match(await profileSvg({ ...REFERENCE, xpProgress: 60, xpRequired: 100 }), /A81,81 0 1 0 /);

    // cheio: círculo inteiro
    assert.match(await profileSvg({ ...REFERENCE, level: 100 }), /<circle cx="1430" cy="148" r="81" fill="none" stroke="#b66cff" stroke-width="12"\/>/);
});

test("o pentágono do avatar, o coração e a coroa seguem as medidas do desenho", async () => {
    const png = await renderProfileCard(REFERENCE);

    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    // pontas do contorno (a ponta de cima e a base), como na referência
    const apex = inkBox(data, info, [380, 280, 470, 310], 150);
    const base = inkBox(data, info, [280, 650, 580, 700], 150);

    assert.ok(Math.abs(apex.y - 294) <= 1 && Math.abs(apex.w - 46) <= 2, JSON.stringify(apex));
    assert.ok(Math.abs(base.x - 296) <= 2 && Math.abs(base.w - 258) <= 3, JSON.stringify(base));

    const heart = inkBox(data, info, [240, 44, 316, 120], 245);

    assert.ok(Math.abs(heart.w - 30) <= 1 && Math.abs(heart.h - 31) <= 1, JSON.stringify(heart));

    const crown = inkBox(data, info, [40, 40, 190, 125], 150);

    assert.ok(Math.abs(crown.w - 52) <= 1 && Math.abs(crown.h - 47) <= 2, JSON.stringify(crown));
});

test("a imagem de exemplo do site usa o desenho novo (título com emoji e selo DEV)", async () => {
    const source = readFileSync(new URL("../scripts/site/build-card.mjs", import.meta.url), "utf8");

    assert.match(source, /title: "💰 Rico"/);
    assert.match(source, /isOwner: true/);
});

// ==========================================
// TEXTO COM EMOJI, SÍMBOLOS E TOKENS DA VSYNC
// ==========================================

const { canDraw, readCoverage } = await import("../services/social/card-glyphs.mjs");

const NASTY_BIOS = [
    "oi 😀 tudo bem?", "💜💜💜", "👨‍👩‍👧‍👦 família 🏳️‍🌈", "🇧🇷 Brasil 🇵🇹", "1️⃣ primeiro", "❤️ amor ❤️‍🔥", "👍🏽 joia",
    "Olá <:festa:3f2a9c1e-5b7d-4c0e-8a11-9d6e2b7a4f10> mundo <a:dance:1111-2222>", "fala <@bc86cc02-1111-2222> e <#abcd> <@&cargo-1>",
    "𝓑𝓲𝓸 𝓲𝓷𝓽𝓮𝓻𝓮𝓼𝓼𝓪𝓷𝓽𝓮 𝕗𝕚𝕟𝕒𝕝 ＡＢＣ", "꒰ঌ sou calma ໒꒱ ✧･ﾟ: *✧･ﾟ:* ★彡 ♡ ✿ ❀", "日本語 한국어 العربية русский", "texto\u200bcom\u200dinvisíveis\u202etrocado",
    "😀".repeat(80), "linha 1 😀\nlinha 2 🎉\r\nlinha 3", "</text><script>alert(1)</script> & \" ' < >", "abc\ud83dxyz\ude00",
    "™ © ® R$ 10,00 50% #1 — “aspas” …"
];

// os caracteres dos textos desenhados no SVG (com as entidades desfeitas)
const drawnCharacters = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .flatMap(match => Array.from(match[1]
        .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'").replaceAll("&amp;", "&")));

test("o Poppins do projeto: o que ele desenha e o que não (a lista vem do arquivo da fonte)", () => {
    for (const letter of "aZ9éçãõüñÀ—–…’“”€£$%&@#™©®") {
        assert.ok(canDraw(letter.codePointAt(0)), `${letter} deveria ter desenho`);
    }

    for (const letter of "★☆♥♡✿❀✧꒰日本한ا😀❤✨→") {
        assert.equal(canDraw(letter.codePointAt(0)), false, `${letter} não tem desenho`);
    }

    // a leitura do arquivo: faixas [início, fim] dentro do Unicode, do jeito que a tabela cmap guarda
    const ranges = readCoverage(readFileSync(path.join(FONTS_DIR, "Poppins-Regular.ttf")));

    assert.ok(ranges.length > 5);
    assert.ok(ranges.some(([start, end]) => start <= 0x61 && end >= 0x7a), "a-z");
    assert.ok(ranges.every(([start, end]) => start <= end));
});

test("plain: tokens da VSync somem, fonte estilizada vira letra comum e símbolo sem desenho sai", () => {
    // emoji personalizado e menções (o cartão não mostra o ID de ninguém)
    assert.equal(plain("Olá <:festa:3f2a9c1e-5b7d> mundo <a:dance:1111-2222>"), "Olá mundo");
    assert.equal(plain("fala <@bc86cc02-1111> e <#abcd> <@&cargo-1>"), "fala e");

    // letras estilizadas, largura total e acento solto voltam a ser texto comum
    assert.equal(plain("𝓑𝓲𝓸 𝗕𝗼𝗹𝗱 ＡＢＣ ①㎏"), "Bio Bold ABC 1kg");
    assert.equal(plain("Jose\u0301 c\u0327a"), "José ça");

    // símbolos decorativos e outros alfabetos (quadradinhos no servidor) saem
    assert.equal(plain("꒰ঌ sou calma ໒꒱ ★彡 ♡ ✿"), "sou calma");
    assert.equal(plain("日本語 한국어 العربية"), "");

    // o que o Poppins tem fica
    assert.equal(plain("™ © ® R$ 10,00 50% #1 — “aspas” ’"), "™ © ® R$ 10,00 50% #1 — “aspas” ’");

    // pedaço solto de emoji, controle e inversor de direção
    assert.equal(plain("abc\ud83dxyz\ude00"), "abcxyz");
    assert.equal(plain("a\u0000b\u202ec\u200b"), "abc");
    assert.equal(plain("a\nb\r\nc"), "a b c");
});

test("o cartão sai (e só com caracteres que o Poppins desenha) para qualquer bio, nome e cônjuge", async () => {
    for (const bio of NASTY_BIOS) {
        const data = { ...SAMPLE, bio, name: bio, spouseName: bio, job: bio };

        const svg = await profileSvg(data);

        for (const letter of drawnCharacters(svg)) {
            assert.ok(letter === " " || canDraw(letter.codePointAt(0)), `${JSON.stringify(letter)} sem desenho, em ${JSON.stringify(bio).slice(0, 40)}`);
        }

        assert.doesNotMatch(svg, /&lt;:|&lt;@|&lt;#|&lt;a:/, `token cru no cartão: ${JSON.stringify(bio).slice(0, 40)}`);

        const png = await renderProfileCard(data);

        assert.deepEqual([(await sharp(png).metadata()).width, (await sharp(png).metadata()).height], [1600, 1200]);
    }
});

test("bio só de símbolos, de outro alfabeto ou de token da VSync mostra a bio padrão", async () => {
    for (const bio of ["꒰ ✿ ꒱", "<:festa:1-2>", "<@1234>", "日本語"]) {
        assert.ok(textsOf(await profileSvg({ ...SAMPLE, bio })).includes("Nenhuma bio definida."), bio);
    }
});

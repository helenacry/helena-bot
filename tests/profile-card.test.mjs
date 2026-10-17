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

test("emoji sai do texto (o SVG não desenha emoji colorido)", async () => {
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

    const leftovers = textsOf(svg)
        .flatMap(text => [...text])
        .filter(letter => /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Cf}️⃣]/u.test(letter));

    assert.deepEqual(leftovers, []);

    const texts = textsOf(svg);

    assert.ok(texts.includes("Ana Silva"));
    assert.ok(texts.includes("@maria_"));
});

test("o cônjuge com só emoji no nome aparece como traço, sem '@' solto", async () => {
    const texts = textsOf(await profileSvg({ ...SAMPLE, spouseName: "🐱💜" }));

    assert.ok(texts.includes("—"));
    assert.ok(!texts.includes("@"));
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
    const file = new URL("../site/assets/img/helena-card.webp", import.meta.url);

    const meta = await sharp(readFileSync(file)).metadata();

    assert.deepEqual([meta.width, meta.height], [1200, 900]);
});

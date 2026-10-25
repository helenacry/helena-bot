import test from "node:test";
import assert from "node:assert/strict";

import { readdirSync } from "node:fs";

const { ICONS, ICON_PREFIX } = await import("../config/icons.mjs");
const { icon, setAppEmojis, loadAppEmojis } = await import("../services/platform/app-emojis.mjs");
const { renderEmoji } = await import("../scripts/dev/emojis.mjs");
const { receipt, iconFor, signed } = await import("../utils/receipt.mjs");
const { emojiOf } = await import("../services/discord/format.mjs");

test.afterEach(() => setAppEmojis([]));

// ==========================================
// OS DESENHOS
// ==========================================

test("cada emoji do catálogo tem um desenho em assets/emojis, e não sobra desenho sem catálogo", () => {
    const files = readdirSync(new URL("../assets/emojis/", import.meta.url))
        .filter(name => name.endsWith(".svg"))
        .map(name => name.replace(/\.svg$/, ""))
        .sort();

    assert.deepEqual(files, Object.keys(ICONS).sort());
});

test("o nome de cada emoji serve ao Discord (2 a 32 letras, números e _) e o emoji comum não se repete", () => {
    for (const name of Object.keys(ICONS)) {
        assert.match(ICON_PREFIX + name, /^[A-Za-z0-9_]{2,32}$/, name);
    }

    const plain = Object.values(ICONS).map(emoji => emoji.replace(/️/g, ""));

    assert.equal(new Set(plain).size, plain.length, "dois nomes trocando o mesmo emoji comum");
});

test("cada desenho vira um PNG quadrado dentro do limite do Discord (256 KB)", async () => {
    for (const name of Object.keys(ICONS)) {
        const png = await renderEmoji(name);

        assert.ok(png.length > 500 && png.length <= 256 * 1024, `${name}: ${png.length} bytes`);
        assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${name} não é PNG`);

        // largura e altura no cabeçalho IHDR
        assert.equal(png.readUInt32BE(16), 128, `${name} largura`);
        assert.equal(png.readUInt32BE(20), 128, `${name} altura`);
    }
});

// ==========================================
// icon(): O DA HELENA QUANDO EXISTE, O COMUM QUANDO NÃO
// ==========================================

test("sem emojis no aplicativo, icon() devolve o emoji comum", () => {
    assert.equal(icon("🏷️"), "🏷️");
    assert.equal(icon("🔥"), "🔥");
});

test("com o emoji no aplicativo, icon() devolve o dele, com ou sem o seletor de variação", () => {
    const found = setAppEmojis([
        { id: "111", name: "h_tag", animated: false },
        { id: "222", name: "h_ready", animated: false },
        { id: "333", name: "outro_nome", animated: false }
    ]);

    assert.equal(found, 2);

    assert.equal(icon("🏷️"), "<:h_tag:111>");
    assert.equal(icon("🏷"), "<:h_tag:111>");
    assert.equal(icon("✅"), "<:h_ready:222>");

    // o que não tem desenho próprio fica como está
    assert.equal(icon("🔥"), "🔥");
    assert.equal(icon("🪪"), "🪪");
});

test("o emoji do aplicativo vira { name, id } no botão e no menu", () => {
    setAppEmojis([{ id: "999999999999999999", name: "h_refresh", animated: false }]);

    assert.deepEqual(emojiOf(icon("🔄")), { name: "h_refresh", id: "999999999999999999", animated: false });
    assert.deepEqual(emojiOf(icon("🏷️")), { name: "🏷️" });
});

test("loadAppEmojis lê a lista da API e, se ela falhar, deixa os emojis comuns sem derrubar o bot", async () => {
    const quiet = { log() {}, warn() {} };

    const ok = await loadAppEmojis({ appEmojis: async () => ({ items: [{ id: "1", name: "h_user", animated: false }] }) }, "10", quiet);

    assert.equal(ok, 1);
    assert.equal(icon("👤"), "<:h_user:1>");

    const down = await loadAppEmojis({ appEmojis: async () => { throw new Error("fora do ar"); } }, "10", quiet);

    // a falha não zera o que já estava carregado (uma queda do Discord não tira os emojis do ar)
    assert.equal(down, 0);
    assert.equal(icon("👤"), "<:h_user:1>");

    // e sem nada carregado antes, ficam os emojis comuns
    setAppEmojis([]);

    await loadAppEmojis({ appEmojis: async () => { throw new Error("fora do ar"); } }, "10", quiet);

    assert.equal(icon("👤"), "👤");
});

// ==========================================
// AS CONTAS: UMA LINHA COM EMOJI, COMO A ALFACUSA
// ==========================================

test("receipt: emoji, barra, nome e valor em negrito; linha em branco entre grupos, nunca nas pontas", () => {
    assert.equal(
        receipt([
            null,
            ["Pagamento", signed(42000, "R$ 420,00")],
            ["Experiência", "+25 XP"],
            null,
            null,
            ["Carteira", "R$ 1.350,00"],
            null
        ]),
        [
            "💵 | Pagamento: **+R$ 420,00**",
            "✨ | Experiência: **+25 XP**",
            "",
            "👛 | Carteira: **R$ 1.350,00**"
        ].join("\n")
    );

    assert.equal(receipt([]), "");
    assert.equal(receipt([null]), "");
    assert.equal(receipt(undefined), "");
});

test("receipt: o espaço rígido do dinheiro vira espaço comum e um valor vazio fica só com o nome", () => {
    assert.equal(receipt([["Carteira", "R$ 1,00"]]), "👛 | Carteira: **R$ 1,00**");
    assert.equal(receipt([["Carteira", ""]]), "👛 | Carteira");
});

test("iconFor: o nome exato manda, depois as palavras, e o resto leva o marcador", () => {
    assert.equal(iconFor("Carteira"), "👛");
    assert.equal(iconFor("  EXPERIÊNCIA "), "✨");
    assert.equal(iconFor("Gemas"), "💎");
    assert.equal(iconFor("Energia"), "⚡");
    assert.equal(iconFor("Pena restante"), "⛓️");

    // palavras-chave
    assert.equal(iconFor("Falta de sorte"), "⏳");
    assert.equal(iconFor("Lavagem extra"), "🧼");
    assert.equal(iconFor("Preço novo"), "💵");

    // sem assunto conhecido
    assert.equal(iconFor("Coisa qualquer"), "🔹");
});

test("receipt usa o emoji da Helena quando ele existe no aplicativo", () => {
    setAppEmojis([{ id: "7", name: "h_wait", animated: false }]);

    assert.equal(receipt([["Recarga", "em 5 minutos"]]), "<:h_wait:7> | Recarga: **em 5 minutos**");
});

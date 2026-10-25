import test from "node:test";
import assert from "node:assert/strict";

import { readdirSync } from "node:fs";

const { ICONS, ICON_PREFIX, fallbacksOf } = await import("../config/icons.mjs");
const { icon, customize, setAppEmojis, loadAppEmojis } = await import("../services/platform/app-emojis.mjs");
const { renderEmoji } = await import("../scripts/dev/emojis.mjs");
const { receipt, iconFor, signed } = await import("../utils/receipt.mjs");
const { emojiOf, toDiscordEmbed, toDiscordMessage, toDiscordComponent } = await import("../services/discord/format.mjs");

// todos os emojis do catálogo como se existissem no aplicativo, com IDs de 18 dígitos
const everything = () => setAppEmojis(Object.keys(ICONS).map((name, index) => ({
    id: String(1000000000000000000n + BigInt(index)),
    name: ICON_PREFIX + name,
    animated: false
})));

const idOf = name => String(1000000000000000000n + BigInt(Object.keys(ICONS).indexOf(name)));

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

    const plain = Object.keys(ICONS).flatMap(name => fallbacksOf(name)).map(emoji => emoji.replace(/️/g, ""));

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
// AS CONTAS: UMA LINHA COM EMOJI
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

// ==========================================
// customize(): TODO EMOJI COMUM DE UM TEXTO
// ==========================================

test("customize não mexe em nada enquanto o aplicativo não tem emojis", () => {
    assert.equal(customize("🏷️ Tag ❌"), "🏷️ Tag ❌");
    assert.equal(customize(""), "");
    assert.equal(customize(undefined), undefined);
});

test("customize troca cada emoji do catálogo, com ou sem seletor de variação, e os apelidos do mesmo desenho", () => {
    everything();

    const tag = `<:h_tag:${idOf("tag")}>`;
    const cross = `<:h_cross:${idOf("cross")}>`;
    const wrench = `<:h_wrench:${idOf("wrench")}>`;

    assert.equal(customize("🏷️ Tag"), `${tag} Tag`);
    assert.equal(customize("🏷 Tag"), `${tag} Tag`);
    assert.equal(customize("❌ erro ✖️ fechar"), `${cross} erro ${cross} fechar`);
    assert.equal(customize("🔧🛠️⚙️"), `${wrench}${wrench}${wrench}`);

    // a família é uma sequência com ligadores: sai inteira, sem sobrar pedaço
    assert.equal(customize("👨‍👩‍👧 em casa"), `<:h_family:${idOf("family")}> em casa`);

    // o que não tem desenho fica
    assert.equal(customize("🍎 maçã 💜"), "🍎 maçã 💜");
});

test("os emojis de itens do jogo e os coloridos de status não têm desenho e continuam como são", () => {
    everything();

    for (const keep of ["🍎", "☕", "🎣", "🟢", "🟠", "🔴", "⬛", "⬜", "▲"]) {
        assert.equal(customize(keep), keep, keep);
    }
});

// ==========================================
// NO ENVIO PARA O DISCORD
// ==========================================

test("o embed leva o emoji da Helena no título, na descrição e nos campos, mas não no autor nem no rodapé", () => {
    everything();

    const embed = toDiscordEmbed({
        title: "✅ Pronto",
        description: "💵 | Pagamento: **R$ 1,00**",
        fields: [{ name: "⚖️ Legal", value: "⏳ **Trabalhar:** ok", inline: false }],
        author: { name: "HELENA · BANCO 🏦", iconUrl: "https://x.test/a.png" },
        footer: { text: "dica 💡", iconUrl: "https://x.test/a.png" }
    });

    assert.equal(embed.title, `<:h_ready:${idOf("ready")}> Pronto`);
    assert.equal(embed.description, `<:h_money:${idOf("money")}> | Pagamento: **R$ 1,00**`);
    assert.equal(embed.fields[0].name, `<:h_legal:${idOf("legal")}> Legal`);
    assert.equal(embed.fields[0].value, `<:h_wait:${idOf("wait")}> **Trabalhar:** ok`);

    // autor e rodapé mostrariam o código cru: ficam com o emoji comum
    assert.equal(embed.author.name, "HELENA · BANCO 🏦");
    assert.equal(embed.footer.text, "dica 💡");
});

test("se a troca estourar o limite do campo, o texto segue com os emojis comuns (nunca cortado no meio do código)", () => {
    everything();

    const line = "💵 ";
    const description = line.repeat(1200); // 3.600 caracteres: cabe com o emoji comum, não com o da Helena

    const embed = toDiscordEmbed({ description });

    assert.equal(embed.description, description);
    assert.doesNotMatch(embed.description, /<:h_/);

    // um texto que cabe, troca
    assert.match(toDiscordEmbed({ description: line.repeat(10) }).description, /<:h_money:/);
});

test("botões e menus levam o emoji da Helena como { name, id }; o rótulo e o placeholder ficam como estão", () => {
    everything();

    const button = toDiscordComponent({ type: "button", customId: "x", label: "Atualizar 🔄", emoji: "🔄" });

    assert.deepEqual(button.emoji, { name: "h_refresh", id: idOf("refresh"), animated: false });
    assert.equal(button.label, "Atualizar 🔄");

    const menu = toDiscordComponent({
        type: "select",
        customId: "m",
        placeholder: "📂 Escolha",
        options: [
            { label: "Banner", value: "b", emoji: "🌌" },
            { label: "Livre", value: "l", emoji: "🍎" }
        ]
    });

    assert.deepEqual(menu.options[0].emoji, { name: "h_banner", id: idOf("banner"), animated: false });
    assert.deepEqual(menu.options[1].emoji, { name: "🍎" });
    assert.equal(menu.placeholder, "📂 Escolha");
});

test("o corpo da mensagem e o texto do layout V2 também; passando de 4000 no total, o V2 inteiro volta aos emojis comuns", () => {
    everything();

    const body = toDiscordMessage({ body: "💰 caixa", embeds: [] }).json.content;

    assert.equal(body, `<:h_coins:${idOf("coins")}> caixa`);

    const layout = text => [{ type: "container", components: [{ type: "text", content: text }, { type: "text", content: "🏦 banco" }] }];

    const small = toDiscordMessage({ components: layout("🔥 fogo") }).json.components[0].components;

    assert.equal(small[0].content, `<:h_fire:${idOf("fire")}> fogo`);
    assert.equal(small[1].content, `<:h_bank:${idOf("bank")}> banco`);

    // dois blocos de 100 emojis: cada um cabe trocado (2.800), mas a soma (5.600) passa de 4000 no V2
    const twoBlocks = [{ type: "container", components: [{ type: "text", content: "🔥".repeat(100) }, { type: "text", content: "🏦".repeat(100) }] }];

    const big = toDiscordMessage({ components: twoBlocks }).json.components[0].components;

    assert.equal(big[0].content, "🔥".repeat(100));
    assert.equal(big[1].content, "🏦".repeat(100), "o V2 inteiro volta, não só um bloco");
});

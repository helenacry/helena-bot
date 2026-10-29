import { createPrefixRunner, getPlayer, set } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O tradutor da Helena para o Discord (services/discord/format.mjs): o formato interno vira o
// JSON da API v10. Aqui as regras do Discord (limites de tamanho, custom_id único, linhas de
// botões) são conferidas contra as respostas reais dos comandos.

const {
    colorInt, emojiOf, toDiscordEmbed, toDiscordComponent, toDiscordMessage, toDiscordModal,
    toDiscordCallback, toDiscordCommand, toDiscordOption, commandProblems, toMultipart,
    FLAGS, ALLOWED_MENTIONS
} = await import("../services/discord/format.mjs");

const { carregarComandos } = await import("../command-registry.mjs");

const silently = async fn => {
    const log = console.log;

    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

const commands = await silently(() => carregarComandos());

// ==========================================
// AS REGRAS DO DISCORD
// ==========================================

// O que a API recusaria nesta mensagem (vazio = serve).
function discordProblems(json) {
    const problems = [];

    if (json.content !== undefined && json.content !== null && json.content.length > 2000) problems.push("content passa de 2000");

    const embeds = json.embeds ?? [];

    if (embeds.length > 10) problems.push("mais de 10 embeds");

    let characters = 0;

    for (const embed of embeds) {
        const texts = [embed.title, embed.description, embed.footer?.text, embed.author?.name];

        if ((embed.title ?? "").length > 256) problems.push("title passa de 256");
        if ((embed.description ?? "").length > 4096) problems.push("description passa de 4096");
        if ((embed.footer?.text ?? "").length > 2048) problems.push("footer passa de 2048");
        if ((embed.fields ?? []).length > 25) problems.push("mais de 25 campos");

        for (const field of embed.fields ?? []) {
            if (!field.name || field.name.length > 256) problems.push("nome de campo vazio ou acima de 256");
            if (!field.value || field.value.length > 1024) problems.push("valor de campo vazio ou acima de 1024");

            texts.push(field.name, field.value);
        }

        if (embed.color !== undefined && !Number.isInteger(embed.color)) problems.push("color precisa ser inteiro");

        characters += texts.filter(Boolean).join("").length;
    }

    if (characters > 6000) problems.push(`${characters} caracteres em embeds (máximo 6000)`);

    const ids = new Set();

    const count = list => (list ?? []).reduce((total, item) => total + 1 + count(item.components) + (item.accessory ? 1 : 0), 0);

    const control = item => {
        if (item.type === 2 && item.style !== 5) {
            if (!item.custom_id || item.custom_id.length > 100) problems.push("botão sem custom_id ou acima de 100");

            if (ids.has(item.custom_id)) problems.push(`custom_id repetido: ${item.custom_id}`);

            ids.add(item.custom_id);
        }

        if (item.type === 2 && !item.label && !item.emoji) problems.push("botão sem label nem emoji");
        if (item.type === 2 && (item.label ?? "").length > 80) problems.push("label de botão acima de 80");

        if (item.type === 3) {
            if (ids.has(item.custom_id)) problems.push(`custom_id repetido: ${item.custom_id}`);

            ids.add(item.custom_id);

            if (!item.options?.length || item.options.length > 25) problems.push("menu precisa de 1 a 25 opções");
            if ((item.placeholder ?? "").length > 150) problems.push("placeholder acima de 150");

            for (const option of item.options ?? []) {
                if (!option.label || option.label.length > 100) problems.push("rótulo de opção vazio ou acima de 100");
                if (!option.value || option.value.length > 100) problems.push("valor de opção vazio ou acima de 100");
                if ((option.description ?? "").length > 100) problems.push("descrição de opção acima de 100");
            }
        }
    };

    const visit = item => {
        if (item.type === 1) {
            const kids = item.components ?? [];
            const onlyMenu = kids.length === 1 && kids[0].type === 3;

            if (!onlyMenu && (kids.length < 1 || kids.length > 5 || kids.some(kid => kid.type !== 2))) {
                problems.push("linha com mais de 5 botões ou mistura de menu e botão");
            }
        }

        control(item);

        (item.components ?? []).forEach(visit);

        if (item.accessory) visit(item.accessory);
    };

    const components = json.components ?? [];

    components.forEach(visit);

    const v2 = (json.flags & FLAGS.COMPONENTS_V2) !== 0;

    if (!v2 && components.length > 5) problems.push("mais de 5 linhas de componentes");

    if (v2) {
        if (count(components) > 40) problems.push(`${count(components)} componentes (máximo 40)`);
        if (json.content || (json.embeds ?? []).length) problems.push("V2 não aceita content nem embeds");
    }

    return problems;
}

test("o validador acusa o que o Discord recusaria (senão os testes de baixo não provam nada)", () => {
    const button = id => ({ type: 2, style: 2, label: "x", custom_id: id });

    const bad = {
        content: "x".repeat(2001),
        embeds: [{ title: "t".repeat(257), description: "d".repeat(4000), fields: [{ name: "a", value: "v".repeat(1025) }, { name: "", value: "x" }], footer: { text: "f".repeat(2100) } }],
        components: [
            { type: 1, components: [1, 2, 3, 4, 5, 6].map(n => button(`b${n}`)) },
            { type: 1, components: [button("dup"), button("dup")] },
            { type: 1, components: [{ type: 3, custom_id: "m", options: [] }] }
        ]
    };

    const found = discordProblems(bad).join(" | ");

    for (const piece of [/content passa/, /title passa/, /valor de campo/, /nome de campo/, /footer passa/, /caracteres em embeds/, /mais de 5 botões|linha com mais/, /repetido: dup/, /1 a 25 opções/]) {
        assert.match(found, piece);
    }

    assert.deepEqual(discordProblems({ content: "ok", components: [{ type: 1, components: [button("a")] }] }), []);
});

// ==========================================
// PEÇAS
// ==========================================

test("cor: '#rrggbb' vira inteiro; o que não é cor fica sem barra", () => {
    assert.equal(colorInt("#8555ff"), 0x8555ff);
    assert.equal(colorInt("e7b643"), 0xe7b643);
    assert.equal(colorInt(0x3ad693), 0x3ad693);
    assert.equal(colorInt("roxo"), undefined);
    assert.equal(colorInt(-1), undefined);
    assert.equal(colorInt(undefined), undefined);
});

test("emoji: comum, personalizado e animado", () => {
    assert.deepEqual(emojiOf("🛒"), { name: "🛒" });
    assert.deepEqual(emojiOf("<:auto_admin:239478654474014720>"), { name: "auto_admin", id: "239478654474014720", animated: false });
    assert.deepEqual(emojiOf("<a:dancando:239478654474014720>"), { name: "dancando", id: "239478654474014720", animated: true });
    assert.equal(emojiOf(""), undefined);
});

test("embed: snake_case, data em ISO, só imagens https e campos sempre preenchidos", () => {
    const out = toDiscordEmbed({
        title: "🏦 Extrato",
        description: "texto",
        color: "#e7b643",
        fields: [{ name: "A", value: "B", inline: true }, { name: "", value: "" }],
        footer: { text: "dica", iconUrl: "https://x.test/i.png" },
        author: { name: "HELENA · BANCO", iconUrl: "https://x.test/i.png" },
        timestamp: Date.UTC(2026, 9, 24, 12, 0, 0),
        thumbnail: { url: "https://x.test/t.png" },
        image: { url: "http://inseguro.test/a.png" }
    });

    assert.equal(out.color, 0xe7b643);
    assert.deepEqual(out.footer, { text: "dica", icon_url: "https://x.test/i.png" });
    assert.deepEqual(out.author, { name: "HELENA · BANCO", icon_url: "https://x.test/i.png" });
    assert.equal(out.timestamp, "2026-10-24T12:00:00.000Z");
    assert.deepEqual(out.thumbnail, { url: "https://x.test/t.png" });
    assert.equal(out.image, undefined, "só https");
    assert.deepEqual(out.fields[1], { name: "​", value: "​", inline: false });
    assert.equal("iconUrl" in out.footer, false);
});

test("botões: tipo e estilo numéricos, emoji como objeto, link sem custom_id", () => {
    assert.deepEqual(
        toDiscordComponent({ type: "button", customId: "loja:home:1", label: "Início", emoji: "🏠", style: "primary" }),
        { type: 2, style: 1, label: "Início", emoji: { name: "🏠" }, custom_id: "loja:home:1" }
    );

    const danger = toDiscordComponent({ type: "button", customId: "x", label: "Fechar", style: "danger", disabled: true });

    assert.equal(danger.style, 4);
    assert.equal(danger.disabled, true);

    const link = toDiscordComponent({ type: "button", label: "Site", style: "link", url: "https://helenacry.github.io/helena-bot/" });

    assert.equal(link.style, 5);
    assert.equal(link.url, "https://helenacry.github.io/helena-bot/");
    assert.equal("custom_id" in link, false);

    assert.equal(toDiscordComponent({ type: "button", customId: "x", label: "y".repeat(120) }).label.length, 80);
});

test("menu: custom_id, min e max, opções com emoji e a marcada como padrão", () => {
    const menu = toDiscordComponent({
        type: "select", customId: "ajuda:cat:1", placeholder: "📂 Escolha", minValues: 1, maxValues: 1,
        options: [{ label: "Combate", value: "combate", description: "duelos", default: true, emoji: "⚔️" }, { label: "Outros", value: "outros" }]
    });

    assert.equal(menu.type, 3);
    assert.equal(menu.custom_id, "ajuda:cat:1");
    assert.deepEqual([menu.min_values, menu.max_values], [1, 1]);
    assert.deepEqual(menu.options[0], { label: "Combate", value: "combate", description: "duelos", emoji: { name: "⚔️" }, default: true });
    assert.deepEqual(menu.options[1], { label: "Outros", value: "outros" });
});

test("layout V2: container, texto, seção com botão ou miniatura e separador", () => {
    const container = toDiscordComponent({
        type: "container", accentColor: "#8555ff", components: [
            { type: "text", content: "-# HELENA · BANCO" },
            { type: "section", texts: ["**a**", "b"], accessory: { type: "thumbnail", url: "https://x.test/a.png", description: "avatar" } },
            { type: "section", texts: ["c"], accessory: { type: "button", customId: "k", label: "Abrir", style: "secondary" } },
            { type: "separator", divider: true, spacing: "large" },
            { type: "separator", divider: false },
            { type: "row", components: [{ type: "button", customId: "z", label: "Ok", style: "success" }] }
        ]
    });

    assert.equal(container.type, 17);
    assert.equal(container.accent_color, 0x8555ff);

    const [text, thumbSection, buttonSection, divider, gap, row] = container.components;

    assert.deepEqual(text, { type: 10, content: "-# HELENA · BANCO" });
    assert.deepEqual(thumbSection.components, [{ type: 10, content: "**a**" }, { type: 10, content: "b" }]);
    assert.deepEqual(thumbSection.accessory, { type: 11, media: { url: "https://x.test/a.png" }, description: "avatar" });
    assert.equal(buttonSection.accessory.type, 2);
    assert.deepEqual(divider, { type: 14, divider: true, spacing: 2 });
    assert.deepEqual(gap, { type: 14, divider: false, spacing: 1 });
    assert.equal(row.type, 1);
});

// ==========================================
// MENSAGENS
// ==========================================

test("mensagem clássica: texto, embeds, componentes, privada e menção só de pessoas", () => {
    const { json, files } = toDiscordMessage({
        body: "<@123>",
        embeds: [{ title: "oi", color: "#3ad693" }],
        components: [{ type: "row", components: [{ type: "button", customId: "a", label: "A" }] }],
        ephemeral: true,
        layout: [{ type: "container", components: [] }]
    });

    assert.equal(json.content, "<@123>");
    assert.equal(json.embeds[0].color, 0x3ad693);
    assert.equal(json.components[0].type, 1);
    assert.equal(json.flags, FLAGS.EPHEMERAL);
    assert.deepEqual(json.allowed_mentions, ALLOWED_MENTIONS);
    assert.deepEqual(json.allowed_mentions.parse, ["users"], "@everyone, @here e cargos nunca avisam");
    assert.equal("layout" in json, false, "o layout próprio nunca vai no clássico");
    assert.deepEqual(files, []);
});

test("mensagem V2: flag de V2, sem content nem embeds; atualizar limpa o que a antiga tinha", () => {
    const layout = [{ type: "container", components: [{ type: "text", content: "oi" }] }];

    const fresh = toDiscordMessage({ components: layout, ephemeral: true });

    assert.equal(fresh.json.flags, FLAGS.COMPONENTS_V2 | FLAGS.EPHEMERAL);
    assert.equal("content" in fresh.json, false);
    assert.equal("embeds" in fresh.json, false);

    const update = toDiscordMessage({ body: "", embeds: [], components: layout }, { update: true });

    assert.equal(update.json.flags, FLAGS.COMPONENTS_V2, "uma atualização não muda a privacidade");
    assert.equal(update.json.content, null);
    assert.deepEqual(update.json.embeds, []);
});

test("arquivo: sai do JSON, vai em multipart e o JSON só cita o nome", async () => {
    const { json, files } = toDiscordMessage({
        body: "Perfil",
        files: [{ name: "perfil.png", bytes: Buffer.from([1, 2, 3]), contentType: "image/png" }, { name: "sem-bytes.png" }]
    });

    assert.deepEqual(json.attachments, [{ id: 0, filename: "perfil.png" }]);
    assert.equal(files.length, 1);

    const form = toMultipart({ type: 4, data: json }, files);

    assert.equal(JSON.parse(form.get("payload_json")).data.content, "Perfil");

    const file = form.get("files[0]");

    assert.equal(file.name, "perfil.png");
    assert.equal(file.type, "image/png");
    assert.equal(file.size, 3);
});

// ==========================================
// FORMULÁRIOS E CALLBACK
// ==========================================

test("formulário: um campo por linha, estilo, limites e valor inicial", () => {
    const modal = toDiscordModal({
        customId: "bio:editar:1", title: "Sua bio",
        fields: [
            { customId: "bio", label: "Bio", style: "paragraph", required: false, placeholder: "conte", value: "oi", minLength: 1, maxLength: 90 },
            { customId: "nome", label: "Nome", style: "short", required: true }
        ]
    });

    assert.equal(modal.custom_id, "bio:editar:1");
    assert.equal(modal.components.length, 2);

    const [bio] = modal.components[0].components;

    assert.deepEqual(bio, {
        type: 4, custom_id: "bio", label: "Bio", style: 2, required: false,
        placeholder: "conte", value: "oi", min_length: 1, max_length: 90
    });

    assert.equal(modal.components[1].components[0].style, 1);
    assert.equal(modal.components[1].components[0].required, true);
});

test("callback: message, update, modal e defer_update têm o tipo certo do Discord", () => {
    assert.equal(toDiscordCallback({ type: "message", data: { body: "oi" } }).json.type, 4);
    assert.equal(toDiscordCallback({ type: "update", data: { body: "oi", ephemeral: true } }).json.type, 7);
    assert.equal("flags" in toDiscordCallback({ type: "update", data: { body: "oi", ephemeral: true } }).json.data, false);
    assert.deepEqual(toDiscordCallback({ type: "defer_update" }).json, { type: 6 });

    const modal = toDiscordCallback({ type: "modal", data: { customId: "m", title: "t", fields: [{ customId: "a", label: "A" }] } });

    assert.equal(modal.json.type, 9);
    assert.equal(modal.json.data.custom_id, "m");

    assert.throws(() => toDiscordCallback({ type: "inventado" }), /sem equivalente/);
});

// ==========================================
// COMANDOS DE BARRA
// ==========================================

test("opção: tipo numérico, obrigatória, escolhas e limites", () => {
    assert.deepEqual(toDiscordOption({ name: "usuario", description: "Quem", type: "user", required: true }), {
        type: 6, name: "usuario", description: "Quem", required: true
    });

    const choices = toDiscordOption({ name: "tipo", description: "Tipo", type: "string", choices: [{ name: "Gemas", value: "gems" }] });

    assert.deepEqual(choices.choices, [{ name: "Gemas", value: "gems" }]);

    assert.equal(toDiscordOption({ name: "n", description: "N", type: "integer", minValue: 1, maxValue: 99 }).max_value, 99);

    assert.throws(() => toDiscordOption({ name: "x", description: "x", type: "esquisito" }), /desconhecido/);
});

test("as regras do Discord para um comando: nome, descrição, ordem das opções e escolhas", () => {
    assert.deepEqual(commandProblems("daily", { description: "Resgate", options: [] }), []);

    const bad = commandProblems("Daily", {
        description: "",
        options: [
            { name: "a", description: "A", type: "string" },
            { name: "b", description: "B", type: "string", required: true },
            { name: "c", description: "x".repeat(101), type: "string" }
        ]
    });

    assert.ok(bad.some(line => /nome precisa/.test(line)));
    assert.ok(bad.some(line => /descrição de 1 a 100/.test(line)));
    assert.ok(bad.some(line => /obrigatória "b" vem depois/.test(line)));
    assert.ok(bad.some(line => /opção "c"/.test(line)));

    assert.throws(() => toDiscordCommand("Daily", { description: "x" }), /nome precisa/);
});

test("os 73 comandos e os 27 aliases do bot cabem nas regras do Discord (e nos 100 comandos)", async () => {
    const { resolverComando } = await import("../command-registry.mjs");

    let total = 0;
    const problems = [];

    for (const command of commands.values()) {
        total++;

        problems.push(...commandProblems(command.name, command));

        for (const alias of command.aliases ?? []) {
            total++;

            assert.equal(resolverComando(commands, alias)?.name, command.name);

            problems.push(...commandProblems(alias, command));
        }
    }

    assert.deepEqual(problems, []);
    assert.ok(total <= 100, `${total} comandos de barra (o Discord aceita 100)`);

    // e a conversão inteira funciona
    for (const command of commands.values()) {
        const out = toDiscordCommand(command.name, command);

        assert.equal(out.type, 1);
        assert.deepEqual(out.contexts, [0]);
    }
});

// ==========================================
// RESPOSTAS REAIS DOS COMANDOS
// ==========================================

const G = "g-discord-format";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };

test("respostas reais: embed, botões e menus de vários comandos passam nas regras do Discord", async () => {
    getPlayer(G, ME.id);
    set("UPDATE players SET wallet = 5000000, bank = 100000 WHERE guild_id = ? AND user_id = ?", G, ME.id);

    const run = await createPrefixRunner({ guildId: G, author: ME });

    const lines = [
        "hajuda", "hajuda categoria:combate", "hsaldo", "hloja", "hloja categoria:weapon", "hinventario",
        "hdaily", "htrabalhar", "hranking", "hmissoes", "hbolsa", "hcooldowns", "hjobs", "hconquistas", "htitulos",
        "henergia", "hgemas", "harmas", "hprocurados", "hlavagem-info", "hprisao", "husaritem", "hajuda comando:daily"
    ];

    let converted = 0;

    for (const line of lines) {
        const result = await run(line);

        for (const sent of result.sent) {
            const { json } = toDiscordMessage(sent);

            assert.deepEqual(discordProblems(json), [], `${line}: ${JSON.stringify(discordProblems(json))}`);

            converted++;
        }
    }

    assert.ok(converted >= lines.length - 3, `só ${converted} respostas convertidas`);
});

test("o layout V2 das telas também passa: contagem de componentes, sem content nem embed, ids únicos", async () => {
    const { buildShopHome, buildShopView } = await import("../services/panels/shop-view.mjs");
    const { buildBalance } = await import("../services/economy/balance-view.mjs");
    const { buildHelpHome } = await import("../services/panels/help-view.mjs");
    const { getCatalog } = await import("../services/platform/command-catalog.mjs");

    const views = [
        buildShopHome({ ownerId: ME.id, wallet: 1000, gems: 3 }),
        buildShopView({ ownerId: ME.id, category: "weapon", page: 2, wallet: 500000, gems: 1 }),
        buildBalance({ player: { wallet: 100, bank: 200, gems: 3, level: 2, xp: 10, dirty_money: 50 }, username: "Eu", avatarUrl: ME.avatarUrl, controls: [] }),
        buildHelpHome({ ownerId: ME.id, catalog: getCatalog() })
    ];

    for (const view of views) {
        const { json } = toDiscordMessage({ components: view.layout });

        assert.equal(json.flags & FLAGS.COMPONENTS_V2, FLAGS.COMPONENTS_V2);
        assert.deepEqual(discordProblems(json), []);
    }
});

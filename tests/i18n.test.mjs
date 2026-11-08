import { db } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Idiomas: a preferência de cada pessoa, a tradução das respostas na hora de enviar, o painel /config
// e a ligação com o transporte (services/platform/i18n.mjs, services/panels/config-panel.mjs).

const i18n = await import("../services/platform/i18n.mjs");
const { LANGUAGES, DEFAULT_LANG, isLang } = await import("../config/i18n.mjs");
const locale = await import("../config/locales/en-US.mjs");
const { buildConfigView, handleConfigClick } = await import("../services/panels/config-panel.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { createTransport } = await import("../services/discord/transport.mjs");
const { buildPingView } = await import("../services/panels/ping-panel.mjs");
const { carregarComandos } = await import("../command-registry.mjs");

const { translateText, localizeData, localizeResponse, getLang, setLang } = i18n;

const quietly = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

const comandos = await quietly(() => carregarComandos());

const ANA = "111111111111111111";
const BETO = "222222222222222222";

const reset = () => {
    db.exec("DELETE FROM user_settings");
    i18n.resetLangCache();
    i18n.clearMissingTranslations();
};

const deepFreeze = value => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);

        Object.values(value).forEach(deepFreeze);
    }

    return value;
};

// ==========================================
// O IDIOMA DE CADA PESSOA
// ==========================================

test("quem nunca escolheu fala português; sem ID também", () => {
    reset();

    assert.equal(DEFAULT_LANG, "pt-BR");
    assert.equal(getLang(ANA), "pt-BR");
    assert.equal(getLang(undefined), "pt-BR");
    assert.equal(getLang(null), "pt-BR");
    assert.equal(getLang(""), "pt-BR");
});

test("setLang grava para a conta, vale na hora e sobrevive a um cache vazio", () => {
    reset();

    assert.equal(setLang(ANA, "en-US"), "en-US");
    assert.equal(getLang(ANA), "en-US");
    assert.equal(getLang(BETO), "pt-BR", "cada pessoa tem o seu");

    i18n.resetLangCache();

    assert.equal(getLang(ANA), "en-US", "lido de novo do banco");
    assert.equal(db.prepare("SELECT lang FROM user_settings WHERE user_id = ?").get(ANA).lang, "en-US");

    setLang(ANA, "pt-BR");

    assert.equal(getLang(ANA), "pt-BR", "voltar também vale");
    assert.equal(db.prepare("SELECT COUNT(*) c FROM user_settings WHERE user_id = ?").get(ANA).c, 1, "uma linha por pessoa");
});

test("idioma inválido ou pessoa sem ID é erro, e o banco recusa um código estranho", () => {
    reset();

    assert.throws(() => setLang(ANA, "fr-FR"), /Idioma inválido/);
    assert.throws(() => setLang(ANA, undefined), /Idioma inválido/);
    assert.throws(() => setLang("", "en-US"), /Pessoa não identificada/);
    assert.throws(() => setLang(undefined, "en-US"), /Pessoa não identificada/);

    assert.throws(() => db.prepare("INSERT INTO user_settings (user_id, lang) VALUES (?, 'fr-FR')").run(ANA), /CHECK/);

    assert.equal(isLang("en-US"), true);
    assert.equal(isLang("pt-BR"), true);
    assert.equal(isLang("fr-FR"), false);
    assert.equal(isLang(undefined), false);

    assert.deepEqual(Object.keys(LANGUAGES), ["pt-BR", "en-US"]);
});

test("um valor estranho no banco volta ao padrão em vez de quebrar", () => {
    reset();

    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("INSERT INTO user_settings (user_id, lang) VALUES (?, 'xx-XX')").run(ANA);
    db.exec("PRAGMA ignore_check_constraints = OFF");

    assert.equal(getLang(ANA), "pt-BR");
});

// ==========================================
// TRADUZIR UM TEXTO
// ==========================================

const en = text => translateText(text, "en-US");

test("o português (o padrão) e textos sem letras passam sem mudança", () => {
    assert.equal(translateText("Carteira", "pt-BR"), "Carteira");
    assert.equal(translateText("Carteira", undefined), "Carteira", "sem idioma é o de origem");
    assert.equal(translateText("Carteira", "fr-FR"), "Carteira", "idioma sem dicionário também");
    assert.equal(translateText("", "en-US"), "");
    assert.equal(translateText(undefined, "en-US"), undefined);
    assert.equal(translateText(42, "en-US"), 42);
    assert.equal(en("💵 | 12 | 3,4%"), "💵 | 12 | 3,4%");
    assert.equal(en("https://helena.discloud.dev/wiki/"), "https://helena.discloud.dev/wiki/" , "um endereço não é traduzido");
});

test("texto inteiro, linha por linha e com formatação na frente", () => {
    assert.equal(en("🏓 Pong!"), "🏓 Pong!");
    assert.equal(en("🎁 Bônus diário"), "🎁 Daily bonus");
    assert.equal(en("Atualizar"), "Refresh");
    assert.equal(en("  Atualizar  "), "  Refresh  ", "os espaços das pontas ficam");

    // várias linhas: cada uma pelo seu caminho; o que não tem tradução continua em português
    assert.equal(
        en("Atualizar\nFechar\nUma frase que ninguém traduziu ainda"),
        "Refresh\nClose\nUma frase que ninguém traduziu ainda"
    );

    // formatação do Markdown no começo da linha
    assert.equal(en("## 🍽️ Usar item"), "## 🍽️ Use item");
    assert.equal(en("-# Atualizar"), "-# Refresh");
    assert.equal(en("> Atualizar"), "> Refresh");
    assert.equal(en("- Atualizar"), "- Refresh");
    assert.equal(en("### 📂 Escolha uma prateleira"), "### 📂 Choose a shelf");
});

test("a linha do recibo traduz a conta e o valor conhecido, e mantém o emoji e o número", () => {
    assert.equal(en("💵 | Pagamento: **+R$ 420,00**"), "💵 | Payment: **+R$ 420,00**");
    assert.equal(en("👛 | Carteira: **R$ 1.350,00**"), "👛 | Wallet: **R$ 1.350,00**");
    // o emoji do app volta ao comum antes de traduzir (o envio, em customize(), põe o da Helena de novo)
    assert.equal(en("<:h_wallet:123456789012345678> | Carteira: **R$ 1,00**"), "👛 | Wallet: **R$ 1,00**");
    assert.equal(en("🌐 | Status do Discord: **Tudo operacional**"), "🌐 | Discord status: **All systems operational**");
    assert.equal(en("🛰️ | Banco de dados: falhou"), "🛰️ | Database: failed");

    // conta que o dicionário não conhece: fica como está (e vira "falta traduzir")
    assert.equal(en("🔹 | Conta inventada: **1**"), "🔹 | Conta inventada: **1**");
});

test("o nome da seção em cima da resposta, sem diferença de maiúsculas", () => {
    assert.equal(en("HELENA · BANCO"), "HELENA · BANK");
    assert.equal(en("HELENA · CONFIGURAÇÕES"), "HELENA · SETTINGS");
    assert.equal(en("-# HELENA · ITENS"), "-# HELENA · ITEMS");
    assert.equal(en("HELENA · SEÇÃO QUE NÃO EXISTE"), "HELENA · SEÇÃO QUE NÃO EXISTE");
});

test("as frases com partes que mudam", () => {
    assert.equal(en("Próximo crime em 59m 30s"), "Next crime in 59m 30s");
    assert.equal(en("Próximo roubo em 1h 0m 0s"), "Next robbery in 1h 0m 0s");
    assert.equal(en("Próximo expediente em 20m"), "Next shift in 20m");
    assert.equal(en("Você já trabalha como **Entregador**."), "You already work as **Entregador**.");
    assert.equal(en("Volte em **3h 10min** para o próximo prêmio."), "Come back in **3h 10min** for the next prize.");
    assert.equal(en("Dia **3** de 7 da sua sequência."), "Day **3** of 7 of your streak.");
    assert.equal(en("🔥 **5 dias** seguidos · recorde de 12 dias"), "🔥 **5 days** in a row · record of 12 days");
    assert.equal(en("🔥 **1 dia** seguidos · recorde de 1 dia"), "🔥 **1 day** in a row · record of 1 day");
    assert.equal(en("Você assaltou **Maria** e fugiu com a grana. Metade veio limpa e metade é dinheiro sujo."),
        "You robbed **Maria** and ran off with the cash. Half came clean and half is dirty money.");
    assert.equal(en("🔫 <@200000000000000001>, você está armado: tem **30 segundos** para reagir."),
        "🔫 <@200000000000000001>, you are armed: you have **30 seconds** to react.");
    assert.equal(en("⏳ Vence 12h depois da compra"), "⏳ Expires 12h after purchase");
    assert.equal(en("vence em 3h 20min"), "expires in 3h 20min");
    assert.equal(en("🗑️ **Comida vencida** saiu da mochila: 2× ☕ Café."), "🗑️ **Expired food** left your bag: 2× ☕ Café.");
    assert.equal(en("🎒 Inventário de Ana"), "🎒 Ana's inventory");
    assert.equal(en("Página 2/5"), "Page 2/5");
    assert.equal(en("1/3 conectados"), "1/3 connected");
    assert.equal(en("950 ms (lento)"), "950 ms (slow)");
});

test("todo padrão do dicionário é [regex, função] e não quebra com um texto qualquer", () => {
    assert.ok(locale.PATTERNS.length > 10);

    for (const [pattern, build] of locale.PATTERNS) {
        assert.ok(pattern instanceof RegExp);
        assert.equal(typeof build, "function");
    }

    for (const sample of ["", "x", "a:b: c", "**", "💵 | : **x**", "Próximo crime em "]) {
        assert.doesNotThrow(() => en(sample), JSON.stringify(sample));
    }
});

test("o dicionário: toda tradução é um texto não vazio e nenhuma entrada traduz para si mesma por engano", () => {
    const same = [];

    for (const [from, to] of Object.entries(locale.EXACT)) {
        assert.equal(typeof to, "string", from);
        assert.ok(to.trim().length > 0, `tradução vazia: ${from}`);

        if (from === to) same.push(from);
    }

    // iguais nos dois idiomas só porque o nome é o mesmo (marca, nome de comando, nome do idioma)
    const allowed = new Set(["Admin", "Crime", "Daily", "Ranking", "Status", "Hospital", "Gozofone", "Arsenal", "Total", "🏓 Pong!", "🏆 Ranking", "🏥 Hospital", "Português (Brasil)", "English (US)"]);

    assert.deepEqual(same.filter(text => !allowed.has(text)), [], "entrada igual nos dois idiomas: tire ou ponha na lista acima");
});

// ==========================================
// O QUE FALTA TRADUZIR
// ==========================================

test("o texto sem tradução sai em português e entra na lista de pendências, uma vez só", () => {
    reset();

    assert.equal(en("Uma frase que ninguém traduziu ainda"), "Uma frase que ninguém traduziu ainda");
    assert.equal(en("Uma frase que ninguém traduziu ainda"), "Uma frase que ninguém traduziu ainda");
    assert.equal(en("Atualizar"), "Refresh", "o que tem tradução não é pendência");
    assert.equal(en("123 456"), "123 456", "só número não é pendência");

    assert.deepEqual(i18n.missingTranslations(), ["en-US\u0000Uma frase que ninguém traduziu ainda"]);

    i18n.clearMissingTranslations();

    assert.deepEqual(i18n.missingTranslations(), []);
});

test("HELENA_I18N_LOG=on escreve a pendência no log, uma vez", () => {
    reset();

    const logged = [];
    const original = console.log;

    console.log = line => logged.push(String(line));
    process.env.HELENA_I18N_LOG = "on";

    try {
        en("Frase nova para o log");
        en("Frase nova para o log");

    } finally {
        console.log = original;
        delete process.env.HELENA_I18N_LOG;
    }

    assert.deepEqual(logged, ['[I18N] sem tradução (en-US): "Frase nova para o log"']);

    reset();

    en("Outra frase sem o log ligado");

    assert.equal(i18n.missingTranslations().length, 1, "sem o log ligado, só a lista interna");
});

// ==========================================
// TRADUZIR UMA RESPOSTA
// ==========================================

const sample = () => ({
    body: "🔫 <@200000000000000001>, você está armado: tem **30 segundos** para reagir.",
    embeds: [{
        title: "🎁 Bônus diário",
        description: "Atualizar",
        color: 123,
        author: { name: "HELENA · BANCO", iconUrl: "https://x.test/i.png" },
        footer: { text: "Qualquer dúvida, é só chamar", iconUrl: "https://x.test/i.png" },
        fields: [{ name: "Carteira", value: "Atualizar", inline: true }],
        thumbnail: { url: "https://x.test/t.png" }
    }],
    components: [{
        type: "row",
        components: [
            { type: "button", customId: "ping:ref", label: "Atualizar", emoji: "🔄", style: "secondary" },
            { type: "button", style: "link", label: "Status do Discord", url: "https://discordstatus.com" },
            {
                type: "select",
                customId: "uso:sel:1",
                placeholder: "🍽️ Escolha um item para usar",
                options: [{ label: "Comer", value: "Comer", description: "Atualizar", emoji: "🍎" }]
            }
        ]
    }],
    layout: [{
        type: "container",
        components: [
            { type: "text", content: "-# HELENA · ITENS" },
            { type: "section", texts: ["Atualizar", "Fechar"], accessory: { type: "button", customId: "x", label: "Usar" } },
            { type: "thumbnail", url: "https://x.test/t.png", description: "Atualizar" }
        ]
    }]
});

test("localizeData traduz só o que a pessoa lê: corpo, embeds, botões, menus e o layout V2", () => {
    const out = localizeData(sample(), "en-US");

    assert.equal(out.body, "🔫 <@200000000000000001>, you are armed: you have **30 seconds** to react.");

    const [embed] = out.embeds;

    assert.equal(embed.title, "🎁 Daily bonus");
    assert.equal(embed.description, "Refresh");
    assert.equal(embed.author.name, "HELENA · BANK");
    assert.equal(embed.footer.text, "Any question, just ask");
    assert.deepEqual(embed.fields, [{ name: "Wallet", value: "Refresh", inline: true }]);

    // o que não é texto fica intocado
    assert.equal(embed.color, 123);
    assert.equal(embed.author.iconUrl, "https://x.test/i.png");
    assert.deepEqual(embed.thumbnail, { url: "https://x.test/t.png" });

    const [row] = out.components;
    const [refresh, link, select] = row.components;

    assert.equal(refresh.label, "Refresh");
    assert.equal(refresh.customId, "ping:ref", "o customId nunca é traduzido");
    assert.equal(refresh.emoji, "🔄");
    assert.equal(link.label, "Discord status");
    assert.equal(link.url, "https://discordstatus.com");
    assert.equal(select.placeholder, "🍽️ Choose an item to use");
    assert.deepEqual(select.options, [{ label: "Eat", value: "Comer", description: "Refresh", emoji: "🍎" }], "o value de uma opção é um ID: não muda");

    const [container] = out.layout;

    assert.equal(container.components[0].content, "-# HELENA · ITEMS");
    assert.deepEqual(container.components[1].texts, ["Refresh", "Close"]);
    assert.equal(container.components[1].accessory.label, "Use");
    assert.equal(container.components[1].accessory.customId, "x");
    assert.equal(container.components[2].description, "Refresh");
});

test("localizeData não mexe na resposta original (ela pode estar guardada em outro lugar)", () => {
    const original = deepFreeze(sample());

    const out = localizeData(original, "en-US");

    assert.notEqual(out, original);
    assert.equal(original.embeds[0].title, "🎁 Bônus diário");
    assert.equal(original.components[0].components[0].label, "Atualizar");
    assert.equal(original.layout[0].components[1].texts[0], "Atualizar");
});

test("em português a resposta volta a mesma, sem cópia", () => {
    const data = sample();

    assert.equal(localizeData(data, "pt-BR"), data);
    assert.equal(localizeData(data, undefined), data);
    assert.equal(localizeData(data, "fr-FR"), data);
    assert.equal(localizeData(undefined, "en-US"), undefined);
    assert.equal(localizeData(null, "en-US"), null);

    const response = { type: "message", data };

    assert.equal(localizeResponse(response, "pt-BR"), response);
    assert.equal(localizeResponse(undefined, "en-US"), undefined);
    assert.deepEqual(localizeResponse({ type: "defer_update" }, "en-US"), { type: "defer_update" }, "resposta sem data passa");
    assert.equal(localizeResponse({ type: "update", data }, "en-US").type, "update");
});

test("um formulário: o título, o rótulo e a dica traduzem; o que a pessoa digitou não", () => {
    const out = localizeData({
        customId: "uso:varios",
        title: "Usar vários itens",
        fields: [
            { customId: "item", label: "Item (nome ou ID)", placeholder: "Ex.: maçã ou café", value: "Atualizar", required: true }
        ]
    }, "en-US");

    assert.equal(out.title, "Use several items");
    assert.equal(out.fields[0].label, "Item (name or ID)");
    assert.equal(out.fields[0].placeholder, "e.g. apple or coffee");
    assert.equal(out.fields[0].value, "Atualizar", "o valor já preenchido é de quem digitou");
    assert.equal(out.fields[0].customId, "item");
    assert.equal(out.customId, "uso:varios");
});

// ==========================================
// O PAINEL /config
// ==========================================

const configClick = (userId, ownerId, lang) => ({
    id: "c1", guildId: "g", channelId: "c",
    user: { id: userId, username: "x", displayName: "X" },
    data: { customId: `cfg:set:${ownerId}:${lang}` }
});

test("o /config abre privado, com o idioma em uso marcado e um botão por idioma", async () => {
    reset();

    const response = await comandos.get("config").execute({ guildId: "g", channelId: "c", user: { id: ANA }, data: {} });

    assert.equal(response.type, "message");
    assert.equal(response.data.ephemeral, true, "painel pessoal: só quem abriu vê");

    const [pt, en] = response.data.components[0].components;

    assert.equal(pt.customId, `cfg:set:${ANA}:pt-BR`);
    assert.equal(pt.label, "Português (Brasil)");
    assert.equal(pt.disabled, true, "o idioma em uso fica desligado");
    assert.equal(pt.style, "success");

    assert.equal(en.customId, `cfg:set:${ANA}:en-US`);
    assert.equal(en.label, "English (US)");
    assert.equal(en.disabled, false);

    assert.match(response.data.embeds[0].description, /Idioma atual: \*\*🇧🇷 Português \(Brasil\)\*\*/);
});

test("trocar para o inglês grava, atualiza a mesma mensagem e já responde no idioma novo", async () => {
    reset();

    const click = handlePanelClick(configClick(ANA, ANA, "en-US"));

    assert.equal(click.type, "update");
    assert.equal(getLang(ANA), "en-US");

    // o que o transporte envia: o painel traduzido
    const sent = localizeResponse(click, getLang(ANA));

    const description = sent.data.embeds[0].description;

    assert.match(description, /Helena's language for you: English \(US\)/);
    assert.match(description, /Pick the language Helena uses with you\./);
    assert.match(description, /Current language: \*\*🇺🇸 English \(US\)\*\*/);
    assert.match(description, /It applies to you in every server\./);
    assert.equal(sent.data.embeds[0].title, "⚙️ Settings");

    const [pt, en] = sent.data.components[0].components;

    assert.equal(pt.disabled, false, "o português fica livre para voltar");
    assert.equal(en.disabled, true);
    assert.equal(pt.label, "Português (Brasil)", "o nome do idioma fica na língua dele");

    // e voltar
    const back = handlePanelClick(configClick(ANA, ANA, "pt-BR"));

    assert.equal(getLang(ANA), "pt-BR");
    assert.match(back.data.embeds[0].description, /Idioma da Helena para você: Português \(Brasil\)/);
});

test("só o dono do painel troca o idioma; botão estranho e idioma inventado são recusados", () => {
    reset();

    const other = handlePanelClick(configClick(BETO, ANA, "en-US"));

    assert.equal(other.data.ephemeral, true);
    assert.equal(other.data.embeds[0].title, "⚠️ Esse painel é de outra pessoa");
    assert.equal(getLang(ANA), "pt-BR", "ninguém troca o idioma de outra pessoa");
    assert.equal(getLang(BETO), "pt-BR");

    const invented = handleConfigClick(configClick(ANA, ANA, "fr-FR"));

    assert.equal(invented.data.ephemeral, true);
    assert.equal(invented.data.embeds[0].title, "⚠️ Botão desconhecido");

    const odd = handleConfigClick({ ...configClick(ANA, ANA, "en-US"), data: { customId: `cfg:outra:${ANA}:en-US` } });

    assert.equal(odd.data.ephemeral, true);
    assert.equal(getLang(ANA), "pt-BR");
});

test("o painel do /config e o do /ping não deixam nada sem tradução no inglês", async () => {
    reset();

    const view = buildConfigView({ ownerId: ANA, userId: ANA });

    const config = { type: "message", data: { embeds: [view.embed], components: view.components } };

    localizeResponse(config, "en-US");

    const ping = await buildPingView({ id: "x" });

    localizeResponse({ type: "message", data: { embeds: [ping.embed], components: ping.components } }, "en-US");

    assert.deepEqual(i18n.missingTranslations(), [], "texto do painel sem tradução: ponha em config/locales/en-US.mjs");
});

test("o /config está nos comandos, na ajuda e cabe nos 100 comandos de barra", () => {
    assert.ok(comandos.has("config"));
    assert.equal(comandos.get("config").description.length <= 100, true);

    const slash = [...comandos.values()].reduce((total, command) => total + 1 + (command.aliases?.length ?? 0), 0);

    assert.ok(slash <= 100, `${slash} comandos de barra`);
});

// ==========================================
// O TRANSPORTE
// ==========================================

function fakeApi() {
    const calls = [];

    return {
        calls,
        respond: async (id, token, body) => { calls.push(["respond", id, body.json]); },
        editOriginal: async (appId, token, body) => { calls.push(["editOriginal", body.json]); },
        edit: async (channelId, messageId, body) => { calls.push(["edit", channelId, messageId, body.json]); },
        send: async (channelId, body) => { calls.push(["send", channelId, body.json]); return { id: "m" }; }
    };
}

const message = { type: "message", data: { embeds: [{ title: "🎁 Bônus diário", description: "Atualizar" }] } };

test("o transporte responde no idioma de quem usou: inglês para um, português para outro", async () => {
    reset();

    setLang(ANA, "en-US");

    const api = fakeApi();

    const transport = createTransport(api, "app");

    const post = interaction => transport.callbackFor(interaction)(message);

    assert.equal((await post({ id: "i1", token: "t", user: { id: ANA } })).ok, true);
    assert.equal((await post({ id: "i2", token: "t", user: { id: BETO } })).ok, true);
    assert.equal((await post({ id: "i3", token: "t" })).ok, true, "sem pessoa identificada: português");

    const titles = api.calls.map(call => call[2].data.embeds[0].title);

    assert.deepEqual(titles, ["🎁 Daily bonus", "🎁 Bônus diário", "🎁 Bônus diário"]);
});

test("o transporte traduz também a edição da resposta e a mensagem ao canal, e deixa a mensagem sem pessoa em português", async () => {
    reset();

    setLang(ANA, "en-US");

    const api = fakeApi();

    const transport = createTransport(api, "app");

    await transport.editOriginal({ token: "t", user: { id: ANA } }, message.data);
    await transport.send({ channelId: "c1", user: { id: ANA } }, message.data);
    await transport.send({ channelId: "c1" }, message.data);
    await transport.editMessage({ channelId: "c1", user: { id: ANA } }, "m1", message.data);

    const titles = api.calls.map(call => call.at(-1).embeds[0].title);

    assert.deepEqual(titles, ["🎁 Daily bonus", "🎁 Daily bonus", "🎁 Bônus diário", "🎁 Daily bonus"]);
});

// O prefixo h entrega a mensagem do canal: a pessoa vem em "author" (não em "user", como na interação).
// O idioma só valia para a interação, e hwork, hsaldo... saíam sempre em português.
test("langOf acha a pessoa na interação (user) e na mensagem do prefixo (author)", () => {
    reset();

    setLang(ANA, "en-US");

    assert.equal(i18n.langOf({ user: { id: ANA } }), "en-US");
    assert.equal(i18n.langOf({ author: { id: ANA } }), "en-US");
    assert.equal(i18n.langOf({ author: { id: BETO } }), "pt-BR");
    assert.equal(i18n.langOf({ channelId: "c1" }), "pt-BR", "sem pessoa: português");
    assert.equal(i18n.langOf(null), "pt-BR");
});

test("o comando pelo prefixo h (mensagem do canal) responde no idioma de quem escreveu", async () => {
    reset();

    setLang(ANA, "en-US");

    const api = fakeApi();

    const transport = createTransport(api, "app");

    const raw = id => ({
        id,
        guild_id: "g1",
        channel_id: "c1",
        content: "hconfig",
        author: { id: ANA, username: "ana", global_name: "Ana" }
    });

    const { normalizeMessage } = await import("../services/discord/normalize.mjs");
    const { processarPrefixo } = await import("../services/platform/prefix.mjs");

    const rodar = async mensagem => processarPrefixo({
        message: mensagem,
        comandos,
        send: (alvo, dados) => transport.send(alvo, dados),
        edit: (alvo, id, dados) => transport.editMessage(alvo, id, dados),
        gate: { check: () => ({ allowed: true }) }
    });

    assert.equal(await rodar(normalizeMessage(raw("m1"))), true);

    // quem nunca escolheu o inglês continua em português
    const outra = raw("m2");
    outra.author = { id: BETO, username: "beto", global_name: "Beto" };

    assert.equal(await rodar(normalizeMessage(outra)), true);

    const titles = api.calls.filter(call => call[0] === "send").map(call => call[2].embeds[0].title);

    assert.equal(titles.length, 2);
    assert.match(titles[0], /Settings/, titles[0]);
    assert.match(titles[1], /Configurações/, titles[1]);
});

// O aviso de que a lavagem terminou não responde a um comando: o bot o manda ao canal, e só sabe o idioma se
// o alvo do envio levar a pessoa (helena.mjs passa { user: { id } }).
test("o aviso da lavagem concluída sai no idioma da pessoa que lavou", async () => {
    reset();

    setLang(ANA, "en-US");

    const api = fakeApi();

    const transport = createTransport(api, "app");

    const body = `💸 <@${ANA}> sua lavagem terminou! **+R$ 800,00** já estão na sua carteira.`;

    await transport.send({ guildId: "g1", channelId: "c9", user: { id: ANA } }, { body });
    await transport.send({ guildId: "g1", channelId: "c9", user: { id: BETO } }, { body });

    assert.equal(api.calls[0][2].content, `💸 <@${ANA}>, your laundering is done! **+R$ 800,00** is already in your wallet.`);
    assert.equal(api.calls[1][2].content, body, "quem não escolheu o inglês continua em português");
});

test("o helena.mjs manda o aviso da lavagem com a pessoa no alvo do envio", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    assert.match(source, /\{ guildId, channelId, user: \{ id: userId \} \}/);
});

test("a resposta original do comando não muda depois de enviada em inglês", async () => {
    reset();

    setLang(ANA, "en-US");

    const original = deepFreeze({ type: "message", data: { embeds: [{ title: "🎁 Bônus diário", description: "Atualizar" }] } });

    const transport = createTransport(fakeApi(), "app");

    const sent = await transport.callbackFor({ id: "i", token: "t", user: { id: ANA } })(original);

    assert.equal(sent.ok, true, "uma resposta congelada também passa");
    assert.equal(original.data.embeds[0].title, "🎁 Bônus diário");
});

// ==========================================
// FRASES COM PARTES QUE MUDAM, NOMES E LINHAS COMPOSTAS
// ==========================================

const { tpl, nameOf } = await import("../config/locales/template.mjs");

test("tpl: {n} só casa número, {u} só menção e {m} só dinheiro; o resto da frase tem de bater inteiro", () => {
    const [number] = tpl("Faltam {n} dias", "x");
    const [mention] = tpl("Oi {u}!", "x");
    const [money] = tpl("Custa {m}", "x");

    assert.ok(number.test("Faltam 12 dias"));
    assert.ok(!number.test("Faltam muitos dias"));
    assert.ok(mention.test("Oi <@123456789012345678>!"));
    assert.ok(mention.test("Oi <@!123456789012345678>!"));
    assert.ok(!mention.test("Oi Ana!"));
    assert.ok(money.test("Custa R$ 1.234,50"));
    assert.ok(money.test("Custa R$ 12,3k"));
    assert.ok(!money.test("Custa muito"));
});

test("uma frase de poucas palavras não engole outra maior que começa igual (o 'Você pagou' que traduzia pela metade)", () => {
    reset();

    // a frase certa
    assert.equal(en("Você pagou <@123456789012345678>."), "You paid <@123456789012345678>.");

    // outra que começa igual: tem a sua própria tradução, inteira
    assert.equal(
        en("Você pagou **10 gemas** e agora pode usar a lavanderia privada neste servidor."),
        "You paid **10 gems** and can now use the private laundromat in this server."
    );

    // e uma frase que ninguém traduziu nunca sai meio inglês, meio português
    assert.equal(en("Você pagou uma coisa qualquer que não existe."), "Você pagou uma coisa qualquer que não existe.");
    assert.deepEqual(i18n.missingTranslations(), ["en-US\u0000Você pagou uma coisa qualquer que não existe."]);
});

test("tpl: {x:t} traduz a parte capturada com o dicionário todo, e a parte desconhecida vira pendência", () => {
    reset();

    assert.equal(en("✅ **Lavagem:** Pronto para uso"), "✅ **Laundering:** Ready to use");

    assert.equal(en("⏳ **Rótulo que ninguém traduziu:** 5m 0s"), "⏳ **Rótulo que ninguém traduziu:** 5m 0s");

    assert.ok(i18n.missingTranslations().includes("en-US\u0000Rótulo que ninguém traduziu"), "só o rótulo é pendência");
});

test("tpl: a tradução pode ser uma função (plural) e os nomes de itens entram traduzidos", () => {
    assert.equal(en("1 item"), "1 item");
    assert.equal(en("20 itens"), "20 items");
    assert.equal(en("1 unidade"), "1 unit");
    assert.equal(en("3 unidades"), "3 units");
    assert.equal(en("1 nível"), "1 level");
    assert.equal(en("10 níveis"), "10 levels");

    assert.equal(nameOf("Maçã"), "Apple");
    assert.equal(nameOf("🍎 Maçã"), "🍎 Apple");
    assert.equal(nameOf("Ninguém"), "Ninguém");

    assert.equal(en("☕ **Café** já está no seu inventário."), "☕ **Coffee** is already in your inventory.");
});

test("a linha com pedaços: nomes e preços, contagem entre parênteses e separadores traduzem pedaço por pedaço", () => {
    reset();

    assert.equal(en("**☕ Café** · **R$ 7,00**"), "**☕ Coffee** · **R$ 7,00**");
    assert.equal(en("⚔️ Armas (14)"), "⚔️ Weapons (14)");
    assert.equal(en("20 itens · página 1/4"), "20 items · page 1/4");
    assert.equal(en("🥇 **Ana** · Você — Nível 11 • 6045 XP"), "🥇 **Ana** · You — Level 11 • 6045 XP");

    assert.deepEqual(i18n.missingTranslations().filter(entry => !/Ana/.test(entry)), [], "nada ficou pendente");
});

test("na linha composta, só o pedaço sem tradução vira pendência, e o resto sai traduzido", () => {
    reset();

    assert.equal(
        en("20 itens · uma frase nunca vista · página 1/4"),
        "20 items · uma frase nunca vista · page 1/4"
    );

    assert.deepEqual(i18n.missingTranslations(), ["en-US\u0000uma frase nunca vista"]);
});

test("o que não é texto passa em branco: comandos, código, menções, endereços, XP e números", () => {
    reset();

    for (const neutral of [
        "/saldo",
        "**/aceitarcasamento** (/help, /comandos)",
        "`first_steps`",
        "<@123456789012345678>",
        "<t:1794145856:R>",
        "https://helena.discloud.dev/wiki/",
        "12.140 XP",
        "id `apple`",
        "R$ 1.200,00/min",
        "123 456",
        "🥇"
    ]) {
        assert.equal(en(neutral), neutral);
    }

    assert.deepEqual(i18n.missingTranslations(), []);
});

test("as palavras iguais nos dois idiomas não são pendência, nem como conta do recibo", () => {
    reset();

    assert.equal(en("Legal"), "Legal");
    assert.equal(en("🦹 | Crimes: **1**"), "🦹 | Crimes: **1**");
    assert.equal(en("⚖️ Legal"), "⚖️ Legal");

    assert.deepEqual(i18n.missingTranslations(), []);
});

test("o valor do recibo também traduz: durações, unidades e padrões", () => {
    reset();

    assert.equal(en("⚡ | Regeneração: **+1 a cada 5m 0s**"), "⚡ | Regeneration: **+1 every 5m 0s**");
    assert.equal(en("🛡️ | Defesa: **10 pontos**"), "🛡️ | Defense: **10 points**");
    assert.equal(en("💎 | Bônus: **+1 gemas**"), "💎 | Bonus: **+1 gems**");

    // a conta que ninguém traduziu vira pendência (uma só, não uma por valor)
    en("🔹 | Conta inventada: **R$ 1,00**");
    en("🔹 | Conta inventada: **R$ 2,00**");

    assert.deepEqual(i18n.missingTranslations(), ["en-US\u0000Conta inventada"]);
});

// ==========================================
// OS EMOJIS DO APLICATIVO NO TEXTO
// ==========================================

// Em produção, icon() escreve "<:h_stopwatch:123>" no lugar de "⏱️" (os emojis do app estão carregados). O
// dicionário é escrito com o emoji comum: o título do /cooldowns saía em português por isso.
const { plainEmojis, setAppEmojis, customize } = await import("../services/platform/app-emojis.mjs");

test("plainEmojis: o emoji do app volta ao comum; o que não é da Helena fica como está", () => {
    assert.equal(plainEmojis("<:h_stopwatch:123456789012345678> Tempos"), "⏱️ Tempos");
    assert.equal(plainEmojis("<a:h_stopwatch:123456789012345678> Tempos"), "⏱️ Tempos");
    assert.equal(plainEmojis("<:h_ready:1234567890123> e <:h_cross:99999999999>"), "✅ e ❌", "o primeiro da lista de parecidos");
    assert.equal(plainEmojis("<:outro_emoji:123456789012345678>"), "<:outro_emoji:123456789012345678>");
    assert.equal(plainEmojis("<:h_naoexiste:123456789012345678>"), "<:h_naoexiste:123456789012345678>");
    assert.equal(plainEmojis("<@123456789012345678>"), "<@123456789012345678>");
    assert.equal(plainEmojis("sem emoji"), "sem emoji");
    assert.equal(plainEmojis(null), null);
});

test("o texto com emoji do app traduz como o texto com emoji comum (o título do /cooldowns do print)", () => {
    reset();

    assert.equal(en("<:h_stopwatch:700000000000000100> Tempos de recarga"), "⏱️ Cooldowns");
    assert.equal(en("<:h_illegal:700000000000000000> Ilegal"), "🦹 Illegal");
    assert.equal(en("<:h_legal:700000000000000001> Legal"), "⚖️ Legal");
    assert.equal(en("## <:h_stopwatch:700000000000000100> Tempos de recarga"), "## ⏱️ Cooldowns");

    assert.deepEqual(i18n.missingTranslations(), []);
});

test("o dicionário vale com outro emoji na frente do mesmo texto (o código usa um parecido da lista)", () => {
    reset();

    // a chave do dicionário é "⏱️ Tempos de recarga"; o emoji que o código escreveu pode ser outro
    assert.equal(en("🕐 Tempos de recarga"), "🕐 Cooldowns");
    assert.equal(en("Tempos de recarga"), "Cooldowns");
    assert.equal(en("🦸 Ilegal"), "🦸 Illegal");

    assert.deepEqual(i18n.missingTranslations(), []);
});

test("depois de traduzido, o envio põe de volta os emojis da Helena (customize)", () => {
    reset();

    setAppEmojis([{ id: "700000000000000100", name: "h_stopwatch", animated: false }]);

    try {
        const sent = customize(en("<:h_stopwatch:700000000000000100> Tempos de recarga"));

        assert.equal(sent, "<:h_stopwatch:700000000000000100> Cooldowns");

    } finally {
        setAppEmojis([]);
    }
});

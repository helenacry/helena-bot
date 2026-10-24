import {
    db, getPlayer, set, get, createPrefixRunner, discordMember, discordGuildFetch
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { textField, openModal, readFields } = await import("../services/panels/modals.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../services/panels/panels.mjs");
const { carregarComandos } = await import("../command-registry.mjs");
const { imprison } = await import("../services/crime/prison.mjs");
const { clearUserLookupCache } = await import("../services/platform/user-lookup.mjs");

const G = "900000000000000001";
const ME = "111111111111111111";
const MARIA = "200000000000000001";

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

// ==========================================
// API SIMULADA (busca de destinatário)
// ==========================================

const MEMBERS = [
    discordMember(ME, "eu", "Eu Mesmo"),
    discordMember(MARIA, "maria", "Maria Silva"),
    discordMember("200000000000000009", "helena", "Helena", null, true)
];

globalThis.fetch = discordGuildFetch(MEMBERS);

// ==========================================
// FERRAMENTAS
// ==========================================

let sequence = 0;

const user = id => ({ id, username: "eu", displayName: "Eu Mesmo" });

const click = (customId, userId = ME) => ({
    id: "c" + (++sequence), guildId: G, channelId: "c1",
    user: user(userId), data: { customId }
});

// O envio do modal: valores em lista (formato mais provável) ou objeto.
const submit = (customId, fields, shape = "array", userId = ME) => ({
    id: "s" + (++sequence), guildId: G, channelId: "c1", user: user(userId),
    data: {
        customId,
        fields: shape === "array"
            ? Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
            : fields
    }
});

const send = (interaction) =>
    silently(() => handleModalSubmit(interaction, comandos));

const fieldIds = response => response.data.fields.map(f => f.customId);

const money = () => ({ ...get("SELECT wallet, bank FROM players WHERE guild_id=? AND user_id=?", G, ME) });

function reset() {
    clearUserLookupCache();

    for (const table of [
        "players", "combat_players", "combat_gear", "inventory", "equipped_items",
        "crime_players", "prison_players", "laundering_jobs", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    db.exec("DELETE FROM global_users");

    getPlayer(G, ME);
    getPlayer(G, MARIA);
}

const titleOf = response => response.data.embeds?.[0]?.title ?? "";
const textOf = response => JSON.stringify(response.data);

// ==========================================
// CONSTRUTORES E LEITURA
// ==========================================

test("textField e openModal validam os limites do Discord", () => {
    assert.throws(() => textField({ id: "a", label: "x".repeat(46) }), /Rótulo/);
    assert.throws(() => textField({ id: "a", label: "ok", style: "gigante" }), /Estilo/);
    assert.throws(() => textField({ id: "a", label: "ok", placeholder: "x".repeat(101) }), /placeholder/);
    assert.throws(() => textField({ id: "a", label: "ok", maxLength: 401 }), /maxLength/);
    assert.doesNotThrow(() => textField({ id: "a", label: "ok", style: "paragraph", maxLength: 4000 }));
    assert.throws(() => textField({ id: "a", label: "ok", maxLength: 3, value: "abcd" }), /valor inicial/);

    const field = id => textField({ id, label: "campo" });

    assert.throws(() => openModal({ customId: "m", title: "x".repeat(46), fields: [field("a")] }), /Título/);
    assert.throws(() => openModal({ customId: "m", title: "ok", fields: [] }), /1 a 5/);
    assert.throws(() => openModal({ customId: "m", title: "ok", fields: "abcdef".split("").map(field) }), /1 a 5/);
    assert.throws(() => openModal({ customId: "m", title: "ok", fields: [field("a"), field("a")] }), /repetir/);

    // o customId do modal tem o mesmo teto (1 a 100) que o dos campos
    assert.throws(() => openModal({ customId: "", title: "ok", fields: [field("a")] }), /customId do modal/);
    assert.throws(() => openModal({ customId: "m".repeat(101), title: "ok", fields: [field("a")] }), /customId do modal/);
    assert.doesNotThrow(() => openModal({ customId: "m".repeat(100), title: "ok", fields: [field("a")] }));

    const modal = openModal({ customId: "m", title: "ok", fields: [field("a")] });

    assert.equal(modal.type, "modal");
    assert.equal(modal.data.customId, "m");
});

test("readFields aceita lista, objeto e listas aninhadas", () => {
    const expected = { a: "um", b: "dois" };

    assert.deepEqual(
        readFields({ data: { fields: [{ customId: "a", value: "um" }, { customId: "b", value: "dois" }] } }),
        expected
    );

    assert.deepEqual(readFields({ data: { fields: { a: "um", b: { value: "dois" } } } }), expected);

    assert.deepEqual(
        readFields({ data: { fields: [{ components: [{ customId: "a", value: "um" }] }, { id: "b", value: "dois" }] } }),
        expected
    );

    assert.deepEqual(readFields({ data: {} }), {});
    assert.deepEqual(readFields({ data: { fields: [{ customId: "a" }] } }), { a: "" });
});

// ==========================================
// CLIQUES: ABREM O MODAL CERTO
// ==========================================

test("banco: cada botão abre o modal certo", () => {
    reset();

    const dep = handlePanelClick(click(`banco:dep:${ME}`));
    assert.equal(dep.type, "modal");
    assert.equal(dep.data.customId, "banco:dep");
    assert.deepEqual(fieldIds(dep), ["quantia"]);

    assert.equal(handlePanelClick(click(`banco:sac:${ME}`)).data.customId, "banco:sac");

    const trf = handlePanelClick(click(`banco:trf:${ME}`));
    assert.deepEqual(fieldIds(trf), ["destinatario", "quantia"]);
});

test("lavagem: pública, privada e a confirmação da liberação", () => {
    reset();

    assert.equal(handlePanelClick(click(`lavagem:publica:${ME}`)).data.customId, "lavagem:publica");
    assert.equal(handlePanelClick(click(`lavagem:privada:${ME}`)).data.customId, "lavagem:privada");

    const unlock = handlePanelClick(click(`lavagem:liberar:${ME}`));

    assert.equal(unlock.data.customId, "lavagem:liberar");
    assert.deepEqual(fieldIds(unlock), ["confirmacao"]);
    assert.match(unlock.data.fields[0].label, /LIBERAR/);
});

test("bio: o modal abre com a bio atual preenchida e campo de parágrafo", () => {
    reset();
    set("UPDATE players SET bio = 'Minha bio antiga' WHERE guild_id=? AND user_id=?", G, ME);

    const modal = handlePanelClick(click(`bio:editar:${ME}`));
    const [field] = modal.data.fields;

    assert.equal(field.style, "paragraph");
    assert.equal(field.value, "Minha bio antiga");
    assert.equal(field.maxLength, 160);
});

test("bio sem texto salvo abre o modal vazio", () => {
    reset();

    const [field] = handlePanelClick(click(`bio:editar:${ME}`)).data.fields;

    assert.equal("value" in field, false);
});

test("loja: o modal pede item e quantidade (opcional)", () => {
    const modal = handlePanelClick(click("loja:comprar"));

    assert.deepEqual(fieldIds(modal), ["item", "quantidade"]);
    assert.equal(modal.data.fields[1].required, false);
    assert.equal(modal.data.fields[1].value, "1");
});

test("os botões pessoais só funcionam para o dono do painel", () => {
    reset();

    for (const id of [`banco:dep:${ME}`, `lavagem:publica:${ME}`, `bio:editar:${ME}`]) {
        const response = handlePanelClick(click(id, MARIA));

        assert.equal(response.type, "message");
        assert.equal(response.data.ephemeral, true);
        assert.match(titleOf(response), /de outra pessoa/);
    }

    // a loja é de todos: cada um compra para si
    assert.equal(handlePanelClick(click("loja:comprar", MARIA)).type, "modal");
});

test("botões de outras áreas passam adiante; ação desconhecida avisa", () => {
    assert.equal(handlePanelClick(click("fuga:iniciar:x")), null);
    assert.equal(handlePanelClick(click("userinfo:back:x")), null);

    reset();

    const response = handlePanelClick(click(`banco:xyz:${ME}`));

    assert.equal(response.data.ephemeral, true);
    assert.match(titleOf(response), /desconhecido/);
});

// ==========================================
// ENVIO: BANCO
// ==========================================

test("banco: depositar e sacar pelo modal, inclusive tudo/all", async () => {
    reset();
    set("UPDATE players SET wallet = 50000, bank = 0 WHERE guild_id=? AND user_id=?", G, ME);

    let response = await send(submit("banco:dep", { quantia: "200" }));
    assert.equal(response.data.ephemeral, true, "resultado privado");
    assert.deepEqual(money(), { wallet: 30000, bank: 20000 });

    await send(submit("banco:dep", { quantia: "all" }));
    assert.deepEqual(money(), { wallet: 0, bank: 50000 });

    await send(submit("banco:sac", { quantia: "tudo" }));
    assert.deepEqual(money(), { wallet: 50000, bank: 0 });

    // formato alternativo: valores em objeto
    await send(submit("banco:dep", { quantia: "100" }, "object"));
    assert.deepEqual(money(), { wallet: 40000, bank: 10000 });
});

test("banco: quantia vazia ou inválida não mexe no dinheiro", async () => {
    reset();
    set("UPDATE players SET wallet = 50000 WHERE guild_id=? AND user_id=?", G, ME);

    assert.match(titleOf(await send(submit("banco:dep", { quantia: "  " }))), /Faltou a quantia/);

    await send(submit("banco:dep", { quantia: "abc" }));
    await send(submit("banco:dep", { quantia: "-5" }));

    assert.deepEqual(money(), { wallet: 50000, bank: 0 });
});

test("banco: transferir acha o destinatário por nome e é público", async () => {
    reset();
    set("UPDATE players SET wallet = 50000 WHERE guild_id=? AND user_id=?", G, ME);

    const response = await send(submit("banco:trf", { destinatario: "maria", quantia: "100" }));

    assert.notEqual(response.data.ephemeral, true, "quem recebe precisa ver");
    assert.equal(money().wallet, 40000);
    assert.equal(get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G, MARIA).w, 10000);

    // por menção também
    await send(submit("banco:trf", { destinatario: `<@${MARIA}>`, quantia: "50" }));
    assert.equal(money().wallet, 35000);
});

test("banco: destinatário inexistente, bot ou vazio não transfere", async () => {
    reset();
    set("UPDATE players SET wallet = 50000 WHERE guild_id=? AND user_id=?", G, ME);

    assert.match(titleOf(await send(submit("banco:trf", { destinatario: "ninguem", quantia: "10" }))), /não encontrado/);
    assert.match(titleOf(await send(submit("banco:trf", { destinatario: "helena", quantia: "10" }))), /inválido/);
    assert.match(titleOf(await send(submit("banco:trf", { destinatario: "", quantia: "10" }))), /Faltou o destinatário/);

    assert.equal(money().wallet, 50000);
});

test("preso, o envio do modal também é bloqueado", async () => {
    reset();
    set("UPDATE players SET wallet = 50000 WHERE guild_id=? AND user_id=?", G, ME);

    imprison(G, ME, 1800, "teste", Math.floor(Date.now() / 1000));

    const response = await send(submit("banco:dep", { quantia: "100" }));

    assert.match(titleOf(response), /Você está preso/);
    assert.equal(response.data.ephemeral, true);
    assert.deepEqual(money(), { wallet: 50000, bank: 0 });
});

// ==========================================
// ENVIO: LAVAGEM
// ==========================================

test("lavagem: o modal inicia uma lavagem pública", async () => {
    reset();
    set("UPDATE players SET dirty_money = 500000, energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, ME);

    const response = await send(submit("lavagem:publica", { valor: "5000" }));

    assert.match(titleOf(response), /Lavagem iniciada/);
    assert.equal(get("SELECT kind, amount FROM laundering_jobs").kind, "public");
    assert.equal(get("SELECT amount a FROM laundering_jobs").a, 500000);
});

test("lavagem: privada bloqueada avisa; liberar exige digitar LIBERAR", async () => {
    reset();
    set("UPDATE players SET dirty_money = 500000, energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, ME);

    assert.match(titleOf(await send(submit("lavagem:privada", { valor: "5000" }))), /privada bloqueada/);

    // confirmação errada: nada é cobrado
    set("INSERT INTO global_users (user_id, gems) VALUES (?, 10) ON CONFLICT(user_id) DO UPDATE SET gems = 10", ME);

    assert.match(titleOf(await send(submit("lavagem:liberar", { confirmacao: "talvez" }))), /Confirmação incorreta/);
    assert.equal(get("SELECT gems g FROM global_users WHERE user_id=?", ME).g, 10);

    // confirmação certa (sem diferenciar maiúsculas): cobra as gemas
    const ok = await send(submit("lavagem:liberar", { confirmacao: " liberar " }));

    assert.match(titleOf(ok), /privada liberada/);
    assert.equal(get("SELECT gems g FROM global_users WHERE user_id=?", ME).g, 0);

    const response = await send(submit("lavagem:privada", { valor: "all" }));

    assert.match(titleOf(response), /Lavagem iniciada/);
});

test("lavagem: valor vazio avisa", async () => {
    reset();

    assert.match(titleOf(await send(submit("lavagem:publica", { valor: "" }))), /Faltou o valor/);
});

// ==========================================
// ENVIO: BIO
// ==========================================

test("bio: salva pelo modal e respeita as regras do comando", async () => {
    reset();

    const response = await send(submit("bio:editar", { texto: "  Gosto de café  " }));

    assert.match(titleOf(response), /Bio atualizada/);
    assert.equal(get("SELECT bio FROM players WHERE guild_id=? AND user_id=?", G, ME).bio, "Gosto de café");

    // vazia e longa demais: o comando recusa
    await send(submit("bio:editar", { texto: "   " }));
    await send(submit("bio:editar", { texto: "x".repeat(161) }));

    assert.equal(get("SELECT bio FROM players WHERE guild_id=? AND user_id=?", G, ME).bio, "Gosto de café");
});

// ==========================================
// ENVIO: LOJA
// ==========================================

const bought = itemId =>
    get("SELECT quantity q FROM inventory WHERE guild_id=? AND user_id=? AND item_id=?", G, ME, itemId)?.q ?? 0;

test("loja: compra por nome, sem acento e pelo ID", async () => {
    reset();
    set("UPDATE players SET wallet = 1000000 WHERE guild_id=? AND user_id=?", G, ME);

    await send(submit("loja:comprar", { item: "Caixa misteriosa", quantidade: "2" }));
    assert.equal(bought("mystery_box"), 2);

    await send(submit("loja:comprar", { item: "maca", quantidade: "3" }));
    assert.equal(bought("apple"), 3, "sem acento acha Maçã");

    await send(submit("loja:comprar", { item: "REVOLVER", quantidade: "" }));
    assert.equal(bought("revolver"), 1, "pelo ID, e quantidade vazia = 1");

    await send(submit("loja:comprar", { item: "Espada de ferro" }));
    assert.equal(bought("iron_sword"), 1, "nome completo");
});

test("loja: item inexistente, ambíguo e quantidade inválida não compram", async () => {
    reset();
    set("UPDATE players SET wallet = 1000000 WHERE guild_id=? AND user_id=?", G, ME);

    assert.match(titleOf(await send(submit("loja:comprar", { item: "xyzzy" }))), /Item não encontrado/);

    const ambiguous = await send(submit("loja:comprar", { item: "espada" }));
    assert.match(titleOf(ambiguous), /Mais de um item/);
    assert.match(textOf(ambiguous), /Espada de madeira/);
    assert.match(textOf(ambiguous), /Espada de ferro/);

    assert.match(titleOf(await send(submit("loja:comprar", { item: "maca", quantidade: "abc" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("loja:comprar", { item: "maca", quantidade: "0" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("loja:comprar", { item: "maca", quantidade: "100" }))), /Quantidade inválida/);

    assert.match(titleOf(await send(submit("loja:comprar", { item: "" }))), /Faltou o item/);

    assert.equal(get("SELECT COUNT(*) c FROM inventory").c, 0);
    assert.equal(get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G, ME).w, 1000000);
});

test("modal de outra área passa adiante (null)", async () => {
    assert.equal(await send(submit("outra:coisa", {})), null);
});

// ==========================================
// BOTÕES NOS COMANDOS
// ==========================================

test("os comandos mostram os botões dos painéis", async () => {
    reset();

    const run = await createPrefixRunner({
        guildId: G,
        author: { id: ME, username: "eu", displayName: "Eu Mesmo" }
    });

    const ids = components => components.flatMap(r => r.components).map(c => c.customId);

    assert.deepEqual(ids((await run("hsaldo")).components), [`banco:dep:${ME}`, `banco:sac:${ME}`, `banco:trf:${ME}`]);

    // sem a privada liberada: botão de liberar
    assert.deepEqual(ids((await run("hlavagem")).components), [`lavagem:publica:${ME}`, `lavagem:liberar:${ME}`]);

    set("INSERT INTO global_users (user_id, gems) VALUES (?, 0) ON CONFLICT(user_id) DO NOTHING", ME);
    set("UPDATE crime_players SET private_unlocked = 1 WHERE guild_id=? AND user_id=?", G, ME);

    assert.deepEqual(ids((await run("hlavagem")).components), [`lavagem:publica:${ME}`, `lavagem:privada:${ME}`]);

    // a loja é um painel completo (ver shop.test.mjs); aqui só o essencial
    const shop = ids((await run("hloja")).components);

    assert.ok(shop.includes(`loja:cat:${ME}`), "menu de categorias");
    assert.ok(shop.includes(`loja:nome:${ME}`), "botão Por nome");
    assert.ok(shop.includes(`loja:vender:${ME}`), "botão Vender");

    // bio sem texto: painel; com texto: salva direto
    const panel = await run("hbio");

    assert.match(panel.title, /Sua bio/);
    assert.deepEqual(ids(panel.components), [`bio:editar:${ME}`]);

    assert.match((await run("hbio olá mundo")).title, /Bio atualizada/);
    assert.equal(get("SELECT bio FROM players WHERE guild_id=? AND user_id=?", G, ME).bio, "olá mundo");
});

test("os botões do saldo valem também pelo alias hbal", async () => {
    reset();

    const run = await createPrefixRunner({
        guildId: G,
        author: { id: ME, username: "eu", displayName: "Eu Mesmo" }
    });

    assert.equal((await run("hbal")).components.length, 1);
});

// ==========================================
// BIO COM EMOJI
// ==========================================

const bioOf = () => get("SELECT bio FROM players WHERE guild_id=? AND user_id=?", G, ME).bio;

test("bio com emoji: conta caracteres de verdade (cada emoji vale 1), pelo comando e pelo modal", async () => {
    reset();

    // 100 emojis = 100 caracteres (200 no .length do JavaScript): cabe
    const hundred = "💜".repeat(100);

    assert.match(titleOf(await send(submit("bio:editar", { texto: hundred }))), /Bio atualizada/);
    assert.equal(bioOf(), hundred);

    // 160 caracteres exatos com emoji: cabe; 161: recusa com o motivo claro
    const limit = "😀".repeat(80) + "a".repeat(80);

    assert.match(titleOf(await send(submit("bio:editar", { texto: limit }))), /Bio atualizada/);
    assert.equal(bioOf(), limit);

    const over = await send(submit("bio:editar", { texto: limit + "z" }));

    assert.match(JSON.stringify(over), /no máximo 160 caracteres \(cada emoji conta como 1\)/);
    assert.equal(bioOf(), limit, "a bio boa continua guardada");

    // pelo prefixo também
    reset();

    const run = await createPrefixRunner({ guildId: G, author: { id: ME, username: "eu", displayName: "Eu Mesmo" } });

    assert.match((await run("hbio oi 😀 tudo bem? ❤️ 👨‍👩‍👧‍👦")).title, /Bio atualizada/);
    assert.equal(bioOf(), "oi 😀 tudo bem? ❤️ 👨‍👩‍👧‍👦");
});

test("bio: pedaço solto de emoji e caracteres de controle não vão para o banco", async () => {
    reset();

    await send(submit("bio:editar", { texto: "abc\ud83dxyz\ude00 com\u0000controle‮ e\r\nquebra" }));

    // sem pedaço solto de emoji, sem controle, sem o inversor de direção e com a quebra de linha comum
    assert.equal(bioOf(), "abcxyz comcontrole e\nquebra");

    // um emoji inteiro (par de unidades) não é "pedaço solto": fica
    await send(submit("bio:editar", { texto: "ok 😀" }));

    assert.equal(bioOf(), "ok 😀");
});

test("bio: o aviso diz o que o cartão não desenha (símbolos, outros alfabetos, emojis personalizados e menções)", async () => {
    reset();

    const noteOf = response => JSON.stringify(response).includes("No cartão do perfil");

    // texto comum: sem aviso
    assert.equal(noteOf(await send(submit("bio:editar", { texto: "Gosto de café" }))), false);

    // emojis comuns o cartão desenha (em cores): sem aviso, nem com bandeira, tom de pele e emoji composto
    for (const texto of ["Gosto de café ☕😀", "💜💜💜", "oi 👍🏽 🇧🇷 1️⃣ 👨‍👩‍👧 ❤️‍🔥"]) {
        assert.equal(noteOf(await send(submit("bio:editar", { texto }))), false, texto);
    }

    // o que sobra de fora: o aviso mostra como fica no cartão, com os emojis no lugar
    const withSymbol = JSON.stringify(await send(submit("bio:editar", { texto: "Gosto de café ☕ ★彡" })));

    assert.match(withSymbol, /No cartão do perfil/);
    assert.match(withSymbol, /Ela aparece assim: \*\*Gosto de café ☕\*\*/);

    // símbolo decorativo, emoji personalizado do Discord e menção
    const decorative = JSON.stringify(await send(submit("bio:editar", { texto: "꒰ sou calma 😀 ꒱ <:festa:3f2a-9c1e> <@1234>" })));

    assert.match(decorative, /Ela aparece assim: \*\*sou calma 😀\*\*/);

    // só coisa que o cartão não desenha: ele mostra a bio padrão
    const onlySymbols = JSON.stringify(await send(submit("bio:editar", { texto: "꒰ ✿ ꒱ <:festa:3f2a-9c1e>" })));

    assert.match(onlySymbols, /Nenhuma bio definida/);
});

test("bio: o modal abre com a bio inteira, mesmo cheia de emoji, sem cortar um emoji ao meio", () => {
    reset();

    // 100 emojis = 200 unidades: não pode ser cortada em 160 nem estourar o limite do campo
    const full = "💜".repeat(100);

    set("UPDATE players SET bio = ? WHERE guild_id=? AND user_id=?", full, G, ME);

    const [field] = handlePanelClick(click(`bio:editar:${ME}`)).data.fields;

    assert.equal(field.value, full);
    assert.ok(field.maxLength >= field.value.length, `${field.maxLength} < ${field.value.length}`);

    // uma bio comum continua com o limite de 160 do formulário
    set("UPDATE players SET bio = 'oi' WHERE guild_id=? AND user_id=?", G, ME);

    assert.equal(handlePanelClick(click(`bio:editar:${ME}`)).data.fields[0].maxLength, 160);

    // bio de 81 emojis + 1 letra: também inteira (o corte por unidades partia um emoji ao meio)
    const odd = "a" + "😀".repeat(81);

    set("UPDATE players SET bio = ? WHERE guild_id=? AND user_id=?", odd, G, ME);

    assert.equal(handlePanelClick(click(`bio:editar:${ME}`)).data.fields[0].value, odd);
});

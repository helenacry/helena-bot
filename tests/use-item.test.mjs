import {
    db, getPlayer, set, get, blockedTitle, createPrefixRunner
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { restoreEnergy, ENERGY_CONFIG } = await import("../services/energy.mjs");
const { useItem, usableItems, describeUse } = await import("../services/use-item.mjs");
const { buildUseView } = await import("../services/use-panel.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../services/panels.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { equipWeapon, getEquippedWeapon } = await import("../services/equipment.mjs");
const { tx } = await import("../services/combat.mjs");
const { imprison } = await import("../services/prison.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { getItemUse, getItem } = await import("../config/items.mjs");

const G = "g-use";
const ME = "111111111111111111";
const OTHER = "222222222222222222";
const T0 = 1_800_000_000;

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

// ==========================================
// FERRAMENTAS
// ==========================================

let sequence = 0;

const user = id => ({ id, username: "eu", displayName: "Eu Mesmo" });

const click = (customId, { userId = ME, values } = {}) => ({
    id: "c" + (++sequence), guildId: G, channelId: "c1",
    user: user(userId), data: { customId, ...(values ? { values } : {}) }
});

const submit = (customId, fields, userId = ME) => ({
    id: "s" + (++sequence), guildId: G, channelId: "c1", user: user(userId),
    data: {
        customId,
        fields: Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
    }
});

const send = interaction => silently(() => handleModalSubmit(interaction, comandos));

const nowSec = () => Math.floor(Date.now() / 1000);

// energia fixa: o relógio de regeneração começa em "since"
function reset({ energy = 50, since = T0 } = {}) {
    for (const table of [
        "players", "combat_players", "combat_gear", "inventory",
        "equipped_items", "crime_players", "prison_players"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, ME);

    setEnergy(energy, since);
}

const setEnergy = (energy, since = T0) =>
    set("UPDATE players SET energy=?, energy_updated_at=? WHERE guild_id=? AND user_id=?", energy, since, G, ME);

const energyNow = () => get("SELECT energy e FROM players WHERE guild_id=? AND user_id=?", G, ME).e;
const owned = id => get("SELECT quantity q FROM inventory WHERE guild_id=? AND user_id=? AND item_id=?", G, ME, id)?.q ?? 0;
const give = (id, qty = 1) => tx(() => addItem(G, ME, id, qty));

const titleOf = response => response.data.embeds?.[0]?.title ?? "";
const textOf = response => JSON.stringify(response.data);

// ==========================================
// CATÁLOGO
// ==========================================

test("comida e bebida repõem energia; armas equipam; o resto não é usável", () => {
    assert.deepEqual(getItemUse(getItem("apple")), { kind: "energy", verb: "Comer", energy: 10 });
    assert.deepEqual(getItemUse(getItem("coffee")), { kind: "energy", verb: "Beber", energy: 25 });
    assert.deepEqual(getItemUse(getItem("energy_drink")), { kind: "energy", verb: "Beber", energy: 50 });
    assert.deepEqual(getItemUse(getItem("revolver")), { kind: "equip", verb: "Equipar" });

    assert.equal(getItemUse(getItem("mystery_box")), null);
    assert.equal(getItemUse(getItem("backpack")), null);
    assert.equal(getItemUse(null), null);
});

test("a descrição da loja avisa quanto de energia o item repõe", () => {
    assert.match(getItem("apple").description, /10 de energia/);
    assert.match(getItem("coffee").description, /25 de energia/);
    assert.match(getItem("energy_drink").description, /50 de energia/);
});

// ==========================================
// REPOR ENERGIA
// ==========================================

test("restoreEnergy soma até o máximo e conta o que se perdeu", () => {
    reset({ energy: 95 });

    const result = tx(() => restoreEnergy(G, ME, 10, T0));

    assert.equal(result.success, true);
    assert.equal(result.energy, ENERGY_CONFIG.max);
    assert.equal(result.gained, 5);
    assert.equal(result.wasted, 5);
    assert.equal(energyNow(), 100);
});

test("restoreEnergy com a energia cheia não faz nada", () => {
    reset({ energy: 100 });

    const result = tx(() => restoreEnergy(G, ME, 10, T0));

    assert.equal(result.success, false);
    assert.equal(result.gained, 0);
    assert.equal(energyNow(), 100);
});

test("restoreEnergy exige transação e quantidade válida", () => {
    reset();

    assert.throws(() => restoreEnergy(G, ME, 10, T0), /transação/);
    assert.throws(() => tx(() => restoreEnergy(G, ME, 0, T0)), /inválida/);
    assert.throws(() => tx(() => restoreEnergy(G, ME, 1.5, T0)), /inválida/);
});

test("abaixo do máximo a regeneração segue de onde estava", () => {
    reset({ energy: 50, since: T0 - 200 });

    tx(() => restoreEnergy(G, ME, 10, T0));

    const row = get("SELECT energy, energy_updated_at u FROM players WHERE guild_id=? AND user_id=?", G, ME);

    assert.equal(row.energy, 60);
    assert.equal(row.u, T0 - 200, "relógio mantido");
});

// ==========================================
// USAR COMIDA
// ==========================================

test("cada item repõe a energia do catálogo e gasta uma unidade", () => {
    reset({ energy: 20 });
    give("apple", 3);
    give("coffee", 1);
    give("energy_drink", 1);

    const apple = useItem(G, ME, "apple", 1, { now: T0 });
    assert.equal(apple.gained, 10);
    assert.equal(energyNow(), 30);
    assert.equal(owned("apple"), 2);

    useItem(G, ME, "coffee", 1, { now: T0 });
    assert.equal(energyNow(), 55);
    assert.equal(owned("coffee"), 0);

    useItem(G, ME, "energy_drink", 1, { now: T0 });
    assert.equal(energyNow(), 100, "55 + 50 passa de 100: sobe até o máximo");
});

test("o que passa do máximo se perde, e o item é gasto", () => {
    reset({ energy: 95 });
    give("apple", 2);

    const result = useItem(G, ME, "apple", 1, { now: T0 });

    assert.equal(result.gained, 5);
    assert.equal(result.wasted, 5);
    assert.equal(owned("apple"), 1);
});

test("energia cheia recusa e NÃO gasta o item", async () => {
    reset({ energy: 100 });
    give("coffee", 2);

    assert.equal(await blockedTitle(() => useItem(G, ME, "coffee", 1, { now: T0 })), "Energia cheia");
    assert.equal(owned("coffee"), 2);
});

test("várias unidades: usa uma a uma e para quando a energia enche", () => {
    reset({ energy: 85 });
    give("apple", 5);

    const result = useItem(G, ME, "apple", 5, { now: T0 });

    // 85 -> 95 -> 100 (sobra) -> cheio: para
    assert.equal(result.used, 2);
    assert.equal(result.requested, 5);
    assert.equal(result.remaining, 3);
    assert.equal(result.gained, 15);
    assert.equal(result.wasted, 5);
    assert.equal(energyNow(), 100);
    assert.equal(owned("apple"), 3);
    assert.match(describeUse(result), /Parei em 2/);
});

test("max usa só até encher", () => {
    reset({ energy: 60 });
    give("coffee", 10);

    const result = useItem(G, ME, "coffee", "max", { now: T0 });

    // 60 -> 85 -> 100 (sobra 10)
    assert.equal(result.used, 2);
    assert.equal(owned("coffee"), 8);
    assert.equal(energyNow(), 100);
});

test("quantidade inválida, maior que a que tem, ou item que não tem", async () => {
    reset({ energy: 10 });
    give("apple", 2);

    for (const quantity of [0, -1, 1.5, "abc"]) {
        assert.equal(await blockedTitle(() => useItem(G, ME, "apple", quantity, { now: T0 })), "Quantidade inválida", String(quantity));
    }

    assert.equal(await blockedTitle(() => useItem(G, ME, "apple", 3, { now: T0 })), "Quantidade inválida");
    assert.equal(await blockedTitle(() => useItem(G, ME, "coffee", 1, { now: T0 })), "Você não tem esse item");

    assert.equal(owned("apple"), 2);
    assert.equal(energyNow(), 10, "recusar não mexe na energia");
});

test("item que não existe ou que não é usável", async () => {
    reset();
    give("mystery_box", 1);

    assert.equal(await blockedTitle(() => useItem(G, ME, "nao_existe", 1)), "Item inexistente");
    assert.equal(await blockedTitle(() => useItem(G, ME, "mystery_box", 1)), "Item não usável");
    assert.equal(owned("mystery_box"), 1);
});

// ==========================================
// EQUIPAR
// ==========================================

test("equipar uma arma não gasta a unidade", () => {
    reset();
    give("revolver", 1);

    const result = useItem(G, ME, "revolver", 1);

    assert.equal(result.kind, "equip");
    assert.equal(getEquippedWeapon(G, ME)?.id, "revolver");
    assert.equal(owned("revolver"), 1, "continua no inventário");
});

test("equipar o que não tem ou o que já está equipado", async () => {
    reset();

    assert.equal(await blockedTitle(() => useItem(G, ME, "pistol", 1)), "Você não tem esse item");

    give("revolver", 1);
    useItem(G, ME, "revolver", 1);

    assert.equal(await blockedTitle(() => useItem(G, ME, "revolver", 1)), "Não foi possível equipar");
});

// ==========================================
// LISTA DE USÁVEIS
// ==========================================

test("usableItems: comida primeiro, arma equipada fica de fora", () => {
    reset();
    give("revolver", 1);
    give("pistol", 1);
    give("apple", 2);
    give("mystery_box", 1);
    give("backpack", 1);

    equipWeapon(G, ME, "pistol");

    const list = usableItems(G, ME);

    assert.deepEqual(
        list.map(entry => entry.item.id),
        ["apple", "revolver"],
        "sem a caixa, a mochila nem a pistola equipada"
    );
});

// ==========================================
// PAINEL
// ==========================================

test("o painel sem itens avisa e desliga o Usar vários", () => {
    reset({ energy: 70 });

    const view = buildUseView({ ownerId: ME, guildId: G, userId: ME });

    assert.match(view.embed.description, /Energia:\*\* 70\/100/);
    assert.match(view.embed.description, /nenhum item/);

    assert.equal(view.components.length, 1, "só a fileira de botões");

    const several = view.components[0].components.find(b => b.customId.startsWith("uso:varios:"));

    assert.equal(several.disabled, true);
});

test("o painel lista os itens no menu, com verbo e efeito", () => {
    reset({ energy: 40 });
    give("apple", 3);
    give("revolver", 1);

    const view = buildUseView({ ownerId: ME, guildId: G, userId: ME });

    const select = view.components[0].components[0];

    assert.equal(select.customId, `uso:sel:${ME}`);

    assert.deepEqual(
        select.options.map(o => [o.value, o.label, o.description]),
        [
            ["apple", "Comer Maçã (×3)", "+10 de energia"],
            ["revolver", "Equipar Revólver", "Equipa a arma"]
        ]
    );
});

test("escolher no menu usa 1 unidade e atualiza o painel", () => {
    reset({ energy: 40 });
    give("apple", 3);

    const response = handlePanelClick(click(`uso:sel:${ME}`, { values: ["apple"] }));

    assert.equal(response.type, "update");
    assert.match(response.data.embeds[0].description, /\+10 de energia/);
    assert.match(response.data.embeds[0].description, /Energia:\*\* 50\/100/);
    assert.equal(owned("apple"), 2);
});

test("escolher com a energia cheia avisa em privado e não gasta", () => {
    reset({ energy: 100, since: nowSec() });
    give("apple", 3);

    const response = handlePanelClick(click(`uso:sel:${ME}`, { values: ["apple"] }));

    assert.equal(response.type, "message");
    assert.equal(response.data.ephemeral, true);
    assert.match(titleOf(response), /Energia cheia/);
    assert.equal(owned("apple"), 3);
});

test("só o dono usa o painel", () => {
    reset();
    give("apple", 1);

    for (const id of [`uso:sel:${ME}`, `uso:varios:${ME}`, `uso:ref:${ME}`]) {
        const response = handlePanelClick(click(id, { userId: OTHER, values: ["apple"] }));

        assert.equal(response.data.ephemeral, true, id);
        assert.match(titleOf(response), /de outra pessoa/, id);
    }

    assert.equal(owned("apple"), 1);
});

test("atualizar relê o painel; usar vários abre o formulário", () => {
    reset({ energy: 33 });
    give("apple", 1);

    const refresh = handlePanelClick(click(`uso:ref:${ME}`));

    assert.equal(refresh.type, "update");
    assert.match(refresh.data.embeds[0].description, /33\/100/);

    const modal = handlePanelClick(click(`uso:varios:${ME}`));

    assert.equal(modal.type, "modal");
    assert.equal(modal.data.customId, "uso:varios");
    assert.deepEqual(modal.data.fields.map(f => f.customId), ["item", "quantidade"]);
    assert.equal(modal.data.fields[1].value, "1");
});

// ==========================================
// FORMULÁRIO USAR VÁRIOS
// ==========================================

test("usar vários pelo formulário: por nome (sem acento), número e max", async () => {
    reset({ energy: 10, since: nowSec() });
    give("apple", 10);
    give("coffee", 4);

    const first = await send(submit("uso:varios", { item: "maca", quantidade: "3" }));

    assert.equal(first.data.ephemeral, true);
    assert.match(titleOf(first), /Itens usados/);
    assert.equal(owned("apple"), 7);
    assert.equal(energyNow(), 40);

    await send(submit("uso:varios", { item: "Café", quantidade: "max" }));

    // 40 -> 65 -> 90 -> 100 (sobra): 3 cafés
    assert.equal(owned("coffee"), 1);
    assert.equal(energyNow(), 100);
});

test("o formulário recusa o que não faz sentido", async () => {
    reset({ energy: 10, since: nowSec() });
    give("apple", 2);
    give("mystery_box", 1);

    assert.match(titleOf(await send(submit("uso:varios", { item: "", quantidade: "1" }))), /Faltou o item/);
    assert.match(titleOf(await send(submit("uso:varios", { item: "xyz", quantidade: "1" }))), /não encontrado/);
    assert.match(titleOf(await send(submit("uso:varios", { item: "caixa", quantidade: "1" }))), /não encontrado/, "não usável");
    assert.match(titleOf(await send(submit("uso:varios", { item: "apple", quantidade: "abc" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("uso:varios", { item: "apple", quantidade: "metade" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("uso:varios", { item: "apple", quantidade: "9" }))), /Quantidade inválida/);

    assert.equal(owned("apple"), 2);
    assert.equal(energyNow(), 10);
});

test("preso não usa itens, nem pelo painel nem pelo formulário", async () => {
    reset({ energy: 10, since: nowSec() });
    give("apple", 2);

    imprison(G, ME, 1800, "teste", nowSec());

    const byMenu = handlePanelClick(click(`uso:sel:${ME}`, { values: ["apple"] }));
    assert.match(titleOf(byMenu), /Você está preso/);

    assert.match(titleOf(await send(submit("uso:varios", { item: "apple", quantidade: "1" }))), /Você está preso/);

    assert.equal(owned("apple"), 2);
    assert.equal(energyNow(), 10);
});

// ==========================================
// COMANDO
// ==========================================

const run = await createPrefixRunner({
    guildId: G,
    author: { id: ME, username: "eu", displayName: "Eu Mesmo" }
});

test("husaritem sem argumentos abre o painel; com item usa direto", async () => {
    reset({ energy: 10, since: nowSec() });
    give("apple", 4);
    give("revolver", 1);

    const panel = await run("husaritem");

    assert.match(panel.title, /Usar item/);
    assert.equal(panel.components[0].components[0].customId, `uso:sel:${ME}`);

    const direct = await run("husaritem maçã 2");

    assert.match(direct.title, /Item usado/);
    assert.equal(owned("apple"), 2);
    assert.equal(energyNow(), 30);

    const equip = await run("husaritem revolver");

    assert.match(equip.text, /equipou/);
    assert.equal(getEquippedWeapon(G, ME)?.id, "revolver");
});

test("husaritem: erros viram avisos", async () => {
    reset({ energy: 100, since: nowSec() });
    give("apple", 1);

    assert.match((await run("husaritem xyz")).title, /Item não encontrado/);
    assert.match((await run("husaritem apple")).title, /Energia cheia/);
    assert.match((await run("husaritem apple abc")).title, /Quantidade inválida/);
    assert.equal(owned("apple"), 1);
});

test("aliases useitem e usar; preso é bloqueado pelo comando", async () => {
    assert.equal(resolverComando(comandos, "useitem")?.name, "usaritem");
    assert.equal(resolverComando(comandos, "usar")?.name, "usaritem");

    reset({ energy: 10, since: nowSec() });
    give("apple", 1);

    assert.match((await run("husar maçã")).title, /Item usado/);

    give("apple", 1);
    imprison(G, ME, 1800, "teste", nowSec());

    assert.match((await run("husaritem apple")).title, /Você está preso/);
});

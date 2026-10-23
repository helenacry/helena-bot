process.env.HELENA_OWNER_ID = "777000000000000001";

import { db, getPlayer, set, get, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Missões, ranking, bolsa, inventário e usaritem: o desenho V2 próprio de cada uma e o que os
// botões novos fazem. O clássico continua o mesmo embed de sempre.

const { carregarComandos } = await import("../command-registry.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { layoutProblems, countComponents, toV2Data } = await import("../utils/components-v2.mjs");
const { MISSIONS, getMissionPeriod } = await import("../config/missions.mjs");
const { claimMission } = await import("../services/economy/missions.mjs");
const { buildMissions } = await import("../services/economy/missions-view.mjs");
const { buildRanking } = await import("../services/economy/ranking-view.mjs");
const { buildMarketView } = await import("../services/panels/market-view.mjs");
const { buildInventoryView } = await import("../services/panels/inventory-view.mjs");
const { buildUseView } = await import("../services/panels/use-panel.mjs");
const { addItem } = await import("../services/economy/inventory.mjs");
const { getMarket } = await import("../services/economy/market.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { calculateLevel } = await import("../services/progress/experience.mjs");

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

await silently(() => carregarComandos());

const G = "900000000000000001";
const OWNER = "111111111111111111";
const OTHER = "222222222222222222";
const ME = { id: OWNER, username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };

const run = await createPrefixRunner({ guildId: G, author: ME });

const allText = layout => JSON.stringify(layout).replace(/\u00a0/g, " ");

const customIds = layout => (JSON.stringify(layout).match(/"customId":"[^"]+"/g) ?? []).map(text => text.slice(12, -1));

const sectionsOf = layout => layout[0].components.filter(component => component.type === "section");

const click = (customId, user = ME, values) => handlePanelClick({
    guildId: G,
    user,
    data: { customId, ...(values ? { values } : {}) }
});

const withV2 = async fn => {
    const before = process.env.HELENA_V2;

    process.env.HELENA_V2 = "on";

    try { return await fn(); } finally {
        if (before === undefined) delete process.env.HELENA_V2;
        else process.env.HELENA_V2 = before;
    }
};

function reset() {
    for (const table of [
        "players", "mission_progress", "transactions", "inventory", "equipped_items", "player_names"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    db.exec("DELETE FROM global_users");

    getPlayer(G, OWNER);

    savePlayerName(ME);
}

function giveItems(items) {
    db.exec("BEGIN IMMEDIATE");

    try {
        for (const [id, quantity] of items) addItem(G, OWNER, id, quantity);

        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");

        throw error;
    }
}

const progress = (missionId, value, claimed = 0) => set(
    `INSERT OR REPLACE INTO mission_progress (guild_id, user_id, mission_id, period, progress, claimed)
     VALUES (?, ?, ?, ?, ?, ?)`,
    G, OWNER, missionId, getMissionPeriod(), value, claimed
);

const wallet = () => get("SELECT wallet w FROM players WHERE guild_id = ? AND user_id = ?", G, OWNER).w;

// ==========================================
// MISSÕES: O RESGATE
// ==========================================

test("claimMission: paga o dinheiro e o XP, marca como resgatada e grava no histórico", () => {
    reset();

    const mission = MISSIONS[0];

    progress(mission.id, mission.target);

    const before = wallet();

    const result = claimMission({ guildId: G, userId: OWNER, missionId: mission.id });

    assert.equal(result.status, "ok");
    assert.equal(result.wallet, before + mission.reward);
    assert.equal(wallet(), before + mission.reward);
    assert.equal(result.xp, mission.xp);
    assert.equal(result.level, calculateLevel(mission.xp));

    const tx = get("SELECT * FROM transactions WHERE guild_id = ? AND type = 'mission'", G);

    assert.equal(tx.amount, mission.reward);

    // só uma vez por período
    assert.equal(claimMission({ guildId: G, userId: OWNER, missionId: mission.id }).status, "claimed");
    assert.equal(wallet(), before + mission.reward);
});

test("claimMission: faltando progresso, missão inexistente e carteira cheia não pagam nada", () => {
    reset();

    const mission = MISSIONS[1];

    progress(mission.id, 0);

    const missing = claimMission({ guildId: G, userId: OWNER, missionId: mission.id });

    assert.equal(missing.status, "incomplete");
    assert.equal(missing.progress, 0);

    assert.equal(claimMission({ guildId: G, userId: OWNER, missionId: "nao-existe" }).status, "unknown");

    // carteira sem espaço: erro, e a missão continua pronta (a transação desfaz tudo)
    progress(mission.id, mission.target);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", 100_000_000_000_000, G, OWNER);

    assert.throws(() => claimMission({ guildId: G, userId: OWNER, missionId: mission.id }), /carteira/);
    assert.equal(get("SELECT claimed c FROM mission_progress WHERE guild_id = ? AND user_id = ? AND mission_id = ?", G, OWNER, mission.id).c, 0);
    assert.equal(db.isTransaction, false);
});

test("o comando /missoes resgatar paga e mostra o aviso de sempre; incompleta e repetida viram aviso", async () => {
    reset();

    const mission = MISSIONS[0];

    progress(mission.id, 0);

    assert.match((await run(`hmissoes resgatar:${mission.id}`)).title, /Missão incompleta/);

    progress(mission.id, mission.target);

    const paid = await run(`hmissoes resgatar:${mission.id}`);

    assert.equal(paid.title, "🎉 Missão concluída");
    assert.match(paid.text, new RegExp(mission.name));

    assert.match((await run(`hmissoes resgatar:${mission.id}`)).title, /Recompensa já resgatada/);
});

// ==========================================
// MISSÕES: A TELA
// ==========================================

test("missões no V2: uma seção por missão, com Resgatar nas prontas e o estado nas outras", () => {
    reset();

    progress(MISSIONS[0].id, MISSIONS[0].target);
    progress(MISSIONS[1].id, 1);
    progress(MISSIONS[2].id, MISSIONS[2].target, 1);

    const view = buildMissions({ guildId: G, userId: OWNER });

    assert.deepEqual(layoutProblems(view.layout), []);

    const sections = sectionsOf(view.layout);

    assert.equal(sections.length, MISSIONS.length);

    assert.equal(sections[0].accessory.label, "Resgatar");
    assert.equal(sections[0].accessory.customId, `miss:resgatar:${OWNER}:${MISSIONS[0].id}`);
    assert.notEqual(sections[0].accessory.disabled, true);

    assert.equal(sections[1].accessory.label, `1/${MISSIONS[1].target}`);
    assert.equal(sections[1].accessory.disabled, true);

    assert.equal(sections[2].accessory.label, "Resgatada");
    assert.equal(sections[2].accessory.disabled, true);

    assert.match(allText(view.layout), /1\*\* recompensa pronta/);

    // o clássico: o mesmo embed e um botão por missão pronta
    assert.equal(view.embed.title, "📜 Missões do dia");
    assert.equal(view.components[0].components.length, 1);
    assert.match(view.embed.fields.at(-1).value, /1/);
});

test("o botão Resgatar paga, atualiza a mesma lista com o aviso e o botão vira Resgatada", () => {
    reset();

    const mission = MISSIONS[0];

    progress(mission.id, mission.target);

    const before = wallet();

    const answer = click(`miss:resgatar:${OWNER}:${mission.id}`);

    assert.equal(answer.type, "update");
    assert.equal(wallet(), before + mission.reward);

    assert.match(allText(answer.data.layout), /resgatada/);
    assert.equal(sectionsOf(answer.data.layout)[0].accessory.label, "Resgatada");
    assert.match(answer.data.embeds[0].description, /resgatada/);
    assert.deepEqual(answer.data.components, [], "sem botão de resgate quando nada está pronto");

    // apertar de novo (mensagem velha) só avisa
    const again = click(`miss:resgatar:${OWNER}:${mission.id}`);

    assert.equal(again.data.ephemeral, true);
    assert.match(JSON.stringify(again), /já recebeu/);
    assert.equal(wallet(), before + mission.reward);

    // só quem abriu a lista
    progress(MISSIONS[1].id, MISSIONS[1].target);

    assert.match(JSON.stringify(click(`miss:resgatar:${OWNER}:${MISSIONS[1].id}`, { id: OTHER })), /outra pessoa/);
});

test("/missoes: no V2 sai o layout; o clássico não leva o layout e traz os botões das prontas", async () => {
    reset();

    progress(MISSIONS[0].id, MISSIONS[0].target);

    const classic = (await run("hmissoes")).sent[0];

    assert.ok(!("layout" in classic));
    assert.equal(classic.embeds[0].title, "📜 Missões do dia");
    assert.match(classic.components[0].components[0].customId, /^miss:resgatar:/);

    await withV2(async () => {
        const v2 = (await run("hmissoes")).sent[0];

        assert.ok(!v2.embeds);
        assert.equal(v2.components[0].type, "container");
        assert.deepEqual(layoutProblems(v2.components), []);
    });
});

// ==========================================
// RANKING
// ==========================================

function fillRanking(count = 12) {
    for (let i = 0; i < count; i++) {
        const id = String(900000000000000100n + BigInt(i));

        getPlayer(G, id);

        set("UPDATE players SET wallet = ?, level = ?, xp = ? WHERE guild_id = ? AND user_id = ?", 100_000 * (i + 1), 2 + (i % 5), 50 * i, G, id);

        savePlayerName({ id, username: "jog" + i, displayName: i === 4 ? "*Estrela_Z*" : "Jogador " + i });
    }
}

test("ranking no V2: uma linha por jogador, sem menção, o nome protegido e os botões de tipo", () => {
    reset();

    fillRanking();

    // um jogador sem nome salvo: no V2 não vira menção (ela poderia notificar)
    const nameless = "900000000000000500";

    getPlayer(G, nameless);
    set("UPDATE players SET wallet = 999999999 WHERE guild_id = ? AND user_id = ?", G, nameless);

    const view = buildRanking({ guildId: G, userId: OWNER, type: "money" });

    assert.deepEqual(layoutProblems(view.layout), []);

    const text = allText(view.layout);

    assert.match(text, /🥇 \*\*Jogador #0500\*\* — R\$ 9\.999\.999,99/);
    assert.doesNotMatch(text, /<@/);
    assert.match(text, /\*\*\\\\\*Estrela\\\\_Z\\\\\*\*\*/, "o nome com * e _ sai escapado");

    // o clássico continua com a menção de quem não tem nome
    assert.match(view.embed.description, new RegExp(`<@${nameless}>`));

    // fora do top 10: a posição aparece à parte, nos dois
    assert.match(text, /📍 \*\*Sua posição:\*\* \d+º lugar/);
    assert.equal(view.embed.fields[0].name, "📍 Sua posição");

    assert.deepEqual(customIds(view.layout), [
        `rank:tipo:${OWNER}:money`, `rank:tipo:${OWNER}:level`, `rank:tipo:${OWNER}:gems`
    ]);

    const buttons = view.layout[0].components.at(-1).components;

    assert.equal(buttons[0].disabled, true, "o tipo atual fica desligado");
    assert.notEqual(buttons[1].disabled, true);
});

test("os botões do ranking trocam a classificação na mesma mensagem, só para quem abriu", () => {
    reset();

    fillRanking(3);

    set("UPDATE players SET level = 9, xp = 7000 WHERE guild_id = ? AND user_id = ?", G, OWNER);

    const answer = click(`rank:tipo:${OWNER}:level`);

    assert.equal(answer.type, "update");
    assert.match(answer.data.embeds[0].description, /Nível/);
    assert.match(allText(answer.data.layout), /## 🏆 Ranking · Nível/);
    assert.match(allText(answer.data.layout), /🥇 \*\*Eu Mesmo\*\* · Você — Nível 9/);

    assert.match(JSON.stringify(click(`rank:tipo:${OWNER}:level`, { id: OTHER })), /outra pessoa/);
    assert.match(JSON.stringify(click(`rank:tipo:${OWNER}:xyz`)), /Tipo de ranking inválido/);
});

test("/ranking: o clássico mantém o embed e ganha os botões; o V2 leva o layout", async () => {
    reset();

    fillRanking(2);

    const classic = (await run("hranking")).sent[0];

    assert.ok(!("layout" in classic));
    assert.equal(classic.embeds[0].title, "🏆 Ranking · Patrimônio");
    assert.equal(classic.components[0].components.length, 3);

    const gems = (await run("hranking tipo:gems")).sent[0];

    assert.equal(gems.embeds[0].title, "🏆 Ranking · Gemas");
    assert.match(gems.embeds[0].description, /💎/);

    await withV2(async () => {
        const v2 = (await run("hranking")).sent[0];

        assert.ok(!v2.embeds);
        assert.equal(v2.components[0].type, "container");
        assert.deepEqual(layoutProblems(v2.components), []);
    });
});

// ==========================================
// BOLSA
// ==========================================

// a bolsa vem desligada nos testes (preço de tabela); aqui ela liga só durante a chamada
const withMarket = fn => {
    const before = process.env.HELENA_MARKET;

    process.env.HELENA_MARKET = "on";

    try { return fn(); } finally {
        if (before === undefined) delete process.env.HELENA_MARKET;
        else process.env.HELENA_MARKET = before;
    }
};

test("bolsa no V2: índice, item em alta e preços em blocos, com os botões; o clássico não muda", () => {
    reset();

    withMarket(() => {
        const market = getMarket(G);

        assert.ok(market, "a bolsa ligou");

        const view = buildMarketView({ ownerId: OWNER, market });

        assert.deepEqual(layoutProblems(view.layout), []);
        assert.ok(countComponents(view.layout) <= 40);

        const text = allText(view.layout);

        // o emoji do título é o da faixa do índice
        assert.match(text, /## (?:📉|➖|📈) Bolsa do servidor/u);
        assert.match(text, /Índice ·+ \d+ de 90/);
        assert.match(text, /### 🔥 Item em alta/);
        assert.match(text, /### 🛒 Preços de agora/);
        assert.match(text, /💡 Índice baixo deixa a loja mais barata/);
        assert.match(text, /Item\s+Compra\s+Venda/, "os preços vão numa tabela");

        assert.deepEqual(customIds(view.layout), [`loja:home:${OWNER}`, `bolsa:atualizar:${OWNER}`, `bolsa:fechar:${OWNER}`]);

        assert.match(view.embed.title, /^[📉➖📈] Bolsa do servidor$/u);
        assert.equal(view.components[0].components.length, 3);
    });
});

test("bolsa desligada: só o aviso, como antes (sem layout próprio, o embed converte)", () => {
    const view = buildMarketView({ ownerId: OWNER, market: null });

    assert.ok(!("layout" in view));
    assert.equal(view.embed.title, "📊 Bolsa desligada");
    assert.match(view.embed.description, /valor de tabela/);

    const v2 = toV2Data({ embeds: [view.embed], components: view.components });

    assert.equal(v2.components[0].type, "container");
});

test("os botões da bolsa atualizam com o layout novo", () => {
    reset();

    withMarket(() => {
        const answer = click(`bolsa:atualizar:${OWNER}`);

        assert.equal(answer.type, "update");
        assert.ok(Array.isArray(answer.data.layout));
        assert.match(allText(answer.data.layout), /Bolsa do servidor/);
    });
});

// ==========================================
// INVENTÁRIO
// ==========================================

test("inventário no V2: quem é, o resumo, um bloco por prateleira e os controles", () => {
    reset();

    giveItems([["apple", 3], ["coffee", 2], ["pistol", 1]]);

    const view = buildInventoryView({ ownerId: OWNER, guildId: G, userId: OWNER, username: "Eu Mesmo" });

    assert.deepEqual(layoutProblems(view.layout), []);

    const text = allText(view.layout);

    assert.match(text, /## 🎒 Inventário de Eu Mesmo/);
    assert.match(text, /📂 \*\*Todas\*\* · \*\*3 itens diferentes\*\* · \*\*6\*\* no total/);
    assert.match(text, /### 📂 Armas\\n🔫 \*\*Pistola\*\* ×1/);
    assert.match(text, /### 📂 Consumíveis\\n/);
    assert.match(text, /🍎 \*\*Maçã\*\* ×3/);

    const ids = customIds(view.layout);

    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(`inv:cat:${OWNER}`));
    assert.ok(ids.includes(`inv:drop:${OWNER}`));

    // numa prateleira só, sem o título dela repetido em cada bloco
    const shelf = buildInventoryView({ ownerId: OWNER, guildId: G, userId: OWNER, category: "consumable" });

    assert.doesNotMatch(allText(shelf.layout), /### 📂/);
    assert.deepEqual(layoutProblems(shelf.layout), []);

    // o clássico continua o mesmo embed
    assert.equal(view.embed.title, "🎒 Inventário de Eu Mesmo");
});

test("inventário vazio mostra o convite à loja nos dois formatos", () => {
    reset();

    const view = buildInventoryView({ ownerId: OWNER, guildId: G, userId: OWNER });

    assert.match(allText(view.layout), /Nenhum item nesta seleção/);
    assert.match(view.embed.description, /Nenhum item nesta seleção/);
});

test("/inventario: no V2 sai o layout; o clique de página atualiza com o layout novo", async () => {
    reset();

    giveItems([["apple", 1]]);

    await withV2(async () => {
        const v2 = (await run("hinventario")).sent[0];

        assert.ok(!v2.embeds);
        assert.equal(v2.components[0].type, "container");
    });

    const page = click(`inv:pg:${OWNER}:todas:1`);

    assert.equal(page.type, "update");
    assert.ok(Array.isArray(page.data.layout));
    assert.equal(toV2Data(page.data, { clear: true }).components[0].type, "container");
});

// ==========================================
// USAR ITEM
// ==========================================

test("usaritem no V2: cada item é uma seção com o botão Usar ao lado e a energia em barra", () => {
    reset();

    set("UPDATE players SET energy = 40 WHERE guild_id = ? AND user_id = ?", G, OWNER);

    giveItems([["apple", 3], ["coffee", 2], ["pistol", 1]]);

    const view = buildUseView({ ownerId: OWNER, guildId: G, userId: OWNER });

    assert.deepEqual(layoutProblems(view.layout), []);

    assert.match(allText(view.layout), /⚡ \*\*Energia\*\* [█░]{10} \*\*\d+\/100\*\*/);

    const sections = sectionsOf(view.layout);

    assert.equal(sections.length, 3);

    const apple = sections.find(section => section.texts[0].includes("Maçã"));

    assert.equal(apple.texts[0], "🍎 **Maçã** ×3");
    assert.match(apple.texts[1], /Comer · \+10 de energia/);
    assert.equal(apple.accessory.label, "Comer");
    assert.equal(apple.accessory.customId, `uso:item:${OWNER}:apple`);

    const gun = sections.find(section => section.texts[0].includes("Pistola"));

    assert.equal(gun.texts[1], "Equipar a arma");
    assert.equal(gun.accessory.customId, `uso:item:${OWNER}:pistol`);

    // até 6 itens os botões bastam: sem o menu no V2; o clássico mantém o menu
    assert.doesNotMatch(allText(view.layout), /uso:sel:/);
    assert.match(JSON.stringify(view.components), /uso:sel:/);
});

test("usaritem: o botão do item usa 1 unidade e atualiza o painel com o aviso", () => {
    reset();

    set("UPDATE players SET energy = 40, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?", Math.floor(Date.now() / 1000), G, OWNER);

    giveItems([["apple", 3]]);

    const answer = click(`uso:item:${OWNER}:apple`);

    assert.equal(answer.type, "update");
    assert.equal(get("SELECT quantity q FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = 'apple'", G, OWNER).q, 2);
    assert.match(allText(answer.data.layout), /Maçã/);
    assert.ok(Array.isArray(answer.data.layout));

    // só o dono do painel; item que não existe vira aviso
    assert.match(JSON.stringify(click(`uso:item:${OWNER}:apple`, { id: OTHER })), /outra pessoa/);
    assert.equal(click(`uso:item:${OWNER}:nada`).data.ephemeral, true);
});

test("usaritem com mais de 6 itens: o V2 mostra 6 botões e leva o menu com todos", () => {
    reset();

    giveItems([["apple", 1], ["coffee", 1], ["energy_drink", 1], ["pistol", 1], ["revolver", 1], ["smg", 1], ["shotgun", 1]]);

    const view = buildUseView({ ownerId: OWNER, guildId: G, userId: OWNER });

    assert.equal(view.usable.length, 7);
    assert.deepEqual(layoutProblems(view.layout), []);
    assert.ok(countComponents(view.layout) <= 40);
    assert.equal(sectionsOf(view.layout).length, 6);

    // o sétimo item só está no menu, que no V2 volta a aparecer
    const ids = customIds(view.layout);

    assert.ok(ids.includes(`uso:sel:${OWNER}`));
    assert.equal(ids.filter(id => id.startsWith("uso:item:")).length, 6);

    const menu = JSON.stringify(view.layout);

    assert.equal((menu.match(/"value":"/g) ?? []).length, 7);
});

test("sem itens usáveis, o V2 explica e o clássico também", () => {
    reset();

    const view = buildUseView({ ownerId: OWNER, guildId: G, userId: OWNER });

    assert.match(allText(view.layout), /nenhum item para usar/);
    assert.deepEqual(layoutProblems(view.layout), []);
    assert.match(view.embed.description, /nenhum item para usar/);
});

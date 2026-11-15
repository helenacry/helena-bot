import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A pesca (config/fishing.mjs, services/economy/fishing.mjs, fishing-view.mjs) e o comando /pescar.

const { FISHING_CONFIG, FISHING_TABLE, FISHING_TIERS } = await import("../config/fishing.mjs");
const { ITEMS, ITEM_CATEGORIES, getItem } = await import("../config/items.mjs");
const { PRISON_BLOCKED_COMMANDS } = await import("../config/crime.mjs");
const { formatMoney } = await import("../database/economy.mjs");
const { fish, fishingWait, hasRod, rollCatch, setFishingRandom } = await import("../services/economy/fishing.mjs");
const { blockedResponse, fishedResponse } = await import("../services/economy/fishing-view.mjs");
const { addItem, getItemQuantity } = await import("../services/economy/inventory.mjs");
const { cooldownsOf, buildCooldowns } = await import("../services/economy/cooldowns-view.mjs");
const { shopCategories } = await import("../services/panels/shop-view.mjs");
const { inventoryShelves } = await import("../services/panels/inventory-view.mjs");
const { calculateLevel } = await import("../services/progress/experience.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

const ME = "111111111111111111";

const MAX_CENTS = 100_000_000_000_000;

const NOW = 1_800_000_000;

let counter = 0;

const guild = () => `g-fish-${++counter}`;

// Cria a conta num servidor novo, com a vara.
function setup({ rod = true } = {}) {
    const g = guild();

    getPlayer(g, ME);

    if (rod) {
        tx(() => addItem(g, ME, "fishing_rod", 1));
    }

    return g;
}

const row = g => db.prepare("SELECT wallet, xp, level, energy, last_fish FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME);

const owns = (g, item) => getItemQuantity(g, ME, item);

const ledger = g => db.prepare("SELECT type, amount FROM transactions WHERE guild_id = ? AND user_id = ? ORDER BY id").all(g, ME).map(entry => ({ ...entry }));

// O número de 0 a 1 que cai no meio da faixa de uma linha da tabela.
function aim(id) {
    const total = FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

    let start = 0;

    for (const entry of FISHING_TABLE) {
        if (entry.id === id) {
            return (start + entry.weight / 2) / total;
        }

        start += entry.weight;
    }

    throw new Error("linha desconhecida: " + id);
}

const cast = (g, id, now = NOW) => fish(g, ME, { now, random: () => aim(id) });

// ==========================================
// A TABELA
// ==========================================

test("a tabela soma 1000 e só cita itens da pesca: sem preço de compra, vendáveis, na categoria certa", () => {
    assert.equal(FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0), 1000);

    assert.equal(new Set(FISHING_TABLE.map(entry => entry.id)).size, FISHING_TABLE.length, "sem linha repetida");

    for (const entry of FISHING_TABLE) {
        assert.ok(FISHING_TIERS[entry.tier], `${entry.id}: raridade existe`);

        if (!entry.item) {
            assert.equal(entry.tier, "nothing");
            continue;
        }

        const item = getItem(entry.item);

        assert.ok(item, `${entry.item} existe no catálogo`);
        assert.equal(item.category, "fish");
        assert.equal(item.buyPrice, null, `${item.id}: o que se pesca não se compra`);
        assert.equal(item.sellable, true);
        assert.ok(item.sellPrice > 0);
    }

    assert.ok(ITEM_CATEGORIES.fish, "a categoria existe");

    // todo item da categoria pode sair da pesca
    const fished = new Set(FISHING_TABLE.map(entry => entry.item).filter(Boolean));

    for (const item of ITEMS.filter(entry => entry.category === "fish")) {
        assert.ok(fished.has(item.id), `${item.id} não sai da pesca`);
    }
});

test("quanto mais raro, mais vale: a ordem das raridades acompanha o preço", () => {
    const order = ["junk", "common", "uncommon", "rare", "epic", "legendary"];

    const best = tier => Math.max(...FISHING_TABLE.filter(entry => entry.tier === tier && entry.item).map(entry => getItem(entry.item).sellPrice));
    const worst = tier => Math.min(...FISHING_TABLE.filter(entry => entry.tier === tier && entry.item).map(entry => getItem(entry.item).sellPrice));

    for (let index = 1; index < order.length; index += 1) {
        assert.ok(worst(order[index]) > best(order[index - 1]), `${order[index]} vale mais que ${order[index - 1]}`);
    }

    // e o mais raro tem a menor chance
    const chance = tier => FISHING_TABLE.filter(entry => entry.tier === tier).reduce((sum, entry) => sum + entry.weight, 0);

    assert.ok(chance("legendary") < chance("epic") && chance("epic") < chance("rare") && chance("rare") < chance("uncommon") && chance("uncommon") < chance("common"));
});

test("o valor médio de um lançamento fica entre R$ 7 e R$ 11 (a pesca complementa o trabalho, não o substitui)", () => {
    const total = FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

    const average = FISHING_TABLE.reduce((sum, entry) => sum + (entry.item ? getItem(entry.item).sellPrice * entry.weight : 0), 0) / total;

    assert.ok(average >= 700 && average <= 1100, `média de ${average / 100} reais por lançamento`);

    // contra o trabalho mais fraco (R$ 150 por hora): a pesca no ritmo máximo da espera não chega nem perto de pagar mais
    const perHour = average * (3600 / FISHING_CONFIG.cooldown);

    assert.ok(perHour < 15000 * 0.5, "a pesca no máximo da espera paga menos que meio salário do entregador");
});

test("rollCatch: cada linha sai exatamente com o seu peso, e os extremos do sorteio funcionam", () => {
    const counts = new Map();

    for (let index = 0; index < 1000; index += 1) {
        const entry = rollCatch(() => (index + 0.5) / 1000);

        counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    }

    for (const entry of FISHING_TABLE) {
        assert.equal(counts.get(entry.id), entry.weight, `${entry.id}: chance igual ao peso`);
    }

    assert.equal(rollCatch(() => 0).id, FISHING_TABLE[0].id);
    assert.equal(rollCatch(() => 0.9999999).id, FISHING_TABLE[FISHING_TABLE.length - 1].id);
    assert.equal(rollCatch(() => 1).id, FISHING_TABLE[FISHING_TABLE.length - 1].id, "1 não estoura a tabela");
    assert.equal(rollCatch(() => -1).id, FISHING_TABLE[0].id);
});

// ==========================================
// PESCAR
// ==========================================

test("sem a vara: recusa, e nada muda (energia, hora e inventário)", () => {
    const g = setup({ rod: false });

    const before = row(g);

    const result = cast(g, "lambari");

    assert.equal(result.status, "no_rod");
    assert.equal(result.rod.id, "fishing_rod");
    assert.equal(hasRod(g, ME), false);

    assert.deepEqual(row(g), before);
    assert.equal(owns(g, "lambari"), 0);
});

test("com a vara: pesca, põe o peixe no inventário, gasta energia, dá XP e marca a hora", () => {
    const g = setup();

    const before = row(g);

    const result = cast(g, "lambari");

    assert.equal(result.status, "ok");
    assert.equal(result.item.id, "lambari");
    assert.equal(result.stored, 1);
    assert.equal(result.sold, 0);

    assert.equal(owns(g, "lambari"), 1);

    const after = row(g);

    assert.equal(after.last_fish, NOW);
    assert.equal(after.xp - before.xp, FISHING_CONFIG.xp);
    assert.equal(after.energy, before.energy - FISHING_CONFIG.energyCost);
    assert.equal(after.wallet, before.wallet, "pescar não paga na hora: o peixe se vende depois");

    assert.equal(result.energy, after.energy);
    assert.equal(result.xp, FISHING_CONFIG.xp);

    assert.deepEqual(ledger(g), []);
});

test("cada pescaria soma ao que já tem, e a vara continua no inventário", () => {
    const g = setup();

    cast(g, "tilapia", NOW);
    cast(g, "tilapia", NOW + FISHING_CONFIG.cooldown);
    cast(g, "carp", NOW + 2 * FISHING_CONFIG.cooldown);

    assert.equal(owns(g, "tilapia"), 2);
    assert.equal(owns(g, "carp"), 1);
    assert.equal(owns(g, "fishing_rod"), 1);
});

test("esperando: recusa até a espera passar, e depois pesca de novo", () => {
    const g = setup();

    assert.equal(cast(g, "lambari", NOW).status, "ok");

    const energyAfter = row(g).energy;

    const early = cast(g, "lambari", NOW + 100);

    assert.equal(early.status, "wait");
    assert.equal(early.remaining, FISHING_CONFIG.cooldown - 100);

    assert.equal(row(g).energy, energyAfter, "esperar não gasta energia");
    assert.equal(owns(g, "lambari"), 1);

    assert.equal(fishingWait(NOW, NOW + 100), FISHING_CONFIG.cooldown - 100);
    assert.equal(fishingWait(NOW, NOW + FISHING_CONFIG.cooldown), 0);
    assert.equal(fishingWait(0, NOW), 0, "quem nunca pescou pode pescar");

    assert.equal(cast(g, "lambari", NOW + FISHING_CONFIG.cooldown - 1).status, "wait");
    assert.equal(cast(g, "lambari", NOW + FISHING_CONFIG.cooldown).status, "ok");
    assert.equal(owns(g, "lambari"), 2);
});

test("sem energia: recusa dizendo quanto falta, e a espera não começa", () => {
    const g = setup();

    db.prepare("UPDATE players SET energy = 3, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?").run(NOW, g, ME);

    const result = cast(g, "lambari", NOW);

    assert.equal(result.status, "no_energy");
    assert.equal(result.cost, FISHING_CONFIG.energyCost);
    assert.equal(result.energy, 3);
    assert.equal(result.missing, FISHING_CONFIG.energyCost - 3);

    const after = row(g);

    assert.equal(after.last_fish, 0, "não pescou: pode tentar de novo assim que tiver energia");
    assert.equal(after.energy, 3);
    assert.equal(owns(g, "lambari"), 0);

    // com energia de volta, pesca
    db.prepare("UPDATE players SET energy = 50, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?").run(NOW, g, ME);

    assert.equal(cast(g, "lambari", NOW).status, "ok");
});

test("a isca volta vazia: sem item, mas gasta a energia, dá o XP e a espera começa", () => {
    const g = setup();

    const before = row(g);

    const result = cast(g, "nothing");

    assert.equal(result.status, "ok");
    assert.equal(result.item, null);
    assert.equal(result.stored, 0);

    const after = row(g);

    assert.equal(after.last_fish, NOW);
    assert.equal(after.energy, before.energy - FISHING_CONFIG.energyCost);
    assert.equal(after.xp - before.xp, FISHING_CONFIG.xp);

    assert.equal(cast(g, "lambari", NOW + 1).status, "wait");
});

test("o lixo também é item (vale quase nada), e todos os itens da tabela saem", () => {
    const g = setup();

    let now = NOW;

    for (const entry of FISHING_TABLE.filter(line => line.item)) {
        // um inventário novo a cada item para não esbarrar no limite nem na espera
        const result = fish(g, ME, { now, random: () => aim(entry.id) });

        assert.equal(result.status, "ok", entry.id);
        assert.equal(result.item.id, entry.item);
        assert.equal(owns(g, entry.item), 1);

        now += FISHING_CONFIG.cooldown;

        db.prepare("UPDATE players SET energy = 100, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?").run(now, g, ME);
    }

    assert.ok(getItem("old_boot").sellPrice <= 100, "lixo vale quase nada");
});

test("subir de nível pela pesca é avisado", () => {
    const g = setup();

    const player = row(g);

    // o XP em que a pescaria de 3 XP passa para o nível seguinte
    let xp = player.xp;

    while (calculateLevel(xp + FISHING_CONFIG.xp) === calculateLevel(xp)) {
        xp += 1;
    }

    db.prepare("UPDATE players SET xp = ?, level = ? WHERE guild_id = ? AND user_id = ?").run(xp, calculateLevel(xp), g, ME);

    const result = cast(g, "lambari");

    assert.equal(result.leveledUp, true);
    assert.equal(result.level, calculateLevel(xp) + 1);
    assert.match(JSON.stringify(fishedResponse(result).data), /Subiu para o nível/);
});

test("o limite do inventário: com 99 do peixe ele é vendido na hora, pelo preço base, no extrato", () => {
    const g = setup();

    tx(() => addItem(g, ME, "lambari", 99));

    const before = row(g);

    const result = cast(g, "lambari");

    assert.equal(result.status, "ok");
    assert.equal(result.stored, 0);
    assert.equal(result.sold, 1);
    assert.equal(result.money, getItem("lambari").sellPrice);
    assert.equal(result.lost, 0);

    assert.equal(owns(g, "lambari"), 99, "continua no limite");
    assert.equal(row(g).wallet, before.wallet + getItem("lambari").sellPrice);
    assert.deepEqual(ledger(g), [{ type: "fish_sale", amount: getItem("lambari").sellPrice }]);

    const text = JSON.stringify(fishedResponse(result).data);

    assert.match(text, /vendido na hora/);
});

test("carteira no teto: vende só o que cabe e avisa o resto perdido, sem estourar", () => {
    const g = setup();

    tx(() => addItem(g, ME, "dourado", 99));

    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(MAX_CENTS - 1000, g, ME);

    const result = cast(g, "dourado");

    assert.equal(result.sold, 1);
    assert.equal(result.money, 1000);
    assert.equal(result.lost, getItem("dourado").sellPrice - 1000);

    assert.equal(row(g).wallet, MAX_CENTS);
});

test("duas pescarias ao mesmo tempo (a mesma hora) não passam as duas", () => {
    const g = setup();

    assert.equal(cast(g, "lambari", NOW).status, "ok");
    assert.equal(cast(g, "lambari", NOW).status, "wait");

    assert.equal(owns(g, "lambari"), 1);
});

test("o sorteio de verdade devolve sempre uma linha válida (e setFishingRandom troca e volta)", () => {
    for (let index = 0; index < 200; index += 1) {
        assert.ok(FISHING_TABLE.includes(rollCatch()));
    }

    const g = setup();

    setFishingRandom(() => aim("pirarucu"));

    try {
        assert.equal(fish(g, ME, { now: NOW }).item.id, "pirarucu");

    } finally {
        setFishingRandom();
    }
});

// ==========================================
// AS TELAS
// ==========================================

const texto = response => JSON.stringify(response.data);

test("as telas: pescou, nada, rara, lendária, sem vara, esperando e sem energia", () => {
    const g = setup();

    const common = texto(fishedResponse(cast(g, "lambari", NOW)));

    assert.match(common, /Lambari/);
    assert.match(common, /Vale/);
    assert.match(common, /\/vender/);
    assert.match(common, /pescar de novo em/);

    const empty = texto(fishedResponse(cast(g, "nothing", NOW + FISHING_CONFIG.cooldown)));

    assert.match(empty, /A isca voltou vazia/);
    assert.match(empty, /Nada mordeu/);

    const rare = texto(fishedResponse(cast(g, "dourado", NOW + 2 * FISHING_CONFIG.cooldown)));

    assert.match(rare, /Que pescaria/);
    assert.match(rare, /Raro/);

    const legendary = texto(fishedResponse(cast(g, "pirarucu", NOW + 3 * FISHING_CONFIG.cooldown)));

    assert.match(legendary, /Não é possível/);
    assert.match(legendary, /Lendário/);
    assert.match(legendary, /festa/);

    const junk = texto(fishedResponse(cast(g, "old_boot", NOW + 4 * FISHING_CONFIG.cooldown)));

    assert.match(junk, /Bota velha/);

    const wait = texto(blockedResponse(cast(g, "lambari", NOW + 4 * FISHING_CONFIG.cooldown + 5)));

    assert.match(wait, /ainda está na água/);

    const noRod = texto(blockedResponse(cast(setup({ rod: false }), "lambari")));

    assert.match(noRod, /Falta a vara/);
    assert.ok(noRod.replace(/\s/g, " ").includes(formatMoney(getItem("fishing_rod").buyPrice).replace(/\s/g, " ")), "o preço da vara na tela");
    assert.match(noRod, /Ferramentas/);

    const tired = setup();

    db.prepare("UPDATE players SET energy = 0, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?").run(NOW, tired, ME);

    const noEnergy = texto(blockedResponse(cast(tired, "lambari")));

    assert.match(noEnergy, /Sem energia para pescar/);
    assert.match(noEnergy, /Faltam/);
});

// ==========================================
// O COMANDO
// ==========================================

const command = resolverComando(comandos, "pescar");

const slash = (g, userId = ME) => ({
    id: "int-" + Math.random(),
    guildId: g,
    channelId: "c1",
    user: { id: userId, username: "pescador" },
    data: { options: {} }
});

test("o comando: nome, alias, sem opções, descrição curta, bloqueado na prisão", () => {
    assert.ok(command, "/pescar existe");
    assert.equal(command.name, "pescar");
    assert.deepEqual(command.aliases, ["fish"]);
    assert.ok(command.description.length <= 70, "sobra espaço para a etiqueta da categoria");

    assert.ok(PRISON_BLOCKED_COMMANDS.has("pescar"), "preso não pesca");

    assert.equal(resolverComando(comandos, "fish"), command, "o apelido leva ao mesmo comando");

    assert.match(getItem("fishing_rod").description, /\/pescar/);
});

test("o comando de ponta a ponta: sem vara avisa, com a vara pesca, depois pede para esperar", async () => {
    const without = setup({ rod: false });

    const refused = await silently(() => command.execute(slash(without)));

    assert.match(texto(refused), /Falta a vara/);

    const g = setup();

    const first = await silently(() => command.execute(slash(g)));

    assert.match(texto(first), /Pescaria|Nada mordeu/);

    const second = await silently(() => command.execute(slash(g)));

    assert.match(texto(second), /ainda está na água/);

    const noGuild = await silently(() => command.execute({ id: "x", user: { id: ME }, data: { options: {} } }));

    assert.match(texto(noGuild), /identificar/);
});

// ==========================================
// RECARGAS, LOJA E INVENTÁRIO
// ==========================================

test("/cooldowns: sem vara a linha diz que precisa dela, com a vara mostra pronto e depois a espera", () => {
    const g = setup({ rod: false });

    const find = (guildId, now) => cooldownsOf(guildId, ME, now).legal.find(item => item.label === "Pescar");

    assert.equal(find(g, NOW).locked, "Precisa de uma vara de pesca");

    const ready = setup();

    assert.deepEqual({ ...find(ready, NOW), label: undefined }, { remaining: 0, label: undefined });

    cast(ready, "lambari", NOW);

    assert.equal(find(ready, NOW + 60).remaining, FISHING_CONFIG.cooldown - 60);

    const screen = texto(embedLike(buildCooldowns({ guildId: g, user: { id: ME, username: "x" }, now: NOW })));

    assert.match(screen, /Pescar/);
    assert.match(screen, /Precisa de uma vara de pesca/);
});

function embedLike(view) {
    return { data: view.embed };
}

test("a loja não oferece a categoria da pesca (nada nela se compra), mas o inventário mostra", () => {
    assert.equal(shopCategories().some(category => category.value === "fish"), false);

    const choices = command && resolverComando(comandos, "loja").options[0].choices.map(choice => choice.value);

    assert.equal(choices.includes("fish"), false, "o /loja não lista uma prateleira vazia");
    assert.ok(choices.includes("consumable"));

    const shelves = inventoryShelves([{ category: "fish", item_id: "lambari", quantity: 2 }]);

    assert.ok(shelves.some(shelf => shelf.value === "fish" && shelf.count === 1));
});

test("a vara se compra na loja, uma só, e o peixe se vende pelo /vender", () => {
    const rod = getItem("fishing_rod");

    assert.equal(rod.buyPrice, 5000);
    assert.equal(rod.maxStack, 1);

    for (const entry of FISHING_TABLE.filter(line => line.item)) {
        const item = getItem(entry.item);

        assert.equal(item.sellable, true);
    }
});

test("a coluna da última pescaria existe nos jogadores", () => {
    const columns = db.prepare("PRAGMA table_info(players)").all().map(column => column.name);

    assert.ok(columns.includes("last_fish"));
});

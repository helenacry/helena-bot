import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Os contadores do jogo (services/progress/stats.mjs), as missões semanais (config/missions.mjs,
// services/economy/missions.mjs, missions-view.mjs) e as conquistas por quantidade.

const { addStat, countStats, getStat, getStats, setStatMax } = await import("../services/progress/stats.mjs");
const { ALL_MISSIONS, MISSIONS, WEEKLY_MISSIONS, getMission, getMissionPeriod, getMissionReset } = await import("../config/missions.mjs");
const { claimMission, getPlayerMissions, recordMissionEvent } = await import("../services/economy/missions.mjs");
const { buildMissions } = await import("../services/economy/missions-view.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { layoutProblems, countComponents, V2_LIMITS } = await import("../utils/components-v2.mjs");
const { ACHIEVEMENTS, getAchievement } = await import("../config/achievements.mjs");
const { checkAchievements, getAchievementProgress } = await import("../services/progress/achievements.mjs");
const { fish } = await import("../services/economy/fishing.mjs");
const { FISHING_TABLE } = await import("../config/fishing.mjs");
const { addItem } = await import("../services/economy/inventory.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const ME = "111111111111111111";

let counter = 0;

const guild = () => `g-stats-${++counter}`;

const setup = () => {
    const g = guild();

    getPlayer(g, ME);

    return g;
};

const wallet = g => db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME).wallet;

const record = (g, event, now) => tx(() => recordMissionEvent(g, ME, event, now));

const missionOf = (g, id, now = Date.now()) => getPlayerMissions(g, ME, now).find(mission => mission.id === id);

// Quarta-feira, 18/11/2026, meio-dia UTC.
const WED = Date.UTC(2026, 10, 18, 12);
const DAY = 86_400_000;

// ==========================================
// OS CONTADORES
// ==========================================

test("contadores: somam, guardam o maior valor, listam e são separados por pessoa e servidor", () => {
    const g = setup();
    const other = setup();

    assert.equal(getStat(g, ME, "event_work"), 0);

    assert.equal(addStat(g, ME, "event_work"), 1);
    assert.equal(addStat(g, ME, "event_work", 4), 5);

    assert.equal(setStatMax(g, ME, "best", 7), 7);
    assert.equal(setStatMax(g, ME, "best", 3), 7, "só sobe");
    assert.equal(setStatMax(g, ME, "best", 9), 9);

    assert.deepEqual(getStats(g, ME), { event_work: 5, best: 9 });

    assert.equal(getStat(other, ME, "event_work"), 0, "outro servidor");
    assert.equal(getStat(g, "222222222222222222", "event_work"), 0, "outra pessoa");
});

test("contadores: nomes e valores inválidos são recusados, e o prefixo conta só o que passou de zero", () => {
    const g = setup();

    for (const bad of ["", "Maiúscula", "com espaço", "x".repeat(65), "a;b"]) {
        assert.throws(() => addStat(g, ME, bad), /Contador inválido/, bad);
    }

    assert.throws(() => addStat(g, ME, "ok", 0), /inteiro positivo/);
    assert.throws(() => addStat(g, ME, "ok", 1.5), /inteiro positivo/);
    assert.throws(() => addStat("", ME, "ok"), /Contador inválido/);
    assert.throws(() => setStatMax(g, ME, "ok", -1), /não negativo/);

    addStat(g, ME, "fish:lambari");
    addStat(g, ME, "fish:carp", 3);
    addStat(g, ME, "fishing_casts", 9);
    setStatMax(g, ME, "fish:zero", 0);

    assert.equal(countStats(g, ME, "fish:"), 2, "só as espécies, e só as acima de zero");

    // os curingas do LIKE não escapam
    addStat(g, ME, "a_b");
    addStat(g, ME, "axb");

    assert.equal(countStats(g, ME, "a_"), 1);
    assert.equal(countStats(g, ME, "%"), 0);
});

// ==========================================
// OS PERÍODOS
// ==========================================

test("período: o dia é a data UTC e a semana é a segunda-feira em que começou (com o w na frente)", () => {
    assert.equal(getMissionPeriod(WED), "2026-11-18");
    assert.equal(getMissionPeriod(WED, "daily"), "2026-11-18");

    // a semana de quarta, de domingo e de segunda
    assert.equal(getMissionPeriod(WED, "weekly"), "w2026-11-16");
    assert.equal(getMissionPeriod(Date.UTC(2026, 10, 22, 23, 59), "weekly"), "w2026-11-16", "domingo ainda é a mesma semana");
    assert.equal(getMissionPeriod(Date.UTC(2026, 10, 23, 0, 0), "weekly"), "w2026-11-23", "segunda abre a seguinte");
    assert.equal(getMissionPeriod(Date.UTC(2026, 10, 16, 0, 0), "weekly"), "w2026-11-16", "a própria segunda");

    // virada de mês e de ano
    assert.equal(getMissionPeriod(Date.UTC(2026, 11, 31), "weekly"), "w2026-12-28");
    assert.equal(getMissionPeriod(Date.UTC(2027, 0, 3), "weekly"), "w2026-12-28");
});

test("reinício: a próxima meia-noite UTC, e a da próxima segunda-feira", () => {
    assert.equal(getMissionReset(WED, "daily"), Date.UTC(2026, 10, 19) / 1000);
    assert.equal(getMissionReset(WED, "weekly"), Date.UTC(2026, 10, 23) / 1000);

    // numa segunda-feira, a semana só reinicia na seguinte
    assert.equal(getMissionReset(Date.UTC(2026, 10, 23, 8), "weekly"), Date.UTC(2026, 10, 30) / 1000);
    assert.equal(getMissionReset(Date.UTC(2026, 10, 22, 23, 59), "weekly"), Date.UTC(2026, 10, 23) / 1000);
});

test("a lista: MISSIONS segue sendo só as diárias, as semanais têm IDs próprios e tudo tem período e evento", () => {
    assert.ok(MISSIONS.every(mission => mission.period === "daily"));
    assert.ok(WEEKLY_MISSIONS.every(mission => mission.period === "weekly"));

    assert.equal(ALL_MISSIONS.length, MISSIONS.length + WEEKLY_MISSIONS.length);
    assert.equal(new Set(ALL_MISSIONS.map(mission => mission.id)).size, ALL_MISSIONS.length, "IDs únicos");
    assert.ok(ALL_MISSIONS.length <= 25, "cabem nas escolhas do comando");

    for (const mission of ALL_MISSIONS) {
        assert.ok(mission.event && mission.target > 0 && mission.reward > 0 && mission.xp > 0, mission.id);
        assert.equal(getMission(mission.id), mission);
    }

    // a semanal paga mais que a diária do mesmo tipo
    assert.ok(getMission("week_work").reward > getMission("work").reward);
    assert.ok(getMission("week_fish").reward > getMission("fish").reward);
});

// ==========================================
// O PROGRESSO
// ==========================================

test("um evento anda a missão do dia e a da semana juntas, e soma no contador do jogo", () => {
    const g = setup();

    record(g, "work", WED);

    assert.equal(missionOf(g, "work", WED).progress, 1);
    assert.equal(missionOf(g, "week_work", WED).progress, 1);
    assert.equal(getStat(g, ME, "event_work"), 1);

    record(g, "work", WED);

    assert.equal(missionOf(g, "work", WED).progress, 2);
    assert.equal(missionOf(g, "week_work", WED).progress, 2);

    // um evento sem missão ("rob") só conta
    record(g, "rob", WED);

    assert.equal(getStat(g, ME, "event_rob"), 1);
});

test("no dia seguinte a diária zera e a semanal continua; na semana seguinte as duas zeram", () => {
    const g = setup();

    record(g, "work", WED);
    record(g, "work", WED);

    const next = WED + DAY;

    assert.equal(missionOf(g, "work", next).progress, 0, "diária nova");
    assert.equal(missionOf(g, "week_work", next).progress, 2, "a semanal guarda");

    record(g, "work", next);

    assert.equal(missionOf(g, "week_work", next).progress, 3);

    // domingo ainda é a mesma semana; segunda zera
    assert.equal(missionOf(g, "week_work", Date.UTC(2026, 10, 22, 20)).progress, 3);
    assert.equal(missionOf(g, "week_work", Date.UTC(2026, 10, 23, 1)).progress, 0);
});

test("o progresso para no alvo, e a semanal de 10 turnos não passa de 10", () => {
    const g = setup();

    for (let index = 0; index < 14; index += 1) {
        record(g, "work", WED);
    }

    assert.equal(missionOf(g, "week_work", WED).progress, getMission("week_work").target);
    assert.equal(missionOf(g, "work", WED).progress, getMission("work").target);
    assert.equal(getStat(g, ME, "event_work"), 14, "o contador do jogo não para no alvo");
});

test("resgatar a semanal paga uma vez, no período certo, e não aceita antes da hora", () => {
    const g = setup();

    const mission = getMission("week_fish");

    assert.equal(claimMission({ guildId: g, userId: ME, missionId: mission.id, now: WED }).status, "incomplete");

    for (let index = 0; index < mission.target; index += 1) {
        record(g, "fish", WED + index * 1000);
    }

    const before = wallet(g);

    const paid = claimMission({ guildId: g, userId: ME, missionId: mission.id, now: WED });

    assert.equal(paid.status, "ok");
    assert.equal(wallet(g), before + mission.reward);
    assert.equal(paid.mission.id, mission.id);

    assert.equal(claimMission({ guildId: g, userId: ME, missionId: mission.id, now: WED + DAY }).status, "claimed", "ainda é a mesma semana");
    assert.equal(wallet(g), before + mission.reward, "não paga duas vezes");

    // na semana seguinte começa de novo
    assert.equal(missionOf(g, mission.id, Date.UTC(2026, 10, 23, 9)).claimed, false);
    assert.equal(missionOf(g, mission.id, Date.UTC(2026, 10, 23, 9)).progress, 0);
});

test("a pesca anda a diária e a semanal, conta o peixe e a espécie, e o lixo não entra no álbum", () => {
    const g = setup();

    tx(() => addItem(g, ME, "fishing_rod", 1));

    const aim = id => {
        const total = FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

        let start = 0;

        for (const entry of FISHING_TABLE) {
            if (entry.id === id) return (start + entry.weight / 2) / total;

            start += entry.weight;
        }

        throw new Error(id);
    };

    const now = Math.floor(Date.now() / 1000);

    const cast = (id, offset) => fish(g, ME, { now: now + offset * 700, random: () => aim(id) });

    assert.equal(cast("lambari", 0).status, "ok");
    assert.equal(cast("nothing", 1).status, "ok");
    assert.equal(cast("old_boot", 2).status, "ok");
    assert.equal(cast("lambari", 3).status, "ok");

    assert.equal(missionOf(g, "fish").progress, 3, "a diária parou no alvo de 3");
    assert.equal(missionOf(g, "week_fish").progress, 4);

    assert.equal(getStat(g, ME, "event_fish"), 4, "lançamentos");
    assert.equal(getStat(g, ME, "fish_catches"), 3, "o que veio (não conta a isca vazia)");
    assert.equal(getStat(g, ME, "fish:lambari"), 2);
    assert.equal(getStat(g, ME, "fish:old_boot"), 0, "lixo não é espécie");
    assert.equal(countStats(g, ME, "fish:"), 1);
});

test("o crime e o roubo com sucesso contam (o código chama o evento nos dois caminhos de sucesso)", () => {
    const crime = readFileSync(new URL("../services/crime/crime.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const robbery = readFileSync(new URL("../services/crime/robbery.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");

    assert.match(crime, /recordMissionEvent\(guildId, userId, "crime"\);\n\n    return \{\n        success: true,/);
    assert.match(robbery, /recordMissionEvent\(guildId, thiefId, "rob"\);\n\n    return \{\n        success: true,/);
});

// ==========================================
// A TELA
// ==========================================

const buttonsOf = view => view.components.flatMap(line => line.components);

test("as abas: Diárias mostra as diárias e Semanais mostra as semanais, cada uma com o seu reinício", () => {
    const g = setup();

    const daily = buildMissions({ guildId: g, userId: ME });

    assert.match(JSON.stringify(daily.layout), /Missões do dia/);
    assert.match(JSON.stringify(daily.layout), /meia-noite UTC/);
    assert.equal(daily.embed.fields.length, MISSIONS.length);

    const weekly = buildMissions({ guildId: g, userId: ME, tab: "weekly" });

    assert.match(JSON.stringify(weekly.layout), /Missões da semana/);
    assert.match(JSON.stringify(weekly.layout), /segunda-feira/);
    assert.equal(weekly.embed.fields.length, WEEKLY_MISSIONS.length);

    assert.match(JSON.stringify(weekly.embed.fields), /Semana de trabalho/);
    assert.doesNotMatch(JSON.stringify(weekly.embed.fields), /Trabalhador dedicado/);

    // uma aba inventada volta para as diárias
    assert.equal(buildMissions({ guildId: g, userId: ME, tab: "xyz" }).embed.title, daily.embed.title);

    // o botão da aba de agora fica desligado
    const tabs = buttonsOf(weekly).filter(button => button.customId.startsWith("miss:tab:"));

    assert.deepEqual(tabs.map(button => [button.label, button.disabled]), [["Diárias", false], ["Semanais", true]]);
});

test("o V2 de cada aba cumpre o limite de 40 componentes, e a aba mostra quando há recompensa pronta na outra", () => {
    const g = setup();

    for (const tab of ["daily", "weekly"]) {
        const view = buildMissions({ guildId: g, userId: ME, tab });

        assert.deepEqual(layoutProblems(view.layout), [], tab);
        assert.ok(countComponents(view.layout) <= V2_LIMITS.components, `${tab}: ${countComponents(view.layout)}`);
    }

    // a missão diária de pesca pronta aparece como "Diárias (1)" na aba das semanais
    for (let index = 0; index < getMission("fish").target; index += 1) {
        record(g, "fish", Date.now());
    }

    const weekly = buildMissions({ guildId: g, userId: ME, tab: "weekly" });

    assert.ok(buttonsOf(weekly).some(button => button.label === "Diárias (1)"));
    assert.match(JSON.stringify(weekly.layout), /outra aba/);
});

test("os cliques: a aba troca na mesma mensagem, e o resgate semanal volta para a aba semanal", () => {
    const g = setup();

    const click = customId => handlePanelClick({ guildId: g, user: { id: ME }, data: { customId } });

    const tab = click(`miss:tab:${ME}:weekly`);

    assert.equal(tab.type, "update");
    assert.match(JSON.stringify(tab.data.layout), /Missões da semana/);

    // de outra pessoa não troca
    assert.match(JSON.stringify(handlePanelClick({ guildId: g, user: { id: "222222222222222222" }, data: { customId: `miss:tab:${ME}:weekly` } })), /de outra pessoa/);

    // a semanal pronta é resgatada e a tela continua na aba semanal
    const mission = getMission("week_daily");

    for (let index = 0; index < mission.target; index += 1) {
        record(g, "daily", Date.now());
    }

    const claimed = click(`miss:resgatar:${ME}:${mission.id}`);

    assert.equal(claimed.type, "update");
    assert.match(JSON.stringify(claimed.data.layout), /Missões da semana/);
    assert.match(JSON.stringify(claimed.data.layout), /resgatada/);
});

test("/missoes: as semanais entram nas escolhas e o resgate pelo comando paga a semanal", async () => {
    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "missoes");

    const choices = command.options[0].choices.map(choice => choice.value);

    for (const mission of ALL_MISSIONS) {
        assert.ok(choices.includes(mission.id), mission.id);
    }

    assert.ok(command.description.length <= 70);

    const g = setup();

    const mission = getMission("week_work");

    for (let index = 0; index < mission.target; index += 1) {
        record(g, "work", Date.now());
    }

    const before = wallet(g);

    const response = await command.execute({ id: "i1", guildId: g, channelId: "c", user: { id: ME }, data: { options: { resgatar: mission.id } } });

    assert.match(JSON.stringify(response.data), /Missão concluída/);
    assert.equal(wallet(g), before + mission.reward);
});

// ==========================================
// AS CONQUISTAS POR QUANTIDADE
// ==========================================

test("conquistas por contador: sobem com o progresso e destravam no alvo (e nunca voltam atrás)", () => {
    const g = setup();

    const fisher = getAchievement("fisher");

    assert.equal(getAchievementProgress(g, ME, fisher), 0);

    for (let index = 0; index < 9; index += 1) {
        addStat(g, ME, "event_fish");
    }

    assert.equal(checkAchievements(g, ME).some(achievement => achievement.id === "fisher"), false);

    addStat(g, ME, "event_fish");

    assert.equal(getAchievementProgress(g, ME, fisher), 10);
    assert.deepEqual(checkAchievements(g, ME).map(achievement => achievement.id), ["fisher"]);
    assert.deepEqual(checkAchievements(g, ME), [], "só destrava uma vez");
});

test("o álbum de peixes pede as 8 espécies, e a Lenda do Rio pede o pirarucu", () => {
    const g = setup();

    const species = FISHING_TABLE.filter(entry => entry.item && entry.tier !== "junk").map(entry => entry.item);

    assert.equal(species.length, 8, "o álbum fala em 8 espécies: confira a descrição se a tabela mudar");
    assert.equal(getAchievement("fish_album").requirement.target, species.length);

    for (const id of species.filter(id => id !== "pirarucu")) {
        addStat(g, ME, `fish:${id}`);
    }

    assert.equal(getAchievementProgress(g, ME, getAchievement("fish_album")), 7);
    assert.equal(getAchievementProgress(g, ME, getAchievement("river_legend")), 0);

    addStat(g, ME, "fish:pirarucu");

    assert.equal(getAchievementProgress(g, ME, getAchievement("fish_album")), 8);

    const ids = checkAchievements(g, ME).map(achievement => achievement.id).sort();

    assert.deepEqual(ids, ["fish_album", "river_legend"]);
});

test("trabalho, crime e roubo: as conquistas leem os contadores de evento", () => {
    const g = setup();

    for (const [event, achievement, target] of [["work", "worker_50", 50], ["crime", "crook_10", 10], ["rob", "light_hands", 10]]) {
        assert.equal(getAchievement(achievement).requirement.key, `event_${event}`);
        assert.equal(getAchievement(achievement).requirement.target, target);

        addStat(g, ME, `event_${event}`, target - 1);

        assert.equal(checkAchievements(g, ME).some(entry => entry.id === achievement), false, achievement);

        addStat(g, ME, `event_${event}`);

        assert.ok(checkAchievements(g, ME).some(entry => entry.id === achievement), achievement);
    }
});

test("toda conquista tem um tipo de requisito que o jogo sabe medir", () => {
    const known = new Set(["level", "wealth", "streak", "gems", "duel_wins", "stat", "stat_count"]);

    for (const achievement of Object.values(ACHIEVEMENTS)) {
        assert.ok(known.has(achievement.requirement.type), `${achievement.id}: tipo ${achievement.requirement.type}`);
        assert.ok(achievement.requirement.target > 0, achievement.id);

        if (achievement.requirement.type === "stat") assert.ok(achievement.requirement.key, achievement.id);
        if (achievement.requirement.type === "stat_count") assert.ok(achievement.requirement.prefix, achievement.id);
    }
});

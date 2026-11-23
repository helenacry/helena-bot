import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Os eventos da semana (config/events.mjs, services/economy/events.mjs, events-view.mjs) e o /evento. Os testes rodam
// com HELENA_EVENTS=off (tests/helpers.mjs); aqui ele é ligado a cada teste e o relógio é combinado.

const { EVENTS, EVENT_UTC_OFFSET_HOURS, WEEKDAY_NAMES, getEvent } = await import("../config/events.mjs");
const { activeEvents, eventMultiplier, eventNotes, eventsEnabled, upcomingEvents } = await import("../services/economy/events.mjs");
const { buildEvents } = await import("../services/economy/events-view.mjs");
const { fish, rollCatch } = await import("../services/economy/fishing.mjs");
const { FISHING_TABLE } = await import("../config/fishing.mjs");
const { getJob } = await import("../config/jobs.mjs");
const { addItem } = await import("../services/economy/inventory.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { localizeData } = await import("../services/platform/i18n.mjs");
const { layoutProblems } = await import("../utils/components-v2.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const ME = "111111111111111111";

const texto = value => JSON.stringify(value);

// Liga os eventos só durante o teste.
function withEvents(fn, value = "on") {
    const before = process.env.HELENA_EVENTS;

    process.env.HELENA_EVENTS = value;

    const restore = () => {
        process.env.HELENA_EVENTS = before;
    };

    try {
        const result = fn();

        if (result?.then) return result.finally(restore);

        restore();

        return result;

    } catch (error) {
        restore();

        throw error;
    }
}

// Um instante no horário de Brasília (UTC-3): o ano, o mês (1 a 12), o dia, a hora e o minuto de lá, em ms UTC.
const brt = (year, month, day, hour = 12, minute = 0) => Date.UTC(year, month - 1, day, hour - EVENT_UTC_OFFSET_HOURS, minute);

// novembro de 2026: 16 é segunda, 18 quarta, 20 sexta, 21 sábado, 22 domingo, 23 segunda
const MON = brt(2026, 11, 16);
const TUE = brt(2026, 11, 17);
const WED = brt(2026, 11, 18);
const THU = brt(2026, 11, 19);
const FRI = brt(2026, 11, 20);
const SAT = brt(2026, 11, 21);
const SUN = brt(2026, 11, 22);

// ==========================================
// A CONFIGURAÇÃO
// ==========================================

test("os eventos: IDs únicos, dias de 0 a 6, efeitos que o jogo conhece e descrição que cita o comando", () => {
    assert.equal(new Set(EVENTS.map(event => event.id)).size, EVENTS.length);

    const known = new Set(["xp", "salary", "fishLuck"]);

    for (const event of EVENTS) {
        assert.ok(event.name && event.emoji && event.description, event.id);
        assert.ok(event.days.length >= 1 && event.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6), event.id);

        for (const [effect, value] of Object.entries(event.effects)) {
            assert.ok(known.has(effect), `${event.id}: efeito ${effect}`);
            assert.ok(value > 1 && value <= 3, `${event.id}: ${effect} = ${value}`);
        }

        assert.match(event.description, /\/[a-z]+/, event.id);
        assert.equal(getEvent(event.id), event);
    }

    assert.equal(getEvent("nao_existe"), null);
    assert.equal(WEEKDAY_NAMES.length, 7);
});

test("HELENA_EVENTS: ligado por padrão e desligável, lido a cada chamada", () => {
    const before = process.env.HELENA_EVENTS;

    delete process.env.HELENA_EVENTS;

    assert.equal(eventsEnabled(), true);

    process.env.HELENA_EVENTS = "off";

    assert.equal(eventsEnabled(), false);
    assert.deepEqual(activeEvents(WED), []);
    assert.deepEqual(upcomingEvents(WED), []);
    assert.equal(eventMultiplier("salary", WED), 1);

    process.env.HELENA_EVENTS = "OFF";

    assert.equal(eventsEnabled(), false);

    process.env.HELENA_EVENTS = "on";

    assert.equal(eventsEnabled(), true);

    process.env.HELENA_EVENTS = before;
});

// ==========================================
// QUAIS ESTÃO ATIVOS
// ==========================================

test("cada dia da semana tem os eventos certos, no horário de Brasília", () => withEvents(() => {
    const idsAt = now => activeEvents(now).map(({ event }) => event.id);

    assert.deepEqual(idsAt(MON), []);
    assert.deepEqual(idsAt(TUE), []);
    assert.deepEqual(idsAt(WED), ["worker_wednesday"]);
    assert.deepEqual(idsAt(THU), []);
    assert.deepEqual(idsAt(FRI), ["good_tide_friday"]);
    assert.deepEqual(idsAt(SAT), ["double_xp_weekend"]);
    assert.deepEqual(idsAt(SUN), ["double_xp_weekend"]);
}));

test("a virada do dia é à meia-noite de Brasília, não do UTC", () => withEvents(() => {
    // quarta, 23h59 em Brasília (já é quinta, 02h59 no UTC): ainda é a quarta
    assert.deepEqual(activeEvents(brt(2026, 11, 18, 23, 59)).map(({ event }) => event.id), ["worker_wednesday"]);

    // quinta, 00h00 em Brasília: acabou
    assert.deepEqual(activeEvents(brt(2026, 11, 19, 0, 0)), []);

    // terça, 21h em Brasília (já é quarta, 00h no UTC): ainda é a terça, sem evento
    assert.deepEqual(activeEvents(brt(2026, 11, 17, 21, 0)), []);

    // quarta, 00h00 em Brasília: começou
    assert.equal(activeEvents(brt(2026, 11, 18, 0, 0)).length, 1);
}));

test("quando acaba: o evento de um dia acaba na meia-noite seguinte e o de fim de semana, na segunda-feira", () => withEvents(() => {
    const [wed] = activeEvents(WED);

    assert.equal(wed.endsAt, brt(2026, 11, 19, 0, 0) / 1000);

    const [sat] = activeEvents(SAT);

    assert.equal(sat.endsAt, brt(2026, 11, 23, 0, 0) / 1000, "o sábado vai até a segunda");

    const [sun] = activeEvents(SUN);

    assert.equal(sun.endsAt, brt(2026, 11, 23, 0, 0) / 1000, "o domingo também");
}));

test("os multiplicadores: o que o evento muda vale, o resto fica em 1", () => withEvents(() => {
    assert.equal(eventMultiplier("salary", WED), 1.25);
    assert.equal(eventMultiplier("xp", WED), 1);
    assert.equal(eventMultiplier("fishLuck", WED), 1);

    assert.equal(eventMultiplier("fishLuck", FRI), 2);
    assert.equal(eventMultiplier("salary", FRI), 1);

    assert.equal(eventMultiplier("xp", SAT), 2);
    assert.equal(eventMultiplier("xp", SUN), 2);

    assert.equal(eventMultiplier("xp", MON), 1);
    assert.equal(eventMultiplier("inexistente", SAT), 1);
}));

test("a semana: de hoje em diante, com o dia da semana e 'hoje' marcado", () => withEvents(() => {
    const list = upcomingEvents(TUE, 7);

    assert.deepEqual(list.map(entry => [WEEKDAY_NAMES[entry.weekday], entry.event.id]), [
        ["Quarta", "worker_wednesday"],
        ["Sexta", "good_tide_friday"],
        ["Sábado", "double_xp_weekend"],
        ["Domingo", "double_xp_weekend"]
    ]);

    assert.ok(list.every(entry => entry.today === false), "terça não tem evento");

    // numa quarta, a quarta é hoje
    assert.equal(upcomingEvents(WED, 1)[0].today, true);

    // 7 dias à frente cobrem a semana inteira, e a segunda-feira seguinte não entra duas vezes
    assert.equal(upcomingEvents(MON, 7).length, 4);
    assert.equal(upcomingEvents(MON, 14).length, 8);
}));

// ==========================================
// NA PESCA
// ==========================================

test("a sorte da pesca: os peixes raros, épicos e lendários têm o dobro da chance, e a conta fecha em 100%", () => {
    const share = luck => {
        const counts = new Map();

        const total = FISHING_TABLE.reduce((sum, entry) => sum + (["rare", "epic", "legendary"].includes(entry.tier) ? entry.weight * luck : entry.weight), 0);

        const steps = 20_000;

        for (let index = 0; index < steps; index += 1) {
            const entry = rollCatch(() => (index + 0.5) / steps, { luck });

            counts.set(entry.tier, (counts.get(entry.tier) ?? 0) + 1);
        }

        const lucky = ["rare", "epic", "legendary"].reduce((sum, tier) => sum + (counts.get(tier) ?? 0), 0);

        return { lucky: lucky / steps, total, steps, counts };
    };

    const normal = share(1);
    const lucky = share(2);

    // sem sorte: 50 + 30 + 12 + 3 = 95 em 1000
    assert.ok(Math.abs(normal.lucky - 0.095) < 0.001, String(normal.lucky));

    // com sorte: 190 em 1095 (os outros encolhem na proporção)
    assert.ok(Math.abs(lucky.lucky - 190 / 1095) < 0.001, String(lucky.lucky));
    assert.ok(lucky.lucky > normal.lucky * 1.7);

    const sum = [...lucky.counts.values()].reduce((a, b) => a + b, 0);

    assert.equal(sum, lucky.steps, "toda faixa do sorteio cai em alguma linha");

    // sem luck, o sorteio é o de sempre
    assert.equal(rollCatch(() => 0.5).id, rollCatch(() => 0.5, { luck: 1 }).id);
});

test("a pesca no fim de semana dá o dobro de XP, e a de sexta usa a sorte; fora disso é o normal", () => withEvents(() => {
    const g = `g-ev-${Math.random()}`;

    getPlayer(g, ME);

    tx(() => addItem(g, ME, "fishing_rod", 1));

    const xpOf = () => db.prepare("SELECT xp FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME).xp;

    const cast = (now, random = () => 0.9) => fish(g, ME, { now: Math.floor(now / 1000), random });

    const start = xpOf();

    // em ordem de data (a espera de 10 minutos conta a partir da pescaria anterior)
    const normal = cast(MON);

    assert.equal(normal.xp, 3);
    assert.equal(xpOf() - start, 3);

    // na sexta, o mesmo número do sorteio cai numa linha melhor (peso maior para os raros desloca a faixa)
    const aim = (luck, tier) => {
        const total = FISHING_TABLE.reduce((sum, entry) => sum + (["rare", "epic", "legendary"].includes(entry.tier) ? entry.weight * luck : entry.weight), 0);

        let start = 0;

        for (const entry of FISHING_TABLE) {
            const weight = ["rare", "epic", "legendary"].includes(entry.tier) ? entry.weight * luck : entry.weight;

            if (entry.tier === tier) return (start + weight / 2) / total;

            start += weight;
        }
    };

    const friday = cast(FRI, () => aim(2, "rare"));

    assert.equal(friday.entry.tier, "rare");
    assert.equal(friday.xp, 3);

    const weekend = cast(SAT + 3_600_000);

    assert.equal(weekend.xp, 6, "XP em dobro");
    assert.equal(xpOf() - start, 3 + 3 + 6);
}));

// ==========================================
// NO TRABALHO
// ==========================================

async function work(now) {
    const comandos = await carregarComandos();

    const command = resolverComando(comandos, "trabalhar");

    const g = `g-work-${Math.random()}`;

    getPlayer(g, ME);

    db.prepare("UPDATE players SET job_id = 'entregador', wallet = 0, xp = 0, last_work = 0 WHERE guild_id = ? AND user_id = ?").run(g, ME);

    const realNow = Date.now;

    Date.now = () => now;

    const log = console.log;
    const error = console.error;

    console.log = () => {};
    console.error = () => {};

    try {
        const response = await command.execute({ id: "w" + Math.random(), guildId: g, channelId: "c", user: { id: ME }, data: { options: {} } });

        const row = db.prepare("SELECT wallet, xp FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME);

        return { response, ...row };

    } finally {
        Date.now = realNow;
        console.log = log;
        console.error = error;
    }
}

test("o trabalho: a quarta paga 25% a mais, o fim de semana dá o dobro de XP, e a tela cita o evento", () => withEvents(async () => {
    const salary = getJob("entregador").salary;

    const normal = await work(MON);

    assert.equal(normal.wallet, salary);
    assert.equal(normal.xp, 25);
    assert.doesNotMatch(texto(normal.response), /Evento/);

    const wednesday = await work(WED);

    assert.equal(wednesday.wallet, Math.round(salary * 1.25));
    assert.equal(wednesday.xp, 25, "só o salário muda na quarta");
    assert.match(texto(wednesday.response), /Evento · \*\*Quarta do trabalhador\*\*/);

    const weekend = await work(SAT);

    assert.equal(weekend.wallet, salary, "o fim de semana não mexe no salário");
    assert.equal(weekend.xp, 50);
    assert.match(texto(weekend.response), /Evento · \*\*Fim de semana em dobro\*\*/);
    assert.match(texto(weekend.response), /\+50 XP/);
}));

test("as linhas de evento das respostas: só os eventos que mexem no que o comando mostra", () => withEvents(() => {
    assert.deepEqual(eventNotes(["salary", "xp"], WED), ["> 🛠️ Evento · **Quarta do trabalhador**"]);
    assert.deepEqual(eventNotes(["salary", "xp"], SAT), ["> ✨ Evento · **Fim de semana em dobro**"]);
    assert.deepEqual(eventNotes(["fishLuck", "xp"], FRI), ["> 🌊 Evento · **Sexta de maré boa**"]);
    assert.deepEqual(eventNotes(["fishLuck"], WED), [], "a quarta não mexe na pesca");
    assert.deepEqual(eventNotes(["salary"], MON), []);
}));

// ==========================================
// A TELA E O COMANDO
// ==========================================

test("/evento: o que vale agora (com a hora em que acaba) e a semana, e o V2 cumpre as regras", () => withEvents(() => {
    const view = buildEvents({ now: WED });

    const fields = view.embed.fields;

    assert.equal(fields.length, 2);
    assert.match(fields[0].value, /Quarta do trabalhador/);
    assert.match(fields[0].value, new RegExp(`acaba <t:${brt(2026, 11, 19, 0, 0) / 1000}:R>`));
    assert.match(fields[0].value, /25% a mais/);

    assert.match(fields[1].value, /\*\*Quarta\*\* · 📍 hoje · /);
    assert.match(fields[1].value, /\*\*Sexta\*\*/);
    assert.match(fields[1].value, /Sábado.*Domingo|Domingo/s);

    assert.deepEqual(layoutProblems(view.layout), []);

    // sem evento hoje: avisa e mostra a semana
    const quiet = buildEvents({ now: MON });

    assert.match(quiet.embed.fields[0].value, /Nenhum evento ativo agora/);
    assert.match(quiet.embed.fields[1].value, /Quarta/);
}));

test("/evento desligado: só o aviso", () => withEvents(() => {
    const view = buildEvents({ now: WED });

    assert.match(texto(view.embed), /Eventos desligados/);
    assert.equal(view.embed.fields.length, 0);
    assert.deepEqual(layoutProblems(view.layout), []);
}, "off"));

test("o comando /evento: nome, sem alias, sem opções, descrição curta, abre sem conta", async () => {
    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "evento");

    assert.ok(command);
    assert.equal(command.aliases, undefined, "alias gasta vaga de comando de barra");
    assert.equal(command.options, undefined);
    assert.ok(command.description.length <= 70);

    const response = await withEvents(() => command.execute({ id: "e", user: { id: ME } }));

    assert.match(texto(response.data.embeds), /Eventos da semana/);
    assert.ok(Array.isArray(response.data.layout));
});

test("em inglês: nomes, descrições, dias da semana e o fim do evento saem traduzidos", () => withEvents(() => {
    const view = buildEvents({ now: SAT });

    const english = texto(localizeData({ body: "", embeds: [view.embed], layout: view.layout }, "en-US"));

    assert.match(english, /Events this week/);
    assert.match(english, /Double Weekend/);
    assert.match(english, /XP from \/trabalhar and \/pescar is worth double/);
    assert.match(english, /ends <t:/);
    assert.match(english, /Saturday/);
    assert.match(english, /📍 today/);
    assert.match(english, /Worker Wednesday/);

    assert.doesNotMatch(english, /Eventos da semana|Fim de semana|acaba|Sábado|hoje|Quarta/);

    // a linha que o /trabalhar e a /pescar mostram
    const note = texto(localizeData({ body: "", embeds: [{ description: eventNotes(["salary", "xp"], SAT).join("\n") }] }, "en-US"));

    assert.match(note, /Event · \*\*Double Weekend\*\*/);
}));

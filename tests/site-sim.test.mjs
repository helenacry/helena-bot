import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A conversa de exemplo e o laboratório do crime do site (site/src/lib/sim.ts e crime-math.ts)
// mostram o jogo de verdade: regras iguais às do bot, textos iguais aos dos comandos.

const sim = await import("../site/src/lib/sim.ts");
const math = await import("../site/src/lib/crime-math.ts");
const { game, data } = await import("../site/src/lib/game.ts");

const crime = await import("../config/crime.mjs");

const seq = (...values) => {
    let index = 0;

    return () => (index < values.length ? values[index++] : 0.5);
};

const field = (reply, name) => reply.embed.fields.find(item => item.name.includes(name))?.value;

// ==========================================
// MATEMÁTICA DO CRIME
// ==========================================

test("o multiplicador de prêmio e multa é o do bot em todos os níveis", () => {
    for (let level = 1; level <= 100; level++) {
        assert.ok(Math.abs(math.rewardScale(level) - crime.rewardScale(level)) < 1e-9, `nível ${level}`);
    }

    assert.equal(math.rewardScale(0), 1, "abaixo de 1 vale 1");
    assert.ok(Math.abs(math.rewardScale(500) - crime.rewardScale(100)) < 1e-9, "acima de 100 vale 100");
});

test("uma tentativa sorteia como o bot: chance, histórias, faixas de prêmio e multa em reais inteiros", () => {
    // sorteio fixo: 0,1 dá certo (menos de 50%), 0,9 dá errado; o jackpot só com < 1/16
    const win = math.rollCrime(1, 1, seq(0.1, 0.5, 0, 0.5));

    assert.equal(win.win, true);
    assert.equal(win.jackpot, false);
    assert.equal(win.story, game.crime.successStories[0].text);
    assert.equal(win.amount, Math.round((game.crime.successStories[0].min + game.crime.successStories[0].max) / 2));

    const jackpot = math.rollCrime(2, 1, seq(0.1, 0.01, 0.5));

    assert.equal(jackpot.jackpot, true);
    assert.equal(jackpot.story, game.crime.jackpot.text);
    assert.ok(jackpot.amount >= game.crime.jackpot.min && jackpot.amount <= game.crime.jackpot.max);

    const bust = math.rollCrime(3, 1, seq(0.9, 0, 0.5));

    assert.equal(bust.win, false);
    assert.equal(bust.story, game.crime.failureStories[0].text);
    assert.equal(bust.amount, 0);
    assert.equal(bust.fine, Math.round((game.crime.fine.min + game.crime.fine.max) / 2));

    // o nível 100 multiplica tudo
    const rich = math.rollCrime(4, 100, seq(0.9, 0, 0.5));

    assert.equal(rich.fine, Math.round(bust.fine * crime.rewardScale(100)));
    assert.ok(Number.isInteger(rich.fine));
});

test("a média do laboratório bate com milhares de sorteios (nível 1 e nível 60)", () => {
    // gerador com semente: o teste dá sempre o mesmo resultado
    let state = 123456789;
    const rng = () => {
        state = (state * 1664525 + 1013904223) >>> 0;

        return state / 2 ** 32;
    };

    for (const level of [1, 60]) {
        const samples = 200_000;
        let dirty = 0;
        let fines = 0;
        let busts = 0;

        for (let i = 0; i < samples; i++) {
            const attempt = math.rollCrime(i, level, rng);

            dirty += attempt.amount;
            fines += attempt.fine;
            busts += attempt.win ? 0 : 1;
        }

        const average = math.average(level);

        assert.ok(Math.abs(dirty / samples - average.dirty) / average.dirty < 0.03, `nível ${level}: sujo por tentativa`);
        assert.ok(Math.abs(fines / samples - average.fine) / average.fine < 0.03, `nível ${level}: multa por tentativa`);
        assert.ok(Math.abs((busts / samples) * game.crime.jailSeconds / 60 - average.jailMinutes) < 0.3, `nível ${level}: cadeia`);
    }
});

test("o recibo soma certo: sujo, multas, cadeia e o limpo depois da lavagem", () => {
    const attempts = [
        { n: 1, win: true, jackpot: false, story: "a", amount: 1000, fine: 0 },
        { n: 2, win: false, jackpot: false, story: "b", amount: 0, fine: 200 },
        { n: 3, win: true, jackpot: false, story: "c", amount: 500, fine: 0 }
    ];

    const totals = math.totals(attempts);

    assert.equal(totals.crimes, 3);
    assert.equal(totals.wins, 2);
    assert.equal(totals.busts, 1);
    assert.equal(totals.dirty, 1500);
    assert.equal(totals.fines, 200);
    assert.equal(totals.jailMinutes, game.crime.jailSeconds / 60);

    const mid = kind => (game.laundering.kinds[kind].rate.min + game.laundering.kinds[kind].rate.max) / 2;

    assert.ok(Math.abs(totals.clean.public - (1500 * mid("public") - 200)) < 1e-9);
    assert.ok(Math.abs(totals.clean.private - (1500 * mid("private") - 200)) < 1e-9);
});

// ==========================================
// A CONVERSA DE EXEMPLO
// ==========================================

const NOW = 1_800_000_000_000;

test("daily: paga o prêmio do dia 1 e a conta bate (carteira de exemplo R$ 10 + R$ 500)", () => {
    const { state, reply } = sim.run(sim.initialState(), "daily", NOW);

    assert.equal(state.wallet, 10 + game.daily.ladder[0]);
    assert.match(field(reply, "Total recebido"), /R\$ 500,00/);
    assert.match(field(reply, "Carteira atual"), /R\$ 510,00/);
    assert.equal(reply.embed.accent, "success");
    assert.equal(state.used.daily, true);
    assert.equal(sim.availability(state, "daily", NOW).ok, false, "em recarga");
});

test("trabalhar: paga o primeiro emprego, gasta a energia de verdade e dá o XP do bot", () => {
    const { state, reply } = sim.run(sim.initialState(), "trabalhar", NOW);

    assert.equal(state.wallet, 10 + data.jobs[0].salary);
    assert.equal(state.energy, game.energy.max - game.work.energy);
    assert.equal(state.xp, game.work.xp);
    assert.match(field(reply, "Energia restante"), new RegExp(`${game.energy.max - game.work.energy}/${game.energy.max}`));
    assert.match(field(reply, "Emprego"), new RegExp(data.jobs[0].name));
});

test("crime que dá errado: multa da carteira (nunca passa dela), 30 minutos de cadeia e bloqueio dos comandos", () => {
    // 0,9 falha; a história 0 não fere; a multa sorteada em 0,5 do intervalo
    const { state, reply } = sim.run(sim.initialState(), "crime", NOW, seq(0.9, 0, 0.5));

    assert.equal(reply.embed.title, "🚨 Você foi pego!");
    assert.equal(reply.embed.accent, "error");
    assert.ok(state.wallet >= 0, "a multa nunca deixa a carteira negativa");
    assert.equal(state.wallet, 0, "a carteira de R$ 10 paga o que tem");
    assert.equal(state.jailEndsAt, NOW + game.crime.jailSeconds * 1000);
    assert.equal(state.energy, game.energy.max - game.crime.energy);
    assert.equal(sim.isJailed(state, NOW + 1000), true);

    // preso: os comandos que a cadeia bloqueia respondem com o aviso, e nada muda
    for (const command of ["daily", "trabalhar", "crime"]) {
        const blocked = sim.run(state, command, NOW + 1000);

        assert.equal(blocked.reply.embed.title, "⛓️ Você está preso", command);
        assert.equal(blocked.state, state, `${command} não muda o estado`);
    }

    // consultas continuam liberadas
    assert.equal(sim.run(state, "loja", NOW + 1000).reply.embed.accent, "economy");
    assert.equal(sim.run(state, "perfil", NOW + 1000).reply.kind, "card");

    // /prisao mostra a ficha e o tempo que falta
    const prison = sim.run(state, "prisao", NOW + 1000).reply;

    assert.equal(prison.live, "jail");
    assert.match(field(prison, "Tempo restante"), /29m 59s/);
    assert.match(field(prison, "Capturas"), /1/);

    // passada a pena, está livre
    assert.equal(sim.isJailed(state, NOW + game.crime.jailSeconds * 1000 + 1), false);
    assert.equal(sim.run(state, "prisao", NOW + game.crime.jailSeconds * 1000 + 1).reply.embed.title, "🔓 Você está livre");
});

test("crime que dá certo: dinheiro sujo na faixa da história, XP do bot e o total sujo acumula", () => {
    const first = sim.run(sim.initialState(), "crime", NOW, seq(0.1, 0.5, 0, 0.5, 0.5));
    const story = game.crime.successStories[0];

    assert.equal(first.reply.embed.title, "🕵️ Crime bem-sucedido!");
    assert.equal(first.reply.embed.description, story.text);
    assert.ok(first.state.dirty >= story.min && first.state.dirty <= story.max);
    assert.ok(first.state.xp >= game.crime.xp.min && first.state.xp <= game.crime.xp.max);
    assert.equal(first.state.wins, 1);
    assert.equal(first.state.wallet, 10, "o dinheiro sujo não entra na carteira");
});

test("a loja de exemplo usa os consumíveis do bot, com o que cabe na carteira", () => {
    const { reply } = sim.run(sim.initialState(), "loja", NOW);

    const foods = game.energy.foods.slice(0, 3);

    assert.equal(reply.embed.fields.length, 3);

    foods.forEach((food, index) => {
        assert.match(reply.embed.fields[index].name, new RegExp(food.name));
        assert.match(reply.embed.fields[index].value, new RegExp(`\`${food.id}\``));
    });

    // com R$ 10: a maçã (R$ 3) e o café (R$ 7) cabem; o energético (R$ 15) não
    assert.match(reply.embed.fields[0].value, /Você pode comprar até \*\*3\*\*/);
    assert.match(reply.embed.fields[1].value, /Você pode comprar até \*\*1\*\*/);
    assert.match(reply.embed.fields[2].value, /Faltam \*\*R\$ 5,00\*\*/);
});

test("nenhum comando muda o estado recebido (a conversa pode voltar ao começo sem sobra)", () => {
    const start = sim.initialState();
    const snapshot = JSON.stringify(start);

    for (const command of sim.COMMANDS) sim.run(start, command, NOW, seq(0.9, 0, 0.5));

    assert.equal(JSON.stringify(start), snapshot);
});

// ==========================================
// OS TEXTOS SÃO OS DOS COMANDOS DE VERDADE
// ==========================================

test("os títulos e os nomes dos campos das respostas de exemplo existem nos comandos do bot", () => {
    const bot = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

    const expected = {
        "commands/economy/daily.mjs": ["🎁 Helena Daily", "**Recompensa resgatada!**", "💰 Recompensa base", "🔥 Bônus de sequência", "💵 Total recebido", "🔥 Sequência atual", "🏆 Seu recorde", "👛 Carteira atual", "⏰ Próximo resgate", "Helena Daily • Sua dedicação merece recompensas."],
        "commands/economy/work.mjs": ["💼 Expediente concluído!", "👔 Emprego", "💰 Pagamento", "✨ Experiência", "⚡ Energia consumida", "🔋 Energia restante", "⭐ Nível", "📊 XP total", "⏰ Próximo expediente", "Helena • O esforço constrói sua fortuna."],
        "commands/crime/crime.mjs": ["🕵️ Crime bem-sucedido!", "💎 Golpe de mestre!", "💸 Dinheiro sujo", "🧺 Total sujo", "⏰ Próximo crime", "Helena • Dinheiro sujo não compra nada. Use /lavagem.", "🚨 Você foi pego!", "💸 Multa", "⛓️ Prisão", "🩸 Ferimento", "Helena • Use /prisao para acompanhar sua pena."],
        "commands/crime/prison.mjs": ["⏳ Tempo restante", "📜 Pena total", "⚖️ Motivo", "🕵️ Crimes", "✅ Sucessos", "🚨 Capturas", "💸 Total arrecadado (sujo)", "⛓️ Você está preso", "🔓 Você está livre", "Helena • Atualizado automaticamente.", "Helena • Ficha criminal"],
        "services/crime/prison.mjs": ["⛓️ Você está preso", "Este comando fica bloqueado enquanto", "você cumpre pena. Consultas continuam", "📜 Motivo"]
    };

    let checked = 0;

    for (const [file, texts] of Object.entries(expected)) {
        const source = bot(file);

        for (const text of texts) {
            assert.ok(source.includes(text), `${file} não tem mais "${text}" (a conversa de exemplo do site ficou desatualizada)`);
            checked++;
        }
    }

    assert.ok(checked > 30);

    // a loja: título e rodapé vêm de services/panels/shop-view.mjs
    const shop = bot("services/panels/shop-view.mjs");

    for (const text of ["Helena Loja", "Toque no número do item para comprar", "Você pode comprar até", "Faltam"]) {
        assert.ok(shop.includes(text), `shop-view.mjs não tem mais "${text}"`);
    }

    // e as cores das barras dos embeds são as do bot
    const colors = bot("utils/embed.mjs");

    for (const hex of ["#22C55E", "#EF4444", "#F59E0B", "#A855F7", "#8755DA"]) {
        assert.ok(colors.includes(hex), `utils/embed.mjs não tem mais ${hex}`);
    }

    const tokens = readFileSync(new URL("../site/src/styles/tokens.css", import.meta.url), "utf8").toLowerCase();

    for (const hex of ["#22c55e", "#ef4444", "#f59e0b", "#a855f7", "#8755da"]) {
        assert.ok(tokens.includes(hex), `tokens.css não tem a cor ${hex} do embed`);
    }
});

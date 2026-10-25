import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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

// O recibo da resposta como { nome: valor } (as linhas finas, `null`, ficam de fora).
const rows = reply => Object.fromEntries(reply.embed.rows.filter(Boolean));

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

// quem já escolheu o primeiro emprego (o menu que o primeiro /trabalhar abre)
const employed = () => sim.pickJob(sim.initialState()).state;

test("daily: com o painel no ar o comando não paga, só diz que está disponível e leva ao site", () => {
    const start = sim.initialState();

    const { state, reply } = sim.run(start, "daily", NOW);

    assert.equal(state, start, "não muda o estado");
    assert.equal(state.wallet, 10, "a carteira de exemplo fica como estava");
    assert.equal(reply.embed.title, "🎁 Bônus diário");
    assert.equal(reply.embed.plain, true, "sem seção, pelúcia nem rodapé, como o do bot");
    assert.deepEqual(reply.link, { emoji: "🌐", label: "Coletar no site" });
    assert.match(reply.embed.say, /✅ Disponível agora neste servidor/);
    assert.match(reply.embed.say, /coletado no site da Helena/);
    assert.deepEqual(reply.embed.rows, []);
    assert.equal(reply.embed.accent, "success");
    assert.equal(sim.availability(state, "daily", NOW).ok, true, "não entra em recarga: é só a consulta");
});

test("trabalhar: o primeiro uso abre o menu de empregos, sem pagar nem gastar nada", () => {
    const start = sim.initialState();

    const { state, reply } = sim.run(start, "trabalhar", NOW);

    assert.equal(state, start);
    assert.equal(reply.picker, true);
    assert.equal(reply.embed.title, "💼 Empregos");
    assert.match(reply.embed.say, /^🧾 Antes de trabalhar, escolha um emprego no menu abaixo\./);
    assert.match(reply.embed.say, /Você está sem emprego\. Seu nível é \*\*1\*\*/);
    assert.match(reply.embed.say, new RegExp(`### ✅ Disponíveis para você \\(${data.jobs.filter(job => job.level <= 1).length}\\)`));
    assert.match(reply.embed.say, new RegExp(`### 🔒 Ainda bloqueados \\(${data.jobs.filter(job => job.level > 1).length}\\)`));
    assert.match(reply.embed.say, new RegExp(`💼 \\*\\*${data.jobs[0].name}\\*\\*`));
    assert.equal(reply.embed.footer, "Escolha no menu para começar a trabalhar");
    assert.equal(sim.availability(state, "trabalhar", NOW).ok, true, "o menu não consome a espera");

    const option = sim.jobOption();

    assert.equal(option.label, `💼 ${data.jobs[0].name}`);
    assert.match(option.description, /por expediente · nível 1$/);
});

test("escolher o emprego confirma na mesma mensagem e libera o expediente", () => {
    const { state, reply } = sim.pickJob(sim.initialState());

    assert.equal(state.employed, true);
    assert.equal(reply.embed.title, "🎉 Novo emprego");
    assert.match(reply.embed.say, new RegExp(`Você agora é \\*\\*${data.jobs[0].name}\\*\\*`));
    assert.equal(reply.picker, undefined, "a confirmação não tem mais o menu");
    assert.equal(rows(reply)["Cargo"], data.jobs[0].name);
    assert.equal(rows(reply)["Nível exigido"], "1");
    assert.equal(state.wallet, 10, "escolher não paga");
});

test("trabalhar: paga o primeiro emprego, gasta a energia de verdade e dá o XP do bot", () => {
    const { state, reply } = sim.run(employed(), "trabalhar", NOW);

    assert.equal(state.wallet, 10 + data.jobs[0].salary);
    assert.equal(state.energy, game.energy.max - game.work.energy);
    assert.equal(state.xp, game.work.xp);
    assert.match(rows(reply)["Energia"], new RegExp(`^-${game.work.energy} \\(${game.energy.max - game.work.energy}/${game.energy.max}\\)$`));
    assert.match(reply.embed.say, new RegExp(`\\*\\*${data.jobs[0].name}\\*\\*`));
});

test("crime que dá errado: multa da carteira (nunca passa dela), 30 minutos de cadeia e bloqueio dos comandos", () => {
    // 0,9 falha; a história 0 não fere; a multa sorteada em 0,5 do intervalo
    const { state, reply } = sim.run(sim.initialState(), "crime", NOW, seq(0.9, 0, 0.5));

    assert.equal(reply.embed.title, "🚨 Você foi pego");
    assert.equal(reply.embed.accent, "error");
    assert.equal(rows(reply)["Multa"], "-R$ 10,00");
    assert.equal(rows(reply)["Prisão"], "30m 0s");
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
    assert.match(rows(prison)["Tempo restante"], /29m 59s/);
    assert.equal(rows(prison)["Capturas"], "1");

    // passada a pena, está livre
    assert.equal(sim.isJailed(state, NOW + game.crime.jailSeconds * 1000 + 1), false);
    assert.equal(sim.run(state, "prisao", NOW + game.crime.jailSeconds * 1000 + 1).reply.embed.title, "🔓 Você está livre");
});

test("crime que dá certo: dinheiro sujo na faixa da história, XP do bot e o total sujo acumula", () => {
    const first = sim.run(sim.initialState(), "crime", NOW, seq(0.1, 0.5, 0, 0.5, 0.5));
    const story = game.crime.successStories[0];

    assert.equal(first.reply.embed.title, "🕵️ Crime bem-sucedido");
    assert.equal(first.reply.embed.say, story.text);
    assert.equal(first.reply.embed.accent, "economy", "dinheiro sujo é ouro");
    assert.match(first.reply.embed.note, /^`NÃO VALE NADA` até passar pela `\/lavagem`\.$/);
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

    // a carteira vai no recibo, como na loja do bot
    assert.deepEqual(rows(reply), { Carteira: "R$ 10,00", Gemas: "0" });
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

test("os títulos, as linhas do recibo e os rodapés das respostas de exemplo existem nos comandos do bot", () => {
    const bot = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

    const expected = {
        // o /daily do bot só consulta e leva ao site (siteResponse); o texto é uma soma de duas linhas
        "commands/economy/daily.mjs": ["🎁 Bônus diário", "✅ Disponível agora neste servidor", "O daily agora é coletado no site da Helena. Entre com a sua conta do Discord e pegue o seu: ", "cada servidor tem a própria recarga de 24 horas e a própria sequência.", "Coletar no site", "🌐"],
        "services/economy/jobs.mjs": ['section: "Carreira"', "💼 Empregos", "📌 Você está sem emprego. Seu nível é", "### ✅ Disponíveis para você", "### 🔒 Ainda bloqueados", "Trabalhar rende experiência, e cada nível novo libera cargos melhores.", "Escolha no menu para começar a trabalhar", "por expediente · nível"],
        "services/panels/jobs-panel.mjs": ['section: "Carreira"', "🎉 Novo emprego", "para o primeiro expediente.", '"Cargo"', '"Salário"', '"Nível exigido"', "Um novo capítulo na sua carreira"],
        "commands/economy/work.mjs": ["🧾 Antes de trabalhar, escolha um emprego no menu abaixo.", 'section: "Trabalho"', "💼 Expediente concluído", "feito e pago.", '"Pagamento"', '"Experiência"', '"Energia"', '"Carteira"', '"Nível"', "Próximo expediente em 1 hora"],
        "commands/crime/crime.mjs": ['section: "Crime"', "🕵️ Crime bem-sucedido", "💎 Golpe de mestre", '"Dinheiro sujo"', '"Total sujo"', "não vale nada", "/lavagem", "Próximo crime em ", "🚨 Você foi pego", '"Multa"', '"Prisão"', '"Ferimento"', "nada (carteira vazia)", "Preso, você não trabalha, não compra e não mexe em dinheiro.", "/prisao acompanha a sua pena"],
        "commands/crime/prison.mjs": ['section: "Prisão"', '"Tempo restante"', '"Pena total"', '"Motivo"', '"Crimes"', '"Sucessos"', '"Capturas"', '"Total arrecadado (sujo)"', "⛓️ Você está preso", "🔓 Você está livre", "Trabalho, compras, depósitos e outras", "Nenhuma pena em curso.", "Atualizado automaticamente", "Ficha criminal"],
        "services/crime/prison.mjs": ['section: "Prisão"', "⛓️ Você está preso", "Este comando fica bloqueado enquanto", "você cumpre pena. Consultas continuam", '"Tempo restante"', '"Motivo"', "Atualizado automaticamente. Use /prisao"]
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

    for (const text of ['section: "Loja"', "nesta prateleira. ", "Toque no número do item para comprar", "os verdes cabem na sua carteira", "Você pode comprar até", "Faltam", "você tem ", '"Gemas"', "Página ${current}/${pages}"]) {
        assert.ok(shop.includes(text), `shop-view.mjs não tem mais "${text}"`);
    }
});

// ==========================================
// O DESENHO É O MESMO DO BOT
// ==========================================

const { formatDuration } = await import("../utils/time.mjs");
const { PALETTE, MOODS } = await import("../config/theme.mjs");
const { HELENA_COLORS } = await import("../utils/embed.mjs");
const { format } = await import("../site/src/lib/format.ts").then(module => ({ format: module }));

// O recibo do site é o papel térmico (nome e valor ligados por pontilhado, linha fina entre os
// grupos). O bot deixou esse desenho de lado nas respostas (agora são linhas com emoji, como a
// Alfacusa); o site fica com o dele.
test("o recibo do site: largura mínima de 28, pontilhado entre o nome e o valor, linha fina nos null e nunca nas pontas", () => {
    assert.deepEqual(
        sim.receipt([["Pagamento", "+R$ 420,00"], ["Experiência", "+25 XP"], null, ["Carteira", "R$ 1.350,00"]]),
        [
            `Pagamento ${"·".repeat(7)} +R$ 420,00`,
            `Experiência ${"·".repeat(9)} +25 XP`,
            "─".repeat(28),
            `Carteira ${"·".repeat(7)} R$ 1.350,00`
        ]
    );

    // um nome comprido alarga o recibo (a coluna nunca fica sem pontinhos)
    assert.deepEqual(
        sim.receipt([["Total arrecadado (sujo)", "R$ 12.345.678,90"], ["Crimes", "3"]]),
        [
            `Total arrecadado (sujo) ${"·".repeat(2)} R$ 12.345.678,90`,
            `Crimes ${"·".repeat(34)} 3`
        ]
    );

    assert.deepEqual(sim.receipt([null, ["Gemas", "7"], null]), [`Gemas ${"·".repeat(20)} 7`]);

    // todo recibo que o simulador monta de verdade cabe em 38 colunas, ou no que o maior nome exige
    for (const command of sim.COMMANDS) {
        const { reply } = sim.run(sim.initialState(), command, NOW, seq(0.9, 0, 0.5));

        if (!reply.embed) continue;

        const shown = sim.receipt(reply.embed.rows);

        assert.ok(shown.every(line => !line.startsWith("─") || line === shown.find(other => other.startsWith("─"))), command);
        assert.ok(shown.length === 0 || (!shown[0].startsWith("─") && !shown.at(-1).startsWith("─")), command);
    }

    assert.deepEqual(sim.receipt([]), []);
    assert.deepEqual(sim.receipt([null]), []);
});

test("o tempo do site é escrito como o bot escreve (1h 2m 5s)", () => {
    for (const seconds of [0, 1, 59, 60, 1781, 1800, 3599, 3600, 3725, 86400, 90061]) {
        assert.equal(format.span(seconds), formatDuration(seconds), `${seconds} s`);
    }
});

test("o sinal e o carimbo seguem as regras de utils/receipt.mjs", async () => {
    const { signed, stamp } = await import("../utils/receipt.mjs");

    for (const [amount, text] of [[500, "R$ 500,00"], [-15, "R$ 15,00"], [0, "R$ 0,00"], [-3, "-3 HP"], [25, "+25 XP"]]) {
        assert.equal(sim.signed(amount, text), signed(amount, text), `${amount} ${text}`);
    }

    assert.equal(sim.stamp("não vale nada"), stamp("não vale nada"));
});

test("cada resposta usa um humor que existe e uma cor que vem da paleta do bot", () => {
    const tokens = readFileSync(new URL("../site/src/styles/tokens.css", import.meta.url), "utf8").toLowerCase();

    // as barras do embed no site são as mesmas do bot (config/theme.mjs -> HELENA_COLORS)
    for (const [accent, color] of [
        ["primary", HELENA_COLORS.primary],
        ["economy", HELENA_COLORS.economy],
        ["success", HELENA_COLORS.success],
        ["error", HELENA_COLORS.error],
        ["wait", HELENA_COLORS.wait]
    ]) {
        assert.ok(tokens.includes(`--embed-${accent}: ${color.toLowerCase()};`), `tokens.css não tem --embed-${accent}: ${color}`);
    }

    assert.equal(HELENA_COLORS.economy, PALETTE.gold);

    // todas as respostas: humor da lista, imagem publicada no site e cor conhecida
    const accents = new Set(["primary", "economy", "success", "error", "wait"]);

    for (const command of sim.COMMANDS) {
        for (const rng of [seq(0.1, 0.5, 0, 0.5, 0.5), seq(0.9, 0, 0.5)]) {
            const { reply } = sim.run(sim.initialState(), command, NOW, rng);

            if (!reply.embed) continue;

            assert.ok(MOODS.includes(reply.embed.mood), `${command}: humor ${reply.embed.mood}`);
            assert.ok(accents.has(reply.embed.accent), `${command}: cor ${reply.embed.accent}`);
            assert.ok(existsSync(new URL(`../site/public/bot/mood-${reply.embed.mood}.png`, import.meta.url)), `${command}: sem imagem do humor`);
        }
    }

    assert.ok(existsSync(new URL("../site/public/bot/helena.png", import.meta.url)), "ícone do autor e do rodapé");
});

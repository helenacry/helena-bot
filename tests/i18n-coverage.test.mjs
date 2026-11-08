import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A cobertura do inglês: tudo o que o jogo mostra para quem escolheu English em /config tem tradução.
//
// Dois jeitos de garantir isso:
//   1. os catálogos (itens, empregos, missões, conquistas, histórias do crime, comandos): se alguém acrescenta
//      um item ou um comando e esquece da tradução, o teste diz qual (config/locales/en-US-catalog.mjs);
//   2. o rastreador (scripts/dev/i18n-scan.mjs) roda os comandos em inglês, clica nos botões e preenche os
//      formulários, e nada pode sobrar em português nem aparecer misturado no meio do inglês.
//
// Texto novo sem tradução: rode `node --disable-warning=ExperimentalWarning scripts/dev/i18n-scan.mjs` e
// acrescente o que ele listar a config/locales/en-US-responses.mjs.

const catalog = await import("../config/locales/en-US-catalog.mjs");
const { translateText } = await import("../services/platform/i18n.mjs");
const { ITEMS, ITEM_CATEGORIES, WEAPON_TYPES } = await import("../config/items.mjs");
const { JOBS } = await import("../config/jobs.mjs");
const { MISSIONS } = await import("../config/missions.mjs");
const { ACHIEVEMENTS, ACHIEVEMENT_RARITIES } = await import("../config/achievements.mjs");
const { CRIME_SUCCESS_STORIES, CRIME_JACKPOT_STORY, CRIME_FAILURE_STORIES } = await import("../config/crime.mjs");
const { HELP_CONFIG } = await import("../config/help.mjs");
const { COMMAND_CATEGORIES, HIDDEN_FOLDERS, HIDDEN_COMMANDS } = await import("../config/command-categories.mjs");
const { carregarComandos, comandosCarregados } = await import("../command-registry.mjs");

const en = text => translateText(text, "en-US");

const filled = value => typeof value === "string" && value.trim().length > 0;

// ==========================================
// OS CATÁLOGOS
// ==========================================

test("todo item tem nome e descrição em inglês (e o verbo de usar, quando tem)", () => {
    for (const item of ITEMS) {
        const [name, description, verb] = catalog.ITEM_TEXT[item.id] ?? [];

        assert.ok(filled(name), `item ${item.id}: falta o nome em inglês`);
        assert.ok(filled(description), `item ${item.id}: falta a descrição em inglês`);

        if (item.use?.verb) {
            assert.ok(filled(verb), `item ${item.id}: falta o verbo "${item.use.verb}" em inglês`);
        }

        assert.equal(en(item.name), name, `item ${item.id}: o nome não chega traduzido`);
        assert.equal(en(item.description), description, `item ${item.id}: a descrição não chega traduzida`);
    }

    // nenhuma tradução sobrando para um item que não existe mais
    assert.deepEqual(Object.keys(catalog.ITEM_TEXT).filter(id => !ITEMS.some(item => item.id === id)), []);
});

test("todo emprego, missão e conquista tem tradução", () => {
    for (const job of JOBS) {
        assert.ok(filled(catalog.JOB_NAMES[job.id]), `emprego ${job.id}: falta a tradução`);
        assert.equal(en(job.name), catalog.JOB_NAMES[job.id], `emprego ${job.id}: não chega traduzido`);
    }

    for (const mission of MISSIONS) {
        const [name, description] = catalog.MISSION_TEXT[mission.id] ?? [];

        assert.ok(filled(name) && filled(description), `missão ${mission.id}: falta a tradução`);
        assert.equal(en(mission.name), name, `missão ${mission.id}`);
        assert.equal(en(mission.description), description, `missão ${mission.id}`);
    }

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
        const [name, description, title] = catalog.ACHIEVEMENT_TEXT[id] ?? [];

        assert.ok(filled(name) && filled(description) && filled(title), `conquista ${id}: falta a tradução`);
        assert.equal(en(achievement.name), name, `conquista ${id}: nome`);
        assert.equal(en(achievement.description), description, `conquista ${id}: descrição`);
        assert.equal(en(achievement.title), title, `conquista ${id}: título`);
    }

    for (const id of Object.keys(ACHIEVEMENT_RARITIES)) {
        assert.ok(filled(catalog.RARITY_NAMES[id]), `raridade ${id}`);
    }

    for (const id of Object.keys(ITEM_CATEGORIES)) {
        assert.ok(filled(catalog.CATEGORY_NAMES[id]), `categoria de item ${id}`);
    }

    for (const id of Object.keys(WEAPON_TYPES)) {
        assert.ok(filled(catalog.WEAPON_TYPE_NAMES[id]), `tipo de arma ${id}`);
    }
});

test("o mesmo nome em português tem a mesma tradução nos empregos e nas conquistas (nenhum sobrescreve o outro)", () => {
    // "Magnata" é emprego e conquista: os dois precisam dizer o mesmo em inglês
    const byName = new Map();

    const add = (pt, en, where) => {
        if (byName.has(pt) && byName.get(pt).en !== en) {
            assert.fail(`"${pt}" tem duas traduções: "${byName.get(pt).en}" (${byName.get(pt).where}) e "${en}" (${where})`);
        }

        byName.set(pt, { en, where });
    };

    for (const job of JOBS) add(job.name, catalog.JOB_NAMES[job.id], `emprego ${job.id}`);

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
        add(achievement.name, catalog.ACHIEVEMENT_TEXT[id][0], `conquista ${id}`);
        add(achievement.title, catalog.ACHIEVEMENT_TEXT[id][2], `título ${id}`);
    }

    for (const item of ITEMS) add(item.name, catalog.ITEM_TEXT[item.id][0], `item ${item.id}`);
});

test("toda história do crime tem tradução", () => {
    for (const story of [...CRIME_SUCCESS_STORIES, CRIME_JACKPOT_STORY, ...CRIME_FAILURE_STORIES]) {
        assert.ok(filled(catalog.CRIME_STORY_TEXT[story.text]), `história sem tradução: "${story.text}"`);
        assert.equal(en(story.text), catalog.CRIME_STORY_TEXT[story.text]);
    }
});

test("as categorias e os textos da central de ajuda têm tradução", () => {
    for (const category of COMMAND_CATEGORIES) {
        assert.ok(filled(catalog.CATEGORY_LABELS[category.id]), `categoria ${category.id}`);
        assert.ok(filled(catalog.HELP_BLURBS[category.id]), `descrição da categoria ${category.id}`);
        assert.equal(en(HELP_CONFIG.blurbs[category.id]), catalog.HELP_BLURBS[category.id]);
    }
});

test("todo comando dos jogadores e toda opção têm descrição em inglês", async () => {
    const quiet = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = quiet;

    const origem = comandosCarregados().origem;

    const missing = [];

    for (const [name, command] of comandos) {
        const folder = String(origem.get(name)).split("/")[0];

        if (HIDDEN_FOLDERS.has(folder) || HIDDEN_COMMANDS.has(name)) {
            continue;
        }

        const texts = [
            [`/${name}`, command.description],
            ...(command.options ?? []).map(option => [`/${name} ${option.name}`, option.description])
        ];

        for (const [where, text] of texts) {
            if (!filled(catalog.COMMAND_TEXT[text])) {
                missing.push(`${where}: "${text}"`);
            }
        }
    }

    assert.deepEqual(missing, [], "descrição sem tradução em config/locales/en-US-catalog.mjs (COMMAND_TEXT)");
});

// ==========================================
// O RASTREADOR
// ==========================================

test("rodando os comandos em inglês nada sobra em português nem aparece misturado", async () => {
    const { scan } = await import("../scripts/dev/i18n-scan.mjs");

    const result = await scan({ rounds: 2, seed: 7 });

    const show = list => list.slice(0, 15).map(({ text, where }) => `${JSON.stringify(text)} ← ${where[0]}`);

    assert.deepEqual(show(result.missing), [], "texto sem tradução (rode scripts/dev/i18n-scan.mjs para a lista inteira)");
    assert.deepEqual(show(result.leaks), [], "português no meio do inglês");
    assert.deepEqual(result.failures, [], "o rastreador não conseguiu rodar algo");
});

// ==========================================
// O /userinfo
// ==========================================

test("toda insígnia e toda nota da conta do /userinfo têm tradução", async () => {
    const { BADGES, NOTES } = await import("../services/social/userinfo-badges.mjs");
    const { BADGE_TEXT, NOTE_TEXT } = await import("../config/locales/en-US-userinfo.mjs");

    for (const badge of BADGES) {
        const [name, about] = BADGE_TEXT[badge.id] ?? [];

        assert.ok(filled(name) && filled(about), `insígnia ${badge.id}: falta a tradução`);
        assert.equal(en(badge.about), about, `insígnia ${badge.id}: a descrição não chega traduzida`);

        // o nome vale a tradução, ou é igual nos dois idiomas (HypeSquad)
        assert.ok([name, badge.name].includes(en(badge.name)), `insígnia ${badge.id}: o nome não chega traduzido`);
    }

    for (const note of NOTES) {
        assert.ok(filled(NOTE_TEXT[note.id]), `nota ${note.id}: falta a tradução`);
        assert.equal(en(note.text), NOTE_TEXT[note.id], `nota ${note.id}`);
    }
});

test("as datas por extenso e as idades do /userinfo saem em inglês", () => {
    assert.equal(en("06 de maio de 2021, às 20:00 (**5 anos 6 meses 1 dia**)"), "May 6, 2021, at 20:00 (**5 years 6 months 1 day**)");
    assert.equal(en("11 de novembro de 2026, às 11:29 (em **3 dias**)"), "November 11, 2026, at 11:29 (in **3 days**)");
    assert.equal(en("**1 ano 1 mês**"), "**1 year 1 month**");
    assert.equal(en("1 mês"), "1 month");
    assert.equal(en("24 meses"), "24 months");
});

test("as escolhas das opções dos comandos (o que aparece na lista) têm tradução", async () => {
    const quiet = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = quiet;

    const origem = comandosCarregados().origem;

    const { clearMissingTranslations, missingTranslations } = await import("../services/platform/i18n.mjs");

    clearMissingTranslations();

    for (const [name, command] of comandos) {
        const folder = String(origem.get(name)).split("/")[0];

        if (HIDDEN_FOLDERS.has(folder) || HIDDEN_COMMANDS.has(name)) continue;

        for (const option of command.options ?? []) {
            for (const choice of option.choices ?? []) {
                en(typeof choice === "object" ? choice.name : String(choice));
            }
        }
    }

    assert.deepEqual(missingTranslations(), [], "nome de escolha sem tradução (COMMAND_TEXT, catálogo ou SAME)");
});

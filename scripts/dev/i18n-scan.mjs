// Rastreador de traduções: roda os comandos dos jogadores em inglês (en-US), num banco de teste, e lista
// cada texto que ainda sai em português, dizendo em que comando apareceu.
//
//   node --disable-warning=ExperimentalWarning scripts/dev/i18n-scan.mjs            # a lista
//   node --disable-warning=ExperimentalWarning scripts/dev/i18n-scan.mjs --json     # em JSON
//   node --disable-warning=ExperimentalWarning scripts/dev/i18n-scan.mjs --only=trabalhar,crime
//   SCAN_ROUNDS=8 node ...                                                           # mais sorteios
//
// Como funciona: cada rodada usa um servidor novo, com duas pessoas ricas, com itens e gemas; cada comando
// roda com os argumentos que ele aceita (uma vez para cada opção de escolha) e DUAS vezes seguidas, para a
// segunda mostrar a recarga ou o erro. Os botões e menus que aparecem na resposta são clicados (até 2 telas
// de profundidade). O que o dicionário não conhece fica em português e é anotado por
// services/platform/i18n.mjs (missingTranslations). Os fluxos de duas pessoas (casamento, duelo, roubo)
// rodam em "histórias" no fim. Só lê e escreve no banco temporário: nada sai da máquina.
//
// Reaproveitado por tests/i18n-coverage.test.mjs, que trava o que já está traduzido.

import { db, set } from "../../tests/helpers.mjs";

const LANG = "en-US";

const ANA = "810000000000000001";
const BETO = "810000000000000002";

const { carregarComandos, comandosCarregados } = await import("../../command-registry.mjs");
const i18n = await import("../../services/platform/i18n.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../../services/panels/panels.mjs");
const { handleEscapeClick, clearEscapeSessions } = await import("../../services/crime/prison-escape.mjs");
const { handleUserinfoComponent } = await import("../../services/panels/userinfo-panel.mjs");
const { addItem } = await import("../../services/economy/inventory.mjs");
const { getPlayer } = await import("../../database/economy.mjs");
const { ITEMS } = await import("../../config/items.mjs");

// ------------------------------------------------------------------
// O QUE ENTRA NA VARREDURA
// ------------------------------------------------------------------

// Os comandos que dependem do Discord de verdade (imagem do cartão, consulta de contas) ficam para a
// varredura própria deles; o resto dos jogadores entra.
const SKIP = new Set(["perfil", "userinfo", "testembed"]);

const HIDDEN_FOLDERS = new Set(["admin", "dev"]);

// o valor de cada opção, pelo nome (e pelo comando, quando o nome é ambíguo)
function valueFor(option, command) {
    if (option.choices?.length) {
        return option.choices[0].value ?? option.choices[0];
    }

    if (option.type === "user") return BETO;

    const byName = {
        quantia: "1000",
        valor: "5000",
        quantidade: option.type === "integer" ? 1 : "1",
        item: ({ equipar: "revolver", descartar: "apple", usaritem: "apple" })[command] ?? "apple",
        alvo: BETO,
        texto: "Hello there, this is my bio.",
        titulo: "x",
        pagina: 1,
        comando: "saldo",
        cargo: "entregador"
    };

    return byName[option.name] ?? (option.type === "integer" ? 1 : "1");
}

// Outros valores para as opções livres, pelo nome: mostram as respostas de quantidade maior, de "tudo", de
// valor inválido e de item que não existe.
const ALTERNATES = Object.freeze({
    quantidade: [2, 5, "max", "metade", "tudo", "abc"],
    quantia: ["tudo", "abc", "99999999"],
    valor: ["tudo", "20000", "abc"],
    pagina: [2],
    item: ["inexistente"],
    titulo: ["first_steps", "veteran"],
    texto: ["", "x".repeat(200)]
});

// Todas as combinações úteis: as opções obrigatórias, e uma rodada a mais para cada escolha de cada opção.
function optionSets(command) {
    const defs = command.options ?? [];

    const base = Object.fromEntries(defs.filter(o => o.required).map(o => [o.name, valueFor(o, command.name)]));

    const sets = [base];

    // a mesma coisa com todas as opções preenchidas
    if (defs.some(o => !o.required)) {
        sets.push(Object.fromEntries(defs.map(o => [o.name, valueFor(o, command.name)])));
    }

    // cada valor de cada opção de escolha
    for (const option of defs) {
        for (const choice of option.choices ?? []) {
            sets.push({ ...base, [option.name]: choice.value ?? choice });
        }
    }

    // outros valores: quantidades maiores, "tudo", texto inválido, página 2
    for (const option of defs) {
        if (option.choices?.length) {
            continue;
        }

        for (const value of ALTERNATES[option.name] ?? []) {
            if (typeof value === "string" || option.type !== "string") {
                sets.push({ ...base, [option.name]: value });
            }
        }
    }

    // sem as obrigatórias (o erro de uso)
    if (defs.some(o => o.required)) {
        sets.push({});
    }

    return sets;
}

// ------------------------------------------------------------------
// ESTADO DO JOGO
// ------------------------------------------------------------------

function inTransaction(fn) {
    db.exec("BEGIN IMMEDIATE");

    try {
        fn();
        db.exec("COMMIT");

    } catch (error) {
        db.exec("ROLLBACK");

        throw error;
    }
}

function seedPlayer(guild, user, { rich = true } = {}) {
    getPlayer(guild, user);

    set(
        "UPDATE players SET wallet = ?, bank = ?, dirty_money = ?, xp = ? WHERE guild_id = ? AND user_id = ?",
        rich ? 80_000_00 : 0, rich ? 40_000_00 : 0, rich ? 30_000_00 : 0, rich ? 6_000 : 0, guild, user
    );

    set(
        "INSERT INTO global_users (user_id, gems) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET gems = excluded.gems",
        user, rich ? 300 : 0
    );

    if (rich) {
        inTransaction(() => {
            for (const item of ITEMS) {
                // 2 unidades; as armas e outros itens de limite 1 ficam com 1
                for (const quantity of [2, 1]) {
                    try {
                        addItem(guild, user, item.id, quantity);

                        break;

                    } catch {
                        // passou do limite do item: tenta com menos
                    }
                }
            }
        });
    }
}

// ------------------------------------------------------------------
// RODAR E ANOTAR
// ------------------------------------------------------------------

const found = new Map();   // texto -> Set(de onde)
const failures = [];

let sequence = 0;

const userOf = id => ({ id, username: id === ANA ? "ana" : "beto", displayName: id === ANA ? "Ana" : "Beto", bot: false });

const interactionOf = (guildId, userId, data, type = "command") => ({
    id: `scan-${++sequence}`,
    type,
    guildId,
    channelId: "scan-channel",
    token: "scan-token",
    user: userOf(userId),
    member: null,
    data
});

// ------------------------------------------------------------------
// VAZAMENTO: português dentro do que já saiu traduzido
// ------------------------------------------------------------------

// O dicionário pode traduzir só uma parte de uma linha (a duração "1 hora" dentro de "Next shift in ...") e
// o aviso de "texto sem tradução" não dispara. Aqui se procura, no resultado já em inglês, palavras que só
// existem em português.
const PORTUGUESE_ONLY = new Set(`
    hora horas minuto minutos segundos dias dia você vocês não uma seu sua seus suas pelo pela ainda também quando
    nenhum nenhuma está estão são têm mais menos pode podem deve foi fica ficam bloqueado bloqueada sem com que por
    ao aos às um ou mas sobre entre de da dos das em na nos nas ele ela eles elas isso esse essa este esta aqui
    agora hoje já tem nada tudo todos todas depois antes cada quanto quantos custa
`.split(/\s+/).filter(Boolean));

const SKIPPED_KEYS = new Set(["customId", "custom_id", "url", "emoji", "value", "id", "files", "type", "style", "name_localizations"]);

function textsOf(node, out = []) {
    if (typeof node === "string") {
        out.push(node);

    } else if (Array.isArray(node)) {
        node.forEach(item => textsOf(item, out));

    } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            if (!SKIPPED_KEYS.has(key)) {
                textsOf(value, out);
            }
        }
    }

    return out;
}

const leaks = new Map();   // linha -> Set(de onde)

function noteLeaks(label, localized) {
    for (const text of textsOf(localized?.data ?? localized)) {
        for (const line of text.split("\n")) {
            // sem o código, as menções, os endereços, os comandos, os nomes das pessoas de teste e a bio de teste
            const plain = line
                .replace(/`[^`]*`/g, " ")
                .replace(/<[@#&!:][^>]*>/g, " ")
                .replace(/https?:\/\/\S+/g, " ")
                .replace(/(^|[\s*_(])\/[a-z][a-z0-9_-]*/g, "$1 ")
                .replace(/Hello there, this is my bio\./g, " ")
                .replace(/\b(Ana|Beto)\b/g, " ");

            const words = plain.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

            const hit = words.find(word => PORTUGUESE_ONLY.has(word));

            if (hit) {
                const key = line.trim();

                if (!leaks.has(key)) {
                    leaks.set(key, new Set());
                }

                leaks.get(key).add(label);
            }
        }
    }
}

// traduz a resposta para o inglês e guarda o que ficou em português
function note(label, response) {
    i18n.clearMissingTranslations();

    if (response) {
        noteLeaks(label, i18n.localizeResponse(response, LANG));
    }

    for (const entry of i18n.missingTranslations()) {
        const text = entry.slice(entry.indexOf("\u0000") + 1);

        // o nome de uma pessoa não se traduz
        if (/^[^\p{L}\p{N}]*\**(ana|beto|aninha|rr|jogador[ #\d]*|hello there.*)( \((ana|beto|aninha)\))?\**[^\p{L}\p{N}]*$/iu.test(text)) {
            continue;
        }

        if (!found.has(text)) {
            found.set(text, new Set());
        }

        found.get(text).add(label);
    }

    i18n.clearMissingTranslations();
}

async function run(label, guildId, userId, name, comandos, options = {}) {
    const command = comandos.get(name);

    let response;

    try {
        response = await command.execute(interactionOf(guildId, userId, { name, options }));

    } catch (error) {
        failures.push(`${label}: ${String(error?.message ?? error).slice(0, 100)}`);

        return null;
    }

    note(label, response);

    return response;
}

// os botões e menus de uma resposta: [{ customId, values }]
function actionsOf(response) {
    const actions = [];

    const walk = node => {
        if (Array.isArray(node)) {
            node.forEach(walk);

            return;
        }

        if (!node || typeof node !== "object") {
            return;
        }

        if (typeof node.customId === "string" && !node.url && !node.disabled) {
            if (Array.isArray(node.options) && node.options.length) {
                for (const option of node.options.slice(0, 4)) {
                    actions.push({ customId: node.customId, values: [String(option.value)] });
                }

            } else {
                actions.push({ customId: node.customId, values: [] });
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                walk(value);
            }
        }
    };

    walk(response?.data?.components);
    walk(response?.data?.layout);

    return actions;
}

let allCommands = null;

// o que se digita em cada campo de formulário, pelo nome do campo
const FIELD_VALUES = Object.freeze({
    quantia: "100",
    destinatario: BETO,
    valor: "20000",
    confirmacao: "LIBERAR",
    texto: "Hello there, this is my bio.",
    usuario: BETO,
    quantidade: "2",
    item: "apple",
    nome: "Zé",
    busca: "saldo"
});

// Envia um formulário aberto por um botão: uma vez preenchido e outra vazio.
async function submitModal(label, guildId, userId, modal) {
    for (const filled of [true, false]) {
        const fields = (modal.data?.fields ?? []).map(field => ({
            customId: field.customId,
            value: filled ? (FIELD_VALUES[field.customId] ?? "1") : ""
        }));

        try {
            const response = await handleModalSubmit(
                interactionOf(guildId, userId, { customId: modal.data.customId, fields }, "modal_submit"),
                allCommands
            );

            note(`${label} › formulário ${modal.data.customId}${filled ? "" : " (vazio)"}`, response);

        } catch (error) {
            failures.push(`${label} [formulário ${modal.data?.customId}]: ${String(error?.message ?? error).slice(0, 100)}`);
        }
    }
}

// clica em tudo o que a resposta oferece (e no que as respostas oferecem), até 2 telas
async function crawl(label, guildId, userId, response, depth = 2, visited = new Set()) {
    if (depth === 0 || !response) {
        return;
    }

    for (const action of actionsOf(response)) {
        const key = `${action.customId}|${action.values.join(",")}`;

        if (visited.has(key) || visited.size > 30) {
            continue;
        }

        visited.add(key);

        let result;

        try {
            const click = interactionOf(guildId, userId, { customId: action.customId, values: action.values }, "component");

            result = await handlePanelClick(click);

            // os menus do /userinfo buscam a pessoa no Discord: o bot os trata à parte (executarComponente)
            if (!result && action.customId.startsWith("userinfo:")) {
                result = await handleUserinfoComponent(click, allCommands);
            }

            // a fuga da prisão também não passa pelos painéis
            if (!result && action.customId.startsWith("fuga:")) {
                result = await handleEscapeClick(click, {
                    edit: async data => note(`${label} › fuga (tela seguinte)`, { type: "message", data })
                });

                clearEscapeSessions();
            }

        } catch (error) {
            failures.push(`${label} [${action.customId}]: ${String(error?.message ?? error).slice(0, 100)}`);

            continue;
        }

        if (!result) {
            continue;
        }

        note(`${label} › ${action.customId.split(":").slice(0, 2).join(":")}`, result);

        // um botão que abre um formulário: envia preenchido e vazio (o aviso de "faltou o valor")
        if (result.type === "modal") {
            await submitModal(label, guildId, userId, result);
        }

        await crawl(label, guildId, userId, result, depth - 1, visited);
    }
}

// ------------------------------------------------------------------
// A VARREDURA
// ------------------------------------------------------------------

// Um sorteio que se repete: com a mesma semente os comandos caem sempre nas mesmas histórias (o teste não
// pode depender de sorte). Sem semente, vale o Math.random de verdade.
function seeded(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export async function scan({ rounds = Number(process.env.SCAN_ROUNDS ?? 4), only = null, seed = null } = {}) {
    const realRandom = Math.random;

    const realConsole = { log: console.log, warn: console.warn, error: console.error };

    if (seed !== null) {
        Math.random = seeded(seed);
    }

    // os comandos registram erros esperados no log ("Essa arma não existe"): não é o que interessa aqui
    console.warn = () => {};
    console.error = () => {};

    try {
        return await run_scan({ rounds, only });

    } finally {
        Math.random = realRandom;

        Object.assign(console, realConsole);
    }
}

async function run_scan({ rounds, only }) {
    const quiet = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = quiet;

    allCommands = comandos;

    const origem = comandosCarregados()?.origem;

    i18n.setLang(ANA, LANG);
    i18n.setLang(BETO, LANG);

    const names = [...comandos.keys()].filter(name => {
        const folder = String(origem?.get(name) ?? "").split("/")[0];

        return !HIDDEN_FOLDERS.has(folder) && !SKIP.has(name) && (!only || only.includes(name));
    });

    for (let round = 1; round <= rounds; round++) {
        // a bolsa dos preços variáveis liga nas rodadas pares (nos testes ela começa desligada)
        process.env.HELENA_MARKET = round % 2 === 0 ? "on" : "off";

        const guild = `scan-guild-${round}`;

        seedPlayer(guild, ANA);
        seedPlayer(guild, BETO);

        // Cada comando roda em três estados, cada um num servidor só dele (o estado de um não suja o do outro):
        //   rico     dinheiro, itens, gemas e energia cheia: o caminho feliz
        //   cansado  rico, mas com pouca energia: as respostas de "descanse" e de energia baixa
        //   sem nada nem dinheiro, nem item, nem gema: os erros de falta
        for (const name of names) {
            const command = comandos.get(name);

            for (const profile of ["rico", "cansado", "sem nada"]) {
                const place = `scan-${round}-${profile}-${name}`.replace(/\s/g, "-");

                seedPlayer(place, ANA, { rich: profile !== "sem nada" });
                seedPlayer(place, BETO, { rich: profile !== "sem nada" });

                if (profile === "cansado") {
                    set("UPDATE players SET energy = 5, energy_updated_at = 0 WHERE guild_id = ?", place);
                }

                const sets = optionSets(command);

                // o rico passa por todas as variações e clica nos botões; os outros dois, só pelas duas primeiras
                for (const options of profile === "rico" ? sets : sets.slice(0, 2)) {
                    // duas vezes seguidas: a segunda mostra a recarga ou o erro
                    for (let pass = 1; pass <= 2; pass++) {
                        const label = profile === "rico" ? `/${name}` : `/${name} (${profile})`;

                        const response = await run(label, place, ANA, name, comandos, options);

                        if (pass === 1 && profile === "rico") {
                            await crawl(label, place, ANA, response);
                        }
                    }
                }
            }
        }

        await stories(guild, comandos);
    }

    // o /userinfo e o /perfil dependem de dados do Discord: rodam à parte, com um Discord de mentira
    if (!only || only.includes("userinfo") || only.includes("perfil")) {
        await userinfoStories(comandos);
    }

    const listed = map => [...map.entries()].map(([text, where]) => ({ text, where: [...where].sort() }))
        .sort((a, b) => a.where[0].localeCompare(b.where[0]) || a.text.localeCompare(b.text));

    return {
        missing: listed(found),
        leaks: listed(leaks),
        failures: [...new Set(failures)]
    };
}

// O /userinfo e o /perfil, com uma conta que tem de tudo: todas as insígnias, impulso, castigo, banner e avatar
// animado. O Discord é de mentira (tests/helpers.mjs, discordGuildFetch): nada sai da máquina.
async function userinfoStories(comandos) {
    const { discordMember, discordGuildFetch } = await import("../../tests/helpers.mjs");
    const { resetDiscordApi } = await import("../../services/discord/api.mjs");
    const { BADGES, NOTES } = await import("../../services/social/userinfo-badges.mjs");

    const place = "scan-userinfo";

    const publicFlags = Number(BADGES.reduce((total, badge) => total | badge.bit, 0n) & 0xffffffffn);
    const noteFlags = Number(NOTES.reduce((total, note) => total | note.bit, 0n));

    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();

    const members = [
        discordMember(ANA, "ana", "Ana", "Aninha", false, {
            user: { public_flags: publicFlags, avatar: "a_abc123", banner: "a_ban123", avatar_decoration_data: { asset: "x", sku_id: "1" } },
            member: { premium_since: "2024-03-01T10:00:00.000000+00:00", communication_disabled_until: future, roles: ["r1"] }
        }),
        discordMember(BETO, "beto", "Beto")
    ];

    const accounts = {
        [ANA]: {
            id: ANA, username: "ana", global_name: "Ana", avatar: "a_abc123", banner: "a_ban123", accent_color: 123456,
            banner_color: "#123456", public_flags: publicFlags, flags: noteFlags,
            primary_guild: { tag: "rr", identity_guild_id: "1", identity_enabled: true, badge: "b" }
        },
        [BETO]: { id: BETO, username: "beto", global_name: "Beto", public_flags: 0 }
    };

    const realFetch = globalThis.fetch;

    globalThis.fetch = discordGuildFetch(members, {}, accounts);

    resetDiscordApi();

    seedPlayer(place, ANA);
    seedPlayer(place, BETO);

    try {
        for (const [name, options] of [
            ["userinfo", {}], ["userinfo", { usuario: BETO }], ["userinfo", { usuario: "ocultar" }],
            ["userinfo", { usuario: "mostrar" }], ["userinfo", { usuario: "apagar" }], ["userinfo", { usuario: "naoexiste" }],
            ["userinfo", {}],
            ["perfil", {}], ["perfil", { usuario: BETO }], ["perfil", { usuario: "naoexiste" }]
        ]) {
            const label = `/${name}`;

            const response = await run(label, place, ANA, name, comandos, options);

            await crawl(label, place, ANA, response);
        }

    } finally {
        globalThis.fetch = realFetch;

        resetDiscordApi();
    }
}

// Os fluxos de duas pessoas, na ordem em que acontecem.
async function stories(guild, comandos) {
    const step = (label, user, name, options = {}) => run(`${label}`, guild, user, name, comandos, options);

    // casamento: pedido, recusa, pedido de novo, aceite, família, divórcio
    await step("/casar (história)", ANA, "casar", { usuario: BETO });
    await step("/recusarcasamento (história)", BETO, "recusarcasamento");
    await step("/casar (história)", ANA, "casar", { usuario: BETO });
    await step("/aceitarcasamento (história)", BETO, "aceitarcasamento");
    await step("/familia (história)", ANA, "familia");
    await step("/gozofone (história)", ANA, "gozofone");
    await step("/divorciar (história)", ANA, "divorciar");

    // duelo: desafio, recusa, desafio, aceite, histórico
    await step("/atacar (história)", ANA, "atacar", { usuario: BETO });
    await step("/recusarduelo (história)", BETO, "recusarduelo");
    // vários duelos: o resultado (vitória, derrota, empate) é sorteado
    for (let n = 0; n < 6; n++) {
        await step("/atacar (história)", ANA, "atacar", { usuario: BETO });
        await step("/aceitarduelo (história)", BETO, "aceitarduelo");
    }

    await step("/historico (história)", ANA, "historico");

    // armas, roubo, prisão e fuga
    await step("/equipar (história)", ANA, "equipar", { item: "pistol" });
    await step("/municao (história)", ANA, "municao", { quantidade: 20 });
    await step("/recarregar (história)", ANA, "recarregar");

    for (let n = 0; n < 6; n++) {
        const response = await step("/roubar (história)", ANA, "roubar", { alvo: BETO });

        await crawl("/roubar (história)", guild, BETO, response, 1);
        await step("/crime (história)", ANA, "crime");
        await step("/prisao (história)", ANA, "prisao");
    }

    await step("/hospital (história)", ANA, "hospital");
    await step("/curar (história)", ANA, "curar");
    await step("/colete (história)", ANA, "colete");
    await step("/reparar (história)", ANA, "reparar");
    await step("/lavagem (história)", ANA, "lavagem", { valor: "desbloquear" });
    await step("/lavagem (história)", ANA, "lavagem", { valor: "5000", tipo: "publica" });
    await step("/bio (história)", ANA, "bio", { texto: "x".repeat(200) });
}

// ------------------------------------------------------------------
// COMO SCRIPT
// ------------------------------------------------------------------

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
    const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7).split(",") ?? null;

    const seedArg = process.argv.find(arg => arg.startsWith("--seed="))?.slice(7);

    const { missing, leaks: leaked, failures: errors } = await scan({ only, seed: seedArg !== undefined ? Number(seedArg) : null });

    if (process.argv.includes("--json")) {
        console.log(JSON.stringify({ missing, leaks: leaked, failures: errors }, null, 2));

    } else {
        const show = ({ text, where }) =>
            console.log(`${JSON.stringify(text)}\n    ← ${where.slice(0, 4).join(", ")}${where.length > 4 ? ` (+${where.length - 4})` : ""}`);

        console.log(`\n${missing.length} texto(s) sem tradução para ${LANG}:\n`);

        missing.forEach(show);

        console.log(`\n${leaked.length} linha(s) com português no meio do inglês:\n`);

        leaked.forEach(show);

        if (errors.length) {
            console.log(`\n${errors.length} falha(s) ao rodar (não são tradução):`);

            for (const line of errors.slice(0, 25)) {
                console.log("  - " + line);
            }
        }
    }
}

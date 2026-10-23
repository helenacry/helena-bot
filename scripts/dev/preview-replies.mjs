// Prévia visual das respostas do bot: roda os comandos de verdade (pelo prefixo h) num banco
// temporário, com jogadores de exemplo, e desenha cada resposta num HTML parecido com o chat da VSync
// (clássico e, com --v2, também o layout V2). Serve para rever o visual a cada mudança.
//
//   node scripts/dev/preview-replies.mjs                  gera a página e diz onde ela ficou
//   node scripts/dev/preview-replies.mjs --shots          e tira uma captura por grupo (Edge)
//   node scripts/dev/preview-replies.mjs --only saldo,crime   só os casos cujo comando ou grupo contém o texto
//   node scripts/dev/preview-replies.mjs --v2             mostra também como fica em V2
//
// A saída vai para a pasta temporária (helena-preview). Não toca no banco de verdade.

import "../../tests/helpers.mjs";

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { db, get, set, getPlayer, createPrefixRunner } from "../../tests/helpers.mjs";

import { messageHtml, PAGE_CSS, useLocalImages } from "./chat-html.mjs";

// A bolsa começa desligada nos testes; na prévia ela fica ligada para aparecer.
process.env.HELENA_MARKET = "on";

const { IMAGE_BASE } = await import("../../config/theme.mjs");
const { xpForLevel } = await import("../../services/progress/experience.mjs");

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
    const index = args.indexOf(name);

    return index >= 0 ? args[index + 1] : undefined;
};

const ONLY = (option("--only") ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
const OUT = option("--out") ?? join(tmpdir(), "helena-preview");

const IMAGES = fileURLToPath(new URL("../../site/public/bot/", import.meta.url));

useLocalImages(IMAGE_BASE, pathToFileURL(IMAGES).href);

// ------------------------------------------------------------ jogadores de exemplo
const G = "g-preview";

const ME = { id: "111111111111111111", username: "educado", displayName: "Educado", avatarUrl: "https://cdn.vsync.lat/att/2026/avatar-exemplo.webp" };
const ANA = { id: "222222222222222222", username: "ana", displayName: "Ana", avatarUrl: "https://cdn.vsync.lat/att/2026/avatar-exemplo2.webp" };

const nowSec = () => Math.floor(Date.now() / 1000);

function clear() {
    for (const table of [
        "players", "inventory", "crime_players", "prison_players", "daily_streaks", "global_users",
        "mission_progress", "player_titles", "marriages", "marriage_requests", "combat_players",
        "combat_challenges", "combat_gear", "combat_history", "equipped_items", "laundering_jobs",
        "family_children", "family_births", "family_calls", "player_achievements", "transactions"
    ]) {
        try { db.exec(`DELETE FROM ${table}`); } catch { /* tabela que não existe neste banco */ }
    }

    db.exec("DELETE FROM player_names");
}

// Deixa o "Educado" com uma vida de jogo no meio do caminho.
function seed({ wallet = 135_000, bank = 230_000, dirty = 0, level = 18, xp = xpForLevel(level) + 240, gems = 12, job = "programador", energy = 82 } = {}) {
    clear();

    for (const user of [ME, ANA]) {
        getPlayer(G, user.id);

        set("INSERT OR REPLACE INTO player_names (user_id, display_name) VALUES (?, ?)", user.id, user.displayName);
    }

    set(
        "UPDATE players SET wallet=?, bank=?, dirty_money=?, level=?, xp=?, job_id=?, energy=?, energy_updated_at=? WHERE guild_id=? AND user_id=?",
        wallet, bank, dirty, level, xp, job, energy, nowSec(), G, ME.id
    );

    set("UPDATE players SET wallet=?, bank=?, level=? WHERE guild_id=? AND user_id=?", 80_000, 520_000, 31, G, ANA.id);

    set("INSERT OR REPLACE INTO global_users (user_id, gems, last_gem_claim) VALUES (?, ?, 0)", ME.id, gems);
}

const give = (user, item, quantity = 1) =>
    set(
        "INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity",
        G, user.id, item, quantity
    );

const helpers = { seed, give, set, get, db, ME, ANA, G, nowSec };

// ------------------------------------------------------------ os casos
const { CASES } = await import("./preview-cases.mjs");

const run = await createPrefixRunner({ guildId: G, author: ME });

const WHO = { ME, ANA };

// Roda o comando e devolve o que foi enviado. O sorteio do crime usa crypto, que não dá para fixar de fora:
// quando o caso tem "until", o cenário é refeito (banco novo, mesmo comando) até a resposta servir.
async function execute(item) {
    for (let attempt = 1; attempt <= 400; attempt++) {
        await quiet(async () => {
            seed();
            await item.setup?.(helpers);
        })();

        const sent = (await quiet(() => run(item.cmd, WHO[item.who] ?? item.who ?? ME))()).sent;

        if (!item.until || item.until(sent)) {
            return sent;
        }
    }

    throw new Error("O caso nunca produziu o resultado pedido: " + item.cmd + " (" + (item.note ?? "") + ")");
}

const log = console.log;
const quiet = fn => async (...inner) => {
    console.log = () => {};
    console.warn = () => {};

    try {
        return await fn(...inner);
    } finally {
        console.log = log;
    }
};

const groups = [];

for (const group of CASES) {
    const cases = [];

    for (const item of group.cases) {
        const label = `${group.group} ${item.cmd}`.toLowerCase();

        if (ONLY.length && !ONLY.some(word => label.includes(word))) continue;

        const sent = await execute(item);

        // Com --v2, o mesmo caso roda de novo com HELENA_V2=on: o que o bot manda então é o layout V2
        // de verdade (o desenho próprio da tela, quando ela tem um, ou o embed convertido).
        let v2 = [];

        if (flag("--v2")) {
            process.env.HELENA_V2 = "on";

            try {
                v2 = await execute(item);
            } finally {
                delete process.env.HELENA_V2;
            }
        }

        cases.push({ item, sent, v2 });
    }

    if (cases.length) groups.push({ name: group.group, cases });
}

// ------------------------------------------------------------ a página
const avatar = pathToFileURL(join(IMAGES, "helena.png")).href;

const html = `<!doctype html><meta charset="utf-8"><title>Prévia das respostas da Helena</title>
<style>${PAGE_CSS}</style>
<h1 class="page">Prévia das respostas da Helena${flag("--v2") ? " (clássico e V2)" : ""}</h1>
${groups.map(group => `
<section class="group" id="${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">
  <h2>${group.name}</h2>
  ${group.cases.map(({ item, sent, v2 }) => `
  <div class="case">
    <div class="cmd"><b>${item.cmd}</b>${item.note ? ` · ${item.note}` : ""}</div>
    ${sent.length ? sent.map(payload => messageHtml(payload, { avatar })).join("") : '<div class="msg"><div class="msg-main"><i>(sem resposta)</i></div></div>'}
    ${flag("--v2") ? v2.map(payload => messageHtml(payload, { avatar })).join("") : ""}
  </div>`).join("")}
</section>`).join("")}`;

mkdirSync(OUT, { recursive: true });

const page = join(OUT, "index.html");

writeFileSync(page, html);

log(`Prévia: ${page} (${groups.reduce((total, group) => total + group.cases.length, 0)} respostas)`);

// ------------------------------------------------------------ capturas
if (flag("--shots")) {
    const require = createRequire(new URL("../../site/package.json", import.meta.url));
    const { chromium } = require("playwright");

    const browser = await chromium.launch({ channel: "msedge" });
    const context = await browser.newContext({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();

    await tab.goto(pathToFileURL(page).href);
    await tab.waitForTimeout(400);

    for (const group of groups) {
        const id = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const file = join(OUT, `${id}.png`);

        await tab.locator(`#${id}`).screenshot({ path: file });

        log(`Captura: ${file}`);
    }

    await browser.close();
}

process.exit(0);

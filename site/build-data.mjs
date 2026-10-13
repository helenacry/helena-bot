// Atualiza os números e a lista de comandos do site com o que o bot
// realmente tem hoje. Rode depois de criar, renomear ou remover comandos:
//
//   npm run site:data
//
// Os dados ficam dentro de site/index.html, entre as marcas
// <!-- helena:data:start --> e <!-- helena:data:end -->.

import { readFile, writeFile, readdir } from "node:fs/promises";

// Usa um banco temporário (e roda as migrações) para importar os
// comandos sem encostar em data/. É o mesmo preparo dos testes.
await import("../tests/helpers.mjs");

const { carregarComandos } = await import("../registrar.mjs");
const { JOBS } = await import("../config/jobs.mjs");
const { ITEMS } = await import("../config/items.mjs");
const { getAllAchievements } = await import("../config/achievements.mjs");

const INDEX = new URL("./index.html", import.meta.url);
const COMMANDS_DIR = new URL("../commands/", import.meta.url);

// Pastas que não aparecem no site: são só do dono do bot.
const HIDDEN_FOLDERS = new Set(["admin", "dev"]);

// Comandos de teste interno.
const HIDDEN_COMMANDS = new Set(["testembed"]);

const CATEGORIES = [
    { id: "economia", label: "Economia", emoji: "💰" },
    { id: "crime", label: "Crime", emoji: "🕵️" },
    { id: "combate", label: "Combate", emoji: "⚔️" },
    { id: "progresso", label: "Progresso", emoji: "🏆" },
    { id: "social", label: "Social", emoji: "💍" },
    { id: "utilidades", label: "Utilidades", emoji: "⚙️" }
];

// A pasta não diz tudo (o combate mora em crime/ e os duelos em
// social/), então os casos especiais ficam aqui, por nome.
const CATEGORY_BY_COMMAND = {
    crime: "crime", roubar: "crime", lavagem: "crime",
    lavageminfo: "crime", prisao: "crime", procurados: "crime",

    atacar: "combate", aceitarduelo: "combate", recusarduelo: "combate",
    historico: "combate", hospital: "combate", curar: "combate",
    colete: "combate", municao: "combate", reparar: "combate",
    recarregar: "combate", equipar: "combate", desequipar: "combate",
    statuscombate: "combate", protecaopvp: "combate", armas: "combate"
};

const CATEGORY_BY_FOLDER = {
    economy: "economia",
    progress: "progresso",
    social: "social",
    utility: "utilidades",
    crime: "crime"
};

// ==========================================
// COMANDOS
// ==========================================

const log = console.log;

console.log = () => {};

const loaded = await carregarComandos();

console.log = log;

// nome do comando -> pasta onde ele mora
const folderOf = new Map();

for (const entry of await readdir(COMMANDS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = new URL(`./${entry.name}/`, COMMANDS_DIR);

    for (const file of await readdir(dir)) {
        if (!file.endsWith(".mjs")) continue;

        const module = await import(new URL(file, dir));

        if (module.default?.name) {
            folderOf.set(module.default.name, entry.name);
        }
    }
}

const byCategory = new Map(CATEGORIES.map(c => [c.id, []]));

let aliasCount = 0;

for (const command of loaded.values()) {
    const folder = folderOf.get(command.name);

    if (HIDDEN_FOLDERS.has(folder) || HIDDEN_COMMANDS.has(command.name)) {
        continue;
    }

    const category =
        CATEGORY_BY_COMMAND[command.name] ??
        CATEGORY_BY_FOLDER[folder] ??
        "utilidades";

    aliasCount += command.aliases?.length ?? 0;

    byCategory.get(category).push({
        name: command.name,
        aliases: command.aliases ?? [],
        description: String(command.description ?? "").replace(/\.$/, "")
    });
}

const categories = CATEGORIES
    .map(category => ({
        ...category,
        commands: byCategory.get(category.id)
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    }))
    .filter(category => category.commands.length > 0);

const commandCount = categories.reduce(
    (sum, category) => sum + category.commands.length,
    0
);

// ==========================================
// NÚMEROS
// ==========================================

const weapons = ITEMS.filter(item => item.category === "weapon");

const data = {
    stats: {
        commands: commandCount,
        aliases: aliasCount,
        jobs: JOBS.length,
        shopItems: ITEMS.filter(item => item.buyPrice > 0).length,
        weapons: weapons.length,
        achievements: getAllAchievements().length
    },

    categories,

    // Salário por turno de /trabalhar, em reais.
    jobs: JOBS.map(job => ({
        name: job.name,
        level: job.level,
        salary: job.salary / 100
    }))
};

// ==========================================
// GRAVAR NO INDEX.HTML
// ==========================================

const START = "<!-- helena:data:start -->";
const END = "<!-- helena:data:end -->";

const html = await readFile(INDEX, "utf8");

const from = html.indexOf(START);
const to = html.indexOf(END);

if (from < 0 || to < from) {
    throw new Error(`Não achei as marcas ${START} e ${END} em site/index.html.`);
}

// "</" e "<!--" dentro de um <script> fecham ele antes da hora.
const json = JSON.stringify(data)
    .replace(/</g, "\\u003c");

const block =
    `${START}\n` +
    `<script id="helena-data" type="application/json">${json}</script>\n` +
    END;

await writeFile(INDEX, html.slice(0, from) + block + html.slice(to + END.length));

log(
    `site/index.html atualizado: ${commandCount} comandos ` +
    `(${aliasCount} aliases), ${JOBS.length} empregos, ` +
    `${data.stats.shopItems} itens na loja, ` +
    `${data.stats.achievements} conquistas.`
);

// Lê o bot de verdade e devolve os dados que o site mostra: comandos
// públicos por categoria, empregos, conquistas e números.
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (site/build-data.mjs e tests/site.test.mjs fazem isso
// com tests/helpers.mjs), porque carregar os comandos abre o SQLite.

import { readdir } from "node:fs/promises";

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

export async function collectSiteData() {
    const { carregarComandos } = await import("../registrar.mjs");
    const { JOBS } = await import("../config/jobs.mjs");
    const { ITEMS } = await import("../config/items.mjs");

    const {
        getAllAchievements,
        ACHIEVEMENT_RARITIES
    } = await import("../config/achievements.mjs");

    // ---------- comandos ----------
    const log = console.log;

    console.log = () => {};

    let loaded;

    try {
        loaded = await carregarComandos();
    } finally {
        console.log = log;
    }

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

    // ---------- números ----------
    const achievements = getAllAchievements();

    return {
        stats: {
            commands: commandCount,
            aliases: aliasCount,
            jobs: JOBS.length,
            shopItems: ITEMS.filter(item => item.buyPrice > 0).length,
            weapons: ITEMS.filter(item => item.category === "weapon").length,
            achievements: achievements.length
        },

        categories,

        // Salário por turno de /trabalhar, em reais.
        jobs: JOBS.map(job => ({
            name: job.name,
            level: job.level,
            salary: job.salary / 100
        })),

        rarities: Object.fromEntries(
            Object.entries(ACHIEVEMENT_RARITIES).map(
                ([id, rarity]) => [id, rarity.name]
            )
        ),

        achievements: achievements.map(achievement => ({
            name: achievement.name,
            emoji: achievement.emoji,
            rarity: achievement.rarity,
            description: achievement.description
        }))
    };
}

// Arquivo JS carregado pela página: um script comum (não módulo), para o
// site abrir direto do disco.
export function renderSiteDataFile(data) {
    return (
        "// Gerado por `npm run site:data` a partir do bot. Não edite à mão.\n" +
        "window.Helena = window.Helena || {};\n" +
        "window.Helena.data = " + JSON.stringify(data, null, 1) + ";\n"
    );
}

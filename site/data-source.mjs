// Lê o bot de verdade e devolve os dados que o site mostra: comandos
// públicos por categoria, empregos, conquistas e números.
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (site/build-data.mjs e tests/site.test.mjs fazem isso
// com tests/helpers.mjs), porque carregar os comandos abre o SQLite.

import { readdir } from "node:fs/promises";

import {
    COMMAND_CATEGORIES,
    categoryOf,
    isHiddenCommand
} from "../config/command-categories.mjs";

const COMMANDS_DIR = new URL("../commands/", import.meta.url);

// As categorias, as pastas escondidas e os comandos de teste estão em
// config/command-categories.mjs, o mesmo lugar de onde a central de ajuda (/ajuda) lê.

export async function collectSiteData() {
    const { carregarComandos } = await import("../command-registry.mjs");
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

    const byCategory = new Map(COMMAND_CATEGORIES.map(c => [c.id, []]));

    let aliasCount = 0;

    for (const command of loaded.values()) {
        const folder = folderOf.get(command.name);

        if (isHiddenCommand(command.name, folder)) {
            continue;
        }

        const category = categoryOf(command.name, folder);

        aliasCount += command.aliases?.length ?? 0;

        byCategory.get(category).push({
            name: command.name,
            aliases: command.aliases ?? [],
            description: String(command.description ?? "").replace(/\.$/, "")
        });
    }

    const categories = COMMAND_CATEGORIES
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

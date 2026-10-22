// Lê o bot de verdade e devolve os dados que o site mostra: comandos
// públicos por categoria, empregos, conquistas, números e as regras do jogo
// que as telas de exemplo usam (daily, crime, lavagem, energia, loja).
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (scripts/site/build-data.mjs e tests/site.test.mjs fazem isso
// com tests/helpers.mjs), porque carregar os comandos abre o SQLite.

import { readdir } from "node:fs/promises";

import {
    COMMAND_CATEGORIES,
    categoryOf,
    isHiddenCommand
} from "../../config/command-categories.mjs";

const COMMANDS_DIR = new URL("../../commands/", import.meta.url);

// As categorias, as pastas escondidas e os comandos de teste estão em
// config/command-categories.mjs, o mesmo lugar de onde a central de ajuda (/ajuda) lê.

export async function collectSiteData() {
    const { carregarComandos } = await import("../../command-registry.mjs");
    const { JOBS } = await import("../../config/jobs.mjs");
    const { ITEMS } = await import("../../config/items.mjs");

    const {
        getAllAchievements,
        ACHIEVEMENT_RARITIES
    } = await import("../../config/achievements.mjs");

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

    const game = await collectGameFacts();

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
        })),

        game
    };
}

// ---------- regras do jogo ----------
// Todo dinheiro aqui está em reais (não em centavos) e todo tempo em segundos,
// porque é para o texto e para as simulações do site, não para fazer conta de saldo.
async function collectGameFacts() {
    const crime = await import("../../config/crime.mjs");
    const { ITEMS } = await import("../../config/items.mjs");
    const { MISSIONS } = await import("../../config/missions.mjs");
    const { WORK_CONFIG } = await import("../../config/work.mjs");
    const { DAILY_CONFIG, calculateReward } = await import("../../services/economy/daily.mjs");
    const { ENERGY_CONFIG } = await import("../../services/economy/energy.mjs");

    const {
        CRIME_CONFIG, CRIME_FINE, CRIME_SUCCESS_STORIES, CRIME_FAILURE_STORIES,
        CRIME_JACKPOT_STORY, LAUNDERING_CONFIG, ROBBERY_CONFIG, ESCAPE_CONFIG, rewardScale
    } = crime;

    const reais = cents => cents / 100;

    const consumables = ITEMS.filter(item => item.category === "consumable" && item.buyPrice > 0);

    return {
        work: {
            cooldownSeconds: WORK_CONFIG.cooldown,
            xp: WORK_CONFIG.xp,
            energy: ENERGY_CONFIG.workCost
        },

        energy: {
            max: ENERGY_CONFIG.max,
            regenSeconds: ENERGY_CONFIG.regenSeconds,
            foods: consumables.map(item => ({
                id: item.id,
                name: item.name,
                emoji: item.emoji,
                description: item.description,
                energy: item.use?.energy ?? 0,
                buy: reais(item.buyPrice),
                sell: reais(item.sellPrice ?? 0),
                maxStack: item.maxStack
            }))
        },

        daily: {
            ladder: Array.from({ length: 7 }, (_, index) => reais(calculateReward(index + 1).total)),
            reward: reais(DAILY_CONFIG.reward),
            streakBonus: reais(DAILY_CONFIG.streakBonus),
            weeklyBonus: reais(DAILY_CONFIG.weeklyBonus),
            graceSeconds: DAILY_CONFIG.streakGracePeriod
        },

        missions: MISSIONS.map(mission => ({
            id: mission.id,
            name: mission.name,
            description: mission.description,
            emoji: mission.emoji,
            reward: reais(mission.reward),
            xp: mission.xp
        })),

        crime: {
            energy: CRIME_CONFIG.energyCost,
            cooldownSeconds: CRIME_CONFIG.cooldown,
            successChance: CRIME_CONFIG.successChance,
            jackpotChance: CRIME_CONFIG.jackpotChance,
            jailSeconds: CRIME_CONFIG.jailSeconds,
            fine: { min: reais(CRIME_FINE.min), max: reais(CRIME_FINE.max) },
            scaleAtLevel100: rewardScale(100),
            successStories: CRIME_SUCCESS_STORIES.map(story => ({
                text: story.text,
                min: reais(story.min),
                max: reais(story.max)
            })),
            jackpot: {
                text: CRIME_JACKPOT_STORY.text,
                min: reais(CRIME_JACKPOT_STORY.min),
                max: reais(CRIME_JACKPOT_STORY.max)
            },
            xp: CRIME_CONFIG.xp,
            injuryHp: CRIME_CONFIG.injuryHp,
            failureStories: CRIME_FAILURE_STORIES.map(story => ({
                text: story.text,
                injury: story.injury
            }))
        },

        robbery: {
            energy: ROBBERY_CONFIG.energyCost,
            cooldownSeconds: ROBBERY_CONFIG.cooldown,
            stealRate: ROBBERY_CONFIG.stealRate,
            cleanShare: ROBBERY_CONFIG.cleanShare
        },

        laundering: {
            minAmount: reais(LAUNDERING_CONFIG.minAmount),
            maxAmount: reais(LAUNDERING_CONFIG.maxAmount),
            privateUnlockGems: LAUNDERING_CONFIG.privateUnlockGems,
            kinds: Object.fromEntries(
                Object.entries(LAUNDERING_CONFIG.kinds).map(([id, kind]) => [id, {
                    name: kind.name,
                    rate: kind.rate,
                    cooldownSeconds: kind.cooldown
                }])
            )
        },

        escape: {
            stages: ESCAPE_CONFIG.stages,
            cooldownSeconds: ESCAPE_CONFIG.cooldown,
            winCut: ESCAPE_CONFIG.winCut,
            lossAdd: ESCAPE_CONFIG.lossAdd
        }
    };
}

// O que o Astro lê em site/src/data/game.json (npm run site:data).
export function renderSiteDataFile(data) {
    return JSON.stringify(data, null, 2) + "\n";
}

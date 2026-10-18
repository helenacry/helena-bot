// Os números e as tabelas da wiki, tirados do próprio bot. As páginas de wiki/
// escrevem {{v:crime.cooldown}} ou {{table:jobs}} e o gerador troca pelo valor
// de verdade, então o texto não fica desatualizado quando o bot muda.
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (scripts/site/build-wiki.mjs e tests/wiki.test.mjs fazem isso com
// tests/helpers.mjs), porque carregar os comandos abre o SQLite.

import { duration } from "../../utils/duration-text.mjs";
import { reais } from "../../utils/money-text.mjs";

// ==========================================
// FORMATOS
// ==========================================

// "R$ 500", "R$ 2,50" (o mesmo texto que os comandos do bot usam: utils/money-text.mjs)
export { reais };

// 0.5 -> "50%", 0.033 -> "3,3%"
export const percent = fraction =>
    `${(fraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// 3600 -> "1 hora", 1800 -> "30 minutos", 86400 -> "24 horas" (o mesmo texto
// que os comandos do bot usam: utils/duration-text.mjs)
export { duration };

// 30000 -> "8 h 20 min"
export function hoursMinutes(seconds) {
    const hours = Math.floor(seconds / 3600);
    const rest = Math.round((seconds % 3600) / 60);

    if (hours === 0) {
        return `${rest} min`;
    }

    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// 270 -> "4,5 minutos"
export const minutes = seconds =>
    `${(seconds / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} minutos`;

// "30 a 80"
export const range = (min, max, format = String) => `${format(min)} a ${format(max)}`;

const pipe = text => String(text).replace(/\|/g, "\\|");

// Tabela em Markdown, no formato que scripts/site/wiki-markdown.mjs entende.
export function table(headers, rows) {
    return [
        `| ${headers.map(pipe).join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map(row => `| ${row.map(pipe).join(" | ")} |`)
    ].join("\n");
}

const code = text => `\`${text}\``;

// ==========================================
// COLETA
// ==========================================

export async function collectWikiBot() {
    const { JOBS } = await import("../../config/jobs.mjs");
    const { ITEMS, getCategoryName } = await import("../../config/items.mjs");

    const crime = await import("../../config/crime.mjs");
    const { GEM_BONUS } = await import("../../config/gems.mjs");
    const { MARKET_CONFIG } = await import("../../config/market.mjs");
    const { MISSIONS } = await import("../../config/missions.mjs");
    const { COOLDOWNS } = await import("../../config/cooldowns.mjs");
    const { WORK_CONFIG } = await import("../../config/work.mjs");
    const { LIVE_CONFIG } = await import("../../config/live.mjs");
    const { ANTI_SPAM } = await import("../../config/anti-spam.mjs");

    const achievements = await import("../../config/achievements.mjs");

    const { DAILY_CONFIG, calculateReward } = await import("../../services/economy/daily.mjs");
    const { ENERGY_CONFIG } = await import("../../services/economy/energy.mjs");
    const { xpForLevel } = await import("../../services/progress/experience.mjs");
    const { priceBp, sellableItems, buyPriceOf, sellPriceOf } = await import("../../services/economy/market.mjs");
    const { getItem } = await import("../../config/items.mjs");
    const { DUEL_RULES } = await import("../../services/combat/combat.mjs");
    const { HOSPITAL_RULES } = await import("../../services/combat/hospital.mjs");
    const { ARMORY_RULES } = await import("../../services/combat/armory.mjs");
    const { robberyCap } = await import("../../services/crime/robbery.mjs");
    const { MARRIAGE_RULES } = await import("../../services/social/marriage.mjs");
    const { FAMILY_RULES } = await import("../../config/family.mjs");
    const { collectSiteData } = await import("./data-source.mjs");

    const { CRIME_CONFIG, CRIME_FINE, LAUNDERING_CONFIG, ROBBERY_CONFIG, ESCAPE_CONFIG } = crime;

    const site = await collectSiteData();

    const weapons = ITEMS.filter(item => item.category === "weapon");

    // ---------- números soltos ({{v:...}}) ----------
    const streak = Array.from({ length: 7 }, (_, i) => calculateReward(i + 1).total);

    const stories = crime.CRIME_SUCCESS_STORIES;

    // exemplo da bolsa: a maçã na tabela, no índice máximo e em alta com o bônus máximo
    const apple = getItem("apple");

    const top = { priceBp: priceBp(MARKET_CONFIG.indexMax), hotItemId: apple.id, hotBonusBp: MARKET_CONFIG.hotBonusMaxBp };
    const topNoBonus = { ...top, hotItemId: null, hotBonusBp: 0 };

    const values = {
        daily: {
            reward: reais(DAILY_CONFIG.reward),
            streakBonus: reais(DAILY_CONFIG.streakBonus),
            weeklyBonus: reais(DAILY_CONFIG.weeklyBonus),
            cooldown: duration(DAILY_CONFIG.cooldown),
            grace: duration(DAILY_CONFIG.streakGracePeriod),
            day1: reais(streak[0]),
            day7: reais(streak[6]),
            day6: reais(streak[5])
        },

        work: {
            cooldown: duration(WORK_CONFIG.cooldown),
            xp: String(WORK_CONFIG.xp),
            energy: String(ENERGY_CONFIG.workCost)
        },

        energy: {
            max: String(ENERGY_CONFIG.max),
            regen: duration(ENERGY_CONFIG.regenSeconds),
            workCost: String(ENERGY_CONFIG.workCost),
            full: hoursMinutes(ENERGY_CONFIG.max * ENERGY_CONFIG.regenSeconds),
            perHour: String(3600 / ENERGY_CONFIG.regenSeconds)
        },

        xp: {
            maxLevel: "100",
            level2: String(xpForLevel(2)),
            level10: String(xpForLevel(10)),
            level50: String(xpForLevel(50)),
            level100: String(xpForLevel(100).toLocaleString("pt-BR"))
        },

        jobs: {
            count: String(JOBS.length),
            first: JOBS[0].name,
            last: JOBS[JOBS.length - 1].name,
            firstSalary: reais(JOBS[0].salary),
            lastSalary: reais(JOBS[JOBS.length - 1].salary),
            lastLevel: String(JOBS[JOBS.length - 1].level)
        },

        missions: {
            count: String(MISSIONS.length),
            total: reais(MISSIONS.reduce((sum, mission) => sum + mission.reward, 0)),
            totalXp: String(MISSIONS.reduce((sum, mission) => sum + mission.xp, 0))
        },

        gems: {
            min: String(GEM_BONUS.min),
            max: String(GEM_BONUS.max),
            cooldown: duration(GEM_BONUS.cooldown)
        },

        antiSpam: {
            interval: duration(ANTI_SPAM.commandCooldownSeconds)
        },

        market: {
            interval: duration(MARKET_CONFIG.intervalSeconds),
            indexMax: String(MARKET_CONFIG.indexMax),
            minPrice: percent(MARKET_CONFIG.minPriceBp / 10_000),
            maxPrice: percent(MARKET_CONFIG.maxPriceBp / 10_000),
            hotMin: percent(MARKET_CONFIG.hotBonusMinBp / 10_000),
            hotMax: percent(MARKET_CONFIG.hotBonusMaxBp / 10_000),
            hotItems: sellableItems().map(item => item.name).join(", ").replace(/, ([^,]*)$/, " e $1"),
            exampleBuy: reais(apple.buyPrice),
            exampleSell: reais(apple.sellPrice),
            exampleBuyTop: reais(buyPriceOf(apple, topNoBonus)),
            exampleSellTop: reais(sellPriceOf(apple, topNoBonus)),
            exampleSellHot: reais(sellPriceOf(apple, top))
        },

        crime: {
            energy: String(CRIME_CONFIG.energyCost),
            cooldown: duration(CRIME_CONFIG.cooldown),
            minHp: String(CRIME_CONFIG.minHp),
            chance: percent(CRIME_CONFIG.successChance),
            jackpot: `1 em ${Math.round(1 / CRIME_CONFIG.jackpotChance)}`,
            xp: range(CRIME_CONFIG.xp.min, CRIME_CONFIG.xp.max),
            jail: duration(CRIME_CONFIG.jailSeconds),
            injury: range(CRIME_CONFIG.injuryHp.min, CRIME_CONFIG.injuryHp.max),
            fine: range(CRIME_FINE.min, CRIME_FINE.max, reais),
            prize: range(
                Math.min(...stories.map(story => story.min)),
                Math.max(...stories.map(story => story.max)),
                reais
            ),
            jackpotPrize: range(crime.CRIME_JACKPOT_STORY.min, crime.CRIME_JACKPOT_STORY.max, reais),
            failureInjury: `${crime.CRIME_FAILURE_STORIES.filter(story => story.injury).length} de ${crime.CRIME_FAILURE_STORIES.length}`,
            scale100: crime.rewardScale(100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
        },

        robbery: {
            energy: String(ROBBERY_CONFIG.energyCost),
            cooldown: duration(ROBBERY_CONFIG.cooldown),
            minHp: String(ROBBERY_CONFIG.minHp),
            minTarget: reais(ROBBERY_CONFIG.minTargetWallet),
            steal: range(ROBBERY_CONFIG.stealRate.min, ROBBERY_CONFIG.stealRate.max, percent),
            capBase: reais(ROBBERY_CONFIG.capBase),
            capThreshold: reais(ROBBERY_CONFIG.capThreshold),
            capMax: reais(ROBBERY_CONFIG.capMax),
            clean: percent(ROBBERY_CONFIG.cleanShare),
            dirty: percent(1 - ROBBERY_CONFIG.cleanShare),
            retaliation: percent(ROBBERY_CONFIG.retaliationChance),
            retaliationHp: range(ROBBERY_CONFIG.retaliationHp.min, ROBBERY_CONFIG.retaliationHp.max),
            escapeInjury: percent(ROBBERY_CONFIG.escapeInjuryChance),
            defaultChance: String(crime.ROBBERY_DEFAULT_CHANCE),
            injuries: ROBBERY_CONFIG.injuryLevels
                .map(level => `${level.name} (${level.hp} de vida, em ${percent(level.weight / ROBBERY_CONFIG.injuryLevels.reduce((sum, item) => sum + item.weight, 0))} dos casos)`)
                .join(", ")
        },

        marriage: {
            requestTtl: duration(MARRIAGE_RULES.requestTtl)
        },

        family: {
            callTtl: duration(FAMILY_RULES.callTtl),
            cooldown: duration(FAMILY_RULES.cooldown),
            childChance: percent(FAMILY_RULES.childChance),
            twinChance: percent(FAMILY_RULES.twinChance),
            payoutMin: reais(FAMILY_RULES.payoutMin),
            payoutMax: reais(FAMILY_RULES.payoutMax),
            nameWindow: duration(FAMILY_RULES.nameWindow),
            nameMin: String(FAMILY_RULES.nameMin),
            nameMax: String(FAMILY_RULES.nameMax),
            maxChildren: String(FAMILY_RULES.maxChildren)
        },

        prison: {
            blocked: [...crime.PRISON_BLOCKED_COMMANDS].map(name => code(`/${name}`)).join(", "),
            wantedPage: String(crime.WANTED_PAGE_SIZE)
        },

        laundering: {
            energy: String(LAUNDERING_CONFIG.energyCost),
            min: reais(LAUNDERING_CONFIG.minAmount),
            max: reais(LAUNDERING_CONFIG.maxAmount),
            gems: String(LAUNDERING_CONFIG.privateUnlockGems),
            publicRate: range(LAUNDERING_CONFIG.kinds.public.rate.min, LAUNDERING_CONFIG.kinds.public.rate.max, percent),
            privateRate: range(LAUNDERING_CONFIG.kinds.private.rate.min, LAUNDERING_CONFIG.kinds.private.rate.max, percent),
            publicPerMinute: reais(LAUNDERING_CONFIG.kinds.public.perMinute),
            privatePerMinute: reais(LAUNDERING_CONFIG.kinds.private.perMinute),
            publicCooldown: duration(LAUNDERING_CONFIG.kinds.public.cooldown),
            privateCooldown: duration(LAUNDERING_CONFIG.kinds.private.cooldown),

            // o tempo de uma lavagem máxima e quanto ela devolve, em média
            publicMaxTime: duration(Math.ceil(LAUNDERING_CONFIG.maxAmount / LAUNDERING_CONFIG.kinds.public.perMinute) * LAUNDERING_CONFIG.batchSeconds),
            privateMaxTime: duration(Math.ceil(LAUNDERING_CONFIG.maxAmount / LAUNDERING_CONFIG.kinds.private.perMinute) * LAUNDERING_CONFIG.batchSeconds),
            publicMaxBack: reais(Math.round(LAUNDERING_CONFIG.maxAmount * (LAUNDERING_CONFIG.kinds.public.rate.min + LAUNDERING_CONFIG.kinds.public.rate.max) / 2)),
            privateMaxBack: reais(Math.round(LAUNDERING_CONFIG.maxAmount * (LAUNDERING_CONFIG.kinds.private.rate.min + LAUNDERING_CONFIG.kinds.private.rate.max) / 2))
        },

        escape: {
            stages: String(ESCAPE_CONFIG.stages),
            exits: String(ESCAPE_CONFIG.exits),
            cooldown: duration(ESCAPE_CONFIG.cooldown),
            winCut: percent(ESCAPE_CONFIG.winCut),
            lossAdd: percent(ESCAPE_CONFIG.lossAdd),
            maxChange: percent(ESCAPE_CONFIG.maxChange),
            open: `${ESCAPE_CONFIG.openMs / 1000}`,

            // em uma pena de crime (a mais comum): quanto corta, quanto soma e o limite
            exampleCut: minutes(CRIME_CONFIG.jailSeconds * ESCAPE_CONFIG.winCut),
            exampleAdd: minutes(CRIME_CONFIG.jailSeconds * ESCAPE_CONFIG.lossAdd),
            exampleMax: minutes(CRIME_CONFIG.jailSeconds * ESCAPE_CONFIG.maxChange)
        },

        duel: {
            cooldown: duration(DUEL_RULES.cooldown),
            requestTtl: duration(DUEL_RULES.requestTtl),
            minHp: String(DUEL_RULES.minHp),
            winXp: String(DUEL_RULES.winXp),
            unarmed: String(DUEL_RULES.unarmedDamage),
            defaultDamage: String(DUEL_RULES.defaultWeaponDamage),
            vestCap: String(DUEL_RULES.vestCap),

            // exemplo do colete: um revólver, e um golpe sem arma, contra o colete da loja
            exampleWeapon: getItem("revolver").name.toLowerCase(),
            exampleWeaponDamage: String(getItem("revolver").damage),
            exampleVest: String(Math.max(1, getItem("revolver").damage - Math.min(DUEL_RULES.vestCap, ARMORY_RULES.vestDefense))),
            exampleUnarmedVest: String(Math.max(1, DUEL_RULES.unarmedDamage - Math.min(DUEL_RULES.vestCap, ARMORY_RULES.vestDefense)))
        },

        hospital: {
            maxHp: String(HOSPITAL_RULES.maxHp),
            costPerHp: reais(HOSPITAL_RULES.costPerHp),
            protection: duration(HOSPITAL_RULES.protectionSeconds)
        },

        armory: {
            ammoPrice: reais(ARMORY_RULES.ammoPrice),
            maxAmmo: String(ARMORY_RULES.maxAmmoPerPurchase),
            vestPrice: reais(ARMORY_RULES.vestPrice),
            vestDefense: String(ARMORY_RULES.vestDefense),
            repairPrice: reais(ARMORY_RULES.repairPrice),
            maxDurability: String(ARMORY_RULES.maxDurability)
        },

        site: {
            commands: String(site.stats.commands),
            aliases: String(site.stats.aliases),
            jobs: String(site.stats.jobs),
            shopItems: String(site.stats.shopItems),
            weapons: String(site.stats.weapons),
            achievements: String(site.stats.achievements)
        },

        live: {
            interval: duration(LIVE_CONFIG.intervalMs / 1000)
        }
    };

    // ---------- tabelas ({{table:...}}) ----------
    const tables = {};

    tables.jobs = table(
        ["#", "Emprego", "Nível", "Salário por turno"],
        JOBS.map((job, index) => [String(index + 1), job.name, String(job.level), reais(job.salary)])
    );

    tables.weapons = table(
        ["Arma", "Tipo", "Dano", "Preço de tabela", "Chance no roubo"],
        weapons.map(item => [
            `${item.emoji} ${item.name} ${code(item.id)}`,
            item.weaponType === "firearm" ? "Fogo" : "Branca",
            String(item.damage || DUEL_RULES.defaultWeaponDamage),
            reais(item.buyPrice),
            `${crime.ROBBERY_WEAPON_CHANCE[item.id] ?? crime.ROBBERY_DEFAULT_CHANCE}%`
        ])
    );

    // armas têm tabela própria (tables.weapons); aqui, o resto da loja
    tables.shop = table(
        ["Item", "Compra", "Venda", "Para que serve"],
        ITEMS.filter(item => item.buyPrice > 0 && item.category !== "weapon").map(item => [
            `${item.emoji} ${item.name} (${getCategoryName(item.category)}, até ${item.maxStack})`,
            reais(item.buyPrice),
            item.sellable ? reais(item.sellPrice) : "Não vende",
            item.description
        ])
    );

    const energyItems = ITEMS.filter(item => item.use?.energy);

    tables["energy-items"] = table(
        ["Item", "Repõe", "Preço"],
        energyItems.map(item => [`${item.emoji} ${item.name}`, `${item.use.energy} de energia`, reais(item.buyPrice)])
    );

    tables["energy-costs"] = table(
        ["Ação", "Custo em energia"],
        [
            [`Trabalhar (${code("/trabalhar")})`, String(ENERGY_CONFIG.workCost)],
            [`Crime (${code("/crime")})`, String(CRIME_CONFIG.energyCost)],
            [`Roubar (${code("/roubar")})`, String(ROBBERY_CONFIG.energyCost)],
            [`Lavar dinheiro (${code("/lavagem")})`, String(LAUNDERING_CONFIG.energyCost)]
        ]
    );

    tables.missions = table(
        ["Missão", "O que fazer", "Prêmio", "XP"],
        MISSIONS.map(mission => [
            `${mission.emoji} ${mission.name}`,
            mission.description,
            reais(mission.reward),
            String(mission.xp)
        ])
    );

    tables.achievements = table(
        ["Conquista", "Raridade", "Como conseguir", "Título e identificador"],
        achievements.getAllAchievements().map(achievement => [
            `${achievement.emoji} ${achievement.name}`,
            achievements.ACHIEVEMENT_RARITIES[achievement.rarity].name,
            achievement.description,
            `${achievement.titleEmoji ?? ""} ${achievement.title} ${code(achievement.id)}`.trim()
        ])
    );

    tables["market-bands"] = table(
        ["Faixa", "Índice", "Preço"],
        MARKET_CONFIG.bands.map((band, i) => {
            const from = i === 0 ? 0 : MARKET_CONFIG.bands[i - 1].max + 1;

            return [
                `${band.emoji} ${band.label}`,
                `${from} a ${band.max}`,
                `de ${percent(priceBp(from) / 10_000)} a ${percent(priceBp(band.max) / 10_000)} da tabela`
            ];
        })
    );

    // prêmio e multa do crime por nível (o multiplicador é o do código: rewardScale)
    const wholeReais = cents => Math.round(cents / 100) * 100;

    tables["crime-scale"] = table(
        ["Nível", "Multiplicador", "Prêmio de um crime comum", "Multa se falhar"],
        [1, 10, 25, 50, 75, 100].map(level => {
            const scale = crime.rewardScale(level);

            return [
                String(level),
                `${scale.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`,
                range(
                    wholeReais(Math.min(...stories.map(story => story.min)) * scale),
                    wholeReais(Math.max(...stories.map(story => story.max)) * scale),
                    reais
                ),
                range(wholeReais(CRIME_FINE.min * scale), wholeReais(CRIME_FINE.max * scale), reais)
            ];
        })
    );

    // quanto um roubo pode levar, conforme a carteira do alvo
    tables["robbery-cap"] = table(
        ["Carteira do alvo", "Um roubo leva de", "até"],
        [500, 2_000, 10_000, 16_000, 50_000, 200_000].map(wallet => {
            const cents = wallet * 100;
            const cap = robberyCap(cents);

            return [
                reais(cents),
                reais(Math.min(Math.floor(cents * ROBBERY_CONFIG.stealRate.min), cap, cents)),
                reais(Math.min(Math.floor(cents * ROBBERY_CONFIG.stealRate.max), cap, cents))
            ];
        })
    );

    tables.streak = table(
        ["Dia da sequência", ...streak.map((_, i) => `${i + 1}`)],
        [["Prêmio", ...streak.map(reais)]]
    );

    tables.levels = table(
        ["Nível", "XP total necessário"],
        [2, 5, 10, 20, 30, 50, 75, 100].map(level => [String(level), xpForLevel(level).toLocaleString("pt-BR")])
    );

    tables.cooldowns = table(
        ["O quê", "Comando", "Espera"],
        [
            [COOLDOWNS.work.name, code(COOLDOWNS.work.command), duration(COOLDOWNS.work.duration)],
            [COOLDOWNS.daily.name, code(COOLDOWNS.daily.command), duration(COOLDOWNS.daily.duration)],
            ["Coletar gemas (painel do site)", "site", duration(GEM_BONUS.cooldown)],
            ["Crime", code("/crime"), duration(CRIME_CONFIG.cooldown)],
            ["Roubar", code("/roubar"), duration(ROBBERY_CONFIG.cooldown)],
            ["Lavagem pública", code("/lavagem"), duration(LAUNDERING_CONFIG.kinds.public.cooldown)],
            ["Lavagem privada", code("/lavagem"), duration(LAUNDERING_CONFIG.kinds.private.cooldown)],
            ["Fuga da prisão", code("/prisao"), duration(ESCAPE_CONFIG.cooldown)],
            ["Duelo", code("/atacar"), duration(DUEL_RULES.cooldown)],
            ["Novo sorteio da bolsa", code("/bolsa"), duration(MARKET_CONFIG.intervalSeconds)]
        ]
    );

    for (const category of site.categories) {
        tables[`commands:${category.id}`] = table(
            ["Comando", "Atalhos", "O que faz"],
            category.commands.map(command => [
                code(`/${command.name}`),
                command.aliases.length ? command.aliases.map(alias => code(`/${alias}`)).join(", ") : "—",
                command.description
            ])
        );
    }

    return { values, tables, categories: site.categories };
}

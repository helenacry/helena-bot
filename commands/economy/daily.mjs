import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { claimDaily, getDailyStatus } from "../../services/economy/daily.mjs";

import { loadWebConfig } from "../../services/web/web-api.mjs";

import { SITE_URL } from "../../config/site.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// A ESCADA DOS 7 DIAS
// ==========================================

// Os sete passos da sequência, como no painel do site: verde o que já foi, cinza o que falta e o
// presente no fim (o bônus semanal). "streak" é a sequência de agora; o ciclo recomeça a cada 7 dias.
function ladder(streak) {
    const today = streak > 0 ? ((streak - 1) % 7) + 1 : 0;

    return Array.from({ length: 7 }, (_unused, index) => {
        const day = index + 1;

        if (day <= today) return "🟩";

        return day === 7 ? "🎁" : "⬜";
    }).join("");
}

const streakLine = (streak, best) =>
    `🔥 **${plural(streak, "dia")}** seguidos · recorde de ${plural(best, "dia")}`;

// ==========================================
// RESPOSTAS
// ==========================================

function cooldownResponse(result) {
    return embedResponse(
        ledgerEmbed({
            section: "Daily",
            title: "⏳ Você já resgatou hoje",

            say:
                "Volte em **" + formatDuration(result.remaining) + "** para o próximo prêmio.\n" +
                streakLine(result.streak, result.bestStreak) + "\n" +
                ladder(result.streak),

            color: HELENA_COLORS.wait,
            mood: "dormindo",

            footer: "Voltando em até 48 horas, a sequência continua"
        })
    );
}

function claimedResponse(result) {
    const { reward, streak, bestStreak, wallet } = result;

    const rows = [["Recompensa base", signed(reward.base, formatMoney(reward.base))]];

    if (reward.progressiveBonus > 0) {
        rows.push(["Bônus de sequência", signed(reward.progressiveBonus, formatMoney(reward.progressiveBonus))]);
    }

    if (reward.weeklyBonus > 0) {
        rows.push(["Bônus de 7 dias", signed(reward.weeklyBonus, formatMoney(reward.weeklyBonus))]);
    }

    rows.push(
        null,
        ["Total", signed(reward.total, formatMoney(reward.total))],
        ["Carteira", formatMoney(wallet)]
    );

    return embedResponse(
        ledgerEmbed({
            section: "Daily",
            title: "🎁 Recompensa do dia",

            say:
                (reward.weeklyBonus > 0
                    ? "Sete dias seguidos: o bônus semanal saiu junto! 🎉\n"
                    : "Dia **" + (((streak - 1) % 7) + 1) + "** de 7 da sua sequência.\n") +
                streakLine(streak, bestStreak) + "\n" +
                ladder(streak),

            rows,

            color: HELENA_COLORS.success,
            mood: reward.weeklyBonus > 0 ? "festa" : "feliz",

            footer: "Volte em 24 horas para manter a sequência"
        })
    );
}

// ==========================================
// O DAILY É COLETADO NO SITE
// ==========================================

// Com o painel do site no ar (a API ligada, HELENA_WEB_PORT e o resto), o daily só se coleta lá, como
// na Alfacusa: o /daily mostra se está disponível neste servidor e leva ao painel. Sem o painel (o bot
// de teste, ou quem roda sem o site) o comando segue pagando como sempre, para ninguém ficar sem daily.
// HELENA_DAILY_ON_SITE=off força o comando a pagar mesmo com o painel ligado.
export function dailyOnSite(env = process.env) {
    return loadWebConfig(env).enabled && String(env.HELENA_DAILY_ON_SITE ?? "").trim().toLowerCase() !== "off";
}

export const DAILY_PANEL_URL = `${SITE_URL}account/`;

function siteResponse(guildId, userId) {
    // o primeiro comando já abre a conta, como nos outros
    getPlayer(guildId, userId);

    const status = getDailyStatus(guildId, userId);

    const state = status.available
        ? "✅ Disponível agora neste servidor"
        : `⏳ Libera <t:${Math.floor(Date.now() / 1000) + status.remaining}:R> neste servidor`;

    const embed = createEmbed({
        title: "🎁 Bônus diário",

        description: [
            `-# ${state}`,
            "",
            "O daily agora é coletado no site da Helena. Entre com a sua conta do Discord e pegue o seu: " +
            "cada servidor tem a própria recarga de 24 horas e a própria sequência."
        ].join("\n"),

        color: status.available ? HELENA_COLORS.success : HELENA_COLORS.wait,
        footer: "",
        timestamp: false
    });

    const response = embedResponse(embed);

    response.data.components = [{
        type: "row",
        components: [{ type: "button", style: "link", label: "Coletar no site", emoji: "🌐", url: DAILY_PANEL_URL }]
    }];

    return response;
}

// ==========================================
// COMANDO /DAILY
// ==========================================

// As regras (recarga, sequência, bônus, limite da carteira) ficam em
// services/economy/daily.mjs, compartilhadas com o painel do site.

export default {
    name: "daily",
    aliases: ["diario"],

    description:
        "Veja o seu bônus diário (a coleta é no site da Helena)",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            if (dailyOnSite()) {
                return siteResponse(guildId, userId);
            }

            const result = claimDaily(guildId, userId);

            if (result.status === "cooldown") {
                return cooldownResponse(result);
            }

            if (result.status === "wallet_full") {
                return errorEmbed(
                    "Sua carteira não comporta a recompensa diária.\n\n" +
                    "Deposite parte do dinheiro no banco e tente novamente.",
                    "Carteira no limite"
                );
            }

            return claimedResponse(result);

        } catch (error) {
            console.error("[DAILY]", error);

            return errorEmbed(
                "Não foi possível processar sua recompensa diária."
            );
        }
    }
};

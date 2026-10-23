import { formatMoney } from "../../database/economy.mjs";

import { claimDaily } from "../../services/economy/daily.mjs";

import {
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
// COMANDO /DAILY
// ==========================================

// As regras (recarga, sequência, bônus, limite da carteira) ficam em
// services/economy/daily.mjs, compartilhadas com o painel do site.

export default {
    name: "daily",
    aliases: ["diario"],

    description:
        "Resgate sua recompensa diária e aumente sua sequência",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
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

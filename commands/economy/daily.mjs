
import { formatMoney } from "../../database/economy.mjs";

import { claimDaily } from "../../services/daily.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// UTILITÁRIOS
// ==========================================

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}h ${minutes}m ${secs}s`;
}

// ==========================================
// RESPOSTAS
// ==========================================

function cooldownResponse(result) {
    return embedResponse(
        createEmbed({
            title: "⏳ Helena Daily",

            description:
                "Você já resgatou sua recompensa diária.",

            color: HELENA_COLORS.warning,

            fields: [
                {
                    name: "🔥 Sequência atual",
                    value: "**" + result.streak + " dias**",
                    inline: true
                },
                {
                    name: "🏆 Recorde",
                    value: "**" + result.bestStreak + " dias**",
                    inline: true
                },
                {
                    name: "⏰ Próximo resgate",
                    value: "**" + formatTime(result.remaining) + "**",
                    inline: false
                }
            ],

            footer: "Helena Daily • Volte amanhã!"
        })
    );
}

function claimedResponse(result) {
    const { reward, streak, bestStreak, wallet } = result;

    const rewardFields = [
        {
            name: "💰 Recompensa base",
            value: "**" + formatMoney(reward.base) + "**",
            inline: true
        },
        {
            name: "🔥 Bônus de sequência",
            value: "**" + formatMoney(reward.progressiveBonus) + "**",
            inline: true
        }
    ];

    if (reward.weeklyBonus > 0) {
        rewardFields.push({
            name: "🎁 Bônus de 7 dias",
            value: "**" + formatMoney(reward.weeklyBonus) + "**",
            inline: false
        });
    }

    rewardFields.push(
        {
            name: "💵 Total recebido",
            value: "**" + formatMoney(reward.total) + "**",
            inline: false
        },
        {
            name: "🔥 Sequência atual",
            value: "**" + streak + " dias**",
            inline: true
        },
        {
            name: "🏆 Seu recorde",
            value: "**" + bestStreak + " dias**",
            inline: true
        },
        {
            name: "👛 Carteira atual",
            value: "**" + formatMoney(wallet) + "**",
            inline: true
        },
        {
            name: "⏰ Próximo resgate",
            value: "**24 horas**",
            inline: true
        }
    );

    return embedResponse(
        createEmbed({
            title: "🎁 Helena Daily",

            description:
                "**Recompensa resgatada!**\n\n" +
                "Você completou o dia **" + streak +
                "** da sua sequência." +
                (
                    reward.weeklyBonus > 0
                        ? "\n\n🎉 Bônus semanal desbloqueado!"
                        : ""
                ),

            color: HELENA_COLORS.success,

            fields: rewardFields,

            footer: "Helena Daily • Sua dedicação merece recompensas."
        })
    );
}

// ==========================================
// COMANDO /DAILY
// ==========================================

// As regras (recarga, sequência, bônus, limite da carteira) ficam em
// services/daily.mjs, compartilhadas com o painel do site.

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

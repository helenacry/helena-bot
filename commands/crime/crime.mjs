
import { formatMoney } from "../../database/economy.mjs";

import { attemptCrime } from "../../services/crime.mjs";

import { CRIME_CONFIG } from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// RESULTADOS
// ==========================================

function successResponse(result) {
    return embedResponse(
        createEmbed({
            title: result.jackpot
                ? "💎 Golpe de mestre!"
                : "🕵️ Crime bem-sucedido!",

            description:
                result.story +
                (
                    result.leveledUp
                        ? "\n\n🎉 **Você alcançou o nível " +
                          result.level + "!**"
                        : ""
                ),

            color: HELENA_COLORS.success,

            fields: [
                {
                    name: "💸 Dinheiro sujo",
                    value: "**+" + formatMoney(result.amount) + "**",
                    inline: true
                },
                {
                    name: "✨ Experiência",
                    value: "**+" + result.xp + " XP**",
                    inline: true
                },
                {
                    name: "🧺 Total sujo",
                    value: "**" + formatMoney(result.dirtyTotal) + "**",
                    inline: true
                },
                {
                    name: "⚡ Energia",
                    value:
                        "-" + CRIME_CONFIG.energyCost +
                        " (restam " + result.energy + "/" +
                        result.energyMax + ")",
                    inline: true
                },
                {
                    name: "⏰ Próximo crime",
                    value: "Em " + formatDuration(CRIME_CONFIG.cooldown),
                    inline: true
                }
            ],

            footer:
                "Helena • Dinheiro sujo não compra nada. Use /lavagem."
        })
    );
}

function failureResponse(result) {
    const fields = [
        {
            name: "💸 Multa",
            value: result.fine > 0
                ? "**-" + formatMoney(result.fine) + "**"
                : "Nada: sua carteira estava vazia",
            inline: true
        },
        {
            name: "⛓️ Prisão",
            value: "**" + formatDuration(result.jailSeconds) + "**",
            inline: true
        }
    ];

    if (result.hpLost > 0) {
        fields.push({
            name: "🩸 Ferimento",
            value:
                "**-" + result.hpLost + " HP** (restam " +
                result.hp + ")",
            inline: true
        });
    }

    fields.push({
        name: "⚡ Energia",
        value:
            "-" + CRIME_CONFIG.energyCost +
            " (restam " + result.energy + "/" +
            result.energyMax + ")",
        inline: true
    });

    return embedResponse(
        createEmbed({
            title: "🚨 Você foi pego!",

            description:
                result.story + "\n\n" +
                "Enquanto estiver preso, você não pode trabalhar, " +
                "comprar nem movimentar dinheiro.",

            color: HELENA_COLORS.error,

            fields,

            footer: "Helena • Use /prisao para acompanhar sua pena."
        })
    );
}

// ==========================================
// COMANDO
// ==========================================

export default {
    name: "crime",
    description: "Cometa um crime em busca de dinheiro sujo",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            const result = attemptCrime(guildId, userId);

            return result.success
                ? successResponse(result)
                : failureResponse(result);

        } catch (error) {
            if (error instanceof GameBlocked) {
                return warningEmbed(error.title, error.message);
            }

            console.error("[CRIME]", error);

            return errorEmbed(
                "Não foi possível concluir o crime: " +
                error.message
            );
        }
    }
};

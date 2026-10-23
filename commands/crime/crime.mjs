
import { formatMoney } from "../../database/economy.mjs";

import { attemptCrime } from "../../services/crime/crime.mjs";

import { CRIME_CONFIG } from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed, stamp } from "../../utils/receipt.mjs";

// ==========================================
// RESULTADOS
// ==========================================

function successResponse(result) {
    return embedResponse(
        ledgerEmbed({
            section: "Crime",
            title: result.jackpot
                ? "💎 Golpe de mestre"
                : "🕵️ Crime bem-sucedido",

            say:
                result.story +
                (
                    result.leveledUp
                        ? "\n> 🎉 **Subiu para o nível " + result.level + "!**"
                        : ""
                ),

            rows: [
                ["Dinheiro sujo", signed(result.amount, formatMoney(result.amount))],
                ["Experiência", signed(result.xp, result.xp + " XP")],
                ["Energia", signed(-CRIME_CONFIG.energyCost, CRIME_CONFIG.energyCost + " (" + result.energy + "/" + result.energyMax + ")")],
                null,
                ["Total sujo", formatMoney(result.dirtyTotal)]
            ],

            note: stamp("não vale nada") + " até passar pela `/lavagem`.",

            color: HELENA_COLORS.money,
            mood: result.jackpot ? "festa" : "mascara",

            footer: "Próximo crime em " + formatDuration(CRIME_CONFIG.cooldown)
        })
    );
}

function failureResponse(result) {
    const rows = [
        [
            "Multa",
            result.fine > 0
                ? signed(-result.fine, formatMoney(result.fine))
                : "nada (carteira vazia)"
        ],
        ["Prisão", formatDuration(result.jailSeconds)]
    ];

    if (result.hpLost > 0) {
        rows.push(["Ferimento", signed(-result.hpLost, result.hpLost + " HP (restam " + result.hp + ")")]);
    }

    rows.push(["Energia", signed(-CRIME_CONFIG.energyCost, CRIME_CONFIG.energyCost + " (" + result.energy + "/" + result.energyMax + ")")]);

    return embedResponse(
        ledgerEmbed({
            section: "Crime",
            title: "🚨 Você foi pego",

            say:
                result.story + "\n" +
                "> Preso, você não trabalha, não compra e não mexe em dinheiro.",

            rows,

            color: HELENA_COLORS.error,
            mood: "preso",

            footer: "/prisao acompanha a sua pena"
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

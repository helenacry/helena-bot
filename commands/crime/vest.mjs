
import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { buyVest, ARMORY_RULES } from "../../services/combat/armory.mjs";

import { DUEL_RULES } from "../../services/combat/combat.mjs";

// ==========================================
// COMANDO /COLETE
// ==========================================

// O colete tira pontos de cada golpe que você recebe num duelo (até
// DUEL_RULES.vestCap por golpe, e o golpe nunca cai abaixo de 1). Comprar de
// novo substitui o colete.

export default {
    name: "colete",
    description: `Compra um colete (${ARMORY_RULES.vestDefense} pontos de defesa)`,
    options: [],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            const cost = buyVest(guildId, userId);

            const embed = ledgerEmbed({
                section: "Arsenal",
                title: "🛡️ Colete equipado",

                say:
                    `Cada golpe que você recebe num duelo causa **${ARMORY_RULES.vestDefense}** ` +
                    "pontos a menos de dano (nunca menos de 1).",

                rows: [
                    ["Defesa", `${ARMORY_RULES.vestDefense} pontos`],
                    ["Pagou", signed(-cost, formatMoney(cost))],
                    ["Carteira", formatMoney(getPlayer(guildId, userId).wallet)]
                ],

                color: HELENA_COLORS.success,
                mood: "bravo",

                footer: `O colete segura até ${DUEL_RULES.vestCap} pontos por golpe`
            });

            return embedResponse(embed);

        } catch (error) {
            return warningEmbed(
                "Não foi possível comprar o colete",
                error?.message || "Tente de novo em instantes."
            );
        }
    }
};

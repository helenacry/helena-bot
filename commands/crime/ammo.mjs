
import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { buyAmmo, ARMORY_RULES } from "../../services/combat/armory.mjs";

import { status } from "../../services/combat/combat.mjs";

import { reais } from "../../utils/money-text.mjs";

// ==========================================
// COMANDO /MUNICAO
// ==========================================

// Compra munição, de 1 a ARMORY_RULES.maxAmmoPerPurchase por vez. Armas de
// fogo gastam 1 por duelo e 1 por roubo bem-sucedido.

export default {
    name: "municao",
    description: `Compra munição (${reais(ARMORY_RULES.ammoPrice)} cada)`,

    options: [
        {
            name: "quantidade",
            description: `Quantas munições comprar (1 a ${ARMORY_RULES.maxAmmoPerPurchase})`,
            type: "integer",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            const quantity = Number(interaction.data?.options?.quantidade);

            const cost = buyAmmo(guildId, userId, quantity);

            const embed = ledgerEmbed({
                section: "Arsenal",
                title: "🔫 Munição comprada",

                say: `Você comprou **${quantity}** ${quantity === 1 ? "munição" : "munições"}.`,

                rows: [
                    ["Pagou", signed(-cost, formatMoney(cost))],
                    ["Munição agora", String(status(guildId, userId).ammo)],
                    null,
                    ["Carteira", formatMoney(getPlayer(guildId, userId).wallet)]
                ],

                color: HELENA_COLORS.economy,
                mood: "bravo",

                footer: "Armas de fogo gastam 1 por duelo e por roubo"
            });

            return embedResponse(embed);

        } catch (error) {
            return warningEmbed(
                "Não foi possível comprar munição",
                error?.message || "Tente de novo em instantes."
            );
        }
    }
};

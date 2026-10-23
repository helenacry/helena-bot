
import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { repair, ARMORY_RULES } from "../../services/combat/armory.mjs";

import { status } from "../../services/combat/combat.mjs";

import { getEquippedWeapon } from "../../services/combat/equipment.mjs";

import { durabilityLine } from "../../services/combat/combat-view.mjs";

import { reais } from "../../utils/money-text.mjs";

// ==========================================
// COMANDO /REPARAR
// ==========================================

// Devolve a durabilidade da arma equipada ao máximo. Cada duelo e cada roubo
// bem-sucedido gasta 1 ponto.

export default {
    name: "reparar",
    description: `Conserta a arma equipada (${reais(ARMORY_RULES.repairPrice)})`,
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
            const cost = repair(guildId, userId);

            const weapon = getEquippedWeapon(guildId, userId);

            const embed = ledgerEmbed({
                section: "Arsenal",
                title: "🔧 Arma reparada",

                say:
                    (weapon
                        ? `${weapon.emoji} **${weapon.name}** voltou ao novo.`
                        : "Sua arma voltou ao novo.") +
                    "\n🔧 " + durabilityLine(status(guildId, userId).durability),

                rows: [
                    ["Pagou", signed(-cost, formatMoney(cost))],
                    ["Carteira", formatMoney(getPlayer(guildId, userId).wallet)]
                ],

                color: HELENA_COLORS.success,
                mood: "feliz",

                footer: "Cada duelo e roubo gasta 1 ponto"
            });

            return embedResponse(embed);

        } catch (error) {
            return warningEmbed(
                "Não foi possível reparar",
                error?.message || "Tente de novo em instantes."
            );
        }
    }
};

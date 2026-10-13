
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { repair, ARMORY_RULES } from "../../services/armory.mjs";

import { status } from "../../services/combat.mjs";

import { getEquippedWeapon } from "../../services/equipment.mjs";

import { durabilityLine } from "../../services/combat-view.mjs";

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

            const embed = createEmbed({
                title: "🔧 Arma reparada",

                description: weapon
                    ? `${weapon.emoji} **${weapon.name}** voltou ao novo.`
                    : "Sua arma voltou ao novo.",

                color: HELENA_COLORS.success,

                fields: [
                    {
                        name: "🔧 Durabilidade",
                        value: durabilityLine(status(guildId, userId).durability),
                        inline: false
                    },
                    {
                        name: "💸 Valor pago",
                        value: formatMoney(cost),
                        inline: true
                    },
                    {
                        name: "👛 Carteira",
                        value: formatMoney(getPlayer(guildId, userId).wallet),
                        inline: true
                    }
                ],

                footer: "Helena • Arsenal"
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

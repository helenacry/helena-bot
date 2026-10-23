
import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { reload } from "../../services/combat/armory.mjs";

import { getEquippedWeapon } from "../../services/combat/equipment.mjs";

// ==========================================
// COMANDO /RECARREGAR
// ==========================================

// Só confere a munição que você tem com a arma de fogo equipada: não existe
// "carregar" a arma, o estoque é gasto direto (1 por duelo e 1 por roubo
// bem-sucedido). Para ter mais, use /municao.

export default {
    name: "recarregar",
    description: "Mostra a munição da arma de fogo equipada",
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
            const ammo = reload(guildId, userId);

            const weapon = getEquippedWeapon(guildId, userId);

            const embed = ledgerEmbed({
                section: "Arsenal",
                title: "🔫 Munição",

                say:
                    `${weapon.emoji} **${weapon.name}** está pronta.\n` +
                    "Cada duelo e cada roubo bem-sucedido gasta **1** munição. " +
                    "Para ter mais, use `/municao`.",

                rows: [["Munição", ammo > 0 ? String(ammo) : "0 (compre com /municao)"]],

                color: ammo > 0 ? HELENA_COLORS.success : HELENA_COLORS.warning,
                mood: ammo > 0 ? "bravo" : "alerta",

                footer: "O estoque gasta direto, sem carregar"
            });

            return embedResponse(embed);

        } catch (error) {
            return warningEmbed(
                "Sem arma de fogo",
                error?.message || "Equipe uma arma de fogo com `/equipar`."
            );
        }
    }
};

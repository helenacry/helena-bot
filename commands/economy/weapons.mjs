
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { status } from "../../services/combat.mjs";

import { getEquippedWeapon } from "../../services/equipment.mjs";

import {
    durabilityLine,
    isFirearm,
    weaponDamage,
    weaponTypeLabel
} from "../../services/combat-view.mjs";

// ==========================================
// COMANDO /ARMAS
// ==========================================

// A arma que você tem equipada, com o dano, o desgaste e a munição.

export default {
    name: "armas",
    description: "Mostra a arma equipada, o dano e o desgaste",
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
            const weapon = getEquippedWeapon(guildId, userId);

            if (!weapon) {
                return embedResponse(createEmbed({
                    title: "🗡️ Armamento",

                    description:
                        "Você está **sem arma equipada**.\n\n" +
                        "Compre uma na `/loja` (prateleira **Armas**) e equipe com `/equipar`.",

                    color: HELENA_COLORS.neutral,

                    footer: "Helena • Arsenal"
                }));
            }

            const state = status(guildId, userId);

            const embed = createEmbed({
                title: `${weapon.emoji} ${weapon.name}`,

                description: weapon.description || "Arma equipada.",

                color: HELENA_COLORS.primary,

                fields: [
                    {
                        name: "⚔️ Dano",
                        value: String(weaponDamage(weapon)),
                        inline: true
                    },
                    {
                        name: "🧰 Tipo",
                        value: weaponTypeLabel(weapon),
                        inline: true
                    },
                    {
                        name: "🔫 Munição",
                        value: isFirearm(weapon) ? String(state.ammo) : "Não usa",
                        inline: true
                    },
                    {
                        name: "🔧 Durabilidade",
                        value: durabilityLine(state.durability),
                        inline: false
                    }
                ],

                footer: "Helena • Arsenal"
            });

            return embedResponse(embed);

        } catch (error) {
            console.error("[ARMAS]", error);

            return errorEmbed(
                "Não foi possível consultar a sua arma."
            );
        }
    }
};

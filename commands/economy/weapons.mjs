
import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { status } from "../../services/combat/combat.mjs";

import { getEquippedWeapon } from "../../services/combat/equipment.mjs";

import {
    durabilityLine,
    isFirearm,
    weaponDamage,
    weaponTypeLabel
} from "../../services/combat/combat-view.mjs";

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
                return embedResponse(ledgerEmbed({
                    section: "Arsenal",
                    title: "🗡️ Sem arma equipada",

                    say:
                        "Você está desarmado. Compre uma na `/loja` (prateleira **Armas**) " +
                        "e equipe com `/equipar`.",

                    color: HELENA_COLORS.wait,
                    mood: "triste",

                    footer: "Sem arma, sem duelo"
                }));
            }

            const state = status(guildId, userId);

            const embed = ledgerEmbed({
                section: "Arsenal",
                title: `${weapon.emoji} ${weapon.name}`,

                say:
                    (weapon.description || "Arma equipada.") + "\n" +
                    "🔧 " + durabilityLine(state.durability),

                rows: [
                    ["Dano", String(weaponDamage(weapon))],
                    ["Tipo", weaponTypeLabel(weapon)],
                    ["Munição", isFirearm(weapon) ? String(state.ammo) : "não usa"]
                ],

                color: HELENA_COLORS.error,
                mood: "bravo",

                footer: "/reparar e /recarregar cuidam da arma"
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

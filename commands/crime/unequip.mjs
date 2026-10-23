
import {
    unequipWeapon
} from "../../services/combat/equipment.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

export default {
    name: "desequipar",
    description: "Guarda a arma equipada de volta no inventário",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const weapon = unequipWeapon(
                guildId,
                userId
            );

            return embedResponse(
                ledgerEmbed({
                    section: "Arsenal",
                    title: "🛡️ Arma desequipada",

                    say:
                        (weapon
                            ? weapon.emoji + " **" + weapon.name + "** saiu da sua mão."
                            : "Você removeu sua arma.") +
                        "\nEla continua no inventário e dá para equipar de novo.",

                    color: HELENA_COLORS.wait,
                    mood: "dormindo",

                    footer: "/equipar traz uma arma de volta"
                })
            );

        } catch (error) {
            console.error("[DESEQUIPAR]", error);

            return errorEmbed(
                error.message || "Não foi possível desequipar a arma."
            );
        }
    }
};
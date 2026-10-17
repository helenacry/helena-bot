
import {
    unequipWeapon
} from "../../services/combat/equipment.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
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
                createEmbed({
                    title: "🛡️ Arma desequipada",

                    description:
                        "Você removeu sua arma do espaço de equipamento.",

                    color: HELENA_COLORS.primary,

                    fields: [
                        {
                            name: "Arma anterior",
                            value: weapon
                                ? weapon.emoji + " **" + weapon.name + "**"
                                : "Arma removida",
                            inline: false
                        },
                        {
                            name: "📦 Inventário",
                            value:
                                "A arma continua no seu inventário. " +
                                "Você poderá equipá-la novamente.",
                            inline: false
                        }
                    ]
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
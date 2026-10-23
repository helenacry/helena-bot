
import {
    equipWeapon
} from "../../services/combat/equipment.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

export default {
    name: "equipar",
    description: "Equipa uma arma do seu inventário",

    options: [
        {
            name: "item",
            description: "ID da arma que deseja equipar",
            type: "string",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const itemId = interaction.data.options?.item;

            const weapon = equipWeapon(
                guildId,
                userId,
                itemId
            );

            return embedResponse(
                ledgerEmbed({
                    section: "Arsenal",
                    title: "⚔️ Arma equipada",

                    say:
                        weapon.emoji + " **" + weapon.name + "** está na sua mão.\n" +
                        (weapon.description || ""),

                    note: "Ela já aparece no seu `/perfil`.",

                    color: HELENA_COLORS.success,
                    mood: "bravo",

                    footer: "/armas mostra o dano e o desgaste"
                })
            );

        } catch (error) {
            console.error("[EQUIPAR]", error);

            return errorEmbed(
                error.message || "Não foi possível equipar a arma."
            );
        }
    }
};
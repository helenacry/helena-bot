
import {
    equipWeapon
} from "../../services/equipment.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
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
                createEmbed({
                    title: "⚔️ Arma equipada!",

                    description:
                        "Seu equipamento foi atualizado com sucesso.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "🗡️ Arma atual",
                            value: weapon.emoji + " **" + weapon.name + "**",
                            inline: false
                        },
                        {
                            name: "📖 Descrição",
                            value: weapon.description,
                            inline: false
                        },
                        {
                            name: "👤 Perfil",
                            value:
                                "Sua arma equipada já aparece no comando `/perfil`.",
                            inline: false
                        }
                    ]
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
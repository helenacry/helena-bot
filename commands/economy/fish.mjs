import { fish } from "../../services/economy/fishing.mjs";

import { fishingResponse } from "../../services/economy/fishing-view.mjs";

import { errorEmbed } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /PESCAR
// ==========================================

// Lança a linha com a Vara de pesca do inventário: gasta energia, dá XP e traz um peixe (ou lixo, ou nada).
// As regras estão em config/fishing.mjs, a conta em services/economy/fishing.mjs e a tela em fishing-view.mjs.

export default {
    name: "pescar",
    aliases: ["fish"],
    description: "Pesque com a vara e venda o que pegar",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            return fishingResponse(fish(guildId, userId));

        } catch (error) {
            console.error("[PESCAR]", error);

            return errorEmbed(
                "Não foi possível pescar: " +
                (error.message || "erro inesperado.")
            );
        }
    }
};

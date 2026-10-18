
import { buildFamily } from "../../services/panels/family-panel.mjs";

import { embedResponse, errorEmbed } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /FAMILIA
// ==========================================

// O casal, os filhos já registrados e o bebê que espera um nome (com o botão para registrar).

export default {
    name: "familia",
    description: "Veja o seu casal e os seus filhos",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed("Não foi possível identificar sua conta.");
        }

        try {
            const view = buildFamily({ guildId, userId: String(userId) });

            const response = embedResponse(view.embed);

            if (view.components.length) {
                response.data.components = view.components;
            }

            return response;

        } catch (error) {
            console.error("[FAMILIA]", error);

            return errorEmbed("Não foi possível carregar a família.");
        }
    }
};

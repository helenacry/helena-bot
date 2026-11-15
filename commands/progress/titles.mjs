import {
    getPlayer
} from "../../database/economy.mjs";

import {
    buildTitles,
    titlesResponse
} from "../../services/progress/titles-view.mjs";

import {
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /TITULOS
// ==========================================

// Os títulos que você desbloqueou, cada um com um botão para equipar (services/progress/titles-view.mjs). O
// mesmo painel abre com /equipartitulo e /desequipartitulo.

export default {
    name: "titulos",

    description:
        "Veja seus títulos e equipe um com um botão",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // Garantir cadastro do jogador.
            getPlayer(guildId, userId);

            return titlesResponse(buildTitles({ guildId, userId }));

        } catch (error) {
            console.error("[TITULOS]", error);

            return errorEmbed(
                "Não foi possível consultar seus títulos."
            );
        }
    }
};

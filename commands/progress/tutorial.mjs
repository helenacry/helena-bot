import { getPlayer } from "../../database/economy.mjs";

import {
    buildTutorial,
    tutorialResponse
} from "../../services/progress/tutorial-view.mjs";

import { errorEmbed } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /TUTORIAL
// ==========================================

// Os primeiros passos do jogo, com o que já foi feito e o prêmio de quem completa tudo
// (services/progress/tutorial.mjs, config/tutorial.mjs).

export default {
    name: "tutorial",
    description: "Siga os primeiros passos e ganhe um prêmio",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed("Não foi possível identificar sua conta.");
        }

        try {
            getPlayer(guildId, userId);

            return tutorialResponse(buildTutorial({ guildId, userId }));

        } catch (error) {
            console.error("[TUTORIAL]", error);

            return errorEmbed("Não foi possível abrir o tutorial.");
        }
    }
};

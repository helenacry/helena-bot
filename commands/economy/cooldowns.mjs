
import { buildCooldowns } from "../../services/economy/cooldowns-view.mjs";

import { embedResponse, errorEmbed } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /COOLDOWNS
// ==========================================

// Os tempos de recarga em dois grupos, o que é legal (trabalho, daily, gemas) e o que é
// ilegal (crime, roubo, lavagem, cadeia), com um botão Atualizar. A tela é montada em
// services/economy/cooldowns-view.mjs e o botão em services/panels/cooldowns-panel.mjs.

export default {
    name: "cooldowns",
    aliases: ["cd"],
    description: "Consulte o tempo restante das suas atividades",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const user = interaction.user;

        if (!guildId || !user?.id) {
            return errorEmbed("Não foi possível identificar sua conta.");
        }

        try {
            const view = buildCooldowns({ guildId, user });

            const response = embedResponse(view.embed);

            response.data.components = view.components;
            response.data.layout = view.layout;

            return response;

        } catch (error) {
            console.error("[COOLDOWNS]", error);

            return errorEmbed("Não foi possível consultar seus cooldowns.");
        }
    }
};

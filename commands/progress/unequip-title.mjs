import {
    getPlayer
} from "../../database/economy.mjs";

import {
    getEquippedTitle,
    unequipTitle
} from "../../services/progress/achievements.mjs";

import {
    buildTitles,
    titlesResponse
} from "../../services/progress/titles-view.mjs";

import {
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /DESEQUIPARTITULO
// ==========================================

// Tira o título equipado e mostra o painel dos títulos (de onde também dá para tirar, pelo botão "Tirar título").

export default {
    name: "desequipartitulo",

    description:
        "Remova seu título equipado sem perder a conquista",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            getPlayer(guildId, userId);

            const current = getEquippedTitle(guildId, userId);

            if (!current) {
                return titlesResponse(buildTitles({
                    guildId,
                    userId,
                    notice: "Você não tem título equipado. Escolha um nos botões abaixo."
                }));
            }

            if (!unequipTitle(guildId, userId)) {
                return errorEmbed(
                    "Não foi possível remover o título. Tente novamente."
                );
            }

            return titlesResponse(buildTitles({
                guildId,
                userId,
                notice: `🏷️ Título removido: **${current.formatted}**. A conquista continua sua e dá para equipar de novo.`
            }));

        } catch (error) {
            console.error(
                "[DESEQUIPARTITULO]",
                error
            );

            return errorEmbed(
                "Não foi possível desequipar seu título."
            );
        }
    }
};

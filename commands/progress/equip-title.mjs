import {
    getPlayer
} from "../../database/economy.mjs";

import {
    equipTitle,
    getEquippedTitle
} from "../../services/progress/achievements.mjs";

import {
    buildTitles,
    titlesResponse
} from "../../services/progress/titles-view.mjs";

import {
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /EQUIPARTITULO
// ==========================================

// Sem o identificador, abre o painel dos títulos, com um botão para equipar cada um. Com o identificador
// (/equipartitulo titulo:first_steps), equipa direto e mostra o mesmo painel com o resultado no topo.

export default {
    name: "equipartitulo",

    description:
        "Equipe um título com um botão",

    options: [
        {
            name: "titulo",
            description:
                "Identificador do título (deixe vazio para escolher pelos botões)",
            type: "string",
            required: false
        }
    ],

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

            const achievementId = String(
                interaction.data?.options?.titulo || ""
            ).trim().toLowerCase();

            // sem identificador: só o painel
            if (!achievementId) {
                return titlesResponse(buildTitles({ guildId, userId }));
            }

            // conquistas que já podem ser desbloqueadas entram antes de equipar
            buildTitles({ guildId, userId });

            if (getEquippedTitle(guildId, userId)?.achievementId === achievementId) {
                return titlesResponse(buildTitles({
                    guildId,
                    userId,
                    notice: "Esse título já está equipado."
                }));
            }

            const result = equipTitle(guildId, userId, achievementId);

            if (!result.success) {
                return titlesResponse(buildTitles({
                    guildId,
                    userId,
                    notice: "⚠️ " + result.reason + "\nEscolha um dos seus títulos abaixo."
                }));
            }

            return titlesResponse(buildTitles({
                guildId,
                userId,
                notice: `✨ Título equipado: **${result.title}**. Ele aparece no seu /perfil.`
            }));

        } catch (error) {
            console.error(
                "[EQUIPARTITULO]",
                error
            );

            return errorEmbed(
                "Não foi possível equipar esse título."
            );
        }
    }
};

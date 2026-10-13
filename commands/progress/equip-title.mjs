
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    checkAchievements,
    equipTitle,
    getEquippedTitle,
    getAvailableTitles
} from "../../services/achievements.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /EQUIPARTITULO
// ==========================================

export default {
    name: "equipartitulo",

    description:
        "Equipe um título que você desbloqueou",

    options: [
        {
            name: "titulo",
            description:
                "Identificador do título. Consulte /titulos",
            type: "string",
            required: true
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
            // ==================================
            // IDENTIFICAR JOGADOR
            // ==================================

            getPlayer(guildId, userId);

            const achievementId = String(
                interaction.data.options?.titulo || ""
            ).trim().toLowerCase();

            if (!achievementId) {
                return errorEmbed(
                    "Informe o identificador do título.\n\n" +
                    "Use `/titulos` para consultar os disponíveis."
                );
            }

            // ==================================
            // ATUALIZAR CONQUISTAS
            // ==================================

            checkAchievements(guildId, userId);

            // ==================================
            // VERIFICAR TÍTULO ATUAL
            // ==================================

            const currentTitle = getEquippedTitle(
                guildId,
                userId
            );

            if (
                currentTitle?.achievementId ===
                achievementId
            ) {
                return embedResponse(
                    createEmbed({
                        title: "🏷️ Helena Títulos",

                        description:
                            "Você já está utilizando o título:\n\n" +
                            "**" +
                            currentTitle.formatted +
                            "**",

                        color: HELENA_COLORS.warning,

                        footer:
                            "Helena • Títulos"
                    })
                );
            }

            // ==================================
            // EQUIPAR TÍTULO
            // ==================================

            const result = equipTitle(
                guildId,
                userId,
                achievementId
            );

            if (!result.success) {
                const available = getAvailableTitles(
                    guildId,
                    userId
                );

                const availableText = available.length
                    ? available
                        .map(title => "`" + title.id + "`")
                        .join(", ")
                    : "Nenhum título desbloqueado.";

                return errorEmbed(
                    result.reason +
                    "\n\n**Seus títulos disponíveis:**\n" +
                    availableText
                );
            }

            // ==================================
            // RESPOSTA
            // ==================================

            return embedResponse(
                createEmbed({
                    title: "✨ Título Equipado",

                    description:
                        "Seu novo título foi equipado com sucesso!\n\n" +
                        "**" +
                        result.title +
                        "**",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "🏆 Conquista",
                            value:
                                result.achievement.name,
                            inline: true
                        },
                        {
                            name: "🏷️ Identificador",
                            value:
                                "`" +
                                result.achievement.id +
                                "`",
                            inline: true
                        }
                    ],

                    footer:
                        "Helena • Use /perfil para visualizar seu título."
                })
            );

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

import { divorce } from "../../services/social/marriage.mjs";

import { createEmbed, embedResponse, errorEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /DIVORCIAR
// ==========================================

export default {
    name: "divorciar",
    description: "Encerra seu casamento atual",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        try {
            const result = divorce(guildId, userId);

            // os filhos do casal saem da família junto com o casamento
            const children = result.children > 0
                ? "\n> 👶 " + (
                    result.children === 1
                        ? "O filho do casal saiu da família junto com o casamento."
                        : `Os ${result.children} filhos do casal saíram da família junto com o casamento.`
                )
                : "";

            return embedResponse(
                createEmbed({
                    section: "Casamento",
                    title: "💔 Divórcio registrado",

                    description:
                        "Seu casamento foi encerrado. " +
                        "O estado civil de ambos voltou para Solteiro(a)." +
                        children,

                    color: HELENA_COLORS.wait,
                    mood: "triste",

                    footer: "Um novo capítulo começa"
                })
            );

        } catch (error) {
            return errorEmbed(error.message);
        }
    }
};

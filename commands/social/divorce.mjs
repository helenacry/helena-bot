
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

            const fields = [
                { name: "📄 Status", value: "Divórcio concluído.", inline: false }
            ];

            // os filhos do casal saem da família junto com o casamento
            if (result.children > 0) {
                fields.push({
                    name: "👶 Filhos",
                    value: result.children === 1
                        ? "O filho do casal saiu da família junto com o casamento."
                        : `Os ${result.children} filhos do casal saíram da família junto com o casamento.`,
                    inline: false
                });
            }

            return embedResponse(
                createEmbed({
                    title: "💔 Divórcio registrado",

                    description:
                        "Seu casamento foi encerrado.\n\n" +
                        "O estado civil de ambos os jogadores voltou para Solteiro(a).",

                    color: HELENA_COLORS.neutral,

                    fields
                })
            );

        } catch (error) {
            return errorEmbed(error.message);
        }
    }
};

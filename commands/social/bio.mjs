
import { db } from "../../database/connection.mjs";

import {
    getPlayer
} from "../../database/economy.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

const MAX_BIO_LENGTH = 160;

export default {
    name: "bio",
    description: "Personalize a descrição do seu perfil",

    options: [
        {
            name: "texto",
            description: "Sua biografia (até 160 caracteres)",
            type: "string",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const texto = interaction.data.options?.texto;

            if (typeof texto !== "string") {
                return errorEmbed(
                    "Informe um texto válido para sua bio."
                );
            }

            const bio = texto.trim();

            if (!bio) {
                return errorEmbed(
                    "Sua bio não pode ficar vazia."
                );
            }

            if (bio.length > MAX_BIO_LENGTH) {
                return errorEmbed(
                    `Sua bio pode ter no máximo ${MAX_BIO_LENGTH} caracteres.`
                );
            }

            getPlayer(guildId, userId);

            db.prepare(`
                UPDATE players
                SET bio = ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                bio,
                guildId,
                userId
            );

            return embedResponse(
                createEmbed({
                    title: "✏️ Bio atualizada",

                    description:
                        "Sua descrição pessoal foi salva com sucesso!",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "👤 Sua nova bio",
                            value: bio,
                            inline: false
                        },
                        {
                            name: "📌 Onde aparece?",
                            value:
                                "Sua descrição será exibida no comando `/perfil`.",
                            inline: false
                        }
                    ]
                })
            );

        } catch (error) {
            console.error("[BIO]", error);

            return errorEmbed(
                "Não foi possível atualizar sua bio."
            );
        }
    }
};

import { db } from "../../database/connection.mjs";

import {
    getPlayer
} from "../../database/economy.mjs";

import { bioPanel } from "../../services/panels.mjs";

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
            description: "Sua biografia (até 160 caracteres). Vazio abre o editor",
            type: "string",
            required: false
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

            // Sem texto: mostra a bio atual e o botão que abre o
            // editor (modal com a bio já preenchida).
            if (texto === undefined || texto === null) {
                const current = String(
                    getPlayer(guildId, userId).bio ?? ""
                ).trim();

                const panel = embedResponse(
                    createEmbed({
                        title: "✏️ Sua bio",

                        description: current ||
                            "Você ainda não definiu uma bio.",

                        color: HELENA_COLORS.primary,

                        footer:
                            "Helena • Use o botão para editar ou /bio <texto>."
                    })
                );

                panel.data.components = bioPanel(userId);

                return panel;
            }

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
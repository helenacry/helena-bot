import { db } from "../../database/connection.mjs";

import {
    getPlayer
} from "../../database/economy.mjs";

import { bioPanel } from "../../services/panels/panels.mjs";

import { cardText } from "../../services/social/profile-card.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// Quantos caracteres a bio aceita. Conta caracteres de verdade: um emoji vale 1 (o .length do
// JavaScript contaria 2, e uma bio com 100 emojis seria recusada como "maior que 160").
const MAX_BIO_LENGTH = 160;

const lengthOf = text => Array.from(text).length;

// O texto como é guardado: quebras de linha comuns, sem caracteres de controle, sem pedaços soltos
// de emoji (que quebrariam o JSON da API e o desenho do cartão) e sem os controles de direção do
// texto (que invertem a ordem das letras em volta). O resto, como o ZWJ dos emojis compostos, fica.
function cleanBio(text) {
    return String(text)
        .replace(/\r\n?/g, "\n")
        .replace(/\p{Cs}/gu, "")
        .replace(/[‪-‮⁦-⁩]/g, "")
        .replace(/[^\P{Cc}\n\t]/gu, "")
        .trim();
}

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

            const bio = cleanBio(texto);

            if (!bio) {
                return errorEmbed(
                    "Sua bio não pode ficar vazia."
                );
            }

            if (lengthOf(bio) > MAX_BIO_LENGTH) {
                return errorEmbed(
                    `Sua bio pode ter no máximo ${MAX_BIO_LENGTH} caracteres (cada emoji conta como 1).`
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

            const fields = [
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
            ];

            // O cartão do /perfil desenha letras, números e os emojis comuns (em cores). Símbolos
            // especiais, outros alfabetos, emojis personalizados da VSync e menções ficam de fora do
            // cartão (a bio guardada continua inteira): o aviso mostra como ela fica lá.
            const onCard = cardText(bio);

            if (onCard !== bio.normalize("NFC").replace(/\s+/g, " ")) {
                fields.push({
                    name: "🖼️ No cartão do perfil",
                    value:
                        "O cartão desenha letras e emojis comuns, mas não símbolos especiais, outros alfabetos, " +
                        "emojis personalizados da VSync nem menções, então esses ficam de fora dele. " +
                        (onCard
                            ? "Ela aparece assim: **" + onCard.replace(/([*_`~|>\\])/g, "\\$1") + "**"
                            : "Como só tem isso, o cartão mostra \"Nenhuma bio definida.\""),
                    inline: false
                });
            }

            return embedResponse(
                createEmbed({
                    title: "✏️ Bio atualizada",

                    description:
                        "Sua descrição pessoal foi salva com sucesso!",

                    color: HELENA_COLORS.success,

                    fields
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

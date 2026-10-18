
import { getPlayer } from "../../database/economy.mjs";

import { prepareDiscard } from "../../services/economy/discard.mjs";

import { buildDiscardConfirm } from "../../services/panels/inventory-view.mjs";

import {
    embedResponse,
    errorEmbed,
    warningEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /DESCARTAR
// ==========================================

// Destrói itens, sem reembolso. Antes de descartar, mostra uma tela
// de confirmação com o botão "Confirmar descarte" (só o dono usa).
// O mesmo fluxo é aberto pelo botão Descartar do /inventario.

export default {
    name: "descartar",
    aliases: ["dropitem"],
    description: "Descarte itens do inventário (sem reembolso)",

    options: [
        {
            name: "item",
            description: "Nome ou ID do item",
            type: "string",
            required: true
        },
        {
            name: "quantidade",
            description: "Número, 'metade' ou 'tudo' (padrão: 1)",
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
            getPlayer(guildId, userId);

            const options = interaction.data?.options ?? {};

            const prepared = prepareDiscard(
                guildId,
                userId,
                options.item,
                options.quantidade
            );

            if (!prepared.ok) {
                return warningEmbed(prepared.title, prepared.message);
            }

            const view = buildDiscardConfirm({
                ownerId: userId,
                prepared
            });

            const response = embedResponse(view.embed);

            response.data.components = view.components;

            return response;

        } catch (error) {
            console.error("[DESCARTAR]", error);

            return errorEmbed(
                "Não foi possível preparar o descarte."
            );
        }
    }
};


import { getPlayer } from "../../database/economy.mjs";

import {
    useItem,
    describeUse
} from "../../services/use-item.mjs";

import {
    buildUseView,
    findUsable
} from "../../services/use-panel.mjs";

import {
    safeText
} from "../../services/user-lookup.mjs";

import {
    parseQuantity
} from "../../services/panel-kit.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /USARITEM
// ==========================================

// Sem argumentos abre o painel de uso (menu com comer, beber e
// equipar). Com item (e quantidade) usa direto. Comida repõe
// energia e gasta uma unidade por uso; energia cheia recusa sem
// gastar; equipar não gasta nada.

export default {
    name: "usaritem",
    aliases: ["useitem", "usar"],
    description: "Use itens: coma, beba ou equipe uma arma",

    options: [
        {
            name: "item",
            description: "Nome ou ID do item (vazio abre o painel)",
            type: "string",
            required: false
        },
        {
            name: "quantidade",
            description: "Número ou 'max' (usa até a energia encher)",
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

            const query = String(options.item ?? "").trim();

            // ==================================
            // PAINEL
            // ==================================

            if (!query) {
                const view = buildUseView({
                    ownerId: userId,
                    guildId,
                    userId
                });

                const response = embedResponse(view.embed);

                response.data.components = view.components;

                return response;
            }

            // ==================================
            // USO DIRETO
            // ==================================

            const matches = findUsable(guildId, userId, query);

            if (matches.length === 0) {
                return warningEmbed(
                    "Item não encontrado",
                    "Você não tem nenhum item usável chamado **" +
                    safeText(query) + "**.\n\nUse `/usaritem` para ver o que dá."
                );
            }

            if (matches.length > 1) {
                return warningEmbed(
                    "Mais de um item encontrado",
                    "Vários itens combinam com **" + safeText(query) +
                    "**:\n\n" +
                    matches.slice(0, 5).map(entry => "• " + entry.item.name).join("\n") +
                    "\n\nSeja mais específico."
                );
            }

            const parsed = parseQuantity(options.quantidade);

            const quantity = parsed.kind === "number"
                ? parsed.value
                : parsed.kind === "all"
                    ? "max"
                    : null;

            if (quantity === null) {
                return warningEmbed(
                    "Quantidade inválida",
                    "Use um número inteiro maior que zero, ou `max`."
                );
            }

            const used = useItem(
                guildId,
                userId,
                matches[0].item.id,
                quantity
            );

            return embedResponse(
                createEmbed({
                    title: "🍽️ Item usado",
                    description: describeUse(used),
                    color: HELENA_COLORS.success,
                    footer: "Helena • Use /usaritem para o painel."
                })
            );

        } catch (error) {
            if (error instanceof GameBlocked) {
                return warningEmbed(error.title, error.message);
            }

            console.error("[USARITEM]", error);

            return errorEmbed(
                "Não foi possível usar o item: " + error.message
            );
        }
    }
};

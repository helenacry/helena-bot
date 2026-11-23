import { OPENABLE_BOXES } from "../../config/boxes.mjs";

import { getItem } from "../../config/items.mjs";

import { openBoxes } from "../../services/economy/boxes.mjs";

import { openedResponse } from "../../services/economy/boxes-view.mjs";

import { parseQuantity } from "../../services/panels/panel-kit.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import {
    errorEmbed,
    warningEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /ABRIR
// ==========================================

// Abre pacotes e caixas do inventário: cada um gasta 1 unidade e entrega o conteúdo (o Pacote de suprimentos sempre
// traz o mesmo; a Caixa misteriosa sorteia). Sem quantidade abre um; "max" abre todos, até 25 de cada vez. Sem dizer
// qual ("caixa"), abre o pacote. O que dá para abrir está em OPENABLE_BOXES (config/boxes.mjs) e a conta toda em
// services/economy/boxes.mjs.

const DEFAULT_BOX = OPENABLE_BOXES[0];

export default {
    name: "abrir",
    description: "Abra pacotes e caixas misteriosas e receba o conteúdo",

    options: [
        {
            name: "quantidade",
            description: "Quantos abrir, ou 'max' para abrir todos (até 25)",
            type: "string",
            required: false
        },
        {
            name: "caixa",
            description: "O que abrir (o pacote, se você não escolher)",
            type: "string",
            required: false,
            choices: OPENABLE_BOXES.map(id => ({ name: getItem(id).name, value: id }))
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
            const parsed = parseQuantity(interaction.data?.options?.quantidade);

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

            const chosen = interaction.data?.options?.caixa ?? DEFAULT_BOX;

            if (!OPENABLE_BOXES.includes(chosen)) {
                return warningEmbed("Isso não abre", "Escolha o pacote ou a caixa misteriosa.");
            }

            return openedResponse(openBoxes(guildId, userId, chosen, quantity));

        } catch (error) {
            if (error instanceof GameBlocked) {
                return warningEmbed(error.title, error.message);
            }

            console.error("[ABRIR]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível abrir o pacote."
            );
        }
    }
};

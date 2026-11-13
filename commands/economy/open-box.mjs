import { OPENABLE_BOXES } from "../../config/boxes.mjs";

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

// Abre pacotes do inventário: cada um gasta 1 unidade e entrega o conteúdo, que é sempre o mesmo (o
// Pacote de suprimentos). Sem quantidade abre um; "max" abre todos, até 25 de cada vez.
// O que dá para abrir está em OPENABLE_BOXES (config/boxes.mjs) e a conta toda em services/economy/boxes.mjs.

const [BOX_ITEM] = OPENABLE_BOXES;

export default {
    name: "abrir",
    description: "Abra pacotes de suprimentos e receba o conteúdo",

    options: [
        {
            name: "quantidade",
            description: "Número de pacotes, ou 'max' para abrir todos (até 25)",
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

            return openedResponse(openBoxes(guildId, userId, BOX_ITEM, quantity));

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

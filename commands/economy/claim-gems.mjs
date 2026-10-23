import { claimGemBonus } from "../../services/economy/gem-bonus.mjs";

import { GEM_BONUS } from "../../config/gems.mjs";

import { duration } from "../../utils/duration-text.mjs";
import { formatDuration } from "../../utils/time.mjs";

import { signed } from "../../utils/receipt.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /COLETARGEMAS
// ==========================================

// O mesmo bônus que o painel do site coleta (services/economy/gem-bonus.mjs): as
// gemas e a recarga são da CONTA, então coletar aqui ou no site é a mesma
// coisa. Coletou em um, o outro já mostra a espera. As regras e os números
// ficam em config/gems.mjs.

const gems = value => value.toLocaleString("pt-BR");

function cooldownResponse(result) {
    return embedResponse(
        ledgerEmbed({
            section: "Gemas",
            title: "⏳ Bônus de gemas em recarga",

            say: "Você já coletou o bônus. Volte em **" + formatDuration(result.remaining) + "**.",

            rows: [["Gemas", gems(result.gems)]],

            color: HELENA_COLORS.wait,
            mood: "dormindo",

            footer: "A espera vale para todos os servidores"
        })
    );
}

function claimedResponse(result) {
    return embedResponse(
        ledgerEmbed({
            section: "Gemas",
            title: "💎 Bônus de gemas coletado",

            say: "Gemas novas na conta. Elas valem em qualquer servidor.",

            rows: [
                ["Bônus", signed(result.amount, result.amount + " gemas")],
                ["Gemas", gems(result.gems)],
                null,
                ["Próxima coleta", "em " + duration(GEM_BONUS.cooldown)]
            ],

            color: HELENA_COLORS.primary,
            mood: "festa",

            footer: "Também dá para coletar pelo painel do site"
        })
    );
}

export default {
    name: "coletargemas",
    aliases: ["bonusgemas"],

    description:
        "Colete seu bônus de gemas (vale em todos os servidores)",

    async execute(interaction) {
        const userId = interaction.user?.id;

        if (!userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const result = claimGemBonus(String(userId));

            return result.status === "cooldown"
                ? cooldownResponse(result)
                : claimedResponse(result);

        } catch (error) {
            console.error("[COLETARGEMAS]", error);

            return errorEmbed(
                "Não foi possível coletar o bônus de gemas."
            );
        }
    }
};

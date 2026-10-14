import { claimGemBonus } from "../../services/gem-bonus.mjs";

import { GEM_BONUS } from "../../config/gems.mjs";

import { duration } from "../../utils/duration-text.mjs";
import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /COLETARGEMAS
// ==========================================

// O mesmo bônus que o painel do site coleta (services/gem-bonus.mjs): as
// gemas e a recarga são da CONTA, então coletar aqui ou no site é a mesma
// coisa. Coletou em um, o outro já mostra a espera. As regras e os números
// ficam em config/gems.mjs.

function cooldownResponse(result) {
    return embedResponse(
        createEmbed({
            title: "⏳ Helena Gems",

            description:
                "Você já coletou o bônus de gemas.",

            color: HELENA_COLORS.warning,

            fields: [
                {
                    name: "💎 Gemas disponíveis",
                    value: "**" + result.gems.toLocaleString("pt-BR") + " 💎**",
                    inline: true
                },
                {
                    name: "⏰ Próxima coleta",
                    value: "**" + formatDuration(result.remaining) + "**",
                    inline: true
                }
            ],

            footer: "Helena Gems • A espera vale para todos os servidores."
        })
    );
}

function claimedResponse(result) {
    return embedResponse(
        createEmbed({
            title: "💎 Helena Gems",

            description:
                "**Bônus coletado!**\n\n" +
                "Você ganhou **+" + result.amount + " 💎**.",

            color: HELENA_COLORS.success,

            fields: [
                {
                    name: "💎 Gemas disponíveis",
                    value: "**" + result.gems.toLocaleString("pt-BR") + " 💎**",
                    inline: true
                },
                {
                    name: "⏰ Próxima coleta",
                    value: "**" + duration(GEM_BONUS.cooldown) + "**",
                    inline: true
                }
            ],

            footer: "Helena Gems • Suas gemas, em qualquer servidor."
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

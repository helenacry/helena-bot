
import {
    getEnergy,
    ENERGY_CONFIG
} from "../../services/energy.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

function formatTime(seconds) {
    const value = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(value / 60);
    const secs = value % 60;

    return minutes + "m " + secs + "s";
}

function progressBar(current, max) {
    const size = 10;

    const ratio = max > 0
        ? Math.max(0, Math.min(1, current / max))
        : 0;

    const filled = Math.round(ratio * size);

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

export default {
    name: "energia",
    description: "Consulte sua energia e regeneração",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const status = getEnergy(guildId, userId);

            const full = status.energy >= status.max;

            const bar = progressBar(
                status.energy,
                status.max
            );

            return embedResponse(
                createEmbed({
                    title: "⚡ Helena Energy",

                    description:
                        "**" + bar + "**\n\n" +
                        "🔋 **" +
                        status.energy +
                        "/" +
                        status.max +
                        " de energia**",

                    color: full
                        ? HELENA_COLORS.success
                        : HELENA_COLORS.progression,

                    fields: [
                        {
                            name: "🔄 Regeneração",
                            value:
                                "+1 ponto a cada " +
                                formatTime(ENERGY_CONFIG.regenSeconds),
                            inline: true
                        },
                        {
                            name: "💼 Custo para trabalhar",
                            value:
                                ENERGY_CONFIG.workCost +
                                " pontos",
                            inline: true
                        },
                        {
                            name: full
                                ? "✅ Energia completa"
                                : "⏳ Próxima regeneração",

                            value: full
                                ? "Sua energia está completamente carregada!"
                                : formatTime(status.nextRegen),

                            inline: false
                        }
                    ],

                    footer:
                        "Helena • Sua energia se recupera com o tempo."
                })
            );

        } catch (error) {
            console.error("[ENERGIA]", error);

            return errorEmbed(
                "Não foi possível consultar sua energia."
            );
        }
    }
};
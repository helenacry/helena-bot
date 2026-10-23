import {
    getEnergy,
    ENERGY_CONFIG
} from "../../services/economy/energy.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { progressBar } from "../../utils/bar.mjs";

import { formatDuration } from "../../utils/time.mjs";

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

            // Quantos expedientes dá para fazer com o que tem.
            const shifts = Math.floor(status.energy / ENERGY_CONFIG.workCost);

            return embedResponse(
                ledgerEmbed({
                    section: "Energia",
                    title: full ? "⚡ Energia cheia" : "⚡ Sua energia",

                    say: `${bar}  **${status.energy}/${status.max}**`,

                    rows: [
                        ["Trabalhar custa", ENERGY_CONFIG.workCost + " de energia"],
                        ["Dá para trabalhar", shifts + (shifts === 1 ? " vez" : " vezes")],
                        null,
                        ["Regeneração", "+1 a cada " + formatDuration(ENERGY_CONFIG.regenSeconds)],
                        ["Próximo ponto", full ? "—" : formatDuration(status.nextRegen)]
                    ],

                    color: full ? HELENA_COLORS.success : HELENA_COLORS.wait,
                    mood: full ? "feliz" : "dormindo",

                    footer: full
                        ? "Hora de usar: /trabalhar ou /crime"
                        : "A energia volta sozinha com o tempo"
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

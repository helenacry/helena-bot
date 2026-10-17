
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    COOLDOWNS,
    getRemaining,
    formatCooldown
} from "../../config/cooldowns.mjs";

import {
    CRIME_CONFIG,
    ROBBERY_CONFIG
} from "../../config/crime.mjs";

import { ensureCrimePlayer } from "../../services/crime/crime-player.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "cooldowns",
    aliases: ["cd"],
    description: "Consulte o tempo restante das suas atividades",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const player = getPlayer(guildId, userId);

            const now = Math.floor(Date.now() / 1000);

            const fields = [];

            let available = 0;
            let waiting = 0;

            // Crime e lavagem guardam o tempo na própria tabela,
            // então entram aqui já com o tempo restante.
            const crime = ensureCrimePlayer(guildId, userId);

            const activities = [
                ...Object.values(COOLDOWNS).map(activity => ({
                    ...activity,
                    remaining: getRemaining(
                        player[activity.column],
                        activity.duration,
                        now
                    )
                })),

                {
                    name: "Crime",
                    command: "/crime",
                    emoji: "🕵️",
                    remaining: getRemaining(
                        crime.last_crime,
                        CRIME_CONFIG.cooldown,
                        now
                    )
                },

                {
                    name: "Roubo",
                    command: "/roubar",
                    emoji: "🔫",
                    remaining: getRemaining(
                        crime.last_rob,
                        ROBBERY_CONFIG.cooldown,
                        now
                    )
                },

                {
                    name: "Lavagem",
                    command: "/lavagem",
                    emoji: "🧼",
                    remaining: Math.max(
                        0,
                        crime.launder_ready_at - now
                    )
                }
            ];

            for (const activity of activities) {
                const remaining = activity.remaining;

                if (remaining === 0) {
                    available++;

                    fields.push({
                        name:
                            activity.emoji +
                            " " +
                            activity.name,

                        value:
                            "🟢 **Disponível**\n" +
                            "Comando: `" +
                            activity.command +
                            "`",

                        inline: true
                    });

                } else {
                    waiting++;

                    fields.push({
                        name:
                            activity.emoji +
                            " " +
                            activity.name,

                        value:
                            "⏳ **" +
                            formatCooldown(remaining) +
                            "** restantes\n" +
                            "Comando: `" +
                            activity.command +
                            "`",

                        inline: true
                    });
                }
            }

            fields.push({
                name: "📊 Resumo",
                value:
                    "🟢 **Disponíveis:** " + available + "\n" +
                    "⏳ **Em espera:** " + waiting,
                inline: false
            });

            return embedResponse(
                createEmbed({
                    title: "⏰ Helena Cooldowns",

                    description:
                        waiting === 0
                            ? "✨ Todas as suas atividades estão disponíveis!"
                            : "Acompanhe quando poderá realizar suas próximas atividades.",

                    color:
                        waiting === 0
                            ? HELENA_COLORS.success
                            : HELENA_COLORS.primary,

                    fields,

                    footer:
                        "Helena • Organize suas atividades."
                })
            );

        } catch (error) {
            console.error("[COOLDOWNS]", error);

            return errorEmbed(
                "Não foi possível consultar seus cooldowns."
            );
        }
    }
};
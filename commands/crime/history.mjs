
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { history, status, now } from "../../services/combat/combat.mjs";

import { mention } from "../../services/platform/mentions.mjs";

import { ago } from "../../services/combat/combat-view.mjs";

// ==========================================
// COMANDO /HISTORICO
// ==========================================

// Os 5 últimos duelos em que você lutou, do seu lado: quem você venceu e para
// quem perdeu. Empates não entram no histórico.

export default {
    name: "historico",
    description: "Mostra os seus últimos duelos",
    options: [],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            const rows = history(guildId, userId);

            const state = status(guildId, userId);

            const timestamp = now();

            const lines = rows.map(row => {
                const won = row.winner_id === userId;

                const when = ago(timestamp - row.created_at);

                return won
                    ? `🏆 Você venceu ${mention(row.loser_id)} • seu golpe: ${row.damage} • ${when}`
                    : `💀 Você perdeu para ${mention(row.winner_id)} • golpe dele: ${row.damage} • ${when}`;
            });

            const embed = createEmbed({
                section: "Combate",
                title: "📜 Histórico de duelos",

                description: [
                    `🏆 **${state.wins}** vitórias · 💀 **${state.losses}** derrotas`,
                    "",
                    lines.length > 0
                        ? lines.join("\n")
                        : "Nenhum duelo registrado ainda. Desafie alguém com `/atacar`."
                ].join("\n"),

                color: HELENA_COLORS.primary,
                mood: "bravo",

                footer: "Os 5 últimos duelos (empates não entram)"
            });

            return embedResponse(embed);

        } catch (error) {
            console.error("[HISTORICO]", error);

            return errorEmbed(
                "Não foi possível consultar o seu histórico."
            );
        }
    }
};

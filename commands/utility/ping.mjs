
import {
    createEmbed,
    embedResponse,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { guildIds } from "../../services/guild-registry.mjs";

import { getCatalog } from "../../services/command-catalog.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// COMANDO /PING
// ==========================================

// Responder já é a prova de que o bot está no ar. Mostra também há quanto
// tempo ele está ligado, em quantos servidores está e quantos comandos tem.

export default {
    name: "ping",
    description: "Verifica se o bot está funcionando",

    async execute() {
        const fields = [
            {
                name: "⏱️ No ar há",
                value: formatDuration(process.uptime()),
                inline: true
            }
        ];

        if (guildIds.size > 0) {
            fields.push({
                name: "🌐 Servidores",
                value: String(guildIds.size),
                inline: true
            });
        }

        const catalog = getCatalog();

        if (catalog) {
            fields.push({
                name: "📖 Comandos",
                value: String(catalog.total),
                inline: true
            });
        }

        return embedResponse(createEmbed({
            title: "🏓 Pong!",

            description: "Estou funcionando.",

            color: HELENA_COLORS.success,

            fields,

            footer: "Helena • Use /ajuda para ver o que eu faço"
        }));
    }
};

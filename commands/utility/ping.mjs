
import {
    embedResponse,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { guildIds } from "../../services/platform/guild-registry.mjs";

import { getCatalog } from "../../services/platform/command-catalog.mjs";

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
        const rows = [["No ar há", formatDuration(process.uptime())]];

        if (guildIds.size > 0) {
            rows.push(["Servidores", String(guildIds.size)]);
        }

        const catalog = getCatalog();

        if (catalog) {
            rows.push(["Comandos", String(catalog.total)]);
        }

        return embedResponse(ledgerEmbed({
            section: "Status",
            title: "🏓 Pong!",

            say: "Estou aqui e funcionando.",

            rows,

            color: HELENA_COLORS.success,
            mood: "feliz",

            footer: "/ajuda mostra o que eu faço"
        }));
    }
};

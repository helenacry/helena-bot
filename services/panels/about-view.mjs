import { db } from "../../database/connection.mjs";

import { readBuildInfo } from "../web/build-info.mjs";

import { getRuntimeStats } from "../platform/runtime-stats.mjs";

import { suggestions } from "../platform/suggestions.mjs";

import { LATEST_UPDATE } from "../../config/about.mjs";

import {
    REPO_URL,
    SITE_URL,
    SUPPORT_URL,
    WIKI_URL
} from "../../config/site.mjs";

import { button, row } from "./panel-kit.mjs";

import {
    container,
    divider,
    headerBlock,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { receipt } from "../../utils/receipt.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// A TELA DO /SOBRE
// ==========================================

// Versão, números de agora, a novidade mais recente e os links. O botão "Sugestão" (sobre:sugestao) só aparece
// quando o canal das sugestões está configurado (services/platform/suggestions.mjs); o clique abre um formulário
// (services/panels/about-panel.mjs).

export const UPDATE_URL = `${WIKI_URL}updates/${LATEST_UPDATE.slug}/`;

// O commit do código que está rodando (curto), ou "local" fora do zip do Discloud.
export function versionLabel() {
    const { commit } = readBuildInfo();

    return commit ? commit.slice(0, 7) : "local";
}

function players() {
    try {
        return db.prepare("SELECT COUNT(*) AS total FROM global_users").get().total;

    } catch {
        return null;
    }
}

const link = (label, emoji, url) => ({ type: "button", style: "link", label, emoji, url });

export function buildAbout({ now = Date.now() } = {}) {
    const stats = getRuntimeStats();

    const up = Math.max(0, Math.floor((now - stats.startedAt) / 1000));

    const count = players();

    const rows = [
        ["Versão", versionLabel()],
        ["No ar há", formatDuration(up)],
        ["Servidores", stats.servers === null ? "—" : String(stats.servers)],
        ["Jogadores", count === null ? "—" : String(count)]
    ];

    const news = `Atualização ${LATEST_UPDATE.version}: ${LATEST_UPDATE.title}`;

    const links = [
        link("Suporte", "💌", SUPPORT_URL),
        link("Site", "🌐", SITE_URL),
        link("Wiki", "📖", WIKI_URL),
        link("Código", "💻", REPO_URL)
    ];

    const buttons = suggestions.available()
        ? [...links, button("sobre:sugestao", "Sugestão", "💡", "primary")]
        : links;

    const embed = ledgerEmbed({
        section: "Sobre",
        title: "🌸 Sobre a Helena",

        say: "Bot de economia e RPG: trabalhe, lave dinheiro, case e fuja da cadeia.",

        rows,

        note: `Novidade: [${news}](${UPDATE_URL})`,

        color: HELENA_COLORS.primary,
        mood: "feliz",

        footer: "Código aberto no GitHub"
    });

    const layout = [
        container([
            ...headerBlock(["-# HELENA · SOBRE", "## 🌸 Sobre a Helena", "Bot de economia e RPG: trabalhe, lave dinheiro, case e fuja da cadeia."]),
            divider(),
            text(receipt(rows)),
            divider(),
            text(`📰 Novidade: [${news}](${UPDATE_URL})`),
            row(...buttons)
        ], { color: HELENA_COLORS.primary }),

        subtext("Código aberto no GitHub")
    ];

    return { embed, components: [row(...buttons)], layout };
}

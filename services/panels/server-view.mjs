import { getGuildSettings } from "../platform/guild-settings.mjs";

import { DROP_CONFIG } from "../../config/drops.mjs";

import { button, row } from "./panel-kit.mjs";

import {
    container,
    divider,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// A TELA DO /SERVIDOR
// ==========================================

// Os ajustes do servidor: hoje, os drops (ligados ou não, e em que canal). Os botões (srv:...) valem só para quem
// gerencia o servidor (services/panels/server-panel.mjs):
//
//   srv:drops:on|off       liga ou desliga os drops
//   srv:canal:aqui|todos   os drops só neste canal, ou em qualquer canal com conversa

const hours = Math.round(DROP_CONFIG.minIntervalMs / 3_600_000);

export function buildServer({ guildId, notice = null }) {
    const settings = getGuildSettings(guildId);

    const channel = settings.dropsChannelId ? `<#${settings.dropsChannelId}>` : "qualquer canal com conversa";

    const rows = [
        ["Drops", settings.dropsEnabled ? "ligados" : "desligados"],
        ["Canal dos drops", channel]
    ];

    const how =
        `Com os drops ligados, a Helena às vezes solta um presente no chat quando há conversa (pelo menos ${DROP_CONFIG.minMessages} ` +
        `mensagens de ${DROP_CONFIG.minPeople} pessoas em ${formatDuration(DROP_CONFIG.chatWindowMs / 1000)}). Quem aperta primeiro leva. ` +
        `No máximo um a cada ${hours} horas e ${DROP_CONFIG.dailyCap} por pessoa por dia.`;

    const privacy = "A Helena só conta quantas mensagens e de quantas pessoas, na memória e por poucos minutos. Ela não guarda o texto de nada.";

    const toggle = settings.dropsEnabled
        ? button("srv:drops:off", "Desligar drops", "🔕", "danger")
        : button("srv:drops:on", "Ligar drops", "🔔", "success");

    const buttons = [
        toggle,
        button("srv:canal:aqui", "Usar este canal", "📍", "secondary"),
        button("srv:canal:todos", "Qualquer canal", "🌐", "secondary", { disabled: !settings.dropsChannelId })
    ];

    const color = settings.dropsEnabled ? HELENA_COLORS.success : HELENA_COLORS.primary;

    const embed = ledgerEmbed({
        section: "Servidor",
        title: "⚙️ Ajustes do servidor",

        say: (notice ? notice + "\n" : "") + how,

        rows,

        note: privacy,

        color,
        mood: settings.dropsEnabled ? "festa" : "feliz",

        footer: "Só quem gerencia o servidor muda isto"
    });

    const layout = [
        container([
            text("-# HELENA · SERVIDOR"),
            text("## ⚙️ Ajustes do servidor"),
            ...(notice ? [text(notice)] : []),
            text(how),
            divider(),
            text(`**Drops:** ${settings.dropsEnabled ? "ligados" : "desligados"}\n**Canal dos drops:** ${channel}`),
            divider(),
            text(privacy),
            row(...buttons)
        ], { color }),

        subtext("Só quem gerencia o servidor muda isto")
    ];

    return { embed, components: [row(...buttons)], layout };
}

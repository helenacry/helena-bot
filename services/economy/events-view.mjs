import { WEEKDAY_NAMES } from "../../config/events.mjs";

import {
    activeEvents,
    eventsEnabled,
    upcomingEvents
} from "./events.mjs";

import {
    container,
    divider,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    createEmbed,
    embedResponse,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// A TELA DO /EVENTO
// ==========================================

// Os eventos que estão valendo agora (com a hora em que acabam, no relógio do Discord) e a semana inteira, dia a dia.
// Os eventos ligam sozinhos pelo dia da semana, no horário de Brasília (config/events.mjs).

export function buildEvents({ now = Date.now() } = {}) {
    if (!eventsEnabled()) {
        const embed = createEmbed({
            section: "Eventos",
            title: "🎉 Eventos desligados",
            description: "Os eventos da semana estão desligados agora.",
            color: HELENA_COLORS.wait,
            mood: "dormindo",
            footer: "Eles voltam quando forem ligados"
        });

        return {
            embed,

            layout: [container([
                text("-# HELENA · EVENTOS"),
                text("## 🎉 Eventos desligados"),
                text("Os eventos da semana estão desligados agora.")
            ], { color: HELENA_COLORS.wait })]
        };
    }

    const active = activeEvents(now);

    // ----- agora -----

    const activeLines = active.map(({ event, endsAt }) =>
        `${event.emoji} **${event.name}** · acaba <t:${endsAt}:R>\n-# ${event.description}`
    );

    const nowText = active.length > 0
        ? activeLines.join("\n")
        : "Nenhum evento ativo agora. Veja a semana abaixo.";

    // ----- a semana: um dia por linha -----

    const byDay = new Map();

    for (const { event, startsAt, weekday, today } of upcomingEvents(now, 7)) {
        const day = byDay.get(weekday) ?? { startsAt, today, names: [] };

        day.names.push(`${event.emoji} ${event.name}`);

        byDay.set(weekday, day);
    }

    // "·" separa os pedaços (cada um é traduzido por si): o dia, "hoje" e os eventos
    const weekLines = [...byDay.entries()].map(([weekday, day]) =>
        `**${WEEKDAY_NAMES[weekday]}**${day.today ? " · 📍 hoje" : ""} · ${day.names.join(", ")}`
    );

    const weekText = weekLines.length > 0
        ? weekLines.join("\n")
        : "Sem eventos nesta semana.";

    const color = active.length > 0 ? HELENA_COLORS.success : HELENA_COLORS.primary;

    const embed = createEmbed({
        section: "Eventos",
        title: "🎉 Eventos da semana",

        description: "Os eventos ligam sozinhos, pelo dia da semana (horário de Brasília).",

        color,
        mood: active.length > 0 ? "festa" : "feliz",

        fields: [
            { name: "🔥 Agora", value: nowText, inline: false },
            { name: "📅 Esta semana", value: weekText, inline: false }
        ],

        footer: "Os bônus valem sozinhos, sem precisar ligar nada"
    });

    const layout = [
        container([
            text("-# HELENA · EVENTOS"),
            text("## 🎉 Eventos da semana"),
            text("Os eventos ligam sozinhos, pelo dia da semana (horário de Brasília)."),
            divider(),
            text(`### 🔥 Agora\n${nowText}`),
            divider(),
            text(`### 📅 Esta semana\n${weekText}`)
        ], { color }),

        subtext("Os bônus valem sozinhos, sem precisar ligar nada")
    ];

    return { embed, layout };
}

export function eventsResponse(view) {
    const response = embedResponse(view.embed);

    response.data.layout = view.layout;

    return response;
}

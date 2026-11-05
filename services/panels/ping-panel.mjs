
import { guildIds } from "../platform/guild-registry.mjs";

import {
    PING_LIMITS,
    databaseLatency,
    diagnose,
    gatewayLatency,
    loopLag,
    probeApi,
    snowflakeAge
} from "../platform/discord-health.mjs";

import { STATUS_URL, discordStatus } from "../platform/discord-status.mjs";

import { button, row, update } from "./panel-kit.mjs";

import {
    HELENA_COLORS,
    embedResponse,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// PAINEL DO /PING
// ==========================================

// Mede a conexão com o Discord, a API deles, a chegada do comando, o banco e a fila de tarefas
// da Helena, lê o status público do Discord e diz de quem é a lentidão: da Helena, do Discord,
// dos dois ou de ninguém. O botão Atualizar mede de novo.
//
//   ping:ref   atualiza as medidas (qualquer pessoa pode: é só um painel de status)

const number = value => String(value).replace(".", ",");

// "123 ms", "123 ms (lento)", "sem medida" ou "falhou"
function reading(value, limit) {
    if (value === null) {
        return "sem medida";
    }

    if (value === -1) {
        return "falhou";
    }

    return `${number(value)} ms${value > limit ? " (lento)" : ""}`;
}

function statusLine(status) {
    if (!status) {
        return "sem informação";
    }

    if (status.indicator === "none") {
        return "Tudo operacional";
    }

    return status.incidents[0]?.name || status.description || "Há um incidente";
}

const SAYS = {
    none: "Está tudo normal: nem a Helena nem o Discord estão lentos agora.",
    helena: "A lentidão está do meu lado, no que eu mesma faço (veja a linha marcada como lenta).",
    discord: "A lentidão vem do **Discord**, não da Helena: a conexão ou a API deles está devagar.",
    both: "Os dois estão lentos: a Helena e o Discord."
};

const LOOK = {
    none: { color: HELENA_COLORS.success, mood: "feliz" },
    helena: { color: HELENA_COLORS.warning, mood: "alerta" },
    discord: { color: HELENA_COLORS.wait, mood: "dormindo" },
    both: { color: HELENA_COLORS.error, mood: "triste" }
};

// interaction: o comando ou o clique (o ID dele, um snowflake, diz há quanto tempo o Discord o criou).
export async function buildPingView(interaction, { force = false } = {}) {
    const [status, api, loop] = await Promise.all([
        discordStatus({ force }),
        probeApi({ force }),
        loopLag()
    ]);

    const measures = {
        gateway: gatewayLatency(),
        api,
        trip: snowflakeAge(interaction?.id),
        database: databaseLatency(),
        loop
    };

    const verdict = diagnose(measures, status);

    const rows = [
        ["Conexão com o Discord", reading(measures.gateway, PING_LIMITS.gateway)],
        ["API do Discord", reading(measures.api, PING_LIMITS.api)],
        ["Chegada do comando", reading(measures.trip, PING_LIMITS.trip)],
        ["Banco de dados", reading(measures.database, PING_LIMITS.database)],
        ["Fila de tarefas", reading(measures.loop, PING_LIMITS.loop)],
        null,
        ["Status do Discord", statusLine(status)],
        ["No ar há", formatDuration(Math.floor(process.uptime()))]
    ];

    if (guildIds.size > 0) {
        rows.push(["Servidores", String(guildIds.size)]);
    }

    const incident = status && status.indicator !== "none" ? status.incidents[0] : null;

    const embed = ledgerEmbed({
        section: "Status",
        title: "🏓 Pong!",

        say: SAYS[verdict.source] + (incident && verdict.source !== "none" ? `\n> ⚠️ ${incident.name}` : ""),

        rows,

        ...LOOK[verdict.source],

        footer: "Atualizar mede de novo · /ajuda mostra o que eu faço"
    });

    const components = [row(
        button("ping:ref", "Atualizar", "🔄"),
        { type: "button", style: "link", label: "Status do Discord", emoji: "🌐", url: STATUS_URL }
    )];

    return { embed, components, verdict, measures };
}

export async function pingResponse(interaction) {
    const view = await buildPingView(interaction);

    const response = embedResponse(view.embed);

    response.data.components = view.components;

    return response;
}

// customId: ping:ref
export async function handlePingClick(interaction) {
    const [, action] = String(interaction.data?.customId || "").split(":");

    if (action === "ref") {
        return update(await buildPingView(interaction, { force: true }));
    }

    return null;
}

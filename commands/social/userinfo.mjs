
import {
    getUserBadges,
    getPrismaInfo
} from "../../services/userinfo-badges.mjs";

import {
    incrementUserinfoViews
} from "../../services/userinfo-views.mjs";

import {
    resolveUser,
    lookupProblem
} from "../../services/user-lookup.mjs";

import { warningEmbed } from "../../utils/embed.mjs";

const COLOR = "#8755DA";
const MAX_FIELD = 1024;
const UNKNOWN = "Não informado pela API";
const PULSE_MONTH = 30 * 24 * 60 * 60 * 1000;

const PULSE_EMOJIS = {
    1: "<:pulse_1:235402034624745472>",
    2: "<:pulse_2:235402010050318336>",
    3: "<:pulse_3:235401992409075712>",
    6: "<:pulse_6:235401974772027392>",
    9: "<:pulse_9:235401952500273152>",
    12: "<:pulse_12:235401933147754496>",
    15: "<:pulse_15:235401908225200128>",
    18: "<:pulse_18:235401879607463936>",
    24: "<:pulse_24:235401848926130176>"
};

// ==========================================
// UTILITÁRIOS
// ==========================================

function safe(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/([*_`~|>])/g, "\\$1")
        .replace(/@/g, "@\u200b")
        .replace(/\r?\n/g, " ");
}

function errorResponse(message) {
    return {
        type: "message",
        data: {
            body: "❌ " + message,
            ephemeral: true
        }
    };
}

// De quem são as informações? Sem argumento, de quem usou o comando.
// Com texto, procura a pessoa no servidor só pelo @usuário (que é
// único) ou por menção/ID: apelidos e nomes de exibição das
// plataformas não entram na busca, como no /perfil.
//
// Devolve { user, self } ou { response } com o aviso a mostrar.
async function findTarget(interaction) {
    const query = String(
        interaction.data?.options?.usuario ?? ""
    ).trim();

    if (!query) {
        return { user: interaction.user, self: true };
    }

    if (!interaction.guildId) {
        return {
            response: warningEmbed(
                "Indisponível",
                "Procurar outra pessoa só funciona em um servidor."
            )
        };
    }

    const found = await resolveUser(
        interaction.guildId,
        query,
        { by: "username" }
    );

    const problem = lookupProblem(
        found,
        query,
        { by: "username" }
    );

    if (problem) {
        return {
            response: warningEmbed(problem.title, problem.message)
        };
    }

    // Se a busca achou você mesmo, segue como as suas informações.
    if (found.user.id === String(interaction.user?.id)) {
        return { user: interaction.user, self: true };
    }

    // A busca já trouxe o membro completo (insígnias, Pulse,
    // Prisma+, datas), sem precisar de outra chamada à API.
    return {
        user: { ...found.user, ...found.user.raw },
        self: false
    };
}

function first(object, keys) {
    for (const key of keys) {
        const value = object?.[key];

        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            return value;
        }
    }

    return null;
}

function dateFrom(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (
        typeof value === "number" ||
        /^\d+$/.test(String(value))
    ) {
        const number = Number(value);

        if (!Number.isFinite(number) || number <= 0) {
            return null;
        }

        // A VSync retorna timestamps em milissegundos.
        const date = new Date(number);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

function dateField(value) {
    const date = dateFrom(value);

    if (!date) {
        return UNKNOWN;
    }

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
    }).format(date);
}

// Duração dos níveis Pulse: cada mês equivale a 30 dias.
function formatPulseDuration(milliseconds) {
    if (!Number.isFinite(milliseconds)) return UNKNOWN;

    const totalHours = Math.floor(Math.max(0, milliseconds) / 3_600_000);
    const months = Math.floor(totalHours / (30 * 24));
    const days = Math.floor((totalHours % (30 * 24)) / 24);
    const hours = totalHours % 24;
    const parts = [];

    if (months) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
    if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
    if (hours || !parts.length) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);

    return parts.join(" ");
}

function add(fields, name, value, inline = false) {
    fields.push({
        name,
        value: String(value ?? UNKNOWN).slice(0, MAX_FIELD),
        inline
    });
}

// ==========================================
// COMANDO /USERINFO
// ==========================================

export default {
    name: "userinfo",
    aliases: ["ui"],
    description: "Veja as informações e insígnias de um usuário do VSync",
    options: [
        {
            name: "usuario",
            description:
                "@usuário ou @menção de quem você quer ver (vazio = você)",
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        try {
            // ==================================
            // IDENTIFICAÇÃO
            // ==================================
            const target = await findTarget(interaction);

            if (target.response) {
                return target.response;
            }

            const { user, self } = target;

            if (!user?.id) {
                return errorResponse(
                    "Não consegui identificar o usuário selecionado."
                );
            }

            const name = safe(
                user.displayName ||
                user.username ||
                "Usuário"
            );

            const username = safe(
                user.username || "desconhecido"
            );

            const prisma = getPrismaInfo(user);
            const badges = getUserBadges(user);

            // ==================================
            // DATAS DA CONTA
            // ==================================
            const createdAt = dateField(user.createdAt);

            const joinedAt = dateField(
                String(user.id) === String(interaction.user?.id)
                    ? interaction.member?.joinedAt ?? user.joinedAt
                    : user.joinedAt
            );

            // ==================================
            // PRISMA+
            // ==================================
            const prismaSince = user.prismaActive
                ? dateField(user.prismaSince)
                : "Não é assinante Prisma+.";

            // ==================================
            // PULSER
            // ==================================
            const pulserSince = user.pulsing
                ? dateField(user.pulsingSince)
                : "Não possui Pulse ativo.";

            const pulseStart = Number(user.pulsingSince);
            const currentLevel = Number(user.pulseBadge?.months);
            const currentLevelAt = pulseStart + currentLevel * PULSE_MONTH;

            const currentPulseBadge =
                user.pulsing &&
                    user.pulseBadge &&
                    Number.isFinite(pulseStart) && pulseStart > 0 &&
                    Number.isFinite(currentLevel) && currentLevel >= 0
                    ? formatPulseDuration(Date.now() - currentLevelAt)
                    : null;

            const nextAt = Number(user.nextPulseBadge?.at);
            const nextPulseBadge =
                user.pulsing &&
                    user.nextPulseBadge &&
                    Number.isFinite(nextAt) && nextAt > 0
                    ? "em " + formatPulseDuration(nextAt - Date.now())
                    : null;

            // ==================================
            // CONTADOR DE VISUALIZAÇÕES
            // ==================================
            let views = null;

            try {
                views = await incrementUserinfoViews(user.id);
            } catch (viewsError) {
                console.warn(
                    "[USERINFO] Contador indisponível:",
                    viewsError
                );
            }

            // ==================================
            // RODAPÉ
            // ==================================
            const actor = safe(
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Usuário"
            );

            const horario = new Intl.DateTimeFormat(
                "pt-BR",
                {
                    timeZone: "America/Sao_Paulo",
                    dateStyle: "short",
                    timeStyle: "short"
                }
            ).format(new Date());

            const footer =
                "Comando executado por: " +
                actor +
                (
                    views === null
                        ? ""
                        : " | Visualizações: " + views
                ) +
                " • " +
                horario;

            const fields = [];

            add(fields, "👤 Menção", "<@" + user.id + ">");

            const badgeText = badges
                .map(badge => badge.emoji)
                .filter(Boolean)
                .join(" ");

            add(fields, "🏷️ Tag", username, true);
            add(fields, "🪪 ID", String(user.id), true);
            add(fields, "🏅 Insígnias", badgeText || "Nenhuma", true);

            add(fields, "📅 Conta criada em", createdAt);

            add(fields, "📅 Entrou no servidor em", joinedAt);

            add(
                fields,
                "💎 Assinante Prisma+ desde",
                prismaSince,
                true
            );

            add(
                fields,
                "✨ Pulser desde",
                "**" + pulserSince + "**",
                true
            );

            fields.push({
                name: "\u200b",
                value: "\u200b",
                inline: false
            });

            add(
                fields,
                "🏅 Insígnia de Pulser atual",
                (PULSE_EMOJIS[user.pulseBadge?.months] ?? "") +
                " │ **" + (currentPulseBadge ?? UNKNOWN) + "**",
                true
            );

            add(
                fields,
                "⏭️ Próxima insígnia de Pulser",
                (PULSE_EMOJIS[user.nextPulseBadge?.months] ?? "") +
                " │ **" + (nextPulseBadge ?? UNKNOWN) + "**",
                true
            );

            // ==================================
            // EMBED FINAL
            // ==================================
            const embed = {
                author: {
                    name: name + " (" + username + ")",
                    ...(user.avatarUrl
                        ? { iconUrl: user.avatarUrl }
                        : {})
                },
                color: COLOR,
                // Mantém o avatar maior à direita, se desejar.
                thumbnail: user.avatarUrl
                    ? { url: user.avatarUrl }
                    : undefined,
                fields,
                footer: { text: footer }
            };

            // ==================================
            // RESPOSTA
            // ==================================
            return {
                type: "message",
                data: {
                    // A mensagem menciona o dono das informações: você,
                    // nas suas, ou a pessoa pesquisada, nas de outra.
                    body: self
                        ? "<@" + user.id + ">"
                        : "Informações de <@" + user.id + ">",
                    embeds: [embed]
                }
            };
        } catch (error) {
            console.error("[USERINFO]", error);
            return errorResponse(
                "Não foi possível carregar as informações deste usuário."
            );
        }
    }
};
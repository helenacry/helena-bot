
import { getUserBadges } from "./userinfo-badges.mjs";

import {
    PULSE_EMOJIS,
    PULSE_LEVELS,
    PULSE_MONTH,
    UNKNOWN,
    dateField,
    dateWithAge,
    formatAge,
    formatPulseDuration,
    plain,
    pulseStartOf,
    safe
} from "./userinfo-format.mjs";

// ==========================================
// TELAS DO /USERINFO
// ==========================================

// O cartão do /userinfo (um embed, no estilo do Zany) e os detalhes do menu "Mais
// informações". A doc da VSync: author, footer e o nome dos campos são texto simples;
// description e o valor dos campos aceitam markdown, bloco de código e menção (que no embed
// é só visual, não notifica).

export const USERINFO_COLOR = "#8755DA";

const MAX_FIELD = 1024;

const MAX_PULSE_LEVEL = PULSE_LEVELS.at(-1);

function add(fields, name, value, inline = false) {
    fields.push({
        name,
        value: String(value ?? UNKNOWN).slice(0, MAX_FIELD),
        inline
    });
}

// Bloco de código de uma linha (a caixa do Tag e do ID). A primeira linha depois das três
// crases seria lida como linguagem, por isso o texto vem na linha de baixo.
const block = text => "```\n" + text + "\n```";

// ==========================================
// CARTÃO
// ==========================================

// actor: quem usou o comando (nome e avatar vão no rodapé). views: o contador (ou null).
export function buildUserinfoEmbed({ user, actorName, actorAvatar, views = null, now = Date.now(), time }) {
    const name = plain(user.displayName || user.username || "Usuário", 120);

    const username = plain(user.username || "desconhecido", 120);

    const badgeText = getUserBadges(user)
        .map(badge => badge.emoji)
        .filter(Boolean)
        .join(" ");

    const fields = [];

    add(fields, "🏷️ Tag", block(username), true);
    add(fields, "🪪 ID", block(String(user.id)), true);
    add(fields, "🏅 Insígnias", badgeText || "Nenhuma", true);

    add(fields, "📅 Conta criada em", dateWithAge(user.createdAt, now));
    add(fields, "📥 Entrou no servidor em", dateWithAge(user.joinedAt, now));

    // O Prisma+ e o Pulse só entram no cartão para quem tem: sem eles, os campos ficam de
    // fora em vez de mostrar "não é assinante" e "não informado".
    if (user.prismaActive) {
        add(fields, "💎 Assinante Prisma+ desde", dateWithAge(user.prismaSince, now));
    }

    if (user.pulsing) {
        add(fields, "✨ Pulser desde", dateWithAge(pulseStartOf(user), now));

        const start = Number(user.pulsingSince);
        const currentLevel = Number(user.pulseBadge?.months);
        const currentLevelAt = start + currentLevel * PULSE_MONTH;

        const currentEmoji = PULSE_EMOJIS[user.pulseBadge?.months] ?? "";

        const current =
            user.pulseBadge &&
                Number.isFinite(start) && start > 0 &&
                Number.isFinite(currentLevel) && currentLevel >= 0
                ? formatPulseDuration(now - currentLevelAt)
                : null;

        const nextAt = Number(user.nextPulseBadge?.at);

        const next =
            user.nextPulseBadge &&
                Number.isFinite(nextAt) && nextAt > 0
                ? "em " + formatPulseDuration(nextAt - now)
                : null;

        add(
            fields,
            "🏅 Insígnia de Pulser atual",
            currentEmoji + " │ **" + (current ?? UNKNOWN) + "**",
            true
        );

        // Sem próximo selo, a pessoa já está no último nível.
        const atMax = !user.nextPulseBadge && Number(user.pulseBadge?.months) >= MAX_PULSE_LEVEL;

        add(
            fields,
            "⏭️ Próxima insígnia de Pulser",
            atMax
                ? currentEmoji + " │ **Nível máximo alcançado.**"
                : (PULSE_EMOJIS[user.nextPulseBadge?.months] ?? "") + " │ **" + (next ?? UNKNOWN) + "**",
            true
        );
    }

    const footer =
        "Comando executado por: " +
        plain(actorName || "Usuário", 80) +
        (views === null ? "" : " | Visualizações: " + views) +
        (time ? " • " + time : "");

    return {
        author: {
            name: name === username ? username : username + " (" + name + ")",
            ...(user.avatarUrl ? { iconUrl: user.avatarUrl } : {})
        },

        color: USERINFO_COLOR,

        thumbnail: user.avatarUrl
            ? { url: user.avatarUrl }
            : undefined,

        // A menção no embed é só um chip; quem avisa a pessoa é o body da mensagem.
        description: "👤 **Menção:** <@" + user.id + ">",

        fields,

        footer: {
            text: footer,
            ...(actorAvatar ? { iconUrl: actorAvatar } : {})
        }
    };
}

// ==========================================
// DETALHES ("Mais informações")
// ==========================================

// As opções do menu para esta pessoa (só o que dá para mostrar com os dados da API).
export function detailOptions(user) {
    return [
        ...(user.avatarUrl
            ? [{ label: "Avatar", value: "avatar", description: "A foto de perfil em tamanho grande", emoji: "🖼️" }]
            : []),

        { label: "Insígnias", value: "badges", description: "O nome de cada insígnia visível", emoji: "🏅" },
        { label: "Datas e idades", value: "dates", description: "Conta, servidor, Prisma+ e Pulse", emoji: "📅" },

        ...(user.pulsing
            ? [{ label: "Evolução do Pulse", value: "pulse", description: "Cada nível e quando chega", emoji: "✨" }]
            : [])
    ];
}

// O embed de um detalhe, ou null se a opção não existe (ou não vale para esta pessoa).
export function buildUserinfoDetail(kind, user, now = Date.now()) {
    const name = plain(user.displayName || user.username || "Usuário", 80);

    switch (kind) {
        case "avatar": {
            if (!user.avatarUrl) return null;

            return {
                title: "🖼️ Avatar de " + name,
                description: "[Abrir em tamanho original](" + user.avatarUrl + ")",
                color: USERINFO_COLOR,
                image: { url: user.avatarUrl }
            };
        }

        case "badges": {
            const badges = getUserBadges(user);

            return {
                title: "🏅 Insígnias de " + name,

                description: badges.length
                    ? badges.map(badge => [badge.emoji, safe(badge.name)].filter(Boolean).join(" ")).join("\n")
                    : "Nenhuma insígnia visível.",

                color: USERINFO_COLOR
            };
        }

        case "dates": {
            const fields = [];

            add(fields, "📅 Conta criada em", dateWithAge(user.createdAt, now));
            add(fields, "📥 Entrou no servidor em", dateWithAge(user.joinedAt, now));

            if (user.prismaActive) {
                add(fields, "💎 Assinante Prisma+ desde", dateWithAge(user.prismaSince, now));
            }

            if (user.pulsing) {
                add(fields, "✨ Pulser desde", dateWithAge(pulseStartOf(user), now));
            }

            return {
                title: "📅 Datas de " + name,
                color: USERINFO_COLOR,
                fields
            };
        }

        case "pulse": {
            if (!user.pulsing) return null;

            const start = pulseStartOf(user);

            if (!start) {
                return {
                    title: "✨ Evolução do Pulse de " + name,
                    description: "A API não informou desde quando essa pessoa pulsa.",
                    color: USERINFO_COLOR
                };
            }

            const reached = Number(user.pulseBadge?.months);

            const lines = PULSE_LEVELS.map(months => {
                const at = start + months * PULSE_MONTH;

                const done = at <= now;

                const label = `${months} ${months === 1 ? "mês" : "meses"}`;

                return (
                    `${done ? "✅" : "⏳"} ${PULSE_EMOJIS[months] ?? ""} **${label}** · ${dateField(at)}` +
                    (done ? "" : ` (em ${formatAge(now, at) ?? "breve"})`)
                );
            });

            return {
                title: "✨ Evolução do Pulse de " + name,

                description:
                    `Pulsa desde **${dateField(start)}**` +
                    (Number.isFinite(reached) ? ` · selo atual: **${reached} ${reached === 1 ? "mês" : "meses"}**` : "") +
                    "\n\n" +
                    lines.join("\n"),

                color: USERINFO_COLOR,

                footer: { text: "Cada mês do Pulse vale 30 dias" }
            };
        }

        default:
            return null;
    }
}

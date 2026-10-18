
import { getUserBadges } from "./userinfo-badges.mjs";

import { avatarPreviewUrl } from "../web/avatar-preview.mjs";

import {
    PULSE_EMOJIS,
    PULSE_LEVELS,
    PULSE_MONTH,
    UNKNOWN,
    dateField,
    dateWithAge,
    formatAge,
    formatCountdown,
    plain,
    prismaPlanName,
    pulseStartOf,
    safe
} from "./userinfo-format.mjs";

// ==========================================
// TELAS DO /USERINFO
// ==========================================

// O cartão do /userinfo (um embed, no estilo do Zany) e os detalhes do menu "Mais
// informações". A doc da VSync: author, footer e o nome dos campos são texto simples;
// description e o valor dos campos aceitam markdown, bloco de código e menção (que no embed
// é só visual, não notifica); o timestamp (em ms) aparece ao lado do rodapé.

export const USERINFO_COLOR = "#8755DA";

const MAX_FIELD = 1024;

const MAX_PULSE_LEVEL = PULSE_LEVELS.at(-1);

// Os cargos cabem numa descrição de embed (4096): cada menção de cargo tem ~45 caracteres.
const MAX_ROLES = 80;

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

const hasValue = value => value !== undefined && value !== null && value !== "";

// ==========================================
// CARTÃO
// ==========================================

// actorName e actorAvatar: quem usou o comando (vão no rodapé). views: o contador (ou null).
export function buildUserinfoEmbed({ user, actorName, actorAvatar, views = null, now = Date.now() }) {
    // o nome que a pessoa usa neste servidor: o apelido, senão o nome de exibição
    const name = plain(user.nickname || user.displayName || user.username || "Usuário", 120);

    const username = plain(user.username || "desconhecido", 120);

    const icons = getUserBadges(user)
        .map(badge => badge.emoji)
        .filter(Boolean)
        .join(" ");

    const badgeText = [user.bot ? "🤖 Bot" : null, icons || null].filter(Boolean).join(" · ");

    const fields = [];

    add(fields, "🏷️ Tag", block(username), true);
    add(fields, "🪪 ID", block(String(user.id)), true);
    add(fields, "🏅 Insígnias", badgeText || "Nenhuma", true);

    add(fields, "📅 Conta criada em", dateWithAge(user.createdAt, now));
    add(fields, "📥 Entrou no servidor em", dateWithAge(user.joinedAt, now));

    // O Prisma e o Pulse só entram no cartão para quem tem: sem eles, os campos ficam de
    // fora em vez de mostrar "não é assinante" e "não informado".
    if (user.prismaActive) {
        add(fields, `💎 Assinante ${prismaPlanName(user)} desde`, dateWithAge(user.prismaSince, now));
    }

    if (user.pulsing) {
        const start = pulseStartOf(user);

        add(fields, "✨ Pulser desde", dateWithAge(start, now));

        const currentEmoji = PULSE_EMOJIS[user.pulseBadge?.months] ?? "";

        // O selo atual mostra há quanto tempo a pessoa pulsa (como o Zany faz com o impulso).
        const current = user.pulseBadge && start ? formatAge(start, now) : null;

        add(
            fields,
            "🏅 Insígnia de Pulser atual",
            currentEmoji + " │ **" + (current ?? UNKNOWN) + "**",
            true
        );

        const nextAt = Number(user.nextPulseBadge?.at);

        const hasNext = Boolean(user.nextPulseBadge) && Number.isFinite(nextAt) && nextAt > 0;

        // Sem próximo selo, a pessoa já está no último nível.
        const atMax = !user.nextPulseBadge && Number(user.pulseBadge?.months) >= MAX_PULSE_LEVEL;

        add(
            fields,
            "⏭️ Próxima insígnia de Pulser",
            atMax
                ? currentEmoji + " │ **Nível máximo alcançado.**"
                : (PULSE_EMOJIS[user.nextPulseBadge?.months] ?? "") + " │ **" +
                    (hasNext ? "em " + formatCountdown(now, nextAt) : UNKNOWN) + "**",
            true
        );
    }

    // De castigo (timeout) só aparece enquanto vale.
    if (Number(user.timeoutUntil) > now) {
        add(
            fields,
            "⏳ De castigo até",
            `${dateField(user.timeoutUntil)} (em **${formatCountdown(now, user.timeoutUntil)}**)`
        );
    }

    const footer =
        "Comando executado por: " +
        plain(actorName || "Usuário", 80) +
        (views === null ? "" : " | Visualizações: " + views);

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
        },

        // a hora do comando, no formato do app (o rodapé não leva a hora no texto)
        timestamp: now
    };
}

// ==========================================
// DETALHES ("Mais informações")
// ==========================================

const STATUS_LABELS = Object.freeze({
    online: "🟢 Online",
    idle: "🌙 Ausente",
    dnd: "⛔ Não perturbe",
    offline: "⚫ Offline"
});

// Presença ao vivo: só existe nos objetos de membro (a API a omite no perfil da conta).
const hasPresence = user =>
    hasValue(user.status) || Boolean(user.customStatus) || Boolean(user.activity) || Boolean(user.listening);

// As opções do menu para esta pessoa (só o que dá para mostrar com os dados da API).
export function detailOptions(user) {
    return [
        ...(user.avatarUrl
            ? [{ label: "Avatar", value: "avatar", description: "A foto de perfil, inteira e sem cortar", emoji: "🖼️" }]
            : []),

        ...(user.bannerUrl
            ? [{ label: "Banner", value: "banner", description: "A imagem de capa do perfil", emoji: "🌌" }]
            : []),

        { label: "Insígnias", value: "badges", description: "O nome de cada insígnia visível", emoji: "🏅" },
        { label: "Datas e idades", value: "dates", description: "Conta, servidor, Prisma e Pulse", emoji: "📅" },

        ...(user.pulsing
            ? [{ label: "Evolução do Pulse", value: "pulse", description: "Cada nível e quando chega", emoji: "✨" }]
            : []),

        ...(Array.isArray(user.roleIds) && user.roleIds.length
            ? [{ label: "Cargos", value: "roles", description: "Os cargos neste servidor", emoji: "🎭" }]
            : []),

        ...(hasPresence(user)
            ? [{ label: "Status e atividade", value: "status", description: "Online, status personalizado e o que faz agora", emoji: "💬" }]
            : [])
    ];
}

// O embed de um detalhe, ou null se a opção não existe (ou não vale para esta pessoa).
// "avatar": a imagem grande do embed vai numa tela larga servida pelo próprio bot
// (services/web/avatar-preview.mjs), porque a VSync corta a imagem num quadro de 300 px de altura
// e um avatar quadrado ficaria achatado. O link "Abrir em tamanho original" é o avatar cru.
export function buildUserinfoDetail(kind, user, now = Date.now()) {
    const name = plain(user.nickname || user.displayName || user.username || "Usuário", 80);

    switch (kind) {
        case "avatar":
        case "banner": {
            const url = kind === "avatar" ? user.avatarUrl : user.bannerUrl;

            if (!url) return null;

            // sem avatar da CDN da VSync (ou sem a API pública), vale a imagem crua
            const shown = (kind === "avatar" ? avatarPreviewUrl(url) : null) ?? url;

            return {
                title: (kind === "avatar" ? "🖼️ Avatar de " : "🌌 Banner de ") + name,
                description: "[Abrir em tamanho original](" + url + ")",
                color: USERINFO_COLOR,
                image: { url: shown }
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
                add(fields, `💎 Assinante ${prismaPlanName(user)} desde`, dateWithAge(user.prismaSince, now));
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
                    (done ? "" : ` (em ${formatCountdown(now, at)})`)
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

        case "roles": {
            const ids = Array.isArray(user.roleIds) ? user.roleIds : [];

            if (!ids.length) return null;

            // as menções de cargo no embed são só chips (não notificam)
            return {
                title: `🎭 Cargos de ${name} (${ids.length})`,
                description: ids.slice(0, MAX_ROLES).map(id => `<@&${id}>`).join(" ") +
                    (ids.length > MAX_ROLES ? `\n\n…e mais ${ids.length - MAX_ROLES}.` : ""),
                color: USERINFO_COLOR
            };
        }

        case "status": {
            if (!hasPresence(user)) return null;

            const lines = [];

            if (hasValue(user.status)) {
                lines.push(`**Status:** ${STATUS_LABELS[user.status] ?? safe(user.status)}`);
            }

            if (user.customStatus?.text || user.customStatus?.emoji) {
                const until = user.customStatus.expiresAt
                    ? ` · até ${dateField(user.customStatus.expiresAt)}`
                    : "";

                lines.push(
                    `**Status personalizado:** ${[user.customStatus.emoji, safe(user.customStatus.text)].filter(Boolean).join(" ")}${until}`
                );
            }

            if (user.activity?.name) {
                const since = user.activity.startedAt
                    ? ` · desde ${dateField(user.activity.startedAt)} (há **${formatAge(user.activity.startedAt, now) ?? "pouco"}**)`
                    : "";

                lines.push(`**Atividade:** ${safe(user.activity.name)}${since}`);
            }

            // o formato da música não está na doc: mostra o que vier de título e artista
            if (user.listening && typeof user.listening === "object") {
                const song = safe(user.listening.title ?? user.listening.name ?? user.listening.track ?? "");

                const artist = safe(
                    Array.isArray(user.listening.artists)
                        ? user.listening.artists.join(", ")
                        : (user.listening.artist ?? "")
                );

                const text = [song, artist].filter(Boolean).join(" — ");

                if (text) lines.push(`**Ouvindo:** 🎵 ${text}`);
            }

            return {
                title: "💬 Status de " + name,
                description: lines.length ? lines.join("\n") : "Sem status nem atividade agora.",
                color: USERINFO_COLOR
            };
        }

        default:
            return null;
    }
}

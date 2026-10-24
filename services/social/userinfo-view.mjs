
import { getUserBadges } from "./userinfo-badges.mjs";

import { PALETTE } from "../../config/theme.mjs";

import {
    UNKNOWN,
    dateField,
    dateWithAge,
    formatCountdown,
    plain,
    safe
} from "./userinfo-format.mjs";

// ==========================================
// TELAS DO /USERINFO
// ==========================================

// O cartão do /userinfo (um embed, no estilo do Zany) e os detalhes do menu "Mais
// informações". No embed, author, footer e o nome dos campos são texto simples; description e o
// valor dos campos aceitam markdown, bloco de código e menção (que no embed é só visual, não
// notifica); o timestamp aparece ao lado do rodapé.

export const USERINFO_COLOR = PALETTE.violet;

// O limite do valor de um campo de embed.
const MAX_FIELD = 1024;

// Quantos cargos aparecem na tela de cargos (o embed aguenta 4096 caracteres).
const MAX_ROLES = 40;

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

// A mesma imagem, em tamanho grande (o Discord redimensiona pelo ?size=).
export const largeImage = url => String(url ?? "").replace(/size=\d+/, "size=1024");

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
        .join(" ");

    const fields = [];

    add(fields, "🏷️ Tag", block(username), true);
    add(fields, "🪪 ID", block(String(user.id)), true);

    add(
        fields,
        "🏅 Insígnias",
        [user.bot ? "🤖 Bot" : null, icons || null].filter(Boolean).join(" · ") || "Nenhuma",
        true
    );

    add(fields, "📅 Conta criada em", dateWithAge(user.createdAt, now));
    add(fields, "📥 Entrou no servidor em", dateWithAge(user.joinedAt, now));

    // Só entra para quem impulsiona: sem impulso, o campo fica de fora em vez de "não informado".
    if (user.boostingSince) {
        add(fields, "🚀 Impulsiona este servidor desde", dateWithAge(user.boostingSince, now));
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

// As opções do menu para esta pessoa (só o que dá para mostrar com os dados do Discord). O
// banner só existe no perfil completo da conta, então a opção aparece sempre e a tela avisa se a
// pessoa não tem um.
export function detailOptions(user) {
    return [
        ...(user.avatarUrl
            ? [{ label: "Avatar", value: "avatar", description: "A foto de perfil, em tamanho grande", emoji: "🖼️" }]
            : []),

        { label: "Banner", value: "banner", description: "A imagem de capa do perfil", emoji: "🌌" },
        { label: "Insígnias", value: "badges", description: "O nome de cada insígnia visível", emoji: "🏅" },
        { label: "Datas e idades", value: "dates", description: "Conta, servidor, impulso e castigo", emoji: "📅" },

        ...(Array.isArray(user.roleIds) && user.roleIds.length
            ? [{ label: "Cargos", value: "roles", description: "Os cargos neste servidor", emoji: "🎭" }]
            : [])
    ];
}

// O embed de um detalhe, ou null se a opção não existe (ou não vale para esta pessoa).
// "user" precisa trazer bannerUrl para a tela do banner (userinfo-account.mjs busca o perfil).
export function buildUserinfoDetail(kind, user, now = Date.now()) {
    const name = plain(user.nickname || user.displayName || user.username || "Usuário", 80);

    switch (kind) {
        case "avatar":
        case "banner": {
            const url = kind === "avatar" ? user.avatarUrl : user.bannerUrl;

            if (!url) {
                return kind === "banner"
                    ? {
                        title: "🌌 Banner de " + name,
                        description: "Essa pessoa não tem um banner no perfil.",
                        color: USERINFO_COLOR
                    }
                    : null;
            }

            return {
                title: (kind === "avatar" ? "🖼️ Avatar de " : "🌌 Banner de ") + name,
                description: "[Abrir em tamanho original](" + largeImage(url) + ")",
                color: USERINFO_COLOR,
                image: { url: largeImage(url) }
            };
        }

        case "badges": {
            const badges = getUserBadges(user);

            return {
                title: "🏅 Insígnias de " + name,

                description: badges.length
                    ? badges.map(badge => `${badge.emoji} ${safe(badge.name)}`).join("\n")
                    : "Nenhuma insígnia visível.",

                color: USERINFO_COLOR
            };
        }

        case "dates": {
            const fields = [];

            add(fields, "📅 Conta criada em", dateWithAge(user.createdAt, now));
            add(fields, "📥 Entrou no servidor em", dateWithAge(user.joinedAt, now));

            if (user.boostingSince) {
                add(fields, "🚀 Impulsiona este servidor desde", dateWithAge(user.boostingSince, now));
            }

            if (Number(user.timeoutUntil) > now) {
                add(
                    fields,
                    "⏳ De castigo até",
                    `${dateField(user.timeoutUntil)} (em **${formatCountdown(now, user.timeoutUntil)}**)`
                );
            }

            return {
                title: "📅 Datas de " + name,
                color: USERINFO_COLOR,
                fields
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

        default:
            return null;
    }
}

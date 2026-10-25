
import {
    getUserBadges,
    getAccountNotes,
    nitroSigns,
    boostLadder
} from "./userinfo-badges.mjs";

import { PALETTE } from "../../config/theme.mjs";

import { icon } from "../platform/app-emojis.mjs";

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
// NITRO E IMPULSO (os textos dos campos)
// ==========================================

// O horário no formato do Discord: "<t:segundos:D>" aparece como a data, no idioma de quem lê.
const day = time => `<t:${Math.floor(Number(time) / 1000)}:D>`;

const NITRO_STATE = {
    likely: "Provável",
    possible: "Possível",
    none: "Não detectado"
};

// O Nitro em uma linha (o cartão) com os sinais que o provam.
function nitroSummary(nitro) {
    const state = NITRO_STATE[nitro.state];

    return nitro.signs.length
        ? `**${state}** (${nitro.signs.join(", ")})`
        : state;
}

// O impulso para o cartão: desde quando e em que pé está a insígnia de impulso.
function boostSummary(user, now) {
    const ladder = boostLadder(user.boostingSince, now);

    const lines = [dateWithAge(user.boostingSince, now)];

    if (!ladder) {
        return lines[0];
    }

    if (ladder.level === 0) {
        lines.push(`Insígnia de impulso: ainda não · o nível 1 chega em **${plural(ladder.next.days, "dia", "dias")}** (${day(ladder.next.at)})`);

    } else if (!ladder.next) {
        lines.push(`Insígnia de impulso: **nível ${ladder.level} de ${ladder.levels}** (o máximo)`);

    } else {
        lines.push(
            `Insígnia de impulso: **nível ${ladder.level} de ${ladder.levels}** · ` +
            `o nível ${ladder.next.level} (${ladder.next.months} ${ladder.next.months === 1 ? "mês" : "meses"}) ` +
            `chega em **${plural(ladder.next.days, "dia", "dias")}** (${day(ladder.next.at)})`
        );
    }

    return lines.join("\n");
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// ==========================================
// CARTÃO
// ==========================================

// actorName e actorAvatar: quem usou o comando (vão no rodapé). views: o contador (ou null).
export function buildUserinfoEmbed({ user, actorName, actorAvatar, views = null, now = Date.now() }) {
    // o nome que a pessoa usa neste servidor: o apelido, senão o nome de exibição
    const name = plain(user.nickname || user.displayName || user.username || "Usuário", 120);

    const username = plain(user.username || "desconhecido", 120);

    const badges = getUserBadges(user);

    const nitro = nitroSigns(user);

    const fields = [];

    add(fields, icon("🏷️") + " Tag", block(username), true);
    add(fields, icon("🪪") + " ID", block(String(user.id)), true);

    // As insígnias com o nome de cada uma (é o que a pessoa quer ver), na largura toda.
    add(
        fields,
        icon("🏅") + " Insígnias",
        [user.bot ? icon("🤖") + " Bot" : null, ...badges.map(badge => `${badge.emoji} ${safe(badge.name)}`)]
            .filter(Boolean)
            .join(" · ") || "Nenhuma",
        false
    );

    // O Nitro é deduzido (a API não informa a assinatura): o campo diz isso com os sinais.
    add(fields, icon("💠") + " Nitro", nitroSummary(nitro), true);

    // A etiqueta de servidor que a pessoa exibe ao lado do nome.
    if (user.primaryGuild?.tag) {
        add(fields, icon("🔖") + " Etiqueta de servidor", block(plain(user.primaryGuild.tag, 10)), true);
    }

    add(fields, icon("📅") + " Conta criada em", dateWithAge(user.createdAt, now));
    add(fields, icon("📥") + " Entrou no servidor em", dateWithAge(user.joinedAt, now));

    // Só entra para quem impulsiona: sem impulso, o campo fica de fora em vez de "não informado".
    if (user.boostingSince) {
        add(fields, icon("🚀") + " Impulsiona este servidor", boostSummary(user, now));
    }

    // De castigo (timeout) só aparece enquanto vale.
    if (Number(user.timeoutUntil) > now) {
        add(
            fields,
            icon("⏳") + " De castigo até",
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
        description: icon("👤") + " **Menção:** <@" + user.id + ">",

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
            ? [{ label: "Avatar", value: "avatar", description: "A foto de perfil, em tamanho grande", emoji: icon("🖼️") }]
            : []),

        { label: "Banner", value: "banner", description: "A imagem de capa do perfil", emoji: icon("🌌") },
        { label: "Insígnias", value: "badges", description: "Cada insígnia da conta e o que ela quer dizer", emoji: icon("🏅") },
        { label: "Nitro e impulso", value: "nitro", description: "Sinais de Nitro e o nível da insígnia de impulso", emoji: icon("💠") },
        { label: "Datas e idades", value: "dates", description: "Conta, servidor, impulso e castigo", emoji: icon("📅") },

        ...(Array.isArray(user.roleIds) && user.roleIds.length
            ? [{ label: "Cargos", value: "roles", description: "Os cargos neste servidor", emoji: icon("🎭") }]
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
                        title: icon("🌌") + " Banner de " + name,
                        description: "Essa pessoa não tem um banner no perfil.",
                        color: USERINFO_COLOR
                    }
                    : null;
            }

            return {
                title: (kind === "avatar" ? icon("🖼️") + " Avatar de " : icon("🌌") + " Banner de ") + name,
                description: "[Abrir em tamanho original](" + largeImage(url) + ")",
                color: USERINFO_COLOR,
                image: { url: largeImage(url) }
            };
        }

        case "badges": {
            const badges = getUserBadges(user);

            const notes = getAccountNotes(user);

            const lines = [
                ...(user.bot ? [`${icon("🤖")} **Bot**: conta de aplicativo.`] : []),
                ...badges.map(badge => `${badge.emoji} **${safe(badge.name)}**\n-# ${badge.about}`)
            ];

            return {
                title: icon("🏅") + " Insígnias de " + name,

                description: [
                    lines.length ? lines.join("\n") : "Nenhuma insígnia visível.",
                    ...(notes.length ? ["", ...notes.map(note => `${icon("ℹ️")} ${note.text}`)] : []),
                    "",
                    "-# Vem das flags públicas da conta no Discord. As insígnias de Nitro e de Quests não aparecem aqui: o Discord não as informa a bots."
                ].join("\n"),

                color: USERINFO_COLOR
            };
        }

        case "nitro": {
            const nitro = nitroSigns(user);

            const ladder = boostLadder(user.boostingSince, now);

            const fields = [];

            add(
                fields,
                icon("💠") + " Nitro",
                nitroSummary(nitro) + "\n-# O Discord só conta a assinatura do Nitro ao próprio dono da conta. " +
                    "A Helena deduz pelo que o perfil mostra (avatar animado, banner, perfil por servidor); " +
                    "quem tem Nitro e não usa nada disso aparece como \"não detectado\"."
            );

            if (!ladder) {
                add(fields, icon("🚀") + " Impulso", "Não impulsiona este servidor.");

            } else {
                add(fields, icon("🚀") + " Impulso", boostSummary(user, now));

                add(
                    fields,
                    icon("🏅") + " Níveis da insígnia de impulso",
                    ladder.steps
                        .map(step => `${step.reached ? icon("✅") : icon("⏳")} **Nível ${step.level}** · ${step.months} ${step.months === 1 ? "mês" : "meses"} · ${day(step.at)}`)
                        .join("\n") +
                        "\n-# A insígnia do Discord conta o impulso em qualquer servidor; a Helena só enxerga este."
                );
            }

            return {
                title: icon("💠") + " Nitro e impulso de " + name,
                color: USERINFO_COLOR,
                fields
            };
        }

        case "dates": {
            const fields = [];

            add(fields, icon("📅") + " Conta criada em", dateWithAge(user.createdAt, now));
            add(fields, icon("📥") + " Entrou no servidor em", dateWithAge(user.joinedAt, now));

            if (user.boostingSince) {
                add(fields, icon("🚀") + " Impulsiona este servidor", boostSummary(user, now));
            }

            if (Number(user.timeoutUntil) > now) {
                add(
                    fields,
                    icon("⏳") + " De castigo até",
                    `${dateField(user.timeoutUntil)} (em **${formatCountdown(now, user.timeoutUntil)}**)`
                );
            }

            return {
                title: icon("📅") + " Datas de " + name,
                color: USERINFO_COLOR,
                fields
            };
        }

        case "roles": {
            const ids = Array.isArray(user.roleIds) ? user.roleIds : [];

            if (!ids.length) return null;

            // as menções de cargo no embed são só chips (não notificam)
            return {
                title: `${icon("🎭")} Cargos de ${name} (${ids.length})`,
                description: ids.slice(0, MAX_ROLES).map(id => `<@&${id}>`).join(" ") +
                    (ids.length > MAX_ROLES ? `\n\n…e mais ${ids.length - MAX_ROLES}.` : ""),
                color: USERINFO_COLOR
            };
        }

        default:
            return null;
    }
}


import {
    getUserBadges,
    getAccountNotes,
    nitroSigns,
    boostLadder
} from "./userinfo-badges.mjs";

import { PALETTE } from "../../config/theme.mjs";

import { icon, iconNamed } from "../platform/app-emojis.mjs";

import {
    UNKNOWN,
    dateField,
    dateWithAge,
    formatAge,
    formatCountdown,
    plain,
    safe
} from "./userinfo-format.mjs";

// ==========================================
// TELAS DO /USERINFO
// ==========================================

// O cartão do /userinfo (um embed) e os detalhes do menu "Mais
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

// Uma cor (número) como "#RRGGBB".
const hexOf = color => "#" + Number(color).toString(16).padStart(6, "0").toUpperCase();

// As cores de plaquinha que o Discord documenta (collectibles.nameplate.palette).
const NAMEPLATE_PALETTES = Object.freeze({
    crimson: "Carmesim",
    berry: "Amora",
    sky: "Céu",
    teal: "Verde-azulado",
    forest: "Floresta",
    bubble_gum: "Chiclete",
    violet: "Violeta",
    cobalt: "Cobalto",
    clover: "Trevo",
    lemon: "Limão",
    white: "Branco"
});

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

// O impulso para o cartão e as telas: desde quando (a data e a idade).
const boostSummary = (user, now) => dateWithAge(user.boostingSince, now);

// A gema do nível da insígnia de impulso (a da Helena; sem ela, a gema comum).
const gem = level => iconNamed(`boost_${level}`, "💎");

/**
 * Os dois campos lado a lado do cartão: a insígnia de impulso de agora (o nível e há
 * quanto tempo) e a próxima (o nível e quando chega). Vazio se a pessoa não impulsiona este servidor.
 */
export function boostFields(user, now = Date.now()) {
    const ladder = boostLadder(user.boostingSince, now);

    if (!ladder) {
        return [];
    }

    const age = formatAge(user.boostingSince, now);

    const current = ladder.level === 0
        ? `Ainda sem insígnia | **${age}**`
        : `${gem(ladder.level)} **Nível ${ladder.level} de ${ladder.levels}** | **${age}**`;

    const next = ladder.next
        ? `${gem(ladder.next.level)} **Nível ${ladder.next.level}** | em **${formatCountdown(now, ladder.next.at)}**`
        : `${gem(ladder.level)} **Nível máximo alcançado.**`;

    return [
        { name: icon("🏅") + " Insígnia de impulso atual", value: current, inline: true },
        { name: icon("▶️") + " Próxima insígnia de impulso", value: next, inline: true }
    ];
}

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

    // Só entra para quem impulsiona: sem impulso, os campos ficam de fora em vez de "não informado".
    if (user.boostingSince) {
        add(fields, icon("🚀") + " Impulsionando este servidor desde", boostSummary(user, now));

        for (const field of boostFields(user, now)) {
            add(fields, field.name, field.value, field.inline);
        }
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
export function detailOptions(user, { self = false } = {}) {
    return [
        ...(user.avatarUrl
            ? [{ label: "Avatar", value: "avatar", description: "A foto de perfil, em tamanho grande", emoji: icon("🖼️") }]
            : []),

        { label: "Banner", value: "banner", description: "A imagem de capa do perfil", emoji: icon("🌌") },
        { label: "Cores do perfil", value: "colors", description: "Cor de destaque, cores do nome e enfeites", emoji: icon("🎨") },
        { label: "Insígnias", value: "badges", description: "Cada insígnia da conta e o que ela quer dizer", emoji: icon("🏅") },
        { label: "Nitro e impulso", value: "nitro", description: "Sinais de Nitro e o nível da insígnia de impulso", emoji: icon("💠") },
        { label: "Datas e idades", value: "dates", description: "Conta, servidor, impulso e castigo", emoji: icon("📅") },
        { label: "Nomes anteriores", value: "names", description: "Nomes e @usuários que a Helena já viu", emoji: icon("✏️") },
        { label: "Ícones antigos", value: "oldavatars", description: "As fotos de perfil anteriores", emoji: icon("🖼️") },
        { label: "Banners antigos", value: "oldbanners", description: "Os banners anteriores", emoji: icon("🌌") },

        ...(Array.isArray(user.roleIds) && user.roleIds.length
            ? [{ label: "Cargos", value: "roles", description: "Os cargos neste servidor", emoji: icon("🎭") }]
            : []),

        // só no próprio cartão: cada pessoa decide o que a Helena guarda dela (userinfo-privacy.mjs)
        ...(self
            ? [{ label: "Meu histórico", value: "privacy", description: "Ocultar, mostrar ou apagar o que a Helena guarda de você", emoji: icon("🔒") }]
            : [])
    ];
}

// ==========================================
// HISTÓRICO (nomes, ícones e banners antigos)
// ==========================================

// Quantas linhas cabem numa tela de histórico (o embed aguenta 4096 caracteres).
const MAX_HISTORY_LINES = 15;

// Cada valor com o intervalo em que valeu: "de <t:a:D> até <t:b:D>" (o último, o de agora, não entra).
// "entries" vem do mais novo para o mais antigo; o primeiro é o de agora e fica de fora da lista.
function previousOf(entries) {
    return entries.slice(1).map((entry, index) => ({ ...entry, until: entries[index].at }));
}

const range = entry => `visto de ${day(entry.at)} até ${day(entry.until)}`;

// O que dizer quando a pessoa ocultou o histórico ou nunca usou a Helena; null se há o que mostrar.
function historyBlock(history, name) {
    if (history?.hidden) {
        return `**${name}** escolheu ocultar o histórico. Para mostrar de novo, a própria pessoa usa **Meu histórico** no menu do cartão dela (ou \`hui mostrar\`).`;
    }

    if (!history?.tracked) {
        return `A Helena só guarda o histórico de quem usa a Helena, e **${name}** ainda não usou. Quando usar, o histórico começa ali.`;
    }

    return null;
}

const historyFooter = history =>
    "\n\n-# A Helena só guarda isso de quem usa a Helena" +
    (history?.since ? `, desde ${day(history.since)}` : "") +
    ". É o que o Discord mostra publicamente, e cada pessoa pode ocultar ou apagar o seu em **Meu histórico**, no menu do próprio cartão.";

function historyScreen({ title, name, history, lines, empty, image, extra = "" }) {
    const blocked = historyBlock(history, name);

    if (blocked) {
        return { title, description: blocked, color: USERINFO_COLOR };
    }

    const shown = lines.slice(0, MAX_HISTORY_LINES);

    return {
        title,

        description:
            (shown.length ? shown.join("\n") + (lines.length > shown.length ? `\n\n…e mais ${lines.length - shown.length}.` : "") : empty) +
            extra +
            historyFooter(history),

        color: USERINFO_COLOR,
        ...(image && shown.length ? { image: { url: image } } : {})
    };
}

// O embed de um detalhe, ou null se a opção não existe (ou não vale para esta pessoa).
// "user" precisa trazer bannerUrl para a tela do banner (userinfo-account.mjs busca o perfil).
// "extras.history" é o que readHistory() (userinfo-history.mjs) devolve, para as telas de histórico.
export function buildUserinfoDetail(kind, user, now = Date.now(), extras = {}) {
    const name = plain(user.nickname || user.displayName || user.username || "Usuário", 80);

    const { history } = extras;

    switch (kind) {
        case "names": {
            const usernames = previousOf(history?.usernames ?? []).map(entry => ({ ...entry, label: "@usuário" }));
            const displays = previousOf(history?.displays ?? []).map(entry => ({ ...entry, label: "nome de exibição" }));

            const lines = [...usernames, ...displays]
                .sort((a, b) => b.until - a.until)
                .map(entry => `${icon("✏️")} **${safe(entry.value)}** · ${entry.label} · ${range(entry)}`);

            return historyScreen({
                title: icon("✏️") + " Nomes anteriores de " + name,
                name,
                history,
                lines,
                empty: "A Helena ainda não viu essa pessoa trocar de nome ou de @usuário."
            });
        }

        case "oldavatars":
        case "oldbanners": {
            const isAvatar = kind === "oldavatars";

            const previous = previousOf(isAvatar ? history?.avatars ?? [] : history?.banners ?? []);

            const url = value => isAvatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${value}.png?size=256`
                : `https://cdn.discordapp.com/banners/${user.id}/${value}.png?size=512`;

            const lines = previous.map(entry => `${isAvatar ? icon("🖼️") : icon("🌌")} ${range(entry)} · [abrir](${url(entry.value)})`);

            return historyScreen({
                title: (isAvatar ? icon("🖼️") + " Ícones antigos de " : icon("🌌") + " Banners antigos de ") + name,
                name,
                history,
                lines,
                empty: isAvatar
                    ? "A Helena ainda não viu essa pessoa trocar de foto."
                    : "A Helena ainda não viu essa pessoa trocar de banner (o banner só entra quando alguém consulta o /userinfo dela).",
                image: previous[0] ? url(previous[0].value) : null,
                extra: previous.length ? "\n\n-# A imagem abaixo é a anterior à de agora. O Discord pode apagar fotos muito antigas." : ""
            });
        }

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

        case "colors": {
            const fields = [];

            // a cor de destaque (accent_color) ou, sem ela, a cor do banner ("#232428")
            const banner = /^#[0-9a-f]{6}$/i.test(String(user.bannerColor ?? "")) ? parseInt(user.bannerColor.slice(1), 16) : null;

            const accent = Number.isInteger(user.accentColor) ? user.accentColor : banner;

            add(fields, icon("🎨") + " Cor de destaque", accent === null ? "Sem cor definida." : "`" + hexOf(accent) + "`");

            if (Array.isArray(user.nameColors) && user.nameColors.length) {
                add(fields, icon("✏️") + " Cores do nome", user.nameColors.map(color => "`" + hexOf(color) + "`").join(" · "));
            }

            if (user.nameplatePalette) {
                add(fields, icon("🏷️") + " Plaquinha", NAMEPLATE_PALETTES[user.nameplatePalette] ?? safe(user.nameplatePalette));
            }

            if (user.avatarDecoration) {
                add(fields, icon("🖼️") + " Decoração do avatar", "Tem uma decoração de avatar (a imagem vai ao lado).");
            }

            return {
                title: icon("🎨") + " Cores do perfil de " + name,
                description: "-# O tema de duas cores do perfil novo, a bio e as conexões ficam só com o dono da conta: o Discord não os entrega a bots.",
                color: accent ?? USERINFO_COLOR,
                fields,
                ...(user.avatarDecoration
                    ? { thumbnail: { url: `https://cdn.discordapp.com/avatar-decoration-presets/${encodeURIComponent(user.avatarDecoration)}.png?size=256` } }
                    : {})
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
                add(fields, icon("🚀") + " Impulsionando este servidor desde", boostSummary(user, now));

                for (const field of boostFields(user, now)) {
                    add(fields, field.name, field.value, field.inline);
                }

                add(
                    fields,
                    icon("🏅") + " Níveis da insígnia de impulso",
                    ladder.steps
                        .map(step => `${gem(step.level)} **Nível ${step.level}** · ${step.months} ${step.months === 1 ? "mês" : "meses"} · ${day(step.at)} ${step.reached ? icon("✅") : icon("⏳")}`)
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
                add(fields, icon("🚀") + " Impulsionando este servidor desde", boostSummary(user, now));
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

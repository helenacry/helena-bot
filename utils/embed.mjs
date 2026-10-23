
/**
 * Sistema central de embeds da Helena.
 *
 * Formato baseado na documentação oficial da VSync. O desenho (cores, recibo, humores da
 * pelúcia, o que vai no topo e no rodapé) está em docs/bot-design.md e em config/theme.mjs.
 */

import { ICON_URL, PALETTE, moodImage, sectionLabel } from "../config/theme.mjs";

import { receipt } from "./receipt.mjs";

// As cores das respostas são as do site. Cada uma tem uma função:
// violeta = marca, ouro = dinheiro, verde = renda e sucesso, vermelho = risco e falha,
// rosa = carinho, azul-acinzentado = espera, âmbar = aviso.
export const HELENA_COLORS = Object.freeze({
    primary: PALETTE.violet,
    success: PALETTE.green,
    error: PALETTE.red,
    warning: PALETTE.amber,
    economy: PALETTE.gold,
    money: PALETTE.gold,
    love: PALETTE.pink,
    wait: PALETTE.slate,
    inventory: PALETTE.violet,
    progression: PALETTE.lilac,
    missions: PALETTE.amber,
    neutral: PALETTE.grey
});

// O rodapé de todo embed que não define o próprio (o layout V2 não o repete).
export const DEFAULT_FOOTER = "/ajuda mostra tudo o que a Helena faz";

function limit(value, max) {
    return String(value ?? "").slice(0, max);
}

/**
 * Cria um embed padronizado.
 *
 *   section  o nome da seção no topo, com o ícone da Helena: "Banco" vira "HELENA · BANCO".
 *   mood     o humor da pelúcia na miniatura (config/theme.mjs, MOODS). "thumbnail" tem prioridade.
 *   author   { name, iconUrl } próprio (o /userinfo usa para a pessoa); vale mais que a seção.
 */
export function createEmbed({
    title,
    description = "",
    color = HELENA_COLORS.primary,
    fields = [],
    footer = DEFAULT_FOOTER,
    timestamp = true,
    thumbnail,
    image,
    section,
    mood,
    author
} = {}) {
    const embed = {
        title: limit(title || "Helena", 256),
        description: limit(description, 4096),
        color,
        fields: fields.slice(0, 25).map(field => ({
            name: limit(field.name, 256),
            value: limit(field.value, 1024),
            inline: Boolean(field.inline)
        })),
        footer: {
            text: limit(footer, 2048),
            iconUrl: ICON_URL
        }
    };

    if (author && typeof author === "object" && author.name) {
        embed.author = { ...author, name: limit(author.name, 256) };

    } else if (section) {
        embed.author = { name: limit(sectionLabel(section), 256), iconUrl: ICON_URL };
    }

    if (timestamp) {
        embed.timestamp = Date.now();
    }

    if (
        typeof thumbnail === "string" &&
        thumbnail.startsWith("https://")
    ) {
        embed.thumbnail = {
            url: thumbnail
        };

    } else if (mood) {
        embed.thumbnail = {
            url: moodImage(mood)
        };
    }

    if (
        typeof image === "string" &&
        image.startsWith("https://")
    ) {
        embed.image = {
            url: image
        };
    }

    return embed;
}

/**
 * O embed padrão das respostas com números: uma frase na voz da Helena, o recibo (nome e valor
 * ligados por pontilhado) e uma nota pequena. Tudo o mais é o de createEmbed.
 *
 *   say   a frase (ou as frases) de cima; pode ter **negrito** e `código`.
 *   rows  as linhas do recibo: [nome, valor], ou null para uma linha fina entre os grupos.
 *   note  a letra pequena de baixo ("-# "): o que fazer a seguir.
 */
export function ledgerEmbed({ say = "", rows = [], note = "", description = "", ...rest } = {}) {
    const lines = [
        say,
        description,
        receipt(rows),
        note ? `-# ${note}` : ""
    ].filter(part => String(part).trim());

    return createEmbed({
        ...rest,
        description: lines.join("\n")
    });
}

/**
 * Monta a resposta no formato utilizado
 * atualmente pelos comandos da Helena.
 */
export function embedResponse(embed, body = "") {
    return {
        type: "message",
        data: {
            body,
            embeds: [embed]
        }
    };
}

// As quatro respostas prontas. "options" aceita section, mood, footer, color e thumbnail.

/**
 * Mensagem de sucesso.
 */
export function successEmbed(
    title,
    description,
    fields = [],
    options = {}
) {
    return embedResponse(
        createEmbed({
            mood: "feliz",
            section: "Pronto",
            ...options,
            title: `✅ ${title}`,
            description,
            color: options.color ?? HELENA_COLORS.success,
            fields
        })
    );
}

/**
 * Mensagem de erro.
 */
export function errorEmbed(
    description,
    title = "Não deu certo",
    options = {}
) {
    return embedResponse(
        createEmbed({
            mood: "triste",
            section: "Erro",
            ...options,
            title: `❌ ${title}`,
            description,
            color: options.color ?? HELENA_COLORS.error
        })
    );
}

/**
 * Mensagem de aviso.
 */
export function warningEmbed(
    title,
    description,
    options = {}
) {
    return embedResponse(
        createEmbed({
            mood: "alerta",
            section: "Aviso",
            ...options,
            title: `⚠️ ${title}`,
            description,
            color: options.color ?? HELENA_COLORS.warning
        })
    );
}

/**
 * Mensagem informativa.
 */
export function infoEmbed(
    title,
    description,
    fields = [],
    options = {}
) {
    return embedResponse(
        createEmbed({
            ...options,
            title,
            description,
            fields
        })
    );
}

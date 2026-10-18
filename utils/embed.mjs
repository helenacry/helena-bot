
/**
 * Sistema central de embeds da Helena.
 *
 * Formato baseado na documentação oficial da VSync.
 */

export const HELENA_COLORS = Object.freeze({
    primary: "#8755DA",
    success: "#22C55E",
    error: "#EF4444",
    warning: "#F59E0B",
    economy: "#A855F7",
    inventory: "#6366F1",
    progression: "#3B82F6",
    missions: "#F59E0B",
    neutral: "#64748B"
});

// O rodapé de todo embed que não define o próprio (o layout V2 não o repete).
export const DEFAULT_FOOTER = "Helena • Seu progresso, sua conquista.";

function limit(value, max) {
    return String(value ?? "").slice(0, max);
}

/**
 * Cria um embed padronizado.
 */
export function createEmbed({
    title,
    description = "",
    color = HELENA_COLORS.primary,
    fields = [],
    footer = DEFAULT_FOOTER,
    timestamp = true,
    thumbnail,
    image
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
            text: limit(footer, 2048)
        }
    };

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

/**
 * Mensagem de sucesso.
 */
export function successEmbed(
    title,
    description,
    fields = []
) {
    return embedResponse(
        createEmbed({
            title: `✅ ${title}`,
            description,
            color: HELENA_COLORS.success,
            fields
        })
    );
}

/**
 * Mensagem de erro.
 */
export function errorEmbed(
    description,
    title = "Ocorreu um erro"
) {
    return embedResponse(
        createEmbed({
            title: `❌ ${title}`,
            description,
            color: HELENA_COLORS.error
        })
    );
}

/**
 * Mensagem de aviso.
 */
export function warningEmbed(
    title,
    description
) {
    return embedResponse(
        createEmbed({
            title: `⚠️ ${title}`,
            description,
            color: HELENA_COLORS.warning
        })
    );
}

/**
 * Mensagem informativa.
 */
export function infoEmbed(
    title,
    description,
    fields = []
) {
    return embedResponse(
        createEmbed({
            title,
            description,
            fields
        })
    );
}
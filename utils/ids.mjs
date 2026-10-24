
// ==========================================
// IDS DA DISCORD
// ==========================================

// A documentação do Discord usa UUIDs como ID de
// conta, servidor e aplicativo. Contas mais
// antigas também aparecem com IDs numéricos
// longos. Os dois formatos precisam ser aceitos.

const NUMERIC_ID = /^\d{15,25}$/;

const UUID_ID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(value) {
    const id = String(value ?? "").trim();

    return NUMERIC_ID.test(id) || UUID_ID.test(id);
}

// Aceita "<@id>" (menção de conta) ou o ID puro.
// Menção de cargo ("<@&id>") não é aceita aqui.

export function parseUserReference(value) {
    const text = String(value ?? "").trim();

    const mention = text.match(/^<@!?([^<>&\s]+)>$/);

    const id = mention ? mention[1] : text;

    return isValidId(id) ? id : null;
}

// "<#id>" ou ID puro.

export function parseChannelReference(value) {
    const text = String(value ?? "").trim();

    const mention = text.match(/^<#([^<>\s]+)>$/);

    const id = mention ? mention[1] : text;

    return isValidId(id) ? id : null;
}

// "<@&id>" ou ID puro.

export function parseRoleReference(value) {
    const text = String(value ?? "").trim();

    const mention = text.match(/^<@&([^<>\s]+)>$/);

    const id = mention ? mention[1] : text;

    return isValidId(id) ? id : null;
}

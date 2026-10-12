
// ==========================================
// MODAIS (FORMULÁRIOS) DA VSYNC
// ==========================================

// Um modal abre como resposta a um comando de barra ou ao clique de
// um botão. Comandos pelo prefixo h não têm interação, então não
// conseguem abrir modal: a porta de entrada é um botão na mensagem.
//
// Limites da VSync:
//   modal: título de 1 a 45 caracteres e de 1 a 5 campos
//   campo: customId de 1 a 100 (único), rótulo de 1 a 45,
//          placeholder até 100, estilo "short" (até 400 caracteres)
//          ou "paragraph" (até 4000)

const STYLE_LIMIT = Object.freeze({
    short: 400,
    paragraph: 4000
});

// Um campo de texto.
export function textField({
    id,
    label,
    style = "short",
    placeholder,
    value,
    required = true,
    minLength,
    maxLength
}) {
    if (typeof id !== "string" || id.length < 1 || id.length > 100) {
        throw new Error("customId do campo deve ter de 1 a 100 caracteres.");
    }

    if (typeof label !== "string" || label.length < 1 || label.length > 45) {
        throw new Error(`Rótulo inválido (1 a 45 caracteres): "${label}".`);
    }

    if (!(style in STYLE_LIMIT)) {
        throw new Error(`Estilo de campo inválido: "${style}".`);
    }

    if (placeholder !== undefined && placeholder.length > 100) {
        throw new Error("O placeholder passa de 100 caracteres.");
    }

    const cap = STYLE_LIMIT[style];

    for (const [name, limit] of [["minLength", minLength], ["maxLength", maxLength]]) {
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > cap)) {
            throw new Error(`${name} deve estar entre 1 e ${cap} no estilo ${style}.`);
        }
    }

    if (value !== undefined && String(value).length > (maxLength ?? cap)) {
        throw new Error("O valor inicial passa do tamanho máximo do campo.");
    }

    return {
        customId: id,
        label,
        style,
        required,
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...(value !== undefined ? { value: String(value) } : {}),
        ...(minLength !== undefined ? { minLength } : {}),
        ...(maxLength !== undefined ? { maxLength } : {})
    };
}

// Resposta que abre o modal.
export function openModal({ customId, title, fields }) {
    if (typeof customId !== "string" || customId.length < 1) {
        throw new Error("O modal precisa de um customId.");
    }

    if (typeof title !== "string" || title.length < 1 || title.length > 45) {
        throw new Error(`Título inválido (1 a 45 caracteres): "${title}".`);
    }

    if (!Array.isArray(fields) || fields.length < 1 || fields.length > 5) {
        throw new Error("Um modal tem de 1 a 5 campos.");
    }

    const ids = new Set(fields.map(field => field.customId));

    if (ids.size !== fields.length) {
        throw new Error("Os campos do modal não podem repetir o customId.");
    }

    return {
        type: "modal",
        data: { customId, title, fields }
    };
}

// ==========================================
// LER O QUE FOI ENVIADO
// ==========================================

// Os valores chegam em data.fields. A documentação não detalha o
// formato, então aceita lista ({ customId, value }), objeto indexado
// pelo customId (valor direto ou { value }) e listas aninhadas.
export function readFields(interaction) {
    const raw = interaction.data?.fields;

    const out = {};

    const add = (id, value) => {
        if (id === undefined || id === null) {
            return;
        }

        const text = value && typeof value === "object"
            ? value.value
            : value;

        out[String(id)] = text === undefined || text === null
            ? ""
            : String(text);
    };

    const walk = item => {
        if (Array.isArray(item)) {
            item.forEach(walk);

            return;
        }

        if (!item || typeof item !== "object") {
            return;
        }

        if (Array.isArray(item.components)) {
            item.components.forEach(walk);

            return;
        }

        add(item.customId ?? item.id ?? item.name, item.value);
    };

    if (Array.isArray(raw)) {
        walk(raw);

    } else if (raw && typeof raw === "object") {
        for (const [id, value] of Object.entries(raw)) {
            add(id, value);
        }
    }

    return out;
}

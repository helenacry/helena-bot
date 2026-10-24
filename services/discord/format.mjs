
// ==========================================
// DO FORMATO DA HELENA PARA O DO DISCORD
// ==========================================

// Os comandos e as telas da Helena respondem num formato próprio e simples
// ({ body, embeds, components, layout, ephemeral, files }; veja utils/embed.mjs e
// utils/components-v2.mjs). Este módulo é a única porta de saída para o Discord: traduz esse
// formato para o JSON da API v10 (nomes em snake_case, tipos e estilos numéricos, cores em
// inteiro, datas em ISO). Nada aqui faz rede: são funções puras, fáceis de testar.

export const DISCORD_API = "https://discord.com/api/v10";

export const FLAGS = Object.freeze({
    EPHEMERAL: 1 << 6,
    COMPONENTS_V2: 1 << 15
});

// Tipos de resposta a uma interação (callback).
const CALLBACK = Object.freeze({
    message: 4,
    defer_update: 6,
    update: 7,
    modal: 9
});

const COMPONENT = Object.freeze({
    row: 1,
    button: 2,
    select: 3,
    textInput: 4,
    section: 9,
    text: 10,
    thumbnail: 11,
    separator: 14,
    container: 17
});

// Só o layout V2 usa estes: com um deles na lista, a mensagem sai com a flag de V2.
const V2_TYPES = new Set(["container", "text", "section", "separator", "thumbnail"]);

const BUTTON_STYLE = Object.freeze({ primary: 1, secondary: 2, success: 3, danger: 4, link: 5 });

const INPUT_STYLE = Object.freeze({ short: 1, paragraph: 2 });

const SPACING = Object.freeze({ small: 1, large: 2 });

// Tipos de opção dos comandos de barra.
export const OPTION_TYPE = Object.freeze({
    string: 3,
    integer: 4,
    boolean: 5,
    user: 6,
    channel: 7,
    role: 8,
    mentionable: 9,
    number: 10,
    attachment: 11
});

// Quem recebe aviso quando a mensagem tem menção: só pessoas. Isso fecha @everyone, @here e
// cargos, mesmo que um texto escrito por um jogador (apelido, bio) traga um deles.
export const ALLOWED_MENTIONS = Object.freeze({ parse: ["users"], replied_user: false });

// ==========================================
// PEÇAS
// ==========================================

// "#rrggbb" (ou o inteiro) vira o inteiro que a API pede; inválido fica sem cor.
export function colorInt(color) {
    if (typeof color === "number" && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
        return color;
    }

    const match = /^#?([0-9a-fA-F]{6})$/.exec(String(color ?? ""));

    return match ? parseInt(match[1], 16) : undefined;
}

const CUSTOM_EMOJI = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,25})>$/;

// "🛒" vira { name }, e "<:nome:id>" (ou "<a:nome:id>") vira { name, id, animated }.
export function emojiOf(value) {
    if (!value) {
        return undefined;
    }

    if (typeof value === "object") {
        return value;
    }

    const custom = CUSTOM_EMOJI.exec(String(value));

    return custom
        ? { name: custom[2], id: custom[3], animated: custom[1] === "a" }
        : { name: String(value) };
}

const clip = (value, max) => String(value ?? "").slice(0, max);

const httpsUrl = value => {
    const url = String(value ?? "");

    return url.startsWith("https://") ? url : undefined;
};

// ==========================================
// EMBEDS
// ==========================================

export function toDiscordEmbed(embed) {
    if (!embed || typeof embed !== "object") {
        return null;
    }

    const out = {};

    if (embed.title) out.title = clip(embed.title, 256);
    if (embed.description) out.description = clip(embed.description, 4096);

    const color = colorInt(embed.color);

    if (color !== undefined) out.color = color;

    const fields = (embed.fields ?? []).slice(0, 25).map(field => ({
        name: clip(field.name, 256) || "​",
        value: clip(field.value, 1024) || "​",
        inline: Boolean(field.inline)
    }));

    if (fields.length) out.fields = fields;

    if (embed.footer?.text) {
        out.footer = {
            text: clip(embed.footer.text, 2048),
            ...(httpsUrl(embed.footer.iconUrl) ? { icon_url: embed.footer.iconUrl } : {})
        };
    }

    if (embed.author?.name) {
        out.author = {
            name: clip(embed.author.name, 256),
            ...(httpsUrl(embed.author.iconUrl) ? { icon_url: embed.author.iconUrl } : {}),
            ...(httpsUrl(embed.author.url) ? { url: embed.author.url } : {})
        };
    }

    // A API quer a data em ISO 8601; o bot guarda em milissegundos.
    if (embed.timestamp !== undefined && embed.timestamp !== null) {
        const date = new Date(embed.timestamp);

        if (!Number.isNaN(date.getTime())) out.timestamp = date.toISOString();
    }

    if (httpsUrl(embed.thumbnail?.url)) out.thumbnail = { url: embed.thumbnail.url };
    if (httpsUrl(embed.image?.url)) out.image = { url: embed.image.url };

    return out;
}

// ==========================================
// COMPONENTES
// ==========================================

function toButton(component) {
    const link = component.style === "link" || Boolean(component.url);

    return {
        type: COMPONENT.button,
        style: link ? BUTTON_STYLE.link : (BUTTON_STYLE[component.style] ?? BUTTON_STYLE.secondary),
        ...(component.label ? { label: clip(component.label, 80) } : {}),
        ...(component.emoji ? { emoji: emojiOf(component.emoji) } : {}),

        // botão de link leva url e nunca custom_id; os outros, o contrário
        ...(link ? { url: component.url } : { custom_id: clip(component.customId, 100) }),

        ...(component.disabled ? { disabled: true } : {})
    };
}

function toSelect(component) {
    return {
        type: COMPONENT.select,
        custom_id: clip(component.customId, 100),
        ...(component.placeholder ? { placeholder: clip(component.placeholder, 150) } : {}),
        min_values: component.minValues ?? 1,
        max_values: component.maxValues ?? 1,
        options: (component.options ?? []).slice(0, 25).map(option => ({
            label: clip(option.label, 100),
            value: clip(option.value, 100),
            ...(option.description ? { description: clip(option.description, 100) } : {}),
            ...(option.emoji ? { emoji: emojiOf(option.emoji) } : {}),
            ...(option.default ? { default: true } : {})
        })),
        ...(component.disabled ? { disabled: true } : {})
    };
}

export function toDiscordComponent(component) {
    switch (component?.type) {
        case "row":
            return {
                type: COMPONENT.row,
                components: (component.components ?? []).map(toDiscordComponent).filter(Boolean)
            };

        case "button":
            return toButton(component);

        case "select":
            return toSelect(component);

        // ---- layout V2 ----

        case "container": {
            const color = colorInt(component.accentColor);

            return {
                type: COMPONENT.container,
                ...(color !== undefined ? { accent_color: color } : {}),
                ...(component.spoiler ? { spoiler: true } : {}),
                components: (component.components ?? []).map(toDiscordComponent).filter(Boolean)
            };
        }

        case "text":
            return { type: COMPONENT.text, content: String(component.content ?? "") };

        case "section":
            return {
                type: COMPONENT.section,
                components: (component.texts ?? []).map(content => ({
                    type: COMPONENT.text,
                    content: String(typeof content === "string" ? content : content?.content ?? "")
                })),
                accessory: toDiscordComponent(component.accessory)
            };

        case "thumbnail":
            return {
                type: COMPONENT.thumbnail,
                media: { url: component.url },
                ...(component.description ? { description: clip(component.description, 1024) } : {})
            };

        case "separator":
            return {
                type: COMPONENT.separator,
                divider: component.divider !== false,
                spacing: SPACING[component.spacing] ?? SPACING.small
            };

        default:
            return null;
    }
}

// ==========================================
// MENSAGENS
// ==========================================

// Os arquivos de uma mensagem ficam fora do JSON: vão no mesmo envio em multipart, e o JSON
// só cita o nome (attachments). bytes é um Buffer em memória; nada passa por disco.
function filesOf(data) {
    return (Array.isArray(data?.files) ? data.files : [])
        .filter(file => file?.bytes && file?.name)
        .map(file => ({
            name: String(file.name),
            bytes: file.bytes,
            contentType: file.contentType ?? "application/octet-stream"
        }));
}

// { json, files }: o corpo da mensagem para a API e os arquivos que vão junto.
//   body       o texto (é ele que avisa quem foi mencionado)
//   ephemeral  só quem usou o comando vê (não vale ao atualizar uma mensagem)
export function toDiscordMessage(data = {}, { update = false } = {}) {
    const source = Array.isArray(data.components) ? data.components : [];

    const components = source.map(toDiscordComponent).filter(Boolean);

    const v2 = source.some(component => V2_TYPES.has(component?.type));

    const files = filesOf(data);

    let flags = 0;

    if (v2) flags |= FLAGS.COMPONENTS_V2;
    if (data.ephemeral && !update) flags |= FLAGS.EPHEMERAL;

    const json = {};

    if (v2) {
        // No V2 a mensagem não pode ter texto nem embed. Numa atualização, "body" vazio e
        // "embeds" vazios são o pedido para limpar o que a mensagem antiga tinha.
        if (data.body === "" && Array.isArray(data.embeds) && !data.embeds.length) {
            json.content = null;
            json.embeds = [];
        }

    } else {
        if (data.body !== undefined) json.content = clip(data.body, 2000);

        if (Array.isArray(data.embeds)) {
            json.embeds = data.embeds.map(toDiscordEmbed).filter(Boolean).slice(0, 10);
        }
    }

    if (source.length || Array.isArray(data.components)) json.components = components;

    if (flags) json.flags = flags;

    if (files.length) {
        json.attachments = files.map((file, id) => ({ id, filename: file.name }));
    }

    json.allowed_mentions = ALLOWED_MENTIONS;

    return { json, files };
}

// ==========================================
// FORMULÁRIOS (MODAIS)
// ==========================================

export function toDiscordModal(data) {
    return {
        custom_id: clip(data.customId, 100),
        title: clip(data.title, 45),

        // cada campo de texto vai sozinho numa linha
        components: (data.fields ?? []).map(field => ({
            type: COMPONENT.row,
            components: [{
                type: COMPONENT.textInput,
                custom_id: clip(field.customId, 100),
                label: clip(field.label, 45),
                style: INPUT_STYLE[field.style] ?? INPUT_STYLE.short,
                required: field.required !== false,
                ...(field.placeholder !== undefined ? { placeholder: clip(field.placeholder, 100) } : {}),
                ...(field.value !== undefined ? { value: String(field.value) } : {}),
                ...(field.minLength !== undefined ? { min_length: field.minLength } : {}),
                ...(field.maxLength !== undefined ? { max_length: field.maxLength } : {})
            }]
        }))
    };
}

// ==========================================
// RESPOSTA A UMA INTERAÇÃO
// ==========================================

// { type: "message" | "update" | "modal" | "defer_update", data } -> { json, files }, com o
// json já no formato do callback ({ type, data }).
export function toDiscordCallback(response) {
    const kind = response?.type;

    if (!(kind in CALLBACK)) {
        throw new Error(`Tipo de resposta sem equivalente no Discord: ${kind}`);
    }

    if (kind === "defer_update") {
        return { json: { type: CALLBACK.defer_update }, files: [] };
    }

    if (kind === "modal") {
        return { json: { type: CALLBACK.modal, data: toDiscordModal(response.data) }, files: [] };
    }

    const { json, files } = toDiscordMessage(response.data ?? {}, { update: kind === "update" });

    return { json: { type: CALLBACK[kind], data: json }, files };
}

// ==========================================
// COMANDOS DE BARRA
// ==========================================

const COMMAND_NAME = /^[-_\p{L}\p{N}]{1,32}$/u;

export function toDiscordOption(option) {
    const type = OPTION_TYPE[option.type];

    if (!type) {
        throw new Error(`Tipo de opção desconhecido: "${option.type}" em "${option.name}".`);
    }

    return {
        type,
        name: option.name,
        description: option.description,
        ...(option.required ? { required: true } : {}),
        ...(option.choices ? {
            choices: option.choices.map(choice =>
                typeof choice === "object" ? { name: choice.name, value: choice.value } : { name: String(choice), value: choice }
            )
        } : {}),
        ...(option.minValue !== undefined ? { min_value: option.minValue } : {}),
        ...(option.maxValue !== undefined ? { max_value: option.maxValue } : {}),
        ...(option.minLength !== undefined ? { min_length: option.minLength } : {}),
        ...(option.maxLength !== undefined ? { max_length: option.maxLength } : {})
    };
}

// As regras do Discord para um comando de barra, conferidas antes de enviar (a API só diz
// "Invalid Form Body"): nome em minúsculas de 1 a 32, descrição de 1 a 100, até 25 opções, as
// obrigatórias antes das opcionais e até 25 escolhas de até 100 caracteres.
export function commandProblems(name, command) {
    const problems = [];

    const here = text => `/${name}: ${text}`;

    if (!COMMAND_NAME.test(name) || name !== name.toLowerCase()) {
        problems.push(here("nome precisa ter de 1 a 32 caracteres em minúsculas, números, - ou _"));
    }

    const description = String(command.description ?? "");

    if (description.length < 1 || description.length > 100) {
        problems.push(here(`descrição de 1 a 100 caracteres (tem ${description.length})`));
    }

    const options = command.options ?? [];

    if (options.length > 25) problems.push(here("mais de 25 opções"));

    let optional = false;

    for (const option of options) {
        if (!OPTION_TYPE[option.type]) problems.push(here(`opção "${option.name}" com tipo desconhecido`));

        if (!COMMAND_NAME.test(option.name) || option.name !== option.name.toLowerCase()) {
            problems.push(here(`opção "${option.name}" com nome inválido`));
        }

        const text = String(option.description ?? "");

        if (text.length < 1 || text.length > 100) {
            problems.push(here(`descrição da opção "${option.name}" de 1 a 100 caracteres (tem ${text.length})`));
        }

        if (option.required && optional) {
            problems.push(here(`a opção obrigatória "${option.name}" vem depois de uma opcional`));
        }

        if (!option.required) optional = true;

        if ((option.choices ?? []).length > 25) problems.push(here(`opção "${option.name}" com mais de 25 escolhas`));

        for (const choice of option.choices ?? []) {
            const label = typeof choice === "object" ? choice.name : choice;

            if (String(label).length < 1 || String(label).length > 100) {
                problems.push(here(`escolha "${label}" de "${option.name}" fora de 1 a 100 caracteres`));
            }
        }
    }

    return problems;
}

// O comando no formato do registro. contexts: [0] = só em servidor (os comandos são do jogo de
// cada servidor); integration_types: [0] = instalado no servidor, não na conta da pessoa.
export function toDiscordCommand(name, command) {
    const problems = commandProblems(name, command);

    if (problems.length) {
        throw new Error(problems.join("\n"));
    }

    return {
        type: 1,
        name,
        description: command.description,
        ...(command.options?.length ? { options: command.options.map(toDiscordOption) } : {}),
        contexts: [0],
        integration_types: [0]
    };
}

// ==========================================
// ENVIO COM ARQUIVO
// ==========================================

// O corpo multipart: o JSON em payload_json e cada arquivo em files[n].
export function toMultipart(json, files) {
    const form = new FormData();

    form.set("payload_json", JSON.stringify(json));

    files.forEach((file, index) => {
        form.set(`files[${index}]`, new Blob([file.bytes], { type: file.contentType }), file.name);
    });

    return form;
}

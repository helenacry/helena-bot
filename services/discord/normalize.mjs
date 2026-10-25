
// ==========================================
// DO FORMATO DO DISCORD PARA O DA HELENA
// ==========================================

// O que chega do gateway do Discord (snake_case, tipos numéricos) vira o formato que os
// comandos e os painéis já conhecem:
//
//   interação  { id, token, type: "command" | "component" | "modal_submit", guildId, channelId,
//                user, member, data: { name, options, customId, values, fields } }
//   mensagem   { id, guildId, channelId, body, author, member }
//   usuário    { id, username, displayName, nickname, avatarUrl, bot, createdAt }
//
// Funções puras: nada aqui faz rede.

const DISCORD_EPOCH = 1420070400000n;

const CDN = "https://cdn.discordapp.com";

// Quando a conta foi criada: o ID do Discord (snowflake) guarda a data nos bits de cima.
export function snowflakeTime(id) {
    try {
        return Number((BigInt(String(id)) >> 22n) + DISCORD_EPOCH);

    } catch {
        return null;
    }
}

// A foto da conta. Quem não tem foto recebe uma das 6 padrão, escolhida pelo ID (como o app faz).
export function avatarUrl(user, size = 256) {
    if (user?.avatar) {
        return `${CDN}/avatars/${user.id}/${user.avatar}.png?size=${size}`;
    }

    try {
        return `${CDN}/embed/avatars/${Number((BigInt(String(user.id)) >> 22n) % 6n)}.png`;

    } catch {
        return `${CDN}/embed/avatars/0.png`;
    }
}

export function normalizeUser(raw, member = null) {
    if (!raw?.id) {
        return null;
    }

    const username = String(raw.username ?? "");

    return {
        id: String(raw.id),
        username,

        // o nome que a pessoa escolheu no perfil; sem ele, o @usuário
        displayName: String(raw.global_name ?? username),

        // o apelido neste servidor, quando existe
        nickname: String(member?.nick ?? ""),

        avatarUrl: avatarUrl(raw),

        // o código da foto: começando com "a_", ela é animada (só o Nitro libera)
        avatarHash: raw.avatar ?? null,

        bot: Boolean(raw.bot),
        createdAt: snowflakeTime(raw.id),

        // as insígnias públicas da conta (um número em bits; veja userinfo-badges.mjs)
        publicFlags: Number(raw.public_flags ?? 0) || 0,

        // todas as flags, quando a API as traz (tem mais bits que as públicas)
        flags: Number(raw.flags ?? 0) || 0,

        // a etiqueta de servidor que a pessoa exibe ao lado do nome (GET /users/:id)
        primaryGuild: raw.primary_guild?.tag
            ? { tag: String(raw.primary_guild.tag), guildId: String(raw.primary_guild.identity_guild_id ?? "") }
            : null,

        // o banner só vem no perfil completo (GET /users/:id), não no membro
        bannerHash: raw.banner ?? null,
        accentColor: raw.accent_color ?? null,

        // o que enfeita o perfil (também só no perfil completo): a cor do banner ("#232428"), as cores do
        // estilo do nome (números), a cor da plaquinha e a decoração do avatar
        bannerColor: typeof raw.banner_color === "string" ? raw.banner_color : null,

        nameColors: Array.isArray(raw.display_name_styles?.colors)
            ? raw.display_name_styles.colors.filter(color => Number.isInteger(color) && color >= 0 && color <= 0xffffff).slice(0, 5)
            : [],

        nameplatePalette: raw.collectibles?.nameplate?.palette ? String(raw.collectibles.nameplate.palette) : null,
        avatarDecoration: raw.avatar_decoration_data?.asset ? String(raw.avatar_decoration_data.asset) : null
    };
}

export function normalizeMember(raw) {
    if (!raw) {
        return null;
    }

    return {
        nickname: String(raw.nick ?? ""),
        joinedAt: raw.joined_at ? Date.parse(raw.joined_at) : null,
        roleIds: Array.isArray(raw.roles) ? raw.roles.map(String) : [],
        permissions: raw.permissions !== undefined ? String(raw.permissions) : null,

        // foto e banner próprios deste servidor (o perfil por servidor é recurso do Nitro)
        guildAvatarHash: raw.avatar ?? null,
        guildBannerHash: raw.banner ?? null,

        // desde quando impulsiona o servidor e até quando está de castigo (timeout)
        boostingSince: raw.premium_since ? Date.parse(raw.premium_since) : null,
        timeoutUntil: raw.communication_disabled_until ? Date.parse(raw.communication_disabled_until) : null
    };
}

// As opções do comando como { nome: valor }. Pessoa, canal e cargo chegam como o ID.
export function optionsOf(list) {
    const out = {};

    for (const option of Array.isArray(list) ? list : []) {
        if (Array.isArray(option.options)) {
            Object.assign(out, optionsOf(option.options));

        } else if (option.name !== undefined) {
            out[option.name] = option.value;
        }
    }

    return out;
}

// Os campos de um formulário enviado, como [{ customId, value }] (as linhas somem).
export function fieldsOf(rows) {
    const out = [];

    const walk = list => {
        for (const item of Array.isArray(list) ? list : []) {
            if (Array.isArray(item.components)) {
                walk(item.components);

            } else if (item.custom_id !== undefined) {
                out.push({ customId: String(item.custom_id), value: String(item.value ?? "") });
            }
        }
    };

    walk(rows);

    return out;
}

const INTERACTION_TYPE = Object.freeze({ 2: "command", 3: "component", 5: "modal_submit" });

// Devolve null para o que o bot não trata (ping, autocompletar).
export function normalizeInteraction(raw) {
    const type = INTERACTION_TYPE[raw?.type];

    if (!type) {
        return null;
    }

    // em servidor a pessoa vem dentro de member; em conversa privada, em user
    const rawUser = raw.member?.user ?? raw.user;

    const member = normalizeMember(raw.member);

    const data = raw.data ?? {};

    const base = {
        id: String(raw.id),
        token: String(raw.token),
        applicationId: String(raw.application_id ?? ""),
        type,
        guildId: raw.guild_id ? String(raw.guild_id) : null,
        channelId: raw.channel_id ? String(raw.channel_id) : null,
        user: normalizeUser(rawUser, raw.member),
        member,
        locale: raw.locale ?? null,

        // a mensagem em que o botão ou o menu foi usado
        message: raw.message
            ? { id: String(raw.message.id), channelId: String(raw.message.channel_id ?? raw.channel_id ?? "") }
            : null
    };

    if (type === "command") {
        return {
            ...base,
            data: {
                name: String(data.name ?? ""),
                options: optionsOf(data.options),

                // as pessoas citadas nas opções, já no formato da Helena
                resolved: {
                    users: Object.fromEntries(
                        Object.entries(data.resolved?.users ?? {}).map(([id, user]) =>
                            [id, normalizeUser(user, data.resolved?.members?.[id])]
                        )
                    )
                }
            }
        };
    }

    if (type === "component") {
        return {
            ...base,
            data: {
                customId: String(data.custom_id ?? ""),
                componentType: data.component_type,
                values: Array.isArray(data.values) ? data.values.map(String) : []
            }
        };
    }

    return {
        ...base,
        data: {
            customId: String(data.custom_id ?? ""),
            fields: fieldsOf(data.components)
        }
    };
}

// MESSAGE_CREATE: o texto vira "body", que é o nome que o tratador do prefixo h já usa.
export function normalizeMessage(raw) {
    if (!raw?.id) {
        return null;
    }

    return {
        id: String(raw.id),
        guildId: raw.guild_id ? String(raw.guild_id) : null,
        channelId: raw.channel_id ? String(raw.channel_id) : null,
        body: String(raw.content ?? ""),
        author: normalizeUser(raw.author, raw.member),
        member: normalizeMember(raw.member),
        webhookId: raw.webhook_id ? String(raw.webhook_id) : null,
        mentions: (Array.isArray(raw.mentions) ? raw.mentions : []).map(user => normalizeUser(user)).filter(Boolean)
    };
}

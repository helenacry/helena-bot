
// ==========================================
// ONDE FALAR EM CADA SERVIDOR
// ==========================================

// Para mandar uma mensagem sem que ninguém tenha escrito antes (as boas-vindas aos criadores), a Helena
// precisa saber em que canal. O GUILD_CREATE traz o canal de avisos do servidor (system_channel_id) e a
// lista de canais: guardamos só alguns IDs por servidor, o canal de avisos primeiro e depois os primeiros
// canais de texto. Quem manda tenta um por vez, porque o bot pode não ter permissão de escrever em todos.

const MAX_CHANNELS = 5;

// canal de texto comum (GUILD_TEXT)
const TEXT_CHANNEL = 0;

const channels = new Map();

export function rememberGuildChannels(guild) {
    const guildId = guild?.id !== undefined && guild?.id !== null ? String(guild.id) : null;

    if (!guildId) {
        return;
    }

    const list = [];

    if (guild.system_channel_id) {
        list.push(String(guild.system_channel_id));
    }

    const text = (Array.isArray(guild.channels) ? guild.channels : [])
        .filter(channel => channel?.type === TEXT_CHANNEL && channel.id !== undefined && channel.id !== null)
        .sort((a, b) =>
            (Number(a.position) || 0) - (Number(b.position) || 0) ||
            String(a.id).localeCompare(String(b.id), "en", { numeric: true })
        );

    for (const channel of text) {
        const id = String(channel.id);

        if (list.length < MAX_CHANNELS && !list.includes(id)) {
            list.push(id);
        }
    }

    if (list.length) {
        channels.set(guildId, list);

    } else {
        channels.delete(guildId);
    }
}

// Os canais para tentar, do melhor para o pior (vazio se o servidor é desconhecido).
export const welcomeChannelsOf = guildId => [...(channels.get(String(guildId)) ?? [])];

// O bot saiu do servidor.
export function forgetGuildChannels(guildId) {
    channels.delete(String(guildId));
}

export function resetGuildChannels() {
    channels.clear();
}

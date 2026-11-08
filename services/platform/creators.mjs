
import { isOwner } from "./developer.mjs";

import { MENTION_REPLIES, WELCOME_MESSAGES } from "../../config/creators.mjs";

// ==========================================
// A HELENA E QUEM A CRIOU
// ==========================================

// Dois gestos de carinho, só para os criadores (os IDs de HELENA_OWNER_ID):
//   1. mencionaram a Helena num servidor: ela responde com uma mensagem fofa;
//   2. um criador entrou num servidor em que ela está: ela dá boas-vindas no chat.
// Ninguém mais recebe nenhum dos dois. As funções aqui não conhecem o Discord: quem envia é passado
// de fora ("send"), e o helena.mjs só liga as peças.

// O texto tem a menção ao bot (<@id> ou <@!id>). Conta só o que está escrito: quando alguém responde a
// uma mensagem da Helena, o Discord põe o bot em "mentions" mesmo sem a pessoa ter citado o nome.
export function mentionsBot(body, botId) {
    const id = String(botId ?? "").trim();

    if (!/^\d{5,25}$/.test(id)) {
        return false;
    }

    return new RegExp(`<@!?${id}>`).test(String(body ?? ""));
}

// Guarda quando cada criador foi saudado e só responde de novo depois da espera: uma enxurrada de
// menções não vira uma enxurrada de respostas, e entrar e sair do servidor não repete as boas-vindas.
export function createCreatorGreetings({
    isCreator = isOwner,
    now = Date.now,
    random = Math.random,
    replyCooldownMs = 30_000,
    welcomeCooldownMs = 10 * 60_000
} = {}) {
    const lastReply = new Map();
    const lastWelcome = new Map();

    const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

    // true se já passou a espera desta chave (e já a marca como usada agora)
    function due(map, key, waitMs) {
        const current = now();
        const last = map.get(key);

        if (last !== undefined && current - last < waitMs) {
            return false;
        }

        map.set(key, current);

        // a memória não cresce sem limite: o que já venceu sai
        if (map.size > 500) {
            for (const [oldKey, time] of map) {
                if (current - time >= waitMs) {
                    map.delete(oldKey);
                }
            }
        }

        return true;
    }

    return {
        // A mensagem de canal que menciona a Helena -> { body, replyTo } ou null.
        mentionReply(message, botId) {
            const author = message?.author;

            if (!author?.id || author.bot === true || message.webhookId) {
                return null;
            }

            if (!isCreator(author.id) || !mentionsBot(message.body, botId)) {
                return null;
            }

            if (!due(lastReply, String(author.id), replyCooldownMs)) {
                return null;
            }

            return { body: pick(MENTION_REPLIES), replyTo: String(message.id) };
        },

        // Alguém entrou no servidor -> { body } ou null.
        welcome({ guildId, user }) {
            if (!guildId || !user?.id || user.bot === true) {
                return null;
            }

            if (!isCreator(user.id)) {
                return null;
            }

            if (!due(lastWelcome, `${guildId}:${user.id}`, welcomeCooldownMs)) {
                return null;
            }

            return { body: pick(WELCOME_MESSAGES).replace("{user}", `<@${user.id}>`) };
        }
    };
}

const greetings = createCreatorGreetings();

// Responde à menção de um criador. Nunca lança erro: é um carinho, não pode atrapalhar o resto.
export async function greetMention({ message, botId, send, greeter = greetings }) {
    const reply = greeter.mentionReply(message, botId);

    if (!reply) {
        return false;
    }

    try {
        await send(message, reply);

        return true;

    } catch (error) {
        console.warn(`[CRIADORES] Não consegui responder à menção: ${error?.message ?? error}`);

        return false;
    }
}

// Dá boas-vindas a um criador que entrou (o GUILD_MEMBER_ADD do Discord). "channelsOf" diz onde tentar,
// e o primeiro canal que aceitar a mensagem encerra. Devolve o canal usado, ou null.
export async function welcomeCreator({ event, channelsOf, send, greeter = greetings }) {
    const guildId = event?.guild_id !== undefined && event?.guild_id !== null ? String(event.guild_id) : null;

    const welcome = greeter.welcome({ guildId, user: event?.user });

    if (!welcome) {
        return null;
    }

    let lastError = null;

    for (const channelId of channelsOf(guildId)) {
        try {
            await send({ channelId, guildId, user: event.user }, welcome);

            return channelId;

        } catch (error) {
            lastError = error;
        }
    }

    console.warn(
        `[CRIADORES] Não consegui dar as boas-vindas no servidor ${guildId}` +
        (lastError ? `: ${lastError.message ?? lastError}` : ": nenhum canal conhecido.")
    );

    return null;
}

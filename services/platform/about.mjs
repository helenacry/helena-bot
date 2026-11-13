import { blocked, isOwner, maintenance } from "./developer.mjs";

import { introText } from "../../config/about.mjs";

import { mentionsBot } from "./creators.mjs";

// ==========================================
// A HELENA SE APRESENTA
// ==========================================

// Alguém escreveu só "@Helena" num canal: ela responde com o cartão de apresentação (config/about.mjs).
// Só a menção sozinha conta. "@Helena me dá dinheiro" é conversa, e responder a quem aperta "responder" numa
// mensagem dela (o Discord põe o bot nas menções sem o nome estar no texto) seria insistência.
//
// Para não virar barulho:
//   - bot, webhook, quem está bloqueado e os criadores (que já têm a resposta carinhosa) não recebem;
//   - em manutenção ela fica quieta;
//   - cada canal e cada pessoa têm uma espera: uma enxurrada de menções não vira uma enxurrada de respostas.
//
// Como em services/platform/creators.mjs, as funções daqui não conhecem o Discord: quem envia é passado de
// fora ("send"), e o helena.mjs só liga as peças.

const ID = /^\d{5,25}$/;

// O texto é só a menção (<@id> ou <@!id>), com espaço antes ou depois.
export function isOnlyMention(body, botId) {
    const id = String(botId ?? "").trim();

    if (!ID.test(id)) {
        return false;
    }

    return mentionsBot(body, id) && new RegExp(`^\\s*<@!?${id}>\\s*$`).test(String(body ?? ""));
}

// Fica quieta para quem os comandos também ignoram.
function silentFor(authorId) {
    try {
        return isOwner(authorId) || Boolean(blocked(authorId)) || maintenance();

    } catch {
        // sem conseguir consultar o banco, o melhor é não falar
        return true;
    }
}

export function createIntroductions({
    silent = silentFor,
    now = Date.now,
    channelCooldownMs = 20_000,
    userCooldownMs = 60_000
} = {}) {
    const lastByChannel = new Map();
    const lastByUser = new Map();

    function sweep(map, waitMs, current) {
        if (map.size <= 500) {
            return;
        }

        for (const [key, time] of map) {
            if (current - time >= waitMs) {
                map.delete(key);
            }
        }
    }

    return {
        // A mensagem de canal -> { body, replyTo, suppressEmbeds } ou null. "prefix" é o prefixo dos comandos.
        reply(message, botId, prefix) {
            const author = message?.author;

            if (!author?.id || author.bot === true || message.webhookId || !message.guildId || !message.channelId) {
                return null;
            }

            if (!isOnlyMention(message.body, botId) || silent(String(author.id))) {
                return null;
            }

            const current = now();

            const channel = String(message.channelId);
            const user = String(author.id);

            // a espera só começa a contar quando ela de fato vai responder
            if (
                current - (lastByChannel.get(channel) ?? -Infinity) < channelCooldownMs ||
                current - (lastByUser.get(user) ?? -Infinity) < userCooldownMs
            ) {
                return null;
            }

            lastByChannel.set(channel, current);
            lastByUser.set(user, current);

            sweep(lastByChannel, channelCooldownMs, current);
            sweep(lastByUser, userCooldownMs, current);

            return {
                body: introText({ prefix }),
                replyTo: String(message.id),
                suppressEmbeds: true
            };
        }
    };
}

const introductions = createIntroductions();

// Responde à menção. Nunca lança erro: é um cumprimento, não pode atrapalhar o resto. Devolve true se respondeu.
export async function introduceSelf({ message, botId, prefix, send, introducer = introductions }) {
    const reply = introducer.reply(message, botId, prefix);

    if (!reply) {
        return false;
    }

    try {
        await send(message, reply);

        return true;

    } catch (error) {
        console.warn(`[APRESENTAÇÃO] Não consegui responder à menção: ${error?.message ?? error}`);

        return false;
    }
}

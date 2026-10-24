
import { DiscordApiError } from "./api.mjs";

import { toDiscordCallback, toDiscordMessage } from "./format.mjs";

import { LiveEditError } from "../platform/live-embed.mjs";

// ==========================================
// RESPONDER, EDITAR E ENVIAR
// ==========================================

// A ponte entre o que os comandos devolvem (formato da Helena) e o Discord: cada função traduz
// o formato (format.mjs) e chama a API (api.mjs). O helena.mjs só escolhe qual usar.

// As edições ao vivo (tempo da prisão, fuga, Gozofone) decidem o que fazer pelo status e pelo
// tempo de espera do erro: 404/403 desistem, 429 espera, o resto tenta de novo.
async function asLiveEdit(action) {
    try {
        return await action();

    } catch (error) {
        if (error instanceof DiscordApiError) {
            throw new LiveEditError(`[EDIÇÃO] HTTP ${error.status}`, {
                status: error.status ?? 0,
                retryAfterMs: error.retryAfterMs ?? 0
            });
        }

        throw error;
    }
}

export function createTransport(api, appId) {
    return {
        // O "post" que deliverCallback (v2-delivery.mjs) espera: recebe { type, data } e devolve
        // { ok, status, text() }, sem lançar. Assim, se o Discord recusar um layout V2, a mesma
        // resposta ainda sai de novo como embed.
        callbackFor: interaction => async response => {
            try {
                const { json, files } = toDiscordCallback(response);

                await api.respond(interaction.id, interaction.token, { json, files });

                return { ok: true, status: 204, text: async () => "" };

            } catch (error) {
                return {
                    ok: false,
                    status: error?.status ?? 0,
                    text: async () => String(error?.message ?? error)
                };
            }
        },

        // Edita a resposta original de um comando de barra (vale 15 minutos).
        editOriginal: (interaction, data) =>
            asLiveEdit(() => api.editOriginal(appId, interaction.token, toDiscordMessage(data, { update: true }))),

        // Edita uma mensagem que o bot mandou no canal (os comandos pelo prefixo h).
        editMessage: (target, messageId, data) =>
            asLiveEdit(() => api.edit(target.channelId, messageId, toDiscordMessage(data, { update: true }))),

        // Manda uma mensagem ao canal. Lança erro se o Discord recusar.
        send: (target, data) => {
            if (!target?.channelId) {
                throw new Error("Canal não identificado.");
            }

            return api.send(target.channelId, toDiscordMessage(data));
        }
    };
}

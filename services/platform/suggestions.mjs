import { blocked } from "./developer.mjs";

import { SUGGESTION_RULES } from "../../config/about.mjs";

import { safeText } from "./user-lookup.mjs";

// ==========================================
// SUGESTÕES PARA OS CRIADORES
// ==========================================

// O botão "Enviar sugestão" do /sobre abre um formulário; o texto vai para um canal do servidor de suporte
// (HELENA_CANAL_SUGESTOES). O bot NÃO guarda o texto: ele só passa adiante, e a política de privacidade diz isso.
//
// Regras: de 10 a 500 caracteres, uma por pessoa a cada 10 minutos (na memória: reiniciar o bot zera, e tudo bem),
// e quem está bloqueado não envia. Menções no texto não notificam ninguém (allowed_mentions vazio). Como em
// services/platform/about.mjs, quem fala com o Discord é passado de fora ("send").

export function createSuggestions({
    channelId = () => process.env.HELENA_CANAL_SUGESTOES ?? "",
    send = async () => false,
    now = Date.now,
    rules = SUGGESTION_RULES
} = {}) {
    const lastByUser = new Map();

    const channel = () => String(channelId() ?? "").trim();

    return {
        // O botão só aparece com o canal configurado.
        available() {
            return /^\d{5,25}$/.test(channel());
        },

        async submit({ userId, name, guildId, text }) {
            if (!this.available()) {
                return { status: "disabled" };
            }

            const body = String(text ?? "").replace(/\r\n/g, "\n").trim();

            const length = [...body].length;

            if (length < rules.min) {
                return { status: "short", min: rules.min };
            }

            if (length > rules.max) {
                return { status: "long", max: rules.max };
            }

            try {
                if (blocked(String(userId))) {
                    return { status: "blocked" };
                }

            } catch {
                return { status: "failed" };
            }

            const current = now();

            const last = lastByUser.get(String(userId));

            if (last !== undefined && current - last < rules.cooldownMs) {
                return { status: "wait", remainingMs: rules.cooldownMs - (current - last) };
            }

            const quoted = body.split("\n").map(line => `> ${line}`).join("\n");

            const message = [
                `💡 **Sugestão** de ${safeText(name || "Jogador")} (\`${userId}\`)`,
                `Servidor: \`${guildId ?? "?"}\``,
                quoted
            ].join("\n").slice(0, 1900);

            let sent = false;

            try {
                sent = await send(channel(), { content: message, allowed_mentions: { parse: [] } });

            } catch {
                sent = false;
            }

            if (!sent) {
                return { status: "failed" };
            }

            // a espera só começa a contar quando a sugestão de fato foi
            lastByUser.set(String(userId), current);

            if (lastByUser.size > 500) {
                for (const [key, time] of lastByUser) {
                    if (current - time >= rules.cooldownMs) lastByUser.delete(key);
                }
            }

            return { status: "ok" };
        }
    };
}

// O que o bot usa de verdade; o helena.mjs põe aqui a função que fala com o Discord.
let sender = async () => false;

export const suggestions = createSuggestions({ send: (channelId, payload) => sender(channelId, payload) });

export function setSuggestionSender(fn) {
    sender = typeof fn === "function" ? fn : async () => false;
}

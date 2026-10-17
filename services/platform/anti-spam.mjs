import { ANTI_SPAM } from "../../config/anti-spam.mjs";

import { isOwner } from "./developer.mjs";

// ==========================================
// INTERVALO ENTRE COMANDOS
// ==========================================

// Cada pessoa tem uma "hora de liberação": o instante em que o próximo
// comando passa. Um comando aceito marca agora + o intervalo. Tentativas
// barradas NÃO empurram essa hora: quem insiste não fica barrado para sempre.
//
// A conta é feita toda de uma vez, antes de qualquer espera (await), então dois
// comandos disparados no mesmo instante não passam os dois.

// A cada tantos comandos aceitos, esquece quem já foi liberado.
const SWEEP_EVERY = 500;

// HELENA_ANTI_SPAM=off (ou 0, false, no) desliga o intervalo. Padrão: ligado.
export function antiSpamEnabled(env = process.env) {
    const value = String(env.HELENA_ANTI_SPAM ?? "on").trim().toLowerCase();

    return !["off", "0", "false", "no"].includes(value);
}

export function createAntiSpam({
    cooldownMs,
    now = Date.now,
    exempt = () => false
}) {
    // quem -> instante (ms) em que o próximo comando é liberado
    const readyAt = new Map();

    // quem já recebeu o aviso nesta janela (o resto é ignorado em silêncio)
    const warned = new Set();

    let accepted = 0;

    function sweep(at) {
        for (const [who, ready] of readyAt) {
            if (ready <= at) {
                readyAt.delete(who);
                warned.delete(who);
            }
        }
    }

    return {
        // { allowed: true } ou
        // { allowed: false, remainingMs, firstWarning }: firstWarning é true só
        // na primeira tentativa barrada de cada janela, para o aviso não virar
        // spam também.
        check(userId) {
            const who = String(userId ?? "");

            if (!who || !(cooldownMs > 0) || exempt(who)) {
                return { allowed: true };
            }

            const at = now();
            const ready = readyAt.get(who);

            if (ready !== undefined && at < ready) {
                const firstWarning = !warned.has(who);

                warned.add(who);

                return { allowed: false, remainingMs: ready - at, firstWarning };
            }

            readyAt.set(who, at + cooldownMs);
            warned.delete(who);

            if (++accepted % SWEEP_EVERY === 0) {
                sweep(at);
            }

            return { allowed: true };
        },

        // quantas pessoas estão guardadas agora (para os testes)
        size() {
            return readyAt.size;
        },

        clear() {
            readyAt.clear();
            warned.clear();
        }
    };
}

// "⏳ Devagar! Espere mais 2s para usar outro comando."
export function antiSpamText(remainingMs) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));

    return `⏳ Devagar! Espere mais ${seconds}s para usar outro comando.`;
}

// Monta o intervalo do bot a partir da configuração e do ambiente. Os donos só
// ficam isentos se config/anti-spam.mjs mandar (exemptOwners).
export function buildCommandGate({
    env = process.env,
    owner = isOwner,
    exemptOwners = ANTI_SPAM.exemptOwners
} = {}) {
    return createAntiSpam({
        cooldownMs: antiSpamEnabled(env) ? ANTI_SPAM.commandCooldownSeconds * 1000 : 0,
        exempt: exemptOwners ? owner : () => false
    });
}

// O intervalo do bot: comandos de barra e prefixo h compartilham o mesmo.
export const commandGate = buildCommandGate();

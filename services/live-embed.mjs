
import { LIVE_CONFIG } from "../config/live.mjs";

// ==========================================
// ATUALIZAÇÃO AO VIVO DE MENSAGENS
// ==========================================

// Mantém uma mensagem já enviada sendo editada de tempos
// em tempos (por exemplo, a contagem regressiva da prisão).
//
// Quem chama informa:
//   key    - identifica a atualização; iniciar outra com a
//            mesma chave substitui a anterior
//   render - ({ stale }) => ({ payload, done }) ou null;
//            monta o conteúdo novo. stale = true na última
//            edição, quando o tempo de atualização acabou
//   edit   - (payload) => Promise; faz a edição na API e
//            lança LiveEditError se ela falhar
//   maxMs  - por quanto tempo atualizar

export class LiveEditError extends Error {
    constructor(message, { status = 0, retryAfterMs = 0 } = {}) {
        super(message);

        this.name = "LiveEditError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

// Mensagem apagada, sem permissão ou token vencido:
// continuar tentando não adianta.
const FATAL_STATUS = new Set([401, 403, 404, 410]);

const MAX_FAILURES = 3;

const active = new Map();

export function startLiveUpdate({
    key,
    render,
    edit,
    maxMs,
    intervalMs = LIVE_CONFIG.intervalMs
}) {
    // Só uma atualização por chave.
    stopLiveUpdate(key);

    if (active.size >= LIVE_CONFIG.maxActive) {
        console.warn(
            `[LIVE] Limite de ${LIVE_CONFIG.maxActive} ` +
            `atualizações simultâneas. ${key} ficará estático.`
        );

        return false;
    }

    const startedAt = Date.now();

    const state = {
        stopped: false,
        busy: false,
        failures: 0,
        resumeAt: 0,
        timer: null,
        stop() {
            if (state.stopped) {
                return;
            }

            state.stopped = true;

            clearInterval(state.timer);

            if (active.get(key) === state) {
                active.delete(key);
            }
        }
    };

    const tick = async () => {
        // Uma edição por vez, e respeita o pedido de espera
        // quando a API respondeu 429.
        if (
            state.stopped ||
            state.busy ||
            Date.now() < state.resumeAt
        ) {
            return;
        }

        state.busy = true;

        try {
            const expired = Date.now() - startedAt >= maxMs;

            const view = render({ stale: expired });

            if (!view) {
                state.stop();

                return;
            }

            await edit(view.payload);

            state.failures = 0;

            if (view.done || expired) {
                state.stop();
            }

        } catch (error) {
            const status = error?.status ?? 0;

            if (FATAL_STATUS.has(status)) {
                state.stop();

            } else if (status === 429) {
                state.resumeAt =
                    Date.now() +
                    Math.max(1_000, error.retryAfterMs || 5_000);

            } else if (++state.failures >= MAX_FAILURES) {
                console.warn(
                    `[LIVE] ${key} interrompido após ` +
                    `${MAX_FAILURES} falhas:`,
                    error?.message
                );

                state.stop();
            }

        } finally {
            state.busy = false;
        }
    };

    state.timer = setInterval(() => {
        void tick();
    }, intervalMs);

    // Não impede o processo de encerrar.
    state.timer.unref?.();

    active.set(key, state);

    return true;
}

export function stopLiveUpdate(key) {
    active.get(key)?.stop();
}

export function stopAllLiveUpdates() {
    for (const state of [...active.values()]) {
        state.stop();
    }
}

export function activeLiveUpdates() {
    return active.size;
}

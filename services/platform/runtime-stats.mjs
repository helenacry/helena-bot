// ==========================================
// NÚMEROS DE AGORA (o que só o processo do bot sabe)
// ==========================================

// Quantos servidores a Helena conhece hoje e desde quando está no ar. Quem sabe é o helena.mjs (a lista de servidores
// que o Discord manda), que registra uma função aqui; o /sobre só lê. Sem ninguém registrar (os testes, ou o bot
// subindo), os números vêm vazios em vez de inventados.

let source = null;

const startedAt = Date.now();

export function setRuntimeStats(fn) {
    source = typeof fn === "function" ? fn : null;
}

/** { servers, startedAt }: "servers" é null enquanto o bot não sabe. */
export function getRuntimeStats() {
    let servers = null;

    try {
        const value = source?.()?.servers;

        servers = Number.isSafeInteger(value) && value >= 0 ? value : null;

    } catch {
        servers = null;
    }

    return { servers, startedAt };
}

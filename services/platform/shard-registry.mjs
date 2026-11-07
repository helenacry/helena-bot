
// ==========================================
// FRAGMENTOS (SHARDS) EM USO
// ==========================================

// helena.mjs mantém este resumo em dia a cada READY, RESUMED e queda de conexão. O /ping, o status do
// bot e os contadores do servidor de suporte leem daqui, sem depender do gerente de fragmentos.
//
//   total   quantos fragmentos o bot usa (1 enquanto o Discord não exige mais)
//   ready   quantos estão conectados agora

let summary = { total: 1, ready: 0 };

export const shardSummary = () => ({ ...summary });

export function setShardSummary({ total = summary.total, ready = summary.ready } = {}) {
    summary = {
        total: Number.isInteger(total) && total >= 1 ? total : 1,
        ready: Number.isInteger(ready) && ready >= 0 ? ready : 0
    };

    summary.ready = Math.min(summary.ready, summary.total);
}

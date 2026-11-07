
// ==========================================
// SERVIDORES EM QUE A HELENA ESTÁ
// ==========================================

// O gateway (helena.mjs) mantém este conjunto em dia com os eventos
// READY, GUILD_CREATE e GUILD_DELETE. A API do site lê o mesmo conjunto
// para listar só os servidores em que a pessoa e a Helena estão juntas.
//
// É o próprio Set, compartilhado por referência: quem altera (o gateway)
// e quem lê (a API) enxergam sempre o mesmo estado.

export const guildIds = new Set();

export const knowsGuild = id => guildIds.has(String(id));

// Com mais de um fragmento (shard), cada conexão recebe os servidores dela. O READY de um
// fragmento refaz só os dele, sem apagar os dos outros, e por isso guardamos de quem é cada um.
const perShard = new Map();

// O READY de um fragmento: troca os servidores dele pelos novos. Devolve quantos são.
export function replaceShardGuilds(shardId, ids) {
    for (const old of perShard.get(shardId) ?? []) {
        guildIds.delete(old);
    }

    const own = new Set([...ids].map(String));

    for (const id of own) {
        guildIds.add(id);
    }

    perShard.set(shardId, own);

    return own.size;
}

// GUILD_CREATE
export function addShardGuild(shardId, id) {
    if (!perShard.has(shardId)) {
        perShard.set(shardId, new Set());
    }

    perShard.get(shardId).add(String(id));
    guildIds.add(String(id));
}

// GUILD_DELETE (de verdade: o bot saiu ou foi tirado do servidor)
export function removeShardGuild(shardId, id) {
    perShard.get(shardId)?.delete(String(id));
    guildIds.delete(String(id));
}

// quantos servidores cada fragmento tem: [[id do fragmento, quantos], ...]
export const guildsByShard = () => [...perShard.entries()].map(([id, set]) => [id, set.size]);

export function resetGuildRegistry() {
    guildIds.clear();
    perShard.clear();
}


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

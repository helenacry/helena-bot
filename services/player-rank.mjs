
import { db } from "../database/connection.mjs";

// ==========================================
// POSIÇÃO NO RANKING
// ==========================================

// A posição que aparece no cartão de perfil é a do ranking de patrimônio
// do /ranking: quem tem mais (carteira + banco) fica na frente; empate
// decide por XP, e o último desempate é o ID. Os critérios são os mesmos
// de commands/economy/ranking.mjs, então o número do cartão e o do ranking
// nunca divergem.
//
// Devolve null para quem ainda não tem registro no servidor.
export function getPlayerRank(guildId, userId) {
    const me = db.prepare(`
        SELECT wallet + bank AS value, xp
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    if (!me) {
        return null;
    }

    const { ahead } = db.prepare(`
        SELECT COUNT(*) AS ahead
        FROM players
        WHERE guild_id = ?
          AND (
                wallet + bank > ?
             OR (wallet + bank = ? AND xp > ?)
             OR (wallet + bank = ? AND xp = ? AND user_id < ?)
          )
    `).get(
        guildId,
        me.value,
        me.value, me.xp,
        me.value, me.xp, userId
    );

    return ahead + 1;
}

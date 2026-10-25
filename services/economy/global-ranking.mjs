
import { db } from "../../database/connection.mjs";

// ==========================================
// RANKING GLOBAL (TODOS OS SERVIDORES)
// ==========================================

// A tabela players guarda o progresso por servidor. O ranking global junta cada pessoa de todos os
// servidores em uma linha só:
//
//   xp      a soma do XP em todos os servidores (é o "Top XP" que a Helena mostra no status)
//   money   a soma de carteira e banco em todos os servidores
//   gems    as gemas, que já são da conta (valem em qualquer servidor)
//
// Cada linha vem como { user_id, value, xp }: "value" é o número da classificação e "xp" é o XP
// total (para o desempate e para mostrar o nível). A consulta só lê: não cria nem muda jogador.
// Em qualquer empate, quem tem mais XP fica na frente e, depois, o menor ID (que nunca se repete).

export const GLOBAL_TYPES = Object.freeze(["xp", "money", "gems"]);

export function globalRanking(type) {
    switch (type) {
        // O mesmo cálculo e a mesma ordem do getTopXP (services/platform/status-data.mjs): o
        // primeiro daqui é o nome que o status do bot mostra.
        case "xp":
            return db.prepare(`
                SELECT
                    user_id,
                    SUM(xp) AS value,
                    SUM(xp) AS xp
                FROM players
                GROUP BY user_id
                ORDER BY
                    value DESC,
                    user_id ASC
            `).all();

        case "money":
            return db.prepare(`
                SELECT
                    user_id,
                    SUM(wallet + bank) AS value,
                    SUM(xp) AS xp
                FROM players
                GROUP BY user_id
                ORDER BY
                    value DESC,
                    xp DESC,
                    user_id ASC
            `).all();

        case "gems":
            return db.prepare(`
                SELECT
                    p.user_id,
                    COALESCE(g.gems, 0) AS value,
                    SUM(p.xp) AS xp
                FROM players AS p
                LEFT JOIN global_users AS g
                    ON g.user_id = p.user_id
                GROUP BY p.user_id
                ORDER BY
                    value DESC,
                    xp DESC,
                    p.user_id ASC
            `).all();

        default:
            throw new Error("Tipo de ranking inválido.");
    }
}

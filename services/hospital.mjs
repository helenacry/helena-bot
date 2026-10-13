import { db } from "../database/connection.mjs";
import { status, tx, now } from "./combat.mjs";
import { getPlayer } from "../database/economy.mjs";
// Regras do hospital (a wiki lê estes valores): cada ponto de vida que falta
// custa isto, em centavos, e curar dá esta proteção contra duelos, em segundos.
export const HOSPITAL_RULES = Object.freeze({ maxHp: 100, costPerHp: 100, protectionSeconds: 600 });

export function heal(g, u) { return tx(() => { const s = status(g, u); if (s.hp >= HOSPITAL_RULES.maxHp) throw Error("Sua vida já está cheia."); getPlayer(g, u); const cost = (HOSPITAL_RULES.maxHp - s.hp) * HOSPITAL_RULES.costPerHp; const r = db.prepare("UPDATE players SET wallet=wallet-? WHERE guild_id=? AND user_id=? AND wallet>=?").run(cost, g, u, cost); if (!r.changes) throw Error("Carteira insuficiente."); db.prepare("UPDATE combat_players SET hp=?,protected_until=? WHERE guild_id=? AND user_id=?").run(HOSPITAL_RULES.maxHp, now() + HOSPITAL_RULES.protectionSeconds, g, u); return cost; }); }

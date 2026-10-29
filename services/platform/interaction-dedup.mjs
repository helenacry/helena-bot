import { db } from "../../database/connection.mjs";

// ==========================================
// A MESMA INTERAÇÃO NÃO RODA DUAS VEZES
// ==========================================

// Depois de uma reconexão do gateway o Discord pode entregar de novo um evento que o bot já tratou. Um
// comando de barra, um botão ou uma mensagem com "htransferir" rodando duas vezes pagaria duas vezes.
// Cada evento tem um identificador único: o primeiro que chega é registrado em processed_interactions
// e o repetido é descartado. O registro serve só para isso, então vence depressa.

// Quanto tempo um registro fica guardado, em segundos. O Discord só reentrega o que acabou de acontecer.
export const KEEP_SECONDS = 60 * 60;

// A limpeza roda a cada tantos eventos novos (e não a cada um), para não pesar.
const SWEEP_EVERY = 500;

let accepted = 0;

// true se é a primeira vez que este identificador aparece (ou se não há como saber: sem identificador,
// ou com o banco falhando, o evento segue como sempre; deixar de atender é pior que atender em dobro).
export function firstTimeSeen(id) {
    const key = String(id ?? "");

    if (!key) {
        return true;
    }

    try {
        const result = db.prepare(`
            INSERT OR IGNORE INTO processed_interactions (interaction_id)
            VALUES (?)
        `).run(key);

        if (++accepted % SWEEP_EVERY === 0) {
            sweep();
        }

        return result.changes === 1;

    } catch (error) {
        console.warn("[DEDUP] Não consegui registrar o evento:", error.message);

        return true;
    }
}

// Apaga o que passou de KEEP_SECONDS. Devolve quantos registros saíram.
export function sweep(now = Math.floor(Date.now() / 1000)) {
    return db.prepare(`
        DELETE FROM processed_interactions
        WHERE created_at <= ?
    `).run(now - KEEP_SECONDS).changes;
}

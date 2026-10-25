import { db } from "../../database/connection.mjs";

// ==========================================
// DATAS INFORMADAS PELA PRÓPRIA PESSOA
// ==========================================

// O Discord não entrega a bots desde quando alguém assina o Nitro nem desde quando impulsiona servidores
// (isso só vem no perfil completo, que bots não podem ler). Quem quiser o cartão com essas linhas informa
// as duas datas, que aparecem no perfil da própria pessoa em "Assinante desde" e na insígnia de impulso.
// A Helena não consegue conferir: o cartão marca "informado pela própria pessoa".

export const DECLARED_KINDS = Object.freeze(["nitro", "boost"]);

// Brasília, sem horário de verão (fixo em UTC-3): o que a pessoa digita é a hora dela.
const BRASILIA = 3 * 60 * 60 * 1000;

// O Discord começou em maio de 2015, e o Nitro em janeiro de 2017: nada antes disso faz sentido.
const EARLIEST = { nitro: Date.UTC(2017, 0, 1), boost: Date.UTC(2019, 5, 1) };

/**
 * Lê "dd/mm/aaaa" ou "dd/mm/aaaa hh:mm" (também com - ou .) como horário de Brasília.
 * Devolve { ok: true, time, exact } (exact: a pessoa deu a hora) ou { ok: false, reason }.
 */
export function parseDeclaredDate(text, kind, now = Date.now()) {
    const match = String(text ?? "")
        .trim()
        .match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,]+(\d{1,2})[:h](\d{2}))?$/);

    if (!match) {
        return { ok: false, reason: "Escreva a data assim: 07/03/2026 (ou 07/03/2026 09:18, se você sabe a hora)." };
    }

    const [, day, month, year, hour, minute] = match.map(part => (part === undefined ? undefined : Number(part)));

    const exact = hour !== undefined;

    // sem a hora, meio-dia: erra no máximo meio dia para os dois lados
    const clockHour = exact ? hour : 12;
    const clockMinute = exact ? minute : 0;

    if (month < 1 || month > 12 || day < 1 || clockHour > 23 || clockMinute > 59) {
        return { ok: false, reason: "Essa data não existe. Confira o dia, o mês e a hora." };
    }

    const time = Date.UTC(year, month - 1, day, clockHour, clockMinute) + BRASILIA;

    // dia 31 de fevereiro e afins: o JavaScript "vira" o mês, e aí a conta não fecha
    const check = new Date(time - BRASILIA);

    if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) {
        return { ok: false, reason: "Essa data não existe. Confira o dia e o mês." };
    }

    if (time > now) {
        return { ok: false, reason: "Essa data ainda não chegou." };
    }

    if (time < (EARLIEST[kind] ?? EARLIEST.nitro)) {
        return { ok: false, reason: kind === "boost" ? "Os impulsos de servidor só existem desde 2019." : "O Nitro só existe desde 2017." };
    }

    return { ok: true, time, exact };
}

/** { nitroSince, nitroExact, boostSince, boostExact } desta pessoa (null onde não informou). */
export function getDeclared(userId) {
    const row = db.prepare("SELECT * FROM userinfo_declared WHERE user_id = ?").get(String(userId));

    return {
        nitroSince: row?.nitro_since ?? null,
        nitroExact: Boolean(row?.nitro_exact),
        boostSince: row?.boost_since ?? null,
        boostExact: Boolean(row?.boost_exact)
    };
}

/** Guarda a data de "nitro" ou "boost". time null apaga só essa. */
export function setDeclared(userId, kind, time, exact = false, now = Date.now()) {
    if (!DECLARED_KINDS.includes(kind)) {
        throw new Error("tipo de data desconhecido");
    }

    const id = String(userId);

    db.prepare(`
        INSERT INTO userinfo_declared (user_id, updated_at) VALUES (?, ?)
        ON CONFLICT(user_id) DO NOTHING
    `).run(id, now);

    // o nome da coluna vem da lista fechada acima, nunca do que a pessoa digitou
    db.prepare(`
        UPDATE userinfo_declared
        SET ${kind}_since = ?, ${kind}_exact = ?, updated_at = ?
        WHERE user_id = ?
    `).run(time, exact ? 1 : 0, now, id);

    if (time === null) {
        db.prepare("DELETE FROM userinfo_declared WHERE user_id = ? AND nitro_since IS NULL AND boost_since IS NULL").run(id);
    }
}

/** Apaga as duas datas desta pessoa. Devolve quantas linhas saíram (0 ou 1). */
export function clearDeclared(userId) {
    return db.prepare("DELETE FROM userinfo_declared WHERE user_id = ?").run(String(userId)).changes;
}

/**
 * O usuário com as datas que ele mesmo informou: nitroSince, nitroSinceExact, declaredBoostSince e
 * declaredBoostSinceExact (só as que existem). Nunca lança.
 */
export function withDeclared(user) {
    try {
        if (!user?.id) {
            return user;
        }

        const declared = getDeclared(user.id);

        return {
            ...user,
            ...(declared.nitroSince ? { nitroSince: declared.nitroSince, nitroSinceExact: declared.nitroExact } : {}),
            ...(declared.boostSince ? { declaredBoostSince: declared.boostSince, declaredBoostSinceExact: declared.boostExact } : {})
        };

    } catch {
        return user;
    }
}

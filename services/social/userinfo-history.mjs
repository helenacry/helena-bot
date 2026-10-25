import { db } from "../../database/connection.mjs";

// ==========================================
// HISTÓRICO DO /USERINFO
// ==========================================

// "Nomes anteriores", "Ícones antigos" e "Banners antigos" do menu Mais informações. O Discord não
// guarda isso para ninguém, então a Helena só tem o que viu ela mesma, e só de quem usa a Helena:
//
//   - o que entra: o @usuário, o nome de exibição e o código (hash) da foto e do banner, todos públicos
//     no Discord. Nunca mensagens, calls, servidores nem a imagem em si;
//   - quando entra: a pessoa usa um comando (ou outra pessoa consulta o /userinfo dela) e o valor mudou
//     desde a última vez. O histórico começa no primeiro uso, nunca antes;
//   - quanto fica: os últimos MAX_PER_KIND de cada tipo, e a pessoa pode ocultar ou apagar tudo em
//     "Meu histórico" (o menu do próprio /userinfo; userinfo-privacy.mjs).

export const MAX_PER_KIND = 25;

const MAX_TEXT = 100;

// O que cada observação guardou na última vez neste processo, para não ir ao banco em cada clique.
const lastSeen = new Map();

const MAX_CACHE = 2000;

const clean = (value, max = MAX_TEXT) => String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

// ------------------------------------------------------------------ privacidade

export function isHidden(userId) {
    const row = db.prepare("SELECT hidden FROM userinfo_privacy WHERE user_id = ?").get(String(userId));

    return Boolean(row?.hidden);
}

export function setHidden(userId, hidden, time = Date.now()) {
    db.prepare(`
        INSERT INTO userinfo_privacy (user_id, hidden, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET hidden = excluded.hidden, updated_at = excluded.updated_at
    `).run(String(userId), hidden ? 1 : 0, time);

    lastSeen.delete(String(userId));
}

/** Apaga tudo o que a Helena guardou desta pessoa neste histórico. Devolve quantas linhas saíram. */
export function clearHistory(userId) {
    lastSeen.delete(String(userId));

    return db.prepare("DELETE FROM userinfo_history WHERE user_id = ?").run(String(userId)).changes;
}

// Quem já usou a Helena (tem nome salvo): só dessas pessoas a Helena guarda o histórico.
export function isTracked(userId) {
    return Boolean(db.prepare("SELECT 1 FROM player_names WHERE user_id = ?").get(String(userId)));
}

// ------------------------------------------------------------------ gravar

// Os valores desta pessoa que valem guardar agora: { kind: texto }.
function valuesOf(user) {
    const values = {};

    const username = clean(user.username, 64);

    if (username) values.username = username;

    // o nome de exibição só conta quando a pessoa escolheu um (senão ele é o próprio @usuário)
    const display = clean(user.displayName, 80);

    if (display && display !== username) values.display = display;

    if (typeof user.avatarHash === "string" && user.avatarHash) values.avatar = clean(user.avatarHash, 64);

    // o banner só vem no perfil completo da conta: sem ele carregado, não dá para dizer que não tem
    if (user.accountLoaded === true && typeof user.bannerHash === "string" && user.bannerHash) {
        values.banner = clean(user.bannerHash, 64);
    }

    return values;
}

/**
 * Anota o que mudou nesta pessoa desde a última vez. Devolve quantos valores novos entraram. Nunca
 * lança: o histórico é um extra e não pode derrubar um comando.
 */
export function observe(user, { time = Date.now() } = {}) {
    try {
        if (!user?.id || user.bot) {
            return 0;
        }

        const userId = String(user.id);

        const values = valuesOf(user);

        const key = JSON.stringify(values);

        if (lastSeen.get(userId) === key) {
            return 0;
        }

        if (isHidden(userId)) {
            return 0;
        }

        let added = 0;

        for (const [kind, value] of Object.entries(values)) {
            const last = db.prepare(`
                SELECT value
                FROM userinfo_history
                WHERE user_id = ? AND kind = ?
                ORDER BY id DESC
                LIMIT 1
            `).get(userId, kind);

            if (last?.value === value) {
                continue;
            }

            db.prepare("INSERT INTO userinfo_history (user_id, kind, value, seen_at) VALUES (?, ?, ?, ?)").run(userId, kind, value, time);

            db.prepare(`
                DELETE FROM userinfo_history
                WHERE user_id = ? AND kind = ?
                  AND id NOT IN (
                      SELECT id FROM userinfo_history WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT ?
                  )
            `).run(userId, kind, userId, kind, MAX_PER_KIND);

            added += 1;
        }

        lastSeen.set(userId, key);

        if (lastSeen.size > MAX_CACHE) {
            lastSeen.delete(lastSeen.keys().next().value);
        }

        return added;

    } catch (error) {
        console.warn("[USERINFO] Não consegui anotar o histórico:", error.message);

        return 0;
    }
}

/** Anota quem foi consultado, só se ela já usa a Helena (a Helena não começa histórico de quem nunca a usou). */
export function observeTarget(user, options) {
    try {
        return user?.id && isTracked(user.id) ? observe(user, options) : 0;

    } catch {
        return 0;
    }
}

// ------------------------------------------------------------------ ler

/**
 * O histórico de uma pessoa para as telas:
 *   hidden    ela pediu para ocultar (nada é mostrado)
 *   tracked   ela usa a Helena (senão não há histórico nenhum)
 *   since     o primeiro instante em que a Helena a viu (ms), ou null
 *   usernames, displays, avatars, banners   [{ value, at }], o mais novo primeiro (o primeiro é o de agora)
 */
export function readHistory(userId) {
    const id = String(userId);

    if (isHidden(id)) {
        return { hidden: true, tracked: true, since: null, usernames: [], displays: [], avatars: [], banners: [] };
    }

    const rows = db.prepare(`
        SELECT kind, value, seen_at AS at
        FROM userinfo_history
        WHERE user_id = ?
        ORDER BY id DESC
    `).all(id);

    const of = kind => rows.filter(row => row.kind === kind).map(({ value, at }) => ({ value, at }));

    return {
        hidden: false,
        tracked: isTracked(id),
        since: rows.length ? Math.min(...rows.map(row => row.at)) : null,
        usernames: of("username"),
        displays: of("display"),
        avatars: of("avatar"),
        banners: of("banner")
    };
}

/** Quantas linhas a Helena guarda desta pessoa (a tela de privacidade mostra o número). */
export function countHistory(userId) {
    return db.prepare("SELECT COUNT(*) AS total FROM userinfo_history WHERE user_id = ?").get(String(userId)).total;
}

// Só para os testes: esquece o que o processo lembrava.
export function resetHistoryMemory() {
    lastSeen.clear();
}

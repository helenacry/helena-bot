
import { db } from "../../database/connection.mjs";

import { parseUserReference } from "../../utils/ids.mjs";

// ==========================================
// BUSCA DE USUÁRIOS DO SERVIDOR
// ==========================================

// Encontra uma pessoa do servidor por menção (<@id>), ID ou
// nome, sem exigir menção. A API da VSync não tem rota de
// busca por nome, então a lista de membros do servidor é
// baixada (GET /guilds/:g) e a busca é feita aqui, com cache
// curto para não repetir a chamada a cada comando. Se a API
// falhar, a busca usa os nomes que a Helena já conhece.

const API = "https://api.vsync.lat";

// Por quanto tempo a lista de membros de um servidor é reutilizada.
const CACHE_MS = 60_000;

// Quantos nomes aparecem quando há mais de uma pessoa parecida.
const MAX_CANDIDATES = 5;

// Mínimo de letras para buscar "contém" (evita casar "a" com todos).
const MIN_PARTIAL = 2;

const cache = new Map();

export function clearUserLookupCache() {
    cache.clear();
}

// ==========================================
// API
// ==========================================

function botHeaders() {
    const token = process.env.VSYNC_BOT_TOKEN;

    if (!token) {
        throw new Error("VSYNC_BOT_TOKEN não configurado.");
    }

    return { Authorization: `Bot ${token}` };
}

// null quando a API responde 404; erro nos demais casos.
async function apiGet(path) {
    const response = await fetch(`${API}${path}`, {
        headers: botHeaders()
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} em ${path}`);
    }

    return response.json();
}

// "raw" guarda o membro como a API devolveu (insígnias, Pulse,
// Prisma+, datas...), para comandos como /userinfo mostrarem mais
// que o nome sem chamar a API de novo.
function toUser(member) {
    return {
        id: String(member.id),
        username: String(member.username ?? ""),
        displayName: String(member.displayName ?? ""),
        nickname: String(member.nickname ?? ""),
        avatarUrl: member.avatarUrl ?? null,
        bot: Boolean(member.bot),
        raw: member
    };
}

// Nome mostrado para a pessoa: apelido no servidor, senão o
// nome de exibição, senão o usuário.
export function shownName(user) {
    return (
        user.nickname ||
        user.displayName ||
        user.username ||
        "Jogador"
    );
}

async function fetchMember(guildId, userId) {
    const data = await apiGet(
        `/guilds/${encodeURIComponent(guildId)}` +
        `/members/${encodeURIComponent(userId)}`
    );

    return data?.member ? toUser(data.member) : null;
}

async function loadMembers(guildId) {
    const cached = cache.get(guildId);

    if (cached && Date.now() - cached.at < CACHE_MS) {
        return cached.users;
    }

    const data = await apiGet(
        `/guilds/${encodeURIComponent(guildId)}`
    );

    const list = data?.members ?? data?.guild?.members;

    if (!Array.isArray(list)) {
        throw new Error("A API não devolveu a lista de membros.");
    }

    const users = list.map(toUser);

    cache.set(guildId, { at: Date.now(), users });

    return users;
}

// Pessoas que a Helena já viu neste servidor (jogadores com
// nome salvo). Usado quando a API não responde.
function knownUsers(guildId) {
    return db.prepare(`
        SELECT p.user_id AS id, n.display_name AS name
        FROM players p
        JOIN player_names n ON n.user_id = p.user_id
        WHERE p.guild_id = ?
    `).all(guildId).map(row => toUser({
        id: row.id,
        displayName: row.name
    }));
}

// ==========================================
// BUSCA POR NOME
// ==========================================

// Minúsculas, sem acento, sem "@" no começo e com espaços
// simples: "  @José   Silva " -> "jose silva".
export function normalizeName(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .trim()
        .replace(/^@+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Devolve só as pessoas do melhor grau de correspondência:
// nome igual > começa com > contém. Compara apelido, nome de
// exibição e usuário.
export function searchUsers(users, query) {
    const wanted = normalizeName(query);

    if (!wanted) {
        return [];
    }

    let best = Infinity;

    const ranked = [];

    for (const user of users) {
        const names = [
            user.nickname,
            user.displayName,
            user.username
        ].map(normalizeName).filter(Boolean);

        let rank = Infinity;

        for (const name of names) {
            if (name === wanted) {
                rank = Math.min(rank, 1);

            } else if (name.startsWith(wanted)) {
                rank = Math.min(rank, 2);

            } else if (
                wanted.length >= MIN_PARTIAL &&
                name.includes(wanted)
            ) {
                rank = Math.min(rank, 3);
            }
        }

        if (rank < Infinity) {
            ranked.push({ user, rank });

            best = Math.min(best, rank);
        }
    }

    return ranked
        .filter(item => item.rank === best)
        .map(item => item.user);
}

// Só o @usuário, exato (sem diferenciar maiúsculas nem o "@" do
// começo). O nome de usuário é único, então não há ambiguidade.
export function searchByUsername(users, query) {
    const wanted = normalizeName(query);

    if (!wanted) {
        return [];
    }

    return users.filter(
        user => normalizeName(user.username) === wanted
    );
}

// ==========================================
// MENSAGENS
// ==========================================

// Texto digitado pelo usuário, seguro para voltar numa mensagem:
// sem formatação, menções ou quebras de linha, e com tamanho limitado.
export function safeText(text) {
    return String(text ?? "")
        .replace(/[*_`~|<>@\\\r\n]/g, "")
        .trim()
        .slice(0, 40);
}

// Quando a busca não terminou em uma pessoa, devolve o título e o
// texto do aviso para o usuário; quando achou, devolve null.
export function lookupProblem(result, query, { by = "any" } = {}) {
    if (result.status === "not_found") {
        return {
            title: "Usuário não encontrado",
            message: by === "username"
                ? "Não encontrei ninguém com o @usuário **" +
                  safeText(query) + "** neste servidor.\n\n" +
                  "Use o @usuário exato (o nome de usuário, não o " +
                  "apelido) ou mencione a pessoa."
                : "Não encontrei ninguém com **" + safeText(query) +
                  "** neste servidor.\n\n" +
                  "Tente o nome de exibição ou o @usuário, " +
                  "ou mencione a pessoa."
        };
    }

    if (result.status === "ambiguous") {
        const list = result.candidates
            .map(user =>
                "• " + safeText(shownName(user)) +
                (
                    user.username
                        ? " (@" + safeText(user.username) + ")"
                        : ""
                )
            )
            .join("\n");

        return {
            title: "Mais de um usuário encontrado",
            message:
                "Vários usuários combinam com **" +
                safeText(query) + "**:\n\n" + list +
                (
                    result.total > result.candidates.length
                        ? "\n… e mais " +
                          (result.total - result.candidates.length)
                        : ""
                ) +
                "\n\nSeja mais específico ou mencione a pessoa."
        };
    }

    return null;
}

// ==========================================
// RESOLVER
// ==========================================

// Resultado:
//   { status: "found", user }
//   { status: "ambiguous", candidates, total }
//   { status: "not_found", query }
//
// by: "any" (padrão) compara apelido, nome de exibição e @usuário;
//     "username" só aceita o @usuário exato (que é único) ou uma
//     menção/ID, sem olhar apelidos nem nomes de exibição.
export async function resolveUser(
    guildId,
    text,
    { by = "any" } = {}
) {
    const query = String(text ?? "").trim();

    const id = parseUserReference(query);

    // Menção ou ID.
    if (id) {
        try {
            const user = await fetchMember(guildId, id);

            return user
                ? { status: "found", user }
                : { status: "not_found", query };

        } catch (error) {
            console.warn(
                "[BUSCA DE USUÁRIO] API indisponível, usando " +
                "nomes conhecidos:",
                error.message
            );

            const known = knownUsers(guildId)
                .find(user => user.id === id);

            return known
                ? { status: "found", user: known }
                : { status: "not_found", query };
        }
    }

    // Nome.
    let users;

    try {
        users = await loadMembers(guildId);

    } catch (error) {
        console.warn(
            "[BUSCA DE USUÁRIO] API indisponível, usando " +
            "nomes conhecidos:",
            error.message
        );

        users = knownUsers(guildId);
    }

    const matches = by === "username"
        ? searchByUsername(users, query)
        : searchUsers(users, query);

    if (matches.length === 0) {
        return { status: "not_found", query };
    }

    if (matches.length === 1) {
        return { status: "found", user: matches[0] };
    }

    return {
        status: "ambiguous",
        candidates: matches.slice(0, MAX_CANDIDATES),
        total: matches.length
    };
}

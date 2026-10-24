
import { db } from "../../database/connection.mjs";

import { parseUserReference } from "../../utils/ids.mjs";

import { discordApi } from "../discord/api.mjs";

import { normalizeMember, normalizeUser } from "../discord/normalize.mjs";

// ==========================================
// BUSCA DE USUÁRIOS DO SERVIDOR
// ==========================================

// Encontra uma pessoa do servidor por menção (<@id>), ID ou nome, sem exigir menção.
// O Discord não entrega a lista de membros de um servidor (isso exige a intenção privilegiada
// GUILD_MEMBERS), então o nome é procurado na rota de pesquisa de membros, que acha quem tem
// o @usuário ou o apelido começando pelo texto. O resultado passa pelo mesmo ranking de antes
// e fica numa memória curta para não repetir a chamada a cada comando. Se a API falhar, a
// busca usa os nomes que a Helena já conhece.

// Por quanto tempo o resultado de uma pesquisa é reutilizado.
const CACHE_MS = 60_000;

// Quantos nomes aparecem quando há mais de uma pessoa parecida.
const MAX_CANDIDATES = 5;

// Quantos membros a pesquisa pede ao Discord (o máximo da rota é 1000).
const SEARCH_LIMIT = 25;

// Mínimo de letras para buscar "contém" (evita casar "a" com todos).
const MIN_PARTIAL = 2;

const cache = new Map();

export function clearUserLookupCache() {
    cache.clear();
}

// ==========================================
// API
// ==========================================

// Um membro do Discord ({ user, nick, roles, ... }) no formato da Helena. "raw" guarda o
// membro como a API devolveu, para comandos como /userinfo mostrarem mais que o nome sem
// chamar a API de novo.
function toUser(member) {
    const user = normalizeUser(member?.user, member);

    if (!user) {
        return null;
    }

    return { ...user, ...normalizeMember(member), raw: member };
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

// null quando o Discord diz que a pessoa não está no servidor (404).
async function fetchMember(guildId, userId) {
    try {
        return toUser(await discordApi().member(guildId, userId));

    } catch (error) {
        if (error?.status === 404) {
            return null;
        }

        throw error;
    }
}

// O perfil público da conta (GET /users/:id). null se o Discord não conhece a conta.
export async function fetchAccount(userId) {
    try {
        return await discordApi().user(userId);

    } catch (error) {
        if (error?.status === 404) {
            return null;
        }

        throw error;
    }
}

async function loadMembers(guildId, query) {
    const key = `${guildId}|${String(query).toLowerCase()}`;

    const cached = cache.get(key);

    if (cached && Date.now() - cached.at < CACHE_MS) {
        return cached.users;
    }

    const list = await discordApi().searchMembers(guildId, String(query).replace(/^@+/, "").slice(0, 100), SEARCH_LIMIT);

    if (!Array.isArray(list)) {
        throw new Error("A API não devolveu a lista de membros.");
    }

    const users = list.map(toUser).filter(Boolean);

    cache.set(key, { at: Date.now(), users });

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
    `).all(guildId).map(row => ({
        id: String(row.id),
        username: "",
        displayName: String(row.name ?? ""),
        nickname: "",
        avatarUrl: null,
        bot: false,
        raw: null
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
        users = await loadMembers(guildId, query);

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

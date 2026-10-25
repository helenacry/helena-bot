
import { ICONS, ICON_PREFIX, fallbacksOf } from "../../config/icons.mjs";

// ==========================================
// EMOJIS DO APLICATIVO
// ==========================================

// A Helena guarda os emojis dela no próprio aplicativo (config/icons.mjs). Na subida o bot lê a
// lista (GET /applications/:id/emojis) e passa a escrever "<:h_tag:123>" no lugar de "🏷️". Sem a
// lista (teste, falha da API, emoji ainda não enviado) tudo segue com o emoji comum.
//
//   icon("🏷️")        o emoji de UM lugar do código: o da Helena se existe, senão o comum
//   customize(texto)   o mesmo para todo emoji de um texto: é o que o envio da mensagem usa

// o emoji comum (sem o seletor de variação) -> "<:h_nome:id>"
const custom = new Map();

// A expressão que acha qualquer um dos emojis comuns que têm desenho no aplicativo (os mais
// compridos primeiro: a família 👨‍👩‍👧 antes de qualquer pedaço dela).
let pattern = null;

// "🏷️" e "🏷" são o mesmo emoji: a chave ignora o seletor de variação.
const keyOf = emoji => String(emoji).replace(/️/g, "");

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** O emoji da Helena no lugar do comum, se ele existe: icon("🏷️") -> "<:h_tag:123>" ou "🏷️". */
export function icon(fallback) {
    return custom.get(keyOf(fallback)) ?? fallback;
}

/**
 * Troca, num texto, cada emoji comum que tem desenho no aplicativo pelo da Helena. Só para texto
 * que aceita emoji personalizado (título, descrição e campos do embed, texto do layout V2, corpo da
 * mensagem): nome do autor, rodapé, rótulos e textos de menu mostrariam o código cru.
 */
export function customize(text) {
    if (!pattern || typeof text !== "string" || !text) {
        return text;
    }

    return text.replace(pattern, match => custom.get(keyOf(match)) ?? match);
}

/** Guarda os emojis do aplicativo (o que a API devolve: { id, name, animated }). Devolve quantos desenhos casaram. */
export function setAppEmojis(items) {
    custom.clear();

    const byName = new Map((items ?? []).map(item => [item.name, item]));

    let matched = 0;

    for (const name of Object.keys(ICONS)) {
        const found = byName.get(ICON_PREFIX + name);

        if (!found?.id) {
            continue;
        }

        matched += 1;

        for (const fallback of fallbacksOf(name)) {
            custom.set(keyOf(fallback), `<${found.animated ? "a" : ""}:${found.name}:${found.id}>`);
        }
    }

    const keys = [...custom.keys()].sort((a, b) => b.length - a.length).map(escape);

    pattern = keys.length ? new RegExp(`(?:${keys.join("|")})\\uFE0F?`, "gu") : null;

    return matched;
}

/** Lê os emojis do aplicativo na API e guarda. Nunca derruba o bot: sem lista, ficam os emojis comuns. */
export async function loadAppEmojis(api, appId, log = console) {
    try {
        const response = await api.appEmojis(appId);

        const found = setAppEmojis(response?.items ?? []);

        log.log(`[EMOJIS] ${found} de ${Object.keys(ICONS).length} emojis da Helena no aplicativo.`);

        return found;

    } catch (error) {
        log.warn?.(`[EMOJIS] Não deu para ler os emojis do aplicativo (${error.message}); ficam os emojis comuns.`);

        return 0;
    }
}


import { ICONS, ICON_PREFIX } from "../../config/icons.mjs";

// ==========================================
// EMOJIS DO APLICATIVO
// ==========================================

// A Helena guarda os emojis dela no próprio aplicativo (config/icons.mjs). Na subida o bot lê a
// lista (GET /applications/:id/emojis) e passa a escrever "<:h_tag:123>" no lugar de "🏷️". Sem a
// lista (teste, falha da API, emoji ainda não enviado) a função devolve o emoji comum.

// o emoji comum (sem o seletor de variação) -> "<:h_nome:id>"
const custom = new Map();

// "🏷️" e "🏷" são o mesmo emoji: a chave ignora o seletor de variação.
const keyOf = emoji => String(emoji).replace(/️/g, "");

/** O emoji da Helena no lugar do comum, se ele existe: icon("🏷️") -> "<:h_tag:123>" ou "🏷️". */
export function icon(fallback) {
    return custom.get(keyOf(fallback)) ?? fallback;
}

/** Guarda os emojis do aplicativo (o que a API devolve: { id, name, animated }). Devolve quantos casaram. */
export function setAppEmojis(items) {
    custom.clear();

    const byName = new Map((items ?? []).map(item => [item.name, item]));

    for (const [name, fallback] of Object.entries(ICONS)) {
        const found = byName.get(ICON_PREFIX + name);

        if (found?.id) {
            custom.set(keyOf(fallback), `<${found.animated ? "a" : ""}:${found.name}:${found.id}>`);
        }
    }

    return custom.size;
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

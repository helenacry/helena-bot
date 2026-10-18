// ==========================================
// ENDEREÇO DO SITE DA HELENA
// ==========================================

// O endereço público do site (GitHub Pages). É o único lugar do bot que sabe
// dele: a central de ajuda (a wiki) e a atividade do bot ("Online | site: ...")
// leem daqui. Quando o domínio próprio entrar no ar (helena.is-a.bot), troque
// só esta linha.
//
// O site em si tem o seu próprio config em site/js/config.js (roda no navegador).
export const SITE_URL = "https://helenacry.github.io/helena-bot/";

// O endereço público da API do bot (Discloud, atrás da Cloudflare). O bot o usa para montar o
// endereço das imagens que a própria API serve (services/web/avatar-preview.mjs). Dá para trocar
// por HELENA_API_URL sem mexer no código.
export const API_URL = String(process.env.HELENA_API_URL || "https://helena.discloud.dev")
    .trim()
    .replace(/\/+$/, "");

// Onde fica a wiki.
export const WIKI_URL = `${SITE_URL}wiki/`;

// Como o endereço aparece em textos curtos, como a atividade do bot:
// sem "https://" e sem a barra do fim.
export const SITE_LABEL = SITE_URL
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

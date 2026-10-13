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

// Onde fica a wiki.
export const WIKI_URL = `${SITE_URL}wiki/`;

// Como o endereço aparece em textos curtos, como a atividade do bot:
// sem "https://" e sem a barra do fim.
export const SITE_LABEL = SITE_URL
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

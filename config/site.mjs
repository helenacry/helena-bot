// ==========================================
// ENDEREÇO DO SITE DA HELENA
// ==========================================

// O endereço público do site. É o único lugar do bot que sabe dele: a central de ajuda (a wiki, os
// links do menu e o botão do daily) e a atividade do bot ("Online | site: ...") leem daqui.
//
// O site é servido pelo próprio bot, no domínio que o Discloud dá ao app (helena.discloud.dev), na
// raiz: o servidor HTTP do bot entrega a pasta site-dist/ (o site montado, que vai no zip) e fica com a
// API em /api. Para usar um domínio seu apontado para o Discloud, troque só esta linha (e veja
// docs/hosting-discloud.md).
//
// O site em si (projeto Astro) lê este arquivo no build, em site/astro.config.mjs, e tem os links e
// as chaves públicas em site/src/config.ts.
export const SITE_URL = "https://helena.discloud.dev/";

// Onde fica a wiki.
export const WIKI_URL = `${SITE_URL}wiki/`;

// Como o endereço aparece em textos curtos, como a atividade do bot:
// sem "https://" e sem a barra do fim.
export const SITE_LABEL = SITE_URL
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

// O convite permanente do servidor oficial da Helena no Discord. O menu de ajuda leva um botão para
// ele. O site tem o mesmo link em site/src/config.ts (supportUrl): tests/site.test.mjs confere que os
// dois são iguais.
export const SUPPORT_URL = "https://discord.gg/NDBwQW99RZ";

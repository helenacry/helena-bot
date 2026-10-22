// Site da Helena: Astro (saída 100% estática) + Preact só nas ilhas que precisam
// de interação. O endereço público vem de config/site.mjs, o mesmo lugar de onde
// o bot lê o link do site; trocar para helena.is-a.bot é mudar uma linha lá.
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";

import { SITE_URL } from "../config/site.mjs";

const url = new URL(SITE_URL);

export default defineConfig({
  site: url.origin,
  // "/helena-bot" no GitHub Pages; "/" quando o domínio próprio entrar.
  base: url.pathname.replace(/\/+$/, "") || "/",
  trailingSlash: "always",
  // "true" mantém um espaço entre elementos em linha (no Astro 7 o padrão "jsx"
  // apagaria o espaço entre <span>s e juntaria as palavras do título).
  compressHTML: true,
  build: { format: "directory", assets: "assets" },
  integrations: [
    preact(),
    sitemap({ filter: page => !page.includes("/account/") })
  ],
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  vite: {
    // config/site.mjs fica fora de site/.
    server: { fs: { allow: [".."] } }
  }
});

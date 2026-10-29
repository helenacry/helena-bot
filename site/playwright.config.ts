// Testes de navegador do site: acessibilidade (axe), sem rolagem lateral, sem
// requisições a terceiros, a política de conteúdo (CSP) e os fluxos principais. Rodam contra o
// build (dist/), servido pelo MESMO servidor de arquivos do bot (scripts/serve-dist.mjs), e usam o
// Edge instalado (sem baixar navegador):
//
//   npm --prefix site run build && npm --prefix site run test:e2e
//
// Em CI (Ubuntu) use PLAYWRIGHT_CHANNEL=chromium depois de `npx playwright install chromium`.
import { defineConfig } from "@playwright/test";

import { SITE_URL } from "../config/site.mjs";

const base = new URL(SITE_URL).pathname.replace(/\/+$/, "");
const port = 4322;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    // com a barra no fim: sem ela, o Playwright troca o último trecho do caminho
    baseURL: `http://127.0.0.1:${port}${base}/`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
    // O Edge sem janela diz "reduzir movimento" nesta máquina; os testes pedem o normal.
    reducedMotion: "no-preference",
    locale: "pt-BR"
  },
  webServer: {
    // o servidor de arquivos do bot (com a CSP), não o `astro preview`: veja scripts/serve-dist.mjs
    command: `node scripts/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}${base}/`,
    reuseExistingServer: true,
    timeout: 60_000
  }
});

// Qualidade de todas as páginas: axe (WCAG 2.2 AA), rolagem lateral, terceiros e erros no console.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { wiki } from "../../src/lib/wiki.ts";

const WIKI_SAMPLE = ["", "crime/robbery/", "economy/market/", "help/commands/", "character/profile/"];

const routes: { name: string; path: string }[] = [
  { name: "início", path: "/" },
  { name: "wiki (início)", path: "/wiki/" },
  ...WIKI_SAMPLE.filter(Boolean).map(slug => ({ name: `wiki ${slug}`, path: `/wiki/${slug}` })),
  { name: "painel da conta", path: "/account/" },
  { name: "termos", path: "/terms/" },
  { name: "privacidade", path: "/privacy/" },
  { name: "404", path: "/404/" }
];

const viewports = [
  { name: "celular 360", width: 360, height: 740 },
  { name: "tablet 768", width: 768, height: 1024 },
  { name: "computador 1440", width: 1440, height: 900 }
] as const;

const themes = ["light", "dark"] as const;

async function open(page: Page, path: string, theme: (typeof themes)[number]) {
  await page.addInitScript(value => {
    try { localStorage.setItem("helena-theme", value); } catch { /* sem armazenamento */ }
  }, theme);

  const problems: string[] = [];
  const foreign: string[] = [];

  page.on("console", message => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", error => problems.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol.startsWith("http")) foreign.push(request.url());
  });

  await page.goto(path.slice(1), { waitUntil: "networkidle" });

  return { problems, foreign };
}

// O axe lê as cores no instante da análise; uma animação de entrada pela metade engana a
// medida. Aqui a página roda no modo "reduzir movimento", que também é um modo real de uso.
test.use({ reducedMotion: "reduce" });

test.describe("qualidade das páginas", () => {
  for (const route of routes) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        test(`${route.name} · ${viewport.name} · ${theme}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const { problems, foreign } = await open(page, route.path, theme);

          // 1. acessibilidade
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();

          const serious = result.violations.filter(v => v.impact === "serious" || v.impact === "critical" || v.impact === "moderate");

          expect(
            serious.map(v => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`),
            "violações de acessibilidade"
          ).toEqual([]);

          // 2. nada de rolagem lateral
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, "a página rola de lado").toBeLessThanOrEqual(0);

          // 2b. nada passa da margem direita sem estar dentro de uma caixa que rola de propósito.
          // (O body usa overflow-x: clip, que esconde o estouro em vez de mostrá-lo: só olhar o
          // scrollWidth não pega coluna que vaza e fica cortada.)
          const leaking = await page.evaluate(() => {
            const limit = document.documentElement.clientWidth + 1;
            const scrolls = (node: Element | null): boolean => {
              for (let el = node; el && el !== document.body; el = el.parentElement) {
                const x = getComputedStyle(el).overflowX;
                if (x === "auto" || x === "scroll") return true;
              }
              return false;
            };

            // caixa de 1 px recortada (o padrão "só para leitor de tela", como o cabeçalho das tabelas empilhadas)
            const shrunk = (node: Element | null): boolean => {
              for (let el = node; el && el !== document.body; el = el.parentElement) {
                const b = el.getBoundingClientRect();
                if (b.width <= 1 && b.height <= 1) return true;
              }
              return false;
            };

            return [...document.body.querySelectorAll("*")]
              .filter(el => {
                const style = getComputedStyle(el);
                const box = el.getBoundingClientRect();
                if (box.width === 0 || box.right <= limit) return false;
                if (style.position === "fixed" || el.closest(".sr-only, .skip, [aria-hidden='true'], dialog") || shrunk(el.parentElement)) return false;
                return !scrolls(el.parentElement);
              })
              .slice(0, 6)
              .map(el => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ")[0]} (direita em ${Math.round(el.getBoundingClientRect().right)} px)`);
          });
          expect(leaking, "elementos que passam da margem direita").toEqual([]);

          // 3. nenhum pedido a terceiros e nenhum erro no console
          expect(foreign, "requisições a terceiros").toEqual([]);
          expect(problems, "erros no console").toEqual([]);
        });
      }
    }
  }
});

test("a wiki tem uma rota para cada página gerada", async ({ request }) => {
  for (const entry of wiki.pages) {
    const response = await request.get(entry.path.slice(1));
    expect(response.status(), entry.path).toBe(200);
  }
});

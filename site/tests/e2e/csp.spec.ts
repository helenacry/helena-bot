// A política de conteúdo (CSP) que o bot manda em cada página (services/web/static-site.mjs).
// Ela só vale se o site continuar INTEIRO debaixo dela: estes testes abrem as páginas e usam o que
// tem script (busca da wiki em WebAssembly, tema, conversa de exemplo, painel da conta) escutando
// o evento que o navegador dispara quando bloqueia algo. Rodam contra o mesmo servidor de arquivos
// do bot (scripts/serve-dist.mjs).
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["", "wiki/", "wiki/crime/robbery/", "wiki/economy/market/", "account/", "terms/", "privacy/", "404/"];

async function watch(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];

    (window as unknown as { __csp: string[] }).__csp = seen;

    document.addEventListener("securitypolicyviolation", event => {
      seen.push(`${event.violatedDirective} ← ${event.blockedURI || "inline"} (${event.sourceFile ?? ""}:${event.lineNumber})`);
    });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test.describe("política de conteúdo (CSP)", () => {
  test("toda página HTML leva a política, sem 'unsafe-inline' nem 'unsafe-eval' nos scripts", async ({ request }) => {
    for (const path of PAGES) {
      const response = await request.get(path);
      const header = response.headers()["content-security-policy"] ?? "";

      expect(header, path).not.toBe("");

      const directives = Object.fromEntries(header.split(";").map(part => {
        const [name, ...value] = part.trim().split(/\s+/);

        return [name, value.join(" ")];
      }));

      expect(directives["script-src"], path).toContain("'self'");
      // ('wasm-unsafe-eval' é o WebAssembly da busca; o 'unsafe-eval' puro seria o eval de texto)
      expect(directives["script-src"], path).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/);
      expect(directives["script-src"], `${path}: scripts da página autorizados por hash`).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
      expect(directives["default-src"], path).toBe("'self'");
      expect(directives["object-src"], path).toBe("'none'");
      expect(directives["frame-ancestors"], path).toBe("'none'");
      expect(directives["base-uri"], path).toBe("'self'");

      // o único terceiro é o Turnstile da Cloudflare (o desafio anti-robô do painel)
      expect(directives["script-src"], path).toContain("https://challenges.cloudflare.com");
      expect(directives["frame-src"], path).toBe("https://challenges.cloudflare.com");
      expect(directives["connect-src"], path).toBe("'self' https://helena.discloud.dev");

      expect(response.headers()["permissions-policy"], path).toContain("camera=()");
    }
  });

  test("um SVG aberto direto não roda nada", async ({ request }) => {
    const response = await request.get("favicon.svg");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers()["content-security-policy"]).toContain("sandbox");
  });

  test("a política está valendo: um script injetado na página é barrado", async ({ page }) => {
    await watch(page);
    await page.goto("", { waitUntil: "networkidle" });

    const ran = await page.evaluate(() => {
      const script = document.createElement("script");

      script.textContent = "window.__invadiu = true";
      document.head.append(script);

      return Boolean((window as unknown as { __invadiu?: boolean }).__invadiu);
    });

    expect(ran, "o script de fora rodou").toBe(false);
    expect((await violations(page)).join("\n")).toContain("script-src");
  });

  test("nenhuma página tem o navegador bloqueando algo", async ({ page }) => {
    await watch(page);

    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });

      expect(await violations(page), path).toEqual([]);
    }
  });

  test("a busca da wiki (WebAssembly), o tema e o painel funcionam sem violação", async ({ page }) => {
    await watch(page);

    // busca
    await page.goto("wiki/", { waitUntil: "networkidle" });

    const box = page.getByRole("combobox", { name: "Buscar na wiki" }).first();

    // com a máquina carregada o atalho pode chegar antes de a ilha ligar: repete até a caixa abrir
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(box).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await box.fill("roubo arma");
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("listbox", { name: "Resultados" }).first()).toContainText("Roubar jogadores");

    expect(await violations(page), "busca").toEqual([]);

    // tema (o script do começo da página, que o hash libera)
    await page.goto("", { waitUntil: "networkidle" });

    const before = await page.evaluate(() => document.documentElement.dataset.theme);

    await page.getByRole("button", { name: /tema/i }).first().click();

    expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before);
    expect(await violations(page), "tema").toEqual([]);
  });

  test("o painel da conta (ilha Preact) abre o painel com sessão sem violação", async ({ page }) => {
    const API = "https://helena.discloud.dev";

    await watch(page);

    await page.addInitScript(() => {
      localStorage.setItem("helena.session", JSON.stringify({ token: "t", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    });

    await page.route(`${API}/api/me`, route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { username: "jogadora", displayName: "Jogadora Teste", avatarUrl: null },
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        captcha: false,
        gems: { balance: 12, available: true, remaining: 0, min: 1, max: 5, cooldown: 18_000 },
        daily: { cooldown: 86_400, ladder: [50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 130_000] },
        guilds: []
      })
    }));

    await page.goto("account/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jogadora Teste");

    expect(await violations(page)).toEqual([]);
  });
});

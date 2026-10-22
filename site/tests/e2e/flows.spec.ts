// Fluxos de uso: a conversa de exemplo, o laboratório do crime, a busca de comandos e da
// wiki (Pagefind), o tema, o menu do celular e o painel da conta com a API simulada.
import { expect, test } from "@playwright/test";

/** Ilhas com client:visible só ganham vida quando chegam à tela: espera a hidratação terminar. */
const hydrated = (selector: string) => `astro-island:has(${selector}):not([ssr])`;

test.describe("página inicial", () => {
  test("a conversa de exemplo segue as regras do bot: daily, crime que dá errado e cadeia", async ({ page }) => {
    // sorteio fixo em 0,9: o crime sempre falha (a chance de dar certo é 50%)
    await page.addInitScript(() => { Math.random = () => 0.9; });
    await page.goto("./", { waitUntil: "networkidle" });

    const log = page.getByRole("log", { name: "Mensagens" });
    await expect(log.getByRole("img", { name: /Cartão de perfil da Helena/ })).toBeVisible();

    await page.getByRole("button", { name: "/daily", exact: true }).click();
    await expect(log).toContainText("Recompensa resgatada!");
    await expect(log).toContainText("R$ 510,00");
    await expect(page.locator(".sim-chips").getByRole("button", { name: /\/daily/ })).toBeDisabled();

    await page.getByRole("button", { name: "/crime", exact: true }).click();
    await expect(log).toContainText("Você foi pego!");
    await expect(log).toContainText("30m 0s");

    // preso: o comando /prisao aparece e o trabalho fica bloqueado
    await expect(page.getByRole("button", { name: "/prisao", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "/trabalhar", exact: true }).click();
    await expect(log).toContainText("Este comando fica bloqueado enquanto você cumpre pena");

    await page.getByRole("button", { name: "Recomeçar o exemplo" }).click();
    await expect(page.getByRole("button", { name: "/prisao", exact: true })).toHaveCount(0);
  });

  test("laboratório do crime sorteia e soma na ficha", async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });

    await page.locator("#crime").scrollIntoViewIfNeeded();
    await expect(page.locator(hydrated(".lab"))).toBeAttached();
    await page.getByRole("button", { name: "Tentar 10" }).click();

    const receipt = page.locator(".lab-receipt");
    await expect(receipt).toContainText("10 (");
    // mostra as 7 últimas; o item "… mais N antes" não conta
    await expect(receipt.locator(".lab-log li:not(.lab-more)")).toHaveCount(7);

    // o nível multiplica prêmio e multa
    await page.locator("#lab-level").fill("100");
    await expect(page.locator("#lab-scale")).toContainText("×12,9");

    await page.getByRole("button", { name: "Zerar" }).click();
    await expect(receipt).toContainText("Nenhuma tentativa ainda");
  });

  test("busca de comandos filtra por nome, apelido e categoria", async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });

    const search = page.getByLabel("Buscar comando");
    await search.scrollIntoViewIfNeeded();
    await expect(page.locator(hydrated("#ex-q"))).toBeAttached();
    await search.fill("saldo");

    await expect(page.getByText(/^\d+ de 56 comandos$/)).toBeVisible();
    await expect(page.locator(".ex-name", { hasText: "/saldo" })).toBeVisible();

    await search.fill("zzzzzz");
    await expect(page.getByText("Nenhum comando combina")).toBeVisible();

    await search.fill("");
    await page.getByRole("button", { name: /Crime/ }).first().click();
    await expect(page.locator(".ex-name", { hasText: "/crime" })).toBeVisible();
    await expect(page.locator(".ex-name", { hasText: "/saldo" })).toHaveCount(0);
  });

  test("botão de comando copia e avisa", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("./", { waitUntil: "networkidle" });

    const button = page.locator("#bolsos").getByRole("button", { name: /\/depositar tudo/ });
    await button.click();

    await expect(button).toHaveAttribute("data-copied", "");
    await expect(page.locator("#announce")).toHaveText("Copiado: /depositar tudo");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("/depositar tudo");
  });

  test("o tema troca, vale na hora e fica guardado", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("./", { waitUntil: "networkidle" });

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Usar o tema escuro" }).click();
    await expect(root).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("helena-theme"))).toBe("dark");

    await page.reload({ waitUntil: "networkidle" });
    await expect(root).toHaveAttribute("data-theme", "dark");
  });

  test("a barra de carreira mostra o emprego em foco", async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });
    await page.locator("#carreira").scrollIntoViewIfNeeded();

    await page.getByRole("button", { name: /^Magnata/ }).focus();
    await expect(page.locator("#ladder-readout")).toContainText("Magnata");
    await expect(page.locator("#ladder-readout")).toContainText("nível 85");
  });
});

test.describe("celular", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("o menu abre, leva à seção e fecha com Esc", async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });

    const burger = page.getByRole("button", { name: "Menu" });
    const link = page.locator("#nav").getByRole("link", { name: "Carreira" });
    await expect(burger).toHaveAttribute("aria-expanded", "false");
    await expect(link).toBeHidden();

    await burger.click();
    await expect(burger).toHaveAttribute("aria-expanded", "true");
    await expect(link).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(burger).toHaveAttribute("aria-expanded", "false");

    await burger.click();
    await link.click();
    await expect(page).toHaveURL(/#carreira$/);
  });
});

test.describe("wiki", () => {
  test("a busca (Pagefind) acha a página e abre com Enter", async ({ page }) => {
    await page.goto("wiki/", { waitUntil: "networkidle" });

    await page.keyboard.press("/");
    const box = page.getByRole("combobox", { name: "Buscar na wiki" }).first();
    await expect(box).toBeVisible();

    await box.fill("roubo arma");
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("listbox", { name: "Resultados" }).first()).toContainText("Roubar jogadores");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wiki\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("o sumário marca a seção que está na tela", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("wiki/crime/robbery/", { waitUntil: "networkidle" });

    // o título precisa ficar na faixa de cima da tela, que é onde o sumário observa
    await page.evaluate(() => {
      document.getElementById("quanto-da-para-levar")?.scrollIntoView({ block: "start", behavior: "instant" });
      window.scrollBy(0, -160);
    });
    await expect(page.locator('.toc a[aria-current="true"]')).toContainText("Quanto dá para levar");
  });

  test("links internos da wiki chegam ao destino com o prefixo do site", async ({ page }) => {
    await page.goto("wiki/crime/robbery/", { waitUntil: "networkidle" });

    const link = page.locator(".prose a", { hasText: "lavagem" }).first();
    await link.click();
    await expect(page).toHaveURL(/\/wiki\/crime\/laundering\//);
  });
});

test.describe("painel da conta", () => {
  const API = "https://helena.discloud.dev";

  const me = {
    user: { username: "jogadora", displayName: "Jogadora Teste", avatarUrl: null },
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    captcha: false,
    gems: { balance: 12, available: true, remaining: 0, min: 1, max: 5, cooldown: 18_000 },
    daily: { cooldown: 86_400, ladder: [50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 130_000] },
    guilds: [
      { id: "1", name: "Servidor A", icon: null, player: { wallet: 10_000, bank: 5_000, level: 3 }, prison: null,
        daily: { available: true, remaining: 0, streak: 2, nextStreak: 3, nextReward: { total: 60_000, weeklyBonus: 0 } } },
      { id: "2", name: "Servidor B", icon: null, player: null, prison: null,
        daily: { available: false, remaining: 7_200, streak: 0, nextStreak: 1, nextReward: { total: 50_000, weeklyBonus: 0 } } },
      { id: "3", name: "Servidor C", icon: null, player: { wallet: 0, bank: 0, level: 1 }, prison: { remaining: 600 },
        daily: { available: true, remaining: 0, streak: 1, nextStreak: 2, nextReward: { total: 55_000, weeklyBonus: 0 } } }
    ]
  };

  test("sem sessão, mostra a entrada e leva à VSync com PKCE", async ({ page }) => {
    await page.route("https://vsync.lat/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>VSync</title>" }));
    await page.goto("account/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pegue o seu daily e as suas gemas");

    await page.getByRole("button", { name: "Entrar com a VSync" }).click();
    await page.waitForURL(/vsync\.lat\/oauth2\/authorize/);

    const url = new URL(page.url());
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "235205613573263360",
      response_type: "code",
      scope: "identify guilds",
      code_challenge_method: "S256"
    });
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/account\/$/);
  });

  test("com sessão, lista os servidores na ordem certa e coleta o daily", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("helena.session", JSON.stringify({ token: "t", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    });

    let claimed: unknown = null;

    await page.route(`${API}/api/me`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) }));
    await page.route(`${API}/api/claim/daily`, async route => {
      claimed = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reward: { total: 60_000 }, streak: 3 }) });
    });

    await page.goto("account/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jogadora Teste");
    await expect(page.getByText("@jogadora")).toBeVisible();

    // liberado primeiro, depois quem espera, por último quem está preso
    const names = await page.locator(".acc-row h3").allTextContents();
    expect(names).toEqual(["Servidor A", "Servidor B", "Servidor C"]);

    await expect(page.locator(".acc-tally")).toContainText("1 liberado");
    await expect(page.locator(".acc-row.jail")).toContainText("Preso não coleta o daily");

    await page.getByRole("button", { name: /Resgatar R\$\s*600,00/ }).click();
    await expect(page.locator(".acc-say")).toContainText("Daily resgatado em Servidor A");
    expect(claimed).toEqual({ guildId: "1" });
  });

  test("sessão vencida volta para a entrada com aviso", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("helena.session", JSON.stringify({ token: "t", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    });

    await page.route(`${API}/api/me`, route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "session_expired" }) }));
    await page.goto("account/", { waitUntil: "networkidle" });

    await expect(page.getByRole("alert")).toHaveText("Sua sessão acabou. Entre de novo.");
    await expect(page.getByRole("button", { name: "Entrar com a VSync" })).toBeVisible();
  });

  test("API fora do ar mostra o aviso com a saída", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("helena.session", JSON.stringify({ token: "t", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    });

    await page.route(`${API}/api/me`, route => route.abort("failed"));
    await page.goto("account/", { waitUntil: "networkidle" });

    await expect(page.getByRole("alert")).toContainText("fora do ar");
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  });
});

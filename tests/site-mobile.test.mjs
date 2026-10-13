import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// O que o teste do site no celular (Edge emulando 320 a 430 px) achou, travado
// aqui para não voltar. O que só aparece olhando a tela (texto por cima do
// botão, alvo de toque pequeno) vira regra no CSS que dá para conferir.

const SITE = fileURLToPath(new URL("../site/", import.meta.url));

const read = file => readFileSync(join(SITE, file), "utf8");

const cssFiles = readdirSync(join(SITE, "css")).filter(file => file.endsWith(".css"));

test("nenhum texto do site é menor que 12px (0.75rem)", () => {
    const small = [];

    for (const file of cssFiles) {
        // font-size: 0.7rem  |  font: 500 0.72rem var(--font-mono)
        for (const match of read(`css/${file}`).matchAll(/font(?:-size)?:(?: \d{3})? (\d*\.?\d+)rem/g)) {
            if (Number(match[1]) < 0.75) small.push(`${file}: ${match[0]}`);
        }
    }

    assert.deepEqual(small, []);
});

test("o botão de convite do cabeçalho tem texto curto para telas estreitas", () => {
    const html = read("index.html");
    const nav = read("js/nav.js");
    const css = read("css/components.css");

    const cta = html.match(/<a class="btn primary" href="#comecar" data-cta="invite"[^>]*>/)[0];

    assert.match(cta, /data-on="Adicionar à VSync"/);
    assert.match(cta, /data-on-short="Adicionar"/);

    // o script monta os dois textos e o CSS escolhe qual mostrar
    assert.match(nav, /"class": "long"/);
    assert.match(nav, /"class": "short"/);

    assert.match(css, /\.top \.btn \.short \{ display: none; \}/);
    assert.match(css, /@media \(max-width: 420px\) \{[^}]*\.top \.btn \.long \{ display: none; \}[^}]*\.top \.btn \.short \{ display: inline; \}/);
});

test("o nome da Helena no cabeçalho não encolhe nem quebra (o botão não pode ficar por cima)", () => {
    const css = read("css/components.css");

    assert.match(css, /\.brand \{[^}]*flex: none;/);
    assert.match(css, /\.brand b \{[^}]*white-space: nowrap;/);
});

test("alvos de toque: chip de comando, sumário legal e link da wiki têm área grande no celular", () => {
    assert.match(read("css/base.css"), /@media \(max-width: 720px\), \(pointer: coarse\) \{\s*\.cmd \{[^}]*min-height: 44px;/);
    assert.match(read("css/legal.css"), /\.legal-toc a \{[^}]*min-height: 40px;/);
    assert.match(read("css/wiki.css"), /\.crumbs a \{ padding: 13px 8px; margin: -13px -8px; \}/);
});

test("o painel sempre tem um h1: os avisos que ocupam a página são o título", () => {
    const code = read("js/account.js");

    assert.match(code, /el\(page \? "h1" : "h2", \{ text: title \}\)/);

    // todo aviso de página inteira passa page = true; os de dentro do painel logado não
    for (const title of ["Entrando…", "Carregando…", "Fora do ar", "Painel indisponível"]) {
        const at = code.indexOf(`notice(\n        "${title}"`) >= 0 ? code.indexOf(`notice(\n        "${title}"`) : code.indexOf(`notice("${title}"`);

        assert.ok(at >= 0, `não achei o aviso "${title}"`);

        const call = code.slice(at, code.indexOf(")]);", at));

        assert.match(call, /true\s*$/, `o aviso "${title}" é a página inteira e precisa ser h1`);
    }

    assert.match(read("css/account.css"), /\.acc-notice h1, \.acc-notice h2 \{/);
});

test("a lista de comandos não promete copiar se o clique não copia", () => {
    const html = read("index.html");
    const commands = read("js/commands.js");

    const lede = html.match(/<section class="band" id="comandos">[\s\S]*?<p class="lede">(.*?)<\/p>/)[1];

    if (/copiar/i.test(lede)) {
        assert.match(commands, /data-copy/, "o texto diz que clicar copia, mas os cartões não copiam");
    }
});

test("a página 404 funciona em qualquer profundidade: parte do endereço do site e todos os arquivos existem", async () => {
    const { SITE_URL } = await import("../config/site.mjs");
    const { existsSync } = await import("node:fs");

    const page = read("404.html");

    assert.equal(page.match(/<base href="([^"]+)">/)[1], SITE_URL, "o <base> da 404 precisa ser o SITE_URL");
    assert.match(page, /<meta name="robots" content="noindex">/);
    assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1);
    assert.match(page, /<html lang="pt-BR">/);

    const refs = [...page.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(ref => !/^(https?:|mailto:|#|data:)/.test(ref) && ref !== "./")
        .map(ref => ref.replace(/[?#].*$/, ""));

    assert.ok(refs.length >= 6, "achou os arquivos locais da 404");

    for (const ref of refs) {
        const path = join(SITE, ref);

        assert.ok(existsSync(path) && (!ref.endsWith("/") || existsSync(join(path, "index.html"))), `a 404 aponta para ${ref}, que não existe`);
    }

    // a volta para o início e a wiki estão na página
    assert.match(page, /href="\.\/"/);
    assert.match(page, /href="wiki\/"/);
});

import { db } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, relative } from "node:path";

const { collectSiteData } = await import("../scripts/site/data-source.mjs");
const { WEB_CONFIG } = await import("../config/web.mjs");
const { SITE_URL } = await import("../config/site.mjs");

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const SRC = join(SITE, "src");

const read = file => readFileSync(join(SITE, file), "utf8");

const data = await collectSiteData();

// todos os arquivos de texto de site/src (sem dados gerados nem fontes)
const sourceFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) return sourceFiles(full);

    return /\.(astro|ts|tsx|css|mjs|svg)$/.test(entry.name) ? [full] : [];
});

const files = sourceFiles(SRC);

// ==========================================
// DADOS DO BOT
// ==========================================

test("os dados do site acompanham o bot (rode npm run site:data se falhar)", () => {
    const embedded = JSON.parse(read("src/data/game.json"));

    assert.deepEqual(embedded, JSON.parse(JSON.stringify(data)));
});

test("comandos do dono do bot e de teste não aparecem no site", async () => {
    const names = data.categories.flatMap(c => c.commands.map(command => command.name));

    for (const folder of ["admin", "dev"]) {
        const dir = join(dirname(SITE), "commands", folder);

        const commandFiles = readdirSync(dir).filter(f => f.endsWith(".mjs"));

        assert.ok(commandFiles.length > 0, `commands/${folder} tem comandos`);

        for (const file of commandFiles) {
            // o nome do arquivo é em inglês; o que vale é o nome do comando dentro dele
            const { default: command } = await import(pathToFileURL(join(dir, file)).href);

            assert.ok(command?.name, `commands/${folder}/${file} exporta um comando`);
            assert.ok(!names.includes(command.name), `/${command.name} (commands/${folder}) está no site`);
        }
    }

    assert.ok(!names.includes("testembed"));
    assert.ok(names.includes("daily") && names.includes("loja") && names.includes("usaritem"));
});

test("cada categoria tem comandos, empregos crescem e as conquistas têm raridade conhecida", () => {
    assert.ok(data.categories.length >= 5);
    assert.ok(data.categories.every(c => c.commands.length > 0));

    assert.equal(data.jobs.length, data.stats.jobs);

    for (let i = 1; i < data.jobs.length; i++) {
        assert.ok(data.jobs[i].salary > data.jobs[i - 1].salary, `${data.jobs[i].name} paga mais que o anterior`);
        assert.ok(data.jobs[i].level > data.jobs[i - 1].level);
    }

    assert.equal(data.achievements.length, data.stats.achievements);

    for (const achievement of data.achievements) {
        assert.ok(data.rarities[achievement.rarity], `${achievement.name}: raridade ${achievement.rarity}`);
    }
});

test("as regras do jogo que o site mostra são as do bot (crime, lavagem, daily, energia)", async () => {
    const { CRIME_CONFIG, LAUNDERING_CONFIG, ROBBERY_CONFIG, CRIME_FINE, rewardScale } = await import("../config/crime.mjs");
    const { ENERGY_CONFIG } = await import("../services/economy/energy.mjs");

    const { game } = data;

    assert.equal(game.crime.successChance, CRIME_CONFIG.successChance);
    assert.equal(game.crime.jailSeconds, CRIME_CONFIG.jailSeconds);
    assert.equal(game.crime.energy, CRIME_CONFIG.energyCost);
    assert.equal(game.crime.fine.min * 100, CRIME_FINE.min);
    assert.equal(game.crime.fine.max * 100, CRIME_FINE.max);
    assert.equal(game.crime.scaleAtLevel100, rewardScale(100));
    assert.equal(game.robbery.energy, ROBBERY_CONFIG.energyCost);
    assert.equal(game.laundering.kinds.public.rate.min, LAUNDERING_CONFIG.kinds.public.rate.min);
    assert.equal(game.laundering.kinds.private.rate.max, LAUNDERING_CONFIG.kinds.private.rate.max);
    assert.equal(game.energy.max, ENERGY_CONFIG.max);
    assert.equal(game.daily.ladder.length, 7);
    assert.ok(game.daily.ladder.every((value, index, list) => index === 0 || value >= list[index - 1]), "a escada do daily só sobe");
    assert.ok(game.energy.foods.length >= 3, "a loja de exemplo tem 3 consumíveis");
});

// ==========================================
// ARQUIVOS E ENDEREÇOS
// ==========================================

test("o endereço do site vem de config/site.mjs e o Astro o usa (site e base do GitHub Pages)", () => {
    const astro = read("astro.config.mjs");

    assert.match(astro, /import \{ SITE_URL \} from "\.\.\/config\/site\.mjs"/);
    assert.match(astro, /site: url\.origin/);
    assert.match(astro, /base: url\.pathname/);
    assert.match(SITE_URL, /^https:\/\/[a-z0-9.-]+\/(?:[a-z0-9-]+\/)?$/);
});

test("os links do convite e do servidor oficial estão preenchidos, e os criadores são os combinados", () => {
    const config = read("src/config.ts");

    assert.match(config, /inviteUrl:\s*"https:\/\/vsync\.lat\/oauth2\/authorize\?client_id=\d+&scope=bot/);
    assert.match(config, /supportUrl: "https:\/\/vsync\.lat\/[a-z0-9]+"/);
    assert.match(config, /contactUrl: "https:\/\/github\.com\/[A-Za-z0-9-]+"/, "contato público é o perfil do GitHub");

    const handles = [...config.matchAll(/\{ handle: "([A-Za-z0-9-]+)", url: "(https:\/\/github\.com\/[A-Za-z0-9-]+)" \}/g)];

    assert.deepEqual(handles.map(match => match[1]), ["matheustonon1", "agorismo"]);

    for (const [, handle, url] of handles) {
        assert.equal(url, `https://github.com/${handle}`);
    }

    assert.match(config, /orgUrl: "https:\/\/github\.com\/helenacry"/);
    assert.match(config, /orgName: "helenacry"/);
});

test("as imagens que o site referencia existem (favicon, ícone do iPhone, imagem de compartilhamento, cartão, fontes)", () => {
    for (const file of ["public/favicon.svg", "public/apple-touch-icon.png", "public/og-default.png", "src/assets/helena-card.webp"]) {
        assert.ok(existsSync(join(SITE, file)), file);
    }

    // toda fonte citada no CSS existe
    const css = read("src/styles/fonts.css");

    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);

    assert.ok(urls.length >= 6);

    for (const url of urls) {
        assert.ok(existsSync(join(SITE, "src", "styles", url)), `fonte ${url}`);
    }
});

test("as fontes são do próprio site: nenhum pedido ao Google Fonts nem a outro CDN", () => {
    for (const file of files) {
        const text = readFileSync(file, "utf8");

        assert.doesNotMatch(text, /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare/i, relative(SITE, file));
    }

    assert.doesNotMatch(read("src/styles/fonts.css"), /https?:\/\//);
});

test("todo CSS usa as camadas na mesma ordem (a ordem declarada primeiro vale para todos os arquivos)", () => {
    const layered = files.filter(file => file.endsWith(".css") && /@layer\s+[a-z]+\s*\{/.test(readFileSync(file, "utf8")));

    assert.ok(layered.length >= 7);

    for (const file of layered) {
        assert.match(readFileSync(file, "utf8"), /@layer reset, tokens, base, components, utilities;/, `${relative(SITE, file)} precisa declarar a ordem das camadas`);
    }
});

test("as cores ficam nos tokens: nenhum CSS/Astro fora de tokens.css tem cor solta (exceto as do recibo e da conversa)", () => {
    // cores de conteúdo que não são do tema: o papel do recibo, a conversa do app e a marca da pelúcia.
    const allowedFiles = ["tokens.css", "Plush.astro", "favicon.svg"];

    const hex = /#[0-9a-f]{3,8}\b/gi;

    for (const file of files) {
        if (allowedFiles.some(name => file.endsWith(name))) continue;

        const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

        // só olha o que é estilo: <style> e arquivos .css
        const styles = file.endsWith(".css") ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join("\n");

        const loose = (styles.match(hex) ?? []).filter(value => !/^#(?:0{3,6}|f{3,6})$/i.test(value));

        // o recibo usa tinta própria em oklch (veja components.css): é o único lugar com oklch fora dos tokens
        assert.deepEqual(loose, [], `${relative(SITE, file)} tem cor hexadecimal solta`);
    }
});

test("o painel só aparece com apiUrl: sem ela, o link some do menu", () => {
    const config = read("src/config.ts");

    assert.match(config, /export const hasAccountPanel = String\(SITE\.apiUrl\)\.length > 0;/);
    assert.match(read("src/components/Header.astro"), /\.\.\.\(hasAccountPanel \?/);
});

// ==========================================
// TERMOS E PRIVACIDADE
// ==========================================

const LEGAL_FILES = { terms: "src/pages/terms/index.astro", privacy: "src/pages/privacy/index.astro" };

const legalSource = Object.fromEntries(Object.entries(LEGAL_FILES).map(([name, file]) => [name, read(file)]));

const stripFrontmatter = text => text.replace(/^---[\s\S]*?\n---\n/, "");

// Texto como a pessoa lê: expressões trocadas pelos valores da configuração e sem acento.
const FACTS = {
    claimLogDays: String(WEB_CONFIG.claimLogDays),
    sessionHours: String(WEB_CONFIG.sessionTtl / 3600),
    maxSessions: String(WEB_CONFIG.maxSessionsPerUser)
};

const plainText = name => stripFrontmatter(legalSource[name])
    .replace(/<Creators short \/>/g, "@matheustonon1 e @agorismo")
    .replace(/<Creators \/>/g, "os perfis dos criadores no github (@matheustonon1 e @agorismo), a organizacao helenacry")
    .replace(/<a href=\{SITE\.orgUrl\}[^>]*>\{SITE\.orgName\}<\/a>/g, "helenacry")
    .replace(/\{(claimLogDays|sessionHours|maxSessions)\}/g, (whole, key) => FACTS[key])
    .replace(/\{SITE\.[A-Za-z]+\}/g, "")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

const tocOf = name => {
    const block = legalSource[name].match(/const toc = (\[[\s\S]*?\]) as const;/)[1];

    return JSON.parse(block);
};

test("termos e privacidade: o sumário bate com as seções, na ordem e numeradas", () => {
    for (const name of Object.keys(LEGAL_FILES)) {
        const source = legalSource[name];
        const toc = tocOf(name).map(([id]) => id);
        const sections = [...source.matchAll(/<section id="([a-z-]+)">/g)].map(m => m[1]);
        const numbers = [...source.matchAll(/<span class="n">(\d\d)<\/span>/g)].map(m => Number(m[1]));

        assert.ok(toc.length >= 12, `${name}: achou o sumário`);
        assert.deepEqual(sections, toc, `${name}: cada item do sumário aponta para uma seção, na mesma ordem`);
        assert.deepEqual(numbers, toc.map((_, index) => index + 1), `${name}: seções numeradas 01, 02, 03...`);

        assert.match(source, /version="\d+\.\d+"/, name);
        assert.match(source, /since="\d{1,2} de \p{L}+ de 20\d\d"/u, name);

        // cada item do sumário tem rótulo e a seção tem h2 (o rótulo pode ser mais curto que o título)
        for (const [id, label] of tocOf(name)) {
            assert.ok(label.length > 2, `${name}: rótulo de ${id}`);
            assert.match(source, new RegExp(`<section id="${id}">\\s*<h2><span class="n">\\d\\d</span> [^<]+</h2>`), `${name}: seção ${id} tem h2`);
        }
    }
});

test("as tabelas da política empilham no celular: cada célula tem o nome da sua coluna", () => {
    const tables = [...legalSource.privacy.matchAll(/<table>([\s\S]*?)<\/table>/g)].map(m => m[1]);

    assert.equal(tables.length, 3, "bases legais, prazos e cookies");

    assert.equal([...legalSource.privacy.matchAll(/<div class="table-wrap stack">/g)].length, 3, "cada tabela usa o quadro que empilha");

    for (const table of tables) {
        const heads = [...table.matchAll(/<th>([\s\S]*?)<\/th>/g)].map(m => m[1].trim());

        for (const row of table.match(/<tr>(?:(?!<\/tr>)[\s\S])*<td>[\s\S]*?<\/tr>/g)) {
            const cells = [...row.matchAll(/<td( data-label="([^"]*)")?>/g)];

            assert.equal(cells.length, heads.length, `uma célula por coluna em ${row.slice(0, 60)}`);
            assert.equal(cells[0][1], undefined, "a primeira célula é o título da linha");

            cells.slice(1).forEach((cell, index) => {
                assert.equal(cell[2], heads[index + 1], "data-label igual ao cabeçalho da coluna");
            });
        }
    }

    assert.match(read("src/styles/prose.css"), /td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/);
});

test("termos e privacidade: cada 'seção N' citada no texto leva ao assunto certo", () => {
    // para onde cada número aponta hoje; se as seções mudarem de lugar, o texto também precisa mudar
    const target = {
        terms: { 5: "regras", 15: "contato" },
        privacy: { 3: "bot", 4: "jogo", 6: "terceiros", 9: "direitos", 10: "seguranca", 15: "contato" }
    };

    for (const name of Object.keys(LEGAL_FILES)) {
        const toc = tocOf(name).map(([id]) => id);
        const refs = [...legalSource[name].matchAll(/seção (\d+)/g)].map(m => Number(m[1]));

        assert.ok(refs.length > 0, `${name} cita seções`);

        for (const number of refs) {
            assert.ok(target[name][number], `${name}: "seção ${number}" não está no mapa do teste`);
            assert.equal(toc[number - 1], target[name][number], `${name}: "seção ${number}" deveria ser ${target[name][number]}`);
        }
    }
});

test("termos e privacidade: os prazos e limites do texto vêm da configuração do painel, não de número escrito à mão", () => {
    for (const name of Object.keys(LEGAL_FILES)) {
        assert.match(legalSource[name], /import \{ WEB_CONFIG \} from "\.\.\/\.\.\/\.\.\/\.\.\/config\/web\.mjs";/, name);
        assert.match(legalSource[name], /const claimLogDays = WEB_CONFIG\.claimLogDays;/, name);
        assert.match(legalSource[name], /const sessionHours = WEB_CONFIG\.sessionTtl \/ 3600;/, name);
        assert.match(legalSource[name], /const maxSessions = WEB_CONFIG\.maxSessionsPerUser;/, name);
    }

    // o texto usa as expressões, e não "90 dias" ou "6 horas" soltos
    const body = name => stripFrontmatter(legalSource[name]);

    assert.match(body("privacy"), /<strong>\{claimLogDays\}<\/strong> dias/);
    assert.match(body("privacy"), /<strong>\{sessionHours\} horas<\/strong>/);
    assert.match(body("terms"), /<strong>\{sessionHours\} horas<\/strong>/);
    assert.match(body("terms"), /<strong>\{maxSessions\}<\/strong>/);

    assert.doesNotMatch(body("privacy"), /(?<!\{)\b(?:90|6) (?:dias|horas)\b/, "privacidade: prazo escrito à mão");
    assert.doesNotMatch(body("terms"), /\b(?:6 horas|5 sessões)\b/, "termos: limite escrito à mão");

    // o prazo do registro é de verdade: o painel o apaga (veja web-api.test.mjs)
    assert.ok(WEB_CONFIG.claimLogDays > 0);

    assert.match(plainText("privacy"), new RegExp(`${FACTS.claimLogDays} dias`));
});

test("o contato dos textos são os perfis dos criadores e o servidor oficial, vindos da configuração, e sem e-mail", () => {
    for (const name of Object.keys(LEGAL_FILES)) {
        const source = legalSource[name];

        assert.match(source, /<Creators \/>/, `${name}: cita os perfis dos criadores`);
        assert.match(source, /href=\{SITE\.supportUrl\}/, `${name}: link do servidor oficial`);

        // nenhum endereço de contato escrito à mão
        assert.doesNotMatch(stripFrontmatter(source), /https:\/\/github\.com\/|https:\/\/vsync\.lat\//, `${name}: endereço escrito à mão`);
        assert.doesNotMatch(source, /mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i, `${name}: o contato público não tem e-mail`);
    }

    // o trecho compartilhado lê a lista de criadores e a organização
    const creators = read("src/components/ui/Creators.astro");

    assert.match(creators, /SITE\.creators\.map/);
    assert.match(creators, /SITE\.orgUrl/);
    assert.match(creators, /SITE\.orgName/);

    // e o rodapé dá o crédito com os mesmos dados
    const footer = read("src/components/Footer.astro");

    assert.match(footer, /SITE\.creators\.map/);
    assert.match(footer, /SITE\.orgUrl/);
});

test("termos e privacidade: abrem para buscadores, ficam ligados ao resto do site e a política cita a privacidade nos termos", () => {
    for (const name of Object.keys(LEGAL_FILES)) {
        assert.doesNotMatch(legalSource[name], /noindex/, `${name}: texto público, pode aparecer em buscas`);
    }

    assert.match(legalSource.terms, /seção \d+/);
    assert.match(plainText("terms"), /politica de privacidade|privacidade/);

    assert.match(read("src/components/Footer.astro"), /url\("\/terms\/"\)/);
    assert.match(read("src/components/Footer.astro"), /url\("\/privacy\/"\)/);

    // o painel avisa do registro e liga às duas páginas
    const account = read("src/pages/account/index.astro");

    assert.match(account, /url\("\/terms\/"\)/);
    assert.match(account, /url\("\/privacy\/"\)/);
    assert.match(account, /noindex/);
});

// ==========================================
// REVISÃO JURÍDICA (LGPD, ECA Digital, CDC): o que os textos precisam dizer
// ==========================================

test("termos e privacidade: versão 2.0 e nenhuma fala no singular sobre quem mantém a Helena", () => {
    for (const name of Object.keys(LEGAL_FILES)) {
        assert.match(legalSource[name], /version="2\.0"/, `${name}: versão`);

        const text = plainText(name);

        // são duas pessoas: nada de "o desenvolvedor", "um desenvolvedor", "mantida por uma pessoa"
        assert.doesNotMatch(text, /\bo desenvolvedor\b|\bum desenvolvedor\b|mantida por uma pessoa|feito e mantido por um/, `${name}: texto no singular`);
    }

    // quem é quem: os dois criadores são os responsáveis; a organização é só o lugar do código
    assert.match(plainText("terms"), /criado e mantido por duas pessoas, @matheustonon1 e @agorismo/);
    assert.match(plainText("terms"), /quem responde pela helena sao essas duas pessoas/);
    assert.match(plainText("terms"), /a organizacao do github \(helenacry\) e so o lugar onde o codigo fica/);
    assert.match(plainText("privacy"), /sao as duas pessoas que criaram e mantem a helena, @matheustonon1 e @agorismo/);
    assert.match(plainText("privacy"), /papel de encarregado pelo tratamento de dados/);
});

test("privacidade: o titular tem todos os direitos do art. 18 da LGPD e um prazo de resposta", () => {
    const text = plainText("privacy");

    // art. 18, I a IX
    for (const right of [
        "confirmacao de que tratamos dados seus e acesso",
        "correcao de dados incompletos",
        "anonimizacao, bloqueio ou eliminacao",
        "portabilidade",
        "eliminacao dos dados tratados com o seu consentimento",
        "informacao sobre as entidades com quem os dados sao compartilhados",
        "possibilidade de nao dar consentimento",
        "retirada do consentimento",
        "revisao, por uma pessoa, de uma decisao automatizada"
    ]) {
        assert.ok(text.includes(right), `faltou o direito: ${right}`);
    }

    assert.match(text, /a resposta vem em ate 15 dias/);
    assert.match(text, /autoridade nacional de protecao de dados \(anpd\)/);
    assert.match(text, /lgpd, lei n.{1,3} 13\.709\/2018/);

    // o próprio pedido não pode expor dados: o GitHub é público
    assert.match(text, /nao escreva dados pessoais nem documentos em issues, comentarios ou mensagens abertas/);
    assert.match(text, /conversa privada com um dos criadores/);
});

test("privacidade: crianças e adolescentes (LGPD art. 14, ECA Digital), bases legais e decisões automatizadas", () => {
    const text = plainText("privacy");

    assert.match(text, /a helena nao e para criancas/);
    assert.match(text, /menos de 12 anos/);
    assert.match(text, /melhor interesse do adolescente \(lgpd, art\. 14\)/);
    assert.match(text, /nao mostramos anuncios, nao criamos perfis para publicidade e nao vendemos nada, nem caixas de recompensa/);
    assert.match(text, /lei n.{1,3} 15\.211\/2025/);
    assert.match(text, /quem faz isso e a vsync/, "a conferência de idade é da VSync");

    assert.match(text, /decisoes automatizadas/);
    assert.match(text, /intervalo entre comandos, limite de tentativas no painel e a verificacao anti-robo/);
    assert.match(text, /resolucao cd\/anpd n.{1,3} 15\/2024/, "incidente: prazo e forma da ANPD");

    // a tabela de bases cita o artigo de cada uma, e adolescentes têm a regra do melhor interesse
    for (const article of ["art. 7º, V", "art. 7º, I", "art. 7º, IX", "art. 7º, II", "art. 7º, VI"]) {
        assert.ok(legalSource.privacy.includes(article), `base legal ${article}`);
    }

    assert.match(text, /para adolescentes, essas bases so valem quando atendem ao melhor interesse deles/);
});

test("termos: idade, caixas de recompensa, consumidor, foro e consentimento nas mudanças", () => {
    const text = plainText("terms");

    assert.match(text, /a helena nao e para menores de 12 anos/);
    assert.match(text, /nao vende nada, nao aceita pagamento, nao mostra anuncios e nao tem caixas de recompensa pagas/);
    assert.match(text, /codigo de defesa do consumidor/);
    assert.match(text, /regras gerais de foro do codigo de processo civil/);
    assert.match(text, /avisamos antes e pedimos de novo/);
    assert.match(text, /se alguma parte destes termos for considerada invalida, o resto continua valendo/);
    assert.match(text, /twemoji/);
});

test("a promessa 'sem caixas de recompensa' é verdade: a caixa misteriosa da loja não abre nem sorteia nada", () => {
    // ECA Digital veda caixas de recompensa para o público infantojuvenil. Hoje a "Caixa misteriosa"
    // é só um item de loja sem abertura. Quem criar o sorteio precisa rever os termos, a política
    // e a regra do ECA Digital antes (e este teste vai falhar para lembrar).
    const items = readFileSync(join(dirname(SITE), "config", "items.mjs"), "utf8");

    assert.match(items, /id: "mystery_box"/);

    for (const folder of ["services", "commands"]) {
        const dir = join(dirname(SITE), folder);

        const walk = current => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
            const full = join(current, entry.name);

            return entry.isDirectory() ? walk(full) : entry.name.endsWith(".mjs") ? [full] : [];
        });

        for (const file of walk(dir)) {
            assert.doesNotMatch(readFileSync(file, "utf8"), /mystery_box|category === "box"|\.category === 'box'/, `${relative(dirname(SITE), file)} trata a caixa misteriosa`);
        }
    }

    // e gemas e dinheiro do jogo não são vendidos: nenhuma rota de pagamento
    const web = readFileSync(join(dirname(SITE), "services", "web", "web-api.mjs"), "utf8");

    assert.doesNotMatch(web, /payment|checkout|stripe|mercadopago|pix/i);
});

// ==========================================
// PRIVACIDADE DE VERDADE
// ==========================================

test("a política diz que não há cookies nem rastreadores, e o site não tem", () => {
    // domínios que as páginas e os scripts podem citar; os de terceiros aparecem na política (seção 6)
    const allowed = new Set([
        "vsync.lat",                       // convite, login e servidor oficial
        "github.com",                      // contato e créditos
        "challenges.cloudflare.com",       // verificação anti-robô do painel
        "helena.discloud.dev",             // API do painel (bot e banco no Discloud)
        "helenacry.github.io",             // o próprio site
        "schema.org", "www.w3.org",        // vocabulário dos dados estruturados e xmlns do SVG (não são pedidos)
        "localhost"                        // só o endereço-base de reserva ao montar URLs absolutas no build
    ]);

    for (const file of files) {
        const text = readFileSync(file, "utf8");

        assert.doesNotMatch(text, /document\.cookie/, `${relative(SITE, file)} mexe em cookies`);
        assert.doesNotMatch(text, /gtag\(|googletagmanager|google-analytics|plausible|hotjar|matomo|clarity\.ms|facebook\.net/i, `${relative(SITE, file)} tem rastreador`);

        for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
            assert.ok(allowed.has(host), `${relative(SITE, file)} fala com ${host}, que a política não cita`);
        }
    }

    const policy = plainText("privacy");

    for (const owner of ["vsync", "cloudflare", "github", "discloud"]) {
        assert.ok(policy.includes(owner), `a política cita ${owner}`);
    }

    assert.ok(!policy.includes("google"), "a política não cita mais o Google (as fontes são do próprio site)");
});

test("toda chave que o site grava no navegador está descrita na política", () => {
    const keys = new Set();

    for (const file of files) {
        const text = readFileSync(file, "utf8");

        for (const [, key] of text.matchAll(/["'](helena[.-][a-z]+)["']/g)) keys.add(key);
    }

    assert.deepEqual([...keys].sort(), ["helena-theme", "helena.oauth", "helena.session"]);

    const policy = legalSource.privacy;

    for (const key of keys) {
        assert.ok(policy.includes(`<code>${key}</code>`), `a política não descreve a chave ${key}`);
    }
});

test("a política cobre todas as tabelas do banco que guardam dados de pessoas", () => {
    // tabela -> uma expressão que a política usa para descrevê-la (sem acento, em minúsculas)
    const covered = {
        players: "carteira",
        global_users: "gemas",
        transactions: "transferencias",
        player_names: "nome de exibicao",
        crime_players: "ficha de crime",
        prison_players: "prisao",
        laundering_jobs: "lavagem",
        combat_players: "vitorias e derrotas",
        combat_challenges: "duelos",
        combat_gear: "municao",
        combat_history: "historico de duelos",
        combat_admin_log: "ajustes feitos por administradores",
        developer_blacklist: "bloqueadas",
        developer_logs: "acoes do dono",
        mission_progress: "missoes",
        inventory: "inventario",
        equipped_items: "itens equipados",
        marriages: "casamento",
        marriage_requests: "pedidos de casamento",
        family_children: "filhos do casal",
        family_births: "bebe que espera nome",
        family_calls: "ultima ligacao do gozofone",
        player_achievements: "conquistas",
        player_titles: "titulos",
        daily_streaks: "sequencia do daily",
        web_sessions: "sessao",
        web_claim_log: "registro de seguranca",
        userinfo_views: "contagem de quantas vezes o perfil de cada pessoa foi consultado"
    };

    // tabelas sem nada de pessoa (só IDs técnicos e ajustes do bot)
    const technical = ["processed_interactions", "developer_settings", "market_state"];

    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map(row => row.name);

    const known = new Set([...Object.keys(covered), ...technical]);

    assert.deepEqual(
        tables.filter(table => !known.has(table)),
        [],
        "tabela nova no banco: descreva na política (site/src/pages/privacy/index.astro, seção 4) o que ela guarda e ponha aqui"
    );

    const policy = plainText("privacy");

    for (const [table, phrase] of Object.entries(covered)) {
        assert.ok(tables.includes(table), `${table} não existe mais: tire do mapa`);
        assert.ok(policy.includes(phrase), `a política não descreve ${table} (procurei "${phrase}")`);
    }

    // o que o texto afirma que fica em cada tabela de sessão e de registro
    for (const table of ["web_sessions", "web_claim_log"]) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);

        assert.ok(columns.includes("ip") && columns.includes("user_agent"), `${table} guarda IP e navegador`);
    }
});

test("o site publicado não leva script do bot: site/ só importa config/ e a foto da Helena", () => {
    for (const file of files) {
        const text = readFileSync(file, "utf8");

        for (const [, spec] of text.matchAll(/(?:import|from)\s+["'](\.[^"']+)["']/g)) {
            const target = join(dirname(file), spec);

            if (target.startsWith(SITE)) continue;

            const rel = relative(dirname(SITE), target).replace(/\\/g, "/");

            // config/ (os mesmos valores do bot) e a foto da Helena, que vira o avatar da conversa
            assert.match(rel, /^(?:config\/[a-z-]+\.mjs|assets\/helena_pfp\.png)$/, `${relative(SITE, file)} importa ${rel}, fora de site/`);
        }
    }

    // nada do que o Astro publica é arquivo .mjs/.ts de servidor
    assert.ok(!existsSync(join(SITE, "public", "helena.mjs")));
    assert.ok(statSync(join(SITE, "package.json")).isFile());
});

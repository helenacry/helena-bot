import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Publicação pelo GitHub (scripts/ci/discloud-deploy.mjs). Um Discloud falso, num servidor local, faz o papel da
// API de verdade: confere o token, o app, o envio do zip e a versão que o bot diz estar rodando.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const SCRIPT = path.join(ROOT, "scripts", "ci", "discloud-deploy.mjs");

const { deploy, main, DeployError } = await import("../scripts/ci/discloud-deploy.mjs");
const { buildZip } = await import("../scripts/make-discloud-zip.mjs");

const run = promisify(execFile);

const TOKEN = "tok_SEGREDO_do_teste_0123456789";
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);

const workDir = mkdtempSync(path.join(tmpdir(), "helena-ci-deploy-"));

const ZIP = path.join(workDir, "helena.zip");

const zipBytes = buildZip([{ name: "discloud.config", data: Buffer.from("ID=helena\n") }, { name: "build-info.json", data: Buffer.from(`{"commit":"${NEW}"}\n`) }]);

writeFileSync(ZIP, zipBytes);

// Sobe o Discloud falso. `state` controla o que ele responde; `seen` guarda o que recebeu.
async function withDiscloud(state, fn) {
    const seen = { requests: [], uploads: [], versionPolls: 0 };

    const config = {
        token: TOKEN,
        appExists: true,
        running: OLD,
        // quantas consultas ao /version ainda mostram a versão antiga depois do envio
        staleAfterUpload: 2,
        commitReply: { status: 200, body: { status: "ok", statusCode: 200, message: "Commit realizado", logs: "build ok" } },
        versionDown: false,
        ...state
    };

    let uploaded = false;

    let stale = 0;

    const server = http.createServer((req, res) => {
        const chunks = [];

        req.on("data", chunk => chunks.push(chunk));

        req.on("end", () => {
            const body = Buffer.concat(chunks);

            seen.requests.push({ method: req.method, url: req.url, token: req.headers["api-token"] });

            const send = (status, payload) => {
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
            };

            if (req.url === "/version") {
                seen.versionPolls += 1;

                if (config.versionDown) return send(502, "Bad Gateway");

                if (uploaded && stale < config.staleAfterUpload) {
                    stale += 1;

                    return send(200, { commit: config.running });
                }

                return send(200, { commit: uploaded && config.commitReply.status < 400 ? NEW : config.running });
            }

            if (req.headers["api-token"] !== config.token) {
                return send(401, { status: "error", statusCode: 401, message: "Invalid token" });
            }

            if (req.method === "GET" && req.url === "/v2/user") return send(200, { status: "ok", user: { userID: "1" } });

            if (req.method === "GET" && req.url === "/v2/app/helena") {
                return config.appExists
                    ? send(200, { status: "ok", apps: { id: "helena" } })
                    : send(404, { status: "error", statusCode: 404, message: "App not found" });
            }

            if (req.method === "PUT" && req.url === "/v2/app/helena/commit") {
                seen.uploads.push({ contentType: req.headers["content-type"], body });

                if (config.commitReply.status < 400) uploaded = true;

                return send(config.commitReply.status, config.commitReply.body);
            }

            return send(404, { status: "error", message: "rota desconhecida" });
        });
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        await fn({ base, api: `${base}/v2`, versionUrl: `${base}/version`, seen });

    } finally {
        await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
}

// relógio e espera falsos: o "tempo" só anda quando o código dorme
function fakeTime() {
    const clock = { t: 0 };

    return { clock, now: () => clock.t, sleep: async ms => { clock.t += ms; } };
}

function options(ctx, extra = {}) {
    const lines = [];

    const time = fakeTime();

    return {
        lines,
        run: () => deploy({
            zipPath: ZIP,
            commit: NEW,
            token: TOKEN,
            appId: "helena",
            api: ctx.api,
            versionUrl: ctx.versionUrl,
            intervalMs: 1000,
            timeoutMs: 30_000,
            now: time.now,
            sleep: time.sleep,
            log: line => lines.push(line),
            ...extra
        })
    };
}

// ==========================================
// O CAMINHO FELIZ
// ==========================================

test("publicação: confere token e app, envia o zip e só termina quando o bot mostra o commit novo", async () => {
    await withDiscloud({}, async ctx => {
        const { run, lines } = options(ctx);

        const result = await run();

        assert.equal(result.status, "no-ar");
        assert.equal(result.before, OLD);
        assert.equal(result.after, NEW);

        // a versão antiga ainda respondeu 2 vezes depois do envio: é por isso que olhar só "o site responde" não basta
        assert.ok(result.seconds >= 2, `esperou as respostas antigas passarem (${result.seconds} s)`);

        const methods = ctx.seen.requests.filter(r => r.url !== "/version").map(r => `${r.method} ${r.url}`);

        assert.deepEqual(methods, ["GET /v2/user", "GET /v2/app/helena", "PUT /v2/app/helena/commit"]);

        assert.ok(lines.some(line => line.includes("no ar agora: aaaaaaa") && line.includes("a subir: bbbbbbb")));
        assert.ok(lines.at(-1).includes("bbbbbbb"), lines.at(-1));
    });
});

test("o envio é um multipart com o zip no campo \"file\" e o token no cabeçalho api-token (e o /version é público, sem token)", async () => {
    await withDiscloud({}, async ctx => {
        await options(ctx).run();

        const [upload] = ctx.seen.uploads;

        assert.match(upload.contentType, /^multipart\/form-data; boundary=/);

        const head = upload.body.subarray(0, 300).toString("latin1");

        assert.match(head, /name="file"/);
        assert.match(head, /filename="helena\.zip"/);
        assert.ok(upload.body.includes(zipBytes), "o zip inteiro vai no corpo, sem alteração");

        for (const request of ctx.seen.requests) {
            assert.equal(request.token, request.url === "/version" ? undefined : TOKEN, `${request.method} ${request.url}`);
        }
    });
});

test("o token nunca aparece no que o script escreve", async () => {
    await withDiscloud({ commitReply: { status: 200, body: { status: "ok", statusCode: 200, message: `ok (${TOKEN})`, logs: "x" } } }, async ctx => {
        const { run, lines } = options(ctx);

        await run();

        assert.ok(lines.length >= 4);
        assert.ok(!lines.join("\n").includes(TOKEN), "nada de token no log");
        assert.ok(lines.some(line => line.includes("***")), "o trecho do token virou ***");
    });
});

// ==========================================
// ENSAIO E "JÁ ESTÁ NO AR"
// ==========================================

test("ensaio (dry-run): confere token e app e para antes de enviar", async () => {
    await withDiscloud({}, async ctx => {
        const result = await options(ctx, { dryRun: true }).run();

        assert.equal(result.status, "ensaio");
        assert.equal(result.before, OLD);
        assert.equal(ctx.seen.uploads.length, 0, "nada foi enviado");
        assert.ok(ctx.seen.requests.some(r => r.url === "/v2/user"));
        assert.ok(ctx.seen.requests.some(r => r.url === "/v2/app/helena"));
    });
});

test("se esta versão já está no ar, não envia nada (a menos que force)", async () => {
    await withDiscloud({ running: NEW }, async ctx => {
        const skipped = await options(ctx).run();

        assert.equal(skipped.status, "ja-no-ar");
        assert.equal(ctx.seen.uploads.length, 0);
    });

    await withDiscloud({ running: NEW, staleAfterUpload: 0 }, async ctx => {
        const forced = await options(ctx, { force: true }).run();

        assert.equal(forced.status, "no-ar");
        assert.equal(ctx.seen.uploads.length, 1, "com force sobe de novo");
    });
});

test("se o /version não responde antes do envio (bot fora do ar), sobe mesmo assim e espera ele voltar", async () => {
    await withDiscloud({ versionDown: true }, async ctx => {
        const { run } = options(ctx, { timeoutMs: 5000 });

        // o bot nunca volta neste cenário: o envio acontece e a espera acaba no tempo limite
        await assert.rejects(run, error => {
            assert.ok(error instanceof DeployError);
            assert.match(error.message, /não apareceu/);

            return true;
        });

        assert.equal(ctx.seen.uploads.length, 1, "o envio foi feito");
    });
});

// ==========================================
// O QUE DÁ ERRADO
// ==========================================

test("token recusado: erro claro, nada é enviado e o token não vaza na mensagem", async () => {
    await withDiscloud({ token: "outro-token" }, async ctx => {
        await assert.rejects(options(ctx).run, error => {
            assert.ok(error instanceof DeployError);
            assert.match(error.message, /recusou o token/);
            assert.ok(!error.message.includes(TOKEN));

            return true;
        });

        assert.equal(ctx.seen.uploads.length, 0);
    });
});

test("app que não existe na conta: erro que diz qual é o app", async () => {
    await withDiscloud({ appExists: false }, async ctx => {
        await assert.rejects(options(ctx).run, /app "helena" não existe/);

        assert.equal(ctx.seen.uploads.length, 0);
    });
});

test("o Discloud recusa o commit: o erro leva o fim dos logs do app, sem o token", async () => {
    const logs = ["linha 1", `Error: usando ${TOKEN}`, "SyntaxError: algo no helena.mjs"].join("\n");

    await withDiscloud({ commitReply: { status: 200, body: { status: "error", statusCode: 500, message: "Falha ao iniciar", logs } } }, async ctx => {
        await assert.rejects(options(ctx).run, error => {
            assert.ok(error instanceof DeployError);
            assert.match(error.message, /não aceitou o envio/);
            assert.match(error.message, /Falha ao iniciar/);
            assert.match(error.message, /SyntaxError: algo no helena\.mjs/);
            assert.ok(!error.message.includes(TOKEN), "o token foi coberto");

            return true;
        });
    });

    await withDiscloud({ commitReply: { status: 500, body: "<html>Internal Server Error</html>" } }, async ctx => {
        await assert.rejects(options(ctx).run, /HTTP 500/);
    });
});

test("a versão nova não aparece no tempo: falha e manda olhar o log do app", async () => {
    await withDiscloud({ staleAfterUpload: 10_000 }, async ctx => {
        await assert.rejects(options(ctx, { timeoutMs: 10_000 }).run, error => {
            assert.ok(error instanceof DeployError);
            assert.match(error.message, /bbbbbbb não apareceu em 10 s/);
            assert.match(error.message, /o bot diz estar em aaaaaaa/);
            assert.match(error.message, /discloud\.com\/dashboard\/app\/helena\/logs/);

            return true;
        });

        assert.equal(ctx.seen.uploads.length, 1);
    });
});

test("o Discloud fora do ar: erro de rede legível, sem token", async () => {
    let dead;

    await withDiscloud({}, async ctx => { dead = ctx.api; });

    await assert.rejects(
        () => deploy({ zipPath: ZIP, commit: NEW, token: TOKEN, api: dead, versionUrl: dead + "/x", log: () => {} }),
        error => {
            assert.ok(error instanceof DeployError);
            assert.match(error.message, /^GET http:\/\/127\.0\.0\.1:\d+\/v2\/user: /);
            assert.ok(!error.message.includes(TOKEN));

            return true;
        }
    );
});

// ==========================================
// ENTRADAS INVÁLIDAS (nada disso chega a falar com a rede)
// ==========================================

test("entradas inválidas são recusadas antes de qualquer pedido", async () => {
    const base = { zipPath: ZIP, commit: NEW, token: TOKEN, log: () => {}, fetchImpl: async () => { throw new Error("não devia chamar a rede"); } };

    const notZip = path.join(workDir, "nao-e-zip.zip");
    const empty = path.join(workDir, "vazio.zip");

    writeFileSync(notZip, "isto não é um zip");
    writeFileSync(empty, "");

    const cases = [
        [{ token: "" }, /DISCLOUD_TOKEN não está definido/],
        [{ token: undefined }, /DISCLOUD_TOKEN não está definido/],
        [{ token: "abc def" }, /espaço ou quebra de linha/],
        [{ token: "abc\ndef" }, /espaço ou quebra de linha/],
        [{ commit: "abc123" }, /commit inválido/],
        [{ commit: "Z".repeat(40) }, /commit inválido/],
        [{ commit: undefined }, /commit inválido/],
        [{ appId: "../etc" }, /ID do app inválido/],
        [{ appId: "a" }, /ID do app inválido/],
        [{ appId: "Helena" }, /ID do app inválido/],
        [{ zipPath: path.join(workDir, "nao-existe.zip") }, /não achei o zip/],
        [{ zipPath: undefined }, /não achei o zip/],
        [{ zipPath: empty }, /vazio/],
        [{ zipPath: notZip }, /não é um \.zip/]
    ];

    for (const [change, pattern] of cases) {
        await assert.rejects(() => deploy({ ...base, ...change }), error => {
            assert.ok(error instanceof DeployError, JSON.stringify(change));
            assert.match(error.message, pattern, JSON.stringify(change));
            assert.ok(!error.message.includes(TOKEN));

            return true;
        });
    }
});

// ==========================================
// A LINHA DE COMANDO
// ==========================================

function envFor(ctx, extra = {}) {
    return {
        DISCLOUD_TOKEN: TOKEN,
        DISCLOUD_APP_ID: "helena",
        DISCLOUD_API: ctx.api,
        HELENA_VERSION_URL: ctx.versionUrl,
        DEPLOY_INTERVAL_S: "0.01",
        DEPLOY_TIMEOUT_S: "5",
        ...extra
    };
}

test("main: devolve 0 quando sobe, escreve o resumo do GitHub e não imprime o token", async () => {
    await withDiscloud({}, async ctx => {
        const summary = path.join(workDir, "summary-ok.md");

        const out = [];
        const err = [];

        const code = await main([ZIP, `--commit=${NEW}`], envFor(ctx, { GITHUB_STEP_SUMMARY: summary }), { log: line => out.push(line), error: line => err.push(line) });

        assert.equal(code, 0);
        assert.deepEqual(err, []);

        const text = readFileSync(summary, "utf8");

        assert.match(text, /### Subir no Discloud/);
        assert.match(text, /✅ A versão `bbbbbbb` está no ar \(antes: `aaaaaaa`\)/);
        assert.ok(!(out.join("\n") + text).includes(TOKEN));
    });
});

test("main: --dry-run e DRY_RUN=true não enviam nada; --force e FORCE=true sobem de novo", async () => {
    await withDiscloud({}, async ctx => {
        const quiet = { log: () => {}, error: () => {} };

        assert.equal(await main([ZIP, `--commit=${NEW}`, "--dry-run"], envFor(ctx), quiet), 0);
        assert.equal(await main([ZIP, `--commit=${NEW}`], envFor(ctx, { DRY_RUN: "true" }), quiet), 0);

        assert.equal(ctx.seen.uploads.length, 0);
    });

    await withDiscloud({ running: NEW, staleAfterUpload: 0 }, async ctx => {
        const quiet = { log: () => {}, error: () => {} };

        assert.equal(await main([ZIP, `--commit=${NEW}`], envFor(ctx), quiet), 0);
        assert.equal(ctx.seen.uploads.length, 0, "já estava no ar");

        assert.equal(await main([ZIP, `--commit=${NEW}`], envFor(ctx, { FORCE: "true" }), quiet), 0);
        assert.equal(ctx.seen.uploads.length, 1);

        assert.equal(await main([ZIP, `--commit=${NEW}`, "--force"], envFor(ctx), quiet), 0);
        assert.equal(ctx.seen.uploads.length, 2);
    });
});

test("main: devolve 1 e explica quando falha, com o erro no resumo (sem o token)", async () => {
    await withDiscloud({ token: "outro-token" }, async ctx => {
        const summary = path.join(workDir, "summary-erro.md");

        const err = [];

        const code = await main([ZIP, `--commit=${NEW}`], envFor(ctx, { GITHUB_STEP_SUMMARY: summary }), { log: () => {}, error: line => err.push(line) });

        assert.equal(code, 1);
        assert.match(err[0], /^❌ o Discloud recusou o token/);

        const text = readFileSync(summary, "utf8");

        assert.match(text, /❌ \*\*Falhou\.\*\*/);
        assert.ok(!(err.join("\n") + text).includes(TOKEN));
    });
});

test("main: o commit pode vir do GITHUB_SHA e o ID do app do DISCLOUD_APP_ID", async () => {
    await withDiscloud({}, async ctx => {
        const code = await main([ZIP], envFor(ctx, { GITHUB_SHA: NEW }), { log: () => {}, error: () => {} });

        assert.equal(code, 0);
    });

    await withDiscloud({}, async ctx => {
        const err = [];

        const code = await main([ZIP, `--commit=${NEW}`], envFor(ctx, { DISCLOUD_APP_ID: "outro" }), { log: () => {}, error: line => err.push(line) });

        assert.equal(code, 1, "o falso só conhece o app helena");
        assert.match(err[0], /app "outro" não existe/);
    });
});

test("rodando como programa (node scripts/ci/discloud-deploy.mjs): sai com 0 ao subir e com 1 sem token", async () => {
    await withDiscloud({}, async ctx => {
        const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...envFor(ctx) };

        const ok = await run(process.execPath, [SCRIPT, ZIP, `--commit=${NEW}`], { env, encoding: "utf8" });

        assert.match(ok.stdout, /✔ a versão bbbbbbb está no ar/);
        assert.ok(!(ok.stdout + ok.stderr).includes(TOKEN));

        await assert.rejects(
            run(process.execPath, [SCRIPT, ZIP, `--commit=${NEW}`], { env: { ...env, DISCLOUD_TOKEN: "" }, encoding: "utf8" }),
            error => {
                assert.equal(error.code, 1);
                assert.match(error.stderr, /DISCLOUD_TOKEN não está definido/);

                return true;
            }
        );
    });
});

// ==========================================
// O WORKFLOW
// ==========================================

test("o workflow de publicação: manual, com aprovação, o segredo só no job de envio e as actions fixadas por SHA", () => {
    const text = readFileSync(path.join(ROOT, ".github", "workflows", "deploy-discloud.yml"), "utf8");

    // só dispara à mão: nada de push nem de schedule
    assert.match(text, /^on:\n  workflow_dispatch:/m);
    assert.doesNotMatch(text, /^\s{2}(push|pull_request|schedule|pull_request_target):/m);

    // só a main
    assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(text, /merge-base --is-ancestor/);

    // o envio mora num ambiente com aprovação
    assert.match(text, /environment:\n\s+name: production/);

    // o segredo aparece uma vez só, no passo de envio, e as entradas do workflow nunca vão coladas num comando
    assert.equal(text.match(/secrets\.DISCLOUD_TOKEN/g).length, 1);
    assert.doesNotMatch(text, /run:[^\n]*\$\{\{/, "nenhum comando recebe ${{ }} direto");

    const lines = text.split("\n");

    lines.forEach((line, index) => {
        if (!/^\s+run: \|$/.test(line)) return;

        const indent = line.search(/\S/);

        for (let next = index + 1; next < lines.length && (lines[next].trim() === "" || lines[next].search(/\S/) > indent); next += 1) {
            assert.ok(!lines[next].includes("${{"), `script de várias linhas com \${{ }}: ${lines[next].trim()}`);
        }
    });

    // os dois jobs, nesta ordem, e os testes antes do zip
    const build = text.indexOf("\n  build:");
    const deployJob = text.indexOf("\n  deploy:");

    assert.ok(build > 0 && deployJob > build);
    assert.ok(text.indexOf("run: npm test") < text.indexOf("npm run discloud:zip"));
    assert.match(text, /needs: build/);

    // uma publicação por vez, sem cancelar a que está no meio
    assert.match(text, /concurrency:\n\s+group: deploy-discloud\n\s+cancel-in-progress: false/);

    // actions fixadas por SHA (a regra do cb72903)
    for (const use of text.match(/uses: \S+/g)) {
        assert.match(use, /@[0-9a-f]{40}$/, `${use} precisa de SHA`);
    }

    // permissão mínima
    assert.match(text, /permissions:\n  contents: read/);
});

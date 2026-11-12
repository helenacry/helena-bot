// Sobe o bot no Discloud pelo GitHub e confere que a versão NOVA entrou no ar.
//
//   node scripts/ci/discloud-deploy.mjs <zip> --commit=<sha> [--dry-run] [--force]
//
// Ambiente (o workflow .github/workflows/deploy-discloud.yml preenche):
//   DISCLOUD_TOKEN        o token da API do Discloud (SEGREDO do GitHub; nunca vai para o log)
//   DISCLOUD_APP_ID       o ID do app no Discloud (padrão: helena)
//   DISCLOUD_API          a API (padrão: https://api.discloud.app/v2)
//   HELENA_VERSION_URL    onde o bot mostra o commit que roda (padrão: https://helena.discloud.dev/api/version)
//   DEPLOY_TIMEOUT_S      quanto esperar a versão nova aparecer (padrão: 300)
//   DEPLOY_INTERVAL_S     de quantos em quantos segundos olhar (padrão: 10)
//   DRY_RUN=true          só confere o token e o app, sem enviar nada (o mesmo que --dry-run)
//   FORCE=true            sobe mesmo se esse commit já estiver no ar (o mesmo que --force)
//
// O que faz, na ordem:
//   1. confere os dados de entrada (o commit, o ID do app, o zip);
//   2. GET /user: o token é aceito?  GET /app/{id}: o app existe?
//   3. lê o commit que está no ar; se já é este, não faz nada (a menos que --force);
//   4. PUT /app/{id}/commit, com o zip no campo "file";
//   5. espera o /api/version do bot mostrar ESTE commit. É isso que decide: o processo antigo ainda responde
//      enquanto o novo sobe, então "o site respondeu" não prova nada.
//
// Documentação da API: https://docs.discloud.com/api-and-integrations/api-overview/applications.md

import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API = "https://api.discloud.app/v2";
const DEFAULT_VERSION_URL = "https://helena.discloud.dev/api/version";

const COMMIT = /^[0-9a-f]{40}$/;
const APP_ID = /^[a-z0-9-]{2,20}$/;

// o zip do bot tem uns 2 MB; passar muito disso é sinal de que entrou o que não devia
const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export class DeployError extends Error {}

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

const short = commit => (commit ? String(commit).slice(0, 7) : "desconhecido");

// Sobe o zip e espera a versão nova. Devolve { status: "ensaio" | "ja-no-ar" | "no-ar", ... } ou lança DeployError.
export async function deploy({
    zipPath,
    commit,
    token,
    appId = "helena",
    api = DEFAULT_API,
    versionUrl = DEFAULT_VERSION_URL,
    dryRun = false,
    force = false,
    timeoutMs = 300_000,
    intervalMs = 10_000,
    requestTimeoutMs = 120_000,
    fetchImpl = globalThis.fetch,
    sleep = sleepDefault,
    now = Date.now,
    log = console.log
} = {}) {
    // ---------- 1. os dados de entrada ----------

    const secret = String(token ?? "").trim();

    if (!secret) {
        throw new DeployError("DISCLOUD_TOKEN não está definido: é o segredo do GitHub (veja docs/hosting-discloud.md, \"Subir pelo GitHub\").");
    }

    if (/\s/.test(secret)) {
        throw new DeployError("DISCLOUD_TOKEN tem espaço ou quebra de linha no meio: cadastre o segredo de novo, só com o token.");
    }

    // nada que passe por aqui pode mostrar o token
    const redact = text => String(text ?? "").split(secret).join("***");

    const say = line => log(redact(line));

    if (!COMMIT.test(String(commit))) {
        throw new DeployError(`commit inválido "${redact(commit)}": use o SHA completo (40 caracteres hexadecimais).`);
    }

    if (!APP_ID.test(String(appId))) {
        throw new DeployError(`ID do app inválido "${redact(appId)}": o ID do Discloud tem 2 a 20 letras minúsculas, números e hífens.`);
    }

    if (!zipPath || !existsSync(zipPath)) {
        throw new DeployError(`não achei o zip (${redact(zipPath)}). Gere com: npm run discloud:zip`);
    }

    const size = statSync(zipPath).size;

    if (!size || size > MAX_ZIP_BYTES) {
        throw new DeployError(`o zip tem ${size} bytes: ${size ? "grande demais" : "vazio"}.`);
    }

    const bytes = readFileSync(zipPath);

    if (bytes.subarray(0, 4).toString("hex") !== "504b0304") {
        throw new DeployError(`${path.basename(zipPath)} não é um .zip.`);
    }

    // ---------- pedidos ----------

    async function request(method, url, { body, auth = true } = {}) {
        let response;

        try {
            response = await fetchImpl(url, {
                method,
                headers: auth ? { "api-token": secret } : {},
                body,
                signal: AbortSignal.timeout(requestTimeoutMs)
            });

        } catch (error) {
            throw new DeployError(`${method} ${redact(url)}: ${redact(error?.cause?.message ?? error?.message ?? error)}`);
        }

        const text = await response.text().catch(() => "");

        let data = null;

        try {
            data = text ? JSON.parse(text) : null;

        } catch {
            // resposta que não é JSON (uma página de erro): fica só o texto
        }

        return { status: response.status, ok: response.ok, data, text };
    }

    const reason = result => redact(result.data?.message ?? result.text ?? "").slice(0, 300);

    // o commit que o bot diz estar rodando (sem o token: é um endereço público); null se não respondeu
    async function runningCommit() {
        try {
            const result = await request("GET", versionUrl, { auth: false });

            return result.ok && COMMIT.test(String(result.data?.commit)) ? result.data.commit : null;

        } catch {
            return null;
        }
    }

    // ---------- 2. o token e o app ----------

    const user = await request("GET", `${api}/user`);

    if (user.status === 401 || user.status === 403) {
        throw new DeployError("o Discloud recusou o token (DISCLOUD_TOKEN). Gere outro em discloud.com/dashboard e cadastre o segredo de novo.");
    }

    if (!user.ok) {
        throw new DeployError(`GET /user respondeu ${user.status}: ${reason(user)}`);
    }

    say("✔ o Discloud aceitou o token");

    const app = await request("GET", `${api}/app/${appId}`);

    if (app.status === 404) {
        throw new DeployError(`o app "${redact(appId)}" não existe nesta conta do Discloud (DISCLOUD_APP_ID está certo?).`);
    }

    if (!app.ok) {
        throw new DeployError(`GET /app/${redact(appId)} respondeu ${app.status}: ${reason(app)}`);
    }

    say(`✔ o app "${appId}" existe`);

    // ---------- 3. o que está no ar ----------

    const before = await runningCommit();

    say(`• no ar agora: ${short(before)} | a subir: ${short(commit)}`);

    if (dryRun) {
        say("• ensaio: nada foi enviado.");

        return { status: "ensaio", before };
    }

    if (before === commit && !force) {
        say("• esta versão já está no ar: nada a fazer (use force para subir mesmo assim).");

        return { status: "ja-no-ar", before };
    }

    // ---------- 4. o envio ----------

    const form = new FormData();

    form.append("file", new Blob([bytes], { type: "application/zip" }), "helena.zip");

    say(`• enviando ${(size / 1024).toFixed(0)} KB...`);

    const commitResult = await request("PUT", `${api}/app/${appId}/commit`, { body: form });

    if (commitResult.status === 401 || commitResult.status === 403) {
        throw new DeployError("o Discloud recusou o envio (token sem permissão para este app).");
    }

    const explicitFailure = commitResult.data?.status === "error" || Number(commitResult.data?.statusCode) >= 400;

    if (!commitResult.ok || explicitFailure) {
        const logs = redact(commitResult.data?.logs ?? "").trim().split("\n").slice(-30).join("\n");

        throw new DeployError(
            `o Discloud não aceitou o envio (HTTP ${commitResult.status}): ${reason(commitResult) || "sem mensagem"}` +
            (logs ? `\n--- logs do app ---\n${logs}` : "")
        );
    }

    say(`• o Discloud respondeu: ${reason(commitResult) || "ok"}`);

    // ---------- 5. a versão nova no ar ----------

    const startedAt = now();

    let seen = null;

    for (;;) {
        seen = await runningCommit();

        if (seen === commit) {
            const seconds = Math.round((now() - startedAt) / 1000);

            say(`✔ a versão ${short(commit)} está no ar (${seconds} s depois do envio).`);

            return { status: "no-ar", before, after: seen, seconds };
        }

        if (now() - startedAt >= timeoutMs) {
            break;
        }

        await sleep(intervalMs);
    }

    throw new DeployError(
        `a versão ${short(commit)} não apareceu em ${Math.round(timeoutMs / 1000)} s (o bot diz estar em ${short(seen)}). ` +
        "Veja o log em discloud.com/dashboard/app/" + appId + "/logs: se aparecer \"DISCORD_BOT_TOKEN não configurado\", faça um Rebuild."
    );
}

// ==========================================
// LINHA DE COMANDO
// ==========================================

// o resumo que o GitHub mostra no alto da execução
function writeSummary(env, lines) {
    if (env.GITHUB_STEP_SUMMARY) {
        appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
    }
}

const isTrue = value => /^(true|1|sim|on)$/i.test(String(value ?? "").trim());

// Devolve o código de saída (0 = no ar, ou nada a fazer; 1 = falhou).
export async function main(argv = process.argv.slice(2), env = process.env, { log = console.log, error = console.error } = {}) {
    const value = name => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

    const options = {
        zipPath: argv.find(arg => !arg.startsWith("--")),
        commit: value("commit") ?? env.GITHUB_SHA,
        token: env.DISCLOUD_TOKEN,
        appId: env.DISCLOUD_APP_ID || "helena",
        api: env.DISCLOUD_API || DEFAULT_API,
        versionUrl: env.HELENA_VERSION_URL || DEFAULT_VERSION_URL,
        dryRun: argv.includes("--dry-run") || isTrue(env.DRY_RUN),
        force: argv.includes("--force") || isTrue(env.FORCE),
        timeoutMs: (Number(env.DEPLOY_TIMEOUT_S) || 300) * 1000,
        intervalMs: (Number(env.DEPLOY_INTERVAL_S) || 10) * 1000,
        log
    };

    const redact = text => (options.token?.trim() ? String(text).split(options.token.trim()).join("***") : String(text));

    try {
        const result = await deploy(options);

        writeSummary(env, [
            "### Subir no Discloud",
            "",
            result.status === "no-ar"
                ? `✅ A versão \`${short(options.commit)}\` está no ar (antes: \`${short(result.before)}\`).`
                : result.status === "ja-no-ar"
                    ? `⏭️ A versão \`${short(options.commit)}\` já estava no ar: nada foi enviado.`
                    : `🧪 Ensaio: o token e o app estão certos. No ar agora: \`${short(result.before)}\`. Nada foi enviado.`
        ]);

        return 0;

    } catch (failure) {
        const message = redact(failure?.message ?? failure);

        error("❌ " + message);

        writeSummary(env, ["### Subir no Discloud", "", "❌ **Falhou.**", "", "```", message, "```"]);

        return 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}

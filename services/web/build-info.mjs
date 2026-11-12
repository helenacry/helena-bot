
import { readFileSync } from "node:fs";

// ==========================================
// DE QUE COMMIT É O CÓDIGO QUE ESTÁ RODANDO
// ==========================================

// `npm run discloud:zip` escreve o commit num build-info.json dentro do zip (scripts/make-discloud-zip.mjs). A API
// o mostra em GET /api/version, e é assim que a publicação pelo GitHub (scripts/ci/discloud-deploy.mjs) confere que
// a versão NOVA entrou no ar (e não só que algo responde, porque o processo antigo ainda atende enquanto o novo sobe).
// Rodando da pasta do projeto (sem zip), não há arquivo e o commit é null. Nada aqui é segredo: o commit é público.

const FILE = new URL("../../build-info.json", import.meta.url);

const COMMIT = /^[0-9a-f]{40}$/;

export function readBuildInfo(file = FILE) {
    try {
        const data = JSON.parse(readFileSync(file, "utf8"));

        return { commit: COMMIT.test(String(data?.commit)) ? data.commit : null };

    } catch {
        return { commit: null };
    }
}

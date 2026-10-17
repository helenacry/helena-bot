import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

import { db } from "../database/connection.mjs";

// ==========================================
// CONTADOR DE VISUALIZAÇÕES DO /USERINFO
// ==========================================

// O "Visualizações: N" do rodapé do /userinfo: quantas vezes o perfil de cada
// pessoa foi consultado, ligado ao ID dela.
//
// Fica no banco do bot, junto de todo o resto: um lugar só para fazer backup,
// migrar para a nuvem e apagar os dados de alguém. Cada consulta é UMA instrução
// atômica, sem fila em memória. Antes isto era um JSON (generated/userinfo/views.json),
// reescrito inteiro a cada consulta e versionado no Git por engano, com IDs de
// pessoas num repositório público. importLegacyViews() traz o que havia nele.

db.exec(`
    CREATE TABLE IF NOT EXISTS userinfo_views (
        user_id TEXT PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0
            CHECK(views >= 0)
    )
`);

// IDs da VSync têm 18 dígitos ou 36 caracteres (UUID); o limite só barra lixo.
const MAX_ID_LENGTH = 64;

const increment = db.prepare(`
    INSERT INTO userinfo_views (user_id, views)
    VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET views = views + 1
    RETURNING views
`);

const select = db.prepare(`
    SELECT views
    FROM userinfo_views
    WHERE user_id = ?
`);

function cleanId(userId) {
    const id = String(userId ?? "").trim();

    if (!id) {
        throw new Error("ID do usuário não informado.");
    }

    if (id.length > MAX_ID_LENGTH) {
        throw new Error("ID do usuário grande demais.");
    }

    return id;
}

// ==========================================
// INCREMENTAR VISUALIZAÇÕES
// ==========================================

// Devolve a contagem nova. Uma falha aqui não derruba o /userinfo (o comando
// só avisa no log e segue sem o contador).
export async function incrementUserinfoViews(userId) {
    return increment.get(cleanId(userId)).views;
}

// ==========================================
// CONSULTAR VISUALIZAÇÕES
// ==========================================

export async function getUserinfoViews(userId) {
    const id = String(userId ?? "").trim();

    if (!id || id.length > MAX_ID_LENGTH) {
        return 0;
    }

    return select.get(id)?.views ?? 0;
}

// ==========================================
// IMPORTAR O JSON ANTIGO
// ==========================================

// Traz para o banco o que o contador antigo guardou em generated/userinfo/views.json
// e renomeia o arquivo para views.json.imported (nada é apagado). É chamada no
// início do bot (helena.mjs) e NUNCA ao carregar este módulo: assim os testes, que
// carregam o módulo, não consomem o arquivo de verdade.
//
// Segura de repetir: com MAX(), importar duas vezes (ou depois de o banco já ter
// contagens novas) nunca soma em dobro nem diminui nada.
//
// Devolve { imported, file } ou { skipped: motivo }.
export function importLegacyViews(
    file = join(process.cwd(), "generated", "userinfo", "views.json")
) {
    if (!existsSync(file)) {
        return { skipped: "sem arquivo antigo" };
    }

    let parsed;

    try {
        parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
        console.warn("[USERINFO] Contador antigo ilegível, nada foi importado:", error.message);

        return { skipped: "arquivo ilegível" };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { skipped: "formato inesperado" };
    }

    const rows = Object.entries(parsed).filter(([id, views]) =>
        id.trim() !== "" &&
        id.length <= MAX_ID_LENGTH &&
        Number.isSafeInteger(views) &&
        views >= 0
    );

    const insert = db.prepare(`
        INSERT INTO userinfo_views (user_id, views)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET views = MAX(views, excluded.views)
    `);

    db.exec("BEGIN");

    try {
        for (const [id, views] of rows) {
            insert.run(id.trim(), views);
        }

        db.exec("COMMIT");

    } catch (error) {
        db.exec("ROLLBACK");

        throw error;
    }

    // Só depois de gravar com sucesso. Se não der para renomear (disco só de
    // leitura), a importação já está feita e repetir é inofensivo.
    try {
        renameSync(file, file + ".imported");
    } catch (error) {
        console.warn("[USERINFO] Importado, mas não consegui renomear o arquivo antigo:", error.message);
    }

    return { imported: rows.length, file };
}

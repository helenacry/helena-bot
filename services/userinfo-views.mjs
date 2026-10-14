import {
    mkdir,
    readFile,
    writeFile,
    rename
} from "node:fs/promises";

import { join } from "node:path";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

// Na nuvem, aponte HELENA_GENERATED_DIR para o volume (ex.: /data/generated),
// senão o contador volta ao zero a cada deploy. Sem a variável, ./generated.
const DIR = join(
    process.env.HELENA_GENERATED_DIR || join(process.cwd(), "generated"),
    "userinfo"
);

const FILE = join(
    DIR,
    "views.json"
);

let queue = Promise.resolve();

// ==========================================
// CARREGAR CONTADOR
// ==========================================

async function loadViews() {
    try {
        const content = await readFile(
            FILE,
            "utf8"
        );

        const parsed = JSON.parse(content);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            return {};
        }

        return parsed;

    } catch (error) {
        if (error.code !== "ENOENT") {
            console.warn(
                "[USERINFO VIEWS] Não foi possível ler o contador:",
                error.message
            );
        }

        return {};
    }
}

// ==========================================
// SALVAR CONTADOR
// ==========================================

async function saveViews(data) {
    await mkdir(DIR, {
        recursive: true
    });

    const temporaryFile =
        FILE + "." + process.pid + ".tmp";

    await writeFile(
        temporaryFile,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    await rename(
        temporaryFile,
        FILE
    );
}

// ==========================================
// INCREMENTAR VISUALIZAÇÕES
// ==========================================

export function incrementUserinfoViews(userId) {
    const id = String(userId ?? "").trim();

    if (!id) {
        return Promise.reject(
            new Error("ID do usuário não informado.")
        );
    }

    const task = queue
        .catch(() => {})
        .then(async () => {
            const data = await loadViews();

            const current = Number(data[id]);

            const views = Number.isSafeInteger(current)
                ? Math.max(0, current) + 1
                : 1;

            data[id] = views;

            await saveViews(data);

            return views;
        });

    // Uma falha não deve bloquear os próximos
    // incrementos da fila.
    queue = task.catch(() => {});

    return task;
}

// ==========================================
// CONSULTAR VISUALIZAÇÕES
// ==========================================

export async function getUserinfoViews(userId) {
    const id = String(userId ?? "").trim();

    if (!id) {
        return 0;
    }

    // Aguarda gravações anteriores.
    await queue;

    const data = await loadViews();

    const views = Number(data[id]);

    return Number.isSafeInteger(views)
        ? Math.max(0, views)
        : 0;
}
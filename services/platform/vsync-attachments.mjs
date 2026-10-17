
const API = "https://api.vsync.lat";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function botHeaders() {
    const token = process.env.VSYNC_BOT_TOKEN;

    if (!token) {
        throw new Error(
            "VSYNC_BOT_TOKEN não configurado."
        );
    }

    return {
        Authorization: `Bot ${token}`
    };
}

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(
        `${API}${endpoint}`,
        {
            ...options,

            headers: {
                ...botHeaders(),
                ...(options.headers || {})
            }
        }
    );

    const raw = await response.text();

    let data;

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = {
            raw
        };
    }

    if (!response.ok) {
        throw new Error(
            `[VSYNC ATTACHMENT] ${endpoint}: ` +
            `${response.status} ${JSON.stringify(data)}`
        );
    }

    return data;
}

/**
 * Envia um arquivo para um canal do VSync.
 *
 * O conteúdo vem de `bytes` (Buffer em memória): nada é lido
 * nem gravado em disco.
 *
 * Retorna uma referência descartável:
 * att:<id>
 *
 * Essa referência deve ser utilizada em apenas
 * uma mensagem.
 */
export async function uploadVSyncAttachment({
    guildId,
    channelId,
    bytes,
    filename = "arquivo",
    contentType = "image/png"
}) {
    if (!guildId || !channelId) {
        throw new Error(
            "O envio de anexos exige guildId e channelId."
        );
    }

    if (!bytes) {
        throw new Error(
            "Conteúdo do arquivo (bytes) não informado."
        );
    }

    const size = bytes.length;

    if (
        size <= 0 ||
        size > MAX_FILE_BYTES
    ) {
        throw new Error(
            `Tamanho de arquivo inválido: ${size} bytes.`
        );
    }

    // ======================================
    // 1. CONSULTAR LIMITES
    // ======================================

    const limits = await apiRequest(
        "/attachments/limits"
    );

    if (
        Number.isFinite(Number(limits.maxBytes)) &&
        size > Number(limits.maxBytes)
    ) {
        throw new Error(
            `O arquivo excede o limite de ${limits.maxBytes} bytes.`
        );
    }

    if (
        limits.available !== undefined &&
        Number(limits.available) <= 0
    ) {
        throw new Error(
            "O canal não possui vagas disponíveis para anexos."
        );
    }

    // ======================================
    // 2. INICIAR UPLOAD
    // ======================================

    const name = filename;

    const initialized = await apiRequest(
        "/attachments/init",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name,
                size,
                contentType,

                scope: {
                    guildId: String(guildId),
                    channelId: String(channelId)
                }
            })
        }
    );

    const {
        id,
        uploadUrl,
        uploadHeaders
    } = initialized;

    if (!id || !uploadUrl) {
        throw new Error(
            "A API não retornou id ou uploadUrl."
        );
    }

    // ======================================
    // 3. ENVIAR BYTES
    // ======================================

    // IMPORTANTE:
    // Não enviar Authorization aqui.
    // A uploadUrl é uma URL temporária separada.

    const uploadResponse = await fetch(
        uploadUrl,
        {
            method: "PUT",

            headers: {
                ...(uploadHeaders || {}),

                "Content-Type": "application/octet-stream"
            },

            body: bytes
        }
    );

    if (!uploadResponse.ok) {
        throw new Error(
            "Falha no PUT do anexo: " +
            `${uploadResponse.status} ` +
            await uploadResponse.text()
        );
    }

    // ======================================
    // 4. FINALIZAR
    // ======================================

    const completed = await apiRequest(
        `/attachments/${encodeURIComponent(id)}/complete`,
        {
            method: "POST"
        }
    );

    console.log(
        "[VSYNC ATTACHMENT] Upload concluído:",
        {
            id,
            name,
            size
        }
    );

    return {
        id,
        reference: `att:${id}`,
        metadata: completed
    };
}
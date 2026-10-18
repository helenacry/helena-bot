
import sharp from "sharp";

// ==========================================
// IMAGENS DO /USERINFO (AVATAR E BANNER)
// ==========================================

// Um embed mostra a imagem na proporção e no tamanho que a VSync escolher (o avatar saía
// enorme e achatado), então o avatar vai como anexo, já recortado em 500x500, e o banner
// como anexo com no máximo 960x540. Nada é gravado em disco: baixa, redimensiona na memória
// e o envio usa o fluxo de anexos (services/platform/vsync-attachments.mjs).

export const AVATAR_SIZE = 500;

export const BANNER_MAX = Object.freeze({ width: 960, height: 540 });

const MAX_DOWNLOAD_BYTES = 8_000_000;

// A resposta da interação tem 3 segundos: o download não pode passar de uma parte disso.
const DOWNLOAD_TIMEOUT_MS = 2_500;

async function download(url) {
    if (typeof url !== "string" || !/^https:\/\//.test(url)) {
        return null;
    }

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

        if (!response.ok) {
            return null;
        }

        const bytes = Buffer.from(await response.arrayBuffer());

        return bytes.length > 0 && bytes.length <= MAX_DOWNLOAD_BYTES ? bytes : null;

    } catch (error) {
        console.warn("[USERINFO] Imagem indisponível:", error.message);

        return null;
    }
}

// O avatar em PNG 500x500, recortado no centro (sem achatar). null se não deu para baixar ou
// se o arquivo não é uma imagem.
export async function squareAvatar(url) {
    const input = await download(url);

    if (!input) {
        return null;
    }

    try {
        return await sharp(input)
            .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
            .png()
            .toBuffer();

    } catch (error) {
        console.warn("[USERINFO] Avatar inválido:", error.message);

        return null;
    }
}

// O banner em PNG, na proporção original, cabendo em 960x540 (não é ampliado).
export async function bannerImage(url) {
    const input = await download(url);

    if (!input) {
        return null;
    }

    try {
        return await sharp(input)
            .resize({ ...BANNER_MAX, fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();

    } catch (error) {
        console.warn("[USERINFO] Banner inválido:", error.message);

        return null;
    }
}

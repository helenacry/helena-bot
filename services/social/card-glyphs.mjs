
import { readFileSync } from "node:fs";
import path from "node:path";

import { FONTS_DIR } from "./card-fonts.mjs";

// ==========================================
// O QUE O POPPINS DESENHA
// ==========================================

// O cartão do /perfil desenha o texto com o Poppins (assets/fonts). Um caractere que o Poppins não
// tem (símbolo decorativo, japonês, árabe...) sai como um quadradinho no servidor, onde quase não
// há outras fontes. Para o cartão nunca mostrar quadradinhos, o texto de quem joga passa por
// este filtro: só ficam os caracteres que o Poppins realmente tem. A lista vem da tabela "cmap"
// do próprio arquivo da fonte, então acompanha qualquer troca de fonte.

const FONT_FILE = "Poppins-Regular.ttf";

let supported = null;

// Lê a tabela cmap de um TTF e devolve as faixas [início, fim] de códigos que ele desenha.
// Entende os formatos 4 (Unicode básico) e 12 (Unicode completo), que são os do Poppins.
export function readCoverage(buffer) {
    const tables = buffer.readUInt16BE(4);

    let cmap = null;

    for (let i = 0; i < tables; i++) {
        const at = 12 + i * 16;

        if (buffer.toString("latin1", at, at + 4) === "cmap") {
            cmap = buffer.readUInt32BE(at + 8);
        }
    }

    if (cmap === null) {
        return [];
    }

    const count = buffer.readUInt16BE(cmap + 2);

    // o subtipo Unicode mais completo que existir (formato 12 vale mais que o 4)
    let best = null;

    for (let i = 0; i < count; i++) {
        const at = cmap + 4 + i * 8;

        const platform = buffer.readUInt16BE(at);
        const encoding = buffer.readUInt16BE(at + 2);
        const offset = cmap + buffer.readUInt32BE(at + 4);

        const format = buffer.readUInt16BE(offset);

        const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));

        if (unicode && (format === 12 || format === 4) && (!best || format > best.format)) {
            best = { offset, format };
        }
    }

    if (!best) {
        return [];
    }

    const ranges = [];

    if (best.format === 12) {
        const groups = buffer.readUInt32BE(best.offset + 12);

        for (let g = 0; g < groups; g++) {
            const at = best.offset + 16 + g * 12;

            ranges.push([buffer.readUInt32BE(at), buffer.readUInt32BE(at + 4)]);
        }

        return ranges;
    }

    // formato 4: os segmentos têm início, fim e um jeito de achar o glifo; o código só conta se o
    // glifo existe (diferente de 0, o "sem desenho")
    const segments = buffer.readUInt16BE(best.offset + 6) / 2;

    const ends = best.offset + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const offsets = deltas + segments * 2;

    for (let s = 0; s < segments; s++) {
        const end = buffer.readUInt16BE(ends + s * 2);
        const start = buffer.readUInt16BE(starts + s * 2);
        const delta = buffer.readInt16BE(deltas + s * 2);
        const rangeOffset = buffer.readUInt16BE(offsets + s * 2);

        if (start === 0xFFFF) continue;

        let runStart = null;

        for (let code = start; code <= end; code++) {
            let glyph;

            if (rangeOffset === 0) {
                glyph = (code + delta) & 0xFFFF;

            } else {
                const at = offsets + s * 2 + rangeOffset + (code - start) * 2;

                glyph = at + 2 <= buffer.length ? buffer.readUInt16BE(at) : 0;

                if (glyph !== 0) glyph = (glyph + delta) & 0xFFFF;
            }

            if (glyph !== 0 && runStart === null) runStart = code;

            if (glyph === 0 && runStart !== null) {
                ranges.push([runStart, code - 1]);

                runStart = null;
            }
        }

        if (runStart !== null) ranges.push([runStart, end]);
    }

    return ranges;
}

// O conjunto de códigos que o Poppins tem. null se o arquivo não pôde ser lido (aí o filtro não
// remove nada e o cartão se comporta como antes).
function coverage() {
    if (supported !== null) {
        return supported;
    }

    try {
        const set = new Set();

        for (const [start, end] of readCoverage(readFileSync(path.join(FONTS_DIR, FONT_FILE)))) {
            for (let code = start; code <= end && code <= 0x2FFFF; code++) set.add(code);
        }

        supported = set.size > 0 ? set : false;

    } catch {
        supported = false;
    }

    return supported;
}

// O Poppins desenha este caractere (um code point)?
export function canDraw(codePoint) {
    const set = coverage();

    return set === false || set.has(codePoint);
}

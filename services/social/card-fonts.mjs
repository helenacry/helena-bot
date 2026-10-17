
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ==========================================
// FONTES DO CARTÃO
// ==========================================

// O sharp desenha o texto do cartão com as fontes que o fontconfig enxerga. Aqui
// o fontconfig passa a enxergar também as Poppins que vão no projeto
// (assets/fonts), então o cartão sai igual no PC e na nuvem.
//
// Precisa rodar ANTES da primeira vez que o sharp desenha um texto (o fontconfig
// lê a configuração uma vez só); o profile-card.mjs importa este módulo primeiro.
//
// No Linux a variável vale mesmo definida de dentro do processo. No Windows ela só
// vale se já vier no ambiente: lá o Poppins instalado na máquina continua servindo.

export const FONTS_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "assets",
    "fonts"
);

export const FONTS_CONF = path.join(FONTS_DIR, "fonts.conf");

// Quem já definiu FONTCONFIG_FILE (um Dockerfile, um painel) tem a palavra final.
export function useBundledFonts(env = process.env) {
    if (env.FONTCONFIG_FILE || !existsSync(FONTS_CONF)) {
        return false;
    }

    env.FONTCONFIG_FILE = FONTS_CONF;

    return true;
}

useBundledFonts();

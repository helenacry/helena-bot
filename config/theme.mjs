
// ==========================================
// TEMA VISUAL DAS RESPOSTAS DO BOT
// ==========================================

// O chat segue a identidade do site (o livro-caixa: violeta de marca, ouro para dinheiro,
// verde para renda, vermelho para risco, rosa para carinho). As cores abaixo são as do
// tema escuro de site/src/styles/tokens.css, em #rrggbb (a barra do embed exige esse formato).
// O desenho das respostas está em docs/bot-design.md.

import { SITE_URL } from "./site.mjs";

export const PALETTE = Object.freeze({
    violet: "#8555ff",   // marca e ação
    lilac: "#b59dff",    // destaque suave
    gold: "#e7b643",     // dinheiro
    green: "#3ad693",    // renda, deu certo
    red: "#ff6367",      // risco, falha
    pink: "#fa86b6",     // carinho
    slate: "#7684b1",    // espera
    amber: "#ffa746",    // aviso
    grey: "#928ea9"      // neutro
});

// As imagens saem de site/public/bot (npm --prefix site run bot-images) e vão ao ar com o
// site, porque a VSync só mostra imagem de embed por endereço https. Publique o site
// antes de subir um bot que cite uma imagem nova.
export const IMAGE_BASE = `${SITE_URL}bot/`;

// O ícone pequeno que acompanha o nome no topo (autor) e o rodapé de toda resposta.
export const ICON_URL = `${IMAGE_BASE}helena.png`;

// Os humores da pelúcia, cada um com a cor de fundo do carimbo do site:
//   feliz     deu certo, tudo em ordem            dinheiro  dinheiro entrando
//   dormindo  esperando (recarga, energia)        preso     pego ou atrás das grades
//   amor      casamento, família, carinho         alerta    aviso, falta algo
//   triste    erro, recusa, saldo insuficiente    mascara   crime
//   bravo     duelo e combate                     festa     conquista, missão, nível
export const MOODS = Object.freeze([
    "feliz", "dinheiro", "dormindo", "preso", "amor",
    "alerta", "triste", "mascara", "bravo", "festa"
]);

export const moodImage = mood => {
    if (!MOODS.includes(mood)) {
        throw new Error(`Humor desconhecido: ${mood}`);
    }

    return `${IMAGE_BASE}mood-${mood}.png`;
};

// O nome do topo da resposta: "HELENA · BANCO" (a seção da resposta, em maiúsculas).
export const sectionLabel = section => `HELENA · ${String(section).trim().toUpperCase()}`;

// ==========================================
// CENTRAL DE AJUDA (/ajuda)
// ==========================================

// A lista de comandos NÃO fica aqui: a ajuda lê os comandos carregados pelo bot
// (services/command-catalog.mjs), então ela nunca fica desatualizada. Aqui só
// ficam o texto de cada categoria e os ajustes da tela.

export const HELP_CONFIG = Object.freeze({
    // Quantos comandos aparecem por página de uma categoria.
    pageSize: 6,

    // Quantos resultados a busca mostra.
    searchLimit: 10,

    // Onde está a wiki (a página inicial). Mude aqui se o endereço do site mudar.
    wikiUrl: "https://helenacry.github.io/helena-bot/wiki/",

    // O que cada categoria cobre, em uma frase (as categorias estão em
    // config/command-categories.mjs).
    blurbs: Object.freeze({
        economia: "Dinheiro, banco, loja, inventário, trabalho, missões e o mercado do servidor.",
        crime: "Crime, roubo, lavagem de dinheiro e a cadeia.",
        combate: "Duelos, armas, vida e equipamento.",
        progresso: "Conquistas e títulos.",
        social: "Perfil, casamento e informações de usuário.",
        utilidades: "A central de ajuda e o teste de que o bot está no ar."
    })
});

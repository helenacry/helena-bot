
// ==========================================
// RECUSA ESPERADA DE UMA AÇÃO DO JOGO
// ==========================================

// Lançada quando uma regra impede a ação (preso,
// em recarga, sem energia...). O comando mostra
// como aviso. Qualquer outro erro continua sendo
// tratado como falha inesperada.

export class GameBlocked extends Error {
    constructor(title, message) {
        super(message);

        this.name = "GameBlocked";
        this.title = title;
    }
}

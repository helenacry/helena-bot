// Regras da família: o Gozofone (a ligação para o cônjuge) e os filhos do casal.
// A wiki lê estes valores. Dinheiro em centavos, tempos em segundos.

export const FAMILY_RULES = Object.freeze({
    // Quanto tempo a ligação toca. Só o cônjuge atende, então vale para quem está online.
    callTtl: 10,

    // Espera de quem liga (pessoal, não do cônjuge). Volta se o cônjuge recusar ou não atender;
    // se quem ligou cancelar, fica.
    cooldown: 60 * 60,

    // Chance de nascer um filho quando a ligação é atendida (só sem bebê esperando nome e abaixo
    // do limite de filhos). Sem filho, o cônjuge que atendeu recebe um dinheiro.
    childChance: 0.2,

    // Dos nascimentos, quantos são gêmeos.
    twinChance: 0.05,

    // O dinheiro de quem atendeu: de R$ 100,00 a R$ 500,00.
    payoutMin: 10_000,
    payoutMax: 50_000,

    // Tempo para os pais registrarem o nome do bebê; passou, o bebê não é registrado.
    nameWindow: 2 * 60,

    // Tamanho do nome do filho.
    nameMin: 2,
    nameMax: 32,

    // Quantos filhos um casal pode ter.
    maxChildren: 10
});

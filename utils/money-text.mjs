// Dinheiro curto para frases e descrições: 50000 -> "R$ 500", 250 -> "R$ 2,50".
// (O formatMoney de database/economy.mjs é o formato cheio das telas, "R$ 500,00".)
// Usado pelos comandos e pela wiki.
export function reais(cents) {
    const value = cents / 100;

    return "R$ " + value.toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2
    });
}

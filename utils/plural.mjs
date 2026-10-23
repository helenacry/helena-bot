// "1 dia", "2 dias", "1.250 itens": o número com separador de milhar e a palavra no singular ou no plural.
// 0 usa o plural ("0 dias"), como o português fala.
export const plural = (count, one, many = `${one}s`) => {
    const value = Number(count) || 0;

    return `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;
};

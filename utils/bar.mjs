// Barra de progresso em texto, no estilo da energia: "██████░░░░".
// 3, 10 -> "███░░░░░░░". Valor fora do intervalo fica preso nas pontas.
export function progressBar(current, max, size = 10) {
    const ratio = max > 0
        ? Math.max(0, Math.min(1, Number(current) / max))
        : 0;

    const filled = Math.round(ratio * size);

    return "█".repeat(filled) + "░".repeat(size - filled);
}

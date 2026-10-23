
// ==========================================
// RECIBO E CARIMBO
// ==========================================

// O recibo do site (papel térmico, nome e valor ligados por pontilhado) em texto para o chat:
// um bloco de código com uma linha por conta. Serve para o que é número (pagamento, saldo,
// multa). Sem emoji lá dentro: o emoji não tem a largura de uma letra e desalinha a coluna.
//
//   receipt([
//       ["Pagamento", "+R$ 420,00"],
//       ["Experiência", "+25 XP"],
//       null,                                  // uma linha fina separa os grupos
//       ["Carteira", "R$ 1.350,00"]
//   ])
//
//   Pagamento ········ +R$ 420,00
//   Experiência ············ +25 XP
//   ──────────────────────────────
//   Carteira ········· R$ 1.350,00

const LEADER = "·";
const RULE = "─";

// Largura mínima do recibo e a máxima de uma linha antes de passar do que um celular mostra.
const MIN_WIDTH = 28;
const MAX_WIDTH = 38;

const size = text => [...String(text)].length;

// "R$ 1.234,56" vem com espaço rígido do pt-BR; no bloco de código um espaço comum basta.
const tidy = text => String(text ?? "").replace(/ /g, " ").trim();

export function receipt(rows, { width = MIN_WIDTH } = {}) {
    const lines = (rows ?? [])
        .filter(row => row === null || (Array.isArray(row) && row.length >= 2 && row[0] !== undefined && row[1] !== undefined))
        .map(row => (row === null ? null : [tidy(row[0]), tidy(row[1])]));

    // Sem linha de conta, sem recibo.
    if (!lines.some(Boolean)) {
        return "";
    }

    const natural = Math.max(...lines.filter(Boolean).map(([label, value]) => size(label) + size(value) + 4));
    const total = Math.min(Math.max(width, natural), Math.max(MAX_WIDTH, natural));

    const body = lines.map(line => {
        if (line === null) {
            return RULE.repeat(total);
        }

        const [label, value] = line;
        const dots = Math.max(2, total - size(label) - size(value) - 2);

        return `${label} ${LEADER.repeat(dots)} ${value}`;
    });

    // Linha fina no começo ou no fim não faz sentido: tira.
    while (body[0]?.startsWith(RULE)) body.shift();
    while (body.at(-1)?.startsWith(RULE)) body.pop();

    return "```\n" + body.join("\n") + "\n```";
}

// Uma tabela alinhada em bloco de código, para listas (empregos, ranking, armas): cada linha é
// uma lista de colunas e "align" diz como cada coluna se alinha ("l" esquerda, "r" direita; o
// padrão é esquerda, menos a última coluna, que vai à direita). Sem emoji nas células.
//
//   table([["●", "18", "Programador", "R$ 1.000,00"], ...], { align: ["l", "r", "l", "r"] })
export function table(rows, { align = [] } = {}) {
    const lines = (rows ?? []).filter(Array.isArray).map(row => row.map(cell => tidy(cell)));

    if (!lines.length) {
        return "";
    }

    const columns = Math.max(...lines.map(row => row.length));
    const widths = Array.from({ length: columns }, (_unused, index) => Math.max(...lines.map(row => size(row[index] ?? ""))));

    const body = lines.map(row => row
        .map((cell, index) => {
            const side = align[index] ?? (index === columns - 1 && columns > 1 ? "r" : "l");
            const gap = widths[index] - size(cell);

            return side === "r" ? " ".repeat(gap) + cell : cell + " ".repeat(gap);
        })
        .join("  ")
        .trimEnd());

    return "```\n" + body.join("\n") + "\n```";
}

// Dinheiro ou quantidade com sinal, para a coluna do recibo: signed(42000, "R$ 420,00") -> "+R$ 420,00".
// "amount" só decide o sinal (positivo, negativo ou zero); o texto já formatado vem de quem chama.
export function signed(amount, text) {
    const shown = tidy(text).replace(/^[-+−]/, "");

    if (amount > 0) return `+${shown}`;
    if (amount < 0) return `-${shown}`;

    return shown;
}

// O carimbo do site num texto: uma etiqueta em maiúsculas, em código ("`NO LUCRO`"), que o
// chat desenha como uma pastilha. Um por resposta, no máximo.
export const stamp = label => `\`${String(label).trim().toUpperCase().replace(/`/g, "'")}\``;

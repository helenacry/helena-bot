
// ==========================================
// RECIBO E CARIMBO
// ==========================================

// As contas de uma resposta em texto para o chat: uma linha por
// conta, com o emoji do assunto, uma barra e o valor em negrito.
//
//   receipt([
//       ["Pagamento", "+R$ 420,00"],
//       ["Experiência", "+25 XP"],
//       null,                                  // uma linha em branco separa os grupos
//       ["Carteira", "R$ 1.350,00"]
//   ])
//
//   💵 | Pagamento: **+R$ 420,00**
//   ✨ | Experiência: **+25 XP**
//
//   👛 | Carteira: **R$ 1.350,00**
//
// O emoji sai do nome da conta (iconFor): os nomes mais comuns têm o seu, o resto cai numa lista
// de palavras e, por fim, num marcador comum. O site tem o recibo dele (o papel térmico, em
// site/src/lib/sim.ts): é outro desenho e fica como está.

import { icon } from "../services/platform/app-emojis.mjs";

// "R$ 1.234,56" vem com espaço rígido do pt-BR; no chat um espaço comum basta.
const tidy = text => String(text ?? "").replace(/ /g, " ").trim();

const plain = text => tidy(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Os emojis de cada conta, pelo nome sem acento e em minúsculas. Cada grupo é o emoji e os nomes.
const EXACT = new Map([
    ["💵", ["pagamento", "salario", "recompensa", "recebeu", "bonus", "retorno", "retorno esperado", "devolve", "levou no total", "pagou", "sacado", "depositado", "enviado", "total arrecadado (sujo)"]],
    ["👛", ["carteira", "limpo na carteira"]],
    ["🏦", ["banco"]],
    ["🏛️", ["patrimonio"]],
    ["💎", ["gemas"]],
    ["⚡", ["energia", "regeneracao", "trabalhar custa", "dá para trabalhar", "da para trabalhar"]],
    ["✨", ["experiencia", "progressao", "proximo ponto"]],
    ["⭐", ["nivel", "seu nivel"]],
    ["🔒", ["nivel exigido"]],
    ["💼", ["cargo", "emprego"]],
    ["🧾", ["total", "custo", "preco por ponto", "precos", "item", "vaga"]],
    ["🧼", ["lavanderia", "lavando", "falta de lavagem"]],
    ["💸", ["dinheiro sujo", "valor sujo", "total sujo"]],
    ["⏳", ["recarga", "termina em", "tempo restante", "atualiza em", "proxima coleta", "duracao", "faltam", "ainda tem"]],
    ["⛓️", ["prisao", "pena restante", "pena total", "pena cortada", "pena acrescentada", "preso por mais", "corte por fugas"]],
    ["🔫", ["arma", "municao", "municao agora", "chance da arma", "dano", "velocidade"]],
    ["🛡️", ["defesa", "protecao", "protecao contra duelos"]],
    ["🎒", ["inventario", "quantidade", "vai descartar", "sobrara"]],
    ["🏆", ["vitorias", "sucessos"]],
    ["💀", ["derrotas"]],
    ["🚔", ["capturas"]],
    ["🦹", ["crimes"]],
    ["📈", ["indice", "economia"]],
    ["📝", ["motivo", "tipo", "etapa"]]
].flatMap(([emoji, names]) => names.map(name => [name, emoji])).map(([name, emoji]) => [plain(name), emoji]));

// O que não está na lista acima cai nas palavras que o nome tem.
const KEYWORDS = [
    [/sujo|lavag|lavand/, "🧼"],
    [/tempo|restante|falta|termina|recarga|pena|prazo|atualiza|proxim|coleta|duracao/, "⏳"],
    [/nivel|xp|experiencia|progress/, "✨"],
    [/dinheiro|valor|pag|salario|recompensa|retorno|devolve|preco|custo|total/, "💵"],
    [/arma|municao|dano|colete/, "🔫"],
    [/item|invent|quantidade/, "🎒"]
];

export const BULLET = "🔹";
/** O emoji de uma conta, pelo nome: iconFor("Pagamento") -> "💵". */
export function iconFor(label) {
    const key = plain(label);

    const found = EXACT.get(key) ?? KEYWORDS.find(([pattern]) => pattern.test(key))?.[1] ?? BULLET;

    return icon(found);
}

export function receipt(rows) {
    const lines = [];

    for (const row of rows ?? []) {
        if (row === null) {
            // um grupo novo: uma linha em branco, mas nunca no começo nem duas seguidas
            if (lines.length && lines.at(-1) !== "") lines.push("");

            continue;
        }

        if (!Array.isArray(row) || row.length < 2 || row[0] === undefined || row[1] === undefined) {
            continue;
        }

        const label = tidy(row[0]);
        const value = tidy(row[1]);

        lines.push(value ? `${iconFor(label)} | ${label}: **${value}**` : `${iconFor(label)} | ${label}`);
    }

    // linha em branco no fim não faz sentido: tira
    while (lines.at(-1) === "") lines.pop();

    return lines.join("\n");
}

// Dinheiro ou quantidade com sinal, para o valor da conta: signed(42000, "R$ 420,00") -> "+R$ 420,00".
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

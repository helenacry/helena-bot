
import { prisonBlock } from "../crime/prison.mjs";

import { normalizeName } from "../platform/user-lookup.mjs";

import { warningEmbed } from "../../utils/embed.mjs";

// ==========================================
// FERRAMENTAS DOS PAINÉIS
// ==========================================

// Peças usadas por todos os painéis (banco, lavagem, bio, loja,
// inventário): botões, respostas privadas, execução de comandos a
// partir de um formulário e leitura de quantidades digitadas.

// ==========================================
// COMPONENTES
// ==========================================

export const button = (
    customId,
    label,
    emoji,
    style = "secondary",
    extra = {}
) => ({
    type: "button",
    customId,
    label,
    ...(emoji ? { emoji } : {}),
    style,
    ...extra
});

export const row = (...components) => ({ type: "row", components });

// ==========================================
// RESPOSTAS
// ==========================================

// Marca uma resposta de mensagem como privada (só quem agiu vê).
export function priv(response) {
    return response?.type === "message"
        ? { ...response, data: { ...response.data, ephemeral: true } }
        : response;
}

export const warn = (title, message) => priv(warningEmbed(title, message));

export const notYours = () => warn(
    "Esse painel é de outra pessoa",
    "Use o comando para abrir o seu próprio painel."
);

export const sameUser = (interaction, ownerId) =>
    String(interaction.user?.id) === String(ownerId);

// Troca o conteúdo da mensagem em que o botão ou menu foi clicado
// (resposta "update"): a navegação dos painéis usa isso.
export function update(view) {
    return {
        type: "update",
        data: {
            embeds: view.embeds ?? [view.embed],
            components: view.components
        }
    };
}

// ==========================================
// EXECUTAR UM COMANDO A PARTIR DO MODAL
// ==========================================

export async function runCommand(
    comandos,
    name,
    options,
    interaction,
    { ephemeral = true } = {}
) {
    const comando = comandos.get(name);

    if (!comando) {
        return warn("Indisponível", "Esse comando não está disponível.");
    }

    // Preso não movimenta dinheiro: vale também pelos modais.
    const blocked = prisonBlock(
        name,
        interaction.guildId,
        interaction.user?.id
    );

    if (blocked) {
        return priv(blocked);
    }

    const result = await comando.execute({
        id: interaction.id,
        type: "command",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: interaction.user,
        data: { name, options }
    });

    return ephemeral ? priv(result) : result;
}

// ==========================================
// BUSCA POR TEXTO
// ==========================================

// Acha entradas por nome ou ID, sem diferenciar maiúsculas nem
// acentos. Devolve só as do melhor grau: igual > começa com >
// contém (a partir de 2 letras). namesOf(entrada) -> textos.
export function findByText(list, query, namesOf) {
    const wanted = normalizeName(query);

    if (!wanted) {
        return [];
    }

    let best = Infinity;

    const ranked = [];

    for (const entry of list) {
        let rank = Infinity;

        for (const name of namesOf(entry).map(normalizeName)) {
            if (!name) {
                continue;
            }

            if (name === wanted) {
                rank = Math.min(rank, 1);

            } else if (name.startsWith(wanted)) {
                rank = Math.min(rank, 2);

            } else if (wanted.length >= 2 && name.includes(wanted)) {
                rank = Math.min(rank, 3);
            }
        }

        if (rank < Infinity) {
            ranked.push({ entry, rank });

            best = Math.min(best, rank);
        }
    }

    return ranked
        .filter(item => item.rank === best)
        .map(item => item.entry);
}

// ==========================================
// QUANTIDADE DIGITADA
// ==========================================

// "3" -> número; "" -> 1; "tudo", "all" ou "max" -> todas;
// "metade" ou "half" -> metade; qualquer outra coisa -> inválida.
export function parseQuantity(text) {
    const raw = normalizeName(text);

    if (raw === "") {
        return { kind: "number", value: 1 };
    }

    if (["tudo", "all", "max", "maximo"].includes(raw)) {
        return { kind: "all" };
    }

    if (["metade", "half"].includes(raw)) {
        return { kind: "half" };
    }

    if (/^\d+$/.test(raw)) {
        const value = Number(raw);

        return Number.isSafeInteger(value) && value >= 1
            ? { kind: "number", value }
            : { kind: "invalid" };
    }

    return { kind: "invalid" };
}

// Converte a quantidade digitada em número, dado quanto existe
// (todas = tudo, metade = arredonda para cima). Devolve null se
// for inválida.
export function resolveQuantity(parsed, available) {
    if (parsed.kind === "number") {
        return parsed.value;
    }

    if (parsed.kind === "all") {
        return available;
    }

    if (parsed.kind === "half") {
        return Math.ceil(available / 2);
    }

    return null;
}

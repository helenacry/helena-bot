
import { getEnergy } from "./energy.mjs";

import { prisonBlock } from "./prison.mjs";

import { safeText } from "./user-lookup.mjs";

import {
    openModal,
    textField,
    readFields
} from "./modals.mjs";

import {
    usableItems,
    useItem,
    describeUse
} from "./use-item.mjs";

import {
    button,
    row,
    findByText,
    notYours,
    parseQuantity,
    priv,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

// ==========================================
// PAINEL DE USO DE ITENS
// ==========================================

// /usaritem sem argumentos abre este painel: um menu com os itens
// usáveis (comer, beber, equipar). Escolher um item usa 1 unidade
// na hora; "Usar vários" abre um formulário com item e quantidade.
//
//   uso:sel:<dono>       menu (usa 1 unidade do item escolhido)
//   uso:varios:<dono>    abre o formulário de quantidade
//   uso:ref:<dono>       atualiza o painel

const MAX_OPTIONS = 25;

// ==========================================
// TELA
// ==========================================

export function buildUseView({ ownerId, guildId, userId, notice = "" }) {
    const usable = usableItems(guildId, userId);

    const energy = getEnergy(guildId, userId);

    const lines = usable.map(({ item, quantity, use }) =>
        use.kind === "equip"
            ? `${item.emoji} **${item.name}** — ${use.verb}`
            : `${item.emoji} **${item.name}** ×${quantity} — ` +
              `${use.verb} (+${use.energy} de energia)`
    );

    const embed = createEmbed({
        title: "🍽️ Usar item",

        description:
            (notice ? notice + "\n\n" : "") +
            `⚡ **Energia:** ${energy.energy}/${energy.max}\n\n` +
            (
                lines.length
                    ? lines.join("\n")
                    : "Você não tem nenhum item para usar. " +
                      "Compre comida e bebida na `/loja`."
            ),

        color: HELENA_COLORS.success,

        footer:
            "Helena • Escolha no menu para usar 1 unidade. " +
            "Comida com energia cheia não é gasta."
    });

    const components = [];

    if (usable.length > 0) {
        components.push(row({
            type: "select",
            customId: `uso:sel:${ownerId}`,
            placeholder: "🍽️ Escolha um item para usar",
            minValues: 1,
            maxValues: 1,
            options: usable.slice(0, MAX_OPTIONS).map(({ item, quantity, use }) => ({
                label: (
                    use.kind === "equip"
                        ? `${use.verb} ${item.name}`
                        : `${use.verb} ${item.name} (×${quantity})`
                ).slice(0, 100),
                value: item.id,
                description: use.kind === "equip"
                    ? "Equipa a arma"
                    : `+${use.energy} de energia`,
                emoji: item.emoji
            }))
        }));
    }

    components.push(row(
        button(
            `uso:varios:${ownerId}`,
            "Usar vários",
            "🔢",
            "primary",
            { disabled: usable.every(entry => entry.use.kind === "equip") }
        ),
        button(`uso:ref:${ownerId}`, "Atualizar", "🔄")
    ));

    return { embed, components, usable };
}

// ==========================================
// CLIQUES
// ==========================================

// Mensagem de resultado privada (modal e erros).
const result = (title, description, color) => priv({
    type: "message",
    data: {
        embeds: [createEmbed({
            title,
            description,
            color,
            footer: "Helena • Usar item"
        })]
    }
});

function blockedInPrison(interaction) {
    const blocked = prisonBlock(
        "usaritem",
        interaction.guildId,
        interaction.user?.id
    );

    return blocked ? priv(blocked) : null;
}

// customId: uso:<ação>:<dono>
export function handleUseClick(interaction) {
    const [, action, ownerId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (action === "ref") {
        return update(buildUseView({ ownerId, guildId, userId }));
    }

    if (action === "varios") {
        return openModal({
            customId: "uso:varios",
            title: "Usar vários itens",
            fields: [
                textField({
                    id: "item",
                    label: "Item (nome ou ID)",
                    placeholder: "Ex.: maçã ou café",
                    maxLength: 60
                }),
                textField({
                    id: "quantidade",
                    label: "Quantidade (número ou max)",
                    placeholder: "max usa até a energia encher",
                    value: "1",
                    required: false,
                    maxLength: 4
                })
            ]
        });
    }

    if (action === "sel") {
        const itemId = interaction.data?.values?.[0];

        const blocked = blockedInPrison(interaction);

        if (blocked) {
            return blocked;
        }

        try {
            const used = useItem(guildId, userId, itemId, 1);

            return update(buildUseView({
                ownerId,
                guildId,
                userId,
                notice: describeUse(used)
            }));

        } catch (error) {
            return rejection(error);
        }
    }

    return warn("Botão desconhecido", "Esse botão não é reconhecido.");
}

// GameBlocked vira aviso privado; o resto é falha inesperada.
function rejection(error) {
    if (error?.name === "GameBlocked") {
        return warn(error.title, error.message);
    }

    console.error("[USARITEM]", error);

    return warn("Não foi possível usar", error.message);
}

// ==========================================
// FORMULÁRIO "USAR VÁRIOS"
// ==========================================

// Resolve o item digitado entre os usáveis que a pessoa tem.
export function findUsable(guildId, userId, text) {
    return findByText(
        usableItems(guildId, userId),
        text,
        entry => [entry.item.id, entry.item.name]
    );
}

export function handleUseModal(interaction) {
    const fields = readFields(interaction);

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const query = (fields.item ?? "").trim();

    if (!query) {
        return warn("Faltou o item", "Diga o nome ou o ID do item.");
    }

    const matches = findUsable(guildId, userId, query);

    if (matches.length === 0) {
        return warn(
            "Item não encontrado",
            "Você não tem nenhum item usável chamado **" +
            safeText(query) + "**."
        );
    }

    if (matches.length > 1) {
        return warn(
            "Mais de um item encontrado",
            "Vários itens combinam com **" + safeText(query) + "**:\n\n" +
            matches.slice(0, 5).map(entry => "• " + entry.item.name).join("\n") +
            "\n\nSeja mais específico."
        );
    }

    const parsed = parseQuantity(fields.quantidade);

    const quantity = parsed.kind === "number"
        ? parsed.value
        : parsed.kind === "all"
            ? "max"
            : null;

    if (quantity === null) {
        return warn(
            "Quantidade inválida",
            "Use um número inteiro maior que zero, ou `max`."
        );
    }

    const blocked = blockedInPrison(interaction);

    if (blocked) {
        return blocked;
    }

    try {
        return result(
            "🍽️ Itens usados",
            describeUse(
                useItem(guildId, userId, matches[0].item.id, quantity)
            ),
            HELENA_COLORS.success
        );

    } catch (error) {
        return rejection(error);
    }
}

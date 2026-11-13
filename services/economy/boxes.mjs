import { randomInt } from "node:crypto";

import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { getItem } from "../../config/items.mjs";

import {
    BOX_TIER_ORDER,
    MAX_OPEN_AT_ONCE,
    getBox
} from "../../config/boxes.mjs";

import {
    addItem,
    getItemQuantity,
    removeItem
} from "./inventory.mjs";

import { recordPurchase } from "./food.mjs";

import { tx, now as clock } from "../combat/combat.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

// ==========================================
// ABRIR PACOTES E CAIXAS
// ==========================================

// Abrir gasta a unidade e entrega o que há dentro (config/boxes.mjs). Tudo numa transação só: ou gasta e entrega,
// ou não muda nada.
//
//   PACOTE (fixed)   entrega sempre o mesmo conteúdo. Se algum item não couber (já está no máximo), nada é
//                    aberto e a pessoa é avisada: pacote comprado não pode perder item.
//   CAIXA (random)   sorteia um prêmio da tabela para cada uma:
//                      - dinheiro entra na carteira (e no extrato, como "box_open");
//                      - item entra no inventário; se não couber, vira dinheiro (o "fallback" do prêmio);
//                      - com a carteira quase no teto entra só o que cabe e o resto se perde (avisa em "lost").
//                    A caixa NUNCA é comprada: este serviço não sabe de preço, e quem a entrega é de graça.
//
// Comida que sai daqui começa a vencer na hora da abertura.

// o teto da carteira, o mesmo da loja
const MAX_CENTS = 100_000_000_000_000;

const unit = () => randomInt(0, 1_000_000) / 1_000_000;

// O sorteio de verdade é o do Node (crypto). Os testes trocam por um combinado, como na bolsa
// (setMarketRandom); sem argumento volta ao de verdade.
let boxRandom = unit;

export function setBoxRandom(fn) {
    boxRandom = fn ?? unit;
}

// Sorteia um prêmio. "random" devolve um número de 0 a menos de 1 (vem de fora para os testes).
export function rollPrize(box, random = unit) {
    const total = box.prizes.reduce((sum, prize) => sum + prize.weight, 0);

    let point = random() * total;

    for (const prize of box.prizes) {
        point -= prize.weight;

        if (point < 0) {
            return prize;
        }
    }

    // sobra de arredondamento: o último prêmio
    return box.prizes.at(-1);
}

// Quanto de dinheiro um prêmio de dinheiro dá: um valor inteiro em reais entre min e max.
function rollMoney(prize, random) {
    const [min, max] = prize.money;

    const reais = (max - min) / 100 + 1;

    return min + Math.floor(random() * reais) * 100;
}

// Quantos pacotes dá para abrir sem passar do limite de nenhum item do conteúdo.
export function packRoom(guildId, userId, box) {
    return Math.min(
        ...box.contents.map(({ item, quantity }) => {
            const room = getItem(item).maxStack - getItemQuantity(guildId, userId, item);

            return Math.max(0, Math.floor(room / quantity));
        })
    );
}

// Abre "quantity" (um número ou "max"). Devolve, nos dois tipos:
//   { kind, item, opened, remaining, money, lost, wallet, received, prizes }
//   received   itens que entraram no inventário: [{ item, quantity }]
//   prizes     só na caixa sorteada: [{ prize, count, money, items, converted }], da mais rara para a mais comum
//              (count = quantas vezes saiu, money = dinheiro total que veio dele, já com a conversão,
//              items = unidades de item que realmente entraram, converted = quantas viraram dinheiro)
export function openBoxes(
    guildId,
    userId,
    itemId,
    quantity = 1,
    { random = boxRandom, now = clock() } = {}
) {
    const item = getItem(itemId);

    const box = getBox(itemId);

    if (!item || !box) {
        throw new GameBlocked(
            "Isso não abre",
            item
                ? `${item.emoji} **${item.name}** não pode ser aberto.`
                : "Esse item não existe."
        );
    }

    getPlayer(guildId, userId);

    return tx(() => {
        const owned = getItemQuantity(guildId, userId, itemId);

        if (owned < 1) {
            throw new GameBlocked(
                "Você não tem esse item",
                `Você não possui ${item.emoji} **${item.name}**.` +
                (item.buyPrice ? " Compre na `/loja`." : "")
            );
        }

        const wanted = quantity === "max" ? Math.min(owned, MAX_OPEN_AT_ONCE) : quantity;

        if (!Number.isInteger(wanted) || wanted < 1) {
            throw new GameBlocked(
                "Quantidade inválida",
                "Use um número inteiro maior que zero, ou `max`."
            );
        }

        if (wanted > MAX_OPEN_AT_ONCE) {
            throw new GameBlocked(
                "Quantidade inválida",
                `Dá para abrir no máximo ${MAX_OPEN_AT_ONCE} de uma vez.`
            );
        }

        if (wanted > owned) {
            throw new GameBlocked(
                "Quantidade inválida",
                `Você tem **${owned}** de ${item.emoji} ${item.name}.`
            );
        }

        return box.kind === "fixed"
            ? openPack({ guildId, userId, item, box, wanted, owned, now })
            : openRandom({ guildId, userId, item, box, wanted, owned, random, now });
    });
}

// ----- pacote -----

function openPack({ guildId, userId, item, box, wanted, owned, now }) {
    const room = packRoom(guildId, userId, box);

    if (room < wanted) {
        const tight = box.contents
            .map(content => ({ ...content, data: getItem(content.item) }))
            .find(({ data, quantity }) =>
                data.maxStack - getItemQuantity(guildId, userId, data.id) < quantity * wanted
            );

        throw new GameBlocked(
            "Não cabe no inventário",
            room < 1
                ? `Você não tem espaço para abrir ${item.emoji} **${item.name}**: ` +
                  `${tight.data.emoji} ${tight.data.name} já está em ` +
                  `${getItemQuantity(guildId, userId, tight.data.id)}/${tight.data.maxStack}.`
                : `Agora só dá para abrir **${room}** de ${item.emoji} ${item.name}: ` +
                  `${tight.data.emoji} ${tight.data.name} não cabe mais que isso.`
        );
    }

    removeItem(guildId, userId, item.id, wanted);

    const received = [];

    for (const { item: contentId, quantity } of box.contents) {
        addItem(guildId, userId, contentId, quantity * wanted);

        recordPurchase(guildId, userId, contentId, quantity * wanted, { now });

        received.push({ item: getItem(contentId), quantity: quantity * wanted });
    }

    return {
        kind: "fixed",
        item,
        opened: wanted,
        remaining: owned - wanted,
        money: 0,
        lost: 0,
        wallet: getPlayer(guildId, userId).wallet,
        received,
        prizes: []
    };
}

// ----- caixa sorteada -----

function openRandom({ guildId, userId, item, box, wanted, owned, random, now }) {
    removeItem(guildId, userId, item.id, wanted);

    const byPrize = new Map();

    const receivedItems = new Map();

    let money = 0;

    for (let i = 0; i < wanted; i++) {
        const prize = rollPrize(box, random);

        const entry = byPrize.get(prize.id) ?? { prize, count: 0, money: 0, items: 0, converted: 0 };

        byPrize.set(prize.id, entry);

        entry.count += 1;

        if (prize.money) {
            const cents = rollMoney(prize, random);

            entry.money += cents;
            money += cents;

            continue;
        }

        const prizeItem = getItem(prize.item);

        const fits = prize.quantity <= prizeItem.maxStack - getItemQuantity(guildId, userId, prize.item);

        if (fits) {
            addItem(guildId, userId, prize.item, prize.quantity);

            recordPurchase(guildId, userId, prize.item, prize.quantity, { now });

            entry.items += prize.quantity;

            receivedItems.set(prize.item, (receivedItems.get(prize.item) ?? 0) + prize.quantity);

        } else {
            entry.converted += 1;
            entry.money += prize.fallback;
            money += prize.fallback;
        }
    }

    const player = getPlayer(guildId, userId);

    const credit = Math.max(0, Math.min(money, MAX_CENTS - player.wallet));

    if (credit > 0) {
        const paid = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
        `).run(credit, guildId, userId, MAX_CENTS - credit);

        if (paid.changes !== 1) {
            throw new Error("Não foi possível entregar o dinheiro da caixa.");
        }

        db.prepare(`
            INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
            VALUES (?, ?, NULL, 'box_open', ?)
        `).run(guildId, userId, credit);
    }

    const prizes = [...byPrize.values()].sort((a, b) =>
        BOX_TIER_ORDER.indexOf(b.prize.tier) - BOX_TIER_ORDER.indexOf(a.prize.tier) ||
        b.count - a.count ||
        a.prize.id.localeCompare(b.prize.id)
    );

    return {
        kind: "random",
        item,
        opened: wanted,
        remaining: owned - wanted,
        money: credit,
        lost: money - credit,
        wallet: player.wallet + credit,
        received: [...receivedItems].map(([id, quantity]) => ({ item: getItem(id), quantity })),
        prizes
    };
}

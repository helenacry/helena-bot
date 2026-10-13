---
title: Armas
description: As armas da loja, o dano de cada uma, como equipar e como elas gastam munição e durabilidade.
---

Arma serve para duelar e é **obrigatória para roubar**. Há armas brancas, que não gastam munição, e armas de fogo, que gastam.

## As armas

O preço da tabela é o da `/loja` quando o índice da [bolsa](wiki:economy/market) está no meio. A coluna de chance é a de um [roubo](wiki:crime/robbery).

{{table:weapons}}

O **ID** (o código na primeira coluna) é o que você usa para equipar.

## Como equipar

- **`/comprar`** ou a `/loja` (prateleira **Armas**) para comprar.
- **`/equipar item:revolver`** equipa a arma pelo ID. Também dá para equipar pelo menu do **`/usaritem`**.
- **`/desequipar`** guarda a arma de volta no inventário.

Só uma arma fica equipada por vez, e ela precisa estar no seu inventário. **Armas não podem ser vendidas.**

## Munição

Armas de fogo precisam de munição:

- cada **duelo** gasta **1 munição** de quem usa arma de fogo;
- cada **roubo bem-sucedido** gasta **1 munição**. Roubo que falha **não gasta**;
- a munição custa **{{v:armory.ammoPrice}}** cada, comprada com **`/municao quantidade:N`** (de 1 a {{v:armory.maxAmmo}} por compra);
- **`/recarregar`** mostra quanta munição você tem com a arma de fogo equipada.

## Durabilidade

Toda arma tem **{{v:armory.maxDurability}} pontos** de durabilidade e gasta **1 ponto por duelo** (e 1 por roubo bem-sucedido). Sem durabilidade, a arma não duela nem rouba.

**`/reparar`** custa **{{v:armory.repairPrice}}** e leva a durabilidade de volta a {{v:armory.maxDurability}}. Precisa de uma arma equipada.

> [!WARNING]
> Comprar, equipar, reparar e comprar munição ficam bloqueados enquanto você está na cadeia. Deixe a arma pronta antes de arriscar um crime.

## Qual comprar?

- **Para duelar**, o que conta é o dano: a tabela mostra o de cada uma.
- **Para roubar**, o que conta é a chance. Compare as duas colunas com o preço antes de gastar.

{{cards: combat/duels, combat/health-and-gear, crime/robbery}}

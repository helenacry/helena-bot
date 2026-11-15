---
title: Pesca
description: Como pescar com a vara, o que pode sair, quanto vale cada coisa e como a pesca se encaixa na energia e na recarga.
---

O `/pescar` (atalho: `/fish`) lança a linha e traz um peixe, um lixo ou nada. É uma renda extra, simples e sem risco, que complementa o `/trabalhar`.

## Resumo

| O que | Como funciona |
| --- | --- |
| O que precisa | Uma 🎣 **Vara de pesca** no inventário ({{v:fishing.rodPrice}} na `/loja`, prateleira Ferramentas). |
| Energia | Cada lançamento custa **{{v:fishing.energy}}** de energia. |
| Recarga | Dá para pescar de novo a cada **{{v:fishing.cooldown}}**. |
| XP | **{{v:fishing.xp}} XP** por lançamento, pegando ou não alguma coisa. |
| Onde vale | Em cada servidor, com a sua energia e a sua recarga. |

## Como funciona

1. Compre a vara na `/loja` (cada pessoa só pode ter uma).
2. Use `/pescar`. A Helena confere a vara, a recarga e a energia, e sorteia o que veio.
3. O item cai direto no **inventário**. Venda com o `/vender` ou guarde.

A pesca **não paga na hora**: o que você pega é um item, e o dinheiro vem quando você o vende, pelo preço do [mercado](wiki:economy/market). O item em alta da bolsa pode ser um peixe, e aí ele paga mais na venda.

## O que pode sair

A chance de cada linha é fixa, e a soma é 100%:

{{table:fish}}

- Os **lixos** valem quase nada, mas ocupam um espaço de inventário como qualquer item.
- Quanto mais raro, mais vale e menor a chance. O pirarucu é o prêmio máximo.
- Cada item tem um **limite** de 99 unidades no inventário. Se você já tem 99 do que pescou, ele é **vendido na hora** pelo preço de tabela, e o dinheiro vai para a carteira.

## Energia e recarga

A pesca divide a energia com o trabalho, o crime e o resto ([Energia](wiki:character/energy)). Ela é barata (**{{v:fishing.energy}}**, contra {{v:work.energy}} do trabalho), mas rende pouco por lançamento: o trabalho mais fraco paga mais por hora do que a pesca no máximo da recarga. A pesca é um complemento para quando o trabalho está esperando, ou para quem quer colecionar.

> [!NOTE]
> Preso, você **não pesca**: o `/pescar` fica bloqueado durante a pena, como o `/trabalhar`. Veja [Procurados e prisão](wiki:crime/wanted-and-prison).

O `/cooldowns` mostra quando a próxima pescaria libera. Sem a vara, a linha avisa que você precisa dela.

Veja também [Loja e inventário](wiki:economy/shop-and-inventory).

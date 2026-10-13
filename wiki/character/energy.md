---
title: Energia
description: Quanta energia você tem, quanto cada ação gasta, como ela volta sozinha e como repor mais rápido.
---

Energia é o que limita o quanto você faz seguido. Trabalhar, cometer crimes, roubar e lavar dinheiro gastam energia, e ela volta com o tempo.

## Resumo

| O quê | Como é |
| --- | --- |
| Máximo | {{v:energy.max}} pontos |
| Volta sozinha | 1 ponto a cada {{v:energy.regen}} ({{v:energy.perHour}} por hora) |
| De zero a cheia | {{v:energy.full}} |
| Ver | `/energia` |

## Quanto cada ação gasta

{{table:energy-costs}}

Se a energia não cobre o custo, a ação **não acontece** e nada é gasto: a Helena avisa quantos pontos faltam.

> [!NOTE]
> No crime e no roubo, a energia é gasta **mesmo que a tentativa dê errado**.

## Como ela volta

A regeneração conta em pontos inteiros: a cada {{v:energy.regen}} cheios, entra 1 ponto, e o tempo que sobra continua contando. Quando a energia chega ao máximo, o relógio reinicia, então **não dá para acumular** energia além de {{v:energy.max}}.

O `/energia` mostra a energia de agora, o tempo até o próximo ponto e o custo do trabalho.

## Repor mais rápido

Comida e bebida repõem energia na hora. Use com o `/usaritem`, pelo painel ou com o item e a quantidade direto no comando.

{{table:energy-items}}

> [!TIP]
> Com a energia cheia, o `/usaritem` recusa o uso e **não gasta o item**. O que passaria de {{v:energy.max}} se perderia, então use quando já tiver gasto energia suficiente para caber.

## Próximo passo

{{cards: economy/shop-and-inventory, crime/getting-started}}

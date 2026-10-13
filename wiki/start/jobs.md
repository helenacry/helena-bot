---
title: Escolha seu emprego
description: A escada de empregos, de Entregador a Magnata, o nível de cada um e como trocar.
---

O emprego define quanto o `/trabalhar` paga. São **{{v:jobs.count}} empregos**, do {{v:jobs.first}} ({{v:jobs.firstSalary}} por turno) ao {{v:jobs.last}} ({{v:jobs.lastSalary}} por turno), e cada um libera num nível.

## Como trocar de emprego

1. Veja a lista com **`/empregos`**. Cada linha mostra se o emprego é o atual (👔), se já está liberado (🔓) ou se ainda está bloqueado (🔒).
2. Para trocar, use `/empregos` com a opção `cargo` e escolha o emprego.

No prefixo, fica assim:

```
hempregos cargo:motorista
```

> [!WARNING]
> **O emprego não sobe sozinho.** Você começa como {{v:jobs.first}} e continua nele mesmo depois de passar de nível. Se não trocar, vai ganhar o salário do primeiro emprego pelo resto da vida.

A troca é de graça e vale na hora. Você pode voltar para um emprego mais baixo quando quiser.

## Todos os empregos

{{table:jobs}}

O salário é pago por turno de `/trabalhar`, e o turno repete a cada {{v:work.cooldown}}.

## Como subir de nível

O nível vem de XP, e o XP vem de quase tudo que você faz:

- **trabalhar**: {{v:work.xp}} de XP por turno;
- **missões diárias**: {{v:missions.totalXp}} de XP se fizer as {{v:missions.count}};
- **crime**: de {{v:crime.xp}} de XP por crime que dá certo;
- **duelos**: {{v:duel.winXp}} de XP para quem vence.

> [!TIP]
> O nível máximo é **{{v:xp.maxLevel}}**. O {{v:jobs.last}} libera no nível {{v:jobs.lastLevel}}.

## Próximo passo

{{cards: start/earning-money, economy/market}}

---
title: Escolha seu emprego
description: A escada de empregos, de Entregador a Magnata, o nível de cada um e como trocar.
---

O emprego define quanto o `/trabalhar` paga. São **{{v:jobs.count}} empregos**, do {{v:jobs.first}} ({{v:jobs.firstSalary}} por turno) ao {{v:jobs.last}} ({{v:jobs.lastSalary}} por turno), e cada um libera num nível.

## Como trocar de emprego

1. Veja a lista com **`/empregos`**. Ela separa o que já está **liberado** (✅) do que ainda está **bloqueado** (🔒), com o salário e o nível de cada cargo, e o seu cargo vem com uma ⭐.
2. Escolha no menu **Escolha uma profissão**, logo abaixo da lista. Só aparecem os cargos que o seu nível já libera.
3. Se preferir digitar, use `/empregos` com a opção `cargo`.

No prefixo, fica assim:

```
hempregos cargo:motorista
```

> [!WARNING]
> **O emprego não sobe sozinho.** Você começa **sem emprego**: o primeiro `/trabalhar` mostra a lista e o menu para escolher o cargo (no nível 1, só o {{v:jobs.first}} está liberado). Depois você continua nele mesmo depois de passar de nível. Se não trocar, vai ganhar o salário do primeiro emprego pelo resto da vida.

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

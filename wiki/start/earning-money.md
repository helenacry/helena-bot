---
title: Ganhar dinheiro
description: As formas de ganhar dinheiro dentro da lei, quanto cada uma rende e de quanto em quanto tempo.
---

Dinheiro é o que move o jogo: compra itens, paga multa e é o que os outros jogadores querem levar de você. Estas são as formas de ganhar sem se meter em encrenca.

## Resumo

| Fonte | Quanto rende | Quando |
| --- | --- | --- |
| Recompensa diária (`/daily`) | de {{v:daily.day1}} a {{v:daily.day7}} | a cada {{v:daily.cooldown}} |
| Trabalho (`/trabalhar`) | de {{v:jobs.firstSalary}} a {{v:jobs.lastSalary}} por turno, conforme o emprego | a cada {{v:work.cooldown}} |
| Missões (`/missoes`) | {{v:missions.total}} no total, mais XP | todo dia |
| Vender itens (`/vender`) | metade do preço de compra | quando quiser |

## Recompensa diária

O `/daily` paga {{v:daily.reward}} e aumenta com a sua sequência de dias:

- cada dia seguido soma **{{v:daily.streakBonus}}**;
- no **sétimo dia** entra um bônus de **{{v:daily.weeklyBonus}}**, e o prêmio chega a {{v:daily.day7}};
- depois do sétimo dia o ciclo recomeça do primeiro valor.

{{table:streak}}

> [!NOTE]
> Você pode demorar até **{{v:daily.grace}}** entre dois resgates sem perder a sequência. Passou disso, ela volta para o primeiro dia.


## Trabalho

O `/trabalhar` paga o salário do seu emprego e dá **{{v:work.xp}} de XP** a cada turno. Cada turno custa **{{v:work.energy}} de energia** e só se repete depois de **{{v:work.cooldown}}**.

O emprego não muda sozinho quando você sobe de nível: é preciso trocar. Veja como na página [Escolha seu emprego](wiki:start/jobs).

> [!MONEY]
> Entregador ganha {{v:jobs.firstSalary}} por turno. {{v:jobs.last}} ganha {{v:jobs.lastSalary}}. A diferença entre os dois é o motivo de ninguém ficar parado no primeiro emprego.

## Missões diárias

São {{v:missions.count}} missões por dia, que somam {{v:missions.total}} e {{v:missions.totalXp}} de XP:

{{table:missions}}

Cumpra o objetivo e resgate com `/missoes`. O progresso conta por dia **UTC**: a virada acontece à meia-noite UTC, que é **21h no horário de Brasília**.

## Vender o que você não usa

Itens vendáveis, como comida e ferramentas, voltam pela metade do preço de compra no `/vender`. O preço também sofre a influência do mercado do servidor, que você acompanha no [`/bolsa`](wiki:economy/market).

## Próximo passo

{{cards: start/jobs, economy/market}}

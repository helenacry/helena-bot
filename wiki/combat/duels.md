---
title: Duelos
description: Como desafiar, aceitar e vencer um duelo, quem pode duelar e o que muda depois.
---

O duelo é uma luta entre dois jogadores do mesmo servidor. Não vale dinheiro: o que está em jogo é a vida, o XP e a sua fama.

## Resumo

| O quê | Como é |
| --- | --- |
| Desafiar | `/atacar usuario:@pessoa` |
| Aceitar ou recusar | `/aceitarduelo` ou `/recusarduelo` |
| O desafio vale | {{v:duel.requestTtl}} |
| Vida mínima | {{v:duel.minHp}}, dos dois lados |
| Espera entre duelos | {{v:duel.cooldown}} |
| Quem vence ganha | {{v:duel.winXp}} de XP |

## Como acontece

1. Você desafia alguém com **`/atacar`**.
2. A pessoa tem {{v:duel.requestTtl}} para usar **`/aceitarduelo`**. Se não quiser, usa `/recusarduelo`.
3. Quando ela aceita, o duelo **é resolvido na hora**: os dois golpeiam ao mesmo tempo.

> [!NOTE]
> A Helena não usa sorte no duelo. O resultado vem **só das armas e da vida** de cada um. Quem causa mais dano termina com mais vida e vence.

## O dano

Cada um causa o dano da arma que tem equipada:

- **sem arma**, o golpe vale {{v:duel.unarmed}};
- **com arma**, vale o dano dela (as armas que não definem o próprio dano valem {{v:duel.defaultDamage}}). A tabela está em [Armas](wiki:combat/weapons);
- o **colete de quem apanha** tira pontos do golpe recebido, até **{{v:duel.vestCap}} pontos** por golpe, e o dano nunca fica abaixo de 1. O colete protege só quem o veste: o golpe dele continua valendo o dano inteiro da arma. Veja em [Vida, colete e munição](wiki:combat/health-and-gear).

A **arma de fogo** gasta **1 munição** por duelo e **toda arma** gasta **1 ponto de durabilidade**. Arma de fogo sem munição, ou arma sem durabilidade, impede o duelo: nada é gasto, e o desafio continua esperando.

## Quem vence

Vence quem termina com **mais vida**. Empatou, **ninguém vence**: nenhum dos dois ganha XP, vitória ou derrota. O vencedor soma 1 vitória, o perdedor soma 1 derrota, e o duelo vai para o histórico.

> [!TIP]
> Entre no duelo com a vida cheia. Um ferimento de crime ou de roubo, ou um duelo recente, deixa você com menos vida do que o adversário, e o resultado só depende dos números.

## O que impede um duelo

- Algum dos dois está com **menos de {{v:duel.minHp}} de vida**.
- Algum dos dois está com **proteção do hospital** (veja [Vida, colete e munição](wiki:combat/health-and-gear)).
- Um dos dois **duelou há menos de {{v:duel.cooldown}}**.
- Já existe **um desafio pendente** envolvendo qualquer um dos dois.
- Você tentou desafiar a si mesmo.
- Você está **preso**: `/atacar` e `/aceitarduelo` ficam bloqueados na cadeia.

## Acompanhe os seus números

- **`/statuscombate`**: vida, vitórias, derrotas, munição, defesa e durabilidade.
- **`/historico`**: os últimos 5 duelos em que você lutou.
- **`/protecaopvp`**: quanto falta da proteção do hospital.

## Próximo passo

{{cards: combat/weapons, combat/health-and-gear}}

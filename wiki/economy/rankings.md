---
title: Ranking
description: Os rankings do servidor e o ranking global de todos os servidores, como a posição é calculada e o que significa o número do seu cartão de perfil.
---

O `/ranking` (atalhos `/top` e `/rank`) mostra os 10 melhores jogadores em três classificações, **neste servidor** ou **no mundo todo** (o ranking global).

## Os três rankings

| Ranking | Quem fica na frente |
| --- | --- |
| **Patrimônio** | quem tem mais dinheiro, somando **carteira e banco** |
| **Nível** | quem tem o nível mais alto |
| **Gemas** | quem tem mais gemas |

Escolha com a opção `tipo` (Patrimônio, Nível ou Gemas). No prefixo, escreva `hranking tipo:level`. Os botões embaixo do ranking trocam de classificação na mesma mensagem, só para quem abriu.

Se você não está entre os 10 primeiros, o ranking mostra também a **sua posição**.

## Como o empate é decidido

Quando dois jogadores têm o mesmo valor, quem tem **mais XP** fica na frente. Se o XP também empata, o desempate final é o ID do jogador, que nunca se repete.

> [!NOTE]
> O dinheiro sujo **não conta** no patrimônio. Só o que está na carteira e no banco.

## O número do cartão de perfil

O **RANK** que aparece no seu cartão de perfil é a sua posição no ranking de **patrimônio**, calculada do mesmo jeito. Os dois números nunca divergem.

## Um ranking por servidor

Patrimônio e nível valem **por servidor**. Já as gemas são da conta: o ranking de gemas mostra o saldo global de cada pessoa, mas só entre quem joga naquele servidor.

## O ranking global

Para ver quem está na frente **em todos os servidores**, use a opção `escopo:global` (`hranking escopo:global`) ou o botão **Global** embaixo do ranking. O botão **Neste servidor** volta para o ranking do servidor.

| Ranking global | Quem fica na frente |
| --- | --- |
| **XP total** | quem tem mais XP **somando todos os servidores** em que joga |
| **Patrimônio** | quem tem mais dinheiro, somando carteira e banco de todos os servidores |
| **Gemas** | quem tem mais gemas (elas já são da conta) |

O primeiro do **XP total** é quem aparece no status da Helena ("Top XP"). Se você pedir o "nível" no global, a Helena mostra o XP total, e o contrário vale no servidor. Os empates seguem a mesma regra do servidor. No ranking global aparecem o nome de exibição e o nível, e **só** de quem já usou a Helena.

## Próximo passo

{{cards: character/profile, economy/bank-and-transfers}}

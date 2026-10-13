---
title: Polícia, procurados e prisão
description: A ficha criminal, a lista de procurados, como se vai preso e o que dá e o que não dá para fazer na cadeia.
---

Crime deixa rastro. A Helena guarda a sua ficha criminal, mostra quem é procurado no servidor e manda para a cadeia quem se dá mal num crime.

## Ficha criminal e procurados

Entra um registro na sua ficha por cada:

- crime, deu certo ou não;
- tentativa de roubo, deu certo ou não;
- lavagem de dinheiro que você começa.

A ficha **nunca expira**. Quem tem pelo menos 1 registro aparece em **`/procurados`**, com mais registros primeiro, {{v:prison.wantedPage}} por página, e com a marca de quem está preso agora.

## Como se vai preso

Hoje, de uma forma: **errando um crime**, que dá {{v:crime.jail}} de cadeia. Se você já estava preso, a pena nova **se soma** ao tempo que faltava.

## Sua situação: `/prisao`

O `/prisao` (no prefixo, `hprisao`) mostra, preso ou não:

- o tempo que falta e a pena total, e o motivo;
- a sua ficha: crimes, sucessos, capturas e o total arrecadado em dinheiro sujo;
- o botão **Tentar fuga**, quando você está preso (veja [Fuga da prisão](wiki:crime/prison-escape)).

Quando a pena acaba, você é solto sozinho.

## O que não dá para fazer preso

Estes comandos ficam bloqueados enquanto você cumpre pena:

{{v:prison.blocked}}

O que é só consulta continua liberado: `/saldo`, `/perfil`, `/inventario`, `/bolsa`, `/procurados`, `/prisao` e o resto.

Você também **não começa uma lavagem**, e as que já estavam rodando ficam em pausa até a pena acabar.

> [!TIP]
> Antes de arriscar um crime, resolva o que precisa fazer fora da cadeia: comprar, depositar, transferir e resgatar o daily. Depois da cadeia você volta a tudo.

## Próximo passo

{{cards: crime/prison-escape, crime/laundering}}

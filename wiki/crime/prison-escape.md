---
title: Fuga da prisão
description: O minigame de fuga em três etapas, como não ser pego e quanto tempo de pena você corta ou ganha.
---

Preso, você pode tentar fugir. Não é um jeito de ficar livre na hora: vencer **corta** uma parte da pena, e ser pego **acrescenta**.

## Como começar

Abra **`/prisao`** e aperte **Tentar fuga**. Você só pode tentar uma vez a cada **{{v:escape.cooldown}}**, contados do começo da tentativa anterior, e a tela da fuga é só sua.

## As três etapas

São **{{v:escape.stages}} etapas**, sempre iguais. Em cada uma:

1. 🔴 **O guarda vigia.** Qualquer clique nessa hora é ser pego. Espere.
2. 🟠 **Às vezes ele finge virar as costas.** Clicar agora também é ser pego, e o corredor **nunca abre logo depois do truque**.
3. 🟢 **O corredor abre.** A tela diz qual das **{{v:escape.exits}} saídas** apertar. Você tem **{{v:escape.open}} segundos**.

Ser pego acontece se você:

- clicar com o guarda vigiando ou durante o truque;
- apertar a saída errada;
- demorar mais que o tempo do corredor.

Acertando as três etapas, você escapa.

> [!NOTE]
> O truque do guarda e o tempo de vigia são sorteados a cada etapa, então não dá para decorar o ritmo. O que ajuda é esperar o verde e só então olhar qual saída apertar.

## O que muda na pena

| Resultado | Efeito na pena |
| --- | --- |
| Escapou | tira {{v:escape.winCut}} da pena original |
| Foi pego | soma {{v:escape.lossAdd}} da pena original |
| Limite | as fugas, juntas, nunca passam de {{v:escape.maxChange}} para nenhum dos lados |

> [!EXAMPLE]
> Numa pena de crime comum ({{v:crime.jail}}), uma fuga bem-sucedida corta {{v:escape.exampleCut}} e ser pego acrescenta {{v:escape.exampleAdd}}. O total acumulado por fugas nunca passa de {{v:escape.exampleMax}} para cima ou para baixo.

Se a pena chegar a zero, você sai livre.

## Vale a pena?

> [!WARNING]
> A espera de {{v:escape.cooldown}} é gasta mesmo se a tentativa der errado, e ser pego aumenta a pena. Se a cadeia está acabando, esperar costuma sair mais barato que arriscar.

## Próximo passo

{{cards: crime/getting-started, crime/laundering}}

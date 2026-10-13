---
title: Lavagem de dinheiro
description: Como transformar dinheiro sujo em dinheiro limpo, a diferença entre a lavanderia pública e a privada e quanto cada uma devolve.
---

O dinheiro do `/crime` e metade do que você leva num roubo chegam **sujos**. Dinheiro sujo não paga a loja, não vai para o banco e não vale nada até passar pela lavagem.

## Resumo

| | Pública | Privada |
| --- | --- | --- |
| Devolve | de {{v:laundering.publicRate}} do que você lava | de {{v:laundering.privateRate}} do que você lava |
| Velocidade | {{v:laundering.publicPerMinute}} por minuto | {{v:laundering.privatePerMinute}} por minuto |
| Espera até a próxima | {{v:laundering.publicCooldown}} | {{v:laundering.privateCooldown}} |
| Quem pode usar | todos, mas só uma pública por vez em todo o servidor | só quem liberou, por {{v:laundering.gems}} gemas |

Em qualquer uma, cada lavagem aceita de **{{v:laundering.min}} a {{v:laundering.max}}** de dinheiro sujo e custa **{{v:laundering.energy}} de energia**.

## Como lavar

- **`/lavagem`** sem nada mostra a sua situação: dinheiro sujo, recarga e lavagem em andamento, com botões para lavar.
- **`/lavagem valor:5000`** lava R$ 5.000 na lavanderia pública. Também aceita `tudo` (o máximo que cabe numa lavagem).
- **`/lavagem valor:5000 tipo:privada`** lava na privada.
- **`/lavageminfo`** mostra o tempo que falta.

Os atalhos são `/lavar` e `/lav`. No prefixo:

```
hlavagem 5000 privada
```

## Quanto tempo leva e quanto volta

A lavagem anda **por lotes de 1 minuto**, cada um com a taxa sorteada dentro da faixa da lavanderia. Por isso, quanto maior a lavagem, mais o resultado se aproxima da média.

O dinheiro sujo sai da sua conta na hora, e o resultado é decidido no começo, mas só cai na carteira **no fim**. Você não vê o valor antes.

> [!EXAMPLE]
> Lavando o máximo ({{v:laundering.max}}): na **pública** leva {{v:laundering.publicMaxTime}} e devolve em média {{v:laundering.publicMaxBack}}. Na **privada** leva {{v:laundering.privateMaxTime}} e devolve em média {{v:laundering.privateMaxBack}}.

## Regras que pegam gente de surpresa

- Só **uma lavagem por vez** por jogador.
- A **espera é uma só** para as duas lavanderias. Usou a pública, ficou {{v:laundering.publicCooldown}} sem lavar em nenhuma. Usou a privada, são {{v:laundering.privateCooldown}}.
- A lavanderia **pública é de todo o servidor**: se alguém já tem uma lavagem pública rodando, você espera ela terminar.
- A **privada** é liberada **uma única vez por servidor** com `/lavagem valor:desbloquear`, e custa {{v:laundering.gems}} gemas. Pelo botão **Liberar privada**, é preciso digitar `LIBERAR` para confirmar.
- Preso, **você não começa uma lavagem**. As que já estavam rodando ficam em pausa: o fim de cada uma é adiado pelo tempo da pena.

> [!WARNING]
> Cadeia atrasa o seu dinheiro. Se você foi preso no meio de uma lavagem, o fim dela é empurrado pelo tamanho da pena.

## Qual escolher?

> [!MONEY]
> A privada devolve bem mais que a pública para o mesmo valor, e espera menos entre uma lavagem e outra. Se você vai lavar com frequência, as {{v:laundering.gems}} gemas se pagam rápido. A pública serve para quem ainda não tem gemas e aceita devolver menos.

## Próximo passo

{{cards: crime/wanted-and-prison, crime/prison-escape}}

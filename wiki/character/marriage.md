---
title: Casamento
description: Como pedir alguém em casamento, aceitar ou recusar um pedido e o que muda no perfil.
---

O casamento na Helena é só estado civil: mostra no perfil dos dois e não muda dinheiro, nível nem nada do jogo.

## Resumo

| O quê | Como é |
| --- | --- |
| Pedir | `/casar usuario:@pessoa` |
| Aceitar | `/aceitarcasamento` |
| Recusar | `/recusarcasamento` |
| Terminar | `/divorciar` |
| O pedido vale | {{v:marriage.requestTtl}} |
| Custo | nenhum |

## Como funciona

1. Quem pede usa **`/casar`** e escolhe a pessoa. O pedido dura **{{v:marriage.requestTtl}}**.
2. Quem recebeu responde com **`/aceitarcasamento`** ou **`/recusarcasamento`**.
3. Aceito, os dois passam a aparecer como **casados** no perfil.

## Regras

- O casamento é **por servidor**.
- Cada pessoa casa com **uma pessoa por vez**. Quem já está casado(a) não pede, e não pode receber pedido.
- Cada pessoa **envia um pedido por vez**: enquanto o seu não for respondido (ou vencer), não dá para enviar outro.
- Cada pessoa **recebe um pedido por vez**: se alguém já pediu aquela pessoa, é preciso esperar a resposta ou o prazo.
- Você não pode pedir a si mesmo.
- Se um dos dois casar com outra pessoa antes de o pedido ser aceito, o casamento **não acontece**.

## Terminar

O **`/divorciar`** encerra o casamento atual. O estado civil dos dois volta para **solteiro(a)**.

## Na cadeia

`/casar` e `/aceitarcasamento` ficam **bloqueados** enquanto você cumpre pena. Recusar e se divorciar continuam liberados.

## Próximo passo

{{cards: character/profile, economy/rankings}}

---
title: Casamento
description: Como pedir alguém em casamento, o que muda no perfil e a vida em família com o Gozofone e os filhos.
---

O casamento na Helena aparece no perfil dos dois e abre a vida em família: o **Gozofone** (uma ligação para o seu cônjuge) e os **filhos** do casal. Casar não custa nada e não muda o seu nível nem o seu dinheiro.

## Resumo

| O quê | Como é |
| --- | --- |
| Pedir | `/casar usuario:@pessoa` |
| Aceitar | `/aceitarcasamento` |
| Recusar | `/recusarcasamento` |
| Terminar | `/divorciar` |
| Ligar para o cônjuge | `/gozofone` (ou `/gf`) |
| Ver a família | `/familia` |
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

## Gozofone

O **`/gozofone`** liga para o seu cônjuge. A mensagem menciona a pessoa, que tem **{{v:family.callTtl}}** para tocar em **Atender**.

- **Atendeu:** com **{{v:family.childChance}}** de chance nasce um filho. Sem filho, quem atendeu **recebe de {{v:family.payoutMin}} a {{v:family.payoutMax}}** (quem ligou não ganha nada, o dinheiro é de quem atende).
- **Recusou ou ninguém atendeu:** a ligação não conta, e você pode ligar de novo.
- **Cancelou** (botão de quem ligou): a espera fica.
- A espera é de **{{v:family.cooldown}}** e é **pessoal**: o seu cônjuge também pode ligar para você.
- Só atende o cônjuge. Uma ligação por vez para o casal.

Se a carteira de quem atendeu estiver cheia, nada é pago, mas a ligação conta.

## Filhos

Quando nasce um bebê (**{{v:family.twinChance}}** das vezes são **gêmeos**), a Helena mostra o botão **Registrar filho**. Um dos pais toca nele e escolhe o nome em **{{v:family.nameWindow}}**. Passou o prazo, o bebê não é registrado.

- O nome tem de **{{v:family.nameMin}} a {{v:family.nameMax}} letras**, com espaço se for composto, e não repete o de um irmão.
- Enquanto um bebê espera nome, não nasce outro, e o limite é de **{{v:family.maxChildren}} filhos** por casal. Nesses casos, atender rende só o dinheiro.
- O **`/familia`** mostra o casal, os filhos e o bebê que espera nome.

## Terminar

O **`/divorciar`** encerra o casamento atual. O estado civil dos dois volta para **solteiro(a)**, e os **filhos do casal saem da família** junto com o casamento.

## Na cadeia

`/casar`, `/aceitarcasamento` e `/gozofone` ficam **bloqueados** enquanto você cumpre pena, e ligar para quem está preso também não funciona. Recusar, se divorciar e ver a família continuam liberados.

## Próximo passo

{{cards: character/profile, economy/rankings}}

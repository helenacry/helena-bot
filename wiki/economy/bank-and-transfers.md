---
title: Banco e transferências
description: A diferença entre carteira e banco, como depositar, sacar e transferir dinheiro e o que o saldo mostra.
---

Seu dinheiro fica em dois lugares, e a diferença entre eles é a regra mais importante da economia da Helena.

| Onde | Para que serve | Risco |
| --- | --- | --- |
| **Carteira** | gasta na loja, paga multa e recebe o salário | pode ser **roubada** por outros jogadores |
| **Banco** | guarda o dinheiro | **não pode ser roubado** |

> [!WARNING]
> Salário, daily e prêmios caem na **carteira**. Se não vai gastar agora, deposite. Veja como os ladrões agem em [Roubar jogadores](wiki:crime/robbery).

## Ver o que você tem: `/saldo`

O `/saldo` (atalhos `/bal` e `/carteira`) mostra carteira, banco, gemas, nível e XP, e o dinheiro sujo se você tiver. Os botões da tela abrem formulários para **Depositar**, **Sacar** e **Transferir**.

## Depositar e sacar

| Comando | Atalho | O que faz |
| --- | --- | --- |
| `/depositar quantia:500` | `/dep` | tira da carteira e põe no banco |
| `/sacar quantia:500` | | tira do banco e põe na carteira |

No prefixo: `hdepositar 500` ou `hsacar tudo`.

## Transferir para outro jogador

**`/transferir usuario:@pessoa quantia:200`** (atalho `/pagar`) manda dinheiro **da sua carteira** para a carteira de outro jogador do servidor.

- Não tem **taxa**: quem recebe leva o valor inteiro.
- Não dá para transferir para si mesmo.
- Pelo botão **Transferir** do `/saldo`, você pode informar a pessoa por nome, @menção ou ID.

## Como informar a quantia

- Sempre em **reais inteiros**: `500`, não `500,50`.
- `tudo` ou `all` usa todo o saldo disponível.
- Valor maior do que você tem dá erro e não muda nada.

## Dinheiro sujo é à parte

O dinheiro de crime e de roubo não passa pelo banco: ele fica numa conta separada até ser [lavado](wiki:crime/laundering).

## Preso, o banco fecha

`/depositar`, `/sacar` e `/transferir` ficam **bloqueados na cadeia**. Consultar o `/saldo` continua liberado.

> [!TIP]
> Os depósitos contam para uma das [missões diárias](wiki:start/earning-money) (depositar duas vezes).

## Próximo passo

{{cards: economy/shop-and-inventory, economy/rankings}}

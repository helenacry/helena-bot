---
title: Bolsa
description: O mercado do servidor: o índice que mexe nos preços da loja e o item em alta que paga mais na venda.
---

O `/bolsa` (atalho: `/mercado`) mostra o mercado do seu servidor. Apesar do nome, não tem ação para comprar: a bolsa é um **índice** que sobe e desce e muda o preço de tudo na loja.

Cada servidor tem o seu mercado. O que acontece no seu não mexe no de outro.

## Resumo

| O que | Como funciona |
| --- | --- |
| Índice | Vai de 0 a {{v:market.indexMax}}. Um novo é sorteado a cada {{v:market.interval}}. |
| Preço | O índice 0 deixa tudo em {{v:market.minPrice}} da tabela e o {{v:market.indexMax}} em {{v:market.maxPrice}}. O meio (45) é o preço de tabela. |
| Item em alta | A cada sorteio, um item que dá para vender paga de +{{v:market.hotMin}} a +{{v:market.hotMax}} a mais na venda. |
| Onde vale | Loja, inventário, `/comprar` e `/vender`. |

## O índice

O índice é sorteado com a mesma chance para cada número de 0 a {{v:market.indexMax}}, **sem olhar o anterior**. Ele serve para tudo o que você compra ou vende:

- **índice baixo**: a loja fica mais barata, e a venda paga menos;
- **índice alto**: a loja fica mais cara, e a venda paga mais.

O painel do `/bolsa` agrupa o índice em três faixas, só para facilitar a leitura:

{{table:market-bands}}

Cada faixa sai mais ou menos uma vez em cada três sorteios.

> [!NOTE]
> A **tendência** que aparece no painel compara só o índice de agora com o do sorteio anterior (subiu, caiu ou ficou igual). Ela não prevê o próximo, porque o próximo é sorteado do zero.

## O item em alta

A cada sorteio, a Helena escolhe **um item que dá para vender** para ficar em alta. Hoje são: {{v:market.hotItems}}. Esse item paga um bônus a mais **só na venda**, por cima do preço que o índice já definiu. Armas não se vendem, então nunca ficam em alta.

> [!EXAMPLE]
> A maçã custa {{v:market.exampleBuy}} na tabela e vende por {{v:market.exampleSell}}. No índice {{v:market.indexMax}} ({{v:market.maxPrice}}), ela custa {{v:market.exampleBuyTop}} e vende por {{v:market.exampleSellTop}}. Se ela estiver em alta com o bônus máximo, a venda sobe para {{v:market.exampleSellHot}}.

## Quando o sorteio acontece

Ninguém precisa "ligar" a bolsa. O índice novo sai na **primeira consulta de preço depois dos {{v:market.interval}}**: uma compra, uma venda ou um `/bolsa`. O prazo seguinte conta a partir daí.

Se ninguém mexer na loja por horas, o sorteio não acumula: sai um só, na primeira consulta.

## O preço que vale

O preço cobrado é o **da hora em que você confirma**, não o que estava na tela quando você abriu a loja. Se o mercado virou nesse meio tempo, o valor muda, e uma carteira que cobria o preço baixo pode não cobrir o novo.

> [!WARNING]
> Não dá para lucrar só com o mercado. Mesmo comprando no índice mais baixo e vendendo no mais alto, com o item em alta e o bônus máximo, você ainda perde dinheiro. A bolsa muda a hora certa de comprar e de vender, não cria dinheiro do nada.

## Comandos

- **`/bolsa`**: abre o painel com o índice, a tendência, o item em alta e os preços de agora dos itens que vendem. Os botões levam à loja, atualizam e fecham.
- **`/loja`**: mostra o índice no topo e os preços já ajustados.
- **`/inventario`**: mostra o preço de venda de agora ao lado de cada item, com 🔥 no item em alta.

O `/bolsa` também funciona preso, porque só mostra informação.

## Próximo passo

{{cards: start/earning-money, start/jobs}}

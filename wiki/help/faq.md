---
title: Perguntas frequentes
description: Respostas curtas para as dúvidas mais comuns sobre dinheiro, cadeia, comandos e dados.
---

## Dinheiro

### Meu dinheiro sumiu. O que aconteceu?

Os motivos possíveis são: um **roubo** (só a carteira é roubada), uma **multa** de crime que deu errado, uma compra ou uma transferência. O dinheiro no **banco** não pode ser roubado. Veja [Banco e transferências](wiki:economy/bank-and-transfers).

### Dá para recuperar o dinheiro que me roubaram?

Não existe comando para isso. O melhor jeito é não deixar dinheiro na carteira: **deposite** o que não vai usar agora.

### Por que não consigo comprar com o dinheiro do crime?

Porque ele vem **sujo**. Dinheiro sujo fica numa conta à parte e só vale depois de lavado. Veja [Lavagem de dinheiro](wiki:crime/laundering).

### Posso mandar dinheiro para outro jogador?

Pode, com `/transferir`, da sua carteira para a dele. Não tem taxa. Veja [Banco e transferências](wiki:economy/bank-and-transfers).

## Carreira

### Subi de nível, mas o meu salário não mudou. Por quê?

O emprego **não muda sozinho**. Escolha o novo com `/empregos` e a opção `cargo`. A troca é de graça. Veja [Escolha seu emprego](wiki:start/jobs).

### O `/bolsa` é uma bolsa de ações?

Não. Ela é um **índice de mercado** do servidor, que muda os preços da loja e põe um item em alta na venda. Não tem ação para comprar. Veja [Bolsa](wiki:economy/market).

### Para que servem as gemas?

Hoje, para liberar a **lavanderia privada**. Elas valem em todos os servidores. Veja [Gemas](wiki:economy/gems).

## Comandos que não funcionam

### O comando diz que eu não posso usá-lo agora. O que verifico?

- Você está **preso**? Muitos comandos ficam bloqueados na cadeia. Veja [Polícia, procurados e prisão](wiki:crime/wanted-and-prison).
- Falta **energia**? Veja [Energia](wiki:character/energy).
- Está com **pouca vida**? Crime e roubo pedem {{v:crime.minHp}} de vida, e o duelo pede {{v:duel.minHp}}. Use `/curar`.
- Está no **tempo de espera**? Veja [Tempos de espera](wiki:help/cooldowns).

### O bot não responde. Como sei se ele está no ar?

Use **`/ping`** (ou `hping`): se o bot estiver funcionando, ele responde na hora. Se nem o `/ping` responde, o bot está fora do ar ou reiniciando, e não há nada a fazer do seu lado além de tentar de novo mais tarde.

### Qual a diferença entre `/daily` e `hdaily`?

Nenhuma. O comando de barra e o do prefixo `h` têm as mesmas regras. Veja [Comandos](wiki:help/commands).

### Aperto o botão e ele diz que o painel é de outra pessoa.

Os botões de painéis pessoais, como o do `/saldo` e o do `/lavagem`, só funcionam para quem abriu o comando. Use o comando para abrir o seu.

## Crime

### Qual a chance de um crime dar certo?

**{{v:crime.chance}}**, em qualquer nível. O nível só muda o valor do prêmio e da multa. Veja [Crime: por onde começar](wiki:crime/getting-started).

### Roubar manda para a cadeia?

Não. Um roubo que falha **não manda para a cadeia**, mas gasta energia e a espera, e todo roubo entra na sua ficha criminal. Quem vai preso é quem **erra um crime**. Veja [Roubar jogadores](wiki:crime/robbery).

## Dados e privacidade

### Que dados a Helena guarda sobre mim?

Os dados do jogo, o seu ID e o nome de exibição. As mensagens que não são comandos **não são guardadas**. Tudo está detalhado na [Política de Privacidade](site:privacy/).

### Como peço para apagar os meus dados?

Siga os passos da seção de direitos na [Política de Privacidade](site:privacy/#direitos).

## Próximo passo

{{cards: start/first-steps, help/commands}}

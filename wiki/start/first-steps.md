---
title: Primeiros passos
description: Do convite ao primeiro daily, o que fazer nos primeiros minutos com a Helena.
---

A Helena roda dentro do servidor onde ela foi adicionada. Você não precisa se cadastrar em lugar nenhum: o primeiro comando que você usa já abre a sua conta ali.

## Adicione a Helena ao servidor

Use o botão **Adicionar ao Discord** no [site da Helena](site:). Se você não pode adicionar bots no seu servidor, peça para quem administra.

## Sua conta abre sozinha

No primeiro comando, a Helena cria o seu perfil naquele servidor com:

- **R$ 0** na carteira e no banco;
- **nível 1** e **{{v:energy.max}} pontos de energia**;
- o emprego de **{{v:jobs.first}}**, que paga {{v:jobs.firstSalary}} por turno.

> [!NOTE]
> Dinheiro, nível, itens, crime e casamento valem **por servidor**. Só as **gemas** e o nome que a Helena guarda de você valem em todos os servidores.

## Como dar comandos

Todo comando funciona de duas formas. Escolha a que preferir:

| Forma | Exemplo | Como é |
| --- | --- | --- |
| Comando de barra | `/daily` | Digite `/` e escolha o comando na lista do Discord. |
| Prefixo `h` | `hdaily` | Escreva `h` colado no nome do comando, no chat. |

Quando o comando pede informações, no prefixo você escreve na ordem, separando por espaço, ou usa `nome:valor`:

```
hdepositar 100
hajuda categoria:economia
```

Quantias são sempre em **reais inteiros** (`500`, não `500,50`). Para usar tudo o que você tem, escreva `tudo` ou `all`.

> [!TIP]
> Muitos comandos têm atalhos, como `/store` para `/loja`. Aqui na wiki, os atalhos aparecem ao lado de cada comando.

## Seus primeiros cinco minutos

1. **O daily**: ele é coletado no **painel do site** (o `/daily` mostra se está disponível e leva até lá). Entre com a sua conta do Discord e pegue a recompensa do dia ({{v:daily.reward}}).
2. **`/trabalhar`**: na primeira vez ele pede para você **escolher um emprego** no menu (no nível 1, o {{v:jobs.first}}). Depois, rode de novo para fazer o primeiro turno: o salário de {{v:jobs.firstSalary}}, mais {{v:work.xp}} de XP. Gasta {{v:work.energy}} de energia e só dá para repetir depois de {{v:work.cooldown}}.
3. **`/saldo`** para ver o que você tem. Os botões dessa tela depositam, sacam e transferem.
4. **`/depositar`** para guardar o dinheiro no banco.
5. **`/perfil`** para ver o seu cartão de perfil.

> [!WARNING]
> O dinheiro que fica na **carteira** pode ser roubado por outros jogadores. O dinheiro no **banco** não pode. Se não vai usar agora, deposite.

## Não sabe o que fazer a seguir?

{{cards: start/earning-money, start/jobs}}

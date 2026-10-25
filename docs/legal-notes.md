# Notas jurídicas

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Revisão técnico-jurídica dos [Termos de uso](../site/src/pages/terms/index.astro) e da [Política de Privacidade](../site/src/pages/privacy/index.astro), feita em 22/10/2026 (versão 2.0 dos dois). **Não é parecer de advogado e não substitui um.** Serve para registrar o que os textos prometem, em que se apoiam e o que ainda precisa de decisão de vocês. Os testes em `tests/site.test.mjs` travam o que está escrito aqui como "o texto diz".

## O que mudou na versão 2.2 da Política de Privacidade (25/10/2026)

- **Datas de Nitro e de impulso informadas pela própria pessoa.** Tabela nova `userinfo_declared`: as duas datas (e se a pessoa deu a hora), só quando ela as digita em "Meu histórico". O Discord não entrega isso a bots, então é dado fornecido pelo titular, mostrado só no cartão dela e marcado como "informado pela própria pessoa". Base: consentimento (ela digita), com saída a qualquer hora (tirar uma, limpar as duas ou "Apagar tudo"). Não há conferência: quem informa uma data falsa só enganaria o próprio cartão.

## O que mudou na versão 2.1 da Política de Privacidade (25/10/2026)

Só a política subiu para a 2.1; os termos seguem na 2.0.

- **Histórico do `/userinfo`.** Duas tabelas novas (`userinfo_history` e `userinfo_privacy`). A Helena anota o @usuário, o nome de exibição e o código (hash) da foto e do banner, **só de quem já usou a Helena**, quando mudam, desde o primeiro uso, com no máximo 25 de cada tipo. Nunca guarda mensagens, calls, lista de servidores nem a imagem. A pessoa oculta, mostra de novo ou apaga tudo em "Meu histórico" (menu do próprio cartão, ou `hui ocultar`). Base: legítimo interesse, com o mínimo de dados, e a opção de sair dentro do próprio comando. **Decisão aberta:** se o histórico deve ser só de quem pede para entrar (consentimento) em vez de só de quem pede para sair.
- **Onde as páginas moram.** O texto dizia que o GitHub hospedava as páginas. Agora o próprio bot serve o site no Discloud (`helena.discloud.dev`, atrás da Cloudflare) e o endereço antigo do GitHub Pages só redireciona.
- **O que não existe.** A Helena não guarda nem pede o tipo de Nitro: o Discord só o entrega com o escopo `identify.premium`, restrito a parceiros aprovados.

## O que mudou na versão 2.0

- **Quem responde pela Helena.** O texto falava de "um desenvolvedor" e de "uma pessoa". Agora diz que são **duas pessoas** (`@matheustonon1` e `@agorismo`), que são os **controladores** dos dados (LGPD, art. 5º, VI) e fazem o papel de **encarregado** (art. 41). A organização `helenacry` aparece só como o lugar do código. Os nomes vêm de `site/src/config.ts`.
- **Foro.** Saiu "a comarca onde o desenvolvedor mora" (expunha o endereço de alguém e não faz sentido com duas pessoas). Entrou "as regras gerais de foro do Código de Processo Civil"; para consumidor continua o foro do domicílio dele.
- **Crianças e adolescentes** (LGPD, art. 14; ECA Digital, Lei nº 15.211/2025). A Helena passou a dizer que **não é para menores de 13 anos** (a idade mínima do Discord; na primeira versão 2.0, ainda na VSync, eram 12), que a conferência de idade é do Discord, que para adolescentes vale o melhor interesse, e que ela não vende nada, não mostra anúncios, não faz perfil publicitário e não tem caixas de recompensa pagas. Há canal prioritário para denúncia de conteúdo que prejudique criança ou adolescente.
- **Direitos do titular** (art. 18). A lista estava incompleta: entraram **portabilidade**, a informação sobre **não dar consentimento** e a **revisão de decisão automatizada** (art. 20). Entrou um prazo: **resposta em até 15 dias**.
- **Contato seguro.** O GitHub é público e não tem mensagem privada: a política manda **não escrever dados pessoais em issues ou mensagens abertas** e pede o primeiro contato sem detalhes, para conversar em privado.
- **Outros pontos:** papéis de operador (Discloud, Cloudflare, GitHub) e de plataforma (Discord); dados sensíveis (a bio é texto livre); nova base legal (exercício regular de direitos); aviso de que **não há apagamento automático** de quem para de jogar; incidente de segurança com remissão à Resolução CD/ANPD nº 15/2024; transferência internacional com a justificativa de necessidade; mudança de finalidade exige aviso e novo consentimento; remoção de conteúdo; cláusula de invalidade parcial; crédito de licenças (Twemoji, OFL); código de defesa do consumidor.

## A mudança da VSync para o Discord

A Helena trocou de plataforma (24/10/2026, branch `discord`). O que isso mexe nos textos, para vocês conferirem antes de publicar:

- **Plataforma e idade.** Os textos falam do Discord (que passa a ser o operador de plataforma) e da idade mínima de 13 anos dele. O contato de suporte só aparece quando existir o servidor de suporte no Discord (`supportUrl` em `site/src/config.ts`).
- **Dados do Discord.** O login do painel pede só `identify` e `guilds` (o nome, a foto e a lista de servidores). O bot lê o texto das mensagens que começam com o prefixo `h` (a *Message Content Intent*) e **não guarda** o conteúdo delas, só executa o comando. A política precisa continuar dizendo isso com clareza.
- **Banco novo.** Quem jogava na VSync não leva nada: o banco começa do zero. Se guardarem o banco antigo, ele continua sendo dado pessoal e entra na rotina de apagamento do item 4 abaixo.
- **Lojas e termos do Discord.** Para passar de 100 servidores, o Discord pede a verificação do bot e a aprovação da *Message Content Intent*, e cobra uma política de privacidade e termos publicados. Os textos do site servem a esse fim, mas só depois da revisão abaixo.

## Em que normas se apoia

| Norma | Para quê | Como foi conferida |
|---|---|---|
| LGPD, Lei nº 13.709/2018, arts. 5º, 7º, 9º, 14, 18, 19, 20, 33, 41 | bases legais, informações ao titular, direitos, crianças e adolescentes, transferência internacional, encarregado | conhecimento do texto da lei |
| Enunciado CD/ANPD nº 1/2023 | tratamento de dados de crianças e adolescentes pode usar as bases dos arts. 7º e 11, sempre com o melhor interesse | fontes secundárias (Mayer Brown, Felsberg), em 22/10/2026 |
| Resolução CD/ANPD nº 2/2022 | agentes de pequeno porte: dispensa do encarregado formal, mas com canal de atendimento; prazos em dobro | fontes secundárias; **o texto oficial não foi aberto** |
| Resolução CD/ANPD nº 15/2024 | comunicação de incidente de segurança: 3 dias úteis (em dobro para pequeno porte) | texto em repositório oficial do Ministério da Justiça e fontes secundárias |
| ECA Digital, Lei nº 15.211/2025 (vigente desde 17/03/2026) | serviços e jogos de acesso provável por crianças e adolescentes: proteção por padrão, aferição de idade, remoção de conteúdo, vedação de caixas de recompensa | fontes secundárias (Data Privacy Brasil e outras); **o Planalto estava inacessível e o artigo 20 não foi lido no texto oficial** |
| Código de Defesa do Consumidor | limitação de responsabilidade e foro do consumidor | conhecimento do texto da lei |
| Marco Civil da Internet | guarda de registros e remoção de conteúdo | conhecimento do texto da lei |

## O que precisa de decisão de vocês

1. **Identificação dos controladores.** Os textos usam os nomes de usuário do GitHub. A LGPD (art. 9º, III) pede a identificação do controlador; se quiserem seguir à risca, usem o **nome civil** (e, se existir empresa ou MEI, a razão social e o CNPJ). Não sei se existe CNPJ: se existir, o texto precisa dizer.
2. **Encarregado.** O texto diz que os criadores fazem esse papel. A Resolução 2/2022 pode dispensar o encarregado formal de agentes de pequeno porte, **mas não de quem trata em larga escala dados de crianças e adolescentes** (tratamento de alto risco). Como o público tem adolescentes, manter o papel e o canal é o mais seguro.
3. **Canal privado.** Hoje o contato é por perfis públicos do GitHub e pelo servidor oficial. Recomendo criar **um e-mail dedicado** (por exemplo, de privacidade) ou um formulário privado, e trocar a frase "não há e-mail público" quando existir. Sem canal privado, pedido de dados pessoais acaba em lugar público.
4. **Apagamento por inatividade.** A política diz a verdade: **não há apagamento automático** do jogo de quem sai. A LGPD (arts. 15 e 16) pede eliminar dados quando acaba a finalidade ou quando não são mais necessários, então guardar para sempre é frágil. Decidam um prazo (por exemplo, 12 ou 24 meses sem usar) e implementem uma rotina; depois, atualizem a seção 8 da política.
5. **Rotina de atendimento.** Prometemos resposta em **15 dias**. Falta o processo: quem atende, onde registra, como exporta e apaga os dados de **uma pessoa** (hoje é à mão, por consulta ao banco). Um script `export` e um `erase` por ID, com teste, tornariam a promessa fácil de cumprir.
6. **Plano de incidente.** Definam quem avisa a ANPD e os titulares em **3 dias úteis** (6 se forem pequeno porte, mas com dados de adolescentes e risco, não contem com a dobra). Um parágrafo interno com os passos basta.
7. **ECA Digital.** A Helena é de "acesso provável" por adolescentes. Hoje não vende, não tem anúncios e a **"Caixa misteriosa" da loja não abre nem sorteia nada** (há teste que impede isso sem aviso). Se criarem abertura de caixa com sorteio, ou qualquer venda, **revejam termos, política e a lei antes**. A aferição de idade confiável é da plataforma (Discord); acompanhem a regulamentação da ANPD.
8. **Idade mínima.** Com a mudança para o Discord, a idade mínima passou de 12 para **13 anos**, a que o próprio Discord exige para criar conta. Isso já fica acima de 12 (limite entre criança e adolescente no art. 14 da LGPD e no ECA), então não depende de consentimento parental específico. Se preferirem 14 ou 16, mudem os dois textos e o teste.
9. **Onde ficam os servidores do Discloud.** A política diz que está na política deles. Se descobrirem o país, escrevam, e confirmem as garantias para transferência internacional (art. 33).
10. **Avaliação de legítimo interesse.** Mantenham uma nota interna curta justificando os usos que se apoiam no art. 7º, IX (segurança, suporte), e a lista das tabelas do banco com o que guardam (art. 37, registro das operações). A lista de tabelas já existe em `tests/site.test.mjs`.
11. **Licença do código.** O repositório é público e **não tem arquivo LICENSE**. Sem licença, ninguém pode legalmente copiar nem reutilizar o código. Escolham uma (MIT, Apache 2.0 ou GPL) ou deixem explícito que todos os direitos são reservados.
12. **Revisão humana.** Antes de depender destes textos (principalmente por haver dados de adolescentes), vale uma revisão curta de quem exerce advocacia com foco em proteção de dados.

## Quando mudar os textos

Mudou o que o bot guarda, o que o site grava no navegador, quem recebe dados ou o prazo de algo? Mudem **o texto e a versão** no topo das duas páginas. Os testes falham se surgir tabela nova no banco sem descrição, chave nova no navegador sem citação, domínio novo sem citação, ou se os prazos escritos deixarem de vir de `config/web.mjs`.

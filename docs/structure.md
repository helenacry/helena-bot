# Estrutura do projeto

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Onde fica cada coisa. O teste `tests/structure.test.mjs` confere as pastas de `services/` contra este arquivo.

```
helena.mjs               Conexão com o gateway e despacho de comandos
command-registry.mjs     Carrega os comandos e registra no Discord
commands/                Um arquivo por comando, agrupados por categoria
  admin/ crime/ dev/ economy/ progress/ social/ utility/
services/                Regras do jogo e do bot, uma pasta por assunto
  economy/               daily, gemas, loja, bolsa, inventário, energia, missões, ranking
  progress/              experiência e conquistas
  crime/                 crime, roubo, prisão, fuga, procurados, lavagem
  combat/                duelos, arsenal, equipamento e hospital
  discord/               a conexão com o Discord: gateway, API REST, tradução do formato da
                         Helena para o do Discord e de volta, e o transporte (responder, editar, enviar)
  social/                casamento, família (Gozofone e filhos), cartão de perfil (e as fontes dele), /userinfo
  panels/                painéis com botões e modais (loja, inventário, ajuda, bolsa, uso)
  platform/              o que serve a todos: intervalo entre comandos, prefixo h, V2,
                         dono e bloqueios, busca de usuário, anexos, contadores do suporte,
                         evento repetido descartado (interaction-dedup), modo só-site (site-only)
  web/                   a API do painel do site
database/                Conexão SQLite e migrações (rodam sozinhas ao iniciar)
config/                  Valores ajustáveis (empregos, itens, crime, cooldowns...) e o tema das
                         respostas do chat (theme.mjs: cores, ícone, humores da pelúcia)
utils/                   Embeds, recibo e carimbo, plural, V2, tempo, IDs e utilitários
scripts/                 Ferramentas de linha de comando (npm run db:export, discloud:zip)
  dev/                   Para quem mexe no bot: a prévia das respostas (preview-replies.mjs)
  site/                  Geradores do site: dados, cartão de exemplo e wiki (npm run site:data,
                         site:card, wiki:build). Ficam fora de site/ porque leem o código do bot
site/                    O site (projeto Astro à parte): início, wiki, painel da conta, termos e privacidade
docs/                    Documentação (desenvolvimento, sistemas, hospedagem, site, notas jurídicas)
.github/workflows/       Redirecionamento do endereço antigo do site, no GitHub Pages (pages.yml)
wiki/                    Texto da wiki em Markdown (vira site/src/content/wiki.json com npm run wiki:build)
Dockerfile               Imagem para a nuvem (veja docs/hosting-railway.md)
tests/                   Testes automáticos (npm test)
assets/                  Imagens e as fontes Poppins: a base do cartão de perfil
```

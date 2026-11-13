# Imagens da Helena

As imagens que representam a Helena fora do código: o avatar, os banners e os ícones. Estão todas aqui para ter um só lugar onde procurar. O bot **não** as lê (por isso a pasta não vai no zip do Discloud nem na imagem do Docker); são para o Portal do Desenvolvedor, o GitHub, o README e o site.

| Arquivo | Tamanho | Para quê | Como refazer |
|---|---|---|---|
| `bot-avatar.png` | 1024 x 1024 | avatar do aplicativo no Portal do Desenvolvedor (**General Information**) | `npm --prefix site run profiles` |
| `app-banner.png` | 1500 x 500 | banner do aplicativo no Discord (**Bot → Banner**). Tudo importante fica no miolo, porque o perfil corta as bordas | `npm --prefix site run profiles` |
| `server-icon.png` | 1024 x 1024 | ícone do servidor oficial no Discord | `npm --prefix site run profiles` |
| `github-org.png` | 1024 x 1024 | avatar da organização `helenacry` no GitHub | `npm --prefix site run profiles` |
| `helena-pfp.png` | 512 x 512 | o mesmo avatar do bot, menor: é a "foto da Helena" do site (conversa da home) e do cartão de exemplo | `npm --prefix site run profiles` |
| `readme-banner.png` | 2133 x 560 | o topo do `README.md` | `npm --prefix site run icons` |

Os PNGs são versionados: o build do site e o bot não dependem do `sharp` para tê-los. Refaça só quando o desenho da pelúcia mudar (o desenho está nos dois scripts em `site/scripts/`).

## O que mora em outro lugar, e por quê

- **`site/public/bot/`**: a pelúcia em cada humor (`mood-*.png`, a miniatura das respostas do bot) e o ícone `helena.png`. Ficam no site porque as mensagens do bot apontam para o endereço publicado (`https://helena.discloud.dev/bot/...`); mover os arquivos quebraria a miniatura das mensagens que já foram enviadas. Gerados por `npm --prefix site run bot-images`.
- **`site/public/`**: `favicon.svg`, `apple-touch-icon.png` e `og-default.png` (a imagem de compartilhamento), gerados por `npm --prefix site run icons`.
- **`site/src/assets/helena-card.webp`**: o cartão de perfil de exemplo, gerado pelo mesmo código do `/perfil` (`npm run site:card`).
- **`assets/emojis/`**: os emojis do aplicativo, em SVG, enviados com `node scripts/dev/emojis.mjs upload`.
- **`assets/fonts/`**: as fontes Poppins do cartão de perfil (essas o bot lê).

// Perguntas frequentes da página inicial. Texto puro: serve à tela e ao JSON-LD
// (FAQPage), que precisa dizer exatamente o mesmo. Os números saem do bot.
import { game } from "./game.ts";
import { duration } from "./format.ts";

const foods = game.energy.foods.slice(0, 3);
const regen = duration(game.energy.regenSeconds);

const listed = foods
  .map(item => `${item.name.toLowerCase()} repõe ${item.energy}`)
  .join(", ")
  .replace(/, ([^,]*)$/, " e $1");

export const questions = [
  {
    q: "O dinheiro vale em todos os servidores?",
    a: "Carteira, banco, nível e inventário são separados por servidor. As gemas são globais e valem onde a Helena estiver."
  },
  {
    q: "O que é dinheiro sujo?",
    a: "É o que vem do crime e de parte dos roubos. Ele fica numa conta à parte e só vira saldo normal depois de passar pela /lavagem, que demora e devolve só uma parte."
  },
  {
    q: "O que acontece se eu for preso?",
    a: "Você cumpre a pena e fica sem trabalhar, resgatar o daily, comprar, vender, depositar, sacar e duelar. Saldo, perfil e inventário continuam liberados. Em /prisao você tenta a fuga: ganhar encurta a pena e perder aumenta."
  },
  {
    q: "Como recupero energia?",
    a: `A energia vai de 0 a ${game.energy.max} e volta 1 ponto a cada ${regen.replace(" min", " minutos")}. Com /usaritem, ${listed}. Com a energia cheia o item não é gasto.`
  },
  {
    q: "Posso ver o perfil de outra pessoa?",
    a: "Pode. Use /perfil usuario:@nome ou hperfil @nome. A busca é pelo @usuário exato ou por menção. Para ver insígnias, datas e Pulse, use /userinfo."
  },
  {
    q: "Uso a barra ou o h?",
    a: "Tanto faz. hsaldo e /saldo fazem a mesma coisa, com os mesmos botões e menus. O espaço depois do h é opcional."
  }
] as const;

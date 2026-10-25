// O motor da conversa de exemplo do herói. Lógica pura (sem DOM): recebe o estado,
// o comando, o relógio e o sorteio, e devolve o novo estado e a resposta do bot.
//
// Os textos e as cores das respostas são os dos comandos de verdade
// (commands/economy/daily.mjs, work.mjs, crime/crime.mjs, prison.mjs, services/economy/jobs.mjs)
// e todo número vem de src/data/game.json, que sai do código do bot. O recibo é montado
// pela mesma regra de utils/receipt.mjs (tests/site-sim.test.mjs compara os dois).

import { game, data, type Job } from "./game.ts";
import { money, duration, span } from "./format.ts";
import { rewardScale, wholeReais } from "./crime-math.ts";

/** A cor da barra do embed (HELENA_COLORS): marca, dinheiro, sucesso, risco, espera. */
export type Accent = "primary" | "economy" | "success" | "error" | "wait";

/** O humor da pelúcia na miniatura (config/theme.mjs, MOODS). */
export type Mood = "feliz" | "dinheiro" | "dormindo" | "preso" | "mascara" | "festa";

export interface Field {
  name: string;
  value: string;
  inline?: boolean;
}

/** Uma linha do recibo: [nome, valor]. `null` é a linha fina entre os grupos. */
export type Row = readonly [label: string, value: string] | null;

export interface Embed {
  accent: Accent;
  /** A seção do topo: "Daily" vira "HELENA · DAILY". */
  section: string;
  title: string;
  /** A frase da Helena. `**negrito**`, `` `código` ``, "> " de citação e "-# " de letra pequena. */
  say: string;
  /** O recibo (nome e valor ligados por pontilhado), em bloco de código. */
  rows: readonly Row[];
  /** A letra pequena de baixo. */
  note?: string;
  /** Só a loja usa campos. */
  fields: Field[];
  footer: string;
  mood: Mood;
  /** Embed sem seção, pelúcia nem rodapé: só o título e o texto (o "Bônus diário"). */
  plain?: boolean;
}

/** `link` é o botão de link do Discord ("Coletar no site"); `picker`, o menu "Escolha uma profissão". */
export type Reply =
  | { kind: "card" }
  | {
      kind: "embed";
      embed: Embed;
      live?: "jail";
      shop?: boolean;
      escape?: boolean;
      link?: { emoji: string; label: string };
      picker?: boolean;
    };

export type Command = "perfil" | "daily" | "trabalhar" | "loja" | "crime" | "prisao";

export interface SimState {
  wallet: number;
  dirty: number;
  energy: number;
  hp: number;
  xp: number;
  /** Quando a pena termina (ms desde 1970); null = livre. */
  jailEndsAt: number | null;
  crimes: number;
  wins: number;
  busts: number;
  dirtyEarned: number;
  /** Quem acabou de chegar não tem emprego: o primeiro /trabalhar abre o menu de empregos. */
  employed: boolean;
  used: Partial<Record<Command, true>>;
}

export const COMMANDS: readonly Command[] = ["perfil", "daily", "trabalhar", "loja", "crime", "prisao"];

/** Comandos que a cadeia bloqueia (config/crime.mjs, PRISON_BLOCKED_COMMANDS). */
const BLOCKED_IN_JAIL: ReadonlySet<Command> = new Set(["daily", "trabalhar", "crime"]);

/** Depois de usar, o comando fica em recarga (texto do botão). */
export const COOLDOWN_LABEL: Partial<Record<Command, string>> = {
  trabalhar: duration(game.work.cooldownSeconds),
  crime: duration(game.crime.cooldownSeconds)
};

export const initialState = (): SimState => ({
  wallet: 10,
  dirty: 0,
  energy: game.energy.max,
  hp: 100,
  xp: 0,
  jailEndsAt: null,
  crimes: 0,
  wins: 0,
  busts: 0,
  dirtyEarned: 0,
  employed: false,
  used: {}
});

export type Rng = () => number;

const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
const cents = (value: number): number => Math.round(value * 100) / 100;
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))] as T;

export function remainingSeconds(state: SimState, now: number): number {
  return state.jailEndsAt === null ? 0 : Math.max(0, Math.ceil((state.jailEndsAt - now) / 1000));
}

export function isJailed(state: SimState, now: number): boolean {
  return remainingSeconds(state, now) > 0;
}

/** O comando pode ser usado agora? (para desabilitar o botão e dizer por quê) */
export function availability(state: SimState, command: Command, now: number): { ok: boolean; why: string } {
  if (command === "prisao") return { ok: isJailed(state, now), why: "Você está livre" };
  if (command === "perfil" || command === "loja") return { ok: true, why: "" };
  if (state.used[command]) return { ok: false, why: `Em recarga (${COOLDOWN_LABEL[command] ?? ""})` };
  if (isJailed(state, now)) return { ok: true, why: "" }; // a cadeia responde com o aviso real
  return { ok: true, why: "" };
}

// ---------------------------------------------------------------- o recibo

// A mesma regra de utils/receipt.mjs: largura de 28 a 38 colunas, pontilhado entre o nome e o valor,
// linha fina nos `null`, sem linha fina no começo nem no fim.
const MIN_WIDTH = 28;
const MAX_WIDTH = 38;
const size = (text: string): number => [...text].length;

export function receipt(rows: readonly Row[], width = MIN_WIDTH): string[] {
  const lines = rows.map(row => (row === null ? null : ([row[0].trim(), row[1].trim()] as const)));
  const real = lines.filter((line): line is readonly [string, string] => line !== null);

  if (!real.length) return [];

  const natural = Math.max(...real.map(([label, value]) => size(label) + size(value) + 4));
  const total = Math.min(Math.max(width, natural), Math.max(MAX_WIDTH, natural));

  const body = lines.map(line => {
    if (line === null) return "─".repeat(total);

    const [label, value] = line;
    const dots = Math.max(2, total - size(label) - size(value) - 2);

    return `${label} ${"·".repeat(dots)} ${value}`;
  });

  while (body[0]?.startsWith("─")) body.shift();
  while (body.at(-1)?.startsWith("─")) body.pop();

  return body;
}

/** +R$ 420,00 / -R$ 15,00 / R$ 0,00: o sinal pelo valor, o texto já formatado por quem chama. */
export const signed = (amount: number, text: string): string => {
  const shown = text.replace(/^[-+−]/, "");

  if (amount > 0) return `+${shown}`;
  if (amount < 0) return `-${shown}`;

  return shown;
};

/** O carimbo do site num texto: uma etiqueta em maiúsculas, em código. */
export const stamp = (label: string): string => `\`${label.trim().toUpperCase()}\``;

// ---------------------------------------------------------------- respostas

const energyRow = (cost: number, now: number): Row => ["Energia", signed(-cost, `${cost} (${now}/${game.energy.max})`)];

function jailBlock(state: SimState, now: number): Reply {
  return {
    kind: "embed",
    live: "jail",
    escape: true,
    embed: {
      accent: "error",
      section: "Prisão",
      title: "⛓️ Você está preso",
      say: "Este comando fica bloqueado enquanto você cumpre pena. Consultas continuam liberadas.",
      rows: [
        ["Tempo restante", span(remainingSeconds(state, now))],
        ["Motivo", "Crime frustrado"]
      ],
      fields: [],
      mood: "preso",
      footer: "Atualizado automaticamente. Use /prisao"
    }
  };
}

// Com o painel do site no ar, o /daily não paga: mostra se o bônus está disponível e leva ao site,
// onde ele é coletado (commands/economy/daily.mjs, siteResponse). Por isso não muda o estado.
function daily(state: SimState): { state: SimState; reply: Reply } {
  return {
    state,
    reply: {
      kind: "embed",
      link: { emoji: "🌐", label: "Coletar no site" },
      embed: {
        accent: "success",
        section: "Daily",
        title: "🎁 Bônus diário",
        say:
          "-# ✅ Disponível agora neste servidor\n" +
          "\n" +
          "O daily agora é coletado no site da Helena. Entre com a sua conta do Discord e pegue o seu: " +
          "cada servidor tem a própria recarga de 24 horas e a própria sequência.",
        rows: [],
        fields: [],
        mood: "feliz",
        footer: "",
        plain: true
      }
    }
  };
}

// O nível do exemplo: quem chega começa no 1 (a linha "Nível" do /trabalhar também).
const LEVEL = 1;

const jobDetail = (job: Job): string => `${money(job.salary)} · nível ${job.level}`;

// O menu de empregos que o primeiro /trabalhar abre (services/economy/jobs.mjs, buildJobs). Os cargos
// bloqueados são 22: o exemplo mostra os 3 primeiros e resume o resto, para não virar uma parede de texto.
function jobMenu(): Reply {
  const open = data.jobs.filter(job => job.level <= LEVEL);
  const locked = data.jobs.filter(job => job.level > LEVEL);
  const shown = locked.slice(0, 3);

  return {
    kind: "embed",
    picker: true,
    embed: {
      accent: "success",
      section: "Carreira",
      title: "💼 Empregos",
      say: [
        "🧾 Antes de trabalhar, escolha um emprego no menu abaixo.",
        `📌 Você está sem emprego. Seu nível é **${LEVEL}**.`,
        "",
        `### ✅ Disponíveis para você (${open.length})`,
        ...open.map(job => `💼 **${job.name}** · ${jobDetail(job)}`),
        "",
        `### 🔒 Ainda bloqueados (${locked.length})`,
        ...shown.map(job => `🔒 ${job.name} · ${jobDetail(job)}`),
        ...(locked.length > shown.length ? [`-# …e mais ${locked.length - shown.length} cargos, que abrem a cada nível`] : []),
        "",
        "-# Trabalhar rende experiência, e cada nível novo libera cargos melhores."
      ].join("\n"),
      rows: [],
      fields: [],
      mood: "feliz",
      footer: "Escolha no menu para começar a trabalhar"
    }
  };
}

/** A opção do menu "Escolha uma profissão" (o único cargo aberto no nível 1), como o bot a escreve. */
export function jobOption(): { label: string; description: string } {
  const job = data.jobs[0];

  return {
    label: `💼 ${job?.name ?? "Entregador"}`,
    description: `${money(job?.salary ?? 0)} por expediente · nível ${job?.level ?? 1}`
  };
}

/** A pessoa escolheu o emprego no menu (services/panels/jobs-panel.mjs): a mensagem vira a confirmação. */
export function pickJob(state: SimState): { state: SimState; reply: Reply } {
  const job = data.jobs[0];

  return {
    state: { ...state, employed: true },
    reply: {
      kind: "embed",
      embed: {
        accent: "success",
        section: "Carreira",
        title: "🎉 Novo emprego",
        say: `Você agora é **${job?.name ?? "Entregador"}**. Use \`/trabalhar\` para o primeiro expediente.`,
        rows: [
          ["Cargo", job?.name ?? "Entregador"],
          ["Salário", money(job?.salary ?? 0)],
          ["Nível exigido", String(job?.level ?? 1)]
        ],
        fields: [],
        mood: "festa",
        footer: "Um novo capítulo na sua carreira"
      }
    }
  };
}

function work(state: SimState): { state: SimState; reply: Reply } {
  // sem emprego (quem acabou de chegar) não há o que pagar: primeiro escolhe o cargo no menu
  if (!state.employed) return { state, reply: jobMenu() };

  const job = data.jobs[0];
  const pay = job?.salary ?? 0;
  const energy = Math.max(0, state.energy - game.work.energy);
  const xp = state.xp + game.work.xp;
  const next: SimState = { ...state, wallet: cents(state.wallet + pay), energy, xp, used: { ...state.used, trabalhar: true } };

  return {
    state: next,
    reply: {
      kind: "embed",
      embed: {
        accent: "success",
        section: "Trabalho",
        title: "💼 Expediente concluído",
        say: `Dia de trabalho como **${job?.name ?? "Entregador"}** feito e pago.`,
        rows: [
          ["Pagamento", signed(pay, money(pay))],
          ["Experiência", signed(game.work.xp, `${game.work.xp} XP`)],
          energyRow(game.work.energy, energy),
          null,
          ["Carteira", money(next.wallet)],
          ["Nível", `1 · ${xp.toLocaleString("pt-BR")} XP`]
        ],
        fields: [],
        mood: "feliz",
        footer: "Próximo expediente em 1 hora"
      }
    }
  };
}

function shop(state: SimState): { state: SimState; reply: Reply } {
  const foods = game.energy.foods.slice(0, 3);
  const numbers = ["1️⃣", "2️⃣", "3️⃣"];

  const fields: Field[] = foods.map((food, index) => {
    const canBuy = Math.floor(state.wallet / food.buy);
    const status = canBuy > 0 ? `✅ Você pode comprar até **${canBuy}**` : `🔒 Faltam **${money(cents(food.buy - state.wallet))}**`;

    return {
      name: `${numbers[index]} ${food.emoji} ${food.name}`,
      value:
        `**${money(food.buy)}** · venda ${money(food.sell)}\n${food.description}\n${status}\n` +
        `-# você tem 0/${food.maxStack} · id \`${food.id}\``
    };
  });

  return {
    state,
    reply: {
      kind: "embed",
      shop: true,
      embed: {
        accent: "economy",
        section: "Loja",
        title: "🛒 🍽️ Consumíveis",
        say: `${foods.length} itens nesta prateleira. Toque no número do item para comprar: os verdes cabem na sua carteira.`,
        rows: [
          ["Carteira", money(state.wallet)],
          ["Gemas", "0"]
        ],
        fields,
        mood: "dinheiro",
        footer: `Página 1/1 · ${foods.length} itens`
      }
    }
  };
}

function crime(state: SimState, now: number, rng: Rng): { state: SimState; reply: Reply } {
  const c = game.crime;
  const energy = Math.max(0, state.energy - c.energy);
  const used = { ...state.used, crime: true as const };
  const win = rng() < c.successChance;

  if (win) {
    const jackpot = rng() < c.jackpotChance;
    const story = jackpot ? c.jackpot : pick(rng, c.successStories);
    const amount = wholeReais(between(rng, story.min, story.max) * rewardScale(1));
    const xp = Math.round(between(rng, c.xp.min, c.xp.max));
    const next: SimState = {
      ...state,
      energy,
      used,
      dirty: cents(state.dirty + amount),
      dirtyEarned: cents(state.dirtyEarned + amount),
      xp: state.xp + xp,
      crimes: state.crimes + 1,
      wins: state.wins + 1
    };

    return {
      state: next,
      reply: {
        kind: "embed",
        embed: {
          accent: "economy",
          section: "Crime",
          title: jackpot ? "💎 Golpe de mestre" : "🕵️ Crime bem-sucedido",
          say: story.text,
          rows: [
            ["Dinheiro sujo", signed(amount, money(amount))],
            ["Experiência", signed(xp, `${xp} XP`)],
            energyRow(c.energy, energy),
            null,
            ["Total sujo", money(next.dirty)]
          ],
          note: `${stamp("não vale nada")} até passar pela \`/lavagem\`.`,
          fields: [],
          mood: jackpot ? "festa" : "mascara",
          footer: `Próximo crime em ${span(c.cooldownSeconds)}`
        }
      }
    };
  }

  const story = pick(rng, c.failureStories);
  const fine = Math.min(state.wallet, wholeReais(between(rng, c.fine.min, c.fine.max) * rewardScale(1)));
  const hpLost = story.injury ? Math.round(between(rng, c.injuryHp.min, c.injuryHp.max)) : 0;
  const hp = Math.max(1, state.hp - hpLost);
  const next: SimState = {
    ...state,
    energy,
    used,
    hp,
    wallet: cents(state.wallet - fine),
    jailEndsAt: now + c.jailSeconds * 1000,
    crimes: state.crimes + 1,
    busts: state.busts + 1
  };

  const rows: Row[] = [
    ["Multa", fine > 0 ? signed(-fine, money(fine)) : "nada (carteira vazia)"],
    ["Prisão", span(c.jailSeconds)]
  ];

  if (hpLost > 0) rows.push(["Ferimento", signed(-hpLost, `${hpLost} HP (restam ${hp})`)]);

  rows.push(energyRow(c.energy, energy));

  return {
    state: next,
    reply: {
      kind: "embed",
      embed: {
        accent: "error",
        section: "Crime",
        title: "🚨 Você foi pego",
        say: `${story.text}\n> Preso, você não trabalha, não compra e não mexe em dinheiro.`,
        rows,
        fields: [],
        mood: "preso",
        footer: "/prisao acompanha a sua pena"
      }
    }
  };
}

function prison(state: SimState, now: number): Reply {
  const jailed = isJailed(state, now);
  const rate = state.crimes > 0 ? `${Math.round((state.wins / state.crimes) * 100)}%` : "—";

  const rows: Row[] = [];

  if (jailed) {
    rows.push(
      ["Tempo restante", span(remainingSeconds(state, now))],
      ["Pena total", span(game.crime.jailSeconds)],
      ["Motivo", "Crime frustrado"],
      null
    );
  }

  rows.push(
    ["Crimes", String(state.crimes)],
    ["Sucessos", `${state.wins} (${rate})`],
    ["Capturas", String(state.busts)],
    ["Total arrecadado (sujo)", money(state.dirtyEarned)]
  );

  return {
    kind: "embed",
    live: jailed ? "jail" : undefined,
    escape: jailed,
    embed: {
      accent: jailed ? "error" : "success",
      section: "Prisão",
      title: jailed ? "⛓️ Você está preso" : "🔓 Você está livre",
      say: jailed
        ? "Trabalho, compras, depósitos e outras movimentações ficam bloqueados até o fim da pena."
        : "Nenhuma pena em curso. Consultas e movimentações estão liberadas.",
      rows,
      fields: [],
      mood: jailed ? "preso" : "feliz",
      footer: jailed ? "Atualizado automaticamente" : "Ficha criminal"
    }
  };
}

/** Executa um comando. Nunca altera o estado recebido. */
export function run(
  state: SimState,
  command: Command,
  now: number,
  rng: Rng = Math.random
): { state: SimState; reply: Reply } {
  if (command === "perfil") return { state, reply: { kind: "card" } };
  if (command === "loja") return shop(state);
  if (command === "prisao") return { state, reply: prison(state, now) };

  if (BLOCKED_IN_JAIL.has(command) && isJailed(state, now)) {
    return { state, reply: jailBlock(state, now) };
  }

  if (command === "daily") return daily(state);
  if (command === "trabalhar") return work(state);
  return crime(state, now, rng);
}

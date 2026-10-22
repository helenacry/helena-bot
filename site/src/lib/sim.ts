// O motor da conversa de exemplo do herói. Lógica pura (sem DOM): recebe o estado,
// o comando, o relógio e o sorteio, e devolve o novo estado e a resposta do bot.
//
// Os textos e as cores das respostas são os dos comandos de verdade
// (commands/economy/daily.mjs, work.mjs, crime/crime.mjs, prison.mjs) e todo
// número vem de src/data/game.json, que sai do código do bot.

import { game, data } from "./game.ts";
import { money, clock, duration } from "./format.ts";
import { rewardScale, wholeReais } from "./crime-math.ts";

export type Accent = "success" | "error" | "warning" | "economy";

export interface Field {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  accent: Accent;
  title: string;
  description: string;
  fields: Field[];
  footer: string;
}

export type Reply =
  | { kind: "card" }
  | { kind: "embed"; embed: Embed; live?: "jail"; shop?: boolean; escape?: boolean };

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
  used: Partial<Record<Command, true>>;
}

export const COMMANDS: readonly Command[] = ["perfil", "daily", "trabalhar", "loja", "crime", "prisao"];

/** Comandos que a cadeia bloqueia (config/crime.mjs, PRISON_BLOCKED_COMMANDS). */
const BLOCKED_IN_JAIL: ReadonlySet<Command> = new Set(["daily", "trabalhar", "crime"]);

/** Depois de usar, o comando fica em recarga (texto do botão). */
export const COOLDOWN_LABEL: Partial<Record<Command, string>> = {
  daily: "24 h",
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

// ---------------------------------------------------------------- respostas

function jailBlock(state: SimState, now: number): Reply {
  return {
    kind: "embed",
    live: "jail",
    escape: true,
    embed: {
      accent: "warning",
      title: "⛓️ Você está preso",
      description: "Este comando fica bloqueado enquanto você cumpre pena. Consultas continuam liberadas.",
      fields: [
        { name: "⏳ Tempo restante", value: `**${clock(remainingSeconds(state, now))}**`, inline: true },
        { name: "📜 Motivo", value: "Crime frustrado", inline: true }
      ],
      footer: "Helena • Atualizado automaticamente."
    }
  };
}

function daily(state: SimState): { state: SimState; reply: Reply } {
  const total = game.daily.ladder[0] ?? game.daily.reward;
  const next: SimState = { ...state, wallet: cents(state.wallet + total), used: { ...state.used, daily: true } };

  return {
    state: next,
    reply: {
      kind: "embed",
      embed: {
        accent: "success",
        title: "🎁 Helena Daily",
        description: "**Recompensa resgatada!**\n\nVocê completou o dia **1** da sua sequência.",
        fields: [
          { name: "💰 Recompensa base", value: `**${money(game.daily.reward)}**`, inline: true },
          { name: "🔥 Bônus de sequência", value: `**${money(0)}**`, inline: true },
          { name: "💵 Total recebido", value: `**${money(total)}**` },
          { name: "🔥 Sequência atual", value: "**1 dia**", inline: true },
          { name: "🏆 Seu recorde", value: "**1 dia**", inline: true },
          { name: "👛 Carteira atual", value: `**${money(next.wallet)}**`, inline: true },
          { name: "⏰ Próximo resgate", value: "**24 horas**", inline: true }
        ],
        footer: "Helena Daily • Sua dedicação merece recompensas."
      }
    }
  };
}

function work(state: SimState): { state: SimState; reply: Reply } {
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
        title: "💼 Expediente concluído!",
        description: "Você concluiu seu trabalho e recebeu sua recompensa.\n\nContinue trabalhando para evoluir!",
        fields: [
          { name: "👔 Emprego", value: `**${job?.name ?? "Entregador"}**` },
          { name: "💰 Pagamento", value: `**+${money(pay)}**`, inline: true },
          { name: "✨ Experiência", value: `**+${game.work.xp} XP**`, inline: true },
          { name: "⚡ Energia consumida", value: `-${game.work.energy}`, inline: true },
          { name: "🔋 Energia restante", value: `${energy}/${game.energy.max}`, inline: true },
          { name: "👛 Carteira atual", value: `**${money(next.wallet)}**`, inline: true },
          { name: "⭐ Nível", value: "1", inline: true },
          { name: "📊 XP total", value: String(xp), inline: true },
          { name: "⏰ Próximo expediente", value: "Em 1 hora" }
        ],
        footer: "Helena • O esforço constrói sua fortuna."
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
        `💰 **${money(food.buy)}**  •  💵 Venda: ${money(food.sell)}\n${status}\n${food.description}\n` +
        `🎒 Você tem **0**/${food.maxStack}  •  🆔 \`${food.id}\``
    };
  });

  return {
    state,
    reply: {
      kind: "embed",
      shop: true,
      embed: {
        accent: "economy",
        title: "🛒 Helena Loja • 🍽️ Consumíveis",
        description:
          `👛 **Carteira:** ${money(state.wallet)}  •  💎 **Gemas:** 0\n` +
          `📂 **Prateleira:** 🍽️ Consumíveis • ${foods.length} itens\n\n` +
          "Toque no número do item para comprar. Os verdes cabem na sua carteira.",
        fields,
        footer: `Helena • Página 1/1 • ${foods.length} itens`
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
          accent: "success",
          title: jackpot ? "💎 Golpe de mestre!" : "🕵️ Crime bem-sucedido!",
          description: story.text,
          fields: [
            { name: "💸 Dinheiro sujo", value: `**+${money(amount)}**`, inline: true },
            { name: "✨ Experiência", value: `**+${xp} XP**`, inline: true },
            { name: "🧺 Total sujo", value: `**${money(next.dirty)}**`, inline: true },
            { name: "⚡ Energia", value: `-${c.energy} (restam ${energy}/${game.energy.max})`, inline: true },
            { name: "⏰ Próximo crime", value: `Em ${duration(c.cooldownSeconds) === "1 h" ? "1 hora" : duration(c.cooldownSeconds)}`, inline: true }
          ],
          footer: "Helena • Dinheiro sujo não compra nada. Use /lavagem."
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

  const fields: Field[] = [
    {
      name: "💸 Multa",
      value: fine > 0 ? `**-${money(fine)}**` : "Nada: sua carteira estava vazia",
      inline: true
    },
    { name: "⛓️ Prisão", value: `**${clock(c.jailSeconds)}**`, inline: true }
  ];

  if (hpLost > 0) fields.push({ name: "🩸 Ferimento", value: `**-${hpLost} HP** (restam ${hp})`, inline: true });

  fields.push({ name: "⚡ Energia", value: `-${c.energy} (restam ${energy}/${game.energy.max})`, inline: true });

  return {
    state: next,
    reply: {
      kind: "embed",
      embed: {
        accent: "error",
        title: "🚨 Você foi pego!",
        description: `${story.text}\n\nEnquanto estiver preso, você não pode trabalhar, comprar nem movimentar dinheiro.`,
        fields,
        footer: "Helena • Use /prisao para acompanhar sua pena."
      }
    }
  };
}

function prison(state: SimState, now: number): Reply {
  const jailed = isJailed(state, now);
  const rate = state.crimes > 0 ? `${Math.round((state.wins / state.crimes) * 100)}%` : "—";

  const fields: Field[] = [];

  if (jailed) {
    fields.push(
      { name: "⏳ Tempo restante", value: `**${clock(remainingSeconds(state, now))}**`, inline: true },
      { name: "📜 Pena total", value: clock(game.crime.jailSeconds), inline: true },
      { name: "⚖️ Motivo", value: "Crime frustrado", inline: true }
    );
  }

  fields.push(
    { name: "🕵️ Crimes", value: String(state.crimes), inline: true },
    { name: "✅ Sucessos", value: `${state.wins} (${rate})`, inline: true },
    { name: "🚨 Capturas", value: String(state.busts), inline: true },
    { name: "💸 Total arrecadado (sujo)", value: money(state.dirtyEarned) }
  );

  return {
    kind: "embed",
    live: jailed ? "jail" : undefined,
    escape: jailed,
    embed: {
      accent: jailed ? "warning" : "success",
      title: jailed ? "⛓️ Você está preso" : "🔓 Você está livre",
      description: jailed
        ? "Trabalho, compras, depósitos e outras movimentações ficam bloqueados até o fim da pena."
        : "Nenhuma pena em curso. Consultas e movimentações estão liberadas.",
      fields,
      footer: jailed ? "Helena • Atualizado automaticamente." : "Helena • Ficha criminal"
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

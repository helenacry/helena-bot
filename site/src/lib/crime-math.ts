// As contas do crime, iguais às do bot (services/crime/crime.mjs, config/crime.mjs):
// prêmio e multa crescem linearmente com o nível, e o valor final é arredondado
// para reais inteiros. Tudo lê src/data/game.json.

import { game } from "./game.ts";

/** Multiplicador de prêmio e multa: 1,0 no nível 1 e `scaleAtLevel100` no 100. */
export function rewardScale(level: number): number {
  const safe = Math.min(100, Math.max(1, Math.round(Number(level) || 1)));
  const perLevel = (game.crime.scaleAtLevel100 - 1) / 99;
  return 1 + (safe - 1) * perLevel;
}

/** Reais inteiros, como o bot (`Math.round(cents / 100) * 100` em centavos). */
export const wholeReais = (value: number): number => Math.round(value);

const mid = (range: { min: number; max: number }): number => (range.min + range.max) / 2;

export interface Average {
  /** Dinheiro sujo médio por tentativa (já contando a chance de falhar). */
  dirty: number;
  /** Multa média por tentativa (sem o teto da carteira). */
  fine: number;
  /** Minutos de cadeia por tentativa, em média. */
  jailMinutes: number;
  /** Quanto sobra limpo por tentativa depois de lavar, menos a multa. */
  clean: { public: number; private: number };
}

/** A média de muitas tentativas no nível dado. */
export function average(level: number): Average {
  const c = game.crime;
  const scale = rewardScale(level);

  const stories = c.successStories.reduce((sum, story) => sum + mid(story), 0) / c.successStories.length;
  const success = (1 - c.jackpotChance) * stories + c.jackpotChance * mid(c.jackpot);

  const dirty = c.successChance * success * scale;
  const fine = (1 - c.successChance) * mid(c.fine) * scale;

  const rate = (kind: "public" | "private") => mid(game.laundering.kinds[kind].rate);

  return {
    dirty,
    fine,
    jailMinutes: ((1 - c.successChance) * c.jailSeconds) / 60,
    clean: {
      public: dirty * rate("public") - fine,
      private: dirty * rate("private") - fine
    }
  };
}

// ------------------------------------------------------------------ sorteio

export interface Attempt {
  n: number;
  win: boolean;
  jackpot: boolean;
  story: string;
  /** Dinheiro sujo ganho (só quando deu certo). */
  amount: number;
  /** Multa (só quando deu errado). */
  fine: number;
}

const between = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);
const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))] as T;

/** Uma tentativa de crime no nível dado, sorteada como no bot. */
export function rollCrime(n: number, level: number, rng: () => number = Math.random): Attempt {
  const c = game.crime;
  const scale = rewardScale(level);

  if (rng() < c.successChance) {
    const jackpot = rng() < c.jackpotChance;
    const story = jackpot ? c.jackpot : pick(rng, c.successStories);

    return { n, win: true, jackpot, story: story.text, amount: wholeReais(between(rng, story.min, story.max) * scale), fine: 0 };
  }

  const story = pick(rng, c.failureStories);

  return { n, win: false, jackpot: false, story: story.text, amount: 0, fine: wholeReais(between(rng, c.fine.min, c.fine.max) * scale) };
}

export interface Totals {
  crimes: number;
  wins: number;
  busts: number;
  dirty: number;
  fines: number;
  jailMinutes: number;
  clean: { public: number; private: number };
}

export function totals(attempts: readonly Attempt[]): Totals {
  const wins = attempts.filter(a => a.win).length;
  const dirty = attempts.reduce((sum, a) => sum + a.amount, 0);
  const fines = attempts.reduce((sum, a) => sum + a.fine, 0);
  const rate = (kind: "public" | "private") => mid(game.laundering.kinds[kind].rate);

  return {
    crimes: attempts.length,
    wins,
    busts: attempts.length - wins,
    dirty,
    fines,
    jailMinutes: ((attempts.length - wins) * game.crime.jailSeconds) / 60,
    clean: { public: dirty * rate("public") - fines, private: dirty * rate("private") - fines }
  };
}

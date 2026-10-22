// Dados do bot, gerados por `npm run site:data` em src/data/game.json.
// Não edite o JSON à mão: ele sai do código do bot (config/, commands/, services/).
import raw from "../data/game.json" with { type: "json" };

export interface Command {
  name: string;
  aliases: string[];
  description: string;
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
  commands: Command[];
}

export interface Job {
  name: string;
  level: number;
  salary: number;
}

export interface Achievement {
  name: string;
  emoji: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  description: string;
}

export interface GameFacts {
  work: { cooldownSeconds: number; xp: number; energy: number };
  energy: {
    max: number;
    regenSeconds: number;
    foods: { id: string; name: string; emoji: string; description: string; energy: number; buy: number; sell: number; maxStack: number }[];
  };
  daily: { ladder: number[]; reward: number; streakBonus: number; weeklyBonus: number; graceSeconds: number };
  missions: { id: string; name: string; description: string; emoji: string; reward: number; xp: number }[];
  crime: {
    energy: number;
    cooldownSeconds: number;
    successChance: number;
    jackpotChance: number;
    jailSeconds: number;
    fine: { min: number; max: number };
    scaleAtLevel100: number;
    successStories: { text: string; min: number; max: number }[];
    jackpot: { text: string; min: number; max: number };
    xp: { min: number; max: number };
    injuryHp: { min: number; max: number };
    failureStories: { text: string; injury: boolean }[];
  };
  robbery: { energy: number; cooldownSeconds: number; stealRate: { min: number; max: number }; cleanShare: number };
  laundering: {
    minAmount: number;
    maxAmount: number;
    privateUnlockGems: number;
    kinds: Record<"public" | "private", { name: string; rate: { min: number; max: number }; cooldownSeconds: number }>;
  };
  escape: { stages: number; cooldownSeconds: number; winCut: number; lossAdd: number };
}

export interface GameData {
  stats: { commands: number; aliases: number; jobs: number; shopItems: number; weapons: number; achievements: number };
  categories: Category[];
  jobs: Job[];
  rarities: Record<string, string>;
  achievements: Achievement[];
  game: GameFacts;
}

export const data = raw as unknown as GameData;
export const { stats, game } = data;

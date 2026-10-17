import { HOSPITAL_RULES } from "./hospital.mjs";

import { DUEL_RULES } from "./combat.mjs";

import { progressBar } from "../../utils/bar.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// PEÇAS DOS COMANDOS DE COMBATE
// ==========================================

// O que os comandos de vida, equipamento e duelo mostram do mesmo jeito.

// "██████░░░░ 60/100"
export const hpLine = hp =>
    `${progressBar(hp, HOSPITAL_RULES.maxHp)} **${hp}/${HOSPITAL_RULES.maxHp}**`;

// "██████████ 100%" (a durabilidade vai de 0 a 100)
export const durabilityLine = durability =>
    `${progressBar(durability, 100)} **${durability}%**`;

export const isFirearm = weapon => weapon?.weaponType === "firearm";

export const weaponTypeLabel = weapon =>
    isFirearm(weapon) ? "Arma de fogo" : "Arma branca";

// O dano da arma como o duelo conta (arma que não define o dano vale o padrão).
export const weaponDamage = weapon =>
    Number(weapon?.damage || DUEL_RULES.defaultWeaponDamage);

// Tempo que falta, ou "Sem proteção" quando já acabou.
export const protectionText = seconds =>
    seconds > 0 ? formatDuration(seconds) : "Sem proteção";

// "há 2h 5m" a partir de quantos segundos se passaram.
export const ago = seconds => `há ${formatDuration(Math.max(0, seconds))}`;

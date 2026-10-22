// Formatos de pt-BR. Tudo passa por Intl, nunca montado à mão.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlWhole = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});
const number = new Intl.NumberFormat("pt-BR");

/** 1234.5 -> "R$ 1.234,50" (com espaço comum; o Intl usa espaço fino sem quebra). */
export const money = (reais: number): string => brl.format(reais).replace(/ /g, " ");

/** 1300 -> "R$ 1.300" */
export const moneyWhole = (reais: number): string => brlWhole.format(reais).replace(/ /g, " ");

export const int = (value: number): string => number.format(value);

/** 0.35 -> "35%" */
export const percent = (fraction: number): string =>
  `${(fraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** 1800 -> "30 min", 3600 -> "1 h", 86400 -> "24 h" */
export function duration(seconds: number): string {
  if (seconds % 86400 === 0 && seconds >= 86400) return `${seconds / 86400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** 1781 -> "29m 41s" (o relógio da prisão) */
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}m ${s}s`;
}

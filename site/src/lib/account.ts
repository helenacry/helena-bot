// Painel da conta, parte sem tela: login com o Discord (OAuth2 + PKCE), formatos e
// as regras de ordem e de texto. A API fica em services/web/web-api.mjs (veja o
// README, "Painel do site (API)"). Tudo aqui é puro e testado em site/tests/account.test.ts.

// ------------------------------------------------------------------ tipos da API

export interface Prize {
  total: number;
  weeklyBonus: number;
}

export interface DailyStatus {
  available: boolean;
  remaining: number;
  streak: number;
  nextStreak: number;
  nextReward: Prize;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  player: { wallet: number; bank: number; level: number } | null;
  daily: DailyStatus;
  prison: { remaining: number } | null;
}

export interface Me {
  user: { id?: string; username: string; displayName: string; avatarUrl: string | null };
  expiresAt: number;
  captcha: boolean;
  gems: { balance: number; available: boolean; remaining: number; min: number; max: number; cooldown: number };
  daily: { cooldown: number; ladder: number[] };
  guilds: Guild[];
}

export interface Session {
  token: string;
  expiresAt: number;
}

// ------------------------------------------------------------------ PKCE

export function base64url(bytes: Uint8Array): string {
  let text = "";

  for (const byte of bytes) text += String.fromCharCode(byte);

  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomBytes = (size: number): Uint8Array => crypto.getRandomValues(new Uint8Array(size));

/** O verifier fica só no navegador; o Discord recebe o desafio (S256). */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(randomBytes(32)); // 43 caracteres
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export const randomState = (): string => base64url(randomBytes(16));

/** Endereço de retorno = a própria página, terminando em "/". Tem de ser igual ao cadastrado no Discord. */
export function redirectUri(location: { origin: string; pathname: string }): string {
  let path = location.pathname.replace(/index\.html$/, "");

  if (!path.endsWith("/")) path += "/";

  return location.origin + path;
}

export function buildAuthorizeUrl(options: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const query = new URLSearchParams({
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: "identify guilds",
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: "S256"
  });

  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

/** O que o Discord devolveu na volta do login. */
export function parseCallback(search: string): { code: string; state: string; error: string } {
  const query = new URLSearchParams(search);

  return {
    code: query.get("code") ?? "",
    state: query.get("state") ?? "",
    error: query.get("error") ?? ""
  };
}

// ------------------------------------------------------------------ formatos

/** Centavos -> "R$ 1.234,56". */
export function formatMoney(cents: unknown): string {
  return ((Number(cents) || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 3725 -> "1h 2m 5s"; menos de 1 hora -> "2m 5s". */
export function formatDuration(seconds: unknown): string {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);

  parts.push(`${secs}s`);

  return parts.join(" ");
}

/** 55000 -> "550", 130000 -> "1.300": o prêmio na escada, sem "R$" e sem centavos. */
export const shortMoney = (cents: unknown): string => Math.round((Number(cents) || 0) / 100).toLocaleString("pt-BR");

/** Quanto da espera já passou (de 0 a 1): faltam `remaining` de `total` segundos. */
export function waitProgress(remaining: unknown, total: unknown): number {
  const whole = Number(total) > 0 ? Number(total) : 1;

  return Math.min(1, Math.max(0, 1 - (Number(remaining) || 0) / whole));
}

// ------------------------------------------------------------------ regras de tela

export interface Pip {
  day: number;
  weekly: boolean;
  state: "done" | "next" | "todo";
}

/** Os 7 dias do ciclo: "done" já coletados, "next" o de hoje, "todo" os que faltam. O sétimo é o do bônus semanal. */
export function weekPips(nextStreak: number): Pip[] {
  const position = ((Math.max(1, nextStreak) - 1) % 7) + 1;
  const pips: Pip[] = [];

  for (let day = 1; day <= 7; day++) {
    pips.push({ day, weekly: day === 7, state: day < position ? "done" : day === position ? "next" : "todo" });
  }

  return pips;
}

/** 0 = daily liberado, 1 = esperando, 2 = preso. */
const rankOf = (guild: Guild): number => (guild.prison ? 2 : guild.daily.available ? 0 : 1);

const rewardOf = (guild: Guild): number => Number(guild.daily.nextReward?.total) || 0;

/**
 * Ordem das linhas: o daily liberado vem primeiro (o prêmio maior na frente); depois
 * quem está esperando (o que libera antes vem antes); por último, quem está preso.
 * Empatou, fica a ordem da API.
 */
export function sortGuilds(guilds: readonly Guild[] | null | undefined): Guild[] {
  return (guilds ?? [])
    .map((guild, index) => ({ guild, index }))
    .sort((a, b) => {
      const diff = rankOf(a.guild) - rankOf(b.guild);

      if (diff) return diff;

      if (rankOf(a.guild) === 0 && rewardOf(a.guild) !== rewardOf(b.guild)) {
        return rewardOf(b.guild) - rewardOf(a.guild);
      }

      if (rankOf(a.guild) === 1 && a.guild.daily.remaining !== b.guild.daily.remaining) {
        return a.guild.daily.remaining - b.guild.daily.remaining;
      }

      return a.index - b.index;
    })
    .map(item => item.guild);
}

/** O resumo do topo da lista: quantos dailys estão liberados, quanto somam (centavos) e, se nenhum está, em quanto tempo sai o próximo. Preso não conta. */
export function tally(guilds: readonly Guild[] | null | undefined): { ready: number; total: number; nextIn: number | null } {
  let ready = 0;
  let total = 0;
  let nextIn: number | null = null;

  for (const guild of guilds ?? []) {
    if (guild.prison) continue;

    if (guild.daily.available) {
      ready += 1;
      total += rewardOf(guild);
    } else if (nextIn === null || guild.daily.remaining < nextIn) {
      nextIn = guild.daily.remaining;
    }
  }

  return { ready, total, nextIn };
}

/** A escada do exemplo da tela de entrada: os mesmos valores do bot (o teste confere contra o cálculo do daily). */
export const SAMPLE_LADDER = [50000, 55000, 60000, 65000, 70000, 75000, 130000] as const;

/** Só imagens https entram na página (nada de javascript: ou data:). */
export const safeImage = (url: unknown): string => (typeof url === "string" && /^https:\/\//.test(url) ? url : "");

/** Texto para cada resposta de erro da API. */
export function errorText(code: string | undefined, extra: { remaining?: number; retryAfter?: number; detail?: string } = {}): string {
  const wait = extra.remaining !== undefined ? formatDuration(extra.remaining) : "";
  // Um código curto do motivo (ex.: "conta:401"), para a equipe achar a causa sem adivinhar. Só texto simples.
  const detail = typeof extra.detail === "string" && /^[\w:.-]{1,60}$/.test(extra.detail) ? ` (código: ${extra.detail})` : "";

  const texts: Record<string, string> = {
    cooldown: wait ? `Ainda não liberou. Falta ${wait}.` : "Ainda não liberou.",
    prison: `Você está preso nesse servidor${wait ? ` (falta ${wait})` : ""}. Preso não coleta o daily.`,
    wallet_full: "Sua carteira está no limite. Deposite parte do dinheiro no banco e tente de novo.",
    guild_not_allowed: "A Helena não está nesse servidor ou você saiu dele. Entre de novo para atualizar a lista.",
    captcha_required: "Confirme a verificação anti-robô antes de coletar.",
    captcha_failed: "A verificação anti-robô falhou. Tente de novo.",
    captcha_unavailable: "Não consegui conferir a verificação agora. Tente de novo em instantes.",
    too_many_requests: `Muitas tentativas. Espere um pouco${extra.retryAfter ? ` (${formatDuration(extra.retryAfter)})` : ""}.`,
    session_expired: "Sua sessão acabou. Entre de novo.",
    unauthorized: "Sua sessão acabou. Entre de novo.",
    login_failed: `Não deu para entrar. Tente de novo.${detail}`,
    invalid_redirect: "Este endereço não está autorizado a fazer login. Avise a equipe da Helena.",
    discord_unavailable: "O Discord não respondeu agora. Tente de novo em instantes."
  };

  return (code && texts[code]) || "Algo deu errado. Tente de novo.";
}

export const OFFLINE = "A Helena está fora do ar agora. Tente de novo mais tarde.";

// ---------------------------------------------------------------- recibo de resultado

/** Uma linha do recibo: [nome, valor, tom]; `null` é o tracejado entre os grupos. */
export type SlipRow = readonly [label: string, value: string, tone?: "plus"] | null;

/** O recibo que aparece depois de uma coleta: o que entrou, em linhas de papel térmico. */
export interface Slip {
  /** O carimbo: RESGATADO, COLETADO. */
  stamp: string;
  /** "Daily · Helena Lab" */
  title: string;
  /** O dia e a hora da coleta: "25/10 · 18:40". */
  when: string;
  rows: SlipRow[];
  /** A letra pequena de baixo, uma linha por item. */
  foot: string[];
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Um número finito, ou null (a API pode deixar campos de fora). */
const finite = (value: unknown): number | null => (value !== undefined && value !== null && Number.isFinite(Number(value)) ? Number(value) : null);

/** "25/10 · 18:40", no relógio de quem está olhando. */
export function slipTime(date: Date): string {
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hour = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return `${day} · ${hour}`;
}

// as linhas sem null no começo, no fim nem dois seguidos
function tidy(rows: SlipRow[]): SlipRow[] {
  const out: SlipRow[] = [];

  for (const row of rows) {
    if (row === null && (out.length === 0 || out[out.length - 1] === null)) continue;
    out.push(row);
  }

  while (out.length && out[out.length - 1] === null) out.pop();

  return out;
}

/** O recibo do daily de um servidor, com o que a API devolveu (campos que faltam ficam de fora). */
export function dailySlip(serverName: string, data: Record<string, any>, now: Date = new Date()): Slip {
  const reward: Record<string, unknown> = data?.reward ?? {};

  const base = finite(reward.base);
  const progressive = finite(reward.progressiveBonus);
  const weekly = finite(reward.weeklyBonus);
  const total = finite(reward.total);
  const wallet = finite(data?.wallet);

  const plus = (cents: number): string => `+${formatMoney(cents)}`;

  const rows: SlipRow[] = [];

  if (base !== null && base > 0) rows.push(["Recompensa base", plus(base)]);
  if (progressive !== null && progressive > 0) rows.push(["Bônus de sequência", plus(progressive)]);
  if (weekly !== null && weekly > 0) rows.push(["Bônus de 7 dias", plus(weekly)]);

  rows.push(null);

  if (total !== null) rows.push(["Total", plus(total), "plus"]);
  if (wallet !== null) rows.push(["Carteira", formatMoney(wallet)]);

  const streak = finite(data?.streak);
  const best = finite(data?.bestStreak);
  const remaining = finite(data?.daily?.remaining);

  const foot: string[] = [];

  if (streak !== null) {
    foot.push(`Sequência de ${plural(streak, "dia", "dias")}${best !== null && best > streak ? ` · recorde de ${plural(best, "dia", "dias")}` : ""}`);
  }

  if (remaining !== null && remaining > 0) foot.push(`Próximo resgate neste servidor em ${formatDuration(remaining)}`);

  return {
    stamp: "Resgatado",
    title: `Daily · ${serverName || "servidor"}`,
    when: slipTime(now),
    rows: tidy(rows),
    foot
  };
}

/** O recibo do bônus de gemas. */
export function gemsSlip(data: Record<string, any>, now: Date = new Date()): Slip {
  const amount = finite(data?.amount);
  const balance = finite(data?.balance);
  const remaining = finite(data?.remaining);

  const rows: SlipRow[] = [];

  if (amount !== null) rows.push(["Gemas", `+${amount.toLocaleString("pt-BR")}`, "plus"]);
  if (balance !== null) rows.push(["Saldo", balance.toLocaleString("pt-BR")]);

  return {
    stamp: "Coletado",
    title: "Bônus de gemas",
    when: slipTime(now),
    rows,
    foot: remaining !== null && remaining > 0 ? [`Próxima coleta em ${formatDuration(remaining)}`] : []
  };
}

/** O recibo em frases, para o leitor de tela: o título, cada linha e o rodapé. */
export function slipText(slip: Slip): string {
  const lines = slip.rows.flatMap(row => (row === null ? [] : [`${row[0]} ${row[1]}`]));

  return [slip.title, ...lines, ...slip.foot].map(line => `${line}.`).join(" ");
}

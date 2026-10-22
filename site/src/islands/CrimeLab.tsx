/** Laboratório do crime: sorteia com as regras do bot e mostra, num recibo, quanto sobra depois da lavagem. */
import { useRef, useState } from "preact/hooks";

import { average, rewardScale, rollCrime, totals, type Attempt } from "../lib/crime-math.ts";
import { game } from "../lib/game.ts";
import { moneyWhole, percent } from "../lib/format.ts";

import "./crimelab.css";

const SHOWN = 7;

const signed = (value: number): string => `${value < 0 ? "−" : "+"}${moneyWhole(Math.abs(value))}`;
const decimal = (value: number): string => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function CrimeLab() {
  const [level, setLevel] = useState(1);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [said, setSaid] = useState("");
  const counter = useRef(0);

  const scale = rewardScale(level);
  const avg = average(level);
  const sum = totals(attempts);
  const shown = attempts.slice(-SHOWN);
  const hidden = attempts.length - shown.length;

  function play(times: number) {
    const batch: Attempt[] = [];

    for (let i = 0; i < times; i++) batch.push(rollCrime(++counter.current, level));

    setAttempts(list => [...list, ...batch]);

    const last = batch[batch.length - 1]!;
    setSaid(
      times === 1
        ? last.win
          ? `Crime ${last.n}: deu certo, mais ${moneyWhole(last.amount)} de dinheiro sujo.`
          : `Crime ${last.n}: pego. Multa de ${moneyWhole(last.fine)} e ${game.crime.jailSeconds / 60} minutos de cadeia.`
        : `${times} crimes sorteados. ${batch.filter(a => a.win).length} deram certo.`
    );
  }

  function reset() {
    counter.current = 0;
    setAttempts([]);
    setSaid("Ficha zerada.");
  }

  const profit = sum.clean.private > 0;

  return (
    <div class="lab">
      <div class="lab-controls">
        <div class="lab-level">
          <label for="lab-level">
            Seu nível <output for="lab-level" class="tabular">{level}</output>
          </label>
          <input
            id="lab-level"
            type="range"
            min="1"
            max="100"
            step="1"
            value={level}
            onInput={event => setLevel(Number((event.currentTarget as HTMLInputElement).value))}
            aria-describedby="lab-scale"
          />
          <p id="lab-scale">
            Prêmio e multa ficam ×{decimal(scale)}. A chance de dar certo continua {percent(game.crime.successChance)} em qualquer nível.
          </p>
        </div>

        <div class="lab-actions">
          <button type="button" class="btn btn-primary" onClick={() => play(1)}>Tentar um crime</button>
          <button type="button" class="btn btn-quiet" onClick={() => play(10)}>Tentar 10</button>
          <button type="button" class="lab-reset" onClick={reset} disabled={attempts.length === 0}>Zerar</button>
        </div>
      </div>

      <div class="receipt-wrap">
        <div class="receipt lab-receipt">
          <h3>Ficha do crime</h3>
          <p class="lab-sub">nível {level} · simulação</p>
          <hr class="receipt-rule" />

          {attempts.length === 0 ? (
            <p class="lab-empty">Nenhuma tentativa ainda. Aperte o botão e veja a sorte decidir.</p>
          ) : (
            <ol class="lab-log" aria-label="Últimas tentativas">
              {hidden > 0 && <li class="lab-more">… mais {hidden} antes</li>}
              {shown.map(attempt => (
                <li key={attempt.n} class={attempt.win ? "win" : "bust"}>
                  <div class="leader">
                    <span class="lab-n tabular">#{attempt.n}</span>
                    <span class="lab-what">{attempt.win ? (attempt.jackpot ? "Golpe de mestre" : "Deu certo") : "Pego"}</span>
                    <i />
                    <b class={attempt.win ? "plus" : "minus"}>{attempt.win ? `+${moneyWhole(attempt.amount)}` : `−${moneyWhole(attempt.fine)}`}</b>
                  </div>
                  {!attempt.win && <small>{game.crime.jailSeconds / 60} min de cadeia</small>}
                </li>
              ))}
            </ol>
          )}

          <hr class="receipt-rule" />

          <dl class="lab-sums">
            <div class="row"><dt>Crimes</dt><dd class="tabular">{sum.crimes} ({sum.wins} certos, {sum.busts} pegos)</dd></div>
            <div class="row"><dt>Dinheiro sujo</dt><dd class="tabular plus">+{moneyWhole(sum.dirty)}</dd></div>
            <div class="row"><dt>Multas</dt><dd class="tabular minus">−{moneyWhole(sum.fines)}</dd></div>
            <div class="row"><dt>Na cadeia</dt><dd class="tabular">{sum.jailMinutes} min</dd></div>
            <div class="row after-rule"><dt>Limpo, lavagem pública</dt><dd class={`tabular ${sum.clean.public >= 0 ? "plus" : "minus"}`}>{signed(sum.clean.public)}</dd></div>
            <div class="row"><dt>Limpo, lavagem privada</dt><dd class={`tabular ${sum.clean.private >= 0 ? "plus" : "minus"}`}>{signed(sum.clean.private)}</dd></div>
          </dl>

          {attempts.length > 0 && (
            <p class="lab-verdict">
              <span class={`stamp-mark ${profit ? "ok" : "bad"}`}>{profit ? "No lucro" : "No prejuízo"}</span>
            </p>
          )}
        </div>
      </div>

      <p class="lab-avg">
        <b>A média de muitas tentativas neste nível:</b> {moneyWhole(avg.dirty)} sujos e {moneyWhole(avg.fine)} de multa por crime, mais {decimal(avg.jailMinutes)} min de cadeia.
        Depois de lavar, sobram cerca de <b>{moneyWhole(avg.clean.private)}</b> pela lavagem privada e <b>{moneyWhole(avg.clean.public)}</b> pela pública, sem contar a espera de {game.crime.cooldownSeconds / 3600} h entre crimes.
      </p>
      <p class="lab-note">Nas poucas primeiras tentativas, a sorte manda. A multa de verdade nunca passa do que você tem na carteira; aqui ela é sempre cobrada inteira.</p>

      <p class="sr-only" role="status" aria-live="polite">{said}</p>
    </div>
  );
}

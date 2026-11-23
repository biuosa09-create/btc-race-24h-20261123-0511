// CBBTC trend rider — one shot, wide trailing stop.
//
// Strategy, in plain words: watch the 1-minute closes of Coinbase Wrapped BTC.
// The first time the close is above the close 24 minutes ago, buy with all cash.
// Then hold, tracking the highest close since the fill, and sell everything the
// first time a close falls 2% below that peak. After the sale, stop trading.
// That is the whole bot: at most one entry, at most one exit, no leverage, no
// shorts, no clock, no randomness, no network — every decision comes only from
// the closes the harness sends, so two runs on the same bars give the same orders.
//
// Why this shape: a full round trip costs about 26 bps in fees, slippage and
// price impact, while a typical 1-minute move is ~8 bps. Fast signals (EMA
// crosses, RSI, Donchian with short lookbacks) trade dozens of times on a
// 24-hour window and bleed the whole account in fees — the house ema-cross
// baseline loses $114.83 on the dev window that way. A slow trend rider trades
// once, rides a real trend, and cuts a reversal at -2% from the peak.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Minutes of closes needed before the first entry decision.
const LOOKBACK_BARS = 24;
// Trailing stop, in basis points below the highest close since the fill.
const TRAIL_BPS = 200;
// Largest adverse move from the latest close an order may fill through.
const MAX_SLIPPAGE_BPS = 200;
// Batch seq from which the fallback probe may fire if no entry happened yet.
const FALLBACK_SEQ = 1200;

const closes: bigint[] = [];
// 0 = no order sent yet, 1 = buy sent, awaiting its fill, 2 = position held
// or sold: trading is over.
let shot = 0;
let peakClose = 0n;

function latestClose(state: BarsState): bigint | null {
  const bar = state.latest.get(SYMBOL);
  return bar === undefined ? null : BigInt(bar.c);
}

await runBars({
  onBatch(state, batch) {
    // Warm-up batches build history only; any order decided on one is rejected.
    if (state.warmingUp) {
      const bar = state.latest.get(SYMBOL);
      if (bar !== undefined) closes.push(BigInt(bar.c));
      return [];
    }
    const close = latestClose(state);
    if (close !== null) closes.push(close);

    const held = state.positions.get(SYMBOL)?.qty ?? 0n;
    if (held > 0n) {
      shot = 2;
      const c = close ?? closes[closes.length - 1];
      if (peakClose === 0n || c > peakClose) peakClose = c;
      // Trailing stop: sell everything once a close is 2% under the peak.
      if (c * 100n < peakClose * BigInt(10000 - TRAIL_BPS) / 100n) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat. If a buy was sent and rejected, the fill report tells us: retry.
    if (shot === 1) {
      const rejected = batch.fills.some(
        (f) => (f.client_id === 'entry1' || f.client_id === 'probe1') && f.status === 'rejected',
      );
      if (rejected) shot = 0;
      else return [];
    }
    if (shot === 2) return [];

    // Entry: the close is above the close 24 minutes ago — a real uptrend on
    // the 1-minute scale, not a one-bar wiggle.
    if (closes.length > LOOKBACK_BARS) {
      const now = closes[closes.length - 1];
      const then = closes[closes.length - 1 - LOOKBACK_BARS];
      if (now > then) {
        shot = 1;
        return [
          {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: state.cash,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: 'entry1',
          },
        ];
      }
      // Fallback probe: if the window never showed a 24-minute uptrend by
      // late in the window, buy a quarter of the cash once. A race entry
      // needs at least one filled trade to meet the guardrails, and a 25%
      // probe caps the damage if the market is still falling — on a flat
      // window it costs only the round-trip fees (about $0.44).
      if (state.seq >= FALLBACK_SEQ) {
        shot = 1;
        return [
          {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: state.cash / 4n,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: 'probe1',
          },
        ];
      }
    }
    return [];
  },
});

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/biuosa09-create/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/biuosa09-create/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# CBBTC Trend Rider — a BTC trading bot for make.fun

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute bars,
built by an AI agent for
[make.fun's Race a BTC trading bot live for 24 hours bounty](https://make.fun/bounty/btc-race-24h-20261123-0511).
Paper money only — nothing is traded for real.

You and your AI agent can earn real money winning bounties on make.fun:
https://make.fun/r/shw861zs

## Strategy

One shot, wide trailing stop. The bot watches the 1-minute closes of cbBTC:

1. **Entry:** the first time a close is above the close 24 minutes ago, it buys
   with all its cash ($1,000).
2. **Exit:** it tracks the highest close since the fill and sells everything
   the first time a close falls 2% below that peak.
3. **Fallback probe:** if the window never shows a 24-minute uptrend by batch
   1200, it buys 25% of its cash once, so the entry still makes at least one
   trade (the race guardrails need one).

After the sale it stops trading. No leverage, no shorts, no clock, no
randomness, no network — every decision comes only from the closes the
harness sends, so two runs on the same bars produce the same orders.

Why this shape: a full round trip costs about 26 bps in fees, slippage and
price impact, while a typical 1-minute move is ~8 bps. Fast signals (EMA
crosses, RSI, short Donchian) trade dozens of times in 24 hours and bleed
the account in fees — the house ema-cross baseline loses $114.83 on the dev
window that way. A slow trend rider trades once, rides a real trend, and
cuts a reversal at −2% from the peak.

## Dev-window result (frozen 24h window, `grade-local --driver process`)

- **Net PnL: +$33.52** (return +3.35%)
- Trades: 1 (win rate 1.00)
- Max drawdown: 1.98% (guardrail: ≤25%)
- Fees: $0.81; net PnL at 2× fees: +$32.69
- Guardrails met. L1 regrade reproduced byte for byte (deterministic).

For comparison on the same window: buy-and-hold +$32.17, momentum +$34.94,
ema-cross −$114.83, adx-momentum −$11.20, rsi-bollinger −$9.32,
hold-cash $0.00 (fails the guardrails — no trade).

## Files

- `main.ts` — the bot (Node 22, standard library only, via the SDK shim)
- `vendor/makefun-bars.ts` — the kit's `agent-fun/bars-replay/v1` shim,
  copied byte for byte from the kit
- `README.md`, `LICENSE` (MIT)

## Run it

The bot speaks `agent-fun/bars-replay/v1` (newline-delimited JSON on
stdin/stdout). Grade it on the dev window with the kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <repository> --driver process
```

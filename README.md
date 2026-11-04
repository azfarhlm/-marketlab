# MarketLab — Multiplayer classroom prototype

A real-time classroom market with instructor setup, private student valuations/costs, public bid/ask order book, live trading, a timer, instructor-only market analytics, and CSV export.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

For students on other devices, deploy this Node.js server to a host supporting persistent WebSockets (e.g., Render, Railway, or Fly.io). Give students its public HTTPS URL. A localhost URL only works on the instructor's own computer.

## Instructor workflow

Create a market (defaults: 20 buyers, 20 sellers, 15 minutes). Share the 6-character code. The first 20 students to join are assigned seller IDs S1–S20; the next 20 receive buyer IDs B1–B20. Start the market, monitor prices and trades, then export CSV.

## Student workflow

Open the same website, enter the code. The server automatically assigns an available ID and role. See a private willingness-to-pay or cost. Submit bids/asks, accept public orders, or withdraw your own order. Each student may trade one unit per round.

## Important prototype limitations

- State is in memory: server restart deletes rooms and trades.
- Roles and IDs are automatically assigned in arrival order; no student login is required. The browser keeps a secret reconnect token for refreshes within the same tab. Clearing session storage or using another device may claim a new slot. Use only for supervised experiments, not high-stakes assessment.
- Student reconnect tokens are kept in browser session storage, allowing a refresh in the same tab. Instructor tokens remain in memory, so avoid refreshing the instructor tab.
- The market is a posted public double auction rather than private bilateral chat negotiation. Participants negotiate by revising posted bids/asks and accepting offers.
- This is one market per room, not yet a controlled multi-round experiment with reset-and-preserve valuations.
- The benchmark reports efficient quantity and maximal gains from trade. The displayed price interval is a simple marginal-pair indicator, not an exact full competitive price interval.
- No database, authentication, moderation, or automatic room cleanup yet. Use a single server instance.
- Instructors should not project the private-assignment table during trading.

## Economics

Buyers' valuations and sellers' costs are private. A transaction is permitted only when the buyer's value is at least the agreed price and the seller's cost is no more than that price. Realized gains from trade are the sum of buyer and seller surplus. Efficiency is realized gains divided by maximum feasible gains from trade (sorting valuations descending and costs ascending).

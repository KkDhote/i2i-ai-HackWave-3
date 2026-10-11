# Intent-to-Interface (MERN starter)

User likhta hai goal -> server layout plan banata hai (rules ya Claude) -> React us plan ko components mein render karta hai.

## Run
```bash
# 1) server
cd server && cp .env.example .env && npm install
npm run seed      # optional: MongoDB mein data daalta hai (bina Mongo ke bhi chalta hai)
npm run dev       # http://localhost:5000

# 2) client (naya terminal)
cd client && npm install && npm run dev   # http://localhost:5173
```
- MongoDB na ho to server seed data file se chalta hai (demo kabhi nahi tootega).
- `.env` mein `ANTHROPIC_API_KEY` daaloge to AI layout choose karega; fail ho to rules fallback.

## Structure
- `server/catalog.js` : 16 components ki catalog + 4 curated layouts (naya task = yahan JSON add karo)
- `server/intent.js`  : keyword intent + clarify logic
- `server/llm.js`     : AI planner (JSON only) ; `server/plan.js` : validation
- `client/src/registry.jsx` : sirf 6 generic components (StatCards, LineChart, BarList, ItemList, DataTable, ActionBar)
- `client/src/App.jsx` : state, New/Updated/Unchanged detection, "Why this?", change log

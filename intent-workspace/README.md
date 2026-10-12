# I2I By AI workspace

The frontend and backend live here:

- `client/`: React + Vite frontend.
- `server/`: Express API, MongoDB records, AI interpretation, reminder worker, and Google Calendar integration.

Use the repository's [main README](../README.md) for the current setup commands, configuration, features, API overview, and limitations.

Feature guides:

- [Reliability and record-based answers](RELIABILITY.md)
- [Notifications and Resend email reminders](NOTIFICATIONS.md)
- [Google Calendar, Meet, and places](CALENDAR.md)

Run npm commands from `client` or `server`, not this directory. The default backend port is **5001**, and the frontend runs on **5173** with a Vite `/api` proxy. Current AI flows use `NVIDIA_API_KEY`; database configuration uses `MONGO_URI`.

For a fresh disposable database, the demo seed command from `server/` is `node data/seedReal.js`. It replaces the listed `iw_*` data collections, including tasks and clients; read the main setup guide before running it. `npm run seed:real` is not currently defined.

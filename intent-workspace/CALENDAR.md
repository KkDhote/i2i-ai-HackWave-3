# Google Calendar, Meet and places

The Calendar, meetings & places card is scoped to the selected client. Existing task deadlines appear automatically in the local agenda, with high-priority unfinished work marked urgent. Add a dated entry for a meeting, urgent work, a completion date, a reminder or another deadline. Times use Asia/Kolkata. A date without a time is an all-day entry; a timed entry defaults to one hour if its end time is omitted. A supplied end time must be later on the same date.

Completion dates are not guessed from task deadlines. A Work completed entry records the supplied completion date without changing a task's status. Existing tasks with a recorded completedAt also appear on that date.

Places entered in Add task or calendar entries open a Google Maps search at the supplied address. Check that the search resolves to the intended place; vague addresses can return several results. No paid Maps API or geocoding key is needed. This is a link to Google's map, not a built-in map or a verified coordinate.

## Private backend settings

Enable the Google Calendar API in your Google Cloud project. Configure OAuth consent and a Web application OAuth client. While the consent screen is in testing, add your Google account as a test user. Register this exact authorized redirect URI:

`http://127.0.0.1:5173/api/calendar/oauth/callback`

Add these to server/.env privately:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-web-client-secret
GOOGLE_CALENDAR_REDIRECT_URI=http://127.0.0.1:5173/api/calendar/oauth/callback
GOOGLE_CALENDAR_APP_URL=http://127.0.0.1:5173/
GOOGLE_CALENDAR_TOKEN_KEY=your-random-32-byte-base64-key
```

Generate the encryption key in the server folder with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep credentials and the encryption key out of Git. Keep the same encryption key across restarts or reconnect Google. OAuth tokens are encrypted before storage in MongoDB and never returned to the browser. Restart the backend after configuration.

Open the workspace at http://127.0.0.1:5173/ and select Connect Google Calendar. Complete Google's consent yourself. The permission is calendar.app.created: the app creates a separate I2I By AI calendar, rather than requesting access to all personal calendars. A single Google connection is shared by this local demo's clients. Integration routes are restricted to loopback requests; this is not a multi-user, production authentication system.

## Sync and meetings

Saving an entry stores it locally. Select its Sync to Google button to copy its title, details, date/time and location to the connected calendar. Sync is manual and one-way. Later changes require Update / check Google; changes made in Google do not update workspace tasks. Stable event IDs avoid duplicate entries on retries. Entries deleted in Google are not silently recreated. Disconnect removes local tokens but retains Google events; remove account permission in Google Account settings if desired.

For a meeting, enter its start time and check Create a Google Meet link when synced. Each meeting requests its own conference. Google may return a pending result; select Update / check Google later to retrieve the link. Join Google Meet appears only after Google returns a valid link. Calendar sync may succeed while Meet creation fails if the account/calendar does not support conferencing. No Meet links are invented, no guests are invited and no attendee email addresses are sent. You can share the generated link yourself.

Calendar popup reminders: meetings 30 minutes before; unfinished deadlines/reminders three days and one day before; completion entries none. Resend customer emails remain a separate feature with their own setup and delivery switch.

If a Google request times out, check Google Calendar before retrying. A connection interrupted during calendar creation may leave an extra calendar, which can be reviewed in Google. In OAuth testing, refresh tokens can expire and require reconnection.

References: [Google OAuth web flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Calendar events and Meet](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

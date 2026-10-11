# I2I By AI notifications

The Notifications card shows task reminders three days and one day before a due date, due-today and overdue alerts, blockers, missing due dates, and active goal risks. Dates use Asia/Kolkata. Completed tasks do not generate alerts. App alerts refresh every minute. Read status is stored in the current browser.

Click **Enable desktop alerts** and allow browser notifications. Keep the app open for desktop alerts. These alerts use a summary rather than exposing task details on the desktop.

## Customer reminders

Open **Customer reminders**, choose a task, enter the customer's email, choose Email, review the message, and save. Contacts are stored locally in MongoDB. No demo customer contacts are created.

Customer delivery uses Resend for email. Configure these values privately in `server/.env`:

```dotenv
NOTIFICATION_DELIVERY_ENABLED=false
RESEND_API_KEY=
NOTIFICATION_EMAIL_FROM=
```

Use a verified email sender for Resend. Do not put credentials in chat, client code, or Git. Previously saved phone channels are ignored; email selections are retained.

Finish provider configuration, save a task's customer reminder settings, then set `NOTIFICATION_DELIVERY_ENABLED=true` and restart the backend. Keep the backend and MongoDB running. The browser may be closed for customer reminders. The worker checks every minute and sends reminders on the three-day and one-day dates, the due date, and once if overdue. It does not send internal blocker reasons or goal alerts to customers.

The three-day reminder is not sent late if the backend was offline on that day. Each stage is recorded separately to prevent repeated sends after a restart. Provider acceptance is shown as **accepted**, which does not prove delivery to the recipient. Failed or uncertain attempts remain visible for review and are not automatically retried, to avoid duplicate messages.

Provider instructions: [Resend send email](https://resend.com/docs/api-reference/emails/send-email).

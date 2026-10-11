const channels = ['email', 'sms', 'whatsapp'];

const value = (env, key) => typeof env[key] === 'string' ? env[key].trim() : '';
const emailAddress = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export function reminderChannels(env = process.env) {
  const sender = value(env, 'NOTIFICATION_EMAIL_FROM');
  const senderEmail = sender.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] ?? sender;
  const checks = {
    RESEND_API_KEY: !!value(env, 'RESEND_API_KEY') && !/[\r\n]/.test(value(env, 'RESEND_API_KEY')),
    NOTIFICATION_EMAIL_FROM: emailAddress(senderEmail),
    TWILIO_ACCOUNT_SID: /^AC[0-9a-fA-F]{32}$/.test(value(env, 'TWILIO_ACCOUNT_SID')),
    TWILIO_API_KEY_SID: /^SK[0-9a-fA-F]{32}$/.test(value(env, 'TWILIO_API_KEY_SID')),
    TWILIO_API_KEY_SECRET: !!value(env, 'TWILIO_API_KEY_SECRET'),
    TWILIO_SMS_FROM: /^\+[1-9]\d{7,14}$/.test(value(env, 'TWILIO_SMS_FROM')),
    TWILIO_WHATSAPP_FROM: /^whatsapp:\+[1-9]\d{7,14}$/.test(value(env, 'TWILIO_WHATSAPP_FROM')),
    TWILIO_WHATSAPP_CONTENT_SID: /^HX[0-9a-fA-F]{32}$/.test(value(env, 'TWILIO_WHATSAPP_CONTENT_SID'))
  };
  const twilio = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET'];
  const required = { email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'], sms: [...twilio, 'TWILIO_SMS_FROM'], whatsapp: [...twilio, 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_CONTENT_SID'] };
  return Object.fromEntries(channels.map(channel => {
    const missing = required[channel].filter(key => !checks[key]);
    return [channel, { configured: !missing.length, provider: channel === 'email' ? 'Resend' : 'Twilio', missing }];
  }));
}

export function parseCustomerReminder(body) {
  if (!body || Array.isArray(body) || typeof body.enabled !== 'boolean' || !Array.isArray(body.channels)) return null;
  if (body.channels.some(channel => !channels.includes(channel)) || new Set(body.channels).size !== body.channels.length) return null;
  const { customerName = '', email = '', phone = '' } = body;
  if (typeof customerName !== 'string' || typeof email !== 'string' || typeof phone !== 'string') return null;
  if (customerName.length > 100 || email.length > 254 || phone.length > 16) return null;
  const contact = { customerName: customerName.trim(), email: email.trim(), phone: phone.trim() };
  if (contact.email && !emailAddress(contact.email)) return null;
  if (contact.phone && !/^\+[1-9]\d{7,14}$/.test(contact.phone)) return null;
  if (body.enabled && (!body.channels.length || (body.channels.includes('email') && !contact.email) || (body.channels.some(channel => channel !== 'email') && !contact.phone))) return null;
  return { ...contact, channels: [...body.channels], enabled: body.enabled };
}

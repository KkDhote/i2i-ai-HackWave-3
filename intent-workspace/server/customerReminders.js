const channels = ['email'];

const value = (env, key) => typeof env[key] === 'string' ? env[key].trim() : '';
const emailAddress = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export function reminderChannels(env = process.env) {
  const sender = value(env, 'NOTIFICATION_EMAIL_FROM');
  const senderEmail = sender.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] ?? sender;
  const checks = {
    RESEND_API_KEY: !!value(env, 'RESEND_API_KEY') && !/[\r\n]/.test(value(env, 'RESEND_API_KEY')),
    NOTIFICATION_EMAIL_FROM: emailAddress(senderEmail),
  };
  const required = { email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'] };
  return Object.fromEntries(channels.map(channel => {
    const missing = required[channel].filter(key => !checks[key]);
    return [channel, { configured: !missing.length, provider: 'Resend', missing }];
  }));
}

export function parseCustomerReminder(body) {
  if (!body || Array.isArray(body) || typeof body.enabled !== 'boolean' || !Array.isArray(body.channels)) return null;
  if (body.channels.some(channel => !channels.includes(channel)) || new Set(body.channels).size !== body.channels.length) return null;
  const { customerName = '', email = '' } = body;
  if (typeof customerName !== 'string' || typeof email !== 'string') return null;
  if (customerName.length > 100 || email.length > 254) return null;
  const contact = { customerName: customerName.trim(), email: email.trim() };
  if (contact.email && !emailAddress(contact.email)) return null;
  if (body.enabled && (!body.channels.length || (body.channels.includes('email') && !contact.email))) return null;
  return { ...contact, channels: [...body.channels], enabled: body.enabled };
}

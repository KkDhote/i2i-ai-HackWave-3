import assert from 'node:assert/strict';
import { parseCustomerReminder, reminderChannels } from './customerReminders.js';

const valid = { customerName: ' Neha Sharma ', email: ' neha@example.in ', phone: ' +919876543210 ', channels: ['email', 'sms', 'whatsapp'], enabled: true };
assert.deepEqual(parseCustomerReminder(valid), { customerName: 'Neha Sharma', email: 'neha@example.in', phone: '+919876543210', channels: valid.channels, enabled: true });
assert.deepEqual(parseCustomerReminder({ enabled: false, channels: [] }), { customerName: '', email: '', phone: '', channels: [], enabled: false });
assert.ok(parseCustomerReminder({ enabled: true, channels: ['email'], email: 'neha@example.in' }));
assert.ok(parseCustomerReminder({ enabled: true, channels: ['sms', 'whatsapp'], phone: '+919876543210' }));

for (const invalid of [null, [], {}, { ...valid, enabled: 'true' }, { ...valid, channels: 'email' }, { ...valid, channels: ['email', 'email'] }, { ...valid, channels: ['telegram'] }, { ...valid, channels: [] }, { ...valid, customerName: {} }, { ...valid, customerName: 'x'.repeat(101) }, { ...valid, email: 5 }, { ...valid, email: 'neha@example' }, { ...valid, email: 'neha@@example.in' }, { ...valid, email: '' }, { ...valid, phone: 919876543210 }, { ...valid, phone: '9876543210' }, { ...valid, phone: '+019876543210' }, { ...valid, phone: '+919876 543210' }, { ...valid, phone: '+1234567890123456' }, { ...valid, phone: '' }]) assert.equal(parseCustomerReminder(invalid), null);
assert.equal(parseCustomerReminder({ enabled: false, channels: [], email: 'invalid' }), null);
assert.equal(parseCustomerReminder({ ...valid, email: 'neha<>@example.in' }), null);
assert.equal(parseCustomerReminder({ enabled: false, channels: [], phone: 'invalid' }), null);
assert.ok(Object.values(reminderChannels({})).every(channel => channel.configured === false && channel.missing.length > 0));
console.log('Customer reminder contact validation checks passed.');

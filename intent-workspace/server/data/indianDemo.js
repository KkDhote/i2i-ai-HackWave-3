// Fictional Indian demo businesses and people; identifiers stay stable.
const replacements = {
  'Northwind Logistics': 'Bharat Logistics', 'Bluepeak Foods': 'Annapurna Foods', 'Kestrel Health': 'Aarogya Healthcare',
  'Harborline Retail Group': 'Utsav Retail', 'Quantix Labs': 'Pragati Tech Labs', 'Meridian Bank': 'Narmada Finance',
  'Solstice Energy': 'Surya Energy', 'Tandem Education': 'Vidya Education',
  Northwind: 'Bharat', Bluepeak: 'Annapurna', Kestrel: 'Aarogya', Harborline: 'Utsav', Quantix: 'Pragati', Meridian: 'Narmada', Solstice: 'Surya', Tandem: 'Vidya',
  'Marcus Webb': 'Vikram Sharma', 'Elena Petrova': 'Neha Deshmukh', 'Sofia Alvarez': 'Kavya Iyer', 'Tom Becker': 'Rohan Gupta',
  'Luis Ferreira': 'Arjun Menon', 'Jonas Lindqvist': 'Sanjay Kulkarni', 'Ben Okafor': 'Aditya Verma', 'Grace Holloway': 'Sneha Joshi',
  'Camila Ortiz': 'Pooja Patel', 'Hiro Tanaka': 'Nikhil Reddy', 'Maya Chen': 'Divya Nair', 'Dan Ortiz': 'Deepak Singh',
  Marcus: 'Vikram', Elena: 'Neha', Sofia: 'Kavya', Tom: 'Rohan', Luis: 'Arjun', Jonas: 'Sanjay', Ben: 'Aditya', Grace: 'Sneha', Camila: 'Pooja', Hiro: 'Nikhil', Maya: 'Divya',
  Mei: 'Meera', Sam: 'Sameer',
  'Migrate billing webhooks': 'Integrate UPI payment webhooks', 'Billing webhooks waiting on partner API keys': 'UPI payment integration waiting on payment gateway API keys',
  'Vendor security review': 'Verify supplier onboarding documents', 'Security review waiting on pen-test report': 'Supplier verification waiting on GST and bank documents',
  'Update onboarding docs': 'Update Hindi and English onboarding guides', 'QA sign-off: mobile': 'Test mobile checkout for UPI payments',
  'Archive Q2 reports': 'Reconcile quarterly GST invoices', 'Prepare QBR deck for Meridian': 'Prepare quarterly review for Narmada Finance',
  'Load test for Black Friday': 'Load test for Diwali festive sale', 'Onboard Tandem Education': 'Onboard Vidya Education centres',
  'Q2 invoice audit': 'Audit quarterly GST invoices', 'Automate invoice reminders': 'Automate GST invoice payment reminders',
  'Customer survey analysis': 'Analyse customer feedback from Pune and Bengaluru', 'Translate help center articles': 'Translate help articles into Hindi and Marathi',
  'Review vendor contracts': 'Review Indian supplier contracts', 'Black Friday': 'Diwali festive sale', 'holiday-season': 'Diwali-season',
  'Design data residency options': 'Plan India-region data hosting', 'Create partner API guide': 'Create UPI payment partner API guide',
  'Review pricing tiers': 'Review rupee pricing for Indian SMEs', 'Customer advisory board agenda': 'Prepare Bengaluru customer advisory agenda',
  'Prepare hiring plan for support': 'Prepare Hindi and Marathi support hiring plan', 'Improve onboarding checklist': 'Improve Indian branch onboarding checklist',
  'Redesign billing page': 'Add GST details to the billing page', 'Document support escalation path': 'Document India support escalation contacts',
  'Plan Q1 roadmap workshop': 'Plan Pune product roadmap workshop',
  'SOC 2 report': 'security audit report', 'SOC 2 evidence': 'security audit evidence', 'Plant maintenance week in the north region': 'Maintenance week at the Gujarat plant',
  'Q4 capacity plan': 'Diwali delivery capacity plan', 'Q3 delivery metrics': 'Mumbai and Pune delivery metrics', 'two more depots': 'Pune and Jaipur depots',
  'two more warehouses': 'warehouses in Chennai and Hyderabad', 'two new regions': 'Maharashtra and Karnataka', 'new semester': 'new academic term'
};
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp('\\b(' + Object.keys(replacements).sort((a, b) => b.length - a.length).map(escape).join('|') + ')\\b', 'g');
export function localizeDemo(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return value.replace(pattern, text => replacements[text]).replace(/\$(\d[\d.,]*)k ARR/g, '₹$1 lakh annual revenue');
  if (Array.isArray(value)) return value.map(localizeDemo);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['id', 'clientId', 'aliases', 'taskKey', 'taskKeys'].includes(key) ? item : localizeDemo(item)]));
  if (value.id && value.name && Array.isArray(value.aliases)) {
    result.aliases = [...new Set([...value.aliases, result.name.toLowerCase(), result.name.split(' ')[0].toLowerCase()])];
    result.currency = 'INR'; result.arrUnit = 'lakh';
  }
  return result;
}

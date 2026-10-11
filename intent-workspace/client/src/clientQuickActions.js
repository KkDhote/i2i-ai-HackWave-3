const MODES = ['meeting', 'issues', 'followups', 'updates', 'usage', 'overdue'];
const OVERDUE = 'Review overdue workspace work';
const MESSAGES = 'Read recent client messages';
const LABELS = {
  northwind: ['Prepare delivery capacity meeting', 'Review shipment sync issues', 'Follow up on depot rollout', MESSAGES, 'Review logistics platform usage', OVERDUE],
  bluepeak: ['Prepare warehouse expansion meeting', 'Review Monday report issues', 'Follow up on seat pricing', MESSAGES, 'Review inventory platform usage', OVERDUE],
  kestrel: ['Prepare stability review meeting', 'Review scheduling outages', 'Follow up on security audit', MESSAGES, 'Investigate healthcare platform usage', OVERDUE],
  harborline: ['Prepare Diwali readiness meeting', 'Review checkout analytics issues', 'Follow up on peak support plans', MESSAGES, 'Review retail platform usage', OVERDUE],
  quantix: ['Prepare growth-plan discussion', 'Review webhook retry issues', 'Follow up on API limits', MESSAGES, 'Review product usage trends', OVERDUE],
  meridian: ['Prepare planning meeting', 'Review audit export issues', 'Follow up on India data hosting', MESSAGES, 'Review finance platform usage', OVERDUE],
  solstice: ['Prepare plant operations meeting', 'Review sensor ingestion issues', 'Follow up on renewal discussion', MESSAGES, 'Investigate plant dashboard usage', OVERDUE],
  tandem: ['Prepare academic-term meeting', 'Review instructor app feedback', 'Follow up on parent reports', MESSAGES, 'Review education platform usage', OVERDUE],
  default: ['Prepare a client meeting', 'Review open client issues', 'Follow up on meeting commitments', MESSAGES, 'Review client usage trends', OVERDUE]
};

export const quickActionsFor = clientId => (LABELS[clientId] || LABELS.default).map((label, i) => ({ label, pick: MODES[i] }));

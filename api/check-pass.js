import { configured, unsign } from '../lib/payment.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!configured()) return res.status(500).json({ error: 'Payments are not configured on the server.' });
  const p = unsign((req.body || {}).token);
  res.status(200).json({ valid: !!(p && p.runs === 10) });
}

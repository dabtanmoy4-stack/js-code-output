import crypto from 'crypto';
import { KEY_SECRET, auth, configured, sign } from '../lib/payment.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!configured()) return res.status(500).json({ error: 'Payments are not configured on the server.' });

  const b = req.body || {};
  const oid = b.razorpay_order_id, pid = b.razorpay_payment_id, sig = b.razorpay_signature;
  if (!oid || !pid || !sig) return res.status(400).json({ error: 'Missing payment details' });

  // 1) Razorpay signature proves this payment really happened
  const expected = crypto.createHmac('sha256', KEY_SECRET()).update(oid + '|' + pid).digest('hex');
  const x = Buffer.from(String(sig)), y = Buffer.from(expected);
  if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return res.status(400).json({ error: 'Invalid payment signature' });

  // 2) The order must be one of ours (created by create-order for this product)
  try {
    const r = await fetch('https://api.razorpay.com/v1/orders/' + encodeURIComponent(oid), { headers: { Authorization: auth() } });
    const o = await r.json();
    if (!r.ok || !o.notes || o.notes.product !== 'py_runner_boost') return res.status(400).json({ error: 'Unknown order' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not confirm the order with Razorpay.' });
  }

  res.status(200).json({ token: sign({ pid, oid, runs: 10, iat: Date.now() }) });
}

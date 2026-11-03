const { PRICES, KEY_ID, auth, configured } = require('../lib/payment');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!configured()) return res.status(500).json({ error: 'Payments are not configured on the server.' });

  const currency = String((req.body || {}).currency || 'USD').toUpperCase();
  const amount = PRICES[currency];                    // amount always comes from the server
  if (!amount) return res.status(400).json({ error: 'Unsupported currency' });

  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount, currency,
        receipt: 'pyb_' + Date.now(),
        notes: { product: 'py_runner_boost', runs: '10' }
      })
    });
    const o = await r.json();
    if (!r.ok) return res.status(502).json({ error: (o.error && o.error.description) || 'Razorpay rejected the order.' });
    res.status(200).json({ id: o.id, amount: o.amount, currency: o.currency, key: KEY_ID() });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach Razorpay.' });
  }
};

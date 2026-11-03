import crypto from 'crypto';

// Real charge per 10-run pass, in the currency's smallest unit (INR 300 = Rs 3.00).
// Check Razorpay's minimum order amount for each currency in your Dashboard.
export const PRICES = { INR: 300, USD: 50, EUR: 50, GBP: 40, AED: 200, CAD: 70, AUD: 80 };

export const KEY_ID = () => process.env.RAZORPAY_KEY_ID;
export const KEY_SECRET = () => process.env.RAZORPAY_KEY_SECRET;
export const auth = () => 'Basic ' + Buffer.from(KEY_ID() + ':' + KEY_SECRET()).toString('base64');
export const configured = () => !!(KEY_ID() && KEY_SECRET());

const mac = (body) => crypto.createHmac('sha256', KEY_SECRET() + ':pass').update(body).digest('base64url');

// Pass token = signed payload; only this server can create a valid one.
export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + mac(body);
}
export function unsign(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

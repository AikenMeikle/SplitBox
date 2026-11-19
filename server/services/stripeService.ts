import crypto from 'node:crypto';
import { HttpError } from '../db.ts';
import type { ValidatedLineItem } from './poolAllocator.ts';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim().length > 0);
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new HttpError(500, 'STRIPE_SECRET_KEY is not configured.');
  }
  return key;
}

/**
 * Creates a real Stripe Checkout Session using Node's native `fetch` (zero SDK bloat).
 * Supports GBP cards + Apple Pay + Google Pay automatically via Stripe Checkout.
 */
export async function createStripeCheckoutSession(params: {
  orderId: string;
  userEmail: string;
  lineItems: ValidatedLineItem[];
  feePence: number;
  baseUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams();

  body.set('mode', 'payment');
  body.set('customer_email', params.userEmail);
  body.set('client_reference_id', params.orderId);
  body.set('metadata[order_id]', params.orderId);
  body.set('payment_method_types[0]', 'card');
  body.set(
    'success_url',
    `${params.baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  );
  body.set('cancel_url', `${params.baseUrl}/?checkout=cancelled`);

  let idx = 0;
  for (const item of params.lineItems) {
    body.set(`line_items[${idx}][price_data][currency]`, 'gbp');
    body.set(`line_items[${idx}][price_data][unit_amount]`, String(item.sharePricePence));
    body.set(`line_items[${idx}][price_data][product_data][name]`, item.productName);
    body.set(
      `line_items[${idx}][price_data][product_data][description]`,
      `Bulk case share · ${item.unitDescription}`
    );
    body.set(`line_items[${idx}][quantity]`, String(item.quantity));
    idx++;
  }

  if (params.feePence > 0) {
    body.set(`line_items[${idx}][price_data][currency]`, 'gbp');
    body.set(`line_items[${idx}][price_data][unit_amount]`, String(params.feePence));
    body.set(
      `line_items[${idx}][price_data][product_data][name]`,
      'Small-Order Campus Hub Fee'
    );
    body.set(`line_items[${idx}][quantity]`, '1');
  }

  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (
    !res.ok ||
    typeof data.id !== 'string' ||
    typeof data.url !== 'string' ||
    !data.url.startsWith('https://checkout.stripe.com/')
  ) {
    const errObj = data.error as Record<string, unknown> | undefined;
    throw new HttpError(
      502,
      `Stripe Checkout error: ${String(errObj?.message || 'Unable to create session')}`
    );
  }

  return { sessionId: data.id, url: data.url };
}

/** Retrieves a Stripe Checkout Session to confirm payment status on return redirect. */
export async function retrieveStripeCheckoutSession(sessionId: string): Promise<{
  paid: boolean;
  orderId: string | null;
  paymentIntentId: string | null;
}> {
  const secretKey = getStripeSecretKey();
  const res = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    }
  );

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new HttpError(400, 'Could not verify Stripe Checkout session.');
  }

  const metadata = (data.metadata as Record<string, unknown> | undefined) ?? {};
  const orderId =
    (typeof metadata.order_id === 'string' && metadata.order_id) ||
    (typeof data.client_reference_id === 'string' ? data.client_reference_id : null);

  const paymentIntentId =
    typeof data.payment_intent === 'string'
      ? data.payment_intent
      : typeof (data.payment_intent as Record<string, unknown> | undefined)?.id === 'string'
        ? String((data.payment_intent as Record<string, unknown>).id)
        : null;

  return {
    paid: data.payment_status === 'paid',
    orderId,
    paymentIntentId,
  };
}

/** Issues an automatic partial or full GBP refund on Stripe when unfilled slots settle. */
export async function issueStripeRefund(
  paymentIntentId: string,
  amountPence: number,
  orderId: string
): Promise<void> {
  if (!isStripeConfigured() || amountPence <= 0) return;

  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams();
  body.set('payment_intent', paymentIntentId);
  body.set('amount', String(amountPence));
  body.set('reason', 'requested_by_customer');
  body.set('metadata[order_id]', orderId);

  const res = await fetch(`${STRIPE_API_BASE}/refunds`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `divly-refund-${orderId}-${amountPence}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Divly Stripe] Refund warning for ${orderId}:`, errText);
  }
}

/**
 * Verifies Stripe's `Stripe-Signature` header (`t=...,v1=...`) against the raw
 * request body using HMAC-SHA256 + `crypto.timingSafeEqual`.
 */
export function verifyStripeWebhookEvent(
  rawBody: Buffer,
  signatureHeader: string | undefined
): Record<string, unknown> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new HttpError(400, 'STRIPE_WEBHOOK_SECRET is not configured.');
  }
  if (!signatureHeader) {
    throw new HttpError(400, 'Missing Stripe-Signature header.');
  }

  const pieces = signatureHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const piece of pieces) {
    const [k, v] = piece.split('=');
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) {
    throw new HttpError(400, 'Malformed Stripe-Signature header.');
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new HttpError(400, 'Stripe webhook timestamp outside 5-minute tolerance.');
  }

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expectedHex = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  const matched = signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const buf = Buffer.from(sig.toLowerCase(), 'hex');
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });

  if (!matched) {
    throw new HttpError(400, 'Invalid Stripe webhook signature.');
  }

  return JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
}

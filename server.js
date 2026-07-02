// ──────────────────────────────────────────────────────────────
// Pruma Farms — Pi Network Payment Server
// Backend: Node.js + Express
// ──────────────────────────────────────────────────────────────

const express = require('express');
const https = require('https');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PI_API_KEY = process.env.PI_API_KEY;
const PI_WALLET_SEED = process.env.PI_WALLET_SEED;
const PORT = process.env.PORT || 3000;

// ──── Pi Payment Helpers ────────────────────────────────────
/**
 * Verify Pi payment on backend.
 * Call this AFTER the user completes payment on frontend.
 */
async function verifyPiPayment(paymentId, txid) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minepi.com',
      path: `/v2/payments/${paymentId}`,
      method: 'GET',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.payment && parsed.payment.status === 'COMPLETED') {
            resolve({ success: true, payment: parsed.payment });
          } else {
            reject({ error: 'Payment not completed', details: parsed });
          }
        } catch (e) {
          reject({ error: 'Failed to parse Pi response', details: e.message });
        }
      });
    }).on('error', reject).end();
  });
}

/**
 * Create a Pi payment request.
 * Called from frontend before user confirms payment.
 */
async function createPiPayment(amount, memo, metadata) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      amount,
      memo,
      metadata,
    });

    const options = {
      hostname: 'api.minepi.com',
      path: '/v2/payments',
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.payment);
        } catch (e) {
          reject({ error: 'Failed to parse Pi response', details: e.message });
        }
      });
    })
      .on('error', reject)
      .write(payload)
      .end();
  });
}

// ──── Routes ────────────────────────────────────────────────
/**
 * POST /api/payment/init
 * Create a new Pi payment intent
 */
app.post('/api/payment/init', async (req, res) => {
  try {
    const { amount, cartItems } = req.body;

    if (!amount || !cartItems || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount or cart items' });
    }

    const memo = `Pruma Farms Order — ${cartItems.length} item(s)`;
    const metadata = {
      order_items: cartItems,
      timestamp: new Date().toISOString(),
      source: 'pruma-farms-web',
    };

    const payment = await createPiPayment(amount, memo, metadata);

    return res.json({
      success: true,
      paymentId: payment.identifier,
      amount: payment.amount,
      memo: payment.memo,
      txid: payment.transaction?.txid || null,
    });
  } catch (error) {
    console.error('Payment init error:', error);
    return res.status(500).json({ error: 'Failed to create payment', details: error });
  }
});

/**
 * POST /api/payment/verify
 * Verify completed Pi payment and save order
 */
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { paymentId, txid, email, phone, address } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID required' });
    }

    // Verify with Pi API
    const result = await verifyPiPayment(paymentId, txid);

    if (result.success) {
      const payment = result.payment;

      // ──── SAVE ORDER TO DATABASE ────
      // TODO: Replace with your DB call (MongoDB, Postgres, etc.)
      // Example structure:
      // const order = await db.orders.create({
      //   orderId: `PRUMA-${Date.now()}`,
      //   piPaymentId: paymentId,
      //   amount: payment.amount,
      //   currency: payment.currency,
      //   status: 'paid',
      //   userEmail: email,
      //   userPhone: phone,
      //   userAddress: address,
      //   metadata: payment.metadata,
      //   paidAt: new Date(),
      // });

      console.log(`✅ Order confirmed: ${paymentId}`);

      return res.json({
        success: true,
        orderId: `PRUMA-${Date.now()}`,
        amount: payment.amount,
        message: 'Order confirmed! We'll contact you within 24 hours.',
      });
    }
  } catch (error) {
    console.error('Payment verify error:', error);
    return res.status(500).json({ error: 'Failed to verify payment', details: error });
  }
});

/**
 * GET /api/health
 * Simple health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'pruma-farms-pi-payment' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Pruma Farms Pi Payment Server running on port ${PORT}`);
  console.log(`📌 Ensure PI_API_KEY is set in .env`);
});

/**
 * Vercel Serverless Function — /api/track
 * Proxy seguro para a API 17TRACK.
 *
 * Deploy:
 *   1. Coloca este ficheiro em /api/track.js no teu projeto Vercel
 *   2. Define a variável de ambiente no Vercel Dashboard:
 *      SEVENTEEN_TRACK_KEY = <tua API key da 17TRACK>
 *   3. O frontend chama POST /api/track sem expor a key
 *
 * A API key NUNCA é enviada ao frontend — fica apenas no servidor.
 */

export default async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.SEVENTEEN_TRACK_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured. Set SEVENTEEN_TRACK_KEY in Vercel environment variables.' });
  }

  try {
    const body = req.body;

    // Validação básica
    if (!body?.numbers || !Array.isArray(body.numbers)) {
      return res.status(400).json({ error: 'Invalid payload. Expected { numbers: [{number: "..."}] }' });
    }

    // Limitar a 40 códigos por chamada (limite da 17TRACK free tier)
    const numbers = body.numbers.slice(0, 40);

    // ── STEP 1: Registar os números para rastreio ──
    const registerRes = await fetch('https://api.17track.net/track/v2/register', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(numbers),
    });

    if (!registerRes.ok) {
      const err = await registerRes.text();
      console.error('[17TRACK register error]', err);
      // Continue anyway — numbers may already be registered
    }

    // ── STEP 2: Obter dados de rastreio ──
    const trackRes = await fetch('https://api.17track.net/track/v2/gettracklist', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(numbers),
    });

    if (!trackRes.ok) {
      const err = await trackRes.text();
      console.error('[17TRACK gettracklist error]', err);
      return res.status(502).json({ error: 'Upstream API error', details: err });
    }

    const data = await trackRes.json();

    // CORS headers (ajustar o origin para o teu domínio em produção)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json(data);
  } catch (err) {
    console.error('[17TRACK proxy error]', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

/**
 * EXEMPLO DE RESPOSTA DA 17TRACK (data.data.accepted):
 * [
 *   {
 *     number: "LV123456789CN",
 *     carrier: 26,                    // carrier ID
 *     track: {
 *       w_status: 20,                 // 20 = In Transit, 40 = Delivered, 50 = Exception
 *       carrier_name: "YunExpress",
 *       e: [                          // eventos (timeline)
 *         {
 *           a: "2025-05-10T14:32:00", // timestamp
 *           z: "Chegada ao hub de Lisboa", // descrição
 *           l: "Lisboa, PT"           // localização
 *         }
 *       ]
 *     }
 *   }
 * ]
 *
 * STATUS CODES:
 *   0  = Not Found / Pending
 *   10 = Info Received
 *   20 = In Transit
 *   30 = Pickup
 *   35 = Undelivered
 *   40 = Delivered
 *   50 = Exception
 *   60 = On Hold
 */

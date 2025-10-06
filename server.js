// server.js
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

const app = Fastify({ logger: true });

const DOMAINS = [
    'imrmbb.site', 'example.com', 'ads.test', 'news.example.org',
    'start.oe-pmid-0191.xyz', 'cdn.adtarget.market'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.post('/bid', async (request, reply) => {
    const t0 = Date.now();
    const req = request.body || {};

    const tmax = clamp(Number(req.tmax) || 300, 50, 4000);

    // 40% drop (timeout): wait past tmax, then hard-close the socket
    if (Math.random() < 0.40) {
        const dropDelay = tmax + 50 + Math.floor(Math.random() * 300);
        await sleep(dropDelay);
        try { request.raw.socket?.destroy(); } catch { }
        return; // no response
    }

    // 60% respond: delay >= 150ms, try to stay just under tmax
    const MIN_DELAY = 20;
    const maxWithin = Math.max(MIN_DELAY + 10, tmax - 5);
    const delay = clamp(
        Math.floor(MIN_DELAY + Math.random() * (maxWithin - MIN_DELAY)),
        MIN_DELAY,
        Math.max(MIN_DELAY, tmax - 5)
    );
    await sleep(delay);

    // 10% of replies => 204 No Content
    if (Math.random() < 0.10) {
        reply.header('x-sim-delay-ms', Date.now() - t0);
        return reply.code(204).send();
    }

    // Build a valid ORTB 2.x BidResponse
    const imp0 = (Array.isArray(req.imp) && req.imp[0]) || {};
    const bidfloor = typeof imp0.bidfloor === 'number' ? imp0.bidfloor : 0.01;
    const price = +(bidfloor * (1.05 + Math.random() * 0.5)).toFixed(6); // > bidfloor
    const cur = Array.isArray(req.cur) && req.cur.length ? req.cur[0] : (req.cur || 'USD');

    const resp = {
        id: req.id || randomUUID(),
        cur,
        seatbid: [{
            bid: [{
                id: randomUUID().replace(/-/g, ''),
                impid: randomUUID(), // randomized as requested
                price,
                nurl: `https://tracker.example.com/win?price=\${AUCTION_PRICE}&rid=${encodeURIComponent(req.id || '')}`,
                burl: `https://tracker.example.com/bill?price=\${AUCTION_PRICE}&rid=${encodeURIComponent(req.id || '')}`,
                adm: `<a href="https://ads.${pick(DOMAINS)}/go?c=${randomUUID()}"><img src="https://ads.${pick(DOMAINS)}/imp?i=${randomUUID()}" width="300" height="250" /></a>`,
                adomain: [pick(DOMAINS)],
                adid: randomUUID().replace(/-/g, ''),
                cid: `${Math.floor(Math.random() * 1e6)}-${Math.floor(Math.random() * 1e6)}`,
                crid: `${Math.floor(Math.random() * 1e6)}|${Math.floor(Math.random() * 1e6)}`,
                w: 300,
                h: 250
            }],
            seat: `${Math.floor(Math.random() * 999999)}sh`
        }]
    };
    console.log(`Price`, resp.seatbid[0].bid[0].price, `for req`, resp.id, `(tmax=${tmax}ms, delay=${delay}ms)`);
    reply.header('x-sim-delay-ms', Date.now() - t0);
    return reply.send(resp);
});

app.listen({ host: '0.0.0.0', port: 4000 })
    .then(() => app.log.info('Fake DSP listening on http://0.0.0.0:4000/bid'))
    .catch(err => { app.log.error(err); process.exit(1); });
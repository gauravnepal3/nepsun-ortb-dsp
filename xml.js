import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

const app = Fastify({ logger: true });

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Stats config — edit sub IDs here ───────────────────────────────────────
const STATS_SUB_IDS = [12045, 12044, 11892, 11891];
// ────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 4001);

const CLICK_BASE =
    process.env.XML_CLICK_BASE ||
    `http://localhost:${PORT}/click`;

const PIXEL_BASE =
    process.env.XML_PIXEL_BASE ||
    'https://xml-imp-pixel-oax.adstork.com/nrtb-imp/imp';

app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', message: 'Fake XML bidder is running' });
});

app.get('/win', async (request, reply) => {
    app.log.info({ query: request.query }, 'XML Win Call');
    return reply.send({ status: 'ok', message: 'Win endpoint hit' });
});

app.get('/bill', async (request, reply) => {
    app.log.info({ query: request.query }, 'XML Bill Call');
    return reply.send({ status: 'ok', message: 'Bill endpoint hit' });
});

app.get('/click', async (request, reply) => {
    const { bid } = request.query;
    app.log.info({ bid }, 'XML Click registered');
    return reply.send({ status: 'ok', message: 'Click tracked', bid: bid || 'unknown' });
});

app.get('/bid', async (request, reply) => {
    const t0 = Date.now();

    const {
        ip,
        ua,
        subid,
        language,
        lang,
        tmax,
        floor,
        bidfloor
    } = request.query || {};

    const resolvedLang = language || lang || 'en';
    const resolvedSubId = subid || randomUUID();
    const resolvedTmax = clamp(Number(tmax) || 300, 30, 5000);

    // simulate occasional timeout/drop
    if (Math.random() < 0.15) {
        const dropDelay = resolvedTmax + 50 + Math.floor(Math.random() * 150);
        await sleep(dropDelay);
        try {
            request.raw.socket?.destroy();
        } catch { }
        return;
    }

    // respond within tmax most of the time
    const minDelay = 10;
    const delay = clamp(
        Math.floor(minDelay + Math.random() * Math.max(10, resolvedTmax - minDelay - 5)),
        minDelay,
        Math.max(minDelay, resolvedTmax - 5)
    );

    await sleep(delay);

    // occasional no bid
    if (Math.random() < 0.05) {
        reply.header('x-sim-delay-ms', Date.now() - t0);
        return reply.send({ bid: [] });
    }

    const priceBase =
        Number(bidfloor ?? floor) > 0 ? Number(bidfloor ?? floor) : 0.02;

    const price = (priceBase * (1.05 + Math.random() * 0.5)).toFixed(6);
    const bidId = `${resolvedSubId}_0`;

    const response = {
        bid: [
            {
                price,
                clickUrl: `${CLICK_BASE}?bid=${encodeURIComponent(bidId)}`,
                pixel: `${PIXEL_BASE}?bid=${encodeURIComponent(bidId)}`
            }
        ]
    };

    app.log.info(
        {
            ip,
            ua,
            subid: resolvedSubId,
            language: resolvedLang,
            price,
            delay
        },
        'XML fake bid served'
    );

    reply.header('x-sim-delay-ms', Date.now() - t0);
    console.log(response)
    return reply.send(response);
});

app.get('/stats', async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10);
    const { from = today, to = today } = request.query;

    // Generate all dates in [from, to] range
    const dates = [];
    const cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
    }

    // Deterministic-ish seed per date+subid so repeated calls return same values
    const seededRand = (seed) => {
        let s = seed;
        s = ((s >> 16) ^ s) * 0x45d9f3b | 0;
        s = ((s >> 16) ^ s) * 0x45d9f3b | 0;
        s = (s >> 16) ^ s;
        return (s >>> 0) / 0xffffffff;
    };

    const data = dates.flatMap((date) =>
        STATS_SUB_IDS.map((sub_id) => {
            const seed = [...(date + sub_id)].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 1);
            const clicks = Math.floor(10000 + seededRand(seed) * 25000);
            const revenue = (clicks * (0.000004 + seededRand(seed + 1) * 0.000002)).toFixed(5);
            return { date, revenue, sub_id: String(sub_id), clicks: String(clicks) };
        })
    );

    const totalClicks = data.reduce((s, r) => s + Number(r.clicks), 0);
    const totalRevenue = data.reduce((s, r) => s + Number(r.revenue), 0).toFixed(5);

    return reply.send({
        total: { revenue: totalRevenue, clicks: String(totalClicks) },
        data
    });
});

app.listen({ host: '0.0.0.0', port: PORT })
    .then(() => app.log.info(`Fake XML bidder listening on http://0.0.0.0:${PORT}/bid`))
    .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
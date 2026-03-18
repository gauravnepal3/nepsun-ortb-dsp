// server.js
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

const app = Fastify({ logger: true });

app.get('/win', async (request, reply) => {
  console.log('Win Call')
  return reply.send({ status: 'ok', message: 'Fake DSP is running' });
});

app.get('/bill', async (request, reply) => {
  console.log('Bill Call')
  return reply.send({ status: 'ok', message: 'Fake DSP is running' });
});

app.get('/click', async (request, reply) => {
  const { c } = request.query;
  console.log(`Click registered — id: ${c || 'unknown'}`);
  return reply.redirect('https://www.google.com');
});
const DOMAINS = [
    'imrmbb.site', 'example.com', 'ads.test', 'news.example.org',
    'start.oe-pmid-0191.xyz', 'cdn.adtarget.market'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Real public MP4 (works over HTTPS)
const VIDEO_URL =
  process.env.VIDEO_URL ||
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

function buildVastInline({ videoUrl, clickThroughUrl, impressionUrl, w = 640, h = 360 }) {
  // VAST 3.0 InLine with a single progressive MP4
  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="3.0">
  <Ad id="1">
    <InLine>
      <AdSystem>FakeDSP</AdSystem>
      <AdTitle>Test Video</AdTitle>
      ${impressionUrl ? `<Impression><![CDATA[${impressionUrl}]]></Impression>` : ''}
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:30</Duration>
            <VideoClicks>
              <ClickThrough><![CDATA[${clickThroughUrl}]]></ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="${w}" height="${h}">
                <![CDATA[${videoUrl}]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
}

app.post('/bid', async (request, reply) => {
    const t0 = Date.now();
    const req = request.body || {};

    const tmax = clamp(Number(req.tmax) || 300, 50, 4000);

    // 40% drop (timeout): wait past tmax, then hard-close the socket
    if (Math.random() < 0.40) {
        const dropDelay = tmax + 50 + Math.floor(Math.random() * 300);
        await sleep(dropDelay);
        try { request.raw.socket?.destroy(); } catch { }
      return;
    }

  // 60% respond: delay >= 20ms, try to stay just under tmax
    const MIN_DELAY = 20;
    const maxWithin = Math.max(MIN_DELAY + 10, tmax - 5);
    const delay = clamp(
        Math.floor(MIN_DELAY + Math.random() * (maxWithin - MIN_DELAY)),
        MIN_DELAY,
        Math.max(MIN_DELAY, tmax - 5)
    );
    await sleep(delay);

  // 1% => 204 No Content
  if (Math.random() < 0.01) {
        reply.header('x-sim-delay-ms', Date.now() - t0);
        return reply.code(204).send();
    }

    const imp0 = (Array.isArray(req.imp) && req.imp[0]) || {};
  const isVideo = !!imp0.video;

    const bidfloor = typeof imp0.bidfloor === 'number' ? imp0.bidfloor : 0.01;
  const price = +(bidfloor * (1.05 + Math.random() * 0.5)).toFixed(6);
    const cur = Array.isArray(req.cur) && req.cur.length ? req.cur[0] : (req.cur || 'USD');

  // IMPORTANT: impid should match request imp.id if possible
  const impid = imp0.id || randomUUID();

  // Optional: basic dimensions for VAST metadata
  const vw = imp0.video?.w ?? 640;
  const vh = imp0.video?.h ?? 360;

  const clickUrl = `http://localhost:4000/click?c=${randomUUID()}`;
  const impTrackUrl = `https://tracker.example.com/vast-imp?rid=${encodeURIComponent(req.id || '')}`;

  const adm = isVideo
    ? buildVastInline({
      videoUrl: VIDEO_URL,
      clickThroughUrl: clickUrl,
      impressionUrl: impTrackUrl,
      w: vw,
      h: vh
    })
    : `<a href="${clickUrl}"><img src="https://adsterra.com/blog/wp-content/uploads/2021/06/how-banners-make-you-money.png?i${randomUUID()}" width="300" height="250" /></a>`;

    const resp = {
        id: req.id || randomUUID(),
        cur,
        seatbid: [{
            bid: [{
                id: randomUUID().replace(/-/g, ''),
              impid,
                price,
              nurl: `http://localhost:4000/win?price=\${AUCTION_PRICE}&rid=${encodeURIComponent(req.id || '')}`,
              burl: `http://localhost:4000/bill?price=\${AUCTION_PRICE}&rid=${encodeURIComponent(req.id || '')}`,
              adm,
                adomain: [pick(DOMAINS)],
                adid: randomUUID().replace(/-/g, ''),
                cid: `${Math.floor(Math.random() * 1e6)}-${Math.floor(Math.random() * 1e6)}`,
                crid: `${Math.floor(Math.random() * 1e6)}|${Math.floor(Math.random() * 1e6)}`,
              w: isVideo ? vw : 300,
              h: isVideo ? vh : 250
            }],
            seat: `${Math.floor(Math.random() * 999999)}sh`
        }]
    };

  console.log(`Price`, resp.seatbid[0].bid[0].price, `for req`, resp.id, `(tmax=${tmax}ms, delay=${delay}ms, isVideo=${isVideo})`);
    reply.header('x-sim-delay-ms', Date.now() - t0);
    return reply.send(resp);
});

app.listen({ host: '0.0.0.0', port: 4000 })
    .then(() => app.log.info('Fake DSP listening on http://0.0.0.0:4000/bid'))
    .catch(err => { app.log.error(err); process.exit(1); });
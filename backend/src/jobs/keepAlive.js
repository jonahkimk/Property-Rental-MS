const https = require('https');

const keepAlive = () => {
  const url = process.env.RENDER_BACKEND_URL;
  if (process.env.NODE_ENV !== 'production') return false;
  if (!url || typeof url !== 'string') return false;

  // Allow env var to be set as either a full URL (https://host) or just a host.
  const normalized = url.trim();
  const target = (() => {
    const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    // Remove trailing slashes to avoid `//api/health`
    return withProtocol.replace(/\/+$/, '');
  })();

  // Validate URL shape early to avoid silent runtime failures.
  try {
    // eslint-disable-next-line no-new
    new URL(target);
  } catch {
    return false;
  }

  let inFlight = false;
  const requestTimeoutMs = 10 * 1000; // fail fast if health endpoint hangs

  setInterval(() => {
    if (inFlight) {
      // Avoid piling up multiple concurrent requests.
      console.warn('♻️  Keep-alive skipped: previous ping still in progress.');
      return;
    }

    inFlight = true;
    const markDone = () => {
      inFlight = false;
    };

    const req = https.get(`${target}/api/health`, (res) => {
      console.log(`♻️  Keep-alive ping → ${res.statusCode}`);

      // Drain response to release sockets promptly.
      res.resume();

      // Reset on successful completion OR connection lifecycle events.
      res.on('end', markDone);
      res.on('close', markDone);
      // Reset on stream errors after headers were received.
      res.on('error', (err) => {
        console.error('Keep-alive response stream error:', err.message);
        markDone();
      });
    });

    req.setTimeout(requestTimeoutMs, () => {
      console.warn('♻️  Keep-alive request timeout; aborting.');
      markDone();
      req.destroy(new Error('Keep-alive request timeout'));
    });

    req.on('error', (err) => {
      console.error('Keep-alive failed:', err.message);
      markDone();
    });
  }, 14 * 60 * 1000); // ping every 14 minutes

  return true;
};

module.exports = { keepAlive };
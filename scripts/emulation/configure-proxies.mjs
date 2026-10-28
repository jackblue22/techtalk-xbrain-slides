const api = process.env.TOXIPROXY_URL ?? 'http://toxiproxy:8474';
const jitter = boundedNumber('EMULATED_JITTER_MS', 1, 0, 1000);

const definitions = [
  { name: 'sg_http', listen: '0.0.0.0:8101', upstream: 'sg-api:8080', latency: boundedNumber('EMULATED_SG_ONE_WAY_MS', 18, 0, 5000) },
  { name: 'han_http', listen: '0.0.0.0:8102', upstream: 'han-api:8080', latency: boundedNumber('EMULATED_HAN_ONE_WAY_MS', 4, 0, 5000) },
  { name: 'hybrid_http', listen: '0.0.0.0:8103', upstream: 'hybrid-api:8080', latency: boundedNumber('EMULATED_SG_ONE_WAY_MS', 18, 0, 5000) },
  { name: 'hybrid_db', listen: '0.0.0.0:55432', upstream: 'han-db:5432', latency: boundedNumber('EMULATED_CROSS_ZONE_ONE_WAY_MS', 12, 0, 5000) },
];

function boundedNumber(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return Math.round(parsed);
}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  if (!response.ok && response.status !== 404) throw new Error(`${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${await response.text()}`);
  return response;
}

for (const proxy of definitions) {
  await request(`/proxies/${proxy.name}`, { method: 'DELETE' });
  await request('/proxies', { method: 'POST', body: JSON.stringify({ name: proxy.name, listen: proxy.listen, upstream: proxy.upstream, enabled: true }) });
  for (const stream of ['upstream', 'downstream']) {
    await request(`/proxies/${proxy.name}/toxics`, {
      method: 'POST',
      body: JSON.stringify({ name: `${stream}_illustrative_latency`, type: 'latency', stream, toxicity: 1, attributes: { latency: proxy.latency, jitter } }),
    });
  }
  console.log(JSON.stringify({ event: 'proxy_configured', name: proxy.name, upstream: proxy.upstream, oneWayLatencyMs: proxy.latency, jitterMs: jitter, provenance: 'operator-configured local network emulation; not AWS measurement' }));
}


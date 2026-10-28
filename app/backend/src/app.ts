import { performance } from 'node:perf_hooks';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { createOrder, getOrder, listOrders, validateOrder } from './orders.js';

export interface AppOptions { pool?: Pool }

const allowedCounts = new Set([1, 5, 10, 20]);
const localOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

export function allowedCorsOrigins(value = process.env.CORS_ALLOWED_ORIGINS) {
  const configured = (value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  return configured.length > 0 ? configured : [localOrigin];
}

function timingHeader(appMs: number, dbMs = 0) {
  return `app;dur=${appMs.toFixed(2)}, db;dur=${dbMs.toFixed(2)}`;
}

export function buildApp(options: AppOptions = {}) {
  const pool = options.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  const app = Fastify({ logger: true, requestIdHeader: 'x-request-id', genReqId: () => crypto.randomUUID() });
  pool.on('error', (error) => app.log.error({ error }, 'Idle PostgreSQL connection failed; the pool will establish a new connection on demand.'));
  app.register(cors, { origin: allowedCorsOrigins(), exposedHeaders: ['server-timing', 'x-request-id'] });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id).header('cache-control', 'no-store');
    return payload;
  });

  app.get('/health', async (_request, reply) => {
    const started = performance.now();
    const dbStarted = performance.now();
    await pool.query('select 1');
    const dbMs = performance.now() - dbStarted;
    reply.header('server-timing', timingHeader(performance.now() - started, dbMs));
    return { status: 'ok', database: 'connected', checkedAt: new Date().toISOString() };
  });

  app.get('/api/topology', async () => ({
    mode: process.env.DEPLOYMENT_MODE ?? 'LOCAL_STANDALONE', scenario: process.env.APP_SCENARIO ?? 'local', appVantage: process.env.APP_VANTAGE ?? 'localhost',
    databaseLocation: process.env.DB_LOCATION ?? 'local-postgres', aws: {
      status: process.env.AWS_STATUS ?? 'NOT_CONNECTED',
      region: process.env.AWS_REGION ?? 'ap-southeast-1',
      availabilityZone: process.env.AWS_AVAILABILITY_ZONE ?? null,
    },
    networkEmulation: process.env.DEPLOYMENT_MODE === 'LOCAL_NETWORK_EMULATION' ? {
      enabled: true,
      httpOneWayDelayMs: Number(process.env.EMULATED_HTTP_ONE_WAY_MS ?? 0),
      databaseOneWayDelayMs: Number(process.env.EMULATED_DB_ONE_WAY_MS ?? 0),
      provenance: 'Operator-configured Toxiproxy delay; not measured AWS latency.'
    } : { enabled: false },
    measuredAt: new Date().toISOString(),
    provenance: process.env.INFRASTRUCTURE_PROVENANCE ?? 'Runtime environment and database health; no AWS identity claimed.'
  }));

  app.get('/api/orders', async (_request, reply) => {
    const started = performance.now();
    const rows = await listOrders(pool);
    const elapsed = performance.now() - started;
    reply.header('server-timing', timingHeader(elapsed, elapsed));
    return { orders: rows, count: rows.length, measuredAt: new Date().toISOString() };
  });

  app.post('/api/orders', async (request, reply) => {
    try {
      const started = performance.now();
      const order = await createOrder(pool, validateOrder(request.body));
      const elapsed = performance.now() - started;
      reply.code(201).header('server-timing', timingHeader(elapsed, elapsed));
      return { order, measuredAt: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid order.';
      return reply.code(400).send({ error: 'INVALID_ORDER', message, requestId: request.id });
    }
  });

  app.get<{ Params: { id: string } }>('/api/orders/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: 'INVALID_ID', message: 'Order ID must be numeric.' });
    const started = performance.now();
    const order = await getOrder(pool, request.params.id);
    const elapsed = performance.now() - started;
    reply.header('server-timing', timingHeader(elapsed, elapsed));
    return order ? { order, measuredAt: new Date().toISOString() } : reply.code(404).send({ error: 'NOT_FOUND', message: 'Order not found.' });
  });

  app.get<{ Querystring: { n?: string } }>('/api/benchmark/db', async (request, reply) => {
    const n = Number(request.query.n ?? 1);
    if (!allowedCounts.has(n)) return reply.code(400).send({ error: 'INVALID_N', message: 'n must be one of 1, 5, 10, or 20.' });
    const started = performance.now();
    const queries = [];
    for (let index = 0; index < n; index += 1) {
      const queryStarted = performance.now();
      await pool.query('select $1::int as sequence, clock_timestamp() as database_time', [index + 1]);
      queries.push({ sequence: index + 1, durationMs: Number((performance.now() - queryStarted).toFixed(3)) });
    }
    const dbMs = queries.reduce((sum, query) => sum + query.durationMs, 0);
    const appMs = performance.now() - started;
    reply.header('server-timing', timingHeader(appMs, dbMs));
    return { requestId: request.id, scenario: process.env.APP_SCENARIO ?? 'local', queryCount: n, sequential: true, queries, dbDurationMs: Number(dbMs.toFixed(3)), appDurationMs: Number(appMs.toFixed(3)), measuredAt: new Date().toISOString() };
  });

  app.post('/api/benchmark/write', async (request, reply) => {
    const started = performance.now();
    const result = await pool.query<{ id: string; createdAt: Date }>(
      `insert into benchmark_events (request_id, scenario) values ($1, $2) returning id, created_at as "createdAt"`,
      [request.id, process.env.APP_SCENARIO ?? 'local'],
    );
    const dbMs = performance.now() - started;
    reply.code(201).header('server-timing', timingHeader(dbMs, dbMs));
    return { event: result.rows[0], requestId: request.id, dbDurationMs: Number(dbMs.toFixed(3)), measuredAt: new Date().toISOString() };
  });

  app.addHook('onClose', async () => pool.end());
  return app;
}

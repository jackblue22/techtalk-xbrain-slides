import { buildServer } from './server.js';

const host = process.env.AGENT_HOST ?? '127.0.0.1';
const diagnosticContainerBind = process.env.AGENT_CONTAINER_DIAGNOSTICS === '1' && host === '0.0.0.0';
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !diagnosticContainerBind) throw new Error('The presenter control agent must bind to loopback only.');
const port = Number(process.env.AGENT_PORT ?? 3001);
const app = await buildServer();
await app.listen({ host, port });

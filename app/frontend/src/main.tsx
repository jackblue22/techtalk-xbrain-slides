import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Database, Plus, RefreshCw } from 'lucide-react';
import './styles.css';
import './runtime.css';

type Order = { id: string; publicId: string; customerRef: string; status: string; total: number; itemCount: number; createdAt: string };
type ApiTarget = { id: string; label: string; apiBaseUrl: string };
type RuntimeConfig = { defaultTarget: string; targets: ApiTarget[]; provenance: string };

declare global { interface Window { __HANOI_LAB_CONFIG__?: RuntimeConfig } }

const fallbackConfig: RuntimeConfig = { defaultTarget: 'local', targets: [{ id: 'local', label: 'Local / same origin', apiBaseUrl: '' }], provenance: 'Runtime configuration was unavailable; using same-origin API.' };
const runtimeConfig = window.__HANOI_LAB_CONFIG__ ?? fallbackConfig;

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading');
  const [message, setMessage] = useState('');
  const [targetId, setTargetId] = useState(runtimeConfig.defaultTarget);
  const target = runtimeConfig.targets.find((candidate) => candidate.id === targetId) ?? runtimeConfig.targets[0] ?? fallbackConfig.targets[0];
  const apiUrl = (path: string) => `${target.apiBaseUrl.replace(/\/$/, '')}${path}`;

  async function load() {
    setState('loading');
    try {
      const response = await fetch(apiUrl('/api/orders'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setOrders(data.orders); setState('ready');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed'); setState('error'); }
  }

  useEffect(() => { void load(); }, [targetId]);

  async function createDemoOrder() {
    setMessage('');
    try {
      const response = await fetch(apiUrl('/api/orders'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerRef: `DEMO-LIVE-${Date.now().toString().slice(-6)}`, items: [{ sku: 'LATENCY-PROBE', quantity: 1, unitPrice: 19.9 }] }) });
      if (!response.ok) throw new Error((await response.json()).message ?? `HTTP ${response.status}`);
      setMessage(`Created a real PostgreSQL order. Request ${response.headers.get('x-request-id')}`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Create failed'); }
  }

  return <main>
    <header><div className="brand"><Box aria-hidden="true"/><div><span>PORTABLE WORKLOAD</span><h1>Mini Order Management</h1></div></div><div className="target"><label htmlFor="api-target">API target</label><select id="api-target" value={target.id} onChange={(event) => setTargetId(event.target.value)}>{runtimeConfig.targets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></div><div className="db"><Database aria-hidden="true"/> PostgreSQL 16</div></header>
    <section className="hero"><div><p className="eyebrow">REAL 3-TIER REFERENCE APP</p><h2>Every order crosses the HTTP API and PostgreSQL.</h2><p>No browser-only placeholders. Create an order, then inspect it through the API or presenter console.</p></div><button onClick={createDemoOrder}><Plus aria-hidden="true"/> Create demo order</button></section>
    <p className="provenance"><strong>{target.label}</strong> · {target.apiBaseUrl || 'same origin'} · {runtimeConfig.provenance}</p>
    {message ? <p className="notice" role="status">{message}</p> : null}
    <section className="orders" aria-labelledby="orders-title"><div className="section-head"><div><p className="eyebrow">DATABASE RECORDS</p><h2 id="orders-title">Recent orders</h2></div><button className="secondary" onClick={load} disabled={state === 'loading'}><RefreshCw aria-hidden="true"/> Refresh</button></div>
      {state === 'loading' ? <p className="empty">Reading PostgreSQL…</p> : state === 'error' ? <p className="empty error">Could not load orders: {message}</p> : orders.length === 0 ? <p className="empty">No orders yet. Create the first synthetic order.</p> :
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Reference</th><th>Status</th><th>Items</th><th>Total</th><th>Created</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td className="mono">#{order.id}</td><td>{order.customerRef}</td><td><span className={`status ${order.status}`}>{order.status}</span></td><td>{order.itemCount}</td><td>${order.total.toFixed(2)}</td><td>{new Date(order.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

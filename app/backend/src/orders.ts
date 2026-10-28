import type { Pool, PoolClient } from 'pg';
import type { CreateOrderInput, Queryable } from './types.js';

export async function listOrders(db: Queryable, limit = 50) {
  const result = await db.query(
    `select o.id, o.public_id as "publicId", o.customer_ref as "customerRef", o.status,
            o.total::float8 as total, o.created_at as "createdAt", count(i.id)::int as "itemCount"
       from orders o left join order_items i on i.order_id = o.id
      group by o.id order by o.created_at desc limit $1`,
    [limit],
  );
  return result.rows;
}

export async function getOrder(db: Queryable, id: string) {
  const order = await db.query(
    `select id, public_id as "publicId", customer_ref as "customerRef", status,
            total::float8 as total, created_at as "createdAt", updated_at as "updatedAt"
       from orders where id = $1`,
    [id],
  );
  if (!order.rows[0]) return null;
  const items = await db.query(
    `select id, sku, quantity, unit_price::float8 as "unitPrice"
       from order_items where order_id = $1 order by id`,
    [id],
  );
  return { ...order.rows[0], items: items.rows };
}

export function validateOrder(value: unknown): CreateOrderInput {
  if (!value || typeof value !== 'object') throw new Error('A JSON order body is required.');
  const candidate = value as Partial<CreateOrderInput>;
  if (typeof candidate.customerRef !== 'string' || !/^DEMO-[A-Z0-9-]{3,40}$/.test(candidate.customerRef)) {
    throw new Error('customerRef must be synthetic and match DEMO-[A-Z0-9-].');
  }
  if (!Array.isArray(candidate.items) || candidate.items.length < 1 || candidate.items.length > 20) {
    throw new Error('items must contain 1 to 20 entries.');
  }
  const items = candidate.items.map((item) => {
    if (!item || typeof item.sku !== 'string' || !/^[A-Z0-9-]{2,32}$/.test(item.sku)) throw new Error('Each SKU must be 2-32 uppercase letters, numbers, or hyphens.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new Error('Each quantity must be an integer from 1 to 100.');
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > 1_000_000) throw new Error('Each unitPrice must be between 0 and 1,000,000.');
    return { sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice };
  });
  return { customerRef: candidate.customerRef, items };
}

export async function createOrder(pool: Pool, input: CreateOrderInput) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const order = await client.query<{ id: string }>(
      `insert into orders (customer_ref, total) values ($1, $2)
       returning id`,
      [input.customerRef, total.toFixed(2)],
    );
    const id = order.rows[0]!.id;
    for (const item of input.items) {
      await client.query(
        `insert into order_items (order_id, sku, quantity, unit_price) values ($1, $2, $3, $4)`,
        [id, item.sku, item.quantity, item.unitPrice.toFixed(2)],
      );
    }
    await client.query('commit');
    return await getOrder(client as PoolClient, id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}


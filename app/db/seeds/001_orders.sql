insert into orders (customer_ref, status, total, created_at)
select seed.customer_ref, seed.status, seed.total, seed.created_at
from (values
  ('DEMO-ACME-001', 'confirmed', 129.90::numeric, now() - interval '18 minutes'),
  ('DEMO-LANTERN-002', 'pending', 84.50::numeric, now() - interval '11 minutes'),
  ('DEMO-ORBIT-003', 'fulfilled', 240.00::numeric, now() - interval '4 minutes')
) as seed(customer_ref, status, total, created_at)
where not exists (select 1 from orders);

insert into order_items (order_id, sku, quantity, unit_price)
select o.id, valueset.sku, valueset.quantity, valueset.unit_price
from orders o
join (values
  ('DEMO-ACME-001', 'EDGE-NODE', 1, 129.90::numeric),
  ('DEMO-LANTERN-002', 'TRACE-KIT', 1, 84.50::numeric),
  ('DEMO-ORBIT-003', 'DB-PROBE', 2, 120.00::numeric)
) as valueset(customer_ref, sku, quantity, unit_price) on valueset.customer_ref = o.customer_ref
where not exists (select 1 from order_items);


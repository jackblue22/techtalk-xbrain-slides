create table if not exists orders (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  customer_ref text not null,
  status text not null default 'pending'
    constraint orders_status_check check (status in ('pending', 'confirmed', 'fulfilled', 'cancelled')),
  total numeric(12, 2) not null constraint orders_total_nonnegative check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  sku text not null,
  quantity integer not null constraint order_items_quantity_positive check (quantity > 0),
  unit_price numeric(12, 2) not null constraint order_items_price_nonnegative check (unit_price >= 0)
);

create table if not exists benchmark_events (
  id bigint generated always as identity primary key,
  request_id text not null,
  scenario text not null,
  created_at timestamptz not null default now()
);

create index if not exists orders_status_created_at_idx on orders (status, created_at desc);
create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists order_items_order_id_idx on order_items (order_id);
create index if not exists benchmark_events_created_at_idx on benchmark_events (created_at desc);


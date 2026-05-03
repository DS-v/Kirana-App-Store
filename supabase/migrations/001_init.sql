-- ============================================================
-- Kirana Smart Orders — schema v2 (Supabase Auth)
-- Run in Supabase SQL Editor
-- ============================================================

-- Shops — id is the Supabase auth user UUID
create table if not exists shops (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  created_at  timestamptz not null default now()
);

-- Products
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  aliases     text[] not null default '{}',
  price       numeric not null default 0,
  unit        text not null default 'packet',
  category    text not null default 'Other',
  in_stock    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists products_shop_idx on products(shop_id);

-- Customers
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  udhaar      numeric not null default 0,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists customers_shop_idx on customers(shop_id);

-- Orders
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  customer_name   text not null,
  customer_phone  text not null default '',
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','packed','delivered','credit','cancelled')),
  total           numeric not null default 0,
  raw_message     text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists orders_shop_idx     on orders(shop_id);
create index if not exists orders_created_idx  on orders(created_at desc);

-- Order line items
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  qty           numeric not null,
  unit          text not null default 'pc',
  price         numeric not null default 0
);
create index if not exists order_items_order_idx on order_items(order_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Backend uses service-role key (bypasses RLS automatically).
-- RLS is a safety net in case the anon key is ever used directly.
alter table shops       enable row level security;
alter table products    enable row level security;
alter table customers   enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;

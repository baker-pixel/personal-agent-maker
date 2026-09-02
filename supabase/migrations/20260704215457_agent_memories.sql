-- Agent long-term memory with semantic search.
-- Embeddings: gte-small (built into Supabase Edge Runtime), 384 dims, normalized
-- → inner product (<#>) is equivalent to cosine similarity and faster.

create extension if not exists vector with schema extensions;

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  category text not null default 'fact'
    check (category in ('preference', 'fact', 'person', 'project', 'instruction')),
  source text not null default 'chat',
  embedding extensions.vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_memories enable row level security;

create policy "Users read own memories"
  on public.agent_memories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own memories"
  on public.agent_memories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own memories"
  on public.agent_memories for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own memories"
  on public.agent_memories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.agent_memories to authenticated;
grant all on public.agent_memories to service_role;

create index if not exists agent_memories_embedding_idx
  on public.agent_memories using hnsw (embedding extensions.vector_ip_ops);

create index if not exists agent_memories_user_idx
  on public.agent_memories (user_id, created_at desc);

-- Similarity search scoped to one user. Embeddings are normalized, so the
-- inner product is the cosine similarity (negated by pgvector's <#>).
create or replace function public.match_agent_memories(
  query_embedding extensions.vector(384),
  filter_user_id uuid,
  match_threshold float default 0.55,
  match_count int default 8
)
returns setof public.agent_memories
language sql
stable
set search_path = ''
as $$
  select *
  from public.agent_memories m
  where m.user_id = filter_user_id
    and m.embedding is not null
    and m.embedding operator(extensions.<#>) query_embedding < -match_threshold
  order by m.embedding operator(extensions.<#>) query_embedding
  limit least(match_count, 50);
$$;

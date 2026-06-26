-- Permite cargar horario de inicio y bloquea edición del prode 1 hora antes.
-- Ejecutar en Supabase > SQL Editor.

alter table public.matches
add column if not exists starts_at timestamptz;

-- Reemplazamos políticas públicas de pronósticos para respetar el cierre 1h antes.
drop policy if exists "Alta pronosticos abiertos" on public.predictions;
drop policy if exists "Editar pronosticos abiertos" on public.predictions;

create policy "Alta pronosticos abiertos"
on public.predictions for insert
with check (
  advance_pick in ('A','B')
  and exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and m.locked = false
      and m.real_a is null
      and m.real_b is null
      and (m.starts_at is null or now() < (m.starts_at - interval '1 hour'))
  )
);

create policy "Editar pronosticos abiertos"
on public.predictions for update
using (
  exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and m.locked = false
      and m.real_a is null
      and m.real_b is null
      and (m.starts_at is null or now() < (m.starts_at - interval '1 hour'))
  )
)
with check (
  advance_pick in ('A','B')
  and exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and m.locked = false
      and m.real_a is null
      and m.real_b is null
      and (m.starts_at is null or now() < (m.starts_at - interval '1 hour'))
  )
);

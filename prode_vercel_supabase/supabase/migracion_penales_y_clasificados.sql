-- Ejecutar en Supabase SQL Editor si ya tenías la versión anterior instalada.
-- No borra datos: solo agrega columnas y actualiza políticas.

alter table public.matches add column if not exists went_penalties boolean not null default false;
alter table public.matches add column if not exists advance_winner text check (advance_winner is null or advance_winner in ('A','B'));
alter table public.predictions add column if not exists advance_pick text check (advance_pick is null or advance_pick in ('A','B'));

update public.predictions
set advance_pick = case
  when pred_a > pred_b then 'A'
  when pred_b > pred_a then 'B'
  else advance_pick
end
where advance_pick is null;

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
  )
);

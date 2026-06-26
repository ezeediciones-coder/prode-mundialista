-- MIGRACION SEGURA - REGLAS FINALES PRODE
-- Ejecutar en Supabase SQL Editor. No borra datos existentes.

alter table public.matches add column if not exists went_penalties boolean not null default false;
alter table public.matches add column if not exists advance_winner text check (advance_winner is null or advance_winner in ('A','B'));
alter table public.matches add column if not exists real_pen_a int check (real_pen_a is null or real_pen_a >= 0);
alter table public.matches add column if not exists real_pen_b int check (real_pen_b is null or real_pen_b >= 0);

alter table public.predictions add column if not exists advance_pick text check (advance_pick is null or advance_pick in ('A','B'));
alter table public.predictions add column if not exists pred_pen_a int check (pred_pen_a is null or pred_pen_a >= 0);
alter table public.predictions add column if not exists pred_pen_b int check (pred_pen_b is null or pred_pen_b >= 0);

update public.predictions
set advance_pick = case
  when pred_a > pred_b then 'A'
  when pred_b > pred_a then 'B'
  else advance_pick
end
where advance_pick is null;

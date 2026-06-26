-- MIGRACION SEGURA - FIX PANEL ADMIN
-- Ejecutar si el panel admin no guarda cambios.
-- No borra datos. Refuerza permisos del backend para editar partidos.

grant usage on schema public to service_role;
grant select, update on public.matches to service_role;
grant select on public.participants, public.predictions to service_role;

-- Asegura columnas necesarias para resultados, penales y clasificados.
alter table public.matches add column if not exists went_penalties boolean not null default false;
alter table public.matches add column if not exists advance_winner text check (advance_winner is null or advance_winner in ('A','B'));
alter table public.matches add column if not exists real_pen_a int check (real_pen_a is null or real_pen_a >= 0);
alter table public.matches add column if not exists real_pen_b int check (real_pen_b is null or real_pen_b >= 0);

alter table public.predictions add column if not exists advance_pick text check (advance_pick is null or advance_pick in ('A','B'));
alter table public.predictions add column if not exists pred_pen_a int check (pred_pen_a is null or pred_pen_a >= 0);
alter table public.predictions add column if not exists pred_pen_b int check (pred_pen_b is null or pred_pen_b >= 0);

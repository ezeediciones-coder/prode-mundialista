PRODE MUNDIALISTA CON VERCEL + SUPABASE
=======================================

Qué incluye
-----------
- Página web con diseño mundialista.
- Formulario para cargar pronósticos.
- Ranking en vivo con todos los registrados.
- Puntaje automático:
  * Resultado exacto: +6 puntos.
  * Acertar ganador sin resultado exacto: +3 puntos.
  * Empate exacto: +6 puntos.
  * Empate sin resultado exacto: +3 puntos.
- Panel admin para cargar resultados reales.
- Base de datos en Supabase.
- Deploy en Vercel.


PASO 1 - Crear la base en Supabase
----------------------------------
1. Entrá a Supabase y creá un proyecto nuevo.
2. Entrá a SQL Editor.
3. Abrí el archivo: supabase/schema.sql
4. Copiá todo el contenido y ejecutalo.

Eso crea 3 tablas:
- matches: partidos.
- participants: participantes.
- predictions: pronósticos.

También carga 16 partidos de ejemplo.
Después podés cambiar los nombres de los equipos desde Supabase:
Table Editor > matches.


PASO 2 - Copiar las keys de Supabase
------------------------------------
En Supabase entrá a:
Project Settings > API

Copiá:
- Project URL
- anon public key
- service_role key

IMPORTANTE:
La anon key puede ir en el frontend.
La service_role key NO se comparte nunca. Solo va en Vercel como variable privada.


PASO 3 - Subir el proyecto a Vercel
-----------------------------------
Opción recomendada:
1. Subí esta carpeta a un repositorio de GitHub.
2. En Vercel elegí Add New Project.
3. Importá el repo.
4. Framework: Vite.
5. Build command: npm run build
6. Output directory: dist


PASO 4 - Variables de entorno en Vercel
---------------------------------------
En Vercel entrá al proyecto:
Settings > Environment Variables

Agregá estas 4 variables:

VITE_SUPABASE_URL
Valor: la URL de tu proyecto Supabase.

VITE_SUPABASE_ANON_KEY
Valor: la anon public key de Supabase.

SUPABASE_SERVICE_ROLE_KEY
Valor: la service_role key de Supabase.

ADMIN_PIN
Valor: el PIN privado que vas a usar para cargar resultados reales.
Ejemplo: 4589

Después de cargar las variables, hacé redeploy.


PASO 5 - Usar la página
-----------------------
- Compartís el link de Vercel con tu familia.
- Cada persona escribe su nombre y carga los resultados.
- En Ranking se ven todos los registrados.
- Cuando termine un partido, entrás a Resultados > Cargar resultados como admin.
- Ponés el PIN, cargás el resultado real y se actualiza el ranking.


Cómo editar partidos
--------------------
Desde Supabase:
Table Editor > matches

Editá:
- team_a
- team_b
- match_no
- round

No hace falta tocar código para cambiar equipos.


Notas importantes
-----------------
- Cuando cargás un resultado real, el partido queda bloqueado.
- Si alguien vuelve a cargar con el mismo nombre, se actualiza su prode y no se duplica.
- Es ideal para uso familiar. No es un sistema con login individual fuerte.
- Si querés máxima seguridad para que nadie edite el prode de otro, después se le puede agregar login por WhatsApp/email o códigos personales.

PRODE MUNDIALISTA - VERCEL + SUPABASE

Versión: llave estilo mundialista + admin separado + penales + puntos por clasificado.

PUNTAJE
- Resultado exacto: +6 puntos.
- Ganador o empate correcto sin resultado exacto: +3 puntos.
- Equipo que avanza de ronda: +3 puntos extra.

Ejemplo:
- Real: Argentina 2 - 1 Equipo X. Avanza Argentina.
- Prode: Argentina 2 - 1 Equipo X => 6 + 3 = 9 puntos.
- Prode: Argentina 1 - 0 Equipo X => 3 + 3 = 6 puntos.
- Prode: 1 - 1 y avanza Argentina => 0 por resultado si no empataron, +3 por clasificado.

URLS
- Página pública: https://tu-dominio.vercel.app
- Panel admin: https://tu-dominio.vercel.app/admin

SI YA TENÍAS LA VERSIÓN ANTERIOR INSTALADA
1. Subí/reemplazá esta carpeta completa en GitHub: prode_vercel_supabase
2. En Supabase abrí SQL Editor.
3. Pegá y ejecutá: supabase/migracion_penales_y_clasificados.sql
4. Vercel debería redeployar solo. Si no, entrá a Deployments y hacé Redeploy del último deploy.

SI LO INSTALÁS DESDE CERO
1. Crear proyecto en Supabase.
2. SQL Editor > pegar y ejecutar supabase/schema.sql
3. Subir este proyecto a GitHub.
4. Importar en Vercel.
5. Root Directory: prode_vercel_supabase
6. Variables de entorno en Vercel:
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   ADMIN_PIN=1234

NOTAS
- El admin carga resultado real, si fue a penales y quién avanzó.
- Si el resultado real no es empate, el sistema toma automáticamente como clasificado al ganador del marcador.
- Si el resultado real es empate, el admin debe elegir quién avanzó.
- Si el participante pronostica empate, debe elegir quién avanza.

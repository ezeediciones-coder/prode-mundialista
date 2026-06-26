const { createClient } = require('@supabase/supabase-js');

function outcome(a, b) {
  if (a > b) return 'A';
  if (a < b) return 'B';
  return 'D';
}

function penWinner(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a > b) return 'A';
  if (b > a) return 'B';
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { pin, results = [], teams = [] } = req.body || {};

  if (!process.env.ADMIN_PIN || pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ error: 'PIN de admin incorrecto.' });
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Faltan variables de entorno del servidor en Vercel.' });
  }

  if (!Array.isArray(results) || !Array.isArray(teams) || (results.length === 0 && teams.length === 0)) {
    return res.status(400).json({ error: 'No hay cambios para guardar.' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    for (const item of teams) {
      const matchId = Number(item.match_id);
      const teamA = String(item.team_a || '').trim();
      const teamB = String(item.team_b || '').trim();

      if (!Number.isInteger(matchId) || !teamA || !teamB) {
        return res.status(400).json({ error: 'Hay un nombre de equipo inválido.' });
      }

      const { error } = await supabase
        .from('matches')
        .update({ team_a: teamA, team_b: teamB })
        .eq('id', matchId);

      if (error) {
        console.error(error);
        return res.status(500).json({ error: `No pude actualizar los nombres de equipos: ${error.message || 'error de Supabase'}` });
      }
    }

    for (const item of results) {
      const matchId = Number(item.match_id);

      if (!Number.isInteger(matchId)) {
        return res.status(400).json({ error: 'Hay un partido inválido.' });
      }

      if (item.clear_result) {
        const { error } = await supabase
          .from('matches')
          .update({
            real_a: null,
            real_b: null,
            went_penalties: false,
            real_pen_a: null,
            real_pen_b: null,
            advance_winner: null,
            locked: false,
          })
          .eq('id', matchId);

        if (error) {
          console.error(error);
          return res.status(500).json({ error: `No pude limpiar uno de los partidos: ${error.message || 'error de Supabase'}` });
        }

        continue;
      }

      const realA = Number(item.real_a);
      const realB = Number(item.real_b);
      const wentPenalties = Boolean(item.went_penalties);
      const realPenA = item.real_pen_a === null || item.real_pen_a === undefined || item.real_pen_a === '' ? null : Number(item.real_pen_a);
      const realPenB = item.real_pen_b === null || item.real_pen_b === undefined || item.real_pen_b === '' ? null : Number(item.real_pen_b);
      const directOutcome = outcome(realA, realB);
      const penaltyOutcome = penWinner(realPenA, realPenB);
      const advanceWinner = wentPenalties ? (penaltyOutcome || item.advance_winner) : (directOutcome === 'A' || directOutcome === 'B' ? directOutcome : item.advance_winner);

      if (!Number.isInteger(realA) || !Number.isInteger(realB) || realA < 0 || realB < 0) {
        return res.status(400).json({ error: 'Hay un resultado inválido.' });
      }

      if (!wentPenalties && directOutcome === 'D') {
        return res.status(400).json({ error: 'Si el resultado final quedó empatado, tenés que marcar que fue a penales.' });
      }

      if (wentPenalties && directOutcome !== 'D') {
        return res.status(400).json({ error: 'Si fue a penales, el resultado del partido tiene que estar empatado después del alargue.' });
      }

      if (wentPenalties && (!Number.isInteger(realPenA) || !Number.isInteger(realPenB) || realPenA < 0 || realPenB < 0 || realPenA === realPenB)) {
        return res.status(400).json({ error: 'Cargá un resultado de penales válido y con ganador.' });
      }

      if (!['A', 'B'].includes(advanceWinner)) {
        return res.status(400).json({ error: 'Tenés que elegir quién avanzó.' });
      }

      const { error } = await supabase
        .from('matches')
        .update({
          real_a: realA,
          real_b: realB,
          went_penalties: wentPenalties,
          real_pen_a: wentPenalties ? realPenA : null,
          real_pen_b: wentPenalties ? realPenB : null,
          advance_winner: advanceWinner,
          locked: true,
        })
        .eq('id', matchId);

      if (error) {
        console.error(error);
        return res.status(500).json({ error: `No pude actualizar uno de los partidos: ${error.message || 'revisá si ejecutaste la migración SQL nueva'}` });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `Error inesperado al guardar resultados: ${error.message || error}` });
  }
};

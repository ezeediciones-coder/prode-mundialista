const { createClient } = require('@supabase/supabase-js');

function outcome(a, b) {
  if (a > b) return 'A';
  if (a < b) return 'B';
  return 'D';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { pin, results } = req.body || {};

  if (!process.env.ADMIN_PIN || pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ error: 'PIN de admin incorrecto.' });
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Faltan variables de entorno del servidor en Vercel.' });
  }

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'No hay resultados para guardar.' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    for (const item of results) {
      const matchId = Number(item.match_id);
      const realA = Number(item.real_a);
      const realB = Number(item.real_b);
      const wentPenalties = Boolean(item.went_penalties);
      const directOutcome = outcome(realA, realB);
      const advanceWinner = directOutcome === 'A' || directOutcome === 'B' ? directOutcome : item.advance_winner;

      if (!Number.isInteger(matchId) || !Number.isInteger(realA) || !Number.isInteger(realB) || realA < 0 || realB < 0) {
        return res.status(400).json({ error: 'Hay un resultado inválido.' });
      }

      if ((directOutcome === 'D' || wentPenalties) && !['A', 'B'].includes(advanceWinner)) {
        return res.status(400).json({ error: 'En partidos empatados o con penales tenés que elegir quién avanzó.' });
      }

      const { error } = await supabase
        .from('matches')
        .update({
          real_a: realA,
          real_b: realB,
          went_penalties: wentPenalties,
          advance_winner: advanceWinner,
          locked: true,
        })
        .eq('id', matchId);

      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'No pude actualizar uno de los partidos. Revisá si ejecutaste la migración SQL.' });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error inesperado al guardar resultados.' });
  }
};

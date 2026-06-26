import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPin = process.env.ADMIN_PIN;

const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDistribution(distribution, winnersCount) {
  const list = Array.isArray(distribution) ? distribution : [];

  const cleaned = Array.from({ length: winnersCount }, (_, index) => {
    const place = index + 1;
    const found = list.find((item) => Number(item.place) === place);

    return {
      place,
      percent: Math.max(0, toNumber(found?.percent, 0)),
    };
  });

  return cleaned;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!supabase) {
    return res.status(500).json({
      error: 'Faltan variables de entorno de Supabase en Vercel.',
    });
  }

  try {
    // =====================================================
    // LEER CONFIGURACIÓN DE PREMIOS
    // =====================================================
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('prode_settings')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        settings: data,
      });
    }

    // =====================================================
    // GUARDAR CONFIGURACIÓN DE PREMIOS
    // =====================================================
    if (req.method === 'POST') {
      const body = req.body || {};

      if (String(body.pin || '').trim() !== String(adminPin || '').trim()) {
        return res.status(401).json({
          error: 'PIN admin incorrecto.',
        });
      }

      const prizeEnabled = Boolean(body.prize_enabled);
      const prizePool = Math.max(0, toNumber(body.prize_pool, 0));
      const prizeCurrency = String(body.prize_currency || '$').trim() || '$';
      const winnersCount = Math.min(10, Math.max(1, Math.floor(toNumber(body.winners_count, 3))));
      const prizeDistribution = normalizeDistribution(body.prize_distribution, winnersCount);
      const prizeNote = String(body.prize_note || '').trim();

      const { data, error } = await supabase
        .from('prode_settings')
        .upsert({
          id: 'main',
          prize_enabled: prizeEnabled,
          prize_pool: prizePool,
          prize_currency: prizeCurrency,
          winners_count: winnersCount,
          prize_distribution: prizeDistribution,
          prize_note: prizeNote || 'El pozo se reparte entre los primeros puestos del ranking.',
        }, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        settings: data,
        message: 'Premios actualizados correctamente.',
      });
    }

    return res.status(405).json({
      error: 'Método no permitido.',
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || 'Error interno del servidor.',
    });
  }
}

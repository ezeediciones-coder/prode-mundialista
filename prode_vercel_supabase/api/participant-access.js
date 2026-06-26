import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPin = process.env.ADMIN_PIN;

const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

function normalizeName(value = '') {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanName(value = '') {
  return value.trim().replace(/\s+/g, ' ');
}

function generateCode() {
  return String(Math.floor(Math.random() * 900000 + 100000));
}

async function generateUniqueCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = generateCode();

    const { data, error } = await supabase
      .from('participants')
      .select('id')
      .eq('access_code', code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  return generateCode();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!supabase) {
    return res.status(500).json({
      error: 'Faltan variables de entorno de Supabase en Vercel.',
    });
  }

  try {
    const body = req.body || {};
    const action = body.action;

    // =====================================================
    // 1) SOLICITAR PARTICIPACIÓN
    // =====================================================
    if (action === 'request_access') {
      const name = cleanName(body.name || '');
      const nameKey = normalizeName(name);

      if (!name) {
        return res.status(400).json({ error: 'Escribí tu nombre.' });
      }

      const { data: existing, error: findError } = await supabase
        .from('participants')
        .select('*')
        .eq('name_key', nameKey)
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        return res.status(200).json({
          ok: true,
          participant: existing,
          status: existing.status,
          message:
            existing.status === 'approved'
              ? 'Ya estás aprobado. Ingresá con tu código de acceso.'
              : existing.status === 'rejected'
                ? 'Tu solicitud fue rechazada.'
                : 'Tu solicitud ya está pendiente de aprobación.',
        });
      }

      const { data: created, error: insertError } = await supabase
        .from('participants')
        .insert({
          name,
          name_key: nameKey,
          status: 'pending',
          requested_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insertError) throw insertError;

      return res.status(200).json({
        ok: true,
        participant: created,
        status: 'pending',
        message: 'Tu solicitud quedó pendiente. Esperá la aprobación del admin.',
      });
    }

    // =====================================================
    // 2) VALIDAR NOMBRE + CÓDIGO
    // =====================================================
    if (action === 'validate_access') {
      const name = cleanName(body.name || '');
      const nameKey = normalizeName(name);
      const code = String(body.code || '').trim();

      if (!name || !code) {
        return res.status(400).json({
          error: 'Ingresá tu nombre y tu código de acceso.',
        });
      }

      const { data: participant, error: findError } = await supabase
        .from('participants')
        .select('*')
        .eq('name_key', nameKey)
        .maybeSingle();

      if (findError) throw findError;

      if (!participant) {
        return res.status(404).json({
          error: 'No encontré una solicitud con ese nombre. Primero solicitá participar.',
        });
      }

      if (participant.status !== 'approved') {
        return res.status(403).json({
          error:
            participant.status === 'rejected'
              ? 'Tu solicitud fue rechazada.'
              : 'Tu solicitud todavía está pendiente de aprobación.',
          status: participant.status,
        });
      }

      if (String(participant.access_code || '').trim() !== code) {
        return res.status(401).json({
          error: 'El código no coincide con ese nombre.',
        });
      }

      return res.status(200).json({
        ok: true,
        participant,
        message: 'Acceso habilitado.',
      });
    }

    // =====================================================
    // 3) APROBAR PARTICIPANTE
    // =====================================================
    if (action === 'approve') {
      if (String(body.pin || '').trim() !== String(adminPin || '').trim()) {
        return res.status(401).json({ error: 'PIN admin incorrecto.' });
      }

      const participantId = body.participant_id;

      if (!participantId) {
        return res.status(400).json({ error: 'Falta participant_id.' });
      }

      const code = await generateUniqueCode();

      const { data: updated, error: updateError } = await supabase
        .from('participants')
        .update({
          status: 'approved',
          access_code: code,
          approved_at: new Date().toISOString(),
          rejected_at: null,
        })
        .eq('id', participantId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      return res.status(200).json({
        ok: true,
        participant: updated,
        message: `Participante aprobado. Código: ${code}`,
      });
    }

    // =====================================================
    // 4) RECHAZAR PARTICIPANTE
    // =====================================================
    if (action === 'reject') {
      if (String(body.pin || '').trim() !== String(adminPin || '').trim()) {
        return res.status(401).json({ error: 'PIN admin incorrecto.' });
      }

      const participantId = body.participant_id;

      if (!participantId) {
        return res.status(400).json({ error: 'Falta participant_id.' });
      }

      const { data: updated, error: updateError } = await supabase
        .from('participants')
        .update({
          status: 'rejected',
          access_code: null,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', participantId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      return res.status(200).json({
        ok: true,
        participant: updated,
        message: 'Participante rechazado.',
      });
    }

    return res.status(400).json({ error: 'Acción no válida.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error.message || 'Error interno del servidor.',
    });
  }
}

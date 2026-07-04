import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const ROUNDS = [
  { id: 'r32', title: '16avos de final', count: 16, start: 1 },
  { id: 'r16', title: '8vos de final', count: 8, start: 17 },
  { id: 'qf', title: 'Cuartos de final', count: 4, start: 25 },
  { id: 'sf', title: 'Semifinales', count: 2, start: 29 },
  { id: 'final', title: 'Final', count: 1, start: 31 },
];

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function outcome(a, b) {
  const nA = Number(a);
  const nB = Number(b);
  if (nA > nB) return 'A';
  if (nA < nB) return 'B';
  return 'D';
}

function sideName(match, side) {
  if (!match) return '';
  if (side === 'A') return match.team_a;
  if (side === 'B') return match.team_b;
  return '';
}

function penaltyWinner(a, b) {
  const nA = toIntOrNull(a);
  const nB = toIntOrNull(b);
  if (nA === null || nB === null) return null;
  if (nA > nB) return 'A';
  if (nB > nA) return 'B';
  return null;
}

function actualAdvance(match) {
  if (!match || match.real_a === null || match.real_b === null) return null;
  if (match.went_penalties) {
    return penaltyWinner(match.real_pen_a, match.real_pen_b) || match.advance_winner || null;
  }

  const direct = outcome(match.real_a, match.real_b);
  if (direct === 'A' || direct === 'B') return direct;
  return match.advance_winner || null;
}

function scorePrediction(prediction, match) {
  if (!match || match.real_a === null || match.real_b === null) {
    return {
      points: 0,
      scorePoints: 0,
      penaltyPoints: 0,
      exact: false,
      advanceHit: false,
      penaltyExact: false,
      label: 'Pendiente',
    };
  }

  const pA = toIntOrNull(prediction.pred_a);
  const pB = toIntOrNull(prediction.pred_b);
  const rA = toIntOrNull(match.real_a);
  const rB = toIntOrNull(match.real_b);
  const realAdvance = actualAdvance(match);

  if ([pA, pB, rA, rB].some((x) => x === null) || !realAdvance) {
    return {
      points: 0,
      scorePoints: 0,
      penaltyPoints: 0,
      exact: false,
      advanceHit: false,
      penaltyExact: false,
      label: 'Sin datos',
    };
  }

  const predictedOutcome = outcome(pA, pB);
  const predictedAdvance = prediction.advance_pick || (predictedOutcome === 'A' || predictedOutcome === 'B' ? predictedOutcome : null);
  const advanceHit = predictedAdvance === realAdvance;
  const matchExact = pA === rA && pB === rB;
  const scoreOutcomeHit = outcome(pA, pB) === outcome(rA, rB);

  if (match.went_penalties) {
    const pPenA = toIntOrNull(prediction.pred_pen_a);
    const pPenB = toIntOrNull(prediction.pred_pen_b);
    const rPenA = toIntOrNull(match.real_pen_a);
    const rPenB = toIntOrNull(match.real_pen_b);
    const predictedDraw = predictedOutcome === 'D';
    const penaltyExact =
      predictedDraw &&
      pPenA !== null &&
      pPenB !== null &&
      rPenA !== null &&
      rPenB !== null &&
      pPenA === rPenA &&
      pPenB === rPenB &&
      advanceHit;

    if (predictedDraw) {
      const scorePoints = matchExact ? 6 : 3;
      const penaltyPoints = penaltyExact ? 6 : advanceHit ? 3 : 0;
      const points = scorePoints + penaltyPoints;
      const label = penaltyExact
        ? `${scorePoints} por empate${matchExact ? ' exacto' : ''} + 6 por penales exactos`
        : advanceHit
          ? `${scorePoints} por empate${matchExact ? ' exacto' : ''} + 3 por clasificado`
          : `${scorePoints} por empate${matchExact ? ' exacto' : ''}`;
      return { points, scorePoints, penaltyPoints, exact: matchExact, advanceHit, penaltyExact, label };
    }

    if (advanceHit) {
      return {
        points: 3,
        scorePoints: 0,
        penaltyPoints: 3,
        exact: false,
        advanceHit: true,
        penaltyExact: false,
        label: 'Acertó quién avanza',
      };
    }

    return { points: 0, scorePoints: 0, penaltyPoints: 0, exact: false, advanceHit: false, penaltyExact: false, label: 'No acertó' };
  }

  if (matchExact) {
    return { points: 6, scorePoints: 6, penaltyPoints: 0, exact: true, advanceHit, penaltyExact: false, label: 'Resultado exacto' };
  }

  if (scoreOutcomeHit || advanceHit) {
    return {
      points: 3,
      scorePoints: 3,
      penaltyPoints: 0,
      exact: false,
      advanceHit,
      penaltyExact: false,
      label: advanceHit ? 'Acertó quién avanza' : 'Acertó tendencia',
    };
  }

  return { points: 0, scorePoints: 0, penaltyPoints: 0, exact: false, advanceHit: false, penaltyExact: false, label: 'No acertó' };
}

function safeNumberValue(value) {
  if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 99)) return null;
  return value;
}

function getStartsAtDate(match) {
  if (!match?.starts_at) return null;
  const d = new Date(match.starts_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

function predictionClosesAt(match) {
  const starts = getStartsAtDate(match);
  return starts ? new Date(starts.getTime() - 60 * 60 * 1000) : null;
}

function isPredictionClosed(match) {
  if (!match) return true;
  if (match.locked || match.real_a !== null || match.real_b !== null) return true;
  const closes = predictionClosesAt(match);
  return closes ? Date.now() >= closes.getTime() : false;
}

function formatShortDateTime(match) {
  const d = getStartsAtDate(match);
  if (!d) return 'Sin horario cargado';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatMatchDatePill(match) {
  const d = getStartsAtDate(match);
  if (!d) return 'Sin horario';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function teamFlag(teamName = '') {
  const key = teamName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (!key || key.includes('grupo') || key.includes('equipo')) return '⚽';

  const flags = {
    'sudafrica': '🇿🇦',
    'canada': '🇨🇦',
    'brasil': '🇧🇷',
    'japon': '🇯🇵',
    'alemania': '🇩🇪',
    'paraguay': '🇵🇾',
    'paises bajos': '🇳🇱',
    'marruecos': '🇲🇦',
    'costa de marfil': '🇨🇮',
    'noruega': '🇳🇴',
    'francia': '🇫🇷',
    'suecia': '🇸🇪',
    'mexico': '🇲🇽',
    'estados unidos': '🇺🇸',
    'bosnia y herzegovina': '🇧🇦',
    'espana': '🇪🇸',
    'suiza': '🇨🇭',
    'australia': '🇦🇺',
    'argentina': '🇦🇷',
    'cabo verde': '🇨🇻',
    'croacia': '🇭🇷',
    'ghana': '🇬🇭',
    'panama': '🇵🇦',
    'portugal': '🇵🇹',
    'colombia': '🇨🇴',
    'egipto': '🇪🇬',
    'iran': '🇮🇷',
    'belgica': '🇧🇪',
    'inglaterra': '🏴',
    'rd congo': '🇨🇩',
    'republica democratica del congo': '🇨🇩',
    'senegal': '🇸🇳',
    'argelia': '🇩🇿',
    'uruguay': '🇺🇾',
  };

  return flags[key] || '⚽';
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function callParticipantAccess(payload) {
  const response = await fetch('/api/participant-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'No pude procesar la solicitud.');
  }

  return body;
}

async function fetchPrizeSettingsFromApi() {
  const response = await fetch(`/api/prode-settings?t=${Date.now()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'No pude cargar la configuración de premios.');
  }

  return body.settings || null;
}

const DEFAULT_PRODE_SETTINGS = {
  id: 'main',
  prize_enabled: true,
  prize_pool: 0,
  prize_currency: '$',
  winners_count: 3,
  prize_distribution: [
    { place: 1, percent: 50 },
    { place: 2, percent: 30 },
    { place: 3, percent: 20 },
  ],
  prize_note: 'El pozo se reparte entre los primeros puestos del ranking.',
};

function normalizePrizeSettings(row) {
  if (!row) return DEFAULT_PRODE_SETTINGS;

  const winnersCount = Math.min(10, Math.max(1, Number(row.winners_count || 3)));
  const rawDistribution = Array.isArray(row.prize_distribution)
    ? row.prize_distribution
    : DEFAULT_PRODE_SETTINGS.prize_distribution;

  const prizeDistribution = Array.from({ length: winnersCount }, (_, index) => {
    const place = index + 1;
    const found = rawDistribution.find((item) => Number(item.place) === place);
    return {
      place,
      percent: Number(found?.percent || 0),
    };
  });

  return {
    ...DEFAULT_PRODE_SETTINGS,
    ...row,
    prize_enabled: Boolean(row.prize_enabled),
    prize_pool: Number(row.prize_pool || 0),
    prize_currency: row.prize_currency || '$',
    winners_count: winnersCount,
    prize_distribution: prizeDistribution,
    prize_note: row.prize_note || DEFAULT_PRODE_SETTINGS.prize_note,
  };
}

function formatPrizeAmount(settings, amount) {
  const currency = settings?.prize_currency || '$';
  const value = Number(amount || 0);
  return `${currency}${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function formatAuditTimestamp(value) {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatPredictionDataForAudit(data, match) {
  if (!data) return 'Sin datos';
  const a = data.pred_a ?? '-';
  const b = data.pred_b ?? '-';
  const advance = data.advance_pick ? sideName(match, data.advance_pick) : '';
  const penA = data.pred_pen_a;
  const penB = data.pred_pen_b;
  const penalties = penA !== null && penA !== undefined && penB !== null && penB !== undefined
    ? ` · penales ${penA}-${penB}`
    : '';
  return `${a}-${b}${advance ? ` · avanza ${advance}` : ''}${penalties}`;
}

function formatRealResultDataForAudit(data, match) {
  if (!data) return 'Sin datos';
  const a = data.real_a ?? '-';
  const b = data.real_b ?? '-';
  const advance = data.advance_winner ? sideName(match, data.advance_winner) : '';
  const penalties = data.went_penalties
    ? ` · penales ${data.real_pen_a ?? '-'}-${data.real_pen_b ?? '-'}`
    : '';
  return `${a}-${b}${penalties}${advance ? ` · avanzó ${advance}` : ''}`;
}

function buildPrizeRows(settings) {
  const normalized = normalizePrizeSettings(settings);
  return normalized.prize_distribution.map((item) => {
    const amount = normalized.prize_pool > 0 ? (normalized.prize_pool * Number(item.percent || 0)) / 100 : 0;
    return {
      place: Number(item.place),
      percent: Number(item.percent || 0),
      amount,
    };
  });
}

function defaultDistributionForWinners(count) {
  if (Number(count) === 3) {
    return [
      { place: 1, percent: 50 },
      { place: 2, percent: 30 },
      { place: 3, percent: 20 },
    ];
  }

  if (Number(count) === 5) {
    return [
      { place: 1, percent: 40 },
      { place: 2, percent: 25 },
      { place: 3, percent: 20 },
      { place: 4, percent: 10 },
      { place: 5, percent: 5 },
    ];
  }

  const base = Math.floor(100 / Number(count));
  let remainder = 100 - base * Number(count);
  return Array.from({ length: Number(count) }, (_, index) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { place: index + 1, percent: base + extra };
  });
}

function whatsappLinkForName(name) {
  const clean = name.trim().replace(/\s+/g, ' ');
  const message = `Hola, soy ${clean}. Me gustaría solicitar mi código para participar del prode familiar.`;
  return `https://wa.me/5493755659363?text=${encodeURIComponent(message)}`;
}

async function callProdeSettings(payload) {
  const response = await fetch('/api/prode-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'No pude guardar la configuración de premios.');
  }

  return body;
}

function PointsTooltip() {
  return (
    <span className="tooltipWrap" tabIndex="0" title="Primero suma el resultado del partido. Si va a penales, podés sumar extra.">
      <span className="infoDot">?</span>
      <span className="tooltipBox">
        <b>Reglas simples</b><br />
        Primero se suman puntos por el resultado del partido.<br />
        Exacto: +6.<br />
        Acierta quién pasa, pero no exacto: +3.<br />
        No acierta quién pasa: 0.<br /><br />
        <b>Si hay penales</b>, podés sumar extra:<br />
        Acierta quién pasa por penales: +3 extra.<br />
        Penales exactos: +6 extra.<br /><br />
        El alargue cuenta como parte del partido.
      </span>
    </span>
  );
}

function RulesPanel({ compact = false }) {
  return (
    <section className={`panel rulesPanel ${compact ? 'compactRules' : ''}`}>
      <div className="sectionTitle">
        <h2>Reglas del prode <PointsTooltip /></h2>
        <p>Primero sumás por el partido. Si va a penales, podés sumar puntos extra.</p>
      </div>

      <div className="rulesGrid">
        <div className="ruleCard">
          <strong>1. Partido</strong>
          <span>Resultado exacto: <b>+6</b></span>
          <span>Acierta quién pasa, pero no exacto: <b>+3</b></span>
          <span>No acierta quién pasa: <b>0</b></span>
        </div>

        <div className="ruleCard">
          <strong>2. Penales</strong>
          <span>Solo cuentan si el partido termina empatado después del alargue.</span>
          <span>Acierta quién pasa por penales: <b>+3 extra</b></span>
          <span>Resultado exacto de penales: <b>+6 extra</b></span>
        </div>

        <div className="ruleCard">
          <strong>3. Alargue</strong>
          <span>El alargue cuenta como parte del partido.</span>
          <span>Ejemplo: si iban 1-1 y termina 2-1 en alargue, el resultado real es <b>2-1</b>.</span>
          <span>En ese caso no se cargan penales.</span>
        </div>
      </div>
    </section>
  );
}

function useProdeData({ admin = false } = {}) {
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_PRODE_SETTINGS);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    if (!supabase) {
      setStatus('Faltan las variables de Supabase. Revisá las variables de entorno en Vercel.');
      setLoading(false);
      return;
    }

    setLoading(true);

    const participantColumns = admin
      ? '*'
      : 'id,name,name_key,status,created_at';

    const [mRes, pRes, prRes, auditRes, settingsRes] = await Promise.allSettled([
      supabase.from('matches').select('*').order('match_no', { ascending: true }),
      supabase.from('participants').select(participantColumns).order('created_at', { ascending: true }),
      supabase.from('predictions').select('*'),
      supabase
        .from('prode_audit_log')
        .select('id,created_at,event_type,table_name,participant_id,participant_name,match_id,match_no,team_a,team_b,old_data,new_data')
        .order('created_at', { ascending: false })
        .limit(250),
      fetchPrizeSettingsFromApi(),
    ]);

    const matchesResult = mRes.status === 'fulfilled' ? mRes.value : { error: mRes.reason };
    const participantsResult = pRes.status === 'fulfilled' ? pRes.value : { error: pRes.reason };
    const predictionsResult = prRes.status === 'fulfilled' ? prRes.value : { error: prRes.reason };
    const auditResult = auditRes.status === 'fulfilled' ? auditRes.value : { error: auditRes.reason };
    const settingsResult = settingsRes.status === 'fulfilled' ? settingsRes.value : null;

    if (matchesResult.error || participantsResult.error || predictionsResult.error) {
      setStatus('No pude cargar los datos. Revisá Supabase y las políticas RLS.');
      console.error(matchesResult.error || participantsResult.error || predictionsResult.error);
    } else {
      setMatches(matchesResult.data || []);
      setParticipants(participantsResult.data || []);
      setPredictions(predictionsResult.data || []);
      setAuditLog(auditResult.error ? [] : (auditResult.data || []));
      setSettings(normalizePrizeSettings(settingsResult));
      setStatus('');
    }

    if (auditRes.status === 'rejected' || auditResult.error) {
      console.error('No pude cargar auditoría desde prode_audit_log:', auditResult.error || auditRes.reason);
    }

    if (settingsRes.status === 'rejected') {
      console.error('No pude cargar premios desde /api/prode-settings:', settingsRes.reason);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel(admin ? 'prode-live-admin' : 'prode-live-public')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prode_audit_log' }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [admin]);

  return { matches, participants, predictions, auditLog, settings, status, setStatus, loading, loadAll };
}

function Header({ admin = false }) {
  return (
    <section className={`hero ${admin ? 'adminHero' : ''}`}>
      <div className="heroGlow"></div>
      <div className="heroText">
        <p className="eyebrow">🏆 Familia · Mundial · Prode</p>
        <h1>{admin ? 'Panel Admin' : 'Prode 8vos'}</h1>
        <p>{admin ? 'Cargá los resultados reales, penales y clasificados.' : 'Completá tus 8vos de final y peleá el ranking familiar en vivo.'}</p>
        <div className="rules">
          <span>Partido: +6 o +3</span>
          <span>Penales suman extra</span>
          <span>Alargue cuenta</span>
        </div>
      </div>
      <div className="heroCard" aria-hidden="true" style={{ overflow: 'hidden', padding: 0 }}>
        <img
          src="/hero-messi-prode.jpg"
          alt=""
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            objectPosition: 'center',
            borderRadius: 'inherit',
          }}
        />
      </div>
    </section>
  );
}

function RankingPanel({ participants, predictions, matches, settings }) {
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const prizeSettings = normalizePrizeSettings(settings);
  const prizeRows = useMemo(() => buildPrizeRows(prizeSettings), [prizeSettings]);

  const ranking = useMemo(() => {
    return participants
      .filter((participant) => !participant.status || participant.status === 'approved')
      .map((participant) => {
        const userPredictions = predictions.filter((p) => p.participant_id === participant.id);
        let points = 0;
        let exacts = 0;
        let advanceOnly = 0;
        let played = 0;

        userPredictions.forEach((prediction) => {
          const match = matches.find((m) => m.id === prediction.match_id);
          if (!match || match.real_a === null || match.real_b === null) return;
          const result = scorePrediction(prediction, match);
          points += result.points;
          if (result.exact || result.penaltyExact) exacts += 1;
          if (result.advanceHit && !result.exact && !result.penaltyExact) advanceOnly += 1;
          played += 1;
        });

        return {
          ...participant,
          points,
          exacts,
          advanceOnly,
          played,
          predictionsCount: userPredictions.length,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.exacts !== a.exacts) return b.exacts - a.exacts;
        if (b.advanceOnly !== a.advanceOnly) return b.advanceOnly - a.advanceOnly;
        return a.name.localeCompare(b.name);
      });
  }, [participants, predictions, matches]);

  const selectedParticipant = ranking.find((p) => p.id === selectedParticipantId) || null;

  const visiblePredictions = useMemo(() => {
    if (!selectedParticipantId) return [];

    return predictions
      .filter((prediction) => prediction.participant_id === selectedParticipantId)
      .map((prediction) => {
        const match = matches.find((m) => m.id === prediction.match_id);

        // Privacidad: no mostramos el prode hasta que el admin cargue el resultado real.
        if (!match || match.real_a === null || match.real_b === null) return null;

        const result = scorePrediction(prediction, match);

        return {
          prediction,
          match,
          result,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.match.match_no - b.match.match_no);
  }, [selectedParticipantId, predictions, matches]);

  function openParticipantDetails(row) {
    setSelectedParticipantId(row.id);
  }

  function closeParticipantDetails() {
    setSelectedParticipantId(null);
  }

  return (
    <section className="panel rankingPanel">
      <div className="sectionTitle">
        <h2>Ranking familiar <PointsTooltip /></h2>
        <p>En empate, gana quien tenga más exactos y después más clasificados acertados.</p>
      </div>

      {prizeSettings.prize_enabled && (
        <div className="rulesGrid prizeGrid">
          <div className="ruleCard">
            <strong>🏆 Pozo acumulado</strong>
            <span><b>{formatPrizeAmount(prizeSettings, prizeSettings.prize_pool)}</b></span>
            <span>{prizeSettings.prize_note}</span>
          </div>

          {prizeRows.map((row) => (
            <div key={row.place} className="ruleCard">
              <strong>{row.place}° puesto</strong>
              <span><b>{row.percent}%</b> del pozo</span>
              <span>{formatPrizeAmount(prizeSettings, row.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rankingList">
        {ranking.length === 0 && <p>Todavía no hay participantes registrados.</p>}
        {ranking.map((row, index) => (
          <div
            key={row.id}
            className={`rankRow rank${index + 1}`}
            role="button"
            tabIndex="0"
            onClick={() => openParticipantDetails(row)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openParticipantDetails(row);
              }
            }}
            title="Ver pronósticos visibles de este participante"
            style={{ cursor: 'pointer' }}
          >
            <div className="position">{index + 1}</div>
            <div className="rankInfo">
              <strong>{row.name}</strong>
              <span>{row.exacts} exactos · {row.advanceOnly} clasificados · {row.predictionsCount} pronósticos</span>
              <small>Ver prodes finalizados</small>
            </div>
            <div className="points">
              <span>{row.points} pts</span>
              {prizeSettings.prize_enabled && index < prizeSettings.winners_count && prizeRows[index] && (
                <small>{formatPrizeAmount(prizeSettings, prizeRows[index].amount)}</small>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedParticipant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pronósticos visibles de ${selectedParticipant.name}`}
          onClick={closeParticipantDetails}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 100%)',
              maxHeight: '88vh',
              overflowY: 'auto',
              margin: 0,
            }}
          >
            <div className="sectionTitle">
              <div>
                <h2>Pronósticos de {selectedParticipant.name}</h2>
                <p>Solo se muestran partidos que ya tienen resultado real cargado.</p>
              </div>
              <button className="ghost" type="button" onClick={closeParticipantDetails}>
                Cerrar
              </button>
            </div>

            {visiblePredictions.length === 0 ? (
              <div className="status">
                Todavía no hay pronósticos visibles para este participante. Se van a mostrar cuando el admin cargue resultados reales.
              </div>
            ) : (
              <div className="resultsTable">
                {visiblePredictions.map(({ prediction, match, result }) => (
                  <div key={prediction.id} className="resultRow">
                    <span>#{match.match_no}</span>
                    <strong>
                      {teamFlag(match.team_a)} {match.team_a} vs {teamFlag(match.team_b)} {match.team_b}
                    </strong>
                    <em>
                      Prode: {prediction.pred_a} - {prediction.pred_b}
                      {outcome(prediction.pred_a, prediction.pred_b) === 'D' && prediction.advance_pick
                        ? ` · avanzaba ${sideName(match, prediction.advance_pick)}`
                        : ''}
                      {prediction.pred_pen_a !== null && prediction.pred_pen_b !== null
                        ? ` · penales ${prediction.pred_pen_a}-${prediction.pred_pen_b}`
                        : ''}
                      <br />
                      Real: {formatResult(match)}
                      <br />
                      <b>Sumó: {result.points} pts</b> · {result.label}
                    </em>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatResult(m) {
  const adv = actualAdvance(m);
  if (m.real_a === null || m.real_b === null) return 'Pendiente';
  const base = `${m.real_a} - ${m.real_b}`;
  const pens = m.went_penalties
    ? ` · penales ${m.real_pen_a ?? '-'}-${m.real_pen_b ?? '-'}`
    : '';
  return `${base}${pens}${adv ? ` · avanzó ${sideName(m, adv)}` : ''}`;
}


function TransparencyPanel({ participants, predictions, matches, auditLog }) {
  const approvedParticipants = participants.filter((participant) => !participant.status || participant.status === 'approved');
  const totalMatches = matches.length || 16;

  const participantRows = useMemo(() => {
    return approvedParticipants
      .map((participant) => {
        const userPredictions = predictions.filter((prediction) => prediction.participant_id === participant.id);
        const dates = userPredictions
          .map((prediction) => prediction.updated_at)
          .filter(Boolean)
          .map((value) => new Date(value))
          .filter((date) => !Number.isNaN(date.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());

        return {
          participant,
          count: userPredictions.length,
          first: dates[0] || null,
          last: dates[dates.length - 1] || null,
        };
      })
      .sort((a, b) => {
        if (!a.last && !b.last) return a.participant.name.localeCompare(b.participant.name);
        if (!a.last) return 1;
        if (!b.last) return -1;
        return b.last.getTime() - a.last.getTime();
      });
  }, [approvedParticipants, predictions]);

  const visibleAuditRows = useMemo(() => {
    return (auditLog || []).slice(0, 80).map((item) => {
      const match = matches.find((m) => m.id === item.match_id) || matches.find((m) => m.match_no === item.match_no) || {
        match_no: item.match_no,
        team_a: item.team_a,
        team_b: item.team_b,
      };
      const matchFinished = match?.real_a !== null && match?.real_a !== undefined && match?.real_b !== null && match?.real_b !== undefined;
      let title = '';
      let detail = '';

      if (item.table_name === 'predictions') {
        const eventType = String(item.event_type || '').toUpperCase();
        const action = eventType.includes('INSERT') || eventType === 'SNAPSHOT_INICIAL'
          ? 'cargó'
          : eventType.includes('UPDATE')
            ? 'editó'
            : eventType.includes('DELETE')
              ? 'eliminó'
              : 'modificó';

        title = `${item.participant_name || 'Participante'} ${action} su prode del Partido ${item.match_no}`;
        detail = matchFinished
          ? `Prode visible: ${formatPredictionDataForAudit(item.new_data || item.old_data, match)}`
          : 'Contenido oculto hasta que el admin cargue el resultado real de ese partido.';
      } else if (item.table_name === 'matches') {
        title = `Admin cargó o modificó el resultado real del Partido ${item.match_no}`;
        detail = `Resultado: ${formatRealResultDataForAudit(item.new_data, match)}`;
      } else {
        title = `${item.event_type} en ${item.table_name}`;
        detail = 'Cambio registrado en auditoría.';
      }

      return { ...item, match, title, detail };
    });
  }, [auditLog, matches]);

  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Transparencia de cargas</h2>
        <p>Todos pueden ver cuándo quedó guardado cada prode. Los resultados elegidos se muestran recién cuando el partido ya tiene resultado real cargado.</p>
      </div>

      <div className="resultsTable">
        {participantRows.map((row) => (
          <div key={row.participant.id} className="resultRow">
            <span>{row.count}/{totalMatches}</span>
            <strong>{row.participant.name}</strong>
            <em>
              {row.count === 0
                ? 'Todavía no registró pronósticos.'
                : `Primera carga: ${formatAuditTimestamp(row.first)} · Última modificación: ${formatAuditTimestamp(row.last)}`}
            </em>
          </div>
        ))}
      </div>

      <div className="sectionTitle" style={{ marginTop: 24 }}>
        <h3>Últimos movimientos auditados</h3>
        <p>La auditoría empezó desde que fue activada. Los movimientos anteriores se ven por “última modificación” en la tabla de arriba.</p>
      </div>

      <div className="resultsTable">
        {visibleAuditRows.length === 0 && (
          <div className="resultRow">
            <span>—</span>
            <strong>Sin movimientos nuevos auditados</strong>
            <em>Cuando alguien edite un prode o el admin cargue un resultado real, aparecerá acá.</em>
          </div>
        )}

        {visibleAuditRows.map((item) => (
          <div key={item.id} className="resultRow">
            <span>{formatAuditTimestamp(item.created_at)}</span>
            <strong>{item.title}</strong>
            <em>{item.detail}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultsPanel({ matches }) {
  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Resultados reales</h2>
        <p>Resultado del partido, penales si hubo y equipo que avanzó.</p>
      </div>

      <div className="resultsTable">
        {matches.map((m) => (
          <div key={m.id} className="resultRow">
            <span>#{m.match_no}</span>
            <strong>{m.team_a} vs {m.team_b}</strong>
            <em>{formatResult(m)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function getPredictionForMatch(match, participant, predictions) {
  if (!match || !participant) return null;
  return predictions.find((p) => p.participant_id === participant.id && p.match_id === match.id) || null;
}

function getFormScore(formScores, matchId) {
  return formScores[matchId] || { a: '', b: '', advance: '', penA: '', penB: '' };
}

function BracketPlaceholder({ label }) {
  return (
    <article className="bracketMatch placeholderMatch">
      <div className="bracketTeam placeholderTeam"><span>⚽ {label}</span></div>
      <div className="bracketTeam placeholderTeam"><span>⚽ Ganador pendiente</span></div>
    </article>
  );
}

function MatchScorePreview({ prediction, match }) {
  if (!prediction || prediction.a === '' || prediction.b === '') {
    return <div className="scorePreview neutral">Regla: exacto +6 · clasificado +3 · penales pueden sumar</div>;
  }

  if (match.real_a === null || match.real_b === null) {
    return <div className="scorePreview neutral">Cuando se cargue el real: alargue cuenta; si hay penales, pueden sumar resultado + definición.</div>;
  }

  const pseudoPrediction = {
    pred_a: prediction.a,
    pred_b: prediction.b,
    pred_pen_a: prediction.penA,
    pred_pen_b: prediction.penB,
    advance_pick: prediction.advance,
  };
  const result = scorePrediction(pseudoPrediction, match);
  return <div className={`scorePreview pts${result.points}`}>Este partido suma: <b>{result.points} pts</b> · {result.label}</div>;
}

function MatchCardPublic({ match, formScores, updateScore, updateAdvance, updatePenaltyScore, participant, predictions }) {
  const saved = getPredictionForMatch(match, participant, predictions);
  const [editing, setEditing] = useState(false);
  const locked = isPredictionClosed(match);
  const canEdit = !locked && (!saved || editing);
  const current = getFormScore(formScores, match.id);
  const predA = current.a !== '' ? current.a : saved?.pred_a ?? '';
  const predB = current.b !== '' ? current.b : saved?.pred_b ?? '';
  const predPenA = current.penA !== '' ? current.penA : saved?.pred_pen_a ?? '';
  const predPenB = current.penB !== '' ? current.penB : saved?.pred_pen_b ?? '';
  const predOutcome = predA !== '' && predB !== '' ? outcome(predA, predB) : '';
  const advancePick = predOutcome === 'A' || predOutcome === 'B' ? predOutcome : (current.advance || saved?.advance_pick || '');
  const realAdvance = actualAdvance(match);

  return (
    <article className={`bracketMatch ${locked ? 'locked' : ''} ${saved ? 'hasSavedPrediction' : ''}`}>
      <div className="matchLabelRow">
        <div className="matchLabel">Partido {match.match_no} · {formatMatchDatePill(match)}</div>
        {saved && !locked && !editing && (
          <button className="editPredictionButton" type="button" onClick={() => setEditing(true)} title="Editar este prode antes del cierre">
            ✏️ Editar
          </button>
        )}
        {saved && editing && !locked && <span className="editingPill">Editando</span>}
        {locked && <span className="closedPill">Cerrado</span>}
      </div>

      <div className="matchTimeHint">
        Editable hasta 1 hora antes del partido.
      </div>

      <div className="bracketHead">
        <span>Equipo</span>
        <span>Mi prode</span>
        <span>Real</span>
      </div>

      <div className={`bracketTeam ${advancePick === 'A' ? 'picked' : ''} ${realAdvance === 'A' ? 'advanced' : ''}`}>
        <span className="teamName">{teamFlag(match.team_a)} {match.team_a}</span>
        <input aria-label={`Pronóstico ${match.team_a}`} inputMode="numeric" value={predA} onChange={(e) => updateScore(match.id, 'a', e.target.value)} disabled={!canEdit} />
        <span className="realBox">{match.real_a ?? '-'}</span>
      </div>

      <div className={`bracketTeam ${advancePick === 'B' ? 'picked' : ''} ${realAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{teamFlag(match.team_b)} {match.team_b}</span>
        <input aria-label={`Pronóstico ${match.team_b}`} inputMode="numeric" value={predB} onChange={(e) => updateScore(match.id, 'b', e.target.value)} disabled={!canEdit} />
        <span className="realBox">{match.real_b ?? '-'}</span>
      </div>

      <div className="advanceLine">
        {predOutcome === 'D' ? (
          <>
            <label>
              Avanza por penales:
              <select value={advancePick} onChange={(e) => updateAdvance(match.id, e.target.value)} disabled={!canEdit}>
                <option value="">Elegir</option>
                <option value="A">{match.team_a}</option>
                <option value="B">{match.team_b}</option>
              </select>
            </label>
            <div className="penaltyGrid">
              <span>Penales pronosticados</span>
              <input aria-label={`Penales ${match.team_a}`} inputMode="numeric" placeholder="4" value={predPenA} onChange={(e) => updatePenaltyScore(match.id, 'penA', e.target.value)} disabled={!canEdit} />
              <input aria-label={`Penales ${match.team_b}`} inputMode="numeric" placeholder="2" value={predPenB} onChange={(e) => updatePenaltyScore(match.id, 'penB', e.target.value)} disabled={!canEdit} />
            </div>
          </>
        ) : predOutcome ? (
          <span>Avanza en tu prode: <b>{sideName(match, advancePick)}</b></span>
        ) : (
          <span>Completá el resultado para definir quién avanza.</span>
        )}
      </div>

      {saved && !editing && !locked && <div className="savedHint">Prode guardado. Tocá el lápiz para modificarlo antes del cierre.</div>}
      {locked && <div className="savedHint lockedHint">Este partido ya no se puede editar. Tu prode queda visible.</div>}
      {match.went_penalties && <div className="penaltyBadge">Definido por penales {match.real_pen_a ?? '-'}-{match.real_pen_b ?? '-'}</div>}
    </article>
  );
}

function MatchCardAdmin({ match, adminResults, updateAdminResult, updatePenalty, updateRealAdvance, updateAdminPenaltyScore, clearAdminMatchResult, adminTeams, updateTeamName, dirtyResults }) {
  const current = adminResults[match.id] || { a: '', b: '', penalties: false, advance: '', penA: '', penB: '' };
  const teamNames = adminTeams[match.id] || { teamA: match.team_a, teamB: match.team_b, startsAt: isoToDatetimeLocal(match.starts_at) };
  const teamA = teamNames.teamA ?? match.team_a;
  const teamB = teamNames.teamB ?? match.team_b;
  const startsAt = teamNames.startsAt ?? isoToDatetimeLocal(match.starts_at);
  const realOutcome = current.a !== '' && current.b !== '' ? outcome(current.a, current.b) : '';
  const penWinner = penaltyWinner(current.penA, current.penB);
  const inferredAdvance = current.penalties ? (penWinner || current.advance) : (realOutcome === 'A' || realOutcome === 'B' ? realOutcome : current.advance);
  const isDirty = Boolean(dirtyResults?.[match.id]);
  const isClearPending = Boolean(current.clear);

  return (
    <article className="bracketMatch adminMatch">
      <div className="matchLabel">Partido {match.match_no} · {formatMatchDatePill(match)}</div>
      {isDirty && <div className={`adminEditBadge ${isClearPending ? 'clearPending' : ''}`}>{isClearPending ? 'Pendiente al guardar' : 'Cambio sin guardar'}</div>}
      <div className="teamEditGrid">
        <label>
          Equipo A
          <input value={teamA} onChange={(e) => updateTeamName(match.id, 'teamA', e.target.value)} />
        </label>
        <label>
          Equipo B
          <input value={teamB} onChange={(e) => updateTeamName(match.id, 'teamB', e.target.value)} />
        </label>
        <label className="kickoffField">
          Inicio del partido
          <input type="datetime-local" value={startsAt} onChange={(e) => updateTeamName(match.id, 'startsAt', e.target.value)} />
        </label>
      </div>
      <div className="matchTimeHint adminTimeHint">Se bloquea 1 hora antes: {startsAt ? new Date(startsAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sin horario'}</div>
      <div className="bracketHead">
        <span>Equipo</span>
        <span>Real</span>
      </div>

      <div className={`bracketTeam ${inferredAdvance === 'A' ? 'advanced' : ''}`}>
        <span className="teamName">{teamFlag(teamA)} {teamA}</span>
        <input aria-label={`Real ${teamA}`} inputMode="numeric" value={current.a} onChange={(e) => updateAdminResult(match.id, 'a', e.target.value)} />
      </div>

      <div className={`bracketTeam ${inferredAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{teamFlag(teamB)} {teamB}</span>
        <input aria-label={`Real ${teamB}`} inputMode="numeric" value={current.b} onChange={(e) => updateAdminResult(match.id, 'b', e.target.value)} />
      </div>

      <label className="penaltyCheck">
        <input type="checkbox" checked={Boolean(current.penalties)} onChange={(e) => updatePenalty(match.id, e.target.checked)} />
        Fue a penales
      </label>

      {current.penalties && (
        <div className="penaltyAdminBlock">
          <div className="penaltyGrid adminPenaltyGrid">
            <span>Resultado penales reales</span>
            <input aria-label={`Penales reales ${match.team_a}`} inputMode="numeric" placeholder="4" value={current.penA} onChange={(e) => updateAdminPenaltyScore(match.id, 'penA', e.target.value)} />
            <input aria-label={`Penales reales ${match.team_b}`} inputMode="numeric" placeholder="2" value={current.penB} onChange={(e) => updateAdminPenaltyScore(match.id, 'penB', e.target.value)} />
          </div>
          {!penWinner && (
            <label className="advanceLine adminAdvance">
              Avanzó:
              <select value={current.advance || ''} onChange={(e) => updateRealAdvance(match.id, e.target.value)}>
                <option value="">Elegir</option>
                <option value="A">{teamA}</option>
                <option value="B">{teamB}</option>
              </select>
            </label>
          )}
        </div>
      )}

      {!current.penalties && realOutcome === 'D' && (
        <div className="advanceLine adminAdvance warningLine">
          Si el resultado final quedó empatado después del alargue, marcá “Fue a penales” y cargá la definición.
        </div>
      )}

      <button
        className="ghost smallClear"
        type="button"
        onClick={() => clearAdminMatchResult(match.id)}
        title="Deja este partido sin resultado real y vuelve a estado pendiente"
      >
        Limpiar resultado / dejar pendiente
      </button>
    </article>
  );
}

function BracketBoard({ matches, mode, formScores, updateScore, updateAdvance, updatePenaltyScore, participant, predictions, adminResults, updateAdminResult, updatePenalty, updateRealAdvance, updateAdminPenaltyScore, clearAdminMatchResult, adminTeams, updateTeamName, dirtyResults }) {
  const byMatchNo = useMemo(() => {
    const map = new Map();
    matches.forEach((m) => map.set(m.match_no, m));
    return map;
  }, [matches]);

  return (
    <section className="bracketShell">
      <div className="bracketScroller">
        <div className="bracketBoard">
          {ROUNDS.map((round) => (
            <div key={round.id} className={`roundColumn ${round.id}`}>
              <h3>{round.title}</h3>
              <div className="roundMatches">
                {Array.from({ length: round.count }, (_, idx) => {
                  const matchNo = round.start + idx;
                  const match = byMatchNo.get(matchNo);

                  if (!match) {
                    const base = round.id === 'r16'
                      ? idx * 2 + 1
                      : round.id === 'qf'
                        ? 17 + idx * 2
                        : round.id === 'sf'
                          ? 25 + idx * 2
                          : 29;

                    const label = round.id === 'r32'
                      ? `Partido ${matchNo}`
                      : `Ganador partido ${base}`;

                    return <BracketPlaceholder key={`missing-${matchNo}`} label={label} />;
                  }

                  return mode === 'admin' ? (
                    <MatchCardAdmin
                      key={match.id}
                      match={match}
                      adminResults={adminResults}
                      updateAdminResult={updateAdminResult}
                      updatePenalty={updatePenalty}
                      updateRealAdvance={updateRealAdvance}
                      updateAdminPenaltyScore={updateAdminPenaltyScore}
                      clearAdminMatchResult={clearAdminMatchResult}
                      adminTeams={adminTeams}
                      updateTeamName={updateTeamName}
                      dirtyResults={dirtyResults}
                    />
                  ) : (
                    <MatchCardPublic
                      key={match.id}
                      match={match}
                      formScores={formScores}
                      updateScore={updateScore}
                      updateAdvance={updateAdvance}
                      updatePenaltyScore={updatePenaltyScore}
                      participant={participant}
                      predictions={predictions}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PublicApp() {
  const { matches, participants, predictions, auditLog, settings, status, setStatus, loading, loadAll } = useProdeData();
  const [name, setName] = useState(() => window.localStorage.getItem('prode_nombre') || '');
  const [accessCode, setAccessCode] = useState(() => window.localStorage.getItem('prode_codigo') || '');
  const [accessMode, setAccessMode] = useState(() => (window.localStorage.getItem('prode_acceso_ok') === '1' ? 'login' : 'intro'));
  const [requestSent, setRequestSent] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessParticipant, setAccessParticipant] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [autoCheckedAccess, setAutoCheckedAccess] = useState(false);
  const [formScores, setFormScores] = useState({});
  const [tab, setTab] = useState('cargar');

  const myParticipant = useMemo(() => {
    if (!accessGranted) return null;
    const key = normalizeName(accessParticipant?.name || name || '');
    return (
      participants.find((p) => p.id === accessParticipant?.id) ||
      participants.find((p) => p.name_key === key && (!p.status || p.status === 'approved')) ||
      accessParticipant
    );
  }, [participants, name, accessParticipant, accessGranted]);

  useEffect(() => {
    if (autoCheckedAccess) return;
    setAutoCheckedAccess(true);

    const savedOk = window.localStorage.getItem('prode_acceso_ok') === '1';
    const savedName = window.localStorage.getItem('prode_nombre') || '';
    const savedCode = window.localStorage.getItem('prode_codigo') || '';

    if (savedOk && savedName && savedCode) {
      validateAccess({ silent: true });
    }
  }, [autoCheckedAccess]);

  useEffect(() => {
    if (!myParticipant) return;
    const mine = predictions.filter((p) => p.participant_id === myParticipant.id);
    const next = {};
    mine.forEach((p) => {
      next[p.match_id] = {
        a: String(p.pred_a),
        b: String(p.pred_b),
        advance: p.advance_pick || '',
        penA: p.pred_pen_a !== null && p.pred_pen_a !== undefined ? String(p.pred_pen_a) : '',
        penB: p.pred_pen_b !== null && p.pred_pen_b !== undefined ? String(p.pred_pen_b) : '',
      };
    });
    setFormScores((prev) => ({ ...prev, ...next }));
  }, [myParticipant, predictions]);

  function resetAccessState({ keepFields = true } = {}) {
    setAccessGranted(false);
    setAccessParticipant(null);
    setFormScores({});
    window.localStorage.removeItem('prode_acceso_ok');

    if (!keepFields) {
      setName('');
      setAccessCode('');
      setAccessMode('intro');
      setRequestSent(false);
      window.localStorage.removeItem('prode_nombre');
      window.localStorage.removeItem('prode_codigo');
    }
  }

  function handleNameChange(value) {
    setName(value);
    setRequestSent(false);
    resetAccessState({ keepFields: true });
  }

  function handleCodeChange(value) {
    setAccessCode(value.replace(/\D/g, '').slice(0, 6));
    setAccessMode('login');
    resetAccessState({ keepFields: true });
  }

  async function requestAccess() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setStatus('Escribí tu nombre para solicitar participación.');
      return;
    }

    setAccessLoading(true);
    setStatus('Enviando solicitud...');

    try {
      const body = await callParticipantAccess({
        action: 'request_access',
        name: clean,
      });

      setName(clean);
      window.localStorage.setItem('prode_nombre', clean);
      setRequestSent(true);

      if (body.status === 'approved') {
        setAccessMode('login');
        setStatus('Ya estás aprobado. Ingresá tu código de acceso para cargar el prode.');
      } else if (body.status === 'rejected') {
        setAccessMode('intro');
        setStatus(body.message || 'Tu solicitud fue rechazada.');
      } else {
        setAccessMode('whatsapp');
        setStatus('Solicitud registrada. Ahora pedime tu código por WhatsApp.');
      }

      await loadAll();
    } catch (error) {
      setStatus(error.message || 'No pude enviar la solicitud.');
    } finally {
      setAccessLoading(false);
    }
  }

  async function validateAccess(options = {}) {
    const clean = name.trim().replace(/\s+/g, ' ');
    const code = String(accessCode || '').trim();

    if (!clean || !code) {
      if (!options.silent) setStatus('Ingresá tu nombre y tu código de acceso.');
      return;
    }

    setAccessLoading(true);
    if (!options.silent) setStatus('Validando acceso...');

    try {
      const body = await callParticipantAccess({
        action: 'validate_access',
        name: clean,
        code,
      });

      setName(clean);
      setAccessParticipant(body.participant);
      setAccessGranted(true);
      setAccessMode('granted');
      window.localStorage.setItem('prode_nombre', clean);
      window.localStorage.setItem('prode_codigo', code);
      window.localStorage.setItem('prode_acceso_ok', '1');

      if (!options.silent) setStatus('✅ Acceso habilitado. Ya podés cargar o editar tu prode.');
      await loadAll();
    } catch (error) {
      resetAccessState({ keepFields: true });
      if (!options.silent) setStatus(error.message || 'No pude validar el acceso.');
    } finally {
      setAccessLoading(false);
    }
  }

  function updateScore(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    setFormScores((prev) => {
      const current = prev[matchId] || { a: '', b: '', advance: '', penA: '', penB: '' };
      const next = { ...current, [side]: clean, clear: false };
      const o = next.a !== '' && next.b !== '' ? outcome(next.a, next.b) : '';
      if (o === 'A' || o === 'B') {
        next.advance = o;
        next.penA = '';
        next.penB = '';
      }
      if (o === 'D' && (current.advance === 'A' || current.advance === 'B')) next.advance = current.advance;
      return { ...prev, [matchId]: next };
    });
  }

  function updateAdvance(matchId, value) {
    setFormScores((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', penA: prev[matchId]?.penA ?? '', penB: prev[matchId]?.penB ?? '', advance: value },
    }));
  }

  function updatePenaltyScore(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    setFormScores((prev) => {
      const current = prev[matchId] || { a: '', b: '', advance: '', penA: '', penB: '' };
      const next = { ...current, [side]: clean, clear: false };
      const pWinner = penaltyWinner(next.penA, next.penB);
      if (pWinner) next.advance = pWinner;
      return { ...prev, [matchId]: next };
    });
  }

  async function submitPredictions(e) {
    e.preventDefault();
    setStatus('');

    const participant = myParticipant;

    if (!accessGranted || !participant?.id) {
      setStatus('Primero ingresá con tu nombre y código aprobado.');
      return;
    }

    if (participant.status && participant.status !== 'approved') {
      setStatus('Tu usuario todavía no está aprobado para participar.');
      return;
    }

    const openMatches = matches.filter((m) => !isPredictionClosed(m));
    const missing = openMatches.find((m) => {
      const row = formScores[m.id];
      if (!row || row.a === '' || row.b === '') return true;
      const o = outcome(row.a, row.b);
      return o === 'D' && !row.advance;
    });

    if (missing) {
      setStatus(`Completá resultado y clasificado de ${missing.team_a} vs ${missing.team_b}.`);
      return;
    }

    const invalidPenaltyPrediction = openMatches.find((m) => {
      const row = formScores[m.id];
      if (!row || row.a === '' || row.b === '' || outcome(row.a, row.b) !== 'D') return false;
      const hasSomePenalty = row.penA !== '' || row.penB !== '';
      if (!hasSomePenalty) return false;
      const pA = toIntOrNull(row.penA);
      const pB = toIntOrNull(row.penB);
      return pA === null || pB === null || pA === pB;
    });

    if (invalidPenaltyPrediction) {
      setStatus(`Revisá los penales de ${invalidPenaltyPrediction.team_a} vs ${invalidPenaltyPrediction.team_b}: si cargás penales, completá ambos y con ganador.`);
      return;
    }

    setStatus('Guardando prode...');

    const rows = openMatches.map((m) => {
      const row = formScores[m.id];
      const o = outcome(row.a, row.b);
      const advance = o === 'A' || o === 'B' ? o : row.advance;
      return {
        participant_id: participant.id,
        match_id: m.id,
        pred_a: Number(row.a),
        pred_b: Number(row.b),
        pred_pen_a: o === 'D' && row.penA !== '' ? Number(row.penA) : null,
        pred_pen_b: o === 'D' && row.penB !== '' ? Number(row.penB) : null,
        advance_pick: advance,
      };
    });

    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'participant_id,match_id' });

    if (upsertError) {
      console.error(upsertError);
      setStatus('No pude guardar. Puede ser que falte ejecutar la migración SQL nueva de penales exactos.');
      return;
    }

    window.localStorage.setItem('prode_nombre', participant.name || name.trim());
    setStatus('¡Listo! Tu prode quedó guardado. Podés volver a entrar con tu nombre y código.');
    await loadAll();
    setTab('ranking');
  }

  return (
    <main className="page">
      <Header />
      <RulesPanel />

      <nav className="tabs">
        <button className={tab === 'cargar' ? 'active' : ''} onClick={() => setTab('cargar')}>Cargar 8vos</button>
        <button className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}>Ranking</button>
        <button className={tab === 'transparencia' ? 'active' : ''} onClick={() => setTab('transparencia')}>Transparencia</button>
        <button className={tab === 'resultados' ? 'active' : ''} onClick={() => setTab('resultados')}>Resultados</button>
      </nav>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

      {tab === 'cargar' && (
        <>
          <section className="panel formPanel">
            <div className="sectionTitle">
              <h2>Acceso al prode</h2>
              <p>Para participar necesitás estar aprobado por el admin y entrar con tu código personal.</p>
            </div>

            {!accessGranted ? (
              <div className="field nameField">
                {accessMode === 'intro' && (
                  <>
                    <button className="primary" type="button" onClick={() => setAccessMode('name')}>
                      Quiero participar del prode familiar
                    </button>
                    <button className="ghost" type="button" onClick={() => setAccessMode('login')}>
                      Ya tengo mi código
                    </button>
                    <small>
                      Para jugar necesitás pedir acceso. Si te conozco, te apruebo desde el panel admin y te paso tu código por WhatsApp.
                    </small>
                  </>
                )}

                {accessMode === 'name' && (
                  <>
                    <label>Ingresá tu nombre acá</label>
                    <input
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Ej: Eze, Pau..."
                      autoComplete="name"
                    />

                    <div className="accessActions">
                      <button className="primary" type="button" onClick={requestAccess} disabled={accessLoading}>
                        Continuar
                      </button>
                      <button className="ghost" type="button" onClick={() => setAccessMode('intro')} disabled={accessLoading}>
                        Volver
                      </button>
                    </div>
                  </>
                )}

                {accessMode === 'whatsapp' && (
                  <>
                    <div className="savedHint">
                      ✅ Listo, <b>{name}</b>. Ahora solicitá tu código de acceso por WhatsApp.
                    </div>

                    <a className="primary" href={whatsappLinkForName(name)} target="_blank" rel="noreferrer">
                      Solicitar código por WhatsApp
                    </a>

                    <div className="accessActions">
                      <button className="ghost" type="button" onClick={() => setAccessMode('login')}>
                        Ya tengo mi código
                      </button>
                      <button className="ghost" type="button" onClick={() => setAccessMode('name')}>
                        Cambiar nombre
                      </button>
                    </div>

                    <small>
                      El mensaje de WhatsApp se completa solo con tu nombre. Cuando el admin te apruebe, te responde con tu código.
                    </small>
                  </>
                )}

                {accessMode === 'login' && (
                  <>
                    <label>Nombre *</label>
                    <input
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Ej: Eze, Pau..."
                      autoComplete="name"
                    />

                    <label>Código de acceso</label>
                    <input
                      value={accessCode}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      placeholder="Ej: 482913"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />

                    <div className="accessActions">
                      <button className="primary" type="button" onClick={() => validateAccess()} disabled={accessLoading}>
                        Ingresar al prode
                      </button>
                      <button className="ghost" type="button" onClick={() => setAccessMode('intro')} disabled={accessLoading}>
                        Volver
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="savedHint">
                ✅ Acceso aprobado para <b>{myParticipant?.name || name}</b>.
                <button className="ghost smallClear" type="button" onClick={() => resetAccessState({ keepFields: false })}>
                  Cambiar usuario
                </button>
              </div>
            )}
          </section>

          {accessGranted && (
            <form className="panel formPanel" onSubmit={submitPredictions}>
              <div className="sectionTitle">
                <h2>Prode 8vos de final</h2>
                <p>Poné tus resultados de 8vos. Si pronosticás empate, elegí quién avanza y podés cargar penales para sumar extra.</p>
              </div>

              <BracketBoard
                matches={matches}
                mode="public"
                formScores={formScores}
                updateScore={updateScore}
                updateAdvance={updateAdvance}
                updatePenaltyScore={updatePenaltyScore}
                participant={myParticipant}
                predictions={predictions}
              />

              <button className="primary floatingSave" type="submit">Guardar mi prode</button>
            </form>
          )}
        </>
      )}

      {tab === 'ranking' && <RankingPanel participants={participants} predictions={predictions} matches={matches} settings={settings} />}
      {tab === 'transparencia' && <TransparencyPanel participants={participants} predictions={predictions} matches={matches} auditLog={auditLog} />}
      {tab === 'resultados' && <ResultsPanel matches={matches} />}
    </main>
  );
}

function PrizeAdminPanel({ settings, adminPin, setStatus, loadAll }) {
  const [form, setForm] = useState(() => normalizePrizeSettings(settings));

  useEffect(() => {
    setForm(normalizePrizeSettings(settings));
  }, [settings]);

  const distributionTotal = form.prize_distribution.reduce((sum, item) => sum + Number(item.percent || 0), 0);
  const prizeRows = buildPrizeRows(form);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateWinnersCount(value) {
    const count = Math.min(10, Math.max(1, Number(value || 1)));
    setForm((prev) => ({
      ...prev,
      winners_count: count,
      prize_distribution: defaultDistributionForWinners(count),
    }));
  }

  function updateDistribution(place, value) {
    const percent = Math.max(0, Number(value || 0));
    setForm((prev) => ({
      ...prev,
      prize_distribution: prev.prize_distribution.map((item) => (
        Number(item.place) === Number(place) ? { ...item, percent } : item
      )),
    }));
  }

  async function savePrizeSettings() {
    if (!adminPin.trim()) {
      setStatus('Ingresá el PIN admin para guardar los premios.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (form.prize_enabled && distributionTotal !== 100) {
      setStatus(`La distribución de premios debe sumar 100%. Ahora suma ${distributionTotal}%.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setStatus('Guardando premios...');

    try {
      const body = await callProdeSettings({
        pin: adminPin.trim(),
        prize_enabled: Boolean(form.prize_enabled),
        prize_pool: Number(form.prize_pool || 0),
        prize_currency: form.prize_currency || '$',
        winners_count: Number(form.winners_count || 3),
        prize_distribution: form.prize_distribution,
        prize_note: form.prize_note,
      });

      setStatus(body.message || 'Premios actualizados correctamente.');
      await loadAll();
    } catch (error) {
      setStatus(error.message || 'No pude guardar los premios.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Premios del prode</h2>
        <p>Configurá el pozo acumulado y cómo se reparte en el ranking.</p>
      </div>

      <button className="primary" type="button" onClick={savePrizeSettings}>
        Guardar premios
      </button>

      <div className="teamEditGrid">
        <label>
          Activar premios
          <select value={form.prize_enabled ? 'yes' : 'no'} onChange={(e) => updateField('prize_enabled', e.target.value === 'yes')}>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </select>
        </label>

        <label>
          Pozo acumulado
          <input
            inputMode="numeric"
            value={form.prize_pool}
            onChange={(e) => updateField('prize_pool', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="Ej: 50000"
          />
        </label>

        <label>
          Moneda / símbolo
          <input
            value={form.prize_currency}
            onChange={(e) => updateField('prize_currency', e.target.value)}
            placeholder="$"
          />
        </label>

        <label>
          Cantidad de ganadores
          <input
            type="number"
            min="1"
            max="10"
            value={form.winners_count}
            onChange={(e) => updateWinnersCount(e.target.value)}
          />
        </label>
      </div>

      <div className="sectionTitle">
        <h3>Distribución</h3>
        <p>Debe sumar 100%. Total actual: <b>{distributionTotal}%</b></p>
      </div>

      <div className="teamEditGrid">
        {form.prize_distribution.map((item) => (
          <label key={item.place}>
            {item.place}° puesto (%)
            <input
              inputMode="numeric"
              value={item.percent}
              onChange={(e) => updateDistribution(item.place, e.target.value)}
            />
            <small>{formatPrizeAmount(form, prizeRows.find((row) => row.place === item.place)?.amount || 0)}</small>
          </label>
        ))}
      </div>

      <label className="field nameField">
        Nota visible en ranking
        <input
          value={form.prize_note}
          onChange={(e) => updateField('prize_note', e.target.value)}
          placeholder="Ej: El pozo se reparte entre los primeros puestos."
        />
      </label>

      <button className="primary" type="button" onClick={savePrizeSettings}>
        Guardar premios
      </button>
    </section>
  );
}

function AccessAdminPanel({ participants, adminPin, setStatus, loadAll }) {
  const pending = participants.filter((p) => (p.status || 'approved') === 'pending');
  const approved = participants.filter((p) => !p.status || p.status === 'approved');
  const rejected = participants.filter((p) => p.status === 'rejected');

  async function changeParticipantStatus(action, participant) {
    if (!adminPin.trim()) {
      setStatus('Ingresá el PIN admin para aprobar o rechazar participantes.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setStatus(action === 'approve' ? 'Aprobando participante...' : 'Rechazando participante...');

    try {
      const body = await callParticipantAccess({
        action,
        pin: adminPin.trim(),
        participant_id: participant.id,
      });

      setStatus(body.message || 'Cambio guardado.');
      await loadAll();
    } catch (error) {
      setStatus(error.message || 'No pude modificar el participante.');
    }
  }

  async function copyParticipantCode(participant) {
    const message = `Hola ${participant.name}, ya te aprobé para participar del prode familiar. Tu código de acceso es: ${participant.access_code}`;
    try {
      await navigator.clipboard.writeText(message);
      setStatus('Mensaje copiado. Pegalo en WhatsApp.');
    } catch {
      setStatus(`Código de ${participant.name}: ${participant.access_code}`);
    }
  }

  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Participantes</h2>
        <p>Aprobá solo a quienes querés que puedan cargar el prode. Cada aprobado tiene un código personal.</p>
      </div>

      <div className="sectionTitle">
        <h3>Solicitudes pendientes</h3>
        <p>{pending.length === 0 ? 'No hay solicitudes pendientes.' : 'Revisá y aprobá o rechazá cada solicitud.'}</p>
      </div>

      <div className="rankingList">
        {pending.map((participant) => (
          <div key={participant.id} className="rankRow">
            <div className="position">?</div>
            <div className="rankInfo">
              <strong>{participant.name}</strong>
              <span>Esperando aprobación</span>
            </div>
            <div className="accessActions">
              <button className="primary" type="button" onClick={() => changeParticipantStatus('approve', participant)}>
                Aprobar
              </button>
              <button className="ghost" type="button" onClick={() => changeParticipantStatus('reject', participant)}>
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="sectionTitle">
        <h3>Aprobados</h3>
        <p>Pasales su código por WhatsApp. Sin ese código no pueden cargar ni editar.</p>
      </div>

      <div className="rankingList">
        {approved.length === 0 && <p>Todavía no hay participantes aprobados.</p>}
        {approved.map((participant, index) => (
          <div key={participant.id} className="rankRow">
            <div className="position">{index + 1}</div>
            <div className="rankInfo">
              <strong>{participant.name}</strong>
              <span>Código: <b>{participant.access_code || 'sin código'}</b></span>
            </div>
            <div className="accessActions">
              {participant.access_code && (
                <button className="ghost" type="button" onClick={() => copyParticipantCode(participant)}>
                  Copiar
                </button>
              )}
              <button className="ghost" type="button" onClick={() => changeParticipantStatus('reject', participant)}>
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>

      {rejected.length > 0 && (
        <>
          <div className="sectionTitle">
            <h3>Rechazados</h3>
            <p>Podés aprobarlos más adelante si fue un error.</p>
          </div>

          <div className="rankingList">
            {rejected.map((participant) => (
              <div key={participant.id} className="rankRow">
                <div className="position">×</div>
                <div className="rankInfo">
                  <strong>{participant.name}</strong>
                  <span>Solicitud rechazada</span>
                </div>
                <div className="accessActions">
                  <button className="primary" type="button" onClick={() => changeParticipantStatus('approve', participant)}>
                    Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AdminApp() {
  const { matches, participants, predictions, settings, status, setStatus, loading, loadAll } = useProdeData({ admin: true });
  const [adminPin, setAdminPin] = useState('');
  const [adminResults, setAdminResults] = useState({});
  const [adminTeams, setAdminTeams] = useState({});
  const [dirtyResults, setDirtyResults] = useState({});

  function showAdminStatus(message) {
    setStatus(message);
    window.clearTimeout(window.__prodeAdminToastTimer);
    window.__prodeAdminToastTimer = window.setTimeout(() => {}, 1);
  }

  useEffect(() => {
    const next = {};
    const nextTeams = {};
    matches.forEach((m) => {
      next[m.id] = {
        a: m.real_a !== null ? String(m.real_a) : '',
        b: m.real_b !== null ? String(m.real_b) : '',
        penalties: Boolean(m.went_penalties),
        advance: m.advance_winner || '',
        penA: m.real_pen_a !== null && m.real_pen_a !== undefined ? String(m.real_pen_a) : '',
        penB: m.real_pen_b !== null && m.real_pen_b !== undefined ? String(m.real_pen_b) : '',
      };
      nextTeams[m.id] = { teamA: m.team_a, teamB: m.team_b, startsAt: isoToDatetimeLocal(m.starts_at) };
    });
    setAdminResults(next);
    setAdminTeams(nextTeams);
    setDirtyResults({});
  }, [matches]);

  function markResultDirty(matchId) {
    setDirtyResults((prev) => ({ ...prev, [matchId]: true }));
  }

  function updateTeamName(matchId, field, value) {
    setAdminTeams((prev) => ({
      ...prev,
      [matchId]: {
        teamA: prev[matchId]?.teamA ?? '',
        teamB: prev[matchId]?.teamB ?? '',
        startsAt: prev[matchId]?.startsAt ?? '',
        [field]: value,
      },
    }));
  }

  function updateAdminResult(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    markResultDirty(matchId);
    setAdminResults((prev) => {
      const current = prev[matchId] || { a: '', b: '', penalties: false, advance: '', penA: '', penB: '' };
      const next = { ...current, [side]: clean, clear: false };
      const o = next.a !== '' && next.b !== '' ? outcome(next.a, next.b) : '';
      if (!next.penalties && (o === 'A' || o === 'B')) next.advance = o;
      return { ...prev, [matchId]: next };
    });
  }

  function updatePenalty(matchId, checked) {
    markResultDirty(matchId);
    setAdminResults((prev) => {
      const current = prev[matchId] || { a: '', b: '', penalties: false, advance: '', penA: '', penB: '' };
      const next = { ...current, penalties: checked, clear: false };
      if (!checked) {
        next.penA = '';
        next.penB = '';
        const o = next.a !== '' && next.b !== '' ? outcome(next.a, next.b) : '';
        if (o === 'A' || o === 'B') next.advance = o;
      }
      return { ...prev, [matchId]: next };
    });
  }

  function updateRealAdvance(matchId, value) {
    markResultDirty(matchId);
    setAdminResults((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', penalties: prev[matchId]?.penalties ?? false, penA: prev[matchId]?.penA ?? '', penB: prev[matchId]?.penB ?? '', advance: value, clear: false },
    }));
  }

  function updateAdminPenaltyScore(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    markResultDirty(matchId);
    setAdminResults((prev) => {
      const current = prev[matchId] || { a: '', b: '', penalties: false, advance: '', penA: '', penB: '' };
      const next = { ...current, [side]: clean, clear: false };
      const pWinner = penaltyWinner(next.penA, next.penB);
      if (pWinner) next.advance = pWinner;
      return { ...prev, [matchId]: next };
    });
  }

  function clearAdminMatchResult(matchId) {
    markResultDirty(matchId);
    setAdminResults((prev) => ({
      ...prev,
      [matchId]: { a: '', b: '', penalties: false, advance: '', penA: '', penB: '', clear: true },
    }));
  }

  function savedResultExists(match) {
    return (
      match.real_a !== null ||
      match.real_b !== null ||
      Boolean(match.went_penalties) ||
      match.real_pen_a !== null ||
      match.real_pen_b !== null ||
      Boolean(match.advance_winner) ||
      Boolean(match.locked)
    );
  }

  function adminResultChanged(match, row) {
    const saved = {
      a: match.real_a !== null && match.real_a !== undefined ? String(match.real_a) : '',
      b: match.real_b !== null && match.real_b !== undefined ? String(match.real_b) : '',
      penalties: Boolean(match.went_penalties),
      advance: match.advance_winner || '',
      penA: match.real_pen_a !== null && match.real_pen_a !== undefined ? String(match.real_pen_a) : '',
      penB: match.real_pen_b !== null && match.real_pen_b !== undefined ? String(match.real_pen_b) : '',
    };
    return ['a', 'b', 'advance', 'penA', 'penB'].some((key) => String(row[key] ?? '') !== String(saved[key] ?? '')) || Boolean(row.penalties) !== saved.penalties;
  }

  async function submitAdminResults(e) {
    if (e?.preventDefault) e.preventDefault();
    setStatus('');

    if (!adminPin.trim()) {
      setStatus('Ingresá el PIN de admin.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const teamUpdates = matches
      .map((m) => {
        const row = adminTeams[m.id] || { teamA: m.team_a, teamB: m.team_b, startsAt: isoToDatetimeLocal(m.starts_at) };
        const teamA = (row.teamA || '').trim();
        const teamB = (row.teamB || '').trim();
        const startsAtLocal = row.startsAt || '';
        const currentStartsAtLocal = isoToDatetimeLocal(m.starts_at);
        if (!teamA || !teamB) return null;
        if (teamA === m.team_a && teamB === m.team_b && startsAtLocal === currentStartsAtLocal) return null;
        return { match_id: m.id, team_a: teamA, team_b: teamB, starts_at: datetimeLocalToIso(startsAtLocal) };
      })
      .filter(Boolean);

    const results = matches
      .map((m) => {
        const row = adminResults[m.id] || { a: '', b: '', penalties: false, advance: '', penA: '', penB: '', clear: false };
        const isDirty = Boolean(dirtyResults[m.id]);
        const hasAnyInput = row.a !== '' || row.b !== '' || Boolean(row.penalties) || row.advance !== '' || row.penA !== '' || row.penB !== '';

        // Botón “Limpiar resultado”: fuerza que el backend deje el partido pendiente,
        // incluso si el navegador no detectó bien el estado anterior.
        if (row.clear) {
          return { match_id: m.id, clear_result: true };
        }

        if (!hasAnyInput) {
          return isDirty || savedResultExists(m) ? { match_id: m.id, clear_result: true } : null;
        }

        if (row.a === '' || row.b === '') {
          return { match_id: m.id, invalid_partial: true };
        }

        // Si el usuario tocó ese partido, lo mandamos igual. Así permite corregir
        // resultados de prueba aunque coincidan visualmente o haya caché del navegador.
        if (!isDirty && !adminResultChanged(m, row)) return null;

        const o = outcome(row.a, row.b);
        const pWinner = penaltyWinner(row.penA, row.penB);
        const wentPenalties = Boolean(row.penalties);
        return {
          match_id: m.id,
          real_a: Number(row.a),
          real_b: Number(row.b),
          went_penalties: wentPenalties,
          real_pen_a: wentPenalties && row.penA !== '' ? Number(row.penA) : null,
          real_pen_b: wentPenalties && row.penB !== '' ? Number(row.penB) : null,
          advance_winner: wentPenalties ? (pWinner || row.advance) : (o === 'A' || o === 'B' ? o : row.advance),
        };
      })
      .filter(Boolean);

    if (results.length === 0 && teamUpdates.length === 0) {
      setStatus('No hay cambios para guardar. Para borrar un resultado de prueba, tocá “Limpiar resultado / dejar pendiente” en ese partido y después Guardar cambios.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const invalidPartial = results.find((r) => r.invalid_partial);
    if (invalidPartial) {
      setStatus('Para cargar un resultado real completá los dos casilleros, o tocá “Limpiar resultado” para dejarlo pendiente.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const invalid = results.find((r) => {
      if (r.clear_result) return false;
      const o = outcome(r.real_a, r.real_b);
      if (!r.went_penalties && o === 'D') return true;
      if (r.went_penalties && o !== 'D') return true;
      if (r.went_penalties && (r.real_pen_a === null || r.real_pen_b === null || r.real_pen_a === r.real_pen_b)) return true;
      if (!r.advance_winner) return true;
      return false;
    });
    if (invalid) {
      setStatus('Revisá los resultados: si quedó empatado después del alargue, marcá “Fue a penales” y cargá penales con ganador. Si hubo ganador en alargue, cargá el resultado final y no marques penales.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setStatus('Guardando cambios de admin...');

    const response = await fetch('/api/admin-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin.trim(), results, teams: teamUpdates }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = body.error || 'No pude guardar los cambios.';
      setStatus(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setStatus('✅ Cambios guardados. Ranking actualizado.');
    setDirtyResults({});
    await loadAll();
  }


  return (
    <main className="page adminPage">
      <Header admin />
      <RulesPanel compact />

      <div className="adminTopBar">
        <a href="/">← Volver al prode público</a>
        <span>URL privada: /admin</span>
      </div>

      <div className="adminStickyActions">
        <a className="miniBack" href="/">← Público</a>
        <label className="stickyPin">
          <span>PIN admin</span>
          <input
            type="password"
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            placeholder="PIN"
          />
        </label>
        <button className="primary stickySave" type="submit" form="adminResultsForm">Guardar resultados</button>
        {status && <span className="adminToast">{status}</span>}
      </div>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

      <PrizeAdminPanel
        settings={settings}
        adminPin={adminPin}
        setStatus={setStatus}
        loadAll={loadAll}
      />

      <AccessAdminPanel
        participants={participants}
        adminPin={adminPin}
        setStatus={setStatus}
        loadAll={loadAll}
      />

      <section className="panel formPanel">
        <div className="sectionTitle">
          <h2>Cargar resultados reales <PointsTooltip /></h2>
          <p>Editá los equipos y cargá el resultado final. El alargue cuenta como parte del partido; los penales van aparte si hubo empate.</p>
        </div>

        <form id="adminResultsForm" onSubmit={submitAdminResults}>
          <BracketBoard
            matches={matches}
            mode="admin"
            adminResults={adminResults}
            updateAdminResult={updateAdminResult}
            updatePenalty={updatePenalty}
            updateRealAdvance={updateRealAdvance}
            updateAdminPenaltyScore={updateAdminPenaltyScore}
            clearAdminMatchResult={clearAdminMatchResult}
            adminTeams={adminTeams}
            updateTeamName={updateTeamName}
            dirtyResults={dirtyResults}
          />

          <button className="primary floatingSave adminBottomSave" type="submit">Guardar cambios admin</button>
        </form>
      </section>

      <RankingPanel participants={participants} predictions={predictions} matches={matches} settings={settings} />
    </main>
  );
}

function Router() {
  const isAdmin = window.location.pathname.replace(/\/$/, '') === '/admin';
  return isAdmin ? <AdminApp /> : <PublicApp />;
}

createRoot(document.getElementById('root')).render(<Router />);

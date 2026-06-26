import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const ROUNDS = [
  { id: 'r32', title: '16avos de final', count: 16, start: 1 },
  { id: 'r16', title: 'Octavos de final', count: 8, start: 17 },
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

function PointsTooltip() {
  return (
    <span className="tooltipWrap" tabIndex="0" title="Reglas: el resultado final incluye alargue. Penales se cuentan aparte solo si el partido terminó empatado y fue a penales.">
      <span className="infoDot">?</span>
      <span className="tooltipBox">
        <b>Sistema de puntos</b><br />
        <b>Resultado final</b>: incluye 90 minutos + alargue.<br />
        Resultado exacto: +6.<br />
        Resultado no exacto, pero acierta quién avanza/tendencia: +3.<br />
        Si fue a penales: empate exacto +6 o empate no exacto +3.<br />
        En penales: clasificado +3 o penales exactos +6.<br />
        <b>Solo en penales se acumula resultado + definición.</b>
      </span>
    </span>
  );
}

function RulesPanel({ compact = false }) {
  return (
    <section className={`panel rulesPanel ${compact ? 'compactRules' : ''}`}>
      <div className="sectionTitle">
        <h2>Reglas del prode <PointsTooltip /></h2>
        <p>El marcador final del partido incluye el alargue. Los penales se cargan aparte.</p>
      </div>
      <div className="rulesGrid">
        <div className="ruleCard">
          <strong>Partido sin penales</strong>
          <span>Resultado exacto: <b>+6</b></span>
          <span>No exacto, pero acierta quién avanza: <b>+3</b></span>
          <span>No acierta: <b>0</b></span>
        </div>
        <div className="ruleCard">
          <strong>Partido con penales</strong>
          <span>Empate exacto: <b>+6</b></span>
          <span>Empate no exacto: <b>+3</b></span>
          <span>Además, clasificado por penales: <b>+3</b></span>
          <span>O penales exactos: <b>+6</b></span>
        </div>
        <div className="ruleCard">
          <strong>Alargue</strong>
          <span>Si iban 1-1 en los 90 y termina 2-1 en alargue, el resultado real es <b>2-1</b>.</span>
          <span>Solo se usan penales si el partido termina empatado después del alargue.</span>
        </div>
      </div>
    </section>
  );
}

function useProdeData() {
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    if (!supabase) {
      setStatus('Faltan las variables de Supabase. Revisá las variables de entorno en Vercel.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const [mRes, pRes, prRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_no', { ascending: true }),
      supabase.from('participants').select('*').order('created_at', { ascending: true }),
      supabase.from('predictions').select('*'),
    ]);

    if (mRes.error || pRes.error || prRes.error) {
      setStatus('No pude cargar los datos. Revisá Supabase y las políticas RLS.');
      console.error(mRes.error || pRes.error || prRes.error);
    } else {
      setMatches(mRes.data || []);
      setParticipants(pRes.data || []);
      setPredictions(prRes.data || []);
      setStatus('');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel('prode-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { matches, participants, predictions, status, setStatus, loading, loadAll };
}

function Header({ admin = false }) {
  return (
    <section className={`hero ${admin ? 'adminHero' : ''}`}>
      <div className="heroGlow"></div>
      <div className="heroText">
        <p className="eyebrow">🏆 Familia · Mundial · Prode</p>
        <h1>{admin ? 'Panel Admin' : 'Prode 16avos'}</h1>
        <p>{admin ? 'Cargá los resultados reales, penales y clasificados.' : 'Completá tu llave mundialista y peleá el ranking familiar en vivo.'}</p>
        <div className="rules">
          <span>Exacto: +6</span>
          <span>Clasificado: +3</span>
          <span>Penales pueden acumular</span>
          <span>Alargue cuenta como partido</span>
          <span className="ruleHelp">Reglas <PointsTooltip /></span>
        </div>
      </div>
      <div className="heroCard" aria-hidden="true">
        <div className="shirt">10</div>
        <div className="cup">🏆</div>
        <div className="ball">⚽</div>
      </div>
    </section>
  );
}

function RankingPanel({ participants, predictions, matches }) {
  const ranking = useMemo(() => {
    return participants
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

  return (
    <section className="panel rankingPanel">
      <div className="sectionTitle">
        <h2>Ranking familiar <PointsTooltip /></h2>
        <p>En empate, gana quien tenga más exactos y después más clasificados acertados.</p>
      </div>

      <div className="rankingList">
        {ranking.length === 0 && <p>Todavía no hay participantes registrados.</p>}
        {ranking.map((row, index) => (
          <div key={row.id} className={`rankRow rank${index + 1}`}>
            <div className="position">{index + 1}</div>
            <div className="rankInfo">
              <strong>{row.name}</strong>
              <span>{row.exacts} exactos · {row.advanceOnly} clasificados · {row.predictionsCount} pronósticos</span>
            </div>
            <div className="points">{row.points} pts</div>
          </div>
        ))}
      </div>
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
        <div className="matchLabel">Partido {match.match_no}</div>
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
        <span className="teamName">{match.team_a}</span>
        <input aria-label={`Pronóstico ${match.team_a}`} inputMode="numeric" value={predA} onChange={(e) => updateScore(match.id, 'a', e.target.value)} disabled={!canEdit} />
        <span className="realBox">{match.real_a ?? '-'}</span>
      </div>

      <div className={`bracketTeam ${advancePick === 'B' ? 'picked' : ''} ${realAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{match.team_b}</span>
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
      <div className="matchLabel">Partido {match.match_no}</div>
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
        <span className="teamName">{teamA}</span>
        <input aria-label={`Real ${teamA}`} inputMode="numeric" value={current.a} onChange={(e) => updateAdminResult(match.id, 'a', e.target.value)} />
      </div>

      <div className={`bracketTeam ${inferredAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{teamB}</span>
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

                  if (round.id !== 'r32') {
                    const base = round.id === 'r16' ? idx * 2 + 1 : round.id === 'qf' ? 17 + idx * 2 : round.id === 'sf' ? 25 + idx * 2 : 29;
                    return <BracketPlaceholder key={`${round.id}-${idx}`} label={`Ganador partido ${base}`} />;
                  }

                  if (!match) return <BracketPlaceholder key={`missing-${matchNo}`} label={`Partido ${matchNo}`} />;

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
  const { matches, participants, predictions, status, setStatus, loading, loadAll } = useProdeData();
  const [name, setName] = useState(() => window.localStorage.getItem('prode_nombre') || '');
  const [formScores, setFormScores] = useState({});
  const [tab, setTab] = useState('cargar');

  const myParticipant = useMemo(() => {
    const key = normalizeName(name || '');
    return participants.find((p) => p.name_key === key);
  }, [participants, name]);

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

    const cleanName = name.trim().replace(/\s+/g, ' ');
    const nameKey = normalizeName(cleanName);
    if (!cleanName) {
      setStatus('Escribí tu nombre para cargar el prode.');
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

    let participant = participants.find((p) => p.name_key === nameKey);
    if (!participant) {
      const { data, error } = await supabase
        .from('participants')
        .insert({ name: cleanName, name_key: nameKey })
        .select('*')
        .single();

      if (error) {
        const retry = await supabase.from('participants').select('*').eq('name_key', nameKey).maybeSingle();
        if (retry.error || !retry.data) {
          console.error(error);
          setStatus('No pude crear el participante. Revisá Supabase.');
          return;
        }
        participant = retry.data;
      } else {
        participant = data;
      }
    }

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

    window.localStorage.setItem('prode_nombre', cleanName);
    setStatus('¡Listo! Tu prode quedó guardado. Cuando vuelvas a entrar, escribí el mismo nombre o se cargará automáticamente en este dispositivo.');
    await loadAll();
    setTab('ranking');
  }

  return (
    <main className="page">
      <Header />
      <RulesPanel />

      <nav className="tabs">
        <button className={tab === 'cargar' ? 'active' : ''} onClick={() => setTab('cargar')}>Cargar llave</button>
        <button className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}>Ranking</button>
        <button className={tab === 'resultados' ? 'active' : ''} onClick={() => setTab('resultados')}>Resultados</button>
      </nav>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

      {tab === 'cargar' && (
        <form className="panel formPanel" onSubmit={submitPredictions}>
          <div className="field nameField">
            <label>Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Eze, Pau..."
              autoComplete="name"
            />
            {myParticipant && <small>Ya tenés un prode guardado. Si volvés a enviar, se actualiza.</small>}
          </div>

          <div className="sectionTitle">
            <h2>Llave mundialista <PointsTooltip /></h2>
            <p>Poné tu resultado. Si pronosticás empate, elegí quién avanza y podés cargar penales para intentar el +6.</p>
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

      {tab === 'ranking' && <RankingPanel participants={participants} predictions={predictions} matches={matches} />}
      {tab === 'resultados' && <ResultsPanel matches={matches} />}
    </main>
  );
}

function AdminApp() {
  const { matches, participants, predictions, status, setStatus, loading, loadAll } = useProdeData();
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
        <button className="primary stickySave" type="submit" form="adminResultsForm">Guardar cambios</button>
        {status && <span className="adminToast">{status}</span>}
      </div>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

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

      <RankingPanel participants={participants} predictions={predictions} matches={matches} />
    </main>
  );
}

function Router() {
  const isAdmin = window.location.pathname.replace(/\/$/, '') === '/admin';
  return isAdmin ? <AdminApp /> : <PublicApp />;
}

createRoot(document.getElementById('root')).render(<Router />);

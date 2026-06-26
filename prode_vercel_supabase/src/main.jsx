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

function actualAdvance(match) {
  if (!match || match.real_a === null || match.real_b === null) return null;
  const direct = outcome(match.real_a, match.real_b);
  if (direct === 'A' || direct === 'B') return direct;
  return match.advance_winner || null;
}

function scorePrediction(prediction, match) {
  if (!match || match.real_a === null || match.real_b === null) {
    return { points: 0, exact: false, outcomeHit: false, advanceHit: false };
  }

  const pA = Number(prediction.pred_a);
  const pB = Number(prediction.pred_b);
  const rA = Number(match.real_a);
  const rB = Number(match.real_b);

  let points = 0;
  let exact = false;
  let outcomeHit = false;
  let advanceHit = false;

  if ([pA, pB, rA, rB].some((x) => Number.isNaN(x))) {
    return { points, exact, outcomeHit, advanceHit };
  }

  if (pA === rA && pB === rB) {
    points += 6;
    exact = true;
    outcomeHit = true;
  } else if (outcome(pA, pB) === outcome(rA, rB)) {
    points += 3;
    outcomeHit = true;
  }

  const realAdvance = actualAdvance(match);
  if (realAdvance && prediction.advance_pick === realAdvance) {
    points += 3;
    advanceHit = true;
  }

  return { points, exact, outcomeHit, advanceHit };
}

function safeNumberValue(value) {
  if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 99)) return null;
  return value;
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
          <span>Resultado exacto: +6</span>
          <span>Ganador/empate: +3</span>
          <span>Equipo que avanza: +3</span>
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
        let outcomeHits = 0;
        let advanceHits = 0;
        let played = 0;

        userPredictions.forEach((prediction) => {
          const match = matches.find((m) => m.id === prediction.match_id);
          if (!match || match.real_a === null || match.real_b === null) return;
          const result = scorePrediction(prediction, match);
          points += result.points;
          if (result.exact) exacts += 1;
          if (result.outcomeHit && !result.exact) outcomeHits += 1;
          if (result.advanceHit) advanceHits += 1;
          played += 1;
        });

        return {
          ...participant,
          points,
          exacts,
          outcomeHits,
          advanceHits,
          played,
          predictionsCount: userPredictions.length,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.exacts !== a.exacts) return b.exacts - a.exacts;
        if (b.advanceHits !== a.advanceHits) return b.advanceHits - a.advanceHits;
        return a.name.localeCompare(b.name);
      });
  }, [participants, predictions, matches]);

  return (
    <section className="panel rankingPanel">
      <div className="sectionTitle">
        <h2>Ranking familiar</h2>
        <p>En empate, gana quien tenga más exactos y después más clasificados acertados.</p>
      </div>

      <div className="rankingList">
        {ranking.length === 0 && <p>Todavía no hay participantes registrados.</p>}
        {ranking.map((row, index) => (
          <div key={row.id} className={`rankRow rank${index + 1}`}>
            <div className="position">{index + 1}</div>
            <div className="rankInfo">
              <strong>{row.name}</strong>
              <span>{row.exacts} exactos · {row.outcomeHits} ganador/empate · {row.advanceHits} clasificados · {row.predictionsCount} pronósticos</span>
            </div>
            <div className="points">{row.points} pts</div>
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
        <p>Resultado del partido y equipo que avanzó.</p>
      </div>

      <div className="resultsTable">
        {matches.map((m) => {
          const adv = actualAdvance(m);
          return (
            <div key={m.id} className="resultRow">
              <span>#{m.match_no}</span>
              <strong>{m.team_a} vs {m.team_b}</strong>
              <em>{m.real_a === null || m.real_b === null ? 'Pendiente' : `${m.real_a} - ${m.real_b}${m.went_penalties ? ' · penales' : ''}${adv ? ` · avanzó ${sideName(m, adv)}` : ''}`}</em>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getPredictionForMatch(match, participant, predictions) {
  if (!match || !participant) return null;
  return predictions.find((p) => p.participant_id === participant.id && p.match_id === match.id) || null;
}

function getFormScore(formScores, matchId) {
  return formScores[matchId] || { a: '', b: '', advance: '' };
}

function BracketPlaceholder({ label }) {
  return (
    <article className="bracketMatch placeholderMatch">
      <div className="bracketTeam"><span>⚽ {label}</span></div>
      <div className="bracketTeam"><span>⚽ Ganador pendiente</span></div>
    </article>
  );
}

function MatchCardPublic({ match, formScores, updateScore, updateAdvance, participant, predictions }) {
  const locked = match.locked || match.real_a !== null || match.real_b !== null;
  const saved = getPredictionForMatch(match, participant, predictions);
  const current = getFormScore(formScores, match.id);
  const predA = current.a !== '' ? current.a : saved?.pred_a ?? '';
  const predB = current.b !== '' ? current.b : saved?.pred_b ?? '';
  const predOutcome = predA !== '' && predB !== '' ? outcome(predA, predB) : '';
  const advancePick = predOutcome === 'A' || predOutcome === 'B' ? predOutcome : (current.advance || saved?.advance_pick || '');
  const realAdvance = actualAdvance(match);

  return (
    <article className={`bracketMatch ${locked ? 'locked' : ''}`}>
      <div className="matchLabel">Partido {match.match_no}</div>
      <div className="bracketHead">
        <span>Equipo</span>
        <span>Mi prode</span>
        <span>Real</span>
      </div>

      <div className={`bracketTeam ${advancePick === 'A' ? 'picked' : ''} ${realAdvance === 'A' ? 'advanced' : ''}`}>
        <span className="teamName">{match.team_a}</span>
        <input aria-label={`Pronóstico ${match.team_a}`} inputMode="numeric" value={predA} onChange={(e) => updateScore(match.id, 'a', e.target.value)} disabled={locked} />
        <span className="realBox">{match.real_a ?? '-'}</span>
      </div>

      <div className={`bracketTeam ${advancePick === 'B' ? 'picked' : ''} ${realAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{match.team_b}</span>
        <input aria-label={`Pronóstico ${match.team_b}`} inputMode="numeric" value={predB} onChange={(e) => updateScore(match.id, 'b', e.target.value)} disabled={locked} />
        <span className="realBox">{match.real_b ?? '-'}</span>
      </div>

      <div className="advanceLine">
        {predOutcome === 'D' ? (
          <label>
            Avanza por penales/alargue:
            <select value={advancePick} onChange={(e) => updateAdvance(match.id, e.target.value)} disabled={locked}>
              <option value="">Elegir</option>
              <option value="A">{match.team_a}</option>
              <option value="B">{match.team_b}</option>
            </select>
          </label>
        ) : predOutcome ? (
          <span>Avanza en tu prode: <b>{sideName(match, advancePick)}</b></span>
        ) : (
          <span>Completá el resultado para definir quién avanza.</span>
        )}
      </div>

      {match.went_penalties && <div className="penaltyBadge">Definido por penales</div>}
    </article>
  );
}

function MatchCardAdmin({ match, adminResults, updateAdminResult, updatePenalty, updateRealAdvance }) {
  const current = adminResults[match.id] || { a: '', b: '', penalties: false, advance: '' };
  const realOutcome = current.a !== '' && current.b !== '' ? outcome(current.a, current.b) : '';
  const inferredAdvance = realOutcome === 'A' || realOutcome === 'B' ? realOutcome : current.advance;

  return (
    <article className="bracketMatch adminMatch">
      <div className="matchLabel">Partido {match.match_no}</div>
      <div className="bracketHead">
        <span>Equipo</span>
        <span>Real</span>
      </div>

      <div className={`bracketTeam ${inferredAdvance === 'A' ? 'advanced' : ''}`}>
        <span className="teamName">{match.team_a}</span>
        <input aria-label={`Real ${match.team_a}`} inputMode="numeric" value={current.a} onChange={(e) => updateAdminResult(match.id, 'a', e.target.value)} />
      </div>

      <div className={`bracketTeam ${inferredAdvance === 'B' ? 'advanced' : ''}`}>
        <span className="teamName">{match.team_b}</span>
        <input aria-label={`Real ${match.team_b}`} inputMode="numeric" value={current.b} onChange={(e) => updateAdminResult(match.id, 'b', e.target.value)} />
      </div>

      <label className="penaltyCheck">
        <input type="checkbox" checked={Boolean(current.penalties)} onChange={(e) => updatePenalty(match.id, e.target.checked)} />
        Fue a penales
      </label>

      {(realOutcome === 'D' || current.penalties) && (
        <label className="advanceLine adminAdvance">
          Avanzó:
          <select value={current.advance || ''} onChange={(e) => updateRealAdvance(match.id, e.target.value)}>
            <option value="">Elegir</option>
            <option value="A">{match.team_a}</option>
            <option value="B">{match.team_b}</option>
          </select>
        </label>
      )}
    </article>
  );
}

function BracketBoard({ matches, mode, formScores, updateScore, updateAdvance, participant, predictions, adminResults, updateAdminResult, updatePenalty, updateRealAdvance }) {
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
                    />
                  ) : (
                    <MatchCardPublic
                      key={match.id}
                      match={match}
                      formScores={formScores}
                      updateScore={updateScore}
                      updateAdvance={updateAdvance}
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
  const [name, setName] = useState('');
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
      next[p.match_id] = { a: String(p.pred_a), b: String(p.pred_b), advance: p.advance_pick || '' };
    });
    setFormScores((prev) => ({ ...prev, ...next }));
  }, [myParticipant, predictions]);

  function updateScore(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    setFormScores((prev) => {
      const current = prev[matchId] || { a: '', b: '', advance: '' };
      const next = { ...current, [side]: clean };
      const o = next.a !== '' && next.b !== '' ? outcome(next.a, next.b) : '';
      if (o === 'A' || o === 'B') next.advance = o;
      if (o === 'D' && (current.advance === 'A' || current.advance === 'B')) next.advance = current.advance;
      return { ...prev, [matchId]: next };
    });
  }

  function updateAdvance(matchId, value) {
    setFormScores((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', advance: value },
    }));
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

    const openMatches = matches.filter((m) => !m.locked && m.real_a === null && m.real_b === null);
    const missing = openMatches.find((m) => {
      const row = formScores[m.id];
      if (!row || row.a === '' || row.b === '') return true;
      const o = outcome(row.a, row.b);
      return o === 'D' && !row.advance;
    });

    if (missing) {
      setStatus(`Te falta cargar resultado o clasificado de ${missing.team_a} vs ${missing.team_b}.`);
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
        advance_pick: advance,
      };
    });

    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'participant_id,match_id' });

    if (upsertError) {
      console.error(upsertError);
      setStatus('No pude guardar. Puede ser que falte ejecutar la actualización SQL de penales/clasificados.');
      return;
    }

    setStatus('¡Listo! Tu prode quedó guardado.');
    await loadAll();
    setTab('ranking');
  }

  return (
    <main className="page">
      <Header />

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
            <h2>Llave mundialista</h2>
            <p>Poné tu resultado. Si pronosticás empate, elegí quién avanza por penales/alargue.</p>
          </div>

          <BracketBoard
            matches={matches}
            mode="public"
            formScores={formScores}
            updateScore={updateScore}
            updateAdvance={updateAdvance}
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

  useEffect(() => {
    const next = {};
    matches.forEach((m) => {
      next[m.id] = {
        a: m.real_a !== null ? String(m.real_a) : '',
        b: m.real_b !== null ? String(m.real_b) : '',
        penalties: Boolean(m.went_penalties),
        advance: m.advance_winner || '',
      };
    });
    setAdminResults(next);
  }, [matches]);

  function updateAdminResult(matchId, side, value) {
    const clean = safeNumberValue(value);
    if (clean === null) return;
    setAdminResults((prev) => {
      const current = prev[matchId] || { a: '', b: '', penalties: false, advance: '' };
      const next = { ...current, [side]: clean };
      const o = next.a !== '' && next.b !== '' ? outcome(next.a, next.b) : '';
      if (o === 'A' || o === 'B') next.advance = o;
      return { ...prev, [matchId]: next };
    });
  }

  function updatePenalty(matchId, checked) {
    setAdminResults((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', advance: prev[matchId]?.advance ?? '', penalties: checked },
    }));
  }

  function updateRealAdvance(matchId, value) {
    setAdminResults((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', penalties: prev[matchId]?.penalties ?? false, advance: value },
    }));
  }

  async function submitAdminResults(e) {
    e.preventDefault();
    setStatus('');

    const results = matches
      .filter((m) => adminResults[m.id]?.a !== '' && adminResults[m.id]?.b !== '' && adminResults[m.id])
      .map((m) => {
        const row = adminResults[m.id];
        const o = outcome(row.a, row.b);
        return {
          match_id: m.id,
          real_a: Number(row.a),
          real_b: Number(row.b),
          went_penalties: Boolean(row.penalties),
          advance_winner: o === 'A' || o === 'B' ? o : row.advance,
        };
      });

    if (!adminPin.trim()) {
      setStatus('Ingresá el PIN de admin.');
      return;
    }

    if (results.length === 0) {
      setStatus('Cargá al menos un resultado real.');
      return;
    }

    const invalid = results.find((r) => {
      const o = outcome(r.real_a, r.real_b);
      return o === 'D' && !r.advance_winner;
    });
    if (invalid) {
      setStatus('Hay un partido empatado: elegí quién avanzó.');
      return;
    }

    setStatus('Actualizando resultados reales...');

    const response = await fetch('/api/admin-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin.trim(), results }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error || 'No pude actualizar los resultados.');
      return;
    }

    setStatus('Resultados reales cargados. Ranking actualizado.');
    await loadAll();
  }

  return (
    <main className="page adminPage">
      <Header admin />

      <div className="adminTopBar">
        <a href="/">← Volver al prode público</a>
        <span>URL privada: /admin</span>
      </div>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

      <section className="panel formPanel">
        <div className="sectionTitle">
          <h2>Cargar resultados reales</h2>
          <p>Completá el resultado real. Si terminó empatado, marcá penales y elegí quién avanzó.</p>
        </div>

        <form onSubmit={submitAdminResults}>
          <div className="field pinField">
            <label>PIN admin</label>
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="PIN privado"
            />
          </div>

          <BracketBoard
            matches={matches}
            mode="admin"
            adminResults={adminResults}
            updateAdminResult={updateAdminResult}
            updatePenalty={updatePenalty}
            updateRealAdvance={updateRealAdvance}
          />

          <button className="primary floatingSave" type="submit">Guardar resultados reales</button>
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

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function outcome(a, b) {
  if (a > b) return 'A';
  if (a < b) return 'B';
  return 'D';
}

function scorePrediction(predA, predB, realA, realB) {
  if ([predA, predB, realA, realB].some((x) => x === null || x === undefined || Number.isNaN(Number(x)))) {
    return { points: 0, exact: false, outcomeHit: false };
  }

  const pA = Number(predA);
  const pB = Number(predB);
  const rA = Number(realA);
  const rB = Number(realB);

  if (pA === rA && pB === rB) {
    return { points: 6, exact: true, outcomeHit: true };
  }

  if (outcome(pA, pB) === outcome(rA, rB)) {
    return { points: 3, exact: false, outcomeHit: true };
  }

  return { points: 0, exact: false, outcomeHit: false };
}

function App() {
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [name, setName] = useState('');
  const [formScores, setFormScores] = useState({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cargar');
  const [adminPin, setAdminPin] = useState('');
  const [adminResults, setAdminResults] = useState({});
  const [showAdmin, setShowAdmin] = useState(false);

  async function loadAll() {
    if (!supabase) {
      setStatus('Faltan las variables de Supabase. Revisá el archivo .env o las variables de Vercel.');
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

  const ranking = useMemo(() => {
    return participants
      .map((participant) => {
        const userPredictions = predictions.filter((p) => p.participant_id === participant.id);
        let points = 0;
        let exacts = 0;
        let outcomeHits = 0;
        let played = 0;

        userPredictions.forEach((prediction) => {
          const match = matches.find((m) => m.id === prediction.match_id);
          if (!match || match.real_a === null || match.real_b === null) return;
          const result = scorePrediction(prediction.pred_a, prediction.pred_b, match.real_a, match.real_b);
          points += result.points;
          if (result.exact) exacts += 1;
          if (result.outcomeHit && !result.exact) outcomeHits += 1;
          played += 1;
        });

        return {
          ...participant,
          points,
          exacts,
          outcomeHits,
          played,
          predictionsCount: userPredictions.length,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.exacts !== a.exacts) return b.exacts - a.exacts;
        return a.name.localeCompare(b.name);
      });
  }, [participants, predictions, matches]);

  const myParticipant = useMemo(() => {
    const key = normalizeName(name || '');
    return participants.find((p) => p.name_key === key);
  }, [participants, name]);

  useEffect(() => {
    if (!myParticipant) return;
    const mine = predictions.filter((p) => p.participant_id === myParticipant.id);
    const next = {};
    mine.forEach((p) => {
      next[p.match_id] = { a: String(p.pred_a), b: String(p.pred_b) };
    });
    setFormScores((prev) => ({ ...prev, ...next }));
  }, [myParticipant, predictions]);

  function updateScore(matchId, side, value) {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 99)) return;
    setFormScores((prev) => ({
      ...prev,
      [matchId]: {
        a: prev[matchId]?.a ?? '',
        b: prev[matchId]?.b ?? '',
        [side]: value,
      },
    }));
  }

  function updateAdminResult(matchId, side, value) {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 99)) return;
    setAdminResults((prev) => ({
      ...prev,
      [matchId]: {
        a: prev[matchId]?.a ?? '',
        b: prev[matchId]?.b ?? '',
        [side]: value,
      },
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
    const missing = openMatches.find((m) => formScores[m.id]?.a === '' || formScores[m.id]?.b === '' || !formScores[m.id]);
    if (missing) {
      setStatus(`Te falta cargar el resultado de ${missing.team_a} vs ${missing.team_b}.`);
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
        // Puede pasar si dos personas cargan al mismo tiempo. Intentamos leer de nuevo.
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

    const rows = openMatches.map((m) => ({
      participant_id: participant.id,
      match_id: m.id,
      pred_a: Number(formScores[m.id].a),
      pred_b: Number(formScores[m.id].b),
    }));

    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'participant_id,match_id' });

    if (upsertError) {
      console.error(upsertError);
      setStatus('No pude guardar. Puede ser que algún partido ya esté bloqueado.');
      return;
    }

    setStatus('¡Listo! Tu prode quedó guardado.');
    await loadAll();
    setTab('ranking');
  }

  async function submitAdminResults(e) {
    e.preventDefault();
    setStatus('');

    const results = matches
      .filter((m) => adminResults[m.id]?.a !== '' && adminResults[m.id]?.b !== '' && adminResults[m.id])
      .map((m) => ({
        match_id: m.id,
        real_a: Number(adminResults[m.id].a),
        real_b: Number(adminResults[m.id].b),
      }));

    if (!adminPin.trim()) {
      setStatus('Ingresá el PIN de admin.');
      return;
    }

    if (results.length === 0) {
      setStatus('Cargá al menos un resultado real.');
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
    setAdminResults({});
    await loadAll();
    setTab('ranking');
  }

  function fillAdminFromCurrent() {
    const next = {};
    matches.forEach((m) => {
      if (m.real_a !== null && m.real_b !== null) {
        next[m.id] = { a: String(m.real_a), b: String(m.real_b) };
      }
    });
    setAdminResults(next);
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="heroGlow"></div>
        <div className="heroText">
          <p className="eyebrow">🏆 Familia · Mundial · Prode</p>
          <h1>Prode 16avos</h1>
          <p>Cargá tus resultados, mirá el ranking en vivo y peleá por la copa familiar.</p>
          <div className="rules">
            <span>Exacto: +6</span>
            <span>Ganador/empate: +3</span>
          </div>
        </div>
        <div className="heroCard" aria-hidden="true">
          <div className="shirt">10</div>
          <div className="cup">🏆</div>
          <div className="ball">⚽</div>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === 'cargar' ? 'active' : ''} onClick={() => setTab('cargar')}>Cargar prode</button>
        <button className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}>Ranking</button>
        <button className={tab === 'resultados' ? 'active' : ''} onClick={() => setTab('resultados')}>Resultados</button>
      </nav>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">Cargando datos...</div>}

      {tab === 'cargar' && (
        <form className="panel" onSubmit={submitPredictions}>
          <div className="field">
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
            <h2>Partidos</h2>
            <p>Cuando el admin cargue un resultado real, ese partido queda bloqueado.</p>
          </div>

          <div className="matchGrid">
            {matches.map((match) => {
              const locked = match.locked || match.real_a !== null || match.real_b !== null;
              return (
                <article key={match.id} className={`matchCard ${locked ? 'locked' : ''}`}>
                  <div className="matchTop">
                    <strong>Partido {match.match_no}</strong>
                    <span>{locked ? 'Cerrado' : match.round}</span>
                  </div>
                  <div className="scoreRow">
                    <span>{match.team_a}</span>
                    <input
                      inputMode="numeric"
                      value={formScores[match.id]?.a ?? ''}
                      onChange={(e) => updateScore(match.id, 'a', e.target.value)}
                      disabled={locked}
                    />
                  </div>
                  <div className="scoreRow">
                    <span>{match.team_b}</span>
                    <input
                      inputMode="numeric"
                      value={formScores[match.id]?.b ?? ''}
                      onChange={(e) => updateScore(match.id, 'b', e.target.value)}
                      disabled={locked}
                    />
                  </div>
                  {locked && (
                    <p className="realResult">Resultado real: {match.real_a} - {match.real_b}</p>
                  )}
                </article>
              );
            })}
          </div>

          <button className="primary" type="submit">Guardar mi prode</button>
        </form>
      )}

      {tab === 'ranking' && (
        <section className="panel">
          <div className="sectionTitle">
            <h2>Ranking familiar</h2>
            <p>Ordenado por puntos. En empate, gana quien tenga más resultados exactos.</p>
          </div>

          <div className="rankingList">
            {ranking.length === 0 && <p>Todavía no hay participantes registrados.</p>}
            {ranking.map((row, index) => (
              <div key={row.id} className={`rankRow rank${index + 1}`}>
                <div className="position">{index + 1}</div>
                <div className="rankInfo">
                  <strong>{row.name}</strong>
                  <span>{row.exacts} exactos · {row.outcomeHits} ganador/empate · {row.predictionsCount} pronósticos</span>
                </div>
                <div className="points">{row.points} pts</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'resultados' && (
        <section className="panel">
          <div className="sectionTitle">
            <h2>Resultados reales</h2>
            <p>Acá se ven los resultados cargados y el estado de cada partido.</p>
          </div>

          <div className="resultsTable">
            {matches.map((m) => (
              <div key={m.id} className="resultRow">
                <span>#{m.match_no}</span>
                <strong>{m.team_a} vs {m.team_b}</strong>
                <em>{m.real_a === null || m.real_b === null ? 'Pendiente' : `${m.real_a} - ${m.real_b}`}</em>
              </div>
            ))}
          </div>

          <button className="ghost" onClick={() => { setShowAdmin((v) => !v); fillAdminFromCurrent(); }}>
            {showAdmin ? 'Ocultar admin' : 'Cargar resultados como admin'}
          </button>

          {showAdmin && (
            <form className="adminBox" onSubmit={submitAdminResults}>
              <div className="field">
                <label>PIN admin</label>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="PIN privado"
                />
              </div>

              <div className="matchGrid compact">
                {matches.map((m) => (
                  <article key={m.id} className="matchCard">
                    <div className="matchTop">
                      <strong>Partido {m.match_no}</strong>
                      <span>{m.locked ? 'Bloqueado' : 'Abierto'}</span>
                    </div>
                    <div className="scoreRow">
                      <span>{m.team_a}</span>
                      <input
                        inputMode="numeric"
                        value={adminResults[m.id]?.a ?? ''}
                        onChange={(e) => updateAdminResult(m.id, 'a', e.target.value)}
                      />
                    </div>
                    <div className="scoreRow">
                      <span>{m.team_b}</span>
                      <input
                        inputMode="numeric"
                        value={adminResults[m.id]?.b ?? ''}
                        onChange={(e) => updateAdminResult(m.id, 'b', e.target.value)}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <button className="primary" type="submit">Guardar resultados reales</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

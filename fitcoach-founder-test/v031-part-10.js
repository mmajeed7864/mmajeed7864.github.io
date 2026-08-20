function renderProgress(data) {
  const totalVolume = data.sessions.reduce((sum, session) => sum + sessionVolume(session), 0);
  const week = weekStats(data);
  const allExercises = new Set(data.sessions.flatMap(session => (session.exercises || []).map(exercise => exercise.name)));
  const prs = data.sessions.filter(session => session.markedPR).length;
  const points = chartPoints(data.sessions.slice(-8).map(sessionVolume));

  $("#view").innerHTML = `
    <div class="stack">
      <div class="stats-grid">
        <div class="stat-card"><small>SESSIONS</small><strong>${data.sessions.length}</strong><span>${week.done}/${week.target} this week</span></div>
        <div class="stat-card"><small>VOLUME</small><strong>${compactNumber(totalVolume)}</strong><span>${data.settings.units} moved</span></div>
        <div class="stat-card"><small>MOVEMENTS</small><strong>${allExercises.size}</strong><span>logged exercises</span></div>
        <div class="stat-card"><small>REAL WINS</small><strong>${prs}</strong><span>PRs or comebacks</span></div>
      </div>
      <article class="card">
        <div class="row-head"><div><div class="kicker">TRAINING LOAD</div><h3>Your recent work</h3></div><span class="tag blue">Last ${Math.min(8,data.sessions.length)} sessions</span></div>
        ${data.sessions.length ? `<div class="chart"><svg viewBox="0 0 320 150" preserveAspectRatio="none"><defs><linearGradient id="chartGrad" x1="0" x2="1"><stop stop-color="#4b8bff"/><stop offset="1" stop-color="#7a4dff"/></linearGradient><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4b8bff" stop-opacity=".28"/><stop offset="1" stop-color="#4b8bff" stop-opacity="0"/></linearGradient></defs><path class="chart-grid" d="M0 25H320M0 75H320M0 125H320"/><path class="chart-area" d="M${points} L320 150 L0 150 Z"/><polyline class="chart-line" points="${points}"/></svg></div>` : `<div class="empty">Finish a workout and the chart will start with real data.</div>`}
      </article>
      <article class="card"><div class="row-head"><h3>Recent sessions</h3><span class="tag">No demo history</span></div>${data.sessions.length ? `<div class="history">${[...data.sessions].reverse().slice(0,8).map(session => `<div class="history-item"><span><b>${esc(session.planLabel || "Workout")}</b><small>${fmtDate(session.completedAt || session.date)} · ${session.durationMinutes || 0} min</small></span><span>${compactNumber(sessionVolume(session))}<small>volume</small></span></div>`).join("")}</div>` : `<div class="empty">Your history starts empty. Nova learns only from work you actually log.</div>`}</article>
      <article class="card"><div class="row-head"><h3>Coach memory</h3><button class="link" data-route-target="profile">Manage</button></div><div class="memory-list">${data.memories.length ? data.memories.slice(-12).map(memory => `<span class="memory-chip">${esc(memory)}</span>`).join("") : `<span class="memory-chip">No learned facts yet</span>`}</div></article>
    </div>`;
}

function sessionVolume(session) {
  return (session.exercises || []).reduce((sum, exercise) => sum + (exercise.sets || []).reduce((setSum, set) => setSum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0), 0);
}

function chartPoints(values) {
  if (!values.length) return "0,150 320,150";
  const max = Math.max(...values, 1);
  return values.map((value,index) => {
    const x = values.length === 1 ? 160 : (index / (values.length - 1)) * 320;
    const y = 140 - (value / max) * 112;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function compactNumber(value) {
  if (value >= 1000000) return `${(value/1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value/1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

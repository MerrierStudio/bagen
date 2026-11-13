(function (scope) {
  'use strict';
  const TAUNTS = Object.freeze(['我这可是顶级老根儿，你的呢？', '挑根结实的啊！', '刚才不算，这回再来！', '怎么样，还接着拔不？']);
  function enterSelection(s, random) {
    const m = s.active, pool = [0, 1];
    if (m.lastRoundWinner !== null) pool.push(m.lastRoundWinner === 1 ? 2 : 3);
    const choices = pool.filter(id => id !== m.tauntID);
    const roll = random(); requireThat(Number.isFinite(roll) && roll >= 0 && roll < 1);
    m.tauntID = choices[Math.floor(roll * choices.length)];
    m.phase = 'selection'; lockAI(s);
  }
  const BASE = [50, 70, 90], RESISTANCE = [115, 100, 85];
  const TREATMENTS = { none: { bonus: 0, wear: 65, order: 2 }, salt: { bonus: 10, wear: 100, order: 0 }, shoe: { bonus: 18, wear: 150, order: 1 } };
  const validTreatment = choice => typeof choice === 'string' && Object.prototype.hasOwnProperty.call(TREATMENTS, choice);
  const copy = value => JSON.parse(JSON.stringify(value));
  function requireThat(ok, message) { if (!ok) throw Error(message || '当前操作不可用'); }
  function unique(ids) { return new Set(ids).size === ids.length; }
  function stableSort(items, compare) { return items.map((v, i) => ({ v: v, i: i })).sort((a, b) => compare(a.v, b.v) || a.i - b.i).map(x => x.v); }
  class SeededRandom {
    constructor(hex) {
      requireThat(typeof hex === 'string' && /^[0-9a-fA-F]{1,16}$/.test(hex), '随机种子须为1至16位十六进制字符串');
      hex = hex.padStart(16, '0'); this.words = [12, 8, 4, 0].map(i => parseInt(hex.slice(i, i + 4), 16));
    }
    get hex() { return this.words.slice().reverse().map(w => w.toString(16).padStart(4, '0')).join(''); }
    unit() {
      // Low 64 bits of state * 0x5851f42d4c957f2d + 0x14057b7ef767814f.
      // Each sum fits exactly in a JS integer; no BigInt or imprecise UInt64 Number.
      const multiplier = [0x7f2d, 0x4c95, 0xf42d, 0x5851], increment = [0x814f, 0xf767, 0x7b7e, 0x1405];
      const next = []; let carry = 0;
      for (let i = 0; i < 4; i++) {
        let value = carry + increment[i];
        for (let j = 0; j <= i; j++) value += this.words[j] * multiplier[i - j];
        next[i] = value % 65536; carry = Math.floor(value / 65536);
      }
      this.words = next;
      const high = next[3] * 65536 + next[2], low = next[1] * 65536 + next[0];
      return (high * 2097152 + Math.floor(low / 2048)) / 9007199254740992;
    }
    integer(low, high) { requireThat(Number.isSafeInteger(low) && Number.isSafeInteger(high) && high >= low && Number.isSafeInteger(high - low + 1)); return low + Math.floor(this.unit() * (high - low + 1)); }
  }
  function damage(ability, rarity, treatment) {
    requireThat(Number.isSafeInteger(ability) && ability > 0 && Number.isInteger(rarity) && rarity >= 0 && rarity <= 2 && validTreatment(treatment));
    const numerator = ability * 20 * RESISTANCE[rarity] * TREATMENTS[treatment].wear + 500000;
    requireThat(Number.isSafeInteger(numerator), '磨损输入超出整数精度范围');
    return Math.max(1, Math.floor(numerator / 1000000));
  }
  // Missing legacy memory uses public wins only; never infer wear from real ability.
  function estimatedWear(r) { return r.estimatedWear == null ? r.wins * damage(70, r.rarity, r.treatment) : r.estimatedWear; }
  function estimate(r) { return Math.max(1, BASE[r.rarity] + TREATMENTS[r.treatment].bonus - estimatedWear(r)); }
  function rankEstimated(roots, rng) {
    const keyed = roots.map(r => ({ root: r, key: rng.unit() }));
    return stableSort(keyed, (a, b) => estimate(b.root) - estimate(a.root) || a.key - b.key).map(item => item.root);
  }
  function chooseBest(roots, rng) {
    const best = Math.max.apply(null, roots.map(estimate)), tied = roots.filter(r => estimate(r) === best);
    requireThat(tied.length > 0); return tied[rng.integer(0, tied.length - 1)].id;
  }
  function chooseTeam(fresh, old, rng) {
    requireThat(fresh.length === 3 && unique(fresh.concat(old).map(r => r.id)));
    // Randomize equal ranks once. Only eight fresh subsets; old prefixes are optimal.
    const ranked = rankEstimated(old, rng);
    const newRanked = rankEstimated(fresh, rng);
    let best = -1, total = 0, chosen = null;
    for (let mask = 0; mask < 8; mask++) {
      const selected = newRanked.filter((r, i) => mask & (1 << i)), k = 3 - selected.length;
      if (ranked.length < k) continue;
      const prior = ranked.slice(0, k), score = selected.concat(prior).reduce((sum, r) => sum + estimate(r), 0) + (selected.length ? 18 : 0) + (selected.length > 1 ? 10 : 0);
      let ways = 1;
      if (k) {
        const boundary = estimate(prior[k - 1]), above = ranked.filter(r => estimate(r) > boundary).length;
        const ties = ranked.filter(r => estimate(r) === boundary).length, needed = k - above;
        for (let j = 1; j <= needed; j++) ways = ways * (ties - j + 1) / j;
      }
      if (score < best) continue;
      if (score > best) { best = score; total = 0; }
      total += ways;
      if (rng.unit() < ways / total) chosen = { roots: selected.concat(prior), fresh: selected, score: score };
    }
    return chosen;
  }
  function validateRoot(r) {
    requireThat(r && typeof r.id === 'string' && r.id.length > 0 && ['player', 'ai'].includes(r.owner) &&
      Number.isInteger(r.rarity) && r.rarity >= 0 && r.rarity <= 2 && validTreatment(r.treatment), '根记录无法识别');
    requireThat(r.estimatedWear == null || (Number.isSafeInteger(r.estimatedWear) && r.estimatedWear >= 0), '估计损耗无法识别');
    ['rawAbility', 'initialAbility', 'currentAbility'].forEach(k => requireThat(Number.isSafeInteger(r[k]) && r[k] > 0));
    ['wins', 'streak', 'bestStreak'].forEach(k => requireThat(Number.isSafeInteger(r[k]) && r[k] >= 0));
    ['preparationFinalized', 'hasEnteredArchive', 'broken'].forEach(k => requireThat(typeof r[k] === 'boolean'));
    requireThat(typeof r.createdMatchID === 'string' && Number.isFinite(r.createdAt) && Number.isInteger(r.appearanceSeed) && r.appearanceSeed >= 0 && r.appearanceSeed <= 255);
    requireThat(r.brokenAt === null || Number.isFinite(r.brokenAt));
  }
  function prepare(root, choice) {
    requireThat(validTreatment(choice));
    const r = copy(root);
    if (!r.preparationFinalized && !r.hasEnteredArchive) {
      r.treatment = choice; r.initialAbility = r.rawAbility + TREATMENTS[choice].bonus;
      r.currentAbility = r.initialAbility; r.preparationFinalized = true;
    }
    return r;
  }
  function resolve(roots, rng, id, now) {
    requireThat(roots.length === 2 && !roots.some(r => r.broken)); roots.forEach(validateRoot);
    const before = copy(roots), noise = [rng.integer(-15, 15), rng.integer(-15, 15)];
    const powers = before.map((r, i) => r.currentAbility + noise[i]);
    const tieWinner = powers[0] === powers[1] ? rng.integer(0, 1) : null;
    const winner = tieWinner === null ? (powers[0] > powers[1] ? 0 : 1) : tieWinner;
    const wear = damage(before[1 - winner].currentAbility, before[winner].rarity, before[winner].treatment), after = copy(before);
    const won = after[winner], lost = after[1 - winner];
    won.estimatedWear = estimatedWear(won) + damage(70, won.rarity, won.treatment);
    won.currentAbility = Math.max(1, won.currentAbility - wear); won.wins++; won.streak++; won.bestStreak = Math.max(won.bestStreak, won.streak);
    lost.broken = true; lost.brokenAt = now; lost.streak = 0;
    return { id: id, before: before, after: after, noise: noise, winner: winner, tieWinner: tieWinner, damage: wear };
  }
  class MatchClock {
    constructor(result) { this.result = copy(result); this.elapsed = 0; this.tension = 0; this.damage = [0, 0]; this.outcome = null; }
    resetHold() { if (this.outcome === null) { this.elapsed = 0; this.tension = 0; this.damage = [0, 0]; } }
    step(dt, pulls) {
      if (this.outcome !== null || !(dt > 0) || !Number.isFinite(dt) || !Array.isArray(pulls) || pulls.length !== 2) return;
      if (!pulls.every(p => p.held)) { this.resetHold(); return; }
      this.elapsed += Math.min(dt, 1 / 30);
      this.tension += (0.65 + pulls.reduce((sum, p) => sum + p.distance, 0) * 0.2 - this.tension) * Math.min(1, dt * 9);
      this.damage[1 - this.result.winner] = Math.min(1, this.elapsed / 2);
      if (this.elapsed + 1e-9 >= 2) this.outcome = { broken: 1 - this.result.winner, winner: this.result.winner };
    }
  }
  function collection(roots) {
    return copy(stableSort(roots.filter(r => r.owner === 'player' && r.hasEnteredArchive && !r.broken), (a, b) =>
      b.rarity - a.rarity || TREATMENTS[a.treatment].order - TREATMENTS[b.treatment].order || b.wins - a.wins));
  }
  const STORY = { swept: '一根挑两局，今天它说了算。', oldHero: '还得是我的千年根儿王！', newHero: '刚从叶子堆里摸出来，就给我长脸了。', newBroken: '才认识一会儿，就跟我分两头了。', tryAgain: '今天手气歇班，明天再来。', won: '今天这把，拔得漂亮！' };
  function summary(m) {
    if (!m || m.phase !== 'finished' || !m.settlementApplied) return null;
    const playerWon = m.score[1] === 2, winners = m.roster[1].filter(id => (m.roundWins[id] || 0) > 0);
    let story, contributorID = null;
    if (playerWon) {
      contributorID = winners.find(id => m.roundWins[id] >= 2) || null;
      if (contributorID) story = 'swept';
      else {
        const decisive = m.pending && m.pending.winner === 1 ? m.pending.before[1].id : null;
        contributorID = (winners.includes(decisive) ? decisive : winners[0]) || null;
        story = contributorID ? (m.newIDs.includes(contributorID) ? 'newHero' : 'oldHero') : 'won';
      }
    } else story = m.roster[1].some(id => m.newIDs.includes(id) && m.workingRoots.find(r => r.id === id).broken) ? 'newBroken' : 'tryAgain';
    return { playerWon: playerWon, title: playerWon ? '你赢啦！' : '你输啦！', story: story, text: STORY[story], contributorID: contributorID };
  }
  function available(roots, owner) { return roots.filter(r => r.owner === owner && r.hasEnteredArchive && !r.broken); }
  function lookup(s, id) { const r = (s.active ? s.active.workingRoots : s.roots).find(r => r.id === id); requireThat(r, '根不存在'); return r; }
  function newID(s, kind) { const id = 'web-' + kind + '-' + s.nextID; s.nextID++; requireThat(Number.isSafeInteger(s.nextID)); return id; }
  function draw(s, owner, now) {
    const rng = new SeededRandom(s.rngHex), roll = rng.integer(0, 99), rarity = roll < 55 ? 0 : roll < 95 ? 1 : 2;
    const ability = BASE[rarity] + rng.integer(-5, 5); s.rngHex = rng.hex;
    const id = newID(s, 'root');
    let visual = 0; for (let i = 0; i < id.length; i++) visual = (visual * 31 + id.charCodeAt(i)) & 255;
    return { id: id, owner: owner, rarity: rarity, rawAbility: ability, initialAbility: ability, currentAbility: ability,
      estimatedWear: 0, treatment: 'none', preparationFinalized: false, hasEnteredArchive: false, wins: 0, streak: 0, bestStreak: 0, broken: false,
      createdAt: now, brokenAt: null, createdMatchID: s.active.id, appearanceSeed: visual };
  }
  function lockAI(s) {
    const m = s.active;
    if (!m || m.phase !== 'selection' || m.selections[0] !== null) return;
    const roots = m.roster[0].map(id => lookup(s, id)).filter(r => !r.broken), rng = new SeededRandom(s.rngHex);
    m.selections[0] = chooseBest(roots, rng); s.rngHex = rng.hex;
  }
  function chooseTreatment(s, id, choice) {
    const m = s.active, r = lookup(s, id);
    requireThat(m && m.phase === 'treatment' && m.roster[1].includes(id) && m.newIDs.includes(id) && !r.preparationFinalized && !r.hasEnteredArchive && validTreatment(choice));
    requireThat(choice === 'none' || !m.roster[1].some(other => other !== id && m.choices[other] === choice));
    m.workingRoots[m.workingRoots.findIndex(r => r.id === id)] = prepare(r, choice); m.choices[id] = choice;
  }
  function finishPreparation(s, now, tauntRandom) {
    const m = s.active; requireThat(m && m.phase === 'treatment');
    m.roster[1].forEach(id => { if (m.newIDs.includes(id)) { const i = m.workingRoots.findIndex(r => r.id === id); m.workingRoots[i] = prepare(m.workingRoots[i], m.choices[id] || 'none'); } });
    const rng = new SeededRandom(s.rngHex), team = chooseTeam(m.candidates[0].map(id => lookup(s, id)), available(m.workingRoots, 'ai'), rng);
    s.rngHex = rng.hex; m.roster[0] = team.roots.map(r => r.id);
    team.fresh.forEach((r, i) => {
      const choice = i === 0 ? 'shoe' : i === 1 ? 'salt' : 'none';
      m.workingRoots[m.workingRoots.findIndex(root => root.id === r.id)] = prepare(r, choice); m.choices[r.id] = choice;
    });
    enterSelection(s, tauntRandom);
  }
  function mergedRoots(s) {
    const roots = copy(s.roots), m = s.active, ids = m.roster[0].concat(m.roster[1]);
    m.workingRoots.filter(r => ids.includes(r.id)).forEach(r => { const i = roots.findIndex(old => old.id === r.id); if (i < 0) roots.push(copy(r)); else roots[i] = copy(r); });
    return roots;
  }
  function finishMatch(s) {
    const m = s.active; if (m.settlementApplied) return;
    requireThat(m.score.includes(2)); const selected = m.roster[0].concat(m.roster[1]);
    m.workingRoots.forEach(r => {
      if (!selected.includes(r.id)) return;
      if (m.newIDs.includes(r.id) && !m.participants.includes(r.id) && !r.broken) { r.estimatedWear = estimatedWear(r) + 2; r.currentAbility = Math.max(1, r.currentAbility - 2); }
      r.hasEnteredArchive = true;
    });
    m.settlementApplied = true; m.phase = 'finished';
    s.pendingCommit = { format: 'bagen-web', schemaVersion: 1, commitID: m.id, roots: mergedRoots(s), rngHex: s.rngHex, nextID: s.nextID };
  }
  function validateState(s) {
    requireThat(s.schemaVersion === 1 && Array.isArray(s.roots) && unique(s.roots.map(r => r.id)) && Number.isSafeInteger(s.nextID) && s.nextID > 0);
    new SeededRandom(s.rngHex); s.roots.forEach(validateRoot);
    if (!s.active) { requireThat(s.pendingCommit === null); return; }
    const m = s.active; m.workingRoots.forEach(validateRoot);
    requireThat(unique(m.workingRoots.map(r => r.id)) && m.roster.length === 2 && m.score.length === 2 && m.selections.length === 2);
    const all = m.roster[0].concat(m.roster[1]); requireThat(unique(all) && m.roster.every(ids => ids.length <= 3));
    m.roster.forEach((ids, side) => ids.forEach(id => requireThat(lookup(s, id).owner === (side ? 'player' : 'ai'))));
    requireThat(m.score.every(n => Number.isInteger(n) && n >= 0 && n <= 2));
    requireThat(m.participants.every(id => all.includes(id)) && m.newIDs.every(id => m.workingRoots.some(r => r.id === id)));
    requireThat(Object.keys(m.roundWins).every(id => m.participants.includes(id) && [1, 2].includes(m.roundWins[id])) && Object.values(m.roundWins).reduce((a, b) => a + b, 0) === m.applied.length);
    if (!['roster', 'treatment'].includes(m.phase)) requireThat(m.roster.every(ids => ids.length === 3));
    if (['battle', 'roundResult', 'finished'].includes(m.phase)) requireThat(m.pending && m.pending.before.every((r, side) => r.id === m.selections[side]));
  }
  class Game {
    constructor(options) {
      options = options || {}; this._revision = 0; this._now = options.now || Date.now;
      // Presentation draws must never consume the battle RNG.
      this._tauntRandom = options.tauntRandom || Math.random;
      const archive = options.archive;
      if (archive) {
        requireThat(archive.format === 'bagen-web' && archive.schemaVersion === 1 && typeof archive.commitID === 'string' && Array.isArray(archive.roots) && archive.roots.every(r => r.hasEnteredArchive), '存档版本无法识别，请保留原记录');
        this._state = { schemaVersion: 1, roots: copy(archive.roots), rngHex: archive.rngHex, nextID: archive.nextID, active: null, pendingCommit: null, lastCommitID: archive.commitID, paused: false, pauseReason: null, inputEpoch: 0 };
      } else this._state = { schemaVersion: 1, roots: [], rngHex: new SeededRandom(options.seed).hex, nextID: 1, active: null, pendingCommit: null, lastCommitID: '', paused: false, pauseReason: null, inputEpoch: 0 };
      validateState(this._state);
    }
    get revision() { return this._revision; }
    get inputState() { const s=this._state,m=s.active;return {matchID:m?m.id:null,phase:m?m.phase:null,roundID:m&&m.pending?m.pending.id:null,paused:s.paused,inputEpoch:s.inputEpoch}; }
    get snapshot() { return copy(this._state); }
    get collectionRoots() { return collection(this._state.roots); }
    get result() { return this._state.active && this._state.lastCommitID === this._state.active.id ? summary(this._state.active) : null; }
    get pendingCommit() { return copy(this._state.pendingCommit); }
    archiveSnapshot() { const s = this._state; return copy({ format: 'bagen-web', schemaVersion: 1, commitID: s.lastCommitID, roots: s.roots, rngHex: s.rngHex, nextID: s.nextID }); }
    dispatch(action) {
      requireThat(action && typeof action.type === 'string'); const s = copy(this._state), m = s.active, now = this._now();
      requireThat(Number.isFinite(now));
      if (action.type === 'settleRound' && (s.paused || !m || m.phase !== 'battle' || action.matchID !== m.id || !m.pending || action.roundID !== m.pending.id || m.applied.includes(m.pending.id))) return this.snapshot;
      if (action.type === 'commitSucceeded' && !s.pendingCommit && s.lastCommitID === action.commitID) return this.snapshot;
      if (action.type === 'discard') { s.active = null; s.pendingCommit = null; s.paused = false; s.pauseReason = null; s.inputEpoch++; }
      else if (action.type === 'interrupt') {
        if (m && ['battle', 'roundResult'].includes(m.phase) && !s.paused) { s.paused = true; s.pauseReason = 'interruption'; }
        s.inputEpoch++;
      } else if (action.type === 'restore') {
        if (s.pauseReason === 'interruption') { s.paused = false; s.pauseReason = null; s.inputEpoch++; }
      } else if (action.type === 'pause') {
        if (m && !['roster', 'treatment'].includes(m.phase)) { s.paused = true; s.pauseReason = 'manual'; }
        s.inputEpoch++;
      } else if (action.type === 'resume') { s.paused = false; s.pauseReason = null; s.inputEpoch++; }
      else if (action.type === 'commitSucceeded') {
        requireThat(s.pendingCommit && action.commitID === s.pendingCommit.commitID && m && m.id === action.commitID, '提交已过期或已经完成');
        s.roots = copy(s.pendingCommit.roots); s.lastCommitID = action.commitID; s.pendingCommit = null;
      } else {
        requireThat(!s.paused, '本场已暂停，请先继续');
        requireThat(!s.pendingCommit, '整场尚未保存，请重试同一提交或退出');
        switch (action.type) {
          case 'begin':
            requireThat(!m || m.phase === 'finished');
            s.paused = false; s.pauseReason = null; s.inputEpoch++;
            s.active = { id: newID(s, 'match'), workingRoots: copy(s.roots), candidates: [[], []], roster: [[], []],
              lastRoundWinner: null, tauntID: null, phase: 'roster', score: [0, 0], choices: {}, selections: [null, null], newIDs: [], participants: [], applied: [], roundWins: {}, pending: null, settlementApplied: false };
            break;
          case 'drawCandidates':
            requireThat(m && m.phase === 'roster'); if (m.candidates[1].length) break;
            requireThat(m.roster[1].length === 0);
            for (let i = 0; i < 3; i++) { const r = draw(s, 'player', now); m.workingRoots.push(r); m.candidates[1].push(r.id); m.newIDs.push(r.id); }
            for (let i = 0; i < 3; i++) { const r = draw(s, 'ai', now); m.workingRoots.push(r); m.candidates[0].push(r.id); m.newIDs.push(r.id); }
            m.roster[1] = m.candidates[1].slice(); break;
          case 'setPlayerRoster': {
            const ids = action.ids; requireThat(m && m.phase === 'roster' && Array.isArray(ids) && ids.length <= 3 && unique(ids));
            requireThat(ids.every(id => (m.candidates[1].includes(id) || available(s.roots, 'player').some(r => r.id === id)) && !lookup(s, id).broken));
            m.roster[1] = ids.slice(); Object.keys(m.choices).forEach(id => { if (!ids.includes(id)) delete m.choices[id]; }); break;
          }
          case 'finishRoster':
            requireThat(m && m.phase === 'roster' && m.roster[1].length === 3); m.phase = 'treatment';
            if (!m.roster[1].some(id => m.newIDs.includes(id))) finishPreparation(s, now, this._tauntRandom); break;
          case 'chooseTreatment': chooseTreatment(s, action.id, action.choice); break;
          case 'finishPreparation': finishPreparation(s, now, this._tauntRandom); break;
          case 'lockAI': lockAI(s); break;
          case 'select': {
            requireThat(m && m.phase === 'selection' && m.selections[1] === null && m.roster[1].includes(action.id) && !lookup(s, action.id).broken);
            m.selections[1] = action.id; const rng = new SeededRandom(s.rngHex);
            s.inputEpoch++; m.pending = resolve(m.selections.map(id => lookup(s, id)), rng, newID(s, 'round'), now); s.rngHex = rng.hex; m.phase = 'battle'; break;
          }
          case 'settleRound': {
            // Stale callbacks must carry both identities; they never settle another round.
            if (s.paused || !m || m.phase !== 'battle' || action.matchID !== m.id || !m.pending || action.roundID !== m.pending.id || m.applied.includes(m.pending.id)) break;
            const r = m.pending;
            r.after.forEach(updated => { m.workingRoots[m.workingRoots.findIndex(root => root.id === updated.id)] = copy(updated); });
            const winnerID = r.before[r.winner].id; m.roundWins[winnerID] = (m.roundWins[winnerID] || 0) + 1;
            m.applied.push(r.id); r.before.forEach(root => { if (!m.participants.includes(root.id)) m.participants.push(root.id); });
            m.lastRoundWinner = r.winner; m.score[r.winner]++; s.inputEpoch++; m.phase = 'roundResult'; if (m.score.includes(2)) finishMatch(s); break;
          }
          case 'nextRound':
            requireThat(m && m.phase === 'roundResult'); s.inputEpoch++; m.selections = [null, null]; m.pending = null; enterSelection(s, this._tauntRandom); break;
          default: throw Error('未知游戏操作');
        }
      }
      validateState(s); this._state = s; this._revision++; return this.snapshot;
    }
  }
  // Uses the same touch ownership/arrival clock as both batch-2 probes.
  // The platform adapter supplies only new touchstart events, never residual fingers.
  class BattleSession {
    constructor(game) {
      requireThat(scope.BagenCore && scope.BagenCore.HoldProbe, '请先加载共用双指输入核心');
      const s = game.snapshot; requireThat(s.active && s.active.phase === 'battle');
      this.game = game; this.matchID = s.active.id; this.roundID = s.active.pending.id;
      this.epoch = s.inputEpoch; this.input = new scope.BagenCore.HoldProbe();
    }
    sync() {
      const s = this.game.inputState;
      if (s.matchID !== this.matchID || s.phase !== 'battle' || s.roundID !== this.roundID) { this.input.discard(); return false; }
      if (this.epoch !== s.inputEpoch) { this.epoch = s.inputEpoch; this.input.reset(); }
      if (s.paused) { this.input.pause(); return false; }
      return true;
    }
    begin(id, endpoint) { return this.sync() && this.input.begin(id, endpoint); }
    move(id, distance) { if (this.sync()) this.input.move(id, distance); }
    release(id) { this.input.release(id); }
    advance(dt) {
      if (!this.sync()) return;
      this.input.step(dt);
      if (this.input.phase === 'finished') this.game.dispatch({ type: 'settleRound', matchID: this.matchID, roundID: this.roundID });
    }
  }
  scope.BagenRules = { taunts: TAUNTS, Game: Game, BattleSession: BattleSession, MatchClock: MatchClock, SeededRandom: SeededRandom, damage: damage, prepare: prepare, resolve: resolve, collection: collection, summary: summary, estimate: estimate, estimatedWear: estimatedWear, chooseTeam: chooseTeam, chooseBest: chooseBest };
})(typeof window === 'undefined' ? globalThis : window);

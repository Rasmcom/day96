(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('ar-SA', { useGrouping: false }).format(value);
  const E = window.NationalQuizEngine;
  const domains = window.quizData;
  const defaults = ['الصقور', 'طويق', 'الهمّة', 'العزّ', 'الأصالة', 'الطموح'];
  const names = defaults.map((name, i) => String(window.QUIZ_CUSTOMIZATION?.defaultNames?.[i] || name).slice(0, 32));
  $('custom-school-name').textContent = window.QUIZ_CUSTOMIZATION?.schoolName || '';
  $('custom-school-name').hidden = !$('custom-school-name').textContent; 
  const symbolSources = [
    'https://c.top4top.io/p_3544gudjn1.png', 'https://d.top4top.io/p_3544yidvr2.png',
    'https://e.top4top.io/p_35446wwkw3.png', 'https://f.top4top.io/p_3544jiwt74.png',
    'https://g.top4top.io/p_3544dbcs15.png', 'https://h.top4top.io/p_3544di0dv6.png'
  ];
  const originalMusic = 'assets/watani-alhabib-vocals.mp3';
  const colors = ['#d4ea65', '#b8a6e1', '#eea17f', '#77d5cc', '#e6b7d2', '#e8ca7a'];
  const inkColors = ['#597820', '#725392', '#a3492b', '#19766e', '#993866', '#8b6c24'];
  const softColors = ['#e9eecf', '#ece5f6', '#f6e3d9', '#dceddf', '#f6e2ef', '#f4ebd5'];
  const titles = ['التاريخ الوطني', 'الثقافة السعودية', 'الإنجازات التنموية', 'رؤية السعودية ٢٠٣٠', 'الجغرافيا والطبيعة', 'الشخصيات الوطنية'];
  const descriptions = ['حكاية البدايات', 'أصالة نعيشها', 'وطن ينجز', 'طموح بلا حدود', 'أرض الدهشة', 'أسماء صنعت الأثر'];
  let teamCount = 2, selectedDomains = new Set([0]), round = null, screen = 'lobby', consent = false, startPending = false, soundEnabled = false, toastTimer;
  let firstEntry = true, entering = false, launchTimer = 0, launchBusy = false, celebrationTimer = 0, volumeTimer = 0, motionPaused = false;
  let questionDuration = 30, activeDuration = 30, clockMode = null;
  const clock = window.QuizClock.create();
  try { const stored = Number(localStorage.getItem('izzna-question-duration')); if (Number.isInteger(stored) && stored >= 5 && stored <= 300) questionDuration = stored; } catch {}
  const audio = new window.QuizAudio($('background-music'), originalMusic, updateMusicState);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function showToast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
  function stopClock() { clock.stop(); clockMode = null; }
  function clockBlocked() { return document.hidden || !$('entrance').hidden || Boolean(document.querySelector('dialog[open]')); }
  function syncClockPause() {
    if (!clock.active) return;
    if (clockBlocked()) clock.pause(); else clock.resume();
    $('question-timer').classList.toggle('is-paused', clock.paused);
    if (clockMode === 'question') $('timer-label').textContent = clock.paused ? 'الوقت متوقف' : 'ثانية متبقية';
    else if (clockMode === 'advance') renderAdvanceTick(clock.remaining);
  }
  function openDialog(id) { $(id).showModal(); syncClockPause(); }
  function renderQuestionTick(ms) {
    if (clockBlocked()) { syncClockPause(); return; }
    const seconds = Math.ceil(ms / 1000);
    $('timer-seconds').textContent = number(seconds);
    $('question-timer').style.setProperty('--time-left', `${Math.max(0, ms / (activeDuration * 1000) * 100)}%`);
    $('question-timer').classList.toggle('is-urgent', seconds <= 5);
    $('question-timer').setAttribute('aria-label', `الوقت المتبقي للسؤال: ${number(seconds)} ثانية`);
  }
  function startQuestionClock() {
    stopClock(); if (screen !== 'arena' || !round || round.complete || round.answered || launchBusy) return;
    activeDuration = questionDuration; clockMode = 'question';
    const currentRound = round, index = round.index;
    $('timer-label').textContent = 'ثانية متبقية';
    clock.start(activeDuration * 1000, renderQuestionTick, () => {
      if (round === currentRound && round.index === index && screen === 'arena' && !round.complete) expireQuestion();
    });
    syncClockPause();
  }
  function renderAdvanceTick(ms) {
    if (clockBlocked()) clock.pause();
    const last = round.index + 1 === round.questions.length;
    $('auto-next-status').textContent = clock.paused ? 'الانتقال متوقف مؤقتًا' : `${last ? 'النتائج' : 'السؤال التالي'} تلقائيًا خلال ${number(Math.ceil(ms / 1000))} ثوانٍ`;
  }
  function startAdvanceClock() {
    stopClock(); clockMode = 'advance';
    const currentRound = round, index = round.index;
    $('auto-next-status').hidden = false;
    clock.start(5000, renderAdvanceTick, () => {
      if (round === currentRound && round.index === index && screen === 'arena' && !round.complete) nextQuestion();
    });
    syncClockPause();
  }
  function updateDurationSettings() {
    $('question-duration').value = String(questionDuration); $('setup-duration').textContent = `${number(questionDuration)} ثانية`;
    document.querySelectorAll('[data-duration]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === questionDuration)));
  }
  function showScreen(nextScreen) {
    screen = nextScreen;
    for (const id of ['lobby', 'arena', 'results']) $(id).hidden = id !== nextScreen;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const focusTarget = $(nextScreen === 'arena' ? 'question-title' : nextScreen === 'results' ? 'results-title' : 'lobby-title');
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  function selectedTopics() { return [...selectedDomains].sort((a, b) => a - b).map(id => ({ ...domains[id], id })); }
  function selectionTitle() { return selectedDomains.size === 1 ? titles[[...selectedDomains][0]] : selectedDomains.size === domains.length ? 'جميع المجالات' : `${number(selectedDomains.size)} مجالات متنوعة`; }
  function teamEmblem(id, className = 'team-symbol') {
    const symbol = node('span', `${className} national-symbol`);
    symbol.setAttribute('aria-hidden', 'true');
    const fallback = node('span', 'symbol-fallback', number(id + 1));
    const img = node('img'); img.alt = ''; img.decoding = 'async'; img.draggable = false;
    img.addEventListener('load', () => { if (img.naturalWidth) { symbol.classList.add('symbol-loaded'); } }, { once: true });
    img.addEventListener('error', () => { img.hidden = true; }, { once: true });
    img.src = symbolSources[id]; symbol.append(fallback, img); return symbol;
  }
  function setEntrance(open) {
    $('entrance').hidden = !open; document.body.classList.toggle('entrance-active', open);
    for (const el of [$('main'), document.querySelector('.site-header'), document.querySelector('.site-footer')]) el.inert = open;
    if (open) { $('entrance').classList.remove('is-opening'); entering = false; $('enter-button').disabled = false; $('enter-button').querySelector('.enter-button-label').textContent = screen === 'arena' ? 'العودة إلى التحدّي' : 'ادخل ساحة التحدّي'; $('enter-button').focus({ preventScroll: true }); }
    syncClockPause();
  }
  function enterScene(silent = false) {
    if (entering) return; entering = true; $('enter-button').disabled = true;
    if (firstEntry && !silent) startMusic();
    firstEntry = false; $('entrance').classList.add('is-opening');
    if (!motionPaused && !reducedMotion.matches) window.ArenaEffects?.burst('entry');
    setTimeout(() => { setEntrance(false); entering = false; document.body.classList.add('has-entered'); $(screen === 'arena' ? 'question-title' : screen === 'results' ? 'results-title' : 'lobby-title').focus({ preventScroll: true }); }, reducedMotion.matches || motionPaused ? 0 : 780);
  }
  function toggleMotion() {
    motionPaused = !motionPaused; document.body.classList.toggle('motion-paused', motionPaused);
    if (motionPaused) window.ArenaEffects?.clear();
    for (const id of ['motion-button', 'entrance-motion-button']) { $(id).setAttribute('aria-pressed', String(motionPaused)); $(id).textContent = motionPaused ? 'تشغيل الحركة' : 'إيقاف الحركة'; }
  }
  function teamStyle(el, i, light = false) {
    el.style.setProperty('--team-color', light ? inkColors[i] : colors[i]);
    el.style.setProperty('--team-soft', light ? softColors[i] : `${colors[i]}22`);
  }
  function renderTeamCount() {
    $('team-count').replaceChildren();
    for (let count = 2; count <= 6; count++) {
      const button = node('button', 'count-button', number(count));
      button.type = 'button';
      button.setAttribute('aria-label', `${number(count)} فرق`);
      button.setAttribute('aria-pressed', String(count === teamCount));
      button.addEventListener('click', () => { readNames(); teamCount = count; renderTeamCount(); renderNames(); updateSummary(); $('setup-error').hidden = true; $('team-count').children[count - 2].focus({ preventScroll: true }); });
      $('team-count').append(button);
    }
  }
  function readNames() { document.querySelectorAll('[data-team-name]').forEach(input => names[Number(input.dataset.teamName)] = input.value); }
  function renderNames() {
    $('team-names').replaceChildren();
    for (let i = 0; i < teamCount; i++) {
      const wrap = node('label', 'team-input-wrap'); teamStyle(wrap, i, true);
      const symbol = teamEmblem(i);
      const label = node('span', 'sr-only', `اسم الفريق ${number(i + 1)}`);
      const input = node('input'); input.type = 'text'; input.maxLength = 32; input.value = names[i]; input.dataset.teamName = String(i); input.autocomplete = 'off'; input.placeholder = `الفريق ${number(i + 1)}`;
      input.addEventListener('input', () => { names[i] = input.value; $('setup-error').hidden = true; input.removeAttribute('aria-invalid'); });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') requestStart(); });
      wrap.append(symbol, label, input); $('team-names').append(wrap);
    }
  }
  function renderDomains() {
    $('domain-grid').replaceChildren();
    domains.forEach((domain, i) => {
      const button = node('button', 'domain-card'); button.type = 'button'; button.dataset.domain = String(i);
      button.style.setProperty('--tile-color', domain.color); button.setAttribute('aria-pressed', String(selectedDomains.has(i)));
      button.setAttribute('aria-label', `${titles[i]}، ${number(domain.questions.length)} سؤالًا`);
      const visual = node('span', `domain-visual atlas atlas-${i}`); visual.setAttribute('aria-hidden', 'true');
      const check = node('span', 'selected-check', '✓'); check.setAttribute('aria-hidden', 'true');
      const label = node('span', 'domain-label'); label.append(node('strong', '', titles[i]));
      const sub = node('span', '', descriptions[i]); sub.append(node('span', '', `${number(domain.questions.length)} سؤالًا`)); label.append(sub);
      button.append(visual, check, label);
      button.addEventListener('click', () => { if (selectedDomains.has(i)) selectedDomains.delete(i); else selectedDomains.add(i); document.querySelectorAll('.domain-card').forEach((card, j) => card.setAttribute('aria-pressed', String(selectedDomains.has(j)))); $('setup-error').hidden = true; updateSummary(); });
      $('domain-grid').append(button);
    });
  }
  function updateSummary() {
    let total = 0;
    try { total = E.planRound(selectedTopics(), teamCount).count; } catch {}
    $('selected-summary').textContent = selectedDomains.size ? selectionTitle() : 'اختر مجالًا للمنافسة';
    $('round-count').textContent = `${number(total)} سؤالًا · ${number(total / teamCount)} لكل فريق`;
    $('selection-count').textContent = selectedDomains.size === 1 ? 'مجال واحد محدد' : `${number(selectedDomains.size)} مجالات محددة`;
    $('select-all-domains').setAttribute('aria-pressed', String(selectedDomains.size === domains.length));
    $('select-all-domains').textContent = selectedDomains.size === domains.length ? 'إلغاء اختيار الكل' : 'اختيار الكل';
  }
  function validateSetup() {
    readNames();
    try { E.createRound(names.slice(0, teamCount), selectedTopics()); $('setup-error').hidden = true; return true; }
    catch (error) { $('setup-error').textContent = error.message; $('setup-error').hidden = false; const blank = [...document.querySelectorAll('[data-team-name]')].find(input => !input.value.trim()); if (blank) { blank.setAttribute('aria-invalid', 'true'); blank.focus(); } return false; }
  }
  function requestStart() {
    if (!validateSetup()) return false;
    if (!consent) { startPending = true; openDialog('terms-dialog'); return false; }
    beginRound(); return true;
  }
  function beginRound() {
    if (launchBusy) return;
    try { round = E.createRound(names.slice(0, teamCount), selectedTopics()); }
    catch (error) { showToast(error.message); return; }
    stopClock(); launchBusy = true; clearCelebration();
    document.querySelector('.question-progress').setAttribute('aria-valuemax', String(round.questions.length));
    renderQuestion(); showScreen('arena');
    const layer = $('launch-sequence'); layer.hidden = false;
    $('main').inert = true; document.querySelector('.site-header').inert = true; document.querySelector('.site-footer').inert = true;
    $('skip-launch').focus({ preventScroll: true });
    let count = 3;
    const advance = () => {
      $('launch-number').textContent = count > 0 ? number(count) : 'يلا!';
      $('launch-caption').textContent = count > 0 ? `${number(teamCount)} فرق · ${selectionTitle()}` : `البداية مع ${round.teams[0].name}`;
      if (!reducedMotion.matches && !motionPaused) $('launch-number').animate?.([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 430, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (count-- > 0) launchTimer = setTimeout(advance, 680); else launchTimer = setTimeout(finishLaunch, 620);
    };
    if (reducedMotion.matches || motionPaused) finishLaunch(); else advance();
  }
  function finishLaunch() {
    if (!launchBusy) return; clearTimeout(launchTimer); launchBusy = false; $('launch-sequence').hidden = true;
    $('main').inert = false; document.querySelector('.site-header').inert = false; document.querySelector('.site-footer').inert = false;
    $('question-title').focus({ preventScroll: true });
    startQuestionClock();
  }
  function renderScores(scoredId = -1) {
    $('live-scores').replaceChildren();
    const activeId = round.index % round.teams.length;
    for (const team of round.teams) {
      const row = node('div', `live-score${team.id === activeId ? ' active' : ''}${team.id === scoredId ? ' scored' : ''}`); teamStyle(row, team.id);
      const symbol = teamEmblem(team.id);
      const name = node('div', 'score-name'); name.append(node('strong', '', team.name), node('span', '', team.id === activeId ? 'الدور الآن' : `أجاب عن ${number(team.attempts)} سؤال`));
      const score = node('strong', 'score-points', number(team.score)); score.setAttribute('aria-label', `${number(team.score)} نقطة`);
      row.append(symbol, name, score); $('live-scores').append(row);
    }
  }
  function renderQuestion() {
    const displayedRound = round, displayedIndex = round.index;
    const question = round.questions[round.index], active = round.teams[round.index % round.teams.length];
    $('active-team').textContent = active.name; $('active-team-symbol').replaceChildren(teamEmblem(active.id));
    $('arena-domain-name').textContent = titles[question.domainId]; $('arena-domain-image').className = `arena-domain-art atlas atlas-${question.domainId}`; $('question-category').textContent = titles[question.domainId]; document.documentElement.style.setProperty('--accent', colors[active.id]);
    $('question-number').textContent = number(round.index + 1).padStart(2, '٠'); $('question-total').textContent = number(round.questions.length);
    $('question-title').textContent = question.q; $('progress-fill').style.width = `${round.index / round.questions.length * 100}%`;
    document.querySelector('.question-progress').setAttribute('aria-valuenow', String(round.index));
    if ($('answer-options').contains(document.activeElement)) document.activeElement.blur();
    $('answer-options').className = 'answer-options'; $('answer-options').replaceChildren();
    question.options.forEach((option, i) => {
      const button = node('button', 'answer-button'); button.type = 'button'; button.dataset.option = String(i);
      const letter = node('span', 'answer-letter', ['أ', 'ب', 'ج', 'د'][i]); letter.setAttribute('aria-hidden', 'true');
      button.append(letter, node('span', 'answer-text', option), node('span', 'answer-mark'));
      button.addEventListener('click', () => {
        // An event queued for a removed answer must never answer the new question.
        if (round !== displayedRound || round.index !== displayedIndex) return;
        submitAnswer(i);
      }); $('answer-options').append(button);
    });
    $('feedback').hidden = true; $('feedback').classList.remove('timed-out'); $('feedback').replaceChildren(); $('next-button').hidden = true; $('answer-hint').hidden = false; $('auto-next-status').hidden = true;
    $('question-timer').classList.remove('is-paused', 'is-urgent'); $('timer-label').textContent = 'ثانية متبقية';
    $('timer-seconds').textContent = number(questionDuration); $('question-timer').style.setProperty('--time-left', '100%');
    $('next-team-hint').textContent = '';
    $('question-panel').getAnimations?.().forEach(animation => animation.cancel());
    if (!reducedMotion.matches && !motionPaused) $('question-panel').animate?.([{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' });
    renderScores();
  }
  function submitAnswer(index) {
    if (screen !== 'arena' || !round || round.complete || round.answered || launchBusy || clockBlocked()) return false;
    if (clockMode === 'question' && clock.remaining <= 0) { expireQuestion(); return false; }
    const result = E.answer(round, index); if (!result) return false;
    revealAnswer(result, index); return result;
  }
  function expireQuestion() {
    const result = E.expire(round); if (!result) return false;
    revealAnswer(result, null); return result;
  }
  function revealAnswer(result, index) {
    stopClock();
    $('timer-label').textContent = result.timedOut ? 'انتهى الوقت' : 'تمت الإجابة';
    const question = round.questions[round.index]; $('answer-options').classList.add('answered');
    for (const button of $('answer-options').children) {
      const i = Number(button.dataset.option); button.disabled = true;
      if (question.options[i] === question.answer) { button.classList.add('correct'); button.querySelector('.answer-mark').textContent = '✓'; button.setAttribute('aria-label', `${question.options[i]}، الإجابة الصحيحة`); }
      else if (i === index) { button.classList.add('incorrect'); button.querySelector('.answer-mark').textContent = '×'; button.setAttribute('aria-label', `${question.options[i]}، إجابة غير صحيحة`); }
    }
    const icon = node('span', 'feedback-icon', result.correct ? '✦' : result.timedOut ? '◷' : '↶'); icon.setAttribute('aria-hidden', 'true');
    const copy = node('div'); copy.append(node('strong', '', result.correct ? `كفو! نقطة لفريق ${round.teams[result.teamId].name}` : result.timedOut ? 'انتهى الوقت… والتحدّي مستمر!' : 'محاولة جميلة، والمنافسة مستمرة.'));
    copy.append(node('p', '', result.correct ? 'إجابة صحيحة… معلومة ونقطة تستاهلونها.' : `الإجابة الصحيحة: ${question.answer}`));
    $('feedback').replaceChildren(icon, copy); $('feedback').hidden = false;
    $('feedback').classList.toggle('timed-out', Boolean(result.timedOut));
    $('progress-fill').style.width = `${(round.index + 1) / round.questions.length * 100}%`; document.querySelector('.question-progress').setAttribute('aria-valuenow', String(round.index + 1));
    const last = round.index + 1 === round.questions.length;
    $('next-button').firstElementChild.textContent = last ? 'النتائج الآن' : 'التالي الآن';
    $('next-button').hidden = false; $('answer-hint').hidden = true;
    $('next-team-hint').textContent = last ? 'اكتملت الأسئلة… من يتصدّر؟' : `يستعد فريق ${round.teams[(round.index + 1) % round.teams.length].name}`;
    renderScores(result.correct ? result.teamId : -1);
    if (result.correct) celebrateAnswer(result.teamId);
    startAdvanceClock();
    $('next-button').focus({ preventScroll: true });
    return result;
  }
  function nextQuestion() {
    if (screen !== 'arena' || !round || !round.answered || round.complete || launchBusy || clockBlocked()) return false;
    stopClock(); clearCelebration();
    const state = E.next(round); if (!state) return false;
    if (state === 'complete') showResults(); else { renderQuestion(); $('question-title').focus({ preventScroll: true }); startQuestionClock(); }
    return state;
  }
  function showResults() {
    stopClock(); clearCelebration();
    const teams = E.standings(round), winners = teams.filter(team => team.score === teams[0].score), topScore = teams[0].score;
    $('results-title').textContent = topScore === 0 ? 'المكسب… عرفنا وطننا أكثر.' : winners.length > 1 ? 'تعادل يليق بالأبطال!' : 'عزّ التحدّي… لكم!';
    $('winner-announcement').textContent = topScore === 0 ? 'تحدٍّ جديد وفرصة جديدة تنتظركم.' : winners.length > 1 ? `صدارة مشتركة: ${winners.map(team => team.name).join('، ')}` : `فريق ${winners[0].name}… أبطال هذه الجولة`;
    $('podium').replaceChildren();
    const featured = teams.slice(0, 3), ordered = featured.length > 1 ? [featured[1], featured[0], ...featured.slice(2)] : featured;
    for (const team of ordered) {
      const card = node('div', `podium-card${team.rank === 1 && topScore > 0 ? ' first' : team.rank === 3 ? ' third' : ''}`);
      card.append(teamEmblem(team.id, 'podium-symbol'), node('span', 'podium-rank', `المركز ${number(team.rank)}${teams.filter(t => t.rank === team.rank).length > 1 ? ' مكرر' : ''}`), node('strong', 'podium-name', team.name), node('strong', 'podium-points', number(team.score)), node('span', 'podium-unit', 'نقطة'));
      $('podium').append(card);
    }
    $('results-list').replaceChildren();
    for (const team of teams) {
      const row = node('div', 'results-row'), detail = node('div', 'result-detail');
      detail.append(node('strong', '', `${number(team.score)} نقطة`), node('small', '', `${number(team.attempts - team.timeouts)} إجابات · ${number(team.timeouts)} انتهى وقتها`));
      row.append(node('span', '', number(team.rank)), node('span', 'result-team', team.name), detail); $('results-list').append(row);
    }
    const answered = teams.reduce((total, team) => total + team.score, 0);
    const completed = teams.reduce((total, team) => total + team.attempts, 0);
    $('results-summary').textContent = `${round.endedEarly ? 'انتهت المسابقة بالنقاط الحالية · ' : ''}${selectionTitle()} · اكتمل ${number(completed)} من ${number(round.questions.length)} سؤالًا · ${number(answered)} إجابة صحيحة`;
    $('winner-emblem').replaceChildren(...(topScore > 0 ? winners.map(team => teamEmblem(team.id, 'winner-symbol')) : []));
    showScreen('results'); if (topScore > 0 && !motionPaused) window.ArenaEffects?.burst('win', colors[winners[0].id]);
  }
  function clearCelebration() {
    clearTimeout(celebrationTimer); clearTimeout(volumeTimer); $('answer-celebration').hidden = true; document.body.classList.remove('is-celebrating');
    audio.setDuck(1); window.ArenaEffects?.clear();
  }
  function celebrateAnswer(teamId) {
    clearCelebration(); const layer = $('answer-celebration');
    $('celebration-emblem').replaceChildren(teamEmblem(teamId, 'celebration-symbol'));
    $('celebration-team').textContent = `يا ${round.teams[teamId].name}`; layer.style.setProperty('--celebration-accent', colors[teamId]);
    if (!reducedMotion.matches && !motionPaused) {
      layer.hidden = false; document.body.classList.add('is-celebrating');
      window.ArenaEffects?.burst('correct', colors[teamId]);
      celebrationTimer = setTimeout(() => { layer.hidden = true; document.body.classList.remove('is-celebrating'); }, 1850);
    }
    if (soundEnabled) { audio.setDuck(.55); volumeTimer = setTimeout(() => audio.setDuck(1), 1900); }
  }
  function updateMusicState(state = audio) {
    soundEnabled = state.audible;
    const label = state.pending ? 'إلغاء تحميل الصوت' : state.playing ? state.muted ? 'إلغاء كتم الصوت' : 'كتم الصوت' : 'تشغيل الصوت';
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled)); $('sound-button').setAttribute('aria-label', label); $('sound-button').title = label;
    $('sound-button').classList.toggle('audio-pending', state.pending);
    const playLabel = state.pending ? 'إلغاء التحميل' : state.playing ? 'إيقاف الصوت' : 'تشغيل الصوت';
    $('music-play-button').textContent = playLabel; $('entrance-audio-button').textContent = playLabel;
    $('music-mute-button').textContent = state.muted ? 'إلغاء كتم الصوت' : 'كتم الصوت';
    $('music-mute-button').setAttribute('aria-pressed', String(state.muted)); $('music-mute-button').disabled = !state.playing;
    $('music-volume').value = String(Math.round(state.volume * 100));
    $('music-volume-output').textContent = `${number(Math.round(state.volume * 100))}٪`;
    $('volume-control').hidden = !state.canSetVolume; $('device-volume-note').hidden = state.canSetVolume;
    $('music-status').textContent = state.message;
  }
  function startMusic() { audio.play(); }
  function setMusicFile(file) {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac|ogg|flac|mp4)$/i.test(file.name)) { $('music-status').textContent = 'اختر ملفًا صوتيًا بصيغة MP3 أو M4A أو WAV.'; return; }
    $('music-source-label').textContent = file.name; audio.setSource(file);
  }
  $('start-button').addEventListener('click', requestStart);
  $('enter-button').addEventListener('click', () => enterScene());
  $('skip-entrance').addEventListener('click', () => enterScene(true));
  $('reopen-entrance').addEventListener('click', () => setEntrance(true));
  $('skip-launch').addEventListener('click', finishLaunch);
  $('motion-button').addEventListener('click', toggleMotion);
  $('entrance-motion-button').addEventListener('click', toggleMotion);
  $('select-all-domains').addEventListener('click', () => { selectedDomains = selectedDomains.size === domains.length ? new Set() : new Set(domains.map((_, i) => i)); renderDomains(); updateSummary(); });
  $('music-settings-button').addEventListener('click', () => openDialog('music-dialog'));
  $('music-play-button').addEventListener('click', () => audio.togglePlayback());
  $('music-mute-button').addEventListener('click', () => audio.toggleMute());
  $('entrance-audio-button').addEventListener('click', () => audio.togglePlayback());
  $('audio-file').addEventListener('change', event => setMusicFile(event.target.files?.[0]));
  $('music-volume').addEventListener('input', event => audio.setVolume(Number(event.target.value) / 100));
  $('reset-music').addEventListener('click', () => { $('audio-file').value = ''; $('music-source-label').textContent = 'وطني الحبيب بدون موسيقى'; audio.setSource(null); });
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('terms-button').addEventListener('click', () => { startPending = false; openDialog('terms-dialog'); });
  $('terms-consent').addEventListener('change', event => $('accept-terms').disabled = !event.target.checked);
  $('accept-terms').addEventListener('click', () => { if (!$('terms-consent').checked) return; consent = true; $('terms-dialog').close(); if (startPending) { startPending = false; beginRound(); } });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { const rect = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close(); }));
  $('leave-button').addEventListener('click', () => openDialog('leave-dialog'));
  $('confirm-leave').addEventListener('click', () => { stopClock(); $('leave-dialog').close(); clearCelebration(); round = null; showScreen('lobby'); });
  $('end-button').addEventListener('click', () => openDialog('end-dialog'));
  $('confirm-end').addEventListener('click', () => { stopClock(); $('end-dialog').close(); if (E.finish(round)) showResults(); });
  for (const id of ['settings-button', 'setup-timer-button']) $(id).addEventListener('click', () => { updateDurationSettings(); openDialog('settings-dialog'); });
  document.querySelectorAll('[data-duration]').forEach(button => button.addEventListener('click', () => {
    $('question-duration').value = button.dataset.duration;
    document.querySelectorAll('[data-duration]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  }));
  $('question-duration').addEventListener('input', () => document.querySelectorAll('[data-duration]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === Number($('question-duration').value)))));
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault(); const seconds = Number($('question-duration').value);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) return;
    questionDuration = seconds; try { localStorage.setItem('izzna-question-duration', String(seconds)); } catch {}
    updateDurationSettings(); $('settings-dialog').close();
    showToast(screen === 'arena' ? 'حُفظت المدة؛ تطبّق من السؤال التالي.' : 'حُفظت مدة السؤال.');
  });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', syncClockPause));
  document.addEventListener('visibilitychange', syncClockPause);
  window.addEventListener('pagehide', () => clock.pause());
  window.addEventListener('pageshow', syncClockPause);
  $('next-button').addEventListener('click', nextQuestion);
  $('replay-button').addEventListener('click', beginRound);
  $('new-domain-button').addEventListener('click', () => { stopClock(); round = null; showScreen('lobby'); });
  $('sound-button').addEventListener('click', () => audio.toggleMute());
  const fullScreenElement = document.documentElement;
  if (!fullScreenElement.requestFullscreen && !fullScreenElement.webkitRequestFullscreen) $('fullscreen-button').hidden = true;
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement || document.webkitFullscreenElement) { if (document.exitFullscreen) await document.exitFullscreen(); else document.webkitExitFullscreen(); } else { if (fullScreenElement.requestFullscreen) await fullScreenElement.requestFullscreen(); else fullScreenElement.webkitRequestFullscreen(); } }
    catch { showToast('ملء الشاشة غير متاح هنا. يمكنك تكبير نافذة المتصفح.'); }
  });
  function updateFullscreenLabel() { const label = document.fullscreenElement || document.webkitFullscreenElement ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'; $('fullscreen-button').setAttribute('aria-label', label); $('fullscreen-button').title = label; }
  document.addEventListener('fullscreenchange', updateFullscreenLabel); document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);
  $('total-questions').textContent = number(domains.reduce((total, domain) => total + domain.questions.length, 0));
  renderTeamCount(); renderNames(); renderDomains(); updateSummary(); updateDurationSettings(); updateMusicState(); setEntrance(true);
  function getState() {
    const current = screen === 'arena' && round ? round.questions[round.index] : null;
    return { screen, questionDuration, timer: { mode: clockMode, secondsRemaining: Math.ceil(clock.remaining / 1000), paused: clock.paused }, domain: selectionTitle(), domainIndices: [...selectedDomains], entranceOpen: !$('entrance').hidden, launchBusy, teamCount, teams: round ? round.teams.map(team => ({ name: team.name, score: team.score, attempts: team.attempts })) : names.slice(0, teamCount).map(name => ({ name })), questionNumber: current ? round.index + 1 : null, totalQuestions: round?.questions.length ?? null, activeTeam: current ? round.teams[round.index % teamCount].name : null, question: current ? { text: current.q, options: current.options, answered: round.answered, ...(round.answered ? { correctAnswer: current.answer } : {}) } : null };
  }
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: 'get_quiz_state', title: 'حالة المسابقة', description: 'Read the visible quiz setup, current question, turn and scores. The answer is only revealed after submission.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => getState() });
    register({ name: 'configure_quiz', title: 'إعداد المسابقة', description: 'Set team names and one or more quiz domains on the setup screen. Does not start or accept usage terms.', inputSchema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 32 }, minItems: 2, maxItems: 6 }, domainIndices: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 5 }, minItems: 1, maxItems: 6, uniqueItems: true } }, required: ['names', 'domainIndices'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: input => {
      if (screen !== 'lobby' || launchBusy || !$('entrance').hidden) throw new Error('Enter the competition and return to setup first.');
      if (!input || !Array.isArray(input.domainIndices) || !input.domainIndices.length || input.domainIndices.some(id => !Number.isInteger(id) || id < 0 || id >= domains.length) || new Set(input.domainIndices).size !== input.domainIndices.length) throw new Error('Invalid domain selection.');
      E.createRound(input.names, input.domainIndices.map(id => ({ ...domains[id], id })));
      input.names.forEach((name, i) => names[i] = name.trim()); teamCount = input.names.length; selectedDomains = new Set(input.domainIndices); renderTeamCount(); renderNames(); renderDomains(); updateSummary(); return getState();
    } });
    register({ name: 'submit_quiz_answer', title: 'اختيار الإجابة', description: 'Submit one zero-based option index for the active team. Commits the answer and updates scores once.', inputSchema: { type: 'object', properties: { optionIndex: { type: 'integer', minimum: 0, maximum: 3 } }, required: ['optionIndex'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: input => { if (!input || !Number.isInteger(input.optionIndex) || input.optionIndex < 0 || input.optionIndex > 3) throw new Error('Invalid option.'); const result = submitAnswer(input.optionIndex); if (!result) throw new Error('There is no unanswered active question.'); return getState(); } });
    window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); });
  }
})();

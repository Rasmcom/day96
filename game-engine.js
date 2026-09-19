(function (root) {
  'use strict';
  function shuffle(items, random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function domainPools(domainInput, teamCount) {
    const selected = Array.isArray(domainInput) ? domainInput : [domainInput];
    if (!selected.length) throw new Error('اختر مجالًا واحدًا على الأقل.');
    const seenQuestions = new Set(), seenDomains = new Set();
    return selected.map((domain, index) => {
      if (!domain || !Array.isArray(domain.questions)) throw new Error('تعذر قراءة أسئلة المجال.');
      const id = domain.id ?? index;
      if (seenDomains.has(id)) throw new Error('تم اختيار المجال نفسه مرتين.');
      seenDomains.add(id);
      const questions = domain.questions.filter(question => {
        const key = (question.q.trim() + '|' + question.answer.trim()).normalize('NFKC').replace(/[\u064b-\u065f\u0670]/g, '').replace(/\s+/g, ' ');
        if (seenQuestions.has(key)) return false;
        seenQuestions.add(key); return true;
      });
      const count = Math.floor(questions.length / teamCount) * teamCount;
      if (!count) throw new Error('أحد المجالات لا يحتوي على أسئلة كافية للفرق.');
      return { id, title: domain.title, color: domain.color, questions, count };
    });
  }
  function planRound(domainInput, teamCount) {
    if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 6) throw new Error('اختر من فريقين إلى ستة فرق.');
    const pools = domainPools(domainInput, teamCount);
    return { count: pools.reduce((sum, pool) => sum + pool.count, 0), domains: pools.map(pool => ({ id: pool.id, count: pool.count, perTeam: pool.count / teamCount })) };
  }
  function createRound(names, domainInput, random = Math.random) {
    if (!Array.isArray(names) || names.length < 2 || names.length > 6) throw new Error('اختر من فريقين إلى ستة فرق.');
    const cleanNames = names.map(name => typeof name === 'string' ? name.trim() : '');
    if (cleanNames.some(name => !name || name.length > 32)) throw new Error('أدخل اسمًا لكل فريق، بحد أقصى ٣٢ حرفًا.');
    const comparableNames = cleanNames.map(name => name.normalize('NFKC').replace(/\s+/g, ' '));
    if (new Set(comparableNames).size !== names.length) throw new Error('اجعل لكل فريق اسمًا مختلفًا.');
    const pools = domainPools(domainInput, names.length);
    const cycles = [];
    for (const pool of pools) {
      const picked = shuffle(pool.questions, random).slice(0, pool.count);
      for (let i = 0; i < picked.length; i += names.length) cycles.push(picked.slice(i, i + names.length).map(question => ({ ...question, domainId: pool.id })));
    }
    const questions = shuffle(cycles, random).flat().map(q => {
      if (!q || typeof q.q !== 'string' || !Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options).size !== 4 || !q.options.includes(q.answer)) throw new Error('تعذر تجهيز أحد الأسئلة.');
      return { ...q, options: shuffle(q.options, random) };
    });
    return { teams: cleanNames.map((name, id) => ({ id, name, score: 0, attempts: 0, timeouts: 0 })), domains: pools.map(pool => ({ id: pool.id, count: pool.count })), questions, index: 0, selected: null, answered: false, timedOut: false, complete: false, endedEarly: false };
  }
  function answer(round, optionIndex) {
    if (!round || round.complete || round.answered) return false;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= 4) throw new Error('اختر إجابة صحيحة من الخيارات المعروضة.');
    const question = round.questions[round.index];
    const team = round.teams[round.index % round.teams.length];
    round.answered = true;
    round.selected = optionIndex;
    team.attempts += 1;
    const correct = question.options[optionIndex] === question.answer;
    if (correct) team.score += 1;
    return { correct, teamId: team.id, answer: question.answer, score: team.score };
  }
  function next(round) {
    if (!round || !round.answered || round.complete) return false;
    if (round.index + 1 >= round.questions.length) { round.complete = true; return 'complete'; }
    round.index += 1;
    round.answered = false;
    round.timedOut = false;
    round.selected = null;
    return 'question';
  }
  function expire(round) {
    if (!round || round.complete || round.answered) return false;
    const team = round.teams[round.index % round.teams.length];
    round.answered = true; round.timedOut = true; round.selected = null;
    team.attempts++; team.timeouts++;
    return { correct: false, timedOut: true, teamId: team.id, answer: round.questions[round.index].answer, score: team.score };
  }
  function finish(round) {
    if (!round || round.complete) return false;
    round.endedEarly = round.teams.reduce((sum, team) => sum + team.attempts, 0) < round.questions.length;
    round.complete = true;
    return true;
  }
  function standings(round) {
    const ordered = [...round.teams].sort((a, b) => b.score - a.score || a.id - b.id);
    let rank = 1;
    return ordered.map((team, i) => { if (i && team.score < ordered[i - 1].score) rank = i + 1; return { ...team, rank }; });
  }
  root.NationalQuizEngine = { shuffle, planRound, createRound, answer, expire, finish, next, standings };
})(typeof window === 'undefined' ? globalThis : window);

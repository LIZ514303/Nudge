/* Pure session accounting. No camera, network or credentials. */
globalThis.NudgeSession = (() => {
  function prepare(s, now) {
    if (!Number.isFinite(s.elapsedMs)) s.elapsedMs=Math.max(0,Math.min(s.duration*60000,now-s.started));
    s.id ||= String(s.started); s.lastTick=now; s.paused=!!s.paused;
  }
  function advance(s, now) {
    if (!s.recorded && !s.paused) s.elapsedMs=Math.min(s.duration*60000,(s.elapsedMs||0)+Math.max(0,now-(s.lastTick||now)));
    s.lastTick=now;
  }
  function quests(p, today) {
    const records=[...new Map((p.sessions||[]).map(s=>[s.id,s])).values()], rewards=p.rewards||{};
    return [
      {id:'daily-three:'+today,label:'Daily · complete 3 full streams',progress:Math.min(3,records.filter(s=>s.day===today&&s.finished).length),target:3,reward:30},
      {id:'total-200',label:'All time · study 200 minutes',progress:Math.min(200,Math.floor(records.reduce((sum,s)=>sum+s.elapsedMs,0)/60000)),target:200,reward:100}
    ].map(q=>({...q,complete:q.progress>=q.target,claimed:!!rewards[q.id],award:rewards[q.id]}));
  }
  function awardRewards(p,today,now=Date.now()) {
    p.rewards ||= {};let awarded=0;
    const days=new Set([today,...(p.sessions||[]).map(s=>s.day)]);
    for(const day of days) for(const q of quests(p,day)) {
      if(q.complete&&!p.rewards[q.id]){p.rewards[q.id]={stars:q.reward,awardedAt:now};p.coins=(p.coins||0)+q.reward;awarded+=q.reward;}
    }
    return awarded;
  }
  function settle(p,s,now,dayKey) {
    if(s.recorded)return;
    advance(s,now);p.sessions ||= [];p.rewards ||= {};p.days ||= {};
    if(p.sessions.some(r=>r.id===s.id)){s.recorded=true;return;}
    const day=dayKey(new Date(now));s.finished=s.elapsedMs>=s.duration*60000;s.recorded=true;s.completed=true;
    const entry={id:s.id,day,endedAt:now,title:s.title||'',goal:s.goal||'',elapsedMs:s.elapsedMs,finished:s.finished,stars:s.stars||0,peakAudience:s.peakAudience??null,tasks:(s.tasks||[]).map(t=>({text:t.text,done:!!t.done}))};
    p.sessions.push(entry);
    p.days[day]=Math.round(((p.days[day]||0)+s.elapsedMs/60000)*10)/10;
    if(s.finished)p.streams=(p.streams||0)+1;
    s.questStars=awardRewards(p,day,now);
    entry.stars+=(s.questStars||0);
    return s;
  }
  return {prepare,advance,quests,awardRewards,settle};
})();

// Suggested practice emphasis supplied by Coach Jeff; employers vary.
export const rounds = [
  {id:'pre-screen',label:'Pre-screen'}, {id:'recruiter',label:'Recruiter'},
  {id:'hiring-manager',label:'Hiring manager'}, {id:'technical-case',label:'Technical / case'},
  {id:'panel',label:'Panel'}, {id:'final',label:'Final'}
];
export const categories = [
  {id:'motivation',label:'Motivation / fit',weights:[1,3,2,0,2,3],question:'What interests you in this role, and how does it connect with what you want to do next?'},
  {id:'resume',label:'Resume walk-through',weights:[0,3,2,0,1,1],question:'Walk me through the experience on your resume that best prepares you for this role.'},
  {id:'behavioral',label:'Behavioral (STAR+)',weights:[2,1,3,1,3,2],question:'Tell me about a time you solved a difficult problem. What was the situation, what did you do, and what happened?'},
  {id:'situational',label:'Situational',weights:[3,1,2,2,2,1],question:'Suppose two teammates give you conflicting priorities for a project due tomorrow. How would you handle it?'},
  {id:'technical',label:'Technical / skills',weights:[2,0,2,3,2,0],question:'Choose a skill relevant to your target role. How have you used it, and how would you check the quality of your work?'},
  {id:'case',label:'Case / problem-solving',weights:[1,0,1,3,2,1],question:'A team is missing its project deadlines. How would you investigate the causes and decide what to improve first?'},
  {id:'values',label:'Values / culture',weights:[1,1,2,0,3,3],question:'What does a supportive team environment look like to you? Give an example of how you have helped create one.'},
  {id:'logistics',label:'Logistics / salary',weights:[1,3,1,0,0,2],question:'What would you want to clarify about the schedule, work location, start date, and compensation range before accepting a role? You can answer hypothetically.'},
  {id:'ai-tools',label:'AI & tools',weights:[1,1,2,2,1,1],question:'How would you decide whether to use an AI tool for a work task, and how would you check its output?'},
  {id:'candidate',label:'Candidate questions',weights:[0,2,3,1,3,3],question:'What questions would you ask the interviewer to help you decide whether this role and team are a good fit?'}
];
export function emphasis(category,round){return category.weights[rounds.findIndex(r=>r.id===round)] ?? 0;}
export function suggested(round){return categories.filter(c=>emphasis(c,round)>0).map(c=>c.id);}
export function plan(round,ids,length){
  const selected=categories.filter(c=>ids.includes(c.id)).sort((a,b)=>emphasis(b,round)-emphasis(a,round));
  if(!selected.length)return [];
  const out=[];const counts={};
  while(out.length<length){
    const c=selected.find(c=>!counts[c.id]) || [...selected].sort((a,b)=>(counts[a.id]||0)/Math.max(1,emphasis(a,round))-(counts[b.id]||0)/Math.max(1,emphasis(b,round)))[0];
    out.push(c);counts[c.id]=(counts[c.id]||0)+1;
  }
  // The candidate's questions make a natural closing when included in this session.
  return out.filter(c=>c.id!=='candidate').concat(out.filter(c=>c.id==='candidate'));
}

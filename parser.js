/* Free-text Hebrew parser: no AI, only rules. Pure functions, no DOM. */
(function(root){
"use strict";
const WD=["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS={"ינואר":1,"פברואר":2,"מרץ":3,"מרס":3,"אפריל":4,"מאי":5,"יוני":6,"יולי":7,"אוגוסט":8,"ספטמבר":9,"אוקטובר":10,"נובמבר":11,"דצמבר":12};
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseYmd=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)};
const HE="א-ת";
const L="(?<!["+HE+"])", R="(?!["+HE+"])";

function fixedDate(d,m,y,today){
  d=Number(d);m=Number(m);
  if(!(m>=1&&m<=12&&d>=1&&d<=31))return null;
  const t=parseYmd(today);
  let yr=y?(Number(y)<100?2000+Number(y):Number(y)):t.getFullYear();
  let dt=new Date(yr,m-1,d);
  if(dt.getMonth()!==m-1)return null;
  if(!y&&ymd(dt)<today)dt=new Date(yr+1,m-1,d);
  return ymd(dt);
}

/* Finds dates, blanks them out of the text. Returns {dates:[ymd in text order], rest}. */
function extractDates(text,today){
  let rest=text;const found=[];
  const take=(re,fn)=>{
    rest=rest.replace(re,function(m){
      const a=arguments, off=a[a.length-2], g=Array.prototype.slice.call(a,1,a.length-2);
      const d=fn(g,m);
      if(!d)return m;
      found.push({i:off,date:d});
      return " ".repeat(m.length);
    });
  };
  const pre="(?:"+L+"(?:עד\\s+)?[בלה]{0,2}-?)?";
  take(new RegExp(pre+"(?<![\\d:.])(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?(?![\\d:])","g"),g=>fixedDate(g[0],g[1],g[2],today));
  take(new RegExp(pre+"(?<!\\d)(\\d{1,2})\\s*[בל]?-?("+Object.keys(MONTHS).join("|")+")"+R+"(?:\\s+(\\d{4}))?","g"),g=>fixedDate(g[0],MONTHS[g[1]],g[2],today));
  take(new RegExp(L+"(?:עד\\s+)?(היום|הערב|מחרתיים|מחר)"+R,"g"),g=>addDays(today,g[0]==="מחר"?1:g[0]==="מחרתיים"?2:0));
  take(new RegExp(L+"בעוד\\s+(?:(\\d+)\\s+ימים|(יומיים)|(שבועיים)|(שבוע))"+R,"g"),g=>addDays(today,g[0]?Number(g[0]):g[1]?2:g[2]?14:7));
  const sameDayNear=new RegExp("("+WD.join("|")+")\\s+הקרוב");
  const near=(text.match(sameDayNear)||[])[1];
  take(new RegExp(L+"(עד\\s+יום\\s+|עד\\s+|ביום\\s+|ליום\\s+|יום\\s+|[בל])?("+WD.join("|")+")"+R+"(\\s+(?:הקרובה|הקרוב|הבאה|הבא|הזה))?","g"),g=>{
    if(!g[0]&&!g[2])return null;
    const w=WD.indexOf(g[1]), tw=parseYmd(today).getDay();
    let delta=(w-tw+7)%7;if(delta===0)delta=7;
    if(g[2]&&/הבא/.test(g[2])&&(delta<4||near===g[1]))delta+=7;
    return addDays(today,delta);
  });
  found.sort((a,b)=>a.i-b.i);
  return {dates:found.map(f=>f.date),rest};
}

/* Finds one clock time, blanks it out. Returns {time:"HH:MM"|"", rest}. */
function extractTime(text){
  let rest=text,time="";
  const set=(h,m)=>{h=Number(h);m=Number(m||0);if(h>23||m>59)return false;time=pad(h)+":"+pad(m);return true};
  const tryRe=(re,fn)=>{if(time)return;rest=rest.replace(re,function(m){if(time)return m;const g=Array.prototype.slice.call(arguments,1);return fn(g)?" ".repeat(m.length):m})};
  tryRe(new RegExp("(?:"+L+"ב(?:שעה)?-?\\s*)?(?<!\\d)(\\d{1,2}):(\\d{2})(?!\\d)"),g=>set(g[0],g[1]));
  tryRe(new RegExp(L+"ב(?:שעה\\s*|-)?\\s*(\\d{1,2})\\s*(בבוקר|בצהריים|אחה\"צ|אחרי הצהריים|בערב|בלילה)"),g=>{
    let h=Number(g[0]);const p=g[1];
    if(p==="בבוקר"){if(h===12)h=0}
    else if(p==="בלילה"){if(h>=8&&h<12)h+=12}
    else if(h<12)h+=12;
    return set(h,0);
  });
  tryRe(new RegExp(L+"בשעה\\s*(\\d{1,2})(?![\\d./])"),g=>{let h=Number(g[0]);if(h>=1&&h<=7)h+=12;return set(h,0)});
  tryRe(new RegExp(L+"ב-?(\\d{1,2})(?![\\d./:"+HE+"])"),g=>{let h=Number(g[0]);if(h>=1&&h<=7)h+=12;return set(h,0)});
  return {time,rest};
}

const EVENT_WORDS=/מסיבה|מסיבת|תספורת|תור |תור$|רופא|בדיקת|בדיקה|פגישה|פגישת|ארוחה|ארוחת|טיסה|טיול|חתונה|יום הולדת|הופעה|רייב|סקי|אימון|ראיון|מפגש|כנס|אירוע|חופשה|מילואים|משחק|סרט|דייט|מבחן|בחינה/;
const HW_WORDS=/מטלה|מטלת|עבודה|עבודת|תרגיל|הגשה|הגשת|בוחן|דאטה ?קאמפ|פרויקט|פרוייקט|שיעורי בית/;
const LEC_WORDS=/הרצאה|הרצאת|תרגול|שיעור|להשלים/;

function norm(s){return String(s).replace(/["'״׳`.,!?:;()\-–]/g," ").replace(/\s+/g," ").trim().toLowerCase()}
const STOP=new Set(["את","של","על","עם","גם","לי","זה","כל","ה"]);
function tokens(s){return norm(s).split(" ").filter(w=>w&&!STOP.has(w))}
function tokEq(a,b){
  if(a===b)return true;
  if(/^\d+$/.test(a)||/^\d+$/.test(b))return false;
  const strip=w=>w.length>2&&/^[בלהומכש]/.test(w)?w.slice(1):w;
  return strip(a)===b||a===strip(b)||strip(a)===strip(b);
}
/* Best matching task for a free-text reference. Returns {task}|{many:[...]}|{} */
function matchTask(query,tasks){
  const q=tokens(query);if(!q.length)return {};
  let best=[],bestScore=0;
  for(const t of tasks){
    const tt=tokens(t.title);
    const nums=q.filter(w=>/^\d+$/.test(w));
    if(nums.some(n=>!tt.includes(n)))continue;
    const hit=q.filter(w=>tt.some(x=>tokEq(w,x))).length;
    const score=hit/q.length+ (hit/Math.max(tt.length,1))*0.01;
    if(hit/q.length<0.6)continue;
    if(score>bestScore+1e-9){best=[t];bestScore=score}else if(Math.abs(score-bestScore)<1e-9)best.push(t);
  }
  if(best.length===1)return {task:best[0]};
  if(best.length>1)return {many:best.slice(0,5)};
  return {};
}

function cleanTitle(s,catNames){
  let t=" "+s+" ";
  const kill=[
    "תוסיף","תוסיפי","להוסיף","הוסף","ותשים","תשים","שים","תכניס","להכניס","תרשום","תזכיר",
    "משימה חדשה","משימה","ליומן גוגל","ביומן גוגל","ליומן","ביומן","בלוח השנה","ללוח השנה","בלוח שנה","ללוח שנה","ללוח המשימות","בלוח המשימות","ללוח","בלוח",
    "בכותרת","בקטגוריה","לקטגוריה","בהתאם","בבקשה","וגם","גם","לי","אותו","אותה",
    "ללא תאריך הגשה","בלי תאריך הגשה","ללא תאריך","בלי תאריך","דחוף","בדחיפות"
  ];
  for(const n of catNames||[])for(const p of ["ב","ל","ה",""]){if(p||n.includes(" "))kill.push(p+n)}
  kill.sort((a,b)=>b.length-a.length);
  for(const k of kill)t=t.replace(new RegExp("(?<!["+HE+"])"+k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?!["+HE+"])","g")," ");
  t=t.replace(new RegExp("(?<!["+HE+"])(עד|ב|ל|ה|ו)-?(?!["+HE+"\\d])","g")," ");
  t=t.replace(/\s+/g," ").replace(/^[\s,.:;\-–]+|[\s,.:;\-–]+$/g,"");
  return t;
}

function guessCat(text,cats){
  const has=id=>cats.some(c=>c.id===id);
  for(const c of cats){
    const names=[c.name].concat(c.name.split(/\s+ו?/)).filter(n=>n.length>2);
    for(const n of names)if(new RegExp("(?<!["+HE+"])[בל]"+n+"(?!["+HE+"])").test(text)||(n===c.name&&n.includes(" ")&&text.includes(n)))return c.id;
  }
  if(HW_WORDS.test(text)&&has("assignments"))return "assignments";
  if(LEC_WORDS.test(text)&&has("lectures"))return "lectures";
  if(has("kadarim"))return "kadarim";
  return cats[0]?cats[0].id:"";
}

/* Main entry. ctx={today:"YYYY-MM-DD", cats:[{id,name}], tasks:[{id,title,done}], mode:"auto"|"cal"}
   Returns a list of actions: add_task | add_event | set_done | delete_task | ask | list */
function parseMessage(message,ctx){
  const out=[];
  for(const raw of String(message).split(/\n|;/)){
    const line=raw.trim();if(!line)continue;
    out.push(parseLine(line,ctx));
  }
  return out;
}
function parseLine(line,ctx){
  const open=ctx.tasks.filter(t=>!t.done);
  let m;
  if((m=line.match(/^(?:ת?סמ(?:ן|ני)\s+)?(?:וי|✓|v)\s+על\s+(?:המשימה\s+(?:של\s+)?)?(.+)$/i))||(m=line.match(/^(?:סיימתי|עשיתי|גמרתי|השלמתי|הגשתי|ביצעתי)\s+(?:את\s+)?(.+)$/))||(m=line.match(/^(.+?)\s+(?:בוצע|נעשה|הושלם|הוגש)$/))){
    const r=matchTask(m[1],open);
    if(r.task)return {type:"set_done",id:r.task.id,title:r.task.title};
    if(r.many)return {type:"ask",text:"מצאתי כמה משימות דומות: "+r.many.map(t=>t.title).join(", ")+". תכתוב את השם המלא."};
    return {type:"ask",text:"לא מצאתי משימה פתוחה שמתאימה ל\""+m[1]+"\"."};
  }
  if((m=line.match(/^(?:תמחק|תמחקי|מחק|למחוק|תסיר|הסר|תוריד)\s+(?:לי\s+)?(?:את\s+)?(?:המשימה\s+(?:של\s+)?)?(.+)$/))){
    const r=matchTask(m[1],ctx.tasks);
    if(r.task)return {type:"delete_task",id:r.task.id,title:r.task.title};
    if(r.many)return {type:"ask",text:"מצאתי כמה משימות דומות: "+r.many.map(t=>t.title).join(", ")+". תכתוב את השם המלא."};
    return {type:"ask",text:"לא מצאתי משימה שמתאימה ל\""+m[1]+"\"."};
  }
  if(/\?\s*$/.test(line)||/^(מה|איזה|אילו|כמה|מתי)\s/.test(line))return {type:"list",week:/השבוע|שבוע|קרוב|להגיש|הגשות/.test(line)};

  const d=extractDates(line,ctx.today);
  const tm=extractTime(d.rest);
  const date=d.dates[0]||"";
  const endDate=d.dates[1]&&d.dates[1]>date?d.dates[1]:"";
  const catNames=ctx.cats.map(c=>c.name).concat(...ctx.cats.map(c=>c.name.split(/\s+ו?/)));
  const title=cleanTitle(tm.rest,catNames);
  const saysTask=/(?<![א-ת])משימה(?![א-ת])/.test(line)||ctx.cats.some(c=>c.name.split(/\s+ו?/).concat(c.name).some(n=>n.length>2&&new RegExp("(?<![א-ת])[בל]"+n+"(?![א-ת])").test(line)));
  const saysCal=/(?<![א-ת])[בל]יומן|[בל]לוח\s+ה?שנה/.test(line);
  let isEvent;
  if(ctx.mode==="cal")isEvent=true;
  else if(saysTask)isEvent=false;
  else if(saysCal)isEvent=true;
  else if(HW_WORDS.test(line)||(LEC_WORDS.test(line)&&!tm.time))isEvent=false;
  else isEvent=!!date&&(EVENT_WORDS.test(line)||!!tm.time);
  if(!title)return {type:"ask",text:"לא הבנתי מה להוסיף. תכתוב שם למשימה או לאירוע."};
  if(isEvent){
    if(!date)return {type:"ask",text:"כדי להוסיף את \""+title+"\" ליומן צריך תאריך. למשל: "+title+" מחר ב-16:00."};
    return {type:"add_event",title,date,time:tm.time,endDate:tm.time?"":endDate,color:/מסיבה|מסיבת|רייב|יום הולדת|הופעה|סקי|טיול/.test(line)?"pink":""};
  }
  return {type:"add_task",title,cat:guessCat(line,ctx.cats),due:date,time:date?tm.time:"",priority:/דחוף|בדחיפות/.test(line)?"high":"normal",guessedDate:!!date&&!/\d{1,2}[./]\d{1,2}/.test(line)};
}

root.BB={parseMessage,extractDates,extractTime,matchTask,cleanTitle,guessCat,addDays,ymd,parseYmd,WD};
})(typeof window!=="undefined"?window:globalThis);

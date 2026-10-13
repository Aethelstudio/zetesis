const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json",...h}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const enc=s=>new TextEncoder().encode(s);
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc(pw),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc(salt),iterations:100000},k,256))}
const sha=async s=>hex(await crypto.subtle.digest("SHA-256",enc(s)));
const cookie=(t,age)=>`zs=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
const tok=req=>(/(?:^|; )zs=([a-f0-9]+)/.exec(req.headers.get("cookie")||"")||[])[1];
async function who(req,env){const t=tok(req);if(!t)return null;return env.DB.prepare("SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.exp>?").bind(await sha(t),Date.now()).first()}

const SYS="You assist a university philosophy student. Work ONLY from the text the student provides. Never invent quotations, page numbers, citations, or bibliographic details; if asked for references, say the student must find them in a library database. You may name thinkers and their general positions, but label that as general knowledge to verify. Be concise and plain.";
const TASKS={
explain:"Explain the passage below in plain academic English, step by step. Say what remains unclear or contested.",
objections:"Suggest three serious objections to the argument below, and say what a good reply would need to show.",
summarize:"Summarise the text below in under 150 words.",
premises:"For each premise below, say whether it is clearly stated and what kind of support it needs. Do not declare anything true or false using outside references."};

export default{async fetch(req,env){
const u=new URL(req.url);if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
const p=u.pathname.slice(5),me=await who(req,env);let b={};
if(req.method!="GET"){try{b=await req.json()}catch{}}
if(p=="me")return J({name:me?me.name:null});
if(p=="signup"||p=="login"){
 const n=String(b.username||"").trim().toLowerCase(),pw=String(b.password||"");
 if(!/^[a-z0-9_]{3,24}$/.test(n)||pw.length<8)return J({error:"Username: 3-24 letters, numbers or underscores. Password: 8+ characters."},400);
 let r=await env.DB.prepare("SELECT * FROM users WHERE name=?").bind(n).first();
 if(p=="signup"){if(r)return J({error:"That username is taken."},409);
  const salt=rnd(16),id=(await env.DB.prepare("INSERT INTO users(name,salt,pw) VALUES(?,?,?)").bind(n,salt,await hash(pw,salt)).run()).meta.last_row_id;r={id,name:n}}
 else if(!r||await hash(pw,r.salt)!==r.pw)return J({error:"Wrong username or password."},401);
 const t=rnd(32);await env.DB.prepare("INSERT INTO sessions(token,user_id,exp) VALUES(?,?,?)").bind(await sha(t),r.id,Date.now()+2592e6).run();
 return J({name:n},200,{"set-cookie":cookie(t,2592000)})}
if(p=="logout"){const t=tok(req);if(t)await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(await sha(t)).run();return J({ok:1},200,{"set-cookie":cookie("",0)})}
if(!me)return J({error:"Sign in first."},401);
if(p=="data"&&req.method=="GET"){const r=await env.DB.prepare("SELECT json FROM data WHERE user_id=?").bind(me.id).first();return J(r?JSON.parse(r.json):null)}
if(p=="data"){const s=JSON.stringify(b);if(s.length>5e5)return J({error:"Data too large."},413);
 await env.DB.prepare("INSERT INTO data(user_id,json,upd) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json,upd=excluded.upd").bind(me.id,s,Date.now()).run();return J({ok:1})}
if(p=="ai"){
 const text=String(b.text||"").slice(0,8000),task=TASKS[b.task];if(!task||!text.trim())return J({error:"Choose a task and add some text."},400);
 const day=new Date().toISOString().slice(0,10),c=await env.DB.prepare("INSERT INTO usage(user_id,day,n) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1 RETURNING n").bind(me.id,day).first();
 if(c.n>Number(env.DAILY||20))return J({error:"Daily assistant limit reached. Try again tomorrow."},429);
 const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:env.MODEL||"claude-sonnet-5-5",max_tokens:1000,system:SYS,messages:[{role:"user",content:task+"\n\n---\n"+text}]})});
 if(!r.ok)return J({error:"The assistant is unavailable right now."},502);
 const d=await r.json();return J({text:(d.content||[]).map(x=>x.text||"").join("")})}
return J({error:"Not found."},404)}};

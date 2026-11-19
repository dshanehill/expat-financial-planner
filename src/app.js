(function(){
"use strict";
const CATS=[
 ["groceries","Groceries"],["rent","Rent or housing"],["utilities","Utilities (water, power, internet)"],["transport","Transport"],
 ["shopping","Shopping and online orders"],["food","Food delivery and eating out"],["debt","Debt payment"],["phone","Phone and subscriptions"],["ai","AI and software subscriptions"],
 ["health","Health and pharmacy"],["personal","Personal care"],["visa","Travel, visas and legal"],["fees","Bank, ATM and card fees"],
 ["giving","Giving and family"],["cash","Cash spent (not sorted)"],["other","Other"]];
const CATNAME=Object.fromEntries(CATS);
let ACCOUNTS=["Cash","Bank","Credit card","E-wallet"];
const DEFAULTS={configured:false,homeCur:"USD",localCur:"USD",rate:1,defaultCurrency:"USD",weeklyGrocery:0,
 budgets:{},
 income:[{name:"Main income",usd:0}],
 accounts:["Cash","Bank","Credit card","E-wallet"],
 debtStart:0,debtStartMonth:monthKey(new Date())};
let S=JSON.parse(JSON.stringify(DEFAULTS));
let TX=[];let db=null,user=null,sample=null,tts=null,dict=null;let loaded=false,dbState="connecting";
let importRows=[];let addKind="expense";
const $=s=>document.querySelector(s);
const app=$("#app");
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pad(n){return String(n).padStart(2,"0")}
function dateKey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function monthKey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)}
function today(){return dateKey(new Date())}
const SYM={USD:"$",EUR:"€",GBP:"£",JPY:"¥",PHP:"₱",INR:"₹",KRW:"₩",NGN:"₦",VND:"₫",THB:"฿"};
function fmt(n,cur){n=Math.round((+n||0)*100)/100;const s=SYM[cur]||((cur||"")+" ");return (n<0?"-":"")+s+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function usd(n){return fmt(n,S.homeCur)}
function php(n){return fmt(n,S.localCur)}
function toUsd(amount,cur){return cur===S.homeCur?amount:amount/(+S.rate||1)}
function curs(){return [...new Set([S.localCur,S.homeCur].filter(Boolean))]}
function curOptions(sel){return curs().map(c=>`<option${c===sel?" selected":""}>${esc(c)}</option>`).join("")}
function weekStart(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return dateKey(x)}
function toast(m){const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display="none",4000)}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function applyLook(){document.documentElement.style.setProperty("--fs",(lsGet("fs")||"20")+"px");document.body.classList.toggle("light",lsGet("theme")==="light")}
applyLook();

// ---------- numbers ----------
function monthlyPlan(){const b=S.budgets||{};let total=(S.weeklyGrocery||0)*52/12;for(const k in b)total+=+b[k]||0;return total}
function incomeTotal(){return (S.income||[]).reduce((a,i)=>a+(+i.usd||0),0)}
function stats(){
 const now=new Date(),mk=monthKey(now),wk=weekStart(now);
 const r={spent:0,income:0,byCat:{},weekGroceries:0,cashIn:0,cashOut:0,debtPaid:0,count:0};
 for(const t of TX){
  const v=+t.usd||0;
  if(t.kind==="expense"&&t.category==="debt"&&(t.date||"").slice(0,7)>=S.debtStartMonth)r.debtPaid+=v;
  if(t.kind==="expense"&&t.category==="groceries"&&t.date>=wk)r.weekGroceries+=v;
  if((t.date||"").slice(0,7)!==mk)continue;
  r.count++;
  if(t.kind==="expense"){r.spent+=v;r.byCat[t.category]=(r.byCat[t.category]||0)+v;if(t.account==="Cash")r.cashOut+=v}
  else if(t.kind==="income")r.income+=v;
  else if(t.kind==="transfer"&&t.toAccount==="Cash")r.cashIn+=v;
 }
 return r;
}
function catBudget(k){if(k==="groceries")return (S.weeklyGrocery||0)*52/12;return +(S.budgets||{})[k]||0}
function level(spent,budget){if(budget<=0)return spent>0?"bad":"ok";const p=spent/budget;return p>=1?"bad":p>=.8?"warn":"ok"}
function barHtml(spent,budget){const lv=level(spent,budget);const p=budget>0?Math.min(100,spent/budget*100):(spent>0?100:0);return `<div class="bar" aria-hidden="true"><span class="fill-${lv}" style="width:${p}%"></span></div>`}

// ---------- views ----------
function render(){
 const v=(location.hash||"#home").slice(1);
 document.querySelectorAll("nav a").forEach(a=>a.setAttribute("aria-current",a.dataset.v===v?"page":"false"));
 if(v==="add")return viewAdd();
 if(v==="history")return viewHistory();
 if(v==="import")return viewImport();
 if(v==="settings")return viewSettings();
 viewHome();
}
function storageNote(){
 if(dbState==="ok")return "";
 if(dbState==="connecting")return `<div class="alert w">Connecting to your saved data…</div>`;
 if(dbState==="slow")return `<div class="alert w">Can't reach your saved data yet. What you see may be out of date.</div>`;
 return `<div class="alert">Can't reach your Google Sheet right now. Check your internet and press Refresh on Home.</div>`;
}
function alertsList(st){
 const out=[];const now=new Date();const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();const day=now.getDate();
 if(S.weeklyGrocery>0&&st.weekGroceries>=S.weeklyGrocery)out.push(["bad",`Groceries this week are over budget: ${usd(st.weekGroceries)} of ${usd(S.weeklyGrocery)}.`]);
 else if(S.weeklyGrocery>0&&st.weekGroceries>=S.weeklyGrocery*.8)out.push(["w",`Groceries this week: ${usd(S.weeklyGrocery-st.weekGroceries)} left.`]);
 for(const [k,n] of CATS){if(k==="groceries"||k==="debt")continue;const s=st.byCat[k]||0;const b=catBudget(k);if(!s)continue;
  if(b<=0)out.push(["w",`${n}: ${usd(s)} spent and there's no budget for it.`]);
  else if(s>=b)out.push(["bad",`${n} is over budget: ${usd(s)} of ${usd(b)}.`]);
  else if(s>=b*.8)out.push(["w",`${n} is almost used up: ${usd(b-s)} left.`]);}
 const living=st.spent-(st.byCat.debt||0);const livingPlan=monthlyPlan()-(+S.budgets.debt||0);
 const pace=day>3?living/day*dim:0;
 if(pace>livingPlan*1.05)out.push(["bad",`At this pace you'll spend about ${usd(pace)} this month on living costs. Your plan is ${usd(livingPlan)}.`]);
 const unacc=st.cashIn-st.cashOut;if(unacc>20)out.push(["w",`${usd(unacc)} in cash withdrawn this month isn't accounted for yet.`]);
 return out;
}
function viewHome(){
 const st=stats();const plan=monthlyPlan();const inc=incomeTotal();const left=inc-st.spent;
 const debtLeft=Math.max(0,(+S.debtStart||0)-st.debtPaid);const months=S.budgets.debt>0?Math.ceil(debtLeft/S.budgets.debt):0;
 const al=alertsList(st);
 const mName=new Date().toLocaleString("en-US",{month:"long"});
 let h=`${storageNote()}<h1>${mName}</h1>
 <div class="card"><div class="muted">Spent this month</div><div class="big">${usd(st.spent)}</div>
 ${barHtml(st.spent,plan)}<div class="row"><span>Plan ${usd(plan)}</span><span class="${level(st.spent,plan)}">${plan-st.spent>=0?usd(plan-st.spent)+" left":usd(st.spent-plan)+" over"}</span></div>
 <div class="row" style="margin-top:8px"><span>Monthly income</span><span>${usd(inc)}</span></div>
 <div class="row"><span>Income minus spending</span><span class="${left>=0?"ok":"bad"}">${usd(left)}</span></div></div>
 <div class="grid2"><button class="primary" id="speak">Read summary out loud</button><button id="refresh">Refresh</button></div>
 <button id="review" style="width:100%;margin-top:10px">Review categories with Claude</button><p id="rstat" role="status" style="font-weight:700"></p>`;
 if(al.length)h+=`<h2>Watch out</h2>`+al.map(a=>`<div class="alert ${a[0]==="w"?"w":""}">${esc(a[1])}</div>`).join("");
 if(!S.configured)h+=`<div class="alert w">Welcome! Open Settings to enter your income, budget, currencies and accounts.</div>`;
 h+=`<div class="card"><div class="row"><strong>Groceries this week</strong><span class="${level(st.weekGroceries,S.weeklyGrocery)}">${usd(st.weekGroceries)} of ${usd(S.weeklyGrocery)}</span></div>${barHtml(st.weekGroceries,S.weeklyGrocery)}<div class="muted">Week starts Monday.</div></div>
 ${(+S.debtStart||0)>0?`<div class="card"><div class="row"><strong>Debt left</strong><span class="big">${usd(debtLeft)}</span></div>${barHtml(st.debtPaid,+S.debtStart||1)}
 <div class="muted">${usd(st.debtPaid)} paid of ${usd(S.debtStart)}. ${debtLeft>0&&months?`About ${months} more month${months>1?"s":""} at ${usd(S.budgets.debt)} a month.`:debtLeft<=0?"Paid off!":""}</div></div>`:""}
 <h2>Categories this month</h2>`;
 for(const [k,n] of CATS){const s=st.byCat[k]||0;const b=catBudget(k);if(!s&&!b)continue;
  h+=`<div class="card"><div class="row"><strong>${esc(n)}</strong><span class="${level(s,b)}">${usd(s)}${b?" of "+usd(b):""}</span></div>${b||s?barHtml(s,b):""}</div>`}
 app.innerHTML=h;
 $("#speak").onclick=()=>speak(summaryText(st));
 $("#refresh").onclick=()=>{toast("Refreshing…");load()};
 $("#review").onclick=()=>{const s=$("#rstat");if(!S.hasKey){s.textContent="Add your Claude API key in Settings first.";return}s.className="";s.textContent="Claude is checking your transactions…";runReview(s,false)};
}
function summaryText(st){
 const plan=monthlyPlan();const debtLeft=Math.max(0,(+S.debtStart||0)-st.debtPaid);
 let s=`This month you've spent ${usd(st.spent)} out of your ${usd(plan)} plan. `;
 s+=`Groceries this week are ${usd(st.weekGroceries)} out of ${usd(S.weeklyGrocery)}. `;
 const al=alertsList(st);if(al.length)s+="Things to watch: "+al.map(a=>a[1]).join(" ")+" ";else s+="Everything is within budget. ";
 if((+S.debtStart||0)>0)s+=`Your debt left is ${usd(debtLeft)}.`;return s;
}
async function speak(text){
 if(tts){try{await tts.speak(text);return}catch(e){if(e&&e.code==="busy"){toast("Stop the microphone first.");return}}}
 try{if(window.speechSynthesis){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.95;speechSynthesis.speak(u);return}}catch(e){}
 toast("Reading out loud isn't available here.");
}

function catOptions(sel){return CATS.map(([k,n])=>`<option value="${k}"${k===sel?" selected":""}>${esc(n)}</option>`).join("")}
function acctOptions(sel){return ACCOUNTS.map(a=>`<option${a===sel?" selected":""}>${a}</option>`).join("")}
function viewAdd(prefill){
 const p=prefill||{};const kind=p.kind||addKind;
 app.innerHTML=`${storageNote()}<h1>Add an entry</h1>
 <div class="card"><label for="quick">Say or type it</label>
 <input id="quick" placeholder="Taxi 12.50" autocomplete="off">
 <div class="grid2" style="margin-top:10px"><button id="fill" class="primary">Fill in the form</button><button id="mic"${dict?"":" hidden"}>Use microphone</button></div>
 <p class="muted" id="micnote">${dict?"":"Tip: tap the microphone on your phone's keyboard to speak."}</p></div>
 <div class="seg" role="group" aria-label="Type of entry">
  <button data-k="expense" aria-pressed="${kind==="expense"}">Spent</button><button data-k="income" aria-pressed="${kind==="income"}">Received</button><button data-k="transfer" aria-pressed="${kind==="transfer"}">Moved</button></div>
 <form id="f" class="card">
 <div class="grid2"><div><label for="amt">Amount</label><input id="amt" inputmode="decimal" value="${esc(p.amount||"")}" required></div>
 <div><label for="cur">Currency</label><select id="cur">${curOptions(p.currency||S.defaultCurrency)}</select></div></div>
 <div id="catwrap"${kind==="expense"?"":" hidden"}><label for="cat">Category</label><select id="cat">${catOptions(p.category||"groceries")}</select></div>
 <label for="acct">${kind==="transfer"?"From account":kind==="income"?"Into account":"Paid with"}</label><select id="acct">${acctOptions(p.account||ACCOUNTS[0])}</select>
 <div id="towrap"${kind==="transfer"?"":" hidden"}><label for="to">To account</label><select id="to">${acctOptions(p.toAccount||ACCOUNTS[1]||ACCOUNTS[0])}</select></div>
 <label for="note">Note</label><input id="note" value="${esc(p.note||"")}" placeholder="What was it?">
 <label for="date">Date</label><input id="date" type="date" value="${esc(p.date||today())}">
 <button class="primary" style="width:100%;margin-top:16px" type="submit">Save</button>
 <p id="err" class="bad" role="alert"></p></form>
 <div class="card"><label for="afile">Upload a statement (PDF or CSV)</label>
 <p class="muted" style="margin:0 0 8px">Any bank, card or e-wallet statement. Choose the file, then press Save statement. Everything new is added${S.hasKey?' and Claude checks the categories':''}.</p>
 <select id="aacct" aria-label="Which bank"><option value="auto">Figure out the account for me</option>${ACCOUNTS.map(a=>`<option>${esc(a)}</option>`).join("")}</select>
 <input id="apw" type="password" autocomplete="off" placeholder="PDF password, if it has one" style="margin-top:8px">
 <input id="afile" type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" style="margin-top:8px">
 <button id="asave" class="primary" type="button" style="width:100%;margin-top:12px">Save statement</button>
 <p id="astat" role="status" style="font-weight:700"></p></div>`;
 document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{addKind=b.dataset.k;viewAdd(readForm())});
 $("#fill").onclick=quickParse;
 $("#quick").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();quickParse()}};
 if(dict)$("#mic").onclick=startMic;
 $("#f").onsubmit=saveForm;
 $("#afile").onchange=e=>{const f=e.target.files[0];const s=$("#astat");s.className="";s.textContent=f?"Chosen: "+f.name+". Now press Save statement.":""};
 $("#asave").onclick=()=>{const f=$("#afile").files[0];const s=$("#astat");if(!f){s.className="bad";s.textContent="Choose a statement file first, using the Choose File button above.";return}autoImport(f,$("#apw").value,s)};
}
function readForm(){return{kind:addKind,amount:$("#amt").value,currency:$("#cur").value,category:$("#cat").value,account:$("#acct").value,toAccount:$("#to").value,note:$("#note").value,date:$("#date").value}}
let micOn=false;
function startMic(){
 if(micOn){dict.stop().catch(()=>{});return}
 const q=$("#quick");const base=q.value?q.value+" ":"";let finals="";
 dict.onPartial(({text})=>{q.value=base+finals+text});
 dict.onFinal(({text})=>{finals+=text+" ";q.value=base+finals});
 dict.onState(({state})=>{micOn=state==="listening";const b=$("#mic");if(b)b.textContent=micOn?"Stop listening":"Use microphone";if(!micOn&&q.value.trim())quickParse()});
 dict.start().catch(e=>{if(e&&e.code==="not_granted"){dict=null;$("#mic").hidden=true;$("#micnote").textContent="Tip: tap the microphone on your phone's keyboard to speak."}else toast("The microphone didn't start. Try again.")});
}
function guessCat(text){
 const t=text.toLowerCase();
 const R=[["food",/grab ?food|foodpanda|jollibee|mcdo|mcdonald|chili|restaurant|resto|coffee|bo'?s|starbucks|cafe|bakery|baking|pizza|kfc|eat|lunch|dinner|breakfast|delivery/],
 ["groceries",/grocer|supermarket|super metro|metro|colonnade|landers|s ?& ?r|puregold|gaisano|savemore|rustan|market|unitop/],
 ["transport",/grab|move ?it|angkas|taxi|jeep|joyride|ride|fare|bus/],
 ["rent",/rent|condo|landlord/],["utilities",/veco|electric|power|meralco|mcwd|water|fiber|internet|pldt|converge|wifi/],
 ["ai",/openai|chatgpt|claude|anthropic/],
 ["phone",/globe|smart|load|prime|netflix|spotify|apple\.com|icloud|google|subscription|youtube/],
 ["health",/pharma|mercury|teladoc|hospital|clinic|doctor|medicine|puericulture|dental/],
 ["personal",/watsons|salon|barber|haircut|laundry/],["shopping",/lazada|shopee|amazon|mr\.? ?diy|adidas|uniqlo|sm store|mall|order/],
 ["visa",/immigration|visa|extension/],["fees",/fee|interest|charge/],["debt",/debt|loan|credit card payment|payoff/],["giving",/sadaqah|zakat|gift|donat|family/]];
 for(const [k,re] of R)if(re.test(t))return k;return "other";
}
function localParse(text){
 const t=text.toLowerCase();const m=t.replace(/,/g,"").match(/(\d+(?:\.\d+)?)/);
 let cur=S.defaultCurrency;for(const c of curs()){if(t.includes(c.toLowerCase())||(SYM[c]&&t.includes(SYM[c])))cur=c}if(/dollar|bucks/.test(t)&&curs().includes("USD"))cur="USD";if(/peso/.test(t)&&curs().includes("PHP"))cur="PHP";if(/euro/.test(t)&&curs().includes("EUR"))cur="EUR";if(/pound/.test(t)&&curs().includes("GBP"))cur="GBP";
 let acct=ACCOUNTS[0];for(const a of [...ACCOUNTS].sort((x,y)=>y.length-x.length)){if(t.includes(a.toLowerCase())){acct=a;break}}
 const note=text.replace(/(\d+(?:[.,]\d+)?)/,"").replace(/\b(pesos?|dollars?|euros?|pounds?|bucks|with|on|for|paid|from|using)\b/gi,"").replace(new RegExp("\\b("+curs().concat(ACCOUNTS).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")\\b","gi"),"").replace(/\s+/g," ").trim();
 return{kind:"expense",amount:m?m[1]:"",currency:cur,category:guessCat(text),account:acct,note:note||text,date:today()};
}
async function quickParse(){
 const text=$("#quick").value.trim();if(!text){$("#err").textContent="Say or type something first.";return}
 let p=localParse(text);
 if(sample){const b=$("#fill");b.textContent="Working…";
  try{const r=await sample.json(`Turn this spoken ledger entry into JSON. Today is ${today()}. The person usually pays in ${S.defaultCurrency}; their currencies: ${curs().join(", ")}.
Entry: "${text}"
Return only JSON: {"kind":"expense"|"income"|"transfer","amount":number,"currency":one of ${JSON.stringify(curs())},"category":one of ${JSON.stringify(CATS.map(c=>c[0]))},"account":one of ${JSON.stringify(ACCOUNTS)} (the account money came from, default "Cash"),"toAccount":account or null (only for transfers between the person's own accounts, an ATM withdrawal is a transfer to "Cash"),"note":short description,"date":"YYYY-MM-DD"}`,{modelTier:"quick"});
   if(r&&r.amount){p={...p,...r,amount:String(r.amount)};if(!CATNAME[p.category])p.category=guessCat(text);if(!ACCOUNTS.includes(p.account))p.account="Cash";}}catch(e){if(e&&e.code==="not_granted")sample=null}
 }
 addKind=p.kind||"expense";viewAdd(p);toast("Check the form, then press Save.");
 setTimeout(()=>{const a=$("#amt");a&&a.focus()},50);
}
async function saveForm(e){
 e.preventDefault();const f=readForm();const amount=parseFloat(String(f.amount).replace(/[^0-9.]/g,""));
 if(!amount||amount<=0){$("#err").textContent="Enter an amount.";$("#amt").focus();return}
 if(f.kind==="transfer"&&f.account===f.toAccount){$("#err").textContent="Pick two different accounts.";return}
 const t={kind:f.kind,amount,currency:f.currency,usd:Math.round(toUsd(amount,f.currency)*100)/100,category:f.kind==="expense"?f.category:(f.kind==="income"?"income":"transfer"),account:f.account,note:f.note.trim(),date:f.date||today(),source:"manual",createdAt:Date.now()};
 if(f.kind==="transfer")t.toAccount=f.toAccount;
 if(await saveTx(t)){toast(`Saved: ${f.kind==="expense"?CATNAME[t.category]:f.kind} ${usd(t.usd)}`);addKind="expense";viewAdd();}
}
function gs(fn,...args){return new Promise((res,rej)=>{google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args)})}
async function saveTx(t){
 try{const id=await gs("addTx",t);t.id=id;TX.unshift(t);return true}catch(e){toast("Couldn't save to your sheet. Try again.");return false}
}

function viewHistory(){
 const mk=lsGet("histMonth")||monthKey(new Date());
 const months=[...new Set(TX.map(t=>(t.date||"").slice(0,7)).concat([monthKey(new Date())]))].filter(Boolean).sort().reverse();
 const list=TX.filter(t=>(t.date||"").startsWith(mk)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
 let h=`${storageNote()}<h1>History</h1><label for="m">Month</label><select id="m">${months.map(m=>`<option${m===mk?" selected":""}>${m}</option>`).join("")}</select><div class="card">`;
 if(!list.length)h+=`<p>No entries yet for this month. Use Add or Import to put some in.</p>`;
 for(const t of list){
  const label=t.kind==="expense"?CATNAME[t.category]||t.category:t.kind==="income"?"Received":`Moved to ${t.toAccount||""}`;
  h+=`<div class="tx"><div><strong>${esc(label)}</strong><br><span class="muted">${esc(t.note||"")}${t.note?" · ":""}${esc(t.account||"")} · ${esc(t.date)}${t.who?" · by "+esc(String(t.who).split("@")[0]):""}</span>${t.source&&t.source!=="manual"?`<span class="tag">${esc(t.source.replace("import:",""))}</span>`:""}</div>
  <div style="text-align:right"><strong class="${t.kind==="income"?"ok":""}">${t.kind==="income"?"+":""}${usd(t.usd)}</strong>${t.currency!==S.homeCur?`<br><span class="muted">${fmt(t.amount,t.currency)}</span>`:""}<br><button data-del="${esc(t.id)}" style="min-height:44px;padding:6px 10px;margin-top:4px" aria-label="Delete ${esc(label)} ${usd(t.usd)}">Delete</button></div></div>`}
 h+=`</div>`;app.innerHTML=h;
 $("#m").onchange=e=>{lsSet("histMonth",e.target.value);viewHistory()};
 app.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
  if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Tap again to delete";return}
  try{await gs("deleteTx",b.dataset.del);TX=TX.filter(t=>t.id!==b.dataset.del);toast("Deleted.");viewHistory()}catch(e){toast("Couldn't delete.")}});
}

// ---------- import ----------
function viewImport(){
 let h=`${storageNote()}<h1>Import a statement</h1>
 <p>Download your statement, then add it here. The ledger reads every transaction, sorts it into a category, and skips anything you already entered.</p>
 <div class="card"><label for="ia">Which account?</label><select id="ia">${ACCOUNTS.map(a=>`<option>${esc(a)}</option>`).join("")}</select>
 <label for="if">Statement file (CSV or PDF)</label><input id="if" type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf">
 <label for="ipw">PDF password, if it has one</label><input id="ipw" type="password" autocomplete="off" placeholder="Some statements have one">
 <label for="it">Or paste the transactions</label><textarea id="it" rows="5"></textarea>
 <button class="primary" id="ir" style="width:100%;margin-top:14px">Read transactions</button><p id="istat" role="status"></p></div>
 <details class="card"><summary><strong>Where to get a statement</strong></summary>
 <p>Most banks and e-wallets let you download your transaction history from their website or app, often under Statements, Activity or Transaction history. Choose CSV when it is offered. PDFs work too; some are protected with a password, which you can type in above.</p></details>
 <div id="irev"></div>`;
 app.innerHTML=h;$("#ir").onclick=runImport;if(importRows.length)renderReview();
}
async function fileText(file,pw){
 if(/\.pdf$/i.test(file.name)||file.type==="application/pdf"){
  if(!window.pdfjsLib){await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s)}).catch(()=>{});if(!window.pdfjsLib)throw new Error("PDF reading isn't available. Paste the text instead.")}
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data=new Uint8Array(await file.arrayBuffer());
  let doc;try{doc=await pdfjsLib.getDocument({data,password:pw||undefined}).promise}catch(e){if(e&&e.name==="PasswordException")throw new Error(pw?"That PDF password didn't work.":"This PDF needs its password.");throw new Error("Couldn't open that PDF.")}
  let out=[];for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const c=await pg.getTextContent();
   const lines={};for(const it of c.items){const y=Math.round(it.transform[5]);(lines[y]=lines[y]||[]).push(it)}
   Object.keys(lines).sort((a,b)=>b-a).forEach(y=>out.push(lines[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(" ").trim()))}
  return out.filter(Boolean).join("\n");
 }
 return await file.text();
}
async function runImport(){
 const st=$("#istat");const acct=$("#ia").value;const f=$("#if").files[0];let text=$("#it").value.trim();
 try{if(f){st.textContent="Reading the file…";text=await fileText(f,$("#ipw").value)}}catch(e){st.textContent=e.message;st.className="bad";return}
 if(!text){st.textContent="Choose a file or paste some transactions first.";st.className="bad";return}
 st.className="";let rows=[];
 if(sample){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());const head=lines[0];const chunks=[];
  for(let i=0;i<lines.length;i+=70)chunks.push((i?head+"\n":"")+lines.slice(i,i+70).join("\n"));
  for(let i=0;i<chunks.length;i++){
   st.textContent=`Sorting transactions… part ${i+1} of ${chunks.length}`;
   try{const r=await sample.json(importPrompt(acct,chunks[i]),{modelTier:"default"});if(Array.isArray(r))rows=rows.concat(r);else if(r&&Array.isArray(r.transactions))rows=rows.concat(r.transactions)}
   catch(e){if(e&&e.code==="not_granted"){sample=null;rows=basicParse(text,acct);break}if(e&&e.code==="rate_limited"){st.textContent="Too many requests. Wait a minute and try again.";return}}
  }
 }else rows=basicParse(text,acct);
 rows=rows.map(r=>normRow(r,acct)).filter(Boolean);
 if(!rows.length){st.textContent="I couldn't find any transactions in that. Try the CSV version of the statement.";st.className="bad";return}
 markDupes(rows);importRows=rows;
 st.textContent=`Found ${rows.length} transactions.`;renderReview();
}
function importPrompt(acct,chunk){
 return `You are reading part of a ${acct} bank or wallet statement for a person whose home currency is ${S.homeCur} and who often spends in ${S.localCur}.
Pull out every completed transaction. Skip declined, cancelled and failed ones, and skip balance or header lines.
For each transaction give:
- date: "YYYY-MM-DD"
- description: the merchant or person, short
- amount: positive number in the transaction's own currency (use the ${S.localCur} amount when two currencies are shown for a card purchase)
- currency: one of ${JSON.stringify(curs())}
- kind: "expense" for spending, fees and payments to other people; "income" for money received from someone else (benefits, family support, salary); "transfer" for money moving between the person's own accounts (topping up a wallet from a bank, adding money, moving to savings, sending money to themselves, credit card payments, ATM cash withdrawals)
- category (expenses only): one of ${JSON.stringify(CATS.map(c=>c[0]))}. Ride-hailing and taxis are transport; food delivery, restaurants and coffee shops are food; supermarkets are groceries; ATM and card fees are fees.
- toAccount (transfers only): one of ${JSON.stringify(ACCOUNTS.concat(["Savings"]))}; an ATM withdrawal goes to "Cash".
- fee: any separate fee in the same currency, or 0
Return only a JSON array of objects with those fields.

Statement text:
${chunk}`;
}
function parseAmt(s){if(s==null)return NaN;const neg=/^\s*-|\(.*\)/.test(String(s));const n=parseFloat(String(s).replace(/[^0-9.]/g,""));return neg?-n:n}
function parseDate(s){
 s=String(s||"").trim();let m;
 if((m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
 if((m=s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/))){let y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${pad(m[1])}-${pad(m[2])}`}
 const d=new Date(s);return isNaN(d)?null:dateKey(d);
}
function csvLines(text){const out=[];for(const line of text.split(/\r?\n/)){if(!line.trim())continue;const cells=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if((c===","||c==="\t")&&!q){cells.push(cur);cur=""}else cur+=c}cells.push(cur);out.push(cells.map(x=>x.trim()))}return out}
function basicParse(text,acct){
 const rows=csvLines(text);if(!rows.length)return[];
 const head=rows[0].map(h=>h.toLowerCase());const hasHead=head.some(h=>/date|amount|description/.test(h));
 let di=head.findIndex(h=>/date/.test(h)),ai=head.findIndex(h=>/^amount|debit|withdrawal/.test(h)),de=head.findIndex(h=>/desc|merchant|details|payee|reference/.test(h)),ci=head.findIndex(h=>/currency/.test(h));
 const body=hasHead?rows.slice(1):rows;
 if(!hasHead){di=0;ai=1;de=body[0]?body[0].length-1:4}
 const out=[];
 for(const r of body){const d=parseDate(r[di]);const a=parseAmt(r[ai]);if(!d||!a||isNaN(a))continue;const desc=r[de]||"";const cur=ci>=0&&r[ci]?String(r[ci]).trim().toUpperCase():S.defaultCurrency;
  if(/declin|cancel|fail/i.test(r.join(" ")))continue;
  let kind=a>0?"income":"expense";const low=desc.toLowerCase();
  if(/atm|withdraw/.test(low))kind="transfer";else if(/online payment|transfer|top ?up|moved|added|stash|jar/.test(low))kind=a>0?"transfer":"transfer";
  out.push({date:d,description:desc,amount:Math.abs(a),currency:cur,kind,category:guessCat(desc),toAccount:/atm|withdraw/.test(low)?"Cash":null,fee:0});}
 return out;
}
function normRow(r,acct){
 const amount=Math.abs(+r.amount||0);const date=parseDate(r.date);if(!amount||!date)return null;
 const currency=curs().includes(String(r.currency||"").toUpperCase())?String(r.currency).toUpperCase():S.defaultCurrency;let kind=["expense","income","transfer"].includes(r.kind)?r.kind:"expense";
 let category=kind==="expense"?(CATNAME[r.category]?r.category:guessCat(r.description||"")):kind;
 const row={keep:true,date,note:String(r.description||"").slice(0,120),amount:Math.round(amount*100)/100,currency,kind,category,account:acct,toAccount:kind==="transfer"?(r.toAccount||"Savings"):null};
 row.fee=+r.fee>0?Math.round(+r.fee*100)/100:0;return row;
}
function markDupes(rows){
 for(const r of rows){const u=toUsd(r.amount,r.currency);
  const d=TX.find(t=>t.account===r.account&&Math.abs((+t.usd||0)-u)<Math.max(.05,u*.02)&&Math.abs(new Date(t.date)-new Date(r.date))<=2*864e5);
  if(d){r.dupe=true;r.keep=false}}
}
function renderReview(){
 const box=$("#irev");if(!box)return;const n=importRows.filter(r=>r.keep).length;const d=importRows.filter(r=>r.dupe).length;
 let h=`<h2>Check before saving</h2><p>${n} selected.${d?` ${d} look like entries you already have, so they're unticked.`:""} Change any category that's wrong.</p>
 <div class="grid2"><button id="iall">Select all</button><button id="inone">Select none</button></div><div class="card">`;
 importRows.forEach((r,i)=>{const label=r.kind==="transfer"?`Moved to ${r.toAccount}`:r.kind==="income"?"Received":"";
  h+=`<div class="chk"><input type="checkbox" id="k${i}" ${r.keep?"checked":""} aria-label="Include ${esc(r.note)} ${r.amount} ${r.currency}"><div style="flex:1"><label for="k${i}" style="margin:0">${esc(r.note||"(no description)")}</label>
  <div class="row"><span class="muted">${esc(r.date)}</span><strong>${fmt(r.amount,r.currency)}</strong></div>${r.dupe?`<span class="tag warn">Already entered?</span>`:""}
  ${r.kind==="expense"?`<select data-i="${i}" aria-label="Category">${catOptions(r.category)}</select>`:`<div class="muted">${esc(label)}</div>`}${r.fee?`<div class="muted">Plus fee ${fmt(r.fee,r.currency)}</div>`:""}</div></div>`});
 h+=`</div><button class="primary" id="isave" style="width:100%">Save ${n} transactions</button><button id="iclear" style="width:100%;margin-top:10px">Discard this import</button>`;
 box.innerHTML=h;
 importRows.forEach((r,i)=>{$("#k"+i).onchange=e=>{r.keep=e.target.checked;renderReview()}});
 box.querySelectorAll("select[data-i]").forEach(s=>s.onchange=e=>{importRows[+s.dataset.i].category=e.target.value});
 $("#iall").onclick=()=>{importRows.forEach(r=>r.keep=true);renderReview()};
 $("#inone").onclick=()=>{importRows.forEach(r=>r.keep=false);renderReview()};
 $("#iclear").onclick=()=>{importRows=[];viewImport()};
 $("#isave").onclick=saveImport;
}
async function saveImport(){
 const rows=importRows.filter(r=>r.keep);if(!rows.length){toast("Nothing selected.");return}
 const btn=$("#isave");btn.disabled=true;let ok=0;
 const batch=[];btn.textContent=`Saving ${rows.length}…`;
 for(const r of rows){
  const t={kind:r.kind,amount:r.amount,currency:r.currency,usd:Math.round(toUsd(r.amount,r.currency)*100)/100,category:r.category,account:r.account,note:r.note,date:r.date,source:"import:"+r.account,createdAt:Date.now()};
  if(r.toAccount)t.toAccount=r.toAccount;
  batch.push(t);
  if(r.fee)batch.push({kind:"expense",amount:r.fee,currency:r.currency,usd:Math.round(toUsd(r.fee,r.currency)*100)/100,category:"fees",account:r.account,note:"Fee: "+r.note,date:r.date,source:"import:"+r.account,createdAt:Date.now()});}
 try{const ids=await gs("addTxBatch",batch);batch.forEach((t,i)=>{t.id=ids[i];TX.unshift(t)});ok=rows.length}catch(e){toast("Couldn't save to your sheet. Try again.");btn.disabled=false;btn.textContent="Try saving again";return}
 toast(`Saved ${ok} transactions.`);importRows=[];location.hash="#home";
}

// ---------- auto import ----------
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function detectAccount(text){const t=text.toLowerCase();for(const a of [...ACCOUNTS].sort((x,y)=>y.length-x.length)){if(a.toLowerCase()!=="cash"&&t.includes(a.toLowerCase()))return a}return null}
function findDate(line,year){let m;
 if((m=line.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)))return{d:m[1]+"-"+pad(m[2])+"-"+pad(m[3]),s:m[0]};
 if((m=line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/))){const y=m[3].length===2?"20"+m[3]:m[3];return{d:y+"-"+pad(m[1])+"-"+pad(m[2]),s:m[0]}}
 if((m=line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i)))return{d:m[3]+"-"+pad(MONTHS[m[1].toLowerCase()])+"-"+pad(m[2]),s:m[0]};
 if((m=line.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i)))return{d:m[3]+"-"+pad(MONTHS[m[2].toLowerCase()])+"-"+pad(m[1]),s:m[0]};
 if((m=line.match(/^\s*(\d{1,2})\/(\d{1,2})\b(?!\/)/)))return{d:year+"-"+pad(m[1])+"-"+pad(m[2]),s:m[0]};
 return null}
function findAmounts(line){const out=[];const re=/(-|\()?\s?([₱$€£¥₹₩₦₫฿]|[A-Z]{3}(?=\s?\d))?\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\)?\s?([A-Z]{3}\b)?/g;const SYMR={"₱":"PHP","$":"USD","€":"EUR","£":"GBP","¥":"JPY","₹":"INR","₩":"KRW","₦":"NGN","₫":"VND","฿":"THB"};let m;
 while((m=re.exec(line))){const v=parseFloat((m[3]+"."+m[4]).replace(/,/g,""));let c=SYMR[m[2]]||m[2]||m[5]||null;if(c&&!curs().includes(c))c=null;out.push({v,cur:c,neg:!!m[1],s:m[0]})}
 return out}
function kindOf(desc,section){const t=desc.toLowerCase();
 if(/atm|withdraw(n|al)?\b|cash ?out/.test(t))return["transfer","Cash"];
 if(/added|moved|top ?up|cash ?in|stash|jar|convert|online payment|payment - thank|transfer (to|from)|own account/.test(t))return["transfer","Other account"];
 if(/received|deposit|refund|interest paid|salary|payroll|from employer/.test(t))return["income",null];
 if(section==="in")return["income",null];
 return["expense",null]}
function parseStatementText(text,acct){
 const ym=text.match(/\b(20\d{2})\b/);const year=ym?ym[1]:String(new Date().getFullYear());
 const lines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean);
 const rows=[];let section=null;const defCur=null;
 for(let i=0;i<lines.length;i++){const L=lines[i];const low=L.toLowerCase();
  if(/^(deposits|credits|additions|money in)\b/.test(low))section="in";
  else if(/^(withdrawals|debits|subtractions|purchases|money out|checks)\b/.test(low))section="out";
  if(/(beginning|ending|opening|closing|available|statement) balance|\btotal|subtotal|page \d|statement period/.test(low))continue;
  const dt=findDate(L,year);if(!dt)continue;
  let rest=L.replace(dt.s," ");let am,desc;
  const prevAm=i>0?findAmounts(lines[i-1]):[];
  if(/transaction:|category:/i.test(rest)&&prevAm.length&&!findDate(lines[i-1],year)){am=prevAm;desc=lines[i-1]}
  else{am=findAmounts(rest);desc=rest;
   if(!am.length&&prevAm.length&&!findDate(lines[i-1],year)){am=prevAm;desc=lines[i-1]+" "+rest}
   if(!am.length&&i+1<lines.length&&!findDate(lines[i+1],year)){am=findAmounts(lines[i+1]);desc=rest+" "+lines[i+1]}}
  if(!am||!am.length)continue;
  if(/declined|cancel+ed|failed|reversed/i.test(desc+" "+rest))continue;
  let a=am[0];if(/withdraw|atm/i.test(desc)){const sameCur=am.filter(x=>x.cur===(a.cur||x.cur));a=sameCur.reduce((p,x)=>x.v>p.v?x:p,a)}
  for(const x of am)desc=desc.replace(x.s," ");
  desc=desc.replace(/transaction:?\s*\S+|category:?|\|/gi," ").replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/gi," ").replace(/\s+/g," ").trim().slice(0,80);
  if(!desc||/^[\d\s.,:-]+$/.test(desc))continue;
  const cur=a.cur||(am.find(x=>x.cur)||{}).cur||defCur||S.defaultCurrency;
  let [kind,to]=kindOf(desc,section);if(a.neg&&kind==="income")kind="expense";
  rows.push({date:dt.d,description:desc,amount:a.v,currency:cur,kind,category:kind==="expense"?guessCat(desc):kind,toAccount:to,fee:0});
 }
 const seen=new Set();return rows.filter(r=>{const k=r.date+"|"+r.amount+"|"+r.description.toLowerCase();if(seen.has(k))return false;seen.add(k);return true});
}
async function autoImport(file,pw,stat){
 stat.className="";stat.textContent="Reading "+file.name+"…";
 let text;try{text=await fileText(file,pw)}catch(e){stat.className="bad";stat.textContent=e.message;return}
 const pick=$("#aacct").value;const acct=pick!=="auto"?pick:detectAccount(text+" "+file.name);
 if(!acct){stat.className="bad";stat.textContent="I couldn't tell which account this is from. Choose it in the box above, then press Save statement again.";return}
 const isPdf=/\.pdf$/i.test(file.name);let rows=isPdf?parseStatementText(text,acct):basicParse(text,acct);
 if(!rows.length&&!isPdf)rows=parseStatementText(text,acct);
 rows=rows.map(r=>normRow(r,acct)).filter(Boolean);
 if(!rows.length){stat.className="bad";stat.textContent="I couldn't find any transactions in that file. If it's a scanned picture, use the CSV download instead.";return}
 markDupes(rows);const fresh=rows.filter(r=>!r.dupe);const skipped=rows.length-fresh.length;
 if(!fresh.length){stat.textContent="All "+rows.length+" transactions from "+acct+" are already in your ledger. Nothing new to add.";return}
 stat.textContent="Saving "+fresh.length+" new transactions from "+acct+"…";
 const batch=fresh.map(r=>{const t={kind:r.kind,amount:r.amount,currency:r.currency,usd:Math.round(toUsd(r.amount,r.currency)*100)/100,category:r.category,account:r.account,note:r.note,date:r.date,source:"import:"+r.account,createdAt:Date.now()};if(r.toAccount)t.toAccount=r.toAccount;return t});
 try{const ids=await gs("addTxBatch",batch);batch.forEach((t,i)=>{t.id=ids[i];TX.unshift(t)})}catch(e){stat.className="bad";stat.textContent="Couldn't save to your sheet. Try again.";return}
 const sp=batch.filter(t=>t.kind==="expense").reduce((s,t)=>s+t.usd,0);
 stat.textContent="Added "+batch.length+" transactions from "+acct+(skipped?", skipped "+skipped+" already in your ledger":"")+". New spending: "+usd(sp)+".";
 if(S.hasKey){stat.textContent+=" Claude is now checking the categories…";await runReview(stat,true)}
}
async function runReview(stat,append){
 try{const r=await gs("reviewWithClaude");
  let msg="Claude checked "+r.checked+" transactions"+(r.changed.length?" and fixed "+r.changed.length+": "+r.changed.slice(0,8).map(c=>c.note+" → "+(CATNAME[c.to]||c.to)).join("; ")+(r.changed.length>8?"; and more":"")+".":" and found nothing to fix.");
  if(r.error)msg=r.error;
  stat.textContent=append?stat.textContent.replace(" Claude is now checking the categories…","")+" "+msg:msg;
  if(r.changed.length)load();
 }catch(e){const m="Claude review didn't work: "+(e&&e.message||e);stat.className="bad";stat.textContent=append?stat.textContent+" "+m:m}
}

// ---------- settings ----------
function viewSettings(){
 const b=S.budgets||{};const inc=(S.income&&S.income.length?S.income:[{name:"",usd:0}]);
 let h=`<h1>Settings</h1>${S.configured?"":`<div class="alert w">Welcome! Fill in these settings once, press Save settings, and the ledger is ready to use.</div>`}<form id="sf">
 <div class="card"><h2 style="margin-top:0">Currencies</h2>
 <label for="hc">Home currency (your budget and income are in this), for example USD</label><input id="hc" maxlength="3" value="${esc(S.homeCur)}" style="text-transform:uppercase">
 <label for="lc">Currency you spend in day to day, for example EUR or PHP (same as home if you only use one)</label><input id="lc" maxlength="3" value="${esc(S.localCur)}" style="text-transform:uppercase">
 <label for="rt">How many of your day-to-day currency equal 1 of your home currency</label><input id="rt" inputmode="decimal" value="${S.rate}">
 <label for="dc">Usual currency when you add an expense</label><select id="dc">${curOptions(S.defaultCurrency)}</select></div>
 <div class="card"><h2 style="margin-top:0">Monthly income (home currency)</h2><div id="inclist">${inc.map((x,i)=>`<div class="grid2 incrow"><div><label for="in${i}">Source</label><input id="in${i}" class="incn" value="${esc(x.name)}" placeholder="Salary"></div><div><label for="ia${i}">Amount</label><input id="ia${i}" class="inca" inputmode="decimal" value="${x.usd||""}"></div></div>`).join("")}</div>
 <button type="button" id="addinc" style="width:100%;margin-top:10px">Add another income source</button></div>
 <div class="card"><h2 style="margin-top:0">Your accounts</h2><label for="accts">Accounts and wallets, separated by commas</label><textarea id="accts" rows="3">${esc((S.accounts||ACCOUNTS).join(", "))}</textarea><p class="muted">Use the same names your banks use (for example "Chase, Revolut, PayPal, Cash") so uploaded statements are matched automatically.</p></div>
 <div class="card"><h2 style="margin-top:0">Budgets (home currency)</h2>
 <label for="bg">Groceries per week</label><input id="bg" inputmode="decimal" value="${S.weeklyGrocery||""}">
 ${CATS.filter(([k])=>k!=="groceries"&&k!=="cash"&&k!=="other").map(([k,n])=>`<label for="b_${k}">${esc(n)} per month</label><input id="b_${k}" inputmode="decimal" value="${b[k]||""}">`).join("")}
 <p class="muted">Leave a category empty if you have no budget for it. Any spending there will show a warning.</p></div>
 <div class="card"><h2 style="margin-top:0">Debt (optional)</h2><label for="ds">Debt total when you started paying it off</label><input id="ds" inputmode="decimal" value="${S.debtStart||""}">
 <label for="dm">Count payments from (month)</label><input id="dm" type="month" value="${esc(S.debtStartMonth)}"></div>
 <button class="primary" type="submit" style="width:100%">Save settings</button><p id="sstat" role="status" style="font-weight:700"></p></form>
 <div class="card"><h2 style="margin-top:0">Claude AI review</h2><p class="muted">${S.hasKey?"Your Claude API key is saved. Paste a new one to replace it.":"Paste your own Claude API key (from console.anthropic.com) so Claude can check that every expense is in the right category. It is stored privately in your Google script, never in the sheet."}</p>
 <label for="akey">Claude API key</label><input id="akey" type="password" autocomplete="off" placeholder="sk-ant-…">
 <button id="akeysave" class="primary" style="width:100%;margin-top:10px">Save key</button>${S.hasKey?`<button id="akeydel" style="width:100%;margin-top:10px">Remove saved key</button>`:""}<p id="akstat" role="status" style="font-weight:700"></p></div>
 <div class="card"><h2 style="margin-top:0">Display</h2><div class="seg"><button id="a1">Text A−</button><button id="a2">Text A+</button></div>
 <button id="th" style="width:100%;margin-top:10px">Switch to ${lsGet("theme")==="light"?"dark":"light"} colors</button></div>`;
 app.innerHTML=h;
 $("#addinc").onclick=()=>{const i=document.querySelectorAll(".incrow").length;$("#inclist").insertAdjacentHTML("beforeend",`<div class="grid2 incrow"><div><label for="in${i}">Source</label><input id="in${i}" class="incn" placeholder="Salary"></div><div><label for="ia${i}">Amount</label><input id="ia${i}" class="inca" inputmode="decimal"></div></div>`);$("#in"+i).focus()};
 $("#akeysave").onclick=async()=>{const k=$("#akey").value.trim();const s=$("#akstat");if(!/^sk-ant-/.test(k)){s.className="bad";s.textContent="That doesn't look like a Claude key. It starts with sk-ant-.";return}s.className="";s.textContent="Saving…";try{const ok=await gs("saveApiKey",k);$("#akey").value="";S.hasKey=true;s.textContent=ok?"Key saved and working.":"Key saved, but Claude didn't answer. Check the key and your credit."}catch(e){s.className="bad";s.textContent="Couldn't save the key."}};
 if($("#akeydel"))$("#akeydel").onclick=async()=>{const s=$("#akstat");const b=$("#akeydel");if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Tap again to remove the key";return}try{await gs("removeApiKey");S.hasKey=false;viewSettings();toast("Key removed.")}catch(e){s.className="bad";s.textContent="Couldn't remove the key."}};
 $("#a1").onclick=()=>{lsSet("fs",Math.max(16,(+lsGet("fs")||20)-2));applyLook()};
 $("#a2").onclick=()=>{lsSet("fs",Math.min(32,(+lsGet("fs")||20)+2));applyLook()};
 $("#th").onclick=()=>{lsSet("theme",lsGet("theme")==="light"?"dark":"light");applyLook();viewSettings()};
 $("#sf").onsubmit=async e=>{e.preventDefault();const n=id=>parseFloat($(id).value)||0;const st=$("#sstat");
  const hc=($("#hc").value||"USD").trim().toUpperCase(),lc=($("#lc").value||hc).trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(hc)||!/^[A-Z]{3}$/.test(lc)){st.className="bad";st.textContent="Currencies need 3-letter codes, like USD, EUR or PHP.";$("#hc").focus();return}
  const income=[...document.querySelectorAll(".incrow")].map(r=>({name:r.querySelector(".incn").value.trim(),usd:parseFloat(r.querySelector(".inca").value)||0})).filter(x=>x.name||x.usd);
  const accounts=$("#accts").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(!accounts.length){st.className="bad";st.textContent="Add at least one account, for example Cash.";$("#accts").focus();return}
  const dc=$("#dc").value;const next={...S,homeCur:hc,localCur:lc,rate:hc===lc?1:(n("#rt")||1),defaultCurrency:[hc,lc].includes(dc)?dc:lc,income,accounts,weeklyGrocery:n("#bg"),budgets:{},debtStart:n("#ds"),debtStartMonth:$("#dm").value||S.debtStartMonth};
  for(const [k] of CATS)if(k!=="groceries"&&k!=="cash"&&k!=="other"&&$("#b_"+k))next.budgets[k]=n("#b_"+k);
  st.className="";st.textContent="Saving…";
  try{S={...next,...(await gs("saveSettings",next))};ACCOUNTS=S.accounts;toast("Settings saved.");viewSettings();$("#sstat").textContent="Settings saved."}catch(err){st.className="bad";st.textContent="Couldn't save settings."}};
}

// ---------- startup ----------
window.addEventListener("hashchange",()=>{importRows=location.hash==="#import"?importRows:importRows;render()});
render();
function load(){
 gs("getData").then(d=>{S={...DEFAULTS,...d.settings,budgets:{...(d.settings.budgets||{})}};ACCOUNTS=(S.accounts&&S.accounts.length?S.accounts:ACCOUNTS);TX=d.tx;dbState="ok";if(!S.configured&&!loaded)location.hash="#settings";const v=(location.hash||"#home").slice(1);if(v==="home"||v==="history"||!loaded)render();loaded=true})
 .catch(()=>{dbState="none";render()});
}
load();
})();

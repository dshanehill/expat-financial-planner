/**
 * @OnlyCurrentDoc
 */
// Financial Planner - Google Sheets backend and website.
// A budget planner for people who earn in one currency and live in another.
// Setup: see README.md. Your budgets, income, currencies, pay day and accounts
// are set inside the app (Settings screen). Your Claude API key is stored
// privately in this script's properties, never in the sheet or the code.

const TX_SHEET = 'Transactions';
const SET_SHEET = 'Settings';
const SUM_SHEET = 'Summary';
const TX_HEAD = ['ID','Date','Type','Category','Amount','Currency','Home amount','Account','To account','Note','Source','Created','Who','Reviewed'];
const CAT_NAMES = {groceries:'Groceries',rent:'Rent or housing',utilities:'Utilities (water, power, internet)',transport:'Transport',shopping:'Shopping and online orders',food:'Food delivery and eating out',debt:'Debt payment',phone:'Phone and subscriptions',ai:'AI and software subscriptions',health:'Health and pharmacy',personal:'Personal care',visa:'Travel, visas and legal',fees:'Bank, ATM and card fees',giving:'Giving and family',cash:'Cash spent (not sorted)',other:'Other'};

const DEFAULT_SETTINGS = {
  configured: false,
  homeCur: 'USD', localCur: 'USD', rate: 1, liveRate: true, payDay: 1, selfName: '', defaultCurrency: 'USD',
  weeklyGrocery: 0,
  budgets: {}, budgetsCur: {}, balances: {},
  income: [{name: 'Main income', usd: 0}],
  accounts: ['Cash', 'Bank', 'Credit card', 'E-wallet'],
  debtStart: 0, debtStartMonth: ''
};

function doGet() {
  setup_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Financial Planner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function setup() { setup_(); }
function setup_() {
  const ss = ss_();
  let tx = ss.getSheetByName(TX_SHEET);
  if (!tx) {
    tx = ss.getSheets()[0];
    if (tx.getLastRow() > 0 || !/^(Sheet1|Sheet 1)$/.test(tx.getName())) tx = ss.insertSheet(TX_SHEET); else tx.setName(TX_SHEET);
    tx.getRange(1, 1, 1, TX_HEAD.length).setValues([TX_HEAD]).setFontWeight('bold');
    tx.setFrozenRows(1);
    tx.getRange('B:B').setNumberFormat('@');
  }
  let st = ss.getSheetByName(SET_SHEET);
  if (!st) {
    st = ss.insertSheet(SET_SHEET);
    st.getRange('A1:B1').setValues([['Settings (change these in the app, on the Settings screen)', JSON.stringify(DEFAULT_SETTINGS)]]);
    st.getRange('A1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SUM_SHEET)) {
    const sm = ss.insertSheet(SUM_SHEET);
    sm.getRange('A1').setValue('This month').setFontWeight('bold');
    sm.getRange('B1').setFormula('=TEXT(TODAY(),"yyyy-mm")');
    sm.getRange('A3:D3').setValues([['Category', 'Spent (home currency)', 'Budget', 'Left']]).setFontWeight('bold');
    const keys = Object.keys(CAT_NAMES);
    keys.forEach((k, i) => {
      const r = 4 + i;
      sm.getRange(r, 1).setValue(CAT_NAMES[k]);
      sm.getRange(r, 2).setFormula('=SUMIFS(Transactions!G:G,Transactions!C:C,"expense",Transactions!D:D,"' + k + '",Transactions!B:B,$B$1&"*")');
      sm.getRange(r, 3).setValue(0);
      sm.getRange(r, 4).setFormula('=C' + r + '-B' + r);
    });
    const tr = 4 + keys.length;
    sm.getRange(tr, 1).setValue('Total').setFontWeight('bold');
    sm.getRange(tr, 2).setFormula('=SUM(B4:B' + (tr - 1) + ')');
    sm.getRange(tr, 3).setFormula('=SUM(C4:C' + (tr - 1) + ')');
    sm.getRange(tr, 4).setFormula('=C' + tr + '-B' + tr);
    sm.getRange(tr + 2, 1).setValue('Income this month');
    sm.getRange(tr + 2, 2).setFormula('=SUMIFS(Transactions!G:G,Transactions!C:C,"income",Transactions!B:B,$B$1&"*")');
    sm.getRange('B4:D' + (tr + 2)).setNumberFormat('#,##0.00');
    sm.autoResizeColumn(1);
  }
}

function readSettings_() {
  let s = {};
  try { s = JSON.parse(ss_().getSheetByName(SET_SHEET).getRange('B1').getValue() || '{}'); } catch (e) {}
  s = Object.assign({}, DEFAULT_SETTINGS, s);
  s.budgets = s.budgets || {};
  s.budgetsCur = s.budgetsCur || {};
  s.balances = s.balances || {};
  s.hasKey = !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  return s;
}

function writeSummaryBudgets_(s) {
  const sm = ss_().getSheetByName(SUM_SHEET); if (!sm) return;
  const keys = Object.keys(CAT_NAMES);
  sm.getRange(4, 3, keys.length, 1).setValues(keys.map(k => [k === 'groceries' ? (+s.weeklyGrocery || 0) * 52 / 12 : (+s.budgets[k] || 0)]));
}

function getData() {
  setup_();
  const sh = ss_().getSheetByName(TX_SHEET);
  const n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 1, n, 13).getValues() : [];
  const tx = rows.filter(r => r[0]).map(r => ({
    id: String(r[0]), date: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[1]),
    kind: r[2], category: r[3], amount: +r[4], currency: r[5], usd: +r[6], account: r[7], toAccount: r[8] || null,
    note: r[9], source: r[10], createdAt: +r[11] || 0, who: r[12] || ''
  }));
  return {settings: readSettings_(), tx: tx};
}

function rowOf_(t) {
  return [t.id || Utilities.getUuid(), String(t.date), t.kind, t.category, +t.amount, t.currency, +t.usd, t.account, t.toAccount || '', t.note || '', t.source || 'manual', t.createdAt || Date.now(), Session.getActiveUser().getEmail() || '', ''];
}

function addTx(t) { return addTxBatch([t])[0]; }

function addTxBatch(list) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(TX_SHEET);
    const rows = list.map(t => { t.id = t.id || Utilities.getUuid(); return rowOf_(t); });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, TX_HEAD.length).setValues(rows);
    return list.map(t => t.id);
  } finally { lock.releaseLock(); }
}

function deleteTx(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(TX_SHEET);
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    for (let i = ids.length - 1; i >= 1; i--) if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 1); return true; }
    return false;
  } finally { lock.releaseLock(); }
}

function writeSettings_(out) {
  delete out.hasKey;
  ss_().getSheetByName(SET_SHEET).getRange('B1').setValue(JSON.stringify(out));
}

// Saves the Settings screen. Merges with what is already saved, so your
// account balances are kept.
function saveSettings(s) {
  const keep = ['homeCur', 'localCur', 'rate', 'liveRate', 'payDay', 'selfName', 'defaultCurrency', 'weeklyGrocery', 'budgets', 'budgetsCur', 'income', 'accounts', 'debtStart', 'debtStartMonth'];
  const out = readSettings_();
  keep.forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
  out.configured = true;
  out.payDay = Math.max(1, Math.min(31, Math.round(+out.payDay || 1)));
  writeSettings_(out);
  writeSummaryBudgets_(out);
  return readSettings_();
}

// "Money you have now": the amount in each account on a given day.
// Spending and transfers you add after that are counted automatically.
function saveBalances(b) {
  const out = readSettings_();
  const items = (b && b.items || []).map(x => ({name: String(x.name || '').slice(0, 40), amount: Math.round((+x.amount || 0) * 100) / 100, currency: String(x.currency || out.homeCur).toUpperCase().slice(0, 3)})).filter(x => x.name);
  out.balances = {date: String(b && b.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')), ts: Date.now(), items: items};
  writeSettings_(out);
  return readSettings_();
}

// ---------- live exchange rate ----------
// Uses Wise's public rate page (unofficial, no account or key needed).
// Cached for 15 minutes. If it can't be reached, the app uses the rate you
// typed in Settings.
function getWiseRate(source, target) {
  source = String(source || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  target = String(target || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (source === target) return {rate: 1, time: Date.now(), source: source, target: target};
  const cache = CacheService.getScriptCache();
  const ck = 'wise_' + source + '_' + target;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  try {
    const res = UrlFetchApp.fetch('https://wise.com/rates/live?source=' + source + '&target=' + target, {muteHttpExceptions: true});
    if (res.getResponseCode() !== 200) return null;
    const j = JSON.parse(res.getContentText());
    const out = {rate: +j.value, time: +j.time || Date.now(), source: source, target: target};
    if (!(out.rate > 0)) return null;
    cache.put(ck, JSON.stringify(out), 900);
    return out;
  } catch (e) { return null; }
}

// ---------- Claude review ----------
function apiKey_() { return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY'); }

function saveApiKey(k) {
  k = String(k || '').trim();
  if (!/^sk-ant-/.test(k)) throw new Error('That is not a Claude key.');
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_KEY', k);
  try { callClaude_('Reply with the word OK.', 10); return true; } catch (e) { return false; }
}

function removeApiKey() { PropertiesService.getScriptProperties().deleteProperty('ANTHROPIC_KEY'); return true; }

function callClaude_(prompt, maxTok, model) {
  const key = apiKey_();
  if (!key) throw new Error('No Claude API key is saved. Add it in Settings.');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {'x-api-key': key, 'anthropic-version': '2023-06-01'},
    payload: JSON.stringify({model: model || 'claude-haiku-5-5', max_tokens: maxTok || 4000, messages: [{role: 'user', content: prompt}]})
  });
  const code = res.getResponseCode();
  let body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (code !== 200) throw new Error((body.error && body.error.message) || ('Claude answered with error ' + code));
  return (body.content || []).map(c => c.text || '').join('');
}

function reviewWithClaude() {
  const s = readSettings_();
  const sh = ss_().getSheetByName(TX_SHEET);
  const n = sh.getLastRow() - 1;
  if (n < 1) return {checked: 0, changed: []};
  const vals = sh.getRange(2, 1, n, 14).getValues();
  const todo = [];
  vals.forEach((r, i) => { if (r[0] && !r[13]) todo.push({row: i + 2, id: String(r[0]), date: String(r[1]), kind: r[2], category: r[3], amount: r[4], currency: r[5], account: r[7], toAccount: r[8], note: r[9]}); });
  if (!todo.length) return {checked: 0, changed: []};
  const chunk = todo.slice(0, 120);
  const cats = Object.keys(CAT_NAMES).map(k => k + ' = ' + CAT_NAMES[k]).join('\n');
  const fixes = [];
  for (let i = 0; i < chunk.length; i += 40) {
    const part = chunk.slice(i, i + 40);
    const r = reviewPart_(s, cats, part);
    if (r.error) return {checked: 0, changed: [], error: r.error};
    r.fixes.forEach(f => fixes.push(f));
  }
  return applyFixes_(sh, chunk, fixes, todo.length);
}

function reviewPart_(s, cats, chunk) {
  const list = chunk.map(t => JSON.stringify({id: t.id, date: t.date, kind: t.kind, category: t.category, amount: t.amount, currency: t.currency, account: t.account, toAccount: t.toAccount, note: t.note})).join('\n');
  const prompt = 'You are checking a personal spending ledger. The owner\'s home currency is ' + s.homeCur + ' and they often spend in ' + s.localCur + '. Their own accounts are: ' + (s.accounts || []).join(', ') + '.\n' +
    'Kinds: "expense" (money spent), "income" (money received from someone else: salary, benefits, family support, refunds), "transfer" (money moved between the owner\'s own accounts: top-ups, moving money between wallets and banks, paying their own credit card, ATM cash withdrawals which go to toAccount "Cash").\n' +
    'Expense categories (use the key on the left):\n' + cats + '\n' +
    (s.selfName ? 'The owner\'s name is ' + s.selfName + ', so money sent to that name is a transfer to their own account.\n' : '') +
    'Hints: ride-hailing, taxis and public transport are transport; food delivery, restaurants, coffee shops and bakeries are food; supermarkets and grocery stores are groceries; ChatGPT, OpenAI, Claude, Anthropic and similar software are ai; mobile load, phone plans and streaming are phone; pharmacies, clinics and doctors are health; ATM and card fees and interest are fees.\n' +
    'Review each transaction below. Return ONLY a JSON array of the ones that are wrong, each as {"id": "...", "kind": "expense|income|transfer", "category": "<key, or the kind for income/transfer>", "toAccount": "<only for transfers>", "reason": "<a few words>"}. Return [] if all are right.\n\nTransactions:\n' + list;
  let text;
  try { text = callClaude_(prompt, 6000); } catch (e) { return {error: 'Claude review did not work: ' + e.message}; }
  return {fixes: parseFixes_(text)};
}

// Reads Claude's answer. Still works if the answer was cut off part way.
function parseFixes_(text) {
  const a = text.indexOf('[');
  if (a < 0) return [];
  const b = text.lastIndexOf(']');
  try { if (b > a) return JSON.parse(text.slice(a, b + 1)); } catch (e) {}
  const out = [];
  const re = /\{[^{}]*\}/g; let m;
  while ((m = re.exec(text.slice(a)))) { try { out.push(JSON.parse(m[0])); } catch (e) {} }
  return out;
}

function applyFixes_(sh, chunk, fixes, total) {
  const byId = {}; chunk.forEach(t => byId[t.id] = t);
  const changed = [];
  fixes.forEach(f => {
    const t = byId[String(f.id)]; if (!t) return;
    const kind = ['expense', 'income', 'transfer'].indexOf(f.kind) >= 0 ? f.kind : t.kind;
    const cat = kind === 'expense' ? (CAT_NAMES[f.category] ? f.category : t.category) : kind;
    if (kind === t.kind && cat === t.category) return;
    sh.getRange(t.row, 3, 1, 2).setValues([[kind, cat]]);
    if (kind === 'transfer') sh.getRange(t.row, 9).setValue(f.toAccount || t.toAccount || 'Other account');
    changed.push({note: t.note || '', from: t.category, to: cat, reason: f.reason || ''});
  });
  const stamp = 'Claude ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  chunk.forEach(t => sh.getRange(t.row, 14).setValue(stamp));
  return {checked: chunk.length, changed: changed, remaining: total - chunk.length};
}

// ---------- AI money briefing ----------
// A short, plain-language check-in on this pay cycle, written by Claude.
function moneyBriefing(facts) {
  const s = readSettings_();
  const prompt = 'You are a friendly, careful money coach for someone living abroad. Their home currency is ' + s.homeCur + ' and they spend day to day in ' + s.localCur + '. ' +
    'Here are the facts for their current pay cycle, as JSON:\n' + JSON.stringify(facts).slice(0, 12000) + '\n\n' +
    'Write a short check-in in plain, simple English (short sentences, no jargon, no tables, no markdown symbols). ' +
    'Say: 1) how the cycle is going overall, 2) the one or two categories to watch, 3) how much they can safely spend per day until next pay day, 4) one practical tip. ' +
    'Show money in the home currency with the local amount in brackets. Keep it under 180 words. You are not a licensed financial advisor, so do not give investment advice.';
  try { return {text: callClaude_(prompt, 900, 'claude-sonnet-5-5')}; }
  catch (e) {
    try { return {text: callClaude_(prompt, 900)}; } catch (e2) { return {error: 'Claude could not write the briefing: ' + e2.message}; }
  }
}

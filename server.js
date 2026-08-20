/* =========================================================
   NOOK — ALL-IN-ONE AI CHAT (single file)
   Node.js 18+ · no dependencies

   START:  node nook-server.js
   OPEN:   http://localhost:3000

   The OpenRouter key is entered in the UI (settings) and
   stored only in the browser. You can also preset it:
     export OPENROUTER_API_KEY="sk-or-..."
     export OPENROUTER_MODEL="openrouter/auto"
   ========================================================= */
   const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
"use strict";

const http = require("http");

const PORT = Number(process.env.PORT || 3000);
const SERVER_KEY = process.env.OPENROUTER_API_KEY || "";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `
You are Nook, a calm and thoughtful conversational companion.
- warm without being overly enthusiastic
- thoughtful without sounding clinical
- honest when uncertain
- prefer natural paragraphs, markdown when useful
- no filler, no "Absolutely!", no repeating the question
- keep simple questions short, go deep when it matters
Nook should feel like a quiet conversation, not a productivity dashboard.
`.trim();

/* ---------------------------------------------------- utils */
function json(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function readBody(req, max = 4000000) {
  return new Promise((resolve, reject) => {
    let data = "";
    let done = false;
    const fail = (e) => { if (!done) { done = true; reject(e); } };
    req.on("data", (chunk) => {
      if (done) return;
      data += chunk;
      if (data.length > max) { fail(new Error("Request is too large.")); req.destroy(); }
    });
    req.on("end", () => { if (!done) { done = true; resolve(data); } });
    req.on("error", fail);
    req.on("aborted", () => fail(new Error("Request was aborted.")));
  });
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 30000) }))
    .slice(-40);
}

/* ---------------------------------------------------- chat */
async function streamChat(req, res, raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: "Invalid JSON." }); }

  const key = (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) || SERVER_KEY;
  if (!key) return json(res, 400, { error: "Add your OpenRouter key in settings." });

  const messages = cleanMessages(parsed.messages);
  if (!messages.length) return json(res, 400, { error: "No messages supplied." });

  const controller = new AbortController();
  req.on("aborted", () => controller.abort());

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "http://localhost:" + PORT,
        "X-Title": "Nook",
      },
      body: JSON.stringify({
        model: (typeof parsed.model === "string" && parsed.model.trim()) || DEFAULT_MODEL,
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return json(res, upstream.status || 500, { error: text.slice(0, 500) || "AI request failed." });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (res.writableEnded || res.destroyed) { controller.abort(); break; }
        res.write(decoder.decode(value));
      }
    } finally {
      try { reader.releaseLock(); } catch {}
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    if (error.name === "AbortError") { if (!res.writableEnded) try { res.end(); } catch {} return; }
    if (!res.headersSent) json(res, 500, { error: error.message || "AI request failed." });
    else try { res.end(); } catch {}
  }
}

/* ---------------------------------------------------- html */
const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f6f2e9">
<title>Nook — a quieter place to think</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#f6f2e9; --paper2:#eee7d7; --card:#fffdf7;
  --ink:#29251f; --soft:#6d6659; --faint:#a59b87;
  --moss:#4b5d45; --moss2:#34412f; --rule:#ddd4bf;
  --danger:#a54b44; --shadow:0 18px 60px rgba(42,38,32,.12);
}
body.dark{
  --paper:#1d1d1a; --paper2:#292923; --card:#252520;
  --ink:#eee9dd; --soft:#aaa391; --faint:#777363;
  --moss:#879c78; --moss2:#a4b997; --rule:#3a3931;
  --danger:#df837b; --shadow:0 18px 60px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;width:100%}
body{background:var(--paper);color:var(--ink);font-family:Inter,sans-serif;display:flex;flex-direction:column;overflow:hidden}
button,textarea,input,select{font:inherit}
svg{width:17px;height:17px}

header{flex-shrink:0;min-height:66px;padding:16px 25px;border-bottom:1px solid var(--rule);display:flex;align-items:center;justify-content:space-between;gap:15px}
.brand{display:flex;align-items:center;gap:9px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--moss)}
.brand h1{margin:0;font:500 22px Fraunces,serif}
.tag{color:var(--faint);font:italic 12px Fraunces,serif}
.header-actions{display:flex;align-items:center;gap:8px}
.count{color:var(--faint);font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.icon{width:34px;height:34px;border:1px solid var(--rule);border-radius:9px;background:transparent;color:var(--soft);display:flex;align-items:center;justify-content:center;cursor:pointer}
.icon:hover{color:var(--moss2);border-color:var(--moss);background:var(--paper2)}
.icon.active{color:var(--paper);background:var(--moss);border-color:var(--moss)}

main{flex:1;min-height:0;overflow:auto;scroll-behavior:smooth}
.thread{width:min(780px,100%);margin:auto;padding:40px 22px 35px}
.empty{max-width:550px;margin:12vh auto 0;text-align:center}
.empty h2{margin:0 0 14px;font:400 30px/1.3 Fraunces,serif}
.empty p{color:var(--soft);font-size:14px;line-height:1.75;margin:0 0 27px}
.prompts{display:grid;gap:8px}
.prompt{padding:13px 15px;text-align:left;color:var(--soft);background:var(--card);border:1px solid var(--rule);border-radius:11px;cursor:pointer}
.prompt:hover{color:var(--ink);border-color:var(--moss)}

.msg{max-width:90%;margin-bottom:28px;animation:up .25s ease both}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.msg.user{margin-left:auto}
.role{color:var(--faint);font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
.role:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:7px;background:var(--moss)}
.msg.user .role{text-align:right}
.msg.user .role:before{background:var(--faint)}
.body{padding:13px 18px;border-radius:16px;font-size:15px;line-height:1.7;overflow-wrap:anywhere}
.user .body{background:var(--paper2);border-bottom-right-radius:4px}
.assistant .body{background:var(--card);border:1px solid var(--rule);border-bottom-left-radius:4px;font:400 16px/1.7 Fraunces,serif}
.body p{margin:0 0 13px}
.body p:last-child{margin-bottom:0}
.body code{font:12px ui-monospace,monospace;background:var(--paper);color:var(--moss2);padding:2px 6px;border-radius:5px}
.body pre{overflow:auto;background:#211f1a;color:#f4eee1;padding:15px;border-radius:10px;font:12px/1.6 ui-monospace,monospace}
.body pre code{background:none;color:inherit;padding:0}
.actions{display:flex;gap:4px;margin-top:7px;padding-left:4px}
.action{width:31px;height:29px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--faint);cursor:pointer;display:flex;align-items:center;justify-content:center}
.action:hover,.action.active{color:var(--moss2);background:var(--paper2);border-color:var(--rule)}
.thinking{padding:13px 17px;border:1px solid var(--rule);background:var(--card);border-radius:16px 16px 16px 4px;color:var(--faint);font:italic 15px Fraunces,serif}
.attachments{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--rule);border-radius:999px;background:var(--card);color:var(--soft);font-size:11px}
.chip button{border:0;background:none;color:var(--faint);cursor:pointer;font-size:13px;line-height:1}

footer{flex-shrink:0;padding:12px 18px 17px;border-top:1px solid var(--rule);background:var(--paper)}
.composer{width:min(780px,100%);margin:auto;display:flex;align-items:flex-end;gap:7px;padding:8px 8px 8px 15px;background:var(--card);border:1px solid var(--rule);border-radius:15px}
.composer:focus-within{border-color:var(--moss)}
textarea{flex:1;min-width:0;min-height:38px;max-height:170px;resize:none;padding:7px 0;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px;line-height:1.55}
textarea::placeholder{color:var(--faint)}
.send,.mic{flex-shrink:0;width:39px;height:39px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.send{border:0;color:var(--paper);background:var(--moss)}
.send:hover{background:var(--moss2)}
.send.stop{background:var(--danger)}
.mic{color:var(--soft);background:transparent;border:1px solid var(--rule)}
.mic.listening{color:var(--paper);background:var(--moss);border-color:var(--moss)}
.hint{width:min(780px,100%);margin:8px auto 0;text-align:center;color:var(--faint);font-size:10px}

/* ---- FILE DROP OVERLAY ---- */
.dropzone{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;
  background:color-mix(in srgb, var(--paper) 82%, transparent);backdrop-filter:blur(3px)}
.dropzone.show{display:flex;animation:fade .15s ease both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.dropcard{pointer-events:none;text-align:center;padding:46px 60px;border:2px dashed var(--moss);border-radius:22px;
  background:var(--card);box-shadow:var(--shadow)}
.dropcard h3{margin:14px 0 6px;font:500 22px Fraunces,serif;color:var(--ink)}
.dropcard p{margin:0;color:var(--soft);font-size:13px}
.dropcard svg{width:30px;height:30px;color:var(--moss)}

.drawer{position:fixed;right:18px;top:74px;width:340px;max-width:calc(100% - 36px);padding:17px;background:var(--card);
  border:1px solid var(--rule);border-radius:15px;box-shadow:var(--shadow);display:none;z-index:50}
.drawer.open{display:block}
.drawer h3{margin:0 0 5px;font:500 20px Fraunces,serif}
.drawer p{margin:0 0 14px;color:var(--soft);font-size:12px;line-height:1.55}
.field{margin:12px 0}
.field label{display:block;margin-bottom:6px;color:var(--soft);font-size:11px}
.input{width:100%;padding:9px;border:1px solid var(--rule);border-radius:9px;background:var(--paper);color:var(--ink);outline:0}
.small{border:1px solid var(--rule);color:var(--soft);background:transparent;border-radius:7px;padding:6px 10px;cursor:pointer}
.small.primary{color:var(--paper);background:var(--moss);border-color:var(--moss)}
.toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(10px);opacity:0;pointer-events:none;
  padding:9px 13px;color:var(--paper);background:var(--ink);border-radius:9px;font-size:12px;transition:.2s;z-index:100}
.toast.show{opacity:1;transform:translateX(-50%)}
@media(max-width:600px){
  header{padding:13px 15px}.tag,.count{display:none}
  .thread{padding:27px 14px}.msg{max-width:95%}
  .dropcard{padding:34px 26px}
}
</style>
</head>
<body>

<header>
  <div class="brand">
    <span class="dot"></span>
    <h1>Nook</h1>
    <span class="tag">a quieter place to think</span>
  </div>
  <div class="header-actions">
    <button class="icon" id="readBtn" title="Read replies aloud">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
    </button>
    <button class="icon" id="settingsBtn" title="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 5.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/></svg>
    </button>
    <button class="icon" id="themeBtn" title="Dark mode">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
    </button>
    <button class="icon" id="newBtn" title="New conversation">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14"/></svg>
    </button>
    <span class="count" id="count">0 exchanges</span>
  </div>
</header>

<main id="main">
  <div class="thread" id="thread">
    <div class="empty" id="empty">
      <h2>No dashboards.<br>Just a good conversation.</h2>
      <p>Ask something difficult, simple, strange, personal, technical, or completely random. Drop a text file anywhere to add it to the conversation.</p>
      <div class="prompts">
        <button class="prompt">Explain a complicated idea to me like you would explain it to a curious friend.</button>
        <button class="prompt">Help me think through a difficult decision.</button>
        <button class="prompt">Tell me something interesting that will make me think.</button>
      </div>
    </div>
  </div>
</main>

<footer>
  <div class="composer">
    <textarea id="input" rows="1" placeholder="Say what's on your mind..."></textarea>
    <button class="mic" id="micBtn" title="Speak">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>
    </button>
    <button class="send" id="sendBtn" title="Send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
  </div>
  <div class="attachments" id="attachments" style="width:min(780px,100%);margin:8px auto 0"></div>
  <p class="hint">Enter to send · Shift+Enter for a new line · drop files to attach</p>
</footer>

<!-- file drop background -->
<div class="dropzone" id="dropzone">
  <div class="dropcard">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/></svg>
    <h3>Drop your files here</h3>
    <p>Text, markdown, code, CSV or JSON — Nook will read them.</p>
  </div>
</div>

<div class="drawer" id="drawer">
  <h3>Nook settings</h3>
  <p>Your OpenRouter key is stored only on this device.</p>
  <div class="field">
    <label>OpenRouter API key</label>
    <input class="input" id="keyInput" type="password" placeholder="sk-or-...">
  </div>
  <div class="field">
    <label>Model</label>
    <input class="input" id="modelInput" placeholder="openrouter/auto">
  </div>
  <button class="small primary" id="saveSettings">Save</button>
  <button class="small" id="closeSettings">Close</button>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = (id) => document.getElementById(id);
const thread = $("thread"), empty = $("empty"), main = $("main"), input = $("input");
let history = [];
let files = [];
let generating = false, controller = null, autoRead = false;

/* ---------- storage ---------- */
try { history = JSON.parse(localStorage.getItem("nook_history") || "[]"); } catch {}
if (localStorage.getItem("nook_theme") === "dark") document.body.classList.add("dark");
$("keyInput").value = localStorage.getItem("nook_key") || "";
$("modelInput").value = localStorage.getItem("nook_model") || "";
const save = () => localStorage.setItem("nook_history", JSON.stringify(history.slice(-80)));

function notify(text){ const t=$("toast"); t.textContent=text; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1600); }
function scrollBottom(){ main.scrollTop = main.scrollHeight; }
function esc(s){ return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function markdown(src){
  let s = esc(src);
  s = s.replace(/\u0060\u0060\u0060([\s\S]*?)\u0060\u0060\u0060/g, (_,c)=>"<pre><code>"+c.trim()+"</code></pre>");
  s = s.replace(/\u0060([^\u0060\n]+)\u0060/g, "<code>$1</code>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  return s.split(/\n{2,}/).map(p => p.startsWith("<pre") || p.startsWith("<h") ? p : "<p>"+p.replace(/\n/g,"<br>")+"</p>").join("");
}
function updateCount(){ $("count").textContent = history.filter(m=>m.role==="user").length + " exchanges"; }

/* ---------- render ---------- */
function renderAll(){
  thread.innerHTML = "";
  if(!history.length){ thread.appendChild(empty); empty.style.display=""; updateCount(); return; }
  empty.style.display = "none";
  history.forEach((item, index) => thread.appendChild(renderMessage(item, index)));
  updateCount(); scrollBottom();
}
function renderMessage(item, index){
  const el = document.createElement("article");
  el.className = "msg " + item.role;

  const role = document.createElement("div");
  role.className = "role";
  role.textContent = item.role === "user" ? "You" : "Nook";

  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = markdown(item.content);

  el.append(role, body);

  if(item.role === "user"){
  const actions = document.createElement("div");
actions.className = "actions";

actions.append(
  actionButton(
    "Edit",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>',
    () => editMessage(index)
  )
);

el.append(actions);

    const actions = document.createElement("div");
    actions.className = "actions";

    actions.append(
      actionButton(
        "Edit",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>',
        () => editMessage(index)
      )
    );

    el.append(actions);
  }

  function editMessage(index){
  if(generating) return;

  const message = history[index];
  if(!message || message.role !== "user") return;

  input.value = message.content;
  input.focus();

  history = history.slice(0, index);
  save();
  renderAll();
}

  if(item.role === "assistant"){
    const actions = document.createElement("div");
    actions.className = "actions";

    actions.append(
      actionButton(
        "Read aloud",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
        () => speak(item.content)
      ),

      actionButton(
        "Copy",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
        async () => {
          await navigator.clipboard.writeText(item.content);
          notify("Copied.");
        }
      ),

      actionButton(
        "Regenerate",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
        () => regenerate(index)
      )
    );

    el.append(actions);
  }

  return el;
}

function editMessage(index){
  if(generating) return;

  const message = history[index];
  if(!message || message.role !== "user") return;

  input.value = message.content;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 170) + "px";

  // Remove this message and everything after it.
  history = history.slice(0, index);
  save();
  renderAll();

  input.focus();
  notify("Edit your message and press Send.");
}


function actionButton(label, svg, onClick){
  const b = document.createElement("button");
  b.className = "action"; b.title = label; b.setAttribute("aria-label", label);
  b.innerHTML = svg; b.onclick = onClick; return b;
}

/* ---------- speech ---------- */
function speak(text){
  if(!("speechSynthesis" in window)) return notify("No speech engine.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = .98; u.pitch = 1; speechSynthesis.speak(u);
}

/* ---------- send ---------- */
async function send(text){
  const value = (text ?? input.value).trim();
  if(!value || generating) return;
  let content = value;
  if(files.length){
    content += "\n\n" + files.map(f => "--- " + f.name + " ---\n" + f.text).join("\n\n");
    files = []; renderAttachments();
  }
  history.push({ role:"user", content }); save(); renderAll();
  input.value = ""; input.style.height = "auto";
  await generate();
}

async function generate(){
  generating = true;
  $("sendBtn").classList.add("stop");
  const holder = document.createElement("article");
  holder.className = "msg assistant";
  holder.innerHTML = '<div class="role">Nook</div><div class="thinking">thinking…</div>';
  thread.appendChild(holder); scrollBottom();

  controller = new AbortController();
  let answer = "";
  try{
    const response = await fetch("/api/chat", {
      method:"POST", signal: controller.signal,
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        messages: history,
        apiKey: localStorage.getItem("nook_key") || "",
        model: localStorage.getItem("nook_model") || ""
      })
    });
    if(!response.ok || !response.body){
      const data = await response.json().catch(()=>({}));
      throw new Error(data.error || "Nook could not answer that.");
    }
    const body = document.createElement("div");
    body.className = "body";
    holder.querySelector(".thinking").replaceWith(body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, { stream:true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for(const line of lines){
        if(!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if(!payload || payload === "[DONE]") continue;
        try{
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if(delta){ answer += delta; body.innerHTML = markdown(answer); scrollBottom(); }
        }catch{}
      }
    }
  }catch(error){
    if(error.name !== "AbortError") notify(error.message);
  }finally{
    generating = false; controller = null;
    $("sendBtn").classList.remove("stop");
    holder.remove();
    if(answer.trim()){ history.push({ role:"assistant", content: answer.trim() }); save(); }
    renderAll();
    if(autoRead && answer.trim()) speak(answer.trim());
  }
}

async function regenerate(index){
  if(generating) return;
  history = history.slice(0, index); save(); renderAll(); await generate();
}

/* ---------- file drop ---------- */
const dropzone = $("dropzone");
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; dropzone.classList.add("show"); });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth-1); if(!dragDepth) dropzone.classList.remove("show"); });
window.addEventListener("drop", async (e) => {
  e.preventDefault(); dragDepth = 0; dropzone.classList.remove("show");
  const dropped = Array.from(e.dataTransfer?.files || []);
  for(const file of dropped){
    if(file.size > 400000){ notify(file.name + " is too large."); continue; }
    try{ files.push({ name: file.name, text: (await file.text()).slice(0, 200000) }); }
    catch{ notify("Could not read " + file.name); }
  }
  renderAttachments();
  if(dropped.length) notify(dropped.length + " file(s) attached.");
});
function renderAttachments(){
  const box = $("attachments"); box.innerHTML = "";
  files.forEach((file, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = "<span>" + esc(file.name) + "</span>";
    const x = document.createElement("button");
    x.textContent = "✕"; x.onclick = () => { files.splice(i,1); renderAttachments(); };
    chip.appendChild(x); box.appendChild(chip);
  });
}

/* ---------- ui wiring ---------- */
$("sendBtn").onclick = () => generating ? controller?.abort() : send();
input.addEventListener("keydown", (e) => { if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 170) + "px"; });
document.addEventListener("click", (e) => { if(e.target.classList.contains("prompt")) send(e.target.textContent); });
$("newBtn").onclick = () => { if(history.length && !confirm("Start a new conversation?")) return; history = []; save(); renderAll(); };
$("themeBtn").onclick = () => { document.body.classList.toggle("dark"); localStorage.setItem("nook_theme", document.body.classList.contains("dark") ? "dark" : "light"); };
$("readBtn").onclick = () => { autoRead = !autoRead; $("readBtn").classList.toggle("active", autoRead); if(!autoRead) speechSynthesis.cancel(); notify(autoRead ? "Reading replies aloud." : "Auto-read off."); };
$("settingsBtn").onclick = () => $("drawer").classList.toggle("open");
$("closeSettings").onclick = () => $("drawer").classList.remove("open");
$("saveSettings").onclick = () => {
  localStorage.setItem("nook_key", $("keyInput").value.trim());
  localStorage.setItem("nook_model", $("modelInput").value.trim());
  $("drawer").classList.remove("open"); notify("Saved.");
};
$("micBtn").onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return notify("Microphone is not supported here.");
  const recognition = new SR();
  recognition.lang = "en-US"; recognition.interimResults = true;
  recognition.onresult = (event) => {
    input.value = Array.from(event.results).map(r => r[0].transcript).join("");
  };
  recognition.onstart = () => $("micBtn").classList.add("listening");
  recognition.onend = () => $("micBtn").classList.remove("listening");
  recognition.start();
};

renderAll();
</script>
</body>
</html>`;

/* ---------------------------------------------------- server */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(HTML);
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, model: DEFAULT_MODEL, serverKey: Boolean(SERVER_KEY) });
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      let body;
      try { body = await readBody(req); } catch (e) { return json(res, 413, { error: e.message }); }
      return streamChat(req, res, body);
    }
    json(res, 404, { error: "Not found." });
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: "Internal server error." });
    else try { res.end(); } catch {}
  }
});

server.listen(PORT, () => {
  console.log("\n  NOOK  →  http://localhost:" + PORT);
  console.log("  Model:", DEFAULT_MODEL);
  console.log("  Key:", SERVER_KEY ? "from environment" : "entered in the browser\n");
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down...`);
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
const firebaseConfig = {
  apiKey: "AIzaSyCBGxr3JcK_BAZH0UnM9m0aAxIaE3WtfjA",
  authDomain: "public-chat-d51a6.firebaseapp.com",
  databaseURL: "https://public-chat-d51a6-default-rtdb.firebaseio.com",
  projectId: "public-chat-d51a6",
  storageBucket: "public-chat-d51a6.firebasestorage.app",
  messagingSenderId: "608024937712",
  appId: "1:608024937712:web:265b2e561a79a346d72e35"
};
const GIPHY_API_KEY = "qHAIjXFjeljEohQ4pxBDkhfB1A1EslaH";
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentUid = null;
let profile = { displayName: "", avatar: "" };
let lastSent = 0;
let sendCooldown = 1000;
let typingTimeout = 4000;
const CUSTOM_EMOJIS = ["🔥","😂","❤️","👍","👀"];
const PRESET_AVATARS = ["🦊","🐼","🐵","🐯","🐰","🦁","🐸","🐨","🐶","🐱"];

const emojiPicker = document.getElementById("emojiPicker");
const emojiBtn = document.getElementById("emojiBtn");
const gifBtn = document.getElementById("gifBtn");
const gifPanel = document.getElementById("gifPanel");
const gifResults = document.getElementById("gifResults");
const giphySearch = document.getElementById("giphySearch");
const messageInput = document.getElementById("messageInput");
const messagesEl = document.getElementById("messages");
const sendBtn = document.getElementById("sendBtn");
const selectedGifPreview = document.getElementById("selectedGifPreview");
const profileModal = document.getElementById("profileModal");
const setProfileBtn = document.getElementById("setProfileBtn");
const displayNameInput = document.getElementById("displayName");
const profileAvatarPreview = document.getElementById("miniAvatar");
const miniAvatar = document.getElementById("miniAvatar");
const typingArea = document.getElementById("typingArea");
const whoTyping = document.getElementById("whoTyping");
const reactorsPopup = document.getElementById("reactorsPopup");

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }


PRESET_AVATARS.forEach(a=>{
  const btn = document.createElement("div");
  btn.className = "avatar-option";
  btn.textContent = a;
  btn.onclick = ()=>{ Array.from(document.querySelectorAll('.avatar-option')).forEach(x=>x.style.outline=""); btn.style.outline="3px solid rgba(37,99,235,0.25)"; displayNameInput.focus(); btn.dataset.selected="1"; btn.dataset.avatar=a; };
  document.getElementById("avatarGrid").appendChild(btn);
});

gifBtn.onclick=()=>toggleGifPanel();

function toggleGifPanel(){ gifPanel.style.display = gifPanel.style.display==="flex" ? "none" : "flex"; if(gifPanel.style.display==="flex") giphySearch.focus(); }

sendBtn.onclick=sendMessage;
messageInput.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); } sendTyping(); });

setProfileBtn.onclick=()=>profileModal.style.display="block";
document.getElementById("closeProfile").onclick=()=>profileModal.style.display="none";
document.getElementById("saveProfile").onclick=saveProfile;
miniAvatar.onclick=()=>profileModal.style.display="block";

giphySearch.oninput=debounce(loadGifs,350);

function generateGuestName(){ return "Guest"+Math.floor(Math.random()*9000+1000); }

firebase.auth().signInAnonymously().catch(()=>{});
firebase.auth().onAuthStateChanged(u=>{
  if(!u) return;
  currentUid = u.uid;
  db.ref(`users/${currentUid}`).once("value").then(snap=>{
    const p = snap.val() || {};
    profile.displayName = p.displayName || generateGuestName();
    profile.avatar = p.avatar || PRESET_AVATARS[0];
    displayNameInput.value = profile.displayName;
    miniAvatar.textContent = profile.avatar;
    db.ref(`users/${currentUid}`).update(profile);
  });
  listenTyping();
  loadInitialMessages();
});

function saveProfile(){
  const name = displayNameInput.value.trim() || generateGuestName();
  const selected = Array.from(document.querySelectorAll('.avatar-option')).find(x=>x.dataset.selected==="1");
  const avatar = selected ? selected.dataset.avatar : profile.avatar || PRESET_AVATARS[0];
  profile.displayName = name;
  profile.avatar = avatar;
  db.ref(`users/${currentUid}`).set(profile).then(()=>{
    miniAvatar.textContent = profile.avatar;
    profileModal.style.display = "none";
  });
}

let selectedGifUrl = "";

function loadGifs(){
  if(!GIPHY_API_KEY) return;
  const q = encodeURIComponent(giphySearch.value.trim());
  if(!q) return;
  fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${q}&limit=24&rating=pg-13`).then(r=>r.json()).then(d=>{
    gifResults.innerHTML = d.data.map(g=>`<img src="${g.images.fixed_width_small.url}" data-src="${g.images.original.url}">`).join('');
    Array.from(gifResults.querySelectorAll('img')).forEach(img=>img.onclick=()=>{
      selectedGifUrl = img.dataset.src;
      selectedGifPreview.innerHTML = `<img src="${img.src}" class="img-preview">`;
      gifPanel.style.display = "none";
    });
  });
}

function sendMessage(){
  const now = Date.now();
  if(now - lastSent < sendCooldown) return;
  const text = messageInput.value.trim();
  if(!text && !selectedGifUrl) return;
  lastSent = now;
  const msg = { userId: currentUid, name: profile.displayName, avatar: profile.avatar, text: text, img: selectedGifUrl||"", ts: Date.now(), reactions: {} };
  db.ref("messages").push(msg).then(()=>{ messageInput.value=""; selectedGifPreview.innerHTML=""; selectedGifUrl=""; sendTyping(true); });
}

function loadInitialMessages(){
  db.ref("messages").limitToLast(200).on("child_added",snap=>renderMessage(snap.key,snap.val()));
  db.ref("messages").on("child_changed",snap=>renderMessage(snap.key,snap.val()));
  db.ref("messages").on("child_removed",snap=>{ const el=document.getElementById("m-"+snap.key); if(el) el.remove(); });
}

function renderMessage(id,msg){
  const exist = document.getElementById("m-"+id);
  const el = exist || document.createElement("div");
  el.id = "m-"+id;
  el.className = "msg-row";
  const mine = msg.userId && currentUid && msg.userId===currentUid;
  if(mine) el.classList.add("me");
  el.innerHTML = `<div class="avatar">${escapeHtml(msg.avatar||PRESET_AVATARS[0])}</div><div class="bubble"><div class="meta"><div class="username">${escapeHtml(msg.name||"Guest")}</div><div class="time">${new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div><div class="text">${escapeHtml(msg.text||"")}${msg.img?`<img src="${escapeAttr(msg.img)}" class="img-preview">`:''}</div><div class="reaction-bar" data-id="${id}"></div>${mine?`<div style="margin-top:8px;display:flex;gap:8px"><button class="icon-btn" onclick="promptEdit('${id}')">Edit</button><button class="icon-btn" onclick="deleteMessage('${id}')">Delete</button></div>`:""}</div>`;
  if(!exist) messagesEl.appendChild(el);
  updateReactionsUI(id,msg.reactions||{});
  attachReactionHandlers(id);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function attachReactionHandlers(id){
  const bar = document.querySelector(`[data-id="${id}"]`);
  if(!bar) return;
  bar.innerHTML = "";
  CUSTOM_EMOJIS.forEach(e=>{
    const btn = document.createElement("button");
    btn.className = "reaction-btn";
    btn.textContent = e;
    btn.onclick = ()=>toggleReact(id,e);
    bar.appendChild(btn);
  });
  const counts = document.createElement("div");
  counts.style.marginLeft="8px";
  counts.style.display="flex";
  counts.style.gap="6px";
  counts.onclick = e=>{ const target = e.target.closest('.reaction-count'); if(target){ const emoji = target.dataset.emoji; showReactorsPopup(id,emoji,target); } };
  bar.appendChild(counts);
}

function updateReactionsUI(id,reactions){
  const bar = document.querySelector(`[data-id="${id}"]`);
  if(!bar) return;
  const counts = bar.querySelector('div');
  counts.innerHTML = "";
  Object.keys(reactions).forEach(key=>{
    const users = reactions[key]||{};
    const cnt = Object.keys(users).length;
    if(cnt>0){
      const span = document.createElement("span");
      span.className = "reaction-count";
      span.textContent = `${key} ${cnt}`;
      span.dataset.emoji = key;
      counts.appendChild(span);
    }
  });
  const myReact = Object.keys(reactions||{}).some(k=>reactions[k] && reactions[k][currentUid]);
  const el = document.getElementById("m-"+id);
  if(el) el.style.border = myReact ? "1px solid #e6f4ea" : "";
}

function toggleReact(msgId,emoji){
  if(!currentUid) return;
  const safe = emoji.replace(/\./g,'[dot]');
  const ref = db.ref(`messages/${msgId}/reactions/${safe}/${currentUid}`);
  ref.once("value").then(snap=>{ if(snap.exists()) ref.remove(); else ref.set(true); });
}

function showReactorsPopup(msgId,emoji,targetEl){
  const safe = emoji.replace(/\./g,'[dot]');
  db.ref(`messages/${msgId}/reactions/${safe}`).once("value").then(snap=>{
    const uids = snap.val()||{};
    const list = Object.keys(uids);
    if(list.length===0) return;
    const promises = list.map(uid=>db.ref(`users/${uid}`).once("value").then(s=>({uid, ...s.val()})));
    Promise.all(promises).then(arr=>{
      reactorsPopup.innerHTML = arr.map(a=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><div style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f0f2f5">${escapeHtml(a.avatar||PRESET_AVATARS[0])}</div><div><div style="font-weight:600">${escapeHtml(a.displayName||a.uid)}</div></div></div>`).join("");
      reactorsPopup.style.display="block";
      const r = targetEl.getBoundingClientRect();
      reactorsPopup.style.left = (r.right+8)+"px";
      reactorsPopup.style.top = (r.top+window.scrollY)+"px";
      setTimeout(()=>reactorsPopup.style.display="none",5000);
    });
  });
}

function listenTyping(){
  messageInput.addEventListener("input",sendTyping);
  setInterval(()=>{ db.ref('typing').once('value').then(snap=>{ const data = snap.val()||{}; const now=Date.now(); const typingUsers = Object.keys(data).filter(k=> now - (data[k].ts||0) < typingTimeout && k!==currentUid).map(k=>data[k].name); typingArea.textContent = typingUsers.length ? `${typingUsers.join(', ')} is typing…` : ''; }); },1000);
}

function sendTyping(forceOff){ if(!currentUid) return; if(forceOff){ db.ref(`typing/${currentUid}`).remove(); return; } db.ref(`typing/${currentUid}`).set({ name: profile.displayName, ts: Date.now() }); setTimeout(()=>{ const path = `typing/${currentUid}`; db.ref(path).once('value').then(snap=>{ const v = snap.val(); if(v && Date.now() - v.ts >= typingTimeout) db.ref(path).remove(); }); }, typingTimeout+200); }

function promptEdit(id){ db.ref(`messages/${id}`).once('value').then(snap=>{ const m=snap.val(); if(!m) return; if(m.userId!==currentUid) return alert("only your messages"); const txt = prompt("Edit",m.text||""); if(txt===null) return; db.ref(`messages/${id}`).update({ text: txt, edited: true, editedAt: Date.now() }); }); }

function deleteMessage(id){ if(!confirm("Delete?")) return; db.ref(`messages/${id}`).remove(); }


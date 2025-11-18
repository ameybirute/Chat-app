const firebaseConfig = {
  apiKey: "AIzaSyCBGxr3JcK_BAZH0UnM9m0aAxIaE3WtfjA",
  authDomain: "public-chat-d51a6.firebaseapp.com",
  databaseURL: "https://public-chat-d51a6-default-rtdb.firebaseio.com",
  projectId: "public-chat-d51a6",
  storageBucket: "public-chat-d51a6.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();
firebase.auth().signInAnonymously().catch(e=>console.error(e));
const CUSTOM_EMOJIS = ["😂","❤️","👍"];
let currentUid = null;
let lastMessageTime = 0;
let sendCooldownMs = 1000;
const nicknameInput = document.getElementById("nickname");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatBox = document.getElementById("chatBox");
const userIdInfo = document.getElementById("userIdInfo");
const rateLimitInfo = document.getElementById("rateLimitInfo");
const avatarFile = document.getElementById("avatarFile");
const avatarPreview = document.getElementById("avatarPreview");
const avatarLabelText = document.getElementById("avatarLabelText");
const removeAvatarBtn = document.getElementById("removeAvatarBtn");
const uploadProgress = document.getElementById("uploadProgress");
rateLimitInfo.textContent = `1 msg / ${sendCooldownMs/1000}s`;
firebase.auth().onAuthStateChanged(user=>{
  if(user){
    currentUid = user.uid;
    userIdInfo.textContent = `id: ${currentUid}`;
    db.ref(`users/${currentUid}`).once("value").then(s=>{ const p=s.val()||{}; if(p.avatarURL) setAvatarPreview(p.avatarURL); });
  }
});
sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
avatarFile.addEventListener("change", handleAvatarSelected);
removeAvatarBtn.addEventListener("click", removeAvatar);
function handleAvatarSelected(){
  const file = avatarFile.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){ avatarPreview.src = e.target.result; avatarLabelText.textContent = "Change avatar"; removeAvatarBtn.style.display="inline-block"; };
  reader.readAsDataURL(file);
  uploadAvatarFile(file);
}
function uploadAvatarFile(file){
  if(!currentUid) return alert("Auth not ready");
  uploadProgress.textContent = "Uploading avatar...";
  const ref = storage.ref().child(`avatars/${currentUid}/${Date.now()}_${file.name}`);
  const task = ref.put(file);
  task.on("state_changed", snap=>{
    const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
    uploadProgress.textContent = `Upload: ${pct}%`;
  }, err=>{
    uploadProgress.textContent = "Upload failed";
    console.error(err);
  }, ()=>{
    task.snapshot.ref.getDownloadURL().then(url=>{
      db.ref(`users/${currentUid}`).update({ avatarURL: url });
      uploadProgress.textContent = "Upload complete";
      avatarLabelText.textContent = "Change avatar";
      removeAvatarBtn.style.display="inline-block";
    });
  });
}
function removeAvatar(){
  if(!currentUid) return;
  db.ref(`users/${currentUid}/avatarURL`).once("value").then(snap=>{
    const url = snap.val();
    db.ref(`users/${currentUid}`).update({ avatarURL: null });
    avatarPreview.src = "";
    avatarLabelText.textContent = "Choose avatar";
    removeAvatarBtn.style.display="none";
    if(url){
      try{
        const path = decodeURIComponent(new URL(url).pathname);
        const parts = path.split("/").filter(Boolean);
        const idx = parts.indexOf("o");
      }catch(e){}
    }
  });
}
function setAvatarPreview(url){
  avatarPreview.src = url;
  avatarLabelText.textContent = "Change avatar";
  removeAvatarBtn.style.display="inline-block";
}
function sendMessage(){
  const now = Date.now();
  if(now - lastMessageTime < sendCooldownMs){
    const wait = Math.ceil((sendCooldownMs - (now - lastMessageTime))/1000);
    alert("Slow down! Try again in " + (wait>0?wait+"s":""));
    return;
  }
  const name = nicknameInput.value.trim() || "Guest";
  const text = msgInput.value;
  if(!text || !text.trim()) return;
  lastMessageTime = now;
  const userRef = currentUid ? db.ref(`users/${currentUid}`) : null;
  if(userRef){
    userRef.once("value").then(snap=>{
      const profile = snap.val() || {};
      const avatarURL = profile.avatarURL || "";
      const payload = { user: name, avatarURL: avatarURL, text: text, timestamp: Date.now(), reactions: {}, authorId: currentUid };
      db.ref("messages").push(payload);
      msgInput.value = "";
    });
  } else {
    const payload = { user: name, avatarURL: "", text: text, timestamp: Date.now(), reactions: {}, authorId: "anon" };
    db.ref("messages").push(payload);
    msgInput.value = "";
  }
}
db.ref("messages").limitToLast(200).on("child_added", snap=>{
  const id = snap.key;
  const msg = snap.val();
  renderMessage(id,msg);
  scrollToBottom();
});
db.ref("messages").on("child_changed", snap=>{
  const id = snap.key;
  const msg = snap.val();
  renderMessage(id,msg);
});
db.ref("messages").on("child_removed", snap=>{
  const id = snap.key;
  const el = document.getElementById("msg-"+id);
  if(el) el.remove();
});
function renderMessage(id,msg){
  let el = document.getElementById("msg-"+id);
  if(!el){
    el = document.createElement("div");
    el.className = "msg";
    el.id = "msg-"+id;
    chatBox.appendChild(el);
  }
  const time = new Date(msg.timestamp||Date.now());
  const ts = time.toLocaleString();
  const edited = msg.edited ? `<span class="edited">edited</span>` : "";
  const authorIsMe = msg.authorId && currentUid && msg.authorId === currentUid;
  const userNameEsc = escapeHtml(msg.user||"Guest");
  const textEsc = escapeHtml(msg.text||"");
  const avatarHtml = msg.avatarURL ? `<div class="avatar"><img src="${escapeAttr(msg.avatarURL)}" alt="avatar" /></div>` : `<div class="avatar">${escapeHtml(defaultAvatarFor(msg.user))}</div>`;
  const metaHtml = `<div class="meta"><div class="username">${userNameEsc}</div><div class="timestamp">${ts}</div>${edited}</div>`;
  const textHtml = `<div class="text">${textEsc}</div>`;
  const reactionButtons = CUSTOM_EMOJIS.map(e=>`<span onclick="toggleReact('${id}','${escapeJs(e)}')">${escapeHtml(e)}</span>`).join("");
  const reactionCounts = buildReactionCountsHtml(id,msg.reactions||{});
  const editDeleteHtml = authorIsMe ? `<div style="display:flex;gap:6px;margin-top:8px;"><button class="btn" onclick="promptEdit('${id}')">Edit</button><button class="btn danger" onclick="deleteMessage('${id}')">Delete</button></div>` : "";
  el.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start">${avatarHtml}<div class="content">${metaHtml}${textHtml}<div class="actions"><div class="reactions" id="react-${id}">${reactionButtons}</div><div id="counts-${id}" style="margin-left:8px">${reactionCounts}</div></div>${editDeleteHtml}</div></div>`;
  highlightUserReactions(id,msg.reactions||{});
}
function defaultAvatarFor(name){
  const ch = (name||"G").charCodeAt(0)||71;
  const emojis = ["👽","🐱","🐵","🦊","🐸","🛸","🦖"];
  return emojis[ch % emojis.length];
}
function buildReactionCountsHtml(id,reactions){
  const parts = [];
  Object.keys(reactions).forEach(emoji=>{
    const users = reactions[emoji]||{};
    const count = Object.keys(users).length;
    if(count>0) parts.push(`<span>${escapeHtml(emoji)}<span class="reaction-count">${count}</span></span>`);
  });
  return parts.join(" ");
}
function toggleReact(msgId,emoji){
  if(!currentUid) return alert("Auth not ready");
  const key = emoji.replace(/\./g,"[dot]");
  const ref = db.ref(`messages/${msgId}/reactions/${key}/${currentUid}`);
  ref.once("value").then(snap=>{
    if(snap.exists()) ref.remove(); else ref.set(true);
  });
}
function highlightUserReactions(id,reactions){
  const countsDiv = document.getElementById(`counts-${id}`);
  const reactDiv = document.getElementById(`react-${id}`);
  if(!reactDiv) return;
  Array.from(reactDiv.children).forEach(span=>{
    span.classList.remove("you-reacted");
    const emoji = span.textContent.trim();
    const users = (reactions && reactions[emoji]) || {};
    if(currentUid && users && users[currentUid]) span.classList.add("you-reacted");
  });
  if(countsDiv) countsDiv.innerHTML = buildReactionCountsHtml(id,reactions);
}
function promptEdit(id){
  const el = document.getElementById("msg-"+id);
  if(!el) return;
  db.ref(`messages/${id}`).once("value").then(snap=>{
    const msg = snap.val();
    if(!msg) return;
    if(!(msg.authorId && currentUid && msg.authorId === currentUid)) return alert("You can only edit your own messages");
    const newText = prompt("Edit message:", msg.text);
    if(!newText || !newText.trim()) return;
    db.ref(`messages/${id}`).update({ text: newText, edited: true, editedAt: Date.now() });
  });
}
function deleteMessage(id){
  if(!confirm("Delete this message?")) return;
  db.ref(`messages/${id}`).remove();
}
function scrollToBottom(){ chatBox.scrollTop = chatBox.scrollHeight; }
function escapeHtml(str){ return String(str).replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s])); }
function escapeJs(str){ return String(str).replace(/'/g,"\\'"); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

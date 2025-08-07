/* minimal demo implementation using fetch polling */
const token = localStorage.getItem('token');
let currentChat = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function loadChats() {
  const res = await fetch('/api/chats', { headers: { Authorization: token } });
  const chats = await res.json();
  const list = document.getElementById('chatList');
  list.innerHTML = '';
  chats.forEach(c => {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.textContent = c.name;
    div.onclick = () => openChat(c.id);
    list.appendChild(div);
  });
}

async function openChat(id) {
  currentChat = id;
  const res = await fetch(`/api/chats/${id}/messages`, { headers: { Authorization: token } });
  const msgs = await res.json();
  const box = document.getElementById('messages');
  box.innerHTML = '';
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = `message ${m.senderId === JSON.parse(localStorage.user).id ? 'sent' : 'received'}`;
    div.textContent = m.content;
    box.appendChild(div);
  });
}

async function sendMsg() {
  const content = document.getElementById('msgInput').value.trim();
  if (!content || !currentChat) return;
  await fetch('/api/messages', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: currentChat, content })
  });
  document.getElementById('msgInput').value = '';
  openChat(currentChat);
}

document.getElementById('sendBtn').addEventListener('click', sendMsg);

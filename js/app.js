// Main app functionality
let currentChat = null;
let socket = null;
let typingTimeout = null;

function initializeApp() {
    loadUserChats();
    loadContacts();
    initializeWebSocket();
    loadCompanySettings();
}

function initializeWebSocket() {
    const token = localStorage.getItem('token');
    socket = new WebSocket(`ws://localhost:3000?token=${token}`);
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'new_message') {
            handleNewMessage(data.message);
        } else if (data.type === 'typing') {
            handleTypingIndicator(data);
        }
    };
}

function loadUserChats() {
    fetch(`${API_BASE}/chats`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(chats => {
        displayChats(chats);
    });
}

function displayChats(chats) {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';
    
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(chat);
        
        chatItem.innerHTML = `
            <img class="avatar" src="${chat.avatar || 'https://via.placeholder.com/50'}" alt="${chat.name}">
            <div class="chat-info">
                <h4>${chat.name}</h4>
                <p>${chat.lastMessage || 'No messages yet'}</p>
            </div>
            ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
        `;
        
        chatList.appendChild(chatItem);
    });
}

function openChat(chat) {
    currentChat = chat;
    
    // Update chat header
    const chatHeader = document.getElementById('chatHeader');
    chatHeader.innerHTML = `
        <div class="chat-info">
            <img class="avatar" src="${chat.avatar || 'https://via.placeholder.com/40'}" alt="${chat.name}">
            <div>
                <h3>${chat.name}</h3>
                <span id="typingIndicator"></span>
            </div>
        </div>
        <div class="chat-actions">
            <button onclick="showContactInfo()"><i class="fas fa-info-circle"></i></button>
            <button onclick="showSettings()"><i class="fas fa-cog"></i></button>
        </div>
    `;
    
    // Show message input
    document.getElementById('messageInputContainer').style.display = 'block';
    
    // Load messages
    loadMessages(chat.id);
    
    // Mark as read
    fetch(`${API_BASE}/chats/${chat.id}/read`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
}

function loadMessages(chatId) {
    fetch(`${API_BASE}/chats/${chatId}/messages`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(messages => {
        displayMessages(messages);
    });
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    
    messages.forEach(message => {
        const messageDiv = createMessageElement(message);
        container.appendChild(messageDiv);
    });
    
    container.scrollTop = container.scrollHeight;
}

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.isOwn ? 'sent' : 'received'}`;
    
    if (message.type === 'text') {
        div.innerHTML = `
            <div>${message.content}</div>
            <div class="message-info">
                <span>${message.sender}</span>
                <span>${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
        `;
    } else if (message.type === 'image') {
        div.className += ' attachment';
        div.innerHTML = `
            <img src="${message.content}" alt="Image">
            <div class="message-info">
                <span>${message.sender}</span>
                <span>${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
        `;
    }
    
    return div;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !currentChat) return;
    
    const message = {
        chatId: currentChat.id,
        type: 'text',
        content: content
    };
    
    socket.send(JSON.stringify({
        type: 'send_message',
        data: message
    }));
    
    input.value = '';
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chatId', currentChat.id);
    
    fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        socket.send(JSON.stringify({
            type: 'send_message',
            data: {
                chatId: currentChat.id,
                type: 'image',
                content: data.url
            }
        }));
    });
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    
    if (picker.children.length === 0) {
        const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🎉', '😢', '😡'];
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji';
            span.textContent = emoji;
            span.onclick = () => insertEmoji(emoji);
            picker.appendChild(span);
        });
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    document.getElementById('emojiPicker').style.display = 'none';
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    } else if (event.target.value.includes('@')) {
        showTagSuggestions(event.target.value);
    }
}

function showTagSuggestions(text) {
    const lastAtIndex = text.lastIndexOf('@');
    const query = text.substring(lastAtIndex + 1).split(' ')[0];
    
    if (query.length > 0) {
        fetch(`${API_BASE}/contacts/search?q=${query}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(response => response.json())
        .then(contacts => {
            displayTagSuggestions(contacts, lastAtIndex);
        });
    }
}

function displayTagSuggestions(contacts, atIndex) {
    const suggestions = document.getElementById('tagSuggestions');
    suggestions.innerHTML = '';
    
    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'tag-suggestion';
        div.textContent = contact.name;
        div.onclick = () => insertTag(contact, atIndex);
        suggestions.appendChild(div);
    });
    
    suggestions.style.display = 'block';
}

function insertTag(contact, atIndex) {
    const input = document.getElementById('messageInput');
    const text = input.value;
    const beforeAt = text.substring(0, atIndex);
    const afterAt = text.substring(atIndex).split(' ').slice(1).join(' ');
    
    input.value = `${beforeAt}@${contact.phone} ${afterAt}`;
    document.getElementById('tagSuggestions').style.display = 'none';
}

function showNewGroup() {
    loadContactsForGroup();
    document.getElementById('newGroupModal').style.display = 'block';
}

function loadContactsForGroup() {
    fetch(`${API_BASE}/contacts`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(contacts => {
        const selection = document.getElementById('memberSelection');
        selection.innerHTML = '';
        
        contacts.forEach(contact => {
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" value="${contact.id}">
                <img src="${contact.avatar || 'https://via.placeholder.com/30'}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
                ${contact.name}
            `;
            selection.appendChild(label);
        });
    });
}

function createGroup() {
    const name = document.getElementById('groupName').value;
    const checkboxes = document.querySelectorAll('#memberSelection input[type="checkbox"]:checked');
    const members = Array.from(checkboxes).map(cb => cb.value);
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('members', JSON.stringify(members));
    
    const iconFile = document.getElementById('groupIcon').files[0];
    if (iconFile) {
        formData.append('icon', iconFile);
    }
    
    fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        closeModal('newGroupModal');
        loadUserChats();
    });
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function loadCompanySettings() {
    fetch(`${API_BASE}/settings`)
    .then(response => response.json())
    .then(settings => {
        if (settings.companyName) {
            document.getElementById('companyName').textContent = settings.companyName;
        }
        if (settings.logo) {
            document.getElementById('companyLogo').src = settings.logo;
        }
    });
}

// Check for new messages every 30 seconds
setInterval(() => {
    if (currentChat) {
        loadMessages(currentChat.id);
    }
}, 30000);

// Check intranet access periodically
setInterval(checkIntranetAccess, 60000);

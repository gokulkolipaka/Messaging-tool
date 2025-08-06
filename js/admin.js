// Admin panel functionality
function loadAdminPanel() {
    loadUsers();
    loadGroups();
    loadAdminSettings();
}

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');
}

function loadUsers() {
    fetch(`${API_BASE}/admin/users`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(users => {
        displayUsers(users);
    });
}

function displayUsers(users) {
    const userList = document.getElementById('adminUserList');
    userList.innerHTML = '';
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div>
                <strong>${user.name}</strong> - ${user.phone}
                ${user.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
            </div>
            <div>
                <button class="action-btn delete-btn" onclick="deleteUser(${user.id})">Delete</button>
                ${!user.isAdmin ? `<button class="action-btn" onclick="makeAdmin(${user.id})">Make Admin</button>` : ''}
            </div>
        `;
        userList.appendChild(userDiv);
    });
}

function loadGroups() {
    fetch(`${API_BASE}/admin/groups`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(groups => {
        displayGroups(groups);
    });
}

function displayGroups(groups) {
    const groupList = document.getElementById('adminGroupList');
    groupList.innerHTML = '';
    
    groups.forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group-item';
        groupDiv.innerHTML = `
            <div>
                <strong>${group.name}</strong> - ${group.memberCount} members
            </div>
            <div>
                <button class="action-btn delete-btn" onclick="deleteGroup(${group.id})">Delete</button>
            </div>
        `;
        groupList.appendChild(groupDiv);
    });
}

function loadAdminSettings() {
    fetch(`${API_BASE}/admin/settings`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(settings => {
        document.getElementById('adminCompanyName').value = settings.companyName || '';
        document.getElementById('disableApp').checked = settings.disabled || false;
    });
}

function saveSettings() {
    const settings = {
        companyName: document.getElementById('adminCompanyName').value,
        disabled: document.getElementById('disableApp').checked
    };
    
    fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        alert('Settings saved successfully');
        loadCompanySettings();
    });
}

function uploadLogo() {
    const fileInput = document.getElementById('logoUpload');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    // Check dimensions
    const img = new Image();
    img.onload = function() {
        if (this.width < 170 || this.height < 66) {
            alert('Logo must be at least 170x66 pixels');
            return;
        }
        
        const formData = new FormData();
        formData.append('logo', file);
        
        fetch(`${API_BASE}/admin/upload-logo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            alert('Logo uploaded successfully');
            loadCompanySettings();
        });
    };
    
    img.src = URL.createObjectURL(file);
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(() => {
            loadUsers();
        });
    }
}

function deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this group?')) {
        fetch(`${API_BASE}/admin/groups/${groupId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(() => {
            loadGroups();
        });
    }
}

function makeAdmin(userId) {
    if (confirm('Are you sure you want to make this user an admin?')) {
        fetch(`${API_BASE}/admin/users/${userId}/make-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(() => {
            loadUsers();
        });
    }
}

function backToApp() {
    showScreen('mainScreen');
}

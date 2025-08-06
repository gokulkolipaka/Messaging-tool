// Authentication module
const API_BASE = 'http://localhost:3000/api';

async function login() {
    const phone = document.getElementById('phoneNumber').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            if (data.user.isAdmin) {
                showScreen('adminScreen');
                loadAdminPanel();
            } else {
                showScreen('mainScreen');
                initializeApp();
            }
            
            // Check intranet access
            checkIntranetAccess();
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please check your connection.');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showScreen('loginScreen');
}

function checkIntranetAccess() {
    // Check if user is on company intranet
    fetch(`${API_BASE}/auth/check-intranet`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (!data.isIntranet) {
            alert('Access denied. Please connect to company intranet.');
            logout();
        }
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

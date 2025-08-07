const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3000/api';

async function login(e) {
  e.preventDefault();
  const phone = phoneInput.value.trim();
  const password = passwordInput.value.trim();
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user.isAdmin) showScreen('adminScreen');
    else showScreen('mainScreen');
  } else alert(data.message || 'Login failed');
}

document.getElementById('loginForm').addEventListener('submit', login);

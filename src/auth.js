import { supabase } from './supabase.js';

const $ = (id) => document.getElementById(id);

function setMode(mode) {
    $('authOverlay').dataset.mode = mode;
}

function showOverlay(mode = 'login') {
    $('authOverlay').classList.remove('hidden');
    setMode(mode);
}

function hideOverlay() {
    $('authOverlay').classList.add('hidden');
}

function setMessage(text, kind = 'info') {
    const el = $('authMsg');
    el.textContent = text || '';
    el.dataset.kind = kind;
}

function setBusy(busy) {
    $('authSubmit').disabled = busy;
    $('authEmail').disabled = busy;
    $('authPassword').disabled = busy;
}

async function handleSubmit(e) {
    e.preventDefault();
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    const mode = $('authOverlay').dataset.mode;

    if (!email || !password) {
        setMessage('Please enter your email and password.', 'error');
        return;
    }
    if (mode === 'signup' && password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        return;
    }

    setBusy(true);
    setMessage('', 'info');

    try {
        if (mode === 'signup') {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            if (!data.session) {
                setMessage('Account created. Check your email to confirm, then sign in.', 'success');
                setMode('login');
                $('authPassword').value = '';
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        }
    } catch (err) {
        setMessage(err.message || 'Authentication failed.', 'error');
    } finally {
        setBusy(false);
    }
}

function toggleMode(e) {
    e.preventDefault();
    const current = $('authOverlay').dataset.mode;
    setMode(current === 'login' ? 'signup' : 'login');
    setMessage('', 'info');
}

export async function initAuth() {
    $('authForm').addEventListener('submit', handleSubmit);
    $('authToggle').addEventListener('click', toggleMode);

    const { data: { session } } = await supabase.auth.getSession();
    applySession(session);

    supabase.auth.onAuthStateChange((_event, session) => applySession(session));
}

function applySession(session) {
    if (session) {
        hideOverlay();
    } else {
        showOverlay('login');
    }
}

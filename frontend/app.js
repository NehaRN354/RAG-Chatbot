/* app.js — RAG Chatbot frontend logic */

const API_BASE = 'http://localhost:8000';
const POLL_INTERVAL = 2500; // ms

// DOM refs
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const modelDot = document.querySelector('.model-dot');
const modelLabel = document.getElementById('model-label');
const chips = document.querySelectorAll('.chip');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('pdf-file-input');
const uploadNotice = document.getElementById('upload-notice');
const uploadNoticeText = document.getElementById('upload-notice-text');
const docNameEl = document.getElementById('doc-name');
const docMetaEl = document.getElementById('doc-meta');

let modelReady = false;
let pollTimer = null;

// ── PDF Upload ──────────────────────────────────────────────
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = ''; // reset so same file can be re-uploaded

    // Show spinner, lock UI
    uploadNotice.style.display = 'flex';
    uploadNoticeText.textContent = `Uploading ${file.name}…`;
    uploadBtn.disabled = true;
    disableInput();
    modelReady = false;

    // Stop any existing status poll
    clearInterval(pollTimer);
    setStatus('loading', 'Uploading…');

    try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) {
            uploadNoticeText.textContent = data.detail || 'Upload failed.';
            setStatus('error', 'Upload failed');
            uploadBtn.disabled = false;
            return;
        }

        // Update sidebar doc name
        docNameEl.textContent = file.name;
        docMetaEl.textContent = 'Re-indexing…';

        uploadNoticeText.textContent = `Indexing ${file.name}…`;
        setStatus('loading', 'Re-indexing…');
        inputEl.placeholder = 'Re-indexing new PDF, please wait…';

        // Append a system notice in the chat
        appendSystemMsg(`📄 Switched to <strong>${escHtml(file.name)}</strong>. Re-indexing — please wait…`);

        // Re-poll until new index is ready
        pollTimer = setInterval(async () => {
            try {
                const sr = await fetch(`${API_BASE}/status`);
                const sdata = await sr.json();
                if (sdata.ready) {
                    clearInterval(pollTimer);
                    modelReady = true;
                    setStatus('ready', 'Ready');
                    docMetaEl.textContent = 'Active source';
                    uploadNotice.style.display = 'none';
                    uploadBtn.disabled = false;
                    enableInput();
                    appendSystemMsg(`✅ <strong>${escHtml(sdata.pdf)}</strong> is ready — ask away!`);
                } else if (sdata.error) {
                    clearInterval(pollTimer);
                    setStatus('error', 'Index error');
                    uploadNotice.style.display = 'none';
                    uploadBtn.disabled = false;
                    appendSystemMsg(`❌ Failed to index the PDF: ${escHtml(sdata.error)}`);
                }
            } catch { /* server busy, keep polling */ }
        }, POLL_INTERVAL);

    } catch (err) {
        uploadNoticeText.textContent = 'Network error during upload.';
        setStatus('error', 'Upload error');
        uploadBtn.disabled = false;
    }
});

// ── Utility ────────────────────────────────────────────────
function setStatus(state, text) {
    // state: 'loading' | 'ready' | 'error'
    ['ready', 'error', 'loading'].forEach(c => {
        statusDot.classList.remove(c);
        modelDot.classList.remove(c);
    });
    statusDot.classList.add(state);
    modelDot.classList.add(state);
    statusText.textContent = text;
    modelLabel.textContent = text;
}

function enableInput() {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    chips.forEach(c => c.disabled = false);
    inputEl.placeholder = 'Ask a question about the document…';
    inputEl.focus();
}

function disableInput() {
    inputEl.disabled = true;
    sendBtn.disabled = true;
}

// Auto-resize textarea
inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
});

// ── Polling for model readiness ─────────────────────────────
async function pollStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();

        if (data.ready) {
            clearInterval(pollTimer);
            modelReady = true;
            setStatus('ready', 'Ready');
            enableInput();
        } else if (data.error) {
            clearInterval(pollTimer);
            setStatus('error', 'Failed to load');
        }
        // else still loading — keep polling
    } catch {
        // Server not yet up — keep polling silently
    }
}

setStatus('loading', 'Loading model…');
pollTimer = setInterval(pollStatus, POLL_INTERVAL);
pollStatus(); // immediate first check

// ── Rendering helpers ───────────────────────────────────────
function appendUserBubble(text) {
    const row = document.createElement('div');
    row.className = 'msg-row user';
    row.innerHTML = `
    <div class="bubble">${escHtml(text)}</div>
    <div class="avatar user-av">🧑</div>
  `;
    messagesEl.appendChild(row);
    scrollBottom();
    return row;
}

function appendTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    row.id = 'typing-row';
    row.innerHTML = `
    <div class="avatar bot-av">🤖</div>
    <div class="bubble bot-typing">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
    messagesEl.appendChild(row);
    scrollBottom();
}

function replaceTypingWithAnswer(text) {
    const row = document.getElementById('typing-row');
    if (row) {
        row.innerHTML = `
      <div class="avatar bot-av">🤖</div>
      <div class="bubble">${escHtml(text)}</div>
    `;
        row.removeAttribute('id');
        scrollBottom();
    }
}

function appendErrorBubble(msg) {
    const row = document.getElementById('typing-row');
    const target = row || document.createElement('div');
    if (!row) { target.className = 'msg-row bot'; messagesEl.appendChild(target); }
    target.innerHTML = `
    <div class="avatar bot-av">⚠️</div>
    <div class="bubble" style="color:#f87171;">${escHtml(msg)}</div>
  `;
    target.removeAttribute('id');
    scrollBottom();
}

function escHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function scrollBottom() {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

function hideWelcomeCard() {
    const card = document.getElementById('welcome-card');
    if (card) card.style.display = 'none';
}

function appendSystemMsg(html) {
    hideWelcomeCard();
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.innerHTML = html;
    messagesEl.appendChild(el);
    scrollBottom();
}

// ── Send message ────────────────────────────────────────────
async function sendMessage(question) {
    question = question.trim();
    if (!question || !modelReady) return;

    hideWelcomeCard();
    disableInput();

    appendUserBubble(question);
    appendTypingIndicator();

    inputEl.value = '';
    inputEl.style.height = 'auto';

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
        });

        const data = await res.json();

        if (!res.ok) {
            appendErrorBubble(data.detail || 'Something went wrong. Please try again.');
        } else {
            replaceTypingWithAnswer(data.answer);
        }
    } catch (err) {
        appendErrorBubble('Could not reach the server. Make sure uvicorn is running on port 8000.');
    } finally {
        enableInput();
    }
}

// ── Event listeners ─────────────────────────────────────────
sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
    }
});

chips.forEach(chip => {
    chip.addEventListener('click', () => {
        sendMessage(chip.dataset.q);
    });
});

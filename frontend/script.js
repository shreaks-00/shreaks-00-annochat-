let chatHistory = [];
let isWaitingForStranger = false;
let currentSessionId = Math.random().toString(36).substring(7);

// DOM Elements
const chatMessagesEl = document.getElementById('chat-messages');
const messageInputEl = document.getElementById('message-input');
const typingIndicatorEl = document.getElementById('typing-indicator');
const toastEl = document.getElementById('toast');
const headerStatusText = document.getElementById('header-status-text');
const genderFilterEl = document.getElementById('gender-filter');

let isMuted = false;
let audioCtx = null;

// Audio Notification System
function playNotificationSound() {
    if (isMuted) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch beep
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch(err) {
        console.warn("Audio context not supported or failed", err);
    }
}

function toggleMute() {
    isMuted = !isMuted;
    const icon = document.getElementById('mute-toggle');
    if (isMuted) {
        icon.classList.remove('fa-microphone');
        icon.classList.add('fa-microphone-slash');
        icon.style.color = 'var(--text-muted)';
        showToast('Notification sounds muted.');
    } else {
        icon.classList.remove('fa-microphone-slash');
        icon.classList.add('fa-microphone');
        icon.style.color = '';
        showToast('Notification sounds enabled.');
        playNotificationSound(); // Demo the sound
    }
}

// Custom Dropdown UI Logic
function toggleGenderDropdown() {
    const dropdown = document.getElementById('gender-filter-dropdown');
    dropdown.classList.toggle('open');
}

function selectGender(value, text) {
    document.getElementById('gender-filter').value = value;
    document.getElementById('selected-gender-text').innerText = text;
    document.getElementById('gender-filter-dropdown').classList.remove('open');
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('gender-filter-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

// Custom Settings UI Logic
const themes = {
    violet: { primary: '#0f172a', secondary: '#0b0f19', tertiary: '#1e293b', brand: '#8b5cf6', input: 'rgba(30,41,59,0.7)' },
    emerald: { primary: '#022c22', secondary: '#064e3b', tertiary: '#065f46', brand: '#10b981', input: 'rgba(2,44,34,0.7)' },
    crimson: { primary: '#2a0f12', secondary: '#1e0708', tertiary: '#3f161a', brand: '#e11d48', input: 'rgba(42,15,18,0.7)' },
    classic: { primary: '#313338', secondary: '#2b2d31', tertiary: '#1e1f22', brand: '#5865F2', input: '#383a40' }
};

function toggleSettingsModal() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

function applyTheme(themeName) {
    const root = document.documentElement;
    const t = themes[themeName];
    if(t) {
        root.style.setProperty('--bg-primary', t.primary);
        root.style.setProperty('--bg-secondary', t.secondary);
        root.style.setProperty('--bg-tertiary', t.tertiary);
        root.style.setProperty('--brand-experiment', t.brand);
        root.style.setProperty('--bg-input', t.input);
        showToast('Theme applied!');
        setTimeout(toggleSettingsModal, 400);
    }
}

// Emoji Picker
const baseEmojis = ['😀','😂','🥺','😭','😎','😡','🤔','💀','🔥','💯','👍','❤️','✨','🎉','👀','🤡','👻','👽','🤠','🤖','💩','🤢','🤯','🤫'];
function toggleEmojiPicker() {
    const ep = document.getElementById('emoji-picker');
    ep.classList.toggle('hidden');
    document.getElementById('gif-picker').classList.add('hidden');
    if (!ep.hasAttribute('data-populated')) {
        const grid = document.getElementById('emoji-grid');
        baseEmojis.forEach(e => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.innerText = e;
            span.onclick = () => {
                document.getElementById('message-input').value += e;
                ep.classList.add('hidden');
            };
            grid.appendChild(span);
        });
        ep.setAttribute('data-populated', 'true');
    }
}

// GIF Picker (via Backend Proxy)
let gifTimeout = null;

function toggleGifPicker() {
    const gp = document.getElementById('gif-picker');
    gp.classList.toggle('hidden');
    document.getElementById('emoji-picker').classList.add('hidden');
    if (!gp.hasAttribute('data-populated')) {
        fetchGifs('trending');
        gp.setAttribute('data-populated', 'true');
    }
}

function handleGifSearch(e) {
    clearTimeout(gifTimeout);
    gifTimeout = setTimeout(() => {
        const query = e.target.value.trim() || 'trending';
        fetchGifs(query);
    }, 500);
}

async function fetchGifs(query) {
    const grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div style="color:var(--text-muted); padding:20px; grid-column:span 2; text-align:center;">Searching...</div>';
    try {
        // Call backend proxy to avoid CORS
        const searchTerms = (query === 'trending' || !query) ? 'funny' : query;
        const url = `${CONFIG.BACKEND_URL}/api/gifs?query=${encodeURIComponent(searchTerms)}`;
        
        const res = await fetch(url);
        const json = await res.json();
        
        grid.innerHTML = '';
        if (json.images && json.images.length > 0) {
            json.images.forEach(gif => {
                const img = document.createElement('img');
                img.className = 'gif-item';
                img.src = gif.url;
                img.onclick = () => sendGif(gif.url);
                grid.appendChild(img);
            });
        } else {
            grid.innerHTML = '<div style="color:var(--text-muted); padding:20px; grid-column:span 2; text-align:center;">No GIFs found.</div>';
        }
    } catch(e) {
        console.error("GIF Load Error:", e);
        grid.innerHTML = '<div style="color:var(--text-muted); padding:20px; grid-column:span 2; text-align:center;">Failed to load.</div>';
    }
}

function sendGif(url) {
    if (isWaitingForStranger) return;
    document.getElementById('gif-picker').classList.add('hidden');
    
    appendMessage({ sender: 'user', text: `<img src="${url}" class="chat-gif-embed">`, nameClass: '', nameText: 'You', isHtml: true });
    chatHistory.push({ role: "user", content: `*Sent a GIF*` });
    
    triggerStrangerReply();
}

function mockFeature(featureName) {
    // Kept to not break anything
    if (featureName === 'Settings') toggleSettingsModal();
    else showToast(`${featureName} feature coming in next update!`);
}

function showToast(message) {
    if (!toastEl) return;
    toastEl.innerText = message;
    toastEl.classList.add('show');
    toastEl.classList.remove('hidden');
    
    // Clear any existing timeout to avoid premature hide
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    
    window.toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

function showFreeTierMessage() {
    showToast("This feature is not available for the free tier");
}

function toggleMobileSidebar() {
    const layout = document.querySelector('.app-layout');
    layout.classList.toggle('sidebar-open');
}

// Typing Realism Algorithm
function updateActionBtn(state) {
    const btn = document.getElementById('action-btn');
    if (!btn) return;
    
    if (state === 'finding') {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> FINDING...';
        btn.classList.add('finding');
    } else {
        btn.innerHTML = 'SKIP';
        btn.classList.remove('finding');
    }
}

function calculateTypingDelayMS(textLength) {
    // Human average typing speed: ~40-60 WPM. Let's aim for 50 WPM.
    // 50 WPM = ~250 characters per minute = ~4.1 characters per second.
    // Time in seconds = textLength / 4.1
    let timeSeconds = textLength / 4.1;
    
    // Add realistic reading/reaction delay before typing begins (0.5 to 1.5 seconds)
    timeSeconds += Math.random() * 1.5 + 0.5;
    
    // Cap at a reasonable time so users aren't waiting forever for a long message
    if (timeSeconds > 8) timeSeconds = 8;
    // Minimum 1 second for even short responses like "k"
    if (timeSeconds < 1) timeSeconds = 1;
    
    return timeSeconds * 1000;
}

function triggerDisconnect() {
    appendSystemMessage("Stranger disconnected.");
    const headerStatusText = document.getElementById('header-status-text');
    if(headerStatusText) headerStatusText.innerText = 'Disconnected';
    const dmName = document.getElementById('dm-stranger-name');
    if(dmName) dmName.innerText = 'Offline';
    isWaitingForStranger = true; // Prevents sending more messages
    updateActionBtn('finding');
}

function appendSystemMessage(msg) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'message-wrapper sys-msg';
    sysDiv.innerHTML = `<div style="font-weight:600; color:var(--interactive-normal); width:100%; text-align:center; padding: 10px 0;">${msg}</div>`;
    chatMessagesEl.appendChild(sysDiv);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Chat System
function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// Global Keyboard Listeners
document.addEventListener('keydown', (e) => {
    // ESC key to skip stranger
    if (e.key === 'Escape') {
        nextStranger();
    }
});

async function sendMessage() {
    const text = messageInputEl.value.trim();
    if (!text || isWaitingForStranger) return;
    
    // Hide welcome banner if it exists when first message is sent
    const banner = document.querySelector('.welcome-banner');
    if (banner) banner.style.opacity = '0.5';

    messageInputEl.value = '';
    
    let userNameText = 'You';

    appendMessage({
        sender: 'user', 
        text: text, 
        nameClass: '', 
        nameText: userNameText
    });
    
    chatHistory.push({ role: "user", content: text });
    triggerStrangerReply();
}

async function triggerStrangerReply(isAutoGreeting = false) {
    if (!isAutoGreeting) isWaitingForStranger = true;
    
    // FETCH text immediately in the background, but DONT show it yet
    let responseText = await fetchStrangerResponse();

    if (!responseText || responseText === "disconnected") {
        if (!isAutoGreeting) triggerDisconnect();
        return;
    }

    // Check random drop logic and explicit AI disconnect
    if (Math.random() < 0.05 || responseText.includes("disconnected") || responseText.includes("[DISCONNECT]")) {
        triggerDisconnect();
        return;
    }

    const typingDelay = calculateTypingDelayMS(responseText.length);
    if (headerStatusText) headerStatusText.innerText = 'Stranger is typing...';
    typingIndicatorEl.classList.remove('hidden');

    setTimeout(() => {
        typingIndicatorEl.classList.add('hidden');
        if (headerStatusText) headerStatusText.innerText = "Connected";
        updateActionBtn('chatting');
        
        appendMessage({
            sender: 'stranger',
            text: responseText,
            nameClass: '',
            nameText: 'Stranger',
            isHtml: true
        });
        updateActionBtn('chatting'); // Ensure SKIP visible when chatting starts
        chatHistory.push({ role: "assistant", content: responseText });
        playNotificationSound();
        
        isWaitingForStranger = false;
    }, typingDelay);
}

function appendMessage({sender, text, nameClass, nameText, isHtml=false}) {
    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = `message-wrapper ${sender}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `user-avatar`;
    if (sender === 'user') {
        avatarDiv.innerHTML = '<i class="fa-solid fa-ghost"></i>';
    } else {
        avatarDiv.innerHTML = '<i class="fa-solid fa-at"></i>';
    }

    const coreDiv = document.createElement('div');
    coreDiv.className = 'message-core';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
    const nameDiv = document.createElement('span');
    nameDiv.className = `username ${nameClass}`;
    nameDiv.innerText = nameText;
    
    const timeDiv = document.createElement('span');
    timeDiv.className = 'timestamp';
    const now = new Date();
    timeDiv.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(timeDiv);

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    if (isHtml) {
        textDiv.innerHTML = text;
    } else {
        textDiv.innerText = text;
    }
    
    coreDiv.appendChild(headerDiv);
    coreDiv.appendChild(textDiv);
    
    wrapperDiv.appendChild(avatarDiv);
    wrapperDiv.appendChild(coreDiv);
    
    chatMessagesEl.appendChild(wrapperDiv);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function fetchStrangerResponse() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory.slice(-10),
                model: "llama-3.3-70b-versatile",
                session_id: currentSessionId,
                preferred_gender: genderFilterEl.value
            })
        });
        
        if (!response.ok) return "disconnected";
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }
        
        return fullText;
        
    } catch(err) {
        return "disconnected";
    }
}

function nextStranger() {
    // Check Guest Limits
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) {
        let chatsUsed = parseInt(localStorage.getItem('guest_chats_used') || '0');
        if (chatsUsed >= 3) {
            showToast("Guest limit reached! Redirecting to login...");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        localStorage.setItem('guest_chats_used', (chatsUsed + 1).toString());
    }

    // Reset state
    isWaitingForStranger = true;
    currentSessionId = Math.random().toString(36).substring(7);
    chatHistory = [];
    
    // Clear chat and show finding state
    chatMessagesEl.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); opacity:0.6;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:15px;"></i>
            <p>Searching for a new stranger...</p>
        </div>
    `;
    
    const dmName = document.getElementById('dm-stranger-name');
    if(dmName) dmName.innerText = 'Finding...';
    const headerStatusText = document.getElementById('header-status-text');
    if(headerStatusText) headerStatusText.innerText = 'Finding...';
    
    updateActionBtn('finding');

    // More realistic finding delay (1.5 to 3.5 seconds)
    const findDelay = Math.random() * 2000 + 1500;

    setTimeout(() => {
        const strangerDisplayName = `Stranger`;

        // Update UI to Connected
        if(headerStatusText) headerStatusText.innerText = 'Connected';
        if(dmName) dmName.innerText = strangerDisplayName;
        updateActionBtn('chatting');
        isWaitingForStranger = false;

        // Show welcome banner
        chatMessagesEl.innerHTML = `
            <div class="welcome-banner">
                <div class="welcome-avatar"><i class="fa-solid fa-at"></i></div>
                <h2>${strangerDisplayName}</h2>
                <p>You have connected with a new stranger. Say hi!</p>
            </div>
        `;

        // Random chance (65%) for the stranger to greet FIRST
        if (Math.random() < 0.65) {
            setTimeout(() => {
                triggerStrangerReply(true);
            }, 500);
        }
    }, findDelay);
}

setInterval(() => {
    const dotsEl = document.querySelector('.dots');
    if (dotsEl) {
        let current = dotsEl.innerText;
        if (current === '...') dotsEl.innerText = '.';
        else dotsEl.innerText += '.';
    }
}, 500);

// ============ SETTINGS FUNCTIONS ============

function switchTab(tabId, btn) {
    document.querySelectorAll('.spanel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    btn.classList.add('active');
}

// --- Background ---
function handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        localStorage.setItem('customBg', dataUrl);
        applyCustomBg(dataUrl);
    };
    reader.readAsDataURL(file);
}

function applyCustomBg(dataUrl) {
    const el = document.getElementById('custom-bg-overlay');
    if (!el) return;
    const opacity = localStorage.getItem('customBgOpacity') || 30;
    el.style.backgroundImage = `url('${dataUrl}')`;
    el.style.opacity = opacity / 100;
}

function removeBg() {
    localStorage.removeItem('customBg');
    const el = document.getElementById('custom-bg-overlay');
    if (el) { el.style.backgroundImage = ''; el.style.opacity = 0; }
}

function updateBgOpacity(val) {
    document.getElementById('bg-opacity-val').innerText = val + '%';
    localStorage.setItem('customBgOpacity', val);
    const el = document.getElementById('custom-bg-overlay');
    if (el && el.style.backgroundImage) el.style.opacity = val / 100;
}

// --- Font Size ---
function setFontSize(px, btn) {
    document.querySelector('.chat-messages').style.fontSize = px + 'px';
    localStorage.setItem('fontSize', px);
    if (btn) {
        btn.closest('.font-size-row').querySelectorAll('.fsz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

// --- Font Family ---
function setFont(family, btn) {
    document.querySelector('.chat-messages').style.fontFamily = family;
    localStorage.setItem('fontFamily', family);
    if (btn) {
        btn.closest('.font-size-row').querySelectorAll('.fsz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

// --- Spacing ---
function updateSpacing(val) {
    document.getElementById('spacing-val').innerText = val + 'px';
    document.querySelector('.chat-messages').style.gap = val + 'px';
    localStorage.setItem('msgSpacing', val);
}

// --- Bubble Style ---
function setBubble(style) {
    document.querySelectorAll('.message-text').forEach(el => {
        el.style.background = '';
        el.style.padding = '';
        el.style.borderRadius = '';
    });
    localStorage.setItem('bubbleStyle', style);
    applyBubbleStyle(style);
}

function applyBubbleStyle(style) {
    const msgs = document.querySelectorAll('.message-text');
    msgs.forEach(el => {
        if (style === 'soft') {
            el.style.background = 'rgba(139,92,246,0.12)';
            el.style.padding = '8px 12px';
            el.style.borderRadius = '12px';
        } else if (style === 'sharp') {
            el.style.background = 'rgba(255,255,255,0.05)';
            el.style.padding = '8px 12px';
            el.style.borderRadius = '4px';
        } else {
            el.style.background = '';
            el.style.padding = '';
            el.style.borderRadius = '';
        }
    });
}

// --- Timestamps ---
function toggleTimestamps(show) {
    document.querySelectorAll('.timestamp').forEach(el => el.style.display = show ? '' : 'none');
    localStorage.setItem('showTimestamps', show ? '1' : '0');
}

// --- Compact Mode ---
function toggleCompact(on) {
    document.querySelector('.chat-messages').style.gap = on ? '4px' : '';
    document.querySelectorAll('.message-wrapper').forEach(el => el.style.marginTop = on ? '4px' : '');
    document.querySelectorAll('.user-avatar').forEach(el => el.style.display = on ? 'none' : '');
    localStorage.setItem('compactMode', on ? '1' : '0');
}

// ---- Restore settings on load ----
(function restoreSettings() {
    const bg = localStorage.getItem('customBg');
    if (bg) applyCustomBg(bg);

    const opacity = localStorage.getItem('customBgOpacity');
    if (opacity) {
        const slider = document.getElementById('bg-opacity');
        if (slider) { slider.value = opacity; updateBgOpacity(opacity); }
    }

    const fs = localStorage.getItem('fontSize');
    if (fs) document.querySelector('.chat-messages').style.fontSize = fs + 'px';

    const ff = localStorage.getItem('fontFamily');
    if (ff) document.querySelector('.chat-messages').style.fontFamily = ff;

    const sp = localStorage.getItem('msgSpacing');
    if (sp) {
        document.querySelector('.chat-messages').style.gap = sp + 'px';
        const sl = document.getElementById('spacing-slider');
        if (sl) { sl.value = sp; document.getElementById('spacing-val').innerText = sp + 'px'; }
    }

    const bubble = localStorage.getItem('bubbleStyle');
    if (bubble) applyBubbleStyle(bubble);

    const ts = localStorage.getItem('showTimestamps');
    if (ts === '0') {
        document.querySelectorAll('.timestamp').forEach(el => el.style.display = 'none');
        const toggle = document.getElementById('ts-toggle');
        if (toggle) toggle.checked = false;
    }

    const compact = localStorage.getItem('compactMode');
    if (compact === '1') {
        toggleCompact(true);
        const toggle = document.getElementById('compact-toggle');
        if (toggle) toggle.checked = true;
    }

    // Set Username if logged in
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
        const username = localStorage.getItem('username');
        if (username) {
            const usernameEl = document.querySelector('.profile-panel .username');
            if (usernameEl) usernameEl.innerText = username;
        }
    } else {
        const usernameEl = document.querySelector('.profile-panel .username');
        if (usernameEl) usernameEl.innerText = 'Guest';
    }
})();

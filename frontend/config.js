// Deployment Configuration
// In development, this can be "http://localhost:8000"
// In production, replace with your Render backend URL (e.g., "https://your-app.onrender.com")

const CONFIG = {
    BACKEND_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "http://localhost:8000" 
        : "https://shreaks-00-annochat.onrender.com",
    GOOGLE_SHEET_API_URL: "https://script.google.com/macros/s/AKfycbxEA0mgCM69nwG8P9i8FO72KWW3QLmF-09cd3eboXfM8e8VDG-HyTcwWnufFmu-bQQ/exec"
};

console.log("Using Backend URL:", CONFIG.BACKEND_URL);

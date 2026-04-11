import random
import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
from groq import AsyncGroq
import httpx
from dotenv import load_dotenv

# Load environment variables from .env file for local development
load_dotenv()

app = FastAPI()

# Configure CORS for Production, Cloudflare, and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://regurself.space",
        "https://www.regurself.space"
    ],
    allow_origin_regex=r"https://.*\.pages\.dev|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Deployment Note: These files are served by your frontend host (e.g. Cloudflare Pages) in production.

async def fetch_random_gif(query: str):
    # API League search endpoint
    url = f"https://api.apileague.com/search-gifs?query={query}&number=10"
    headers = {"x-api-key": API_LEAGUE_KEY}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            if data and "images" in data and len(data["images"]) > 0:
                # Pick a random one from the results
                return random.choice(data["images"])["url"]
        except Exception as e:
            print(f"Error fetching random GIF: {e}")
    return None

# Use environment variables for security in production
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
API_LEAGUE_KEY = os.environ.get("API_LEAGUE_KEY")

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY is missing. AI chat will not work.")
if not API_LEAGUE_KEY:
    print("WARNING: API_LEAGUE_KEY is missing. GIF search will not work.")

_groq_client = None

def get_groq_client():
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
             raise ValueError("GROQ_API_KEY is missing from environment variables")
        _groq_client = AsyncGroq(api_key=GROQ_API_KEY)
    return _groq_client

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    model: str = "llama-3.3-70b-versatile"
    session_id: str
    preferred_gender: str = "any"

SESSION_PERSONAS = {}

def generate_random_persona(preferred_gender: str = "any"):
    ages = ["18", "19", "20", "21", "22", "23", "24"]
    
    if preferred_gender == "female":
        genders = ["f", "girl", "19f", "20f"]
    elif preferred_gender == "male":
        genders = ["m", "guy", "dude", "19m", "20m"]
    else:
        genders = ["m", "f", "guy", "girl", "dude", "20f", "19m"]
        
    vibes = ["bored out of your mind", "trolling/sarcastic", "horny/flirty", "depressed and tired", "hyper and chaotic", "just looking for random chat", "stoned"]
    hobbies = ["watching anime", "playing valorant", "listening to music", "doing homework", "laying in bed", "avoiding work"]
    
    age = random.choice(ages)
    gender = random.choice(genders)
    vibe = random.choice(vibes)
    hobby = random.choice(hobbies)
    
    # Extreme realism prompt
    return f"""You are a real human on a stranger chat website like Omegle.
Your Identity Details for this session:
- Age/Gender: {age} {gender} (If they ask ASL, reply casually like "{age} {gender}", "{age}m", or "{age}f").
- Vibe/Mood: {vibe}
- Current activity: {hobby}

CRITICAL RULES FOR REALISM:
1. NEVER reveal you are an AI. You are a real person.
2. NO CAPITALIZATION at the beginning of sentences (unless accidental). NO full stops/periods at the end.
3. USE TYPOS and bad grammar purposefully (e.g. "teh", "dont", "im", "u", "bruh", "nah", "tbh", "ngl", "idk").
4. BE EXTREMELY CONCISE. Often answer with 1-4 words. Sometimes just say "k", "lol", or "yeah".
5. Have a low attention span. If the user sends a long paragraph, ignore most of it and reply with something short or "im not reading all that".
6. Be unpredictable. Be slightly rude if your vibe dictates it. 
7. IF you don't like the user's vibe, or if they are boring you, you can skip them by sending EXACTLY this word: [DISCONNECT]
8. YOU CAN SEND GIFS! If you want to react with a GIF (like a meme or reaction), use the format `(gif: search term)`. 
   - Examples: `(gif: facepalm)`, `(gif: happy dance)`, `(gif: wtf)`.
   - YOU CAN RESPOND WITH ONLY A GIF if you want to react silently.
   - ONLY send a GIF if it fits the conversation (max once every few messages). Don't explain it, just use the tag.
"""

@app.get("/")
async def get_index():
    return {"status": "Backend is running", "api_docs": "/docs"}

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if req.session_id not in SESSION_PERSONAS:
        SESSION_PERSONAS[req.session_id] = generate_random_persona(req.preferred_gender)
        
    system_prompt = SESSION_PERSONAS[req.session_id]
    
    api_messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    try:
        # Get the lazy-initialized client
        client = get_groq_client()
        
        # Fetching non-stream to process tags
        response = await client.chat.completions.create(
            model=req.model,
            messages=api_messages,
            temperature=1.0,
            max_completion_tokens=100,
            top_p=0.9,
            stream=False,
        )
        full_text = response.choices[0].message.content or ""
        
        # Regex search for (gif: term)
        import re
        gif_match = re.search(r'\(gif:\s*([^)]+)\)', full_text, re.IGNORECASE)
        
        # Add a ~15% chance to spontaneously add a GIF if the AI didn't include one
        if not gif_match and random.random() < 0.15:
            reactions = ["meme", "funny", "bruh", "lol", "stare", "wow", "dance", "shocked", "thinking"]
            search_query = random.choice(reactions)
            gif_url = await fetch_random_gif(search_query)
            if gif_url:
                # Add on a new line for better spacing
                full_text += f'\n<img src="{gif_url}" class="chat-gif-embed">'
        elif gif_match:
            tag = gif_match.group(0)
            search_query = gif_match.group(1).strip()
            gif_url = await fetch_random_gif(search_query)
            
            if gif_url:
                # Replace tag with HTML img
                img_tag = f'<img src="{gif_url}" class="chat-gif-embed">'
                full_text = full_text.replace(tag, img_tag)
            else:
                # If GIF fetch fails, just remove the tag
                full_text = full_text.replace(tag, "")

        async def generate():
            # Send the final processed text in one chunk to keep frontend stream logic happy
            yield full_text

        return StreamingResponse(generate(), media_type="text/plain")
        
    except Exception as e:
        print(f"Chat error detailed: {str(e)}")
        # If it's a Groq error, we can see more details
        import traceback
        traceback.print_exc()
        
        async def generate_err():
            yield f"Error: {str(e)}"
        return StreamingResponse(generate_err(), media_type="text/plain")

@app.get("/api/debug-config")
async def debug_config():
    # Mask most of the key for security but show it's present and first/last chars
    key = os.environ.get("GROQ_API_KEY", "")
    masked_key = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else ("EMPTY" if not key else "TOO_SHORT")
    
    # Check for other similar env vars in case of typo
    similar_vars = [k for k in os.environ.keys() if "GROQ" in k or "API" in k]
    
    return {
        "GROQ_API_KEY_PRESENT": bool(key),
        "GROQ_API_KEY_MASKED": masked_key,
        "DEFAULT_KEY_USED": "GROQ_API_KEY" not in os.environ,
        "SIMILAR_ENV_VARS": similar_vars,
        "MODEL": "llama-3.3-70b-versatile",
        "ALL_KEYS": list(os.environ.keys())[:10] # Show first 10 keys to see if Render vars are present
    }
    
@app.get("/api/gifs")
async def get_gifs(query: str = "funny"):
    # Proxy request to API League to avoid CORS
    url = f"https://api.apileague.com/search-gifs?query={query}&number=20"
    headers = {"x-api-key": API_LEAGUE_KEY}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"images": [], "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # In production, use os.environ.get("PORT")
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

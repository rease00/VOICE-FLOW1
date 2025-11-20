
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { GenerationSettings, RemoteSpeaker } from "../types";
import { VOICES, MUSIC_TRACKS, EMOTIONS } from "../constants";

// Safely access API Key to prevent ReferenceError in strict browser environments
const SYSTEM_API_KEY = (() => {
  try {
    return (typeof process !== 'undefined' && process.env && process.env.API_KEY) ? process.env.API_KEY : '';
  } catch (e) {
    return '';
  }
})();

// Singleton AudioContext - Lazy Initialization
let audioContextInstance: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContextInstance) {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextInstance = new AudioContext();
    } catch (e) {
        console.error("AudioContext not supported", e);
        throw new Error("Audio playback is not supported in this browser.");
    }
  }
  if (audioContextInstance.state === 'suspended') {
    audioContextInstance.resume().catch(err => console.warn("Failed to resume AudioContext", err));
  }
  return audioContextInstance;
}

// Helper to safely stringify objects
function safeStringify(obj: any, space: number = 2): string {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return;
      }
      cache.add(value);
    }
    if (value instanceof Node || key.startsWith('_react') || key === 'stateNode' || value instanceof Event) return undefined;
    return value;
  }, space);
}

// Helper to parse API error message nicely
function cleanErrorMessage(error: any): string {
    let msg = error.message || '';
    try {
        // Sometimes the message is a JSON string
        const parsed = JSON.parse(msg);
        if (parsed.error && parsed.error.message) msg = parsed.error.message;
    } catch (e) { /* ignore */ }

    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted') || lowerMsg.includes('resource exhausted')) {
        return "Usage limit exceeded. Please check your API keys in settings.";
    }
    if (lowerMsg.includes('503') || lowerMsg.includes('overloaded')) {
        return "AI Service is currently overloaded. Please retry.";
    }
    if (lowerMsg.includes('fetch failed') || lowerMsg.includes('network request failed')) {
        return "Network Error: Could not connect to the AI service or Backend. Check your internet or Colab URL.";
    }
    // Truncate really long raw error dumps
    if (msg.length > 200) return msg.substring(0, 200) + "...";
    return msg;
}

// Robust Retry Helper with Exponential Backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const msg = (error.message || '').toLowerCase();
    const status = error.status || error.response?.status;
    
    const isQuotaError = status === 429 || msg.includes('resource exhausted') || msg.includes('quota') || msg.includes('429');
    const isNetworkError = msg.includes('failed to fetch') || msg.includes('network request failed');
    const isRetryable = isNetworkError || isQuotaError || status === 503 || status === 502 || status === 500 || msg.includes('overloaded');

    if (isRetryable && retries > 0) {
      const nextDelay = isQuotaError ? delay * 4 : delay * 1.5;
      if (isQuotaError) {
          console.warn(`Quota Limit Hit. Retrying in ${Math.round(nextDelay)}ms...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, nextDelay);
    }
    throw error;
  }
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// --- LOCAL LLM SERVICE (Ngrok/OpenAI Compatible) ---

async function callLocalLlm(messages: ChatMessage[], baseUrl: string): Promise<string> {
    let url = baseUrl.replace(/\/$/, '');
    if (!url.includes('/v1')) url += '/v1'; // Standardize to OpenAI format
    if (!url.endsWith('/chat/completions')) url += '/chat/completions';

    console.log("Calling Local LLM:", url);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true' // Critical for Ngrok free tier
        },
        body: JSON.stringify({
            model: "local-model", // Usually ignored by local backends
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Local LLM Error: ${response.status} - ${txt.substring(0, 100)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// --- PERPLEXITY SERVICE ---

async function callPerplexityChat(messages: ChatMessage[], apiKey: string): Promise<string> {
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "sonar-pro", 
            messages: messages,
            temperature: 0.7
        })
    };

    const response = await fetch('https://api.perplexity.ai/chat/completions', options);
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Perplexity API Error: ${response.status} - ${err}`);
    }
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
}

// --- GEMINI AI TEXT SERVICE ---

async function callGeminiText(systemPrompt: string, userPrompt: string, apiKey: string, jsonMode: boolean = false, retries: number = 3): Promise<string> {
  if (!apiKey) throw new Error("Gemini API Key is missing.");
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const config: any = {
      systemInstruction: systemPrompt,
      temperature: 0.7,
  };
  if (jsonMode) {
      config.responseMimeType = "application/json";
  }

  const response = await withRetry(async () => {
    return await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: userPrompt }] }],
      config: config
    });
  }, retries); 
  
  return response.text || "";
}

// --- UNIFIED GENERATION DISPATCHER ---

export const generateText = async (
    systemPrompt: string,
    userPrompt: string,
    settings: GenerationSettings,
    jsonMode: boolean = false
): Promise<string> => {
    const provider = settings.helperProvider || 'GEMINI';
    const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt + (jsonMode ? "\n\nIMPORTANT: Return ONLY valid JSON. No markdown formatting." : "") },
        { role: "user", content: userPrompt }
    ];

    try {
        if (provider === 'LOCAL' && settings.localLlmUrl) {
            return await callLocalLlm(messages, settings.localLlmUrl);
        }
        
        if (provider === 'PERPLEXITY' && settings.perplexityApiKey) {
            return await callPerplexityChat(messages, settings.perplexityApiKey);
        }

        // Fallback to Gemini (Default)
        const geminiKey = settings.geminiApiKey || SYSTEM_API_KEY;
        return await callGeminiText(systemPrompt, userPrompt, geminiKey, jsonMode);
    } catch (e: any) {
        console.warn(`Provider ${provider} failed:`, e);
        // If preferred provider fails, try fallback to System Gemini if available
        if (provider !== 'GEMINI' && SYSTEM_API_KEY) {
             console.log("Falling back to System Gemini...");
             return await callGeminiText(systemPrompt, userPrompt, SYSTEM_API_KEY, jsonMode);
        }
        throw new Error(cleanErrorMessage(e));
    }
};


// Helper to extract JSON from LLM response
function extractJSON(text: string): any {
  try {
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const jsonStr = cleanText.substring(start, end + 1);
      return JSON.parse(jsonStr);
    }
  } catch (e) {
    console.warn("JSON Extraction failed", e);
  }
  return null;
}


// Helper to decode base64
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode PCM audio data
async function decodeAudioData(
  data: ArrayBuffer,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const tempBuffer = data.slice(0); 
    return await ctx.decodeAudioData(tempBuffer);
  } catch (e) {
    // Fallback to Raw PCM decoding
    const dataInt16 = new Int16Array(data);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  let offset = 0;
  
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, format, true); offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitDepth, true); offset += 2;
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataLength, true); offset += 4;
  
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export const extractAudioFromVideo = async (videoFile: File): Promise<Blob> => {
  const ctx = getAudioContext();
  const arrayBuffer = await videoFile.arrayBuffer();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  } catch (e) {
    throw new Error("Failed to decode audio. Codec might not be supported.");
  }
};

// --- UNICODE AWARE REGEX FOR MULTI-SPEAKER ---
const SPEAKER_REGEX = /^\s*(?:\*\*|'|"|“)?([\p{L}\p{N}_\u0900-\u097F]+(?: [\p{L}\p{N}_\u0900-\u097F]+)*)(?:\*\*|'|"|”)?\s*(?:\(([^)]+)\))?\s*[:：]/u;


export function parseMultiSpeakerScript(text: string) {
  const lines = text.split('\n');
  const uniqueSpeakers = new Set<string>();

  lines.forEach(line => {
    if (!line.trim()) return;
    const match = line.match(SPEAKER_REGEX);
    if (match && match[1]) {
      let name = match[1].trim();
      name = name.replace(/[\*\[\]]/g, '');
      if (name.length > 0 && name.length < 50 && !['chapter', 'scene', 'part'].includes(name.toLowerCase())) {
         uniqueSpeakers.add(name);
      }
    }
  });

  const speakersList = Array.from(uniqueSpeakers);
  
  if (speakersList.length === 0) {
    return { isMultiSpeaker: false, speakersList: [] };
  }
  if (speakersList.length === 1 && speakersList[0].toLowerCase() !== 'narrator') {
     return { isMultiSpeaker: false, speakersList: [] };
  }

  return { isMultiSpeaker: true, speakersList };
}

// --- AI DIRECTOR SERVICES ---

export const autoCorrectText = async (text: string, settings: GenerationSettings): Promise<string> => {
  const systemPrompt = `You are an expert Audio Script Editor.
    Transform the input text into a production-ready Audio Script.
    
    **INPUT ANALYSIS:**
    - Detect if input is Prose (Novel/Story) or Dialogue.
    - Detect the Tone and Emotion of every sentence.
    
    **TRANSFORMATION RULES:**
    1.  **Speaker Labeling**: EVERY line must start with "Speaker Name (Emotion): ".
    2.  **Narrator**: If the text is descriptive narration, label it "Narrator (Neutral): ".
    3.  **Grammar**: Fix spelling and punctuation errors.
    
    Output ONLY the final formatted script.`;

  const userPrompt = `Clean up and format this text:\n"${text}"`;

  try {
    const result = await generateText(systemPrompt, userPrompt, settings, false);
    return result.replace(/^Here is the.*?:\s*/i, '').trim();
  } catch (e: any) {
    console.error("Auto-Correct Error:", e);
    throw new Error(cleanErrorMessage(e));
  }
};

export const autoFormatScript = async (text: string, settings: GenerationSettings): Promise<{ 
  formattedText: string, 
  cast: { name: string, gender: 'Male' | 'Female', accent: string }[], 
  suggestedMusicTrackId?: string 
}> => {
  const musicOptions = MUSIC_TRACKS.map(t => `- ID: "${t.id}", Name: "${t.name}", Mood: "${t.category}"`).join('\n');

  const systemPrompt = `You are an expert Literary AI Adapter and Audio Director. 
    Your goal is to convert any text (Novel, Short Story, Script, or Draft) into a rich, multi-speaker Audio Drama Script.

    **CRITICAL ANALYSIS TASKS:**
    1.  **Story & Text Detection**: Analyze the input. 
        -   If it's a **Novel/Story**: Extract dialogue for characters. Convert descriptive text to "Narrator". 
        -   If it's a **Play/Script**: Enhance formatting and add missing emotions.
    
    2.  **Advanced Gender Detection (HINDI/ENGLISH/GLOBAL)**: 
        -   Identify all unique speakers.
        -   **HINDI RULE**: You MUST analyze verb endings to detect gender if the name is ambiguous.
            -   "Karta", "Jata", "Raha", "Tha" -> **Male**
            -   "Karti", "Jati", "Rahi", "Thi" -> **Female**
        -   **General**: Use name context (e.g., "Sarah" is Female, "Rahul" is Male).
        -   Assign 'Male' or 'Female' accurately.
    
    3.  **Emotion Detection**: For EVERY line, detect the exact emotion (e.g., (Whispering), (Furious), (Laughing)). 
        -   Format: "Character Name (Emotion): Dialogue"
    
    4.  **Music Matching**: Select the best background music ID from the list below based on the story's dominant mood.

    **Music Options:**
    ${musicOptions}

    **Output JSON Schema:**
    {
      "cast": [
        { "name": "string", "gender": "Male|Female", "accent": "string (e.g. British, Hindi, Deep)" }
      ],
      "script": "string (The full adapted script text with newlines)",
      "suggestedMusicTrackId": "string"
    }
    
    Return ONLY valid JSON.`;

  const userPrompt = `Adapt and direct this text:\n"${text.substring(0, 30000)}"`;

  try {
    const resultText = await generateText(systemPrompt, userPrompt, settings, true);
    const json = extractJSON(resultText);
    
    if (!json) {
      return { formattedText: text, cast: [] };
    }

    return {
      formattedText: json.script || text,
      cast: json.cast || [],
      suggestedMusicTrackId: json.suggestedMusicTrackId
    };
  } catch (e: any) {
    console.error("Auto-Format Error:", e);
    throw new Error(cleanErrorMessage(e));
  }
};

// --- AUTO DETECTION SERVICES ---

export const detectLanguage = async (text: string, settings: GenerationSettings): Promise<string> => {
  if (!text || text.trim().length < 3) return 'en';

  if (/[\u0900-\u097F]/.test(text)) return 'hi'; 
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; 
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; 
  
  if (text.length < 50) return 'en';

  try {
    const systemPrompt = "You are a language detector. Return ONLY the 2-letter ISO 639-1 code.";
    const userPrompt = `Identify the language of this text: "${text.substring(0, 200)}"`;
    const result = await generateText(systemPrompt, userPrompt, settings, false);
    const code = result.trim().toLowerCase().substring(0, 2);
    return code.match(/[a-z]{2}/) ? code : 'en';
  } catch (e) {
    return 'en';
  }
};

export const generateTextContent = async (prompt: string, currentText: string | undefined, settings: GenerationSettings): Promise<string> => {
  try {
    const systemPrompt = "You are a creative writing assistant. Generate text based on the user request. Output ONLY the requested text.";
    const userPrompt = currentText 
      ? `Original Text: "${currentText}"\n\nTask: ${prompt}`
      : `Task: ${prompt}`;
      
    return await generateText(systemPrompt, userPrompt, settings, false);
  } catch (e: any) {
    throw new Error(cleanErrorMessage(e));
  }
}

export const translateText = async (text: string, targetLanguage: string, settings: GenerationSettings): Promise<string> => {
  try {
    const systemPrompt = `You are a professional translator. Translate the input text to ${targetLanguage}. Return ONLY the translated text, preserving formatting and speaker names (e.g. 'Name: ') if present.`;
    return await generateText(systemPrompt, text, settings, false);
  } catch (e: any) {
     throw new Error(cleanErrorMessage(e));
  }
};

export const translateVideoContent = async (videoFile: File, targetLanguage: string, settings: GenerationSettings): Promise<string> => {
    const audioBlob = await extractAudioFromVideo(videoFile);
    const geminiKey = settings.geminiApiKey || SYSTEM_API_KEY;
    if (!geminiKey) throw new Error("API Key missing");

    const buffer = await audioBlob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
            parts: [
                { inlineData: { mimeType: "audio/wav", data: base64Audio } },
                { text: `Transcribe the audio and then translate it to ${targetLanguage}. Return ONLY the translated text.` }
            ]
        }]
    });
    
    return response.text || "Translation failed.";
};

export const extractLyrics = async (audioFile: File, settings: GenerationSettings): Promise<string> => {
  const geminiKey = settings.geminiApiKey || SYSTEM_API_KEY;
  if (!geminiKey) throw new Error("API Key missing for lyrics extraction.");
  
  if (audioFile.size > 9 * 1024 * 1024) { // ~9MB
     throw new Error("File too large for lyric extraction (Max 9MB). Please trim the audio.");
  }

  const arrayBuffer = await audioFile.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
  }
  const base64Audio = btoa(binary);

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              { inlineData: { mimeType: audioFile.type || "audio/mp3", data: base64Audio } },
              { text: "Listen to this song. Extract the lyrics EXACTLY as heard. Return ONLY the raw lyrics text. Do not add timestamps." }
            ]
          }
        ]
      });
      return response.text || "No lyrics detected.";
  } catch (e: any) {
      throw new Error(`Lyrics extraction failed: ${cleanErrorMessage(e)}`);
  }
}

export const analyzeVoiceSample = async (audioBlob: Blob, settings: GenerationSettings): Promise<string> => {
   const geminiKey = settings.geminiApiKey || SYSTEM_API_KEY;
   if (!geminiKey) return "Analyzed Voice Profile";
   
   try {
       const buffer = await audioBlob.arrayBuffer();
       let binary = '';
       const bytes = new Uint8Array(buffer);
       const len = bytes.byteLength;
       const chunkSize = 8192;
       for (let i = 0; i < len; i += chunkSize) {
         binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
       }
       const base64Audio = btoa(binary);
       
       const ai = new GoogleGenAI({ apiKey: geminiKey });
       const response = await ai.models.generateContent({
         model: "gemini-2.5-flash",
         contents: [{
             parts: [
                 { inlineData: { mimeType: "audio/wav", data: base64Audio } },
                 { text: "Describe this voice in 5 words (e.g. 'Deep, male, British accent'). Return ONLY the description." }
             ]
         }]
       });
       return response.text || "Custom Voice Clone";
   } catch (e) {
       return "Custom Voice Clone";
   }
};

// --- NEW: FETCH REMOTE SPEAKERS ---
export const fetchRemoteSpeakers = async (backendUrl: string): Promise<RemoteSpeaker[]> => {
    if (!backendUrl) return [];
    
    let url = backendUrl.replace(/\/$/, '');
    if (!url.endsWith('/speakers')) url += '/speakers';

    try {
        const res = await fetch(url, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        
        if (!res.ok) throw new Error(`Status ${res.status}`);
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
             throw new Error("Endpoint returned HTML. Likely Ngrok error or invalid URL.");
        }

        const data = await res.json();
        if (Array.isArray(data)) {
            if (typeof data[0] === 'string') {
                return data.map((s: string) => ({ id: s, name: s }));
            } else if (data[0].id && data[0].name) {
                return data;
            }
        }
        return [];
    } catch (e) {
        console.warn("Failed to fetch remote speakers:", e);
        return [];
    }
};


// --- TTS SERVICE (Chatterbox Primary) ---

export const generateSpeech = async (
  text: string,
  voiceName: string, 
  settings: GenerationSettings,
  mode: 'speech' | 'singing' = 'speech'
): Promise<AudioBuffer> => {
  const ctx = getAudioContext();

  let lang = 'en';
  if (settings.language && settings.language !== 'Auto') {
     const map: any = { 'English': 'en', 'Spanish': 'es', 'French': 'fr', 'German': 'de', 'Hindi': 'hi', 'Japanese': 'ja' };
     lang = map[settings.language] || 'en';
  }

  // Helper to clean text for single speaker (remove "John: " prefixes)
  const cleanTextForSingleSpeaker = (rawText: string) => {
     const lines = rawText.split('\n');
     return lines.map(line => {
        const match = line.match(SPEAKER_REGEX);
        if (match) {
            return line.substring(match[0].length).trim();
        }
        return line;
     }).join('\n');
  };

  // --- CHATTERBOX (COQUI) ENGINE ---
  if (settings.engine === 'COQ' || (!settings.engine && settings.backendUrl)) {
    if (!settings.backendUrl || settings.backendUrl.trim() === '') {
        throw new Error("Backend URL is required for Coqui Engine. Please check settings.");
    }

    try {
      let url = settings.backendUrl.replace(/\/$/, '');
      if (!url.endsWith('/tts')) url += '/tts';
      
      const speakerId = settings.chatterboxId || voiceName || 'Fenrir';
      const cleanedText = cleanTextForSingleSpeaker(text);

      const response = await withRetry(async () => {
         const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify({
              text: cleanedText,
              speaker_id: speakerId, 
              language_id: lang, 
              emotion: settings.emotion || 'Neutral'
            })
          });
          
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
              throw new Error("Backend returned HTML instead of Audio. Check your Colab/Ngrok URL.");
          }

          if (!res.ok) throw new Error(`Backend Error ${res.status}: ${res.statusText}`);
          return res;
      });
      
      const arrayBuffer = await response.arrayBuffer();
      return await decodeAudioData(arrayBuffer, ctx, 24000, 1);
    } catch (err: any) {
      console.warn("Chatterbox backend failed.", safeStringify(err));
      if (err.message.includes('Backend Error') || err.message.includes('Network request failed') || err.message.includes('HTML')) {
          throw new Error(`Chatterbox Connection Failed: ${err.message}. Check your Colab URL.`);
      }
      throw err; 
    }
  }

  // --- Fallback: Gemini API ---
  const geminiKey = settings.geminiApiKey || SYSTEM_API_KEY;
  if (!geminiKey) throw new Error("API Key is missing for Fallback TTS.");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  try {
    let textToSpeak = text;
    const { isMultiSpeaker, speakersList } = parseMultiSpeakerScript(textToSpeak);
    let useMultiSpeaker = isMultiSpeaker && speakersList.length > 0;
    
    if (mode === 'singing') {
        useMultiSpeaker = false;
    }
    
    let config: any = { responseModalities: [Modality.AUDIO] };

    const applySingleSpeakerConfig = () => {
      let targetVoice = voiceName;
      if (!targetVoice || targetVoice.length > 15) targetVoice = 'Fenrir'; 
      
      textToSpeak = cleanTextForSingleSpeaker(textToSpeak);

      if (mode === 'singing') {
          textToSpeak = `(Singing melodically): ${textToSpeak}`;
      } else if (settings.emotion && settings.emotion !== 'Neutral') {
         if (!textToSpeak.toLowerCase().includes(settings.emotion!.toLowerCase())) {
            textToSpeak = `Say ${settings.emotion!.toLowerCase()}: ${textToSpeak}`;
         }
      }
      
      config.speechConfig = {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: targetVoice } },
      };
    };

    if (useMultiSpeaker) {
      const VIRTUAL_A = "Speaker_A";
      const VIRTUAL_B = "Speaker_B";

      const realToVirtualMap = new Map<string, string>();
      const virtualToGeminiVoiceMap = new Map<string, string>();
      
      speakersList.forEach((name, idx) => {
          const virtualSlot = idx % 2 === 0 ? VIRTUAL_A : VIRTUAL_B;
          realToVirtualMap.set(name, virtualSlot);
          
          if (!virtualToGeminiVoiceMap.has(virtualSlot)) {
              const assignedId = settings.speakerMapping?.[name] || VOICES[idx % VOICES.length].id;
              const v = VOICES.find(x => x.id === assignedId);
              const gVoice = v ? v.geminiVoiceName : (virtualSlot === VIRTUAL_A ? 'Fenrir' : 'Kore');
              virtualToGeminiVoiceMap.set(virtualSlot, gVoice);
          }
      });

      const speakerVoiceConfigs = [
          {
              speaker: VIRTUAL_A,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: virtualToGeminiVoiceMap.get(VIRTUAL_A) || 'Fenrir' } }
          },
          {
              speaker: VIRTUAL_B,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: virtualToGeminiVoiceMap.get(VIRTUAL_B) || 'Kore' } }
          }
      ];

      config.speechConfig = {
        multiSpeakerVoiceConfig: { speakerVoiceConfigs }
      };

      const lines = textToSpeak.split('\n');
      const defaultSpeaker = VIRTUAL_A; 

      const cleanedLines = lines.map(line => {
          if (!line.trim()) return '';
          const match = line.match(SPEAKER_REGEX);
          if (match && match[1]) {
              const rawName = match[1].trim().replace(/[\*\[\]]/g, '');
              const realNameKey = speakersList.find(s => rawName.includes(s) || s.includes(rawName));
              
              if (realNameKey && realToVirtualMap.has(realNameKey)) {
                  const virtualName = realToVirtualMap.get(realNameKey);
                  const emotion = match[2] ? `(${match[2]}) ` : ''; 
                  const dialogue = line.substring(match[0].length).trim();
                  return `${virtualName}: ${emotion}${dialogue}`;
              }
          }
          if (line.trim().length > 0) return `${defaultSpeaker}: ${line.trim()}`;
          return '';
      });
      textToSpeak = cleanedLines.filter(l => l.length > 0).join('\n');
    } else {
       applySingleSpeakerConfig();
    }

    const response = await withRetry(async () => {
        return await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: textToSpeak }] }],
          config: config,
        });
    }, 3, 3000);

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated from Gemini.");
    const audioBytes = decode(base64Audio);
    return await decodeAudioData(audioBytes.buffer, ctx, 24000, 1);

  } catch (error: any) {
    throw new Error(cleanErrorMessage(error));
  }
};

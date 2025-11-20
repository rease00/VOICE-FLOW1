
import React, { useState, useRef, useEffect } from 'react';
import { Mic, User, Zap, Play, Pause, Settings, X, Server, Wand2, Trash2, Sparkles, Music, Video, History, ArrowRight, Languages, Globe, FolderOpen, Square, Save, FileText, Fingerprint, ChevronDown, Upload, Film, MonitorPlay, Clock, AlertTriangle, Smile, CheckCircle2, Link, Users, Type, Scissors, Quote, Eraser, List, Volume2, RotateCcw, Layers, Radio, UploadCloud, FileAudio, Disc, Sparkle, Loader2, AlertCircle, Download, Copy, SpellCheck, BrainCircuit, RefreshCw, Laptop, Bot, Plus } from 'lucide-react';
import { Button } from '../components/Button';
import { VOICES, MUSIC_TRACKS, LANGUAGES, EMOTIONS } from '../constants';
import { GenerationSettings, AppScreen, HistoryItem, ClonedVoice, Draft, RemoteSpeaker } from '../types';
import { generateSpeech, audioBufferToWav, generateTextContent, translateText, analyzeVoiceSample, translateVideoContent, detectLanguage, parseMultiSpeakerScript, extractAudioFromVideo, extractLyrics, autoFormatScript, autoCorrectText, fetchRemoteSpeakers } from '../services/geminiService';
import { AudioPlayer } from '../components/AudioPlayer';
import { useUser } from '../contexts/UserContext';
import { AdModal } from '../components/AdModal';

interface MainAppProps {
  setScreen: (screen: AppScreen) => void;
}

enum Tab {
  STUDIO = 'STUDIO',
  LAB = 'LAB',
  DUBBING = 'DUBBING'
}

type LabMode = 'CLONING' | 'COVERS';

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-indigo-50 border-indigo-200 text-indigo-800'
  };
  
  const icons = {
    success: <CheckCircle2 size={18} className="text-green-600" />,
    error: <AlertCircle size={18} className="text-red-600" />,
    info: <Sparkles size={18} className="text-indigo-600" />
  };

  return (
    <div className={`fixed top-20 right-6 z-50 flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md animate-in slide-in-from-right duration-300 max-w-sm ${colors[type]}`}>
      <div className="mt-0.5">{icons[type]}</div>
      <p className="text-sm font-medium leading-tight">{message}</p>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
    </div>
  );
};

export const MainApp: React.FC<MainAppProps> = ({ setScreen }) => {
  const { stats, updateStats, setShowSubscriptionModal, watchAd, addToHistory, history, user, clonedVoices, addClonedVoice, drafts, saveDraft, deleteDraft, characterLibrary, updateCharacter, getVoiceForCharacter } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>(Tab.STUDIO);
  const [labMode, setLabMode] = useState<LabMode>('CLONING');
  
  const [text, setText] = useState('');
  
  // Settings with persistence
  const [settings, setSettings] = useState<GenerationSettings>(() => {
    try {
      const saved = localStorage.getItem('vf_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    
    return {
      voiceId: VOICES[0].id,
      speed: 1.0,
      pitch: 'Medium',
      language: 'Auto',
      emotion: 'Neutral',
      
      // Engines
      engine: 'GEM', 
      backendUrl: '',
      chatterboxId: '',

      // Helpers
      helperProvider: 'GEMINI',
      perplexityApiKey: '',
      localLlmUrl: 'http://localhost:5000',
      geminiApiKey: '',

      musicTrackId: 'm_none',
      musicVolume: 0.3,
      speechVolume: 1.0,
      autoEnhance: true,
      speakerMapping: {}
    };
  });

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem('vf_settings', JSON.stringify(settings));
  }, [settings]);
  
  const [coquiSpeakers, setCoquiSpeakers] = useState<RemoteSpeaker[]>([]);
  const [isFetchingSpeakers, setIsFetchingSpeakers] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
  
  const [showTranslateDropdown, setShowTranslateDropdown] = useState(false);
  const [isAiWriting, setIsAiWriting] = useState(false);
  const [isAutoCorrecting, setIsAutoCorrecting] = useState(false);
  
  // AI Assistant Floating Panel
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiAssistPrompt, setAiAssistPrompt] = useState('');

  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [detectedSpeakers, setDetectedSpeakers] = useState<string[]>([]);

  const [cloneMode, setCloneMode] = useState<'record' | 'upload'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [uploadVoiceFile, setUploadVoiceFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null);
  const [isDubPlaying, setIsDubPlaying] = useState(false);
  const [isExtractingVoice, setIsExtractingVoice] = useState(false);
  
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [songLyrics, setSongLyrics] = useState<string>('');
  const [isExtractingLyrics, setIsExtractingLyrics] = useState(false);

  const [originalVol, setOriginalVol] = useState(0.3); 
  const [dubVol, setDubVol] = useState(1.0);
  const [preserveBackground, setPreserveBackground] = useState(true);
  
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const dubAudioContextRef = useRef<AudioContext | null>(null);
  const dubVideoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dubAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dubVideoGainRef = useRef<GainNode | null>(null);
  const dubAudioGainRef = useRef<GainNode | null>(null);
  const dubVocalFilterRef = useRef<BiquadFilterNode | null>(null);

  const [previewMusicId, setPreviewMusicId] = useState<string | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLimitReached = stats.generationsUsed >= stats.generationsLimit && !stats.isPremium;

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  useEffect(() => {
    musicPreviewRef.current = new Audio();
    musicPreviewRef.current.loop = false;
    musicPreviewRef.current.volume = 0.5;
    
    musicPreviewRef.current.onended = () => {
      setPreviewMusicId(null);
    };
    
    musicPreviewRef.current.onerror = (e) => {
      console.warn("Preview Audio Failed to Load");
      setPreviewMusicId(null);
      showToast("Preview playback failed. Check connection.", "error");
    };

    return () => {
      if (musicPreviewRef.current) {
        musicPreviewRef.current.pause();
        musicPreviewRef.current = null;
      }
      if (dubAudioContextRef.current) {
        dubAudioContextRef.current.close();
      }
    };
  }, []);

  // Initial load if URL is present
  useEffect(() => {
    if (settings.engine === 'COQ' && settings.backendUrl && settings.backendUrl.length > 10 && coquiSpeakers.length === 0) {
       checkBackendConnection();
    }
  }, [settings.engine]);

  const checkBackendConnection = async () => {
    if (!settings.backendUrl) return;
    setIsFetchingSpeakers(true);
    try {
        const speakers = await fetchRemoteSpeakers(settings.backendUrl);
        setCoquiSpeakers(speakers);
        if (speakers.length > 0) {
             showToast(`Connected! Found ${speakers.length} voices.`, 'success');
             if (!speakers.find(s => s.id === settings.chatterboxId)) {
                 setSettings(prev => ({ ...prev, chatterboxId: speakers[0].id }));
             }
        } else {
             showToast("Connected to backend, but no speakers found.", "info");
        }
    } catch (e: any) {
        showToast(`Connection Failed: ${e.message}`, "error");
    } finally {
        setIsFetchingSpeakers(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (text.length > 5 && settings.language === 'Auto') {
        const code = await detectLanguage(text, settings);
        setDetectedLang(code.toUpperCase());
      } else if (text.length === 0) {
        setDetectedLang(null);
      }

      const { isMultiSpeaker, speakersList } = parseMultiSpeakerScript(text);
      if (isMultiSpeaker && speakersList.length > 0) {
        setDetectedSpeakers(speakersList);
        
        setSettings(prev => {
            const newMapping = { ...prev.speakerMapping };
            let changed = false;
            speakersList.forEach((speaker, idx) => {
                if (!newMapping[speaker]) {
                    const rememberedVoice = getVoiceForCharacter(speaker);
                    if (rememberedVoice) {
                         newMapping[speaker] = rememberedVoice;
                    } else {
                        if (prev.engine === 'COQ' && coquiSpeakers.length > 0) {
                             newMapping[speaker] = coquiSpeakers[idx % coquiSpeakers.length].id;
                        } else {
                             newMapping[speaker] = VOICES[idx % VOICES.length].id;
                        }
                    }
                    changed = true;
                }
            });
            return changed ? { ...prev, speakerMapping: newMapping } : prev;
        });
      } else {
        setDetectedSpeakers([]);
      }

    }, 2000); 

    return () => clearTimeout(timeoutId);
  }, [text, settings.language, settings.helperProvider, settings.engine, coquiSpeakers]);

  const getEstimatedTime = () => {
    if (activeTab === Tab.DUBBING) {
          if (!videoFile) return 0;
          const sizeMB = videoFile.size / (1024 * 1024);
          return Math.max(5, Math.ceil(sizeMB * 5));
    } else if (activeTab === Tab.LAB && labMode === 'COVERS') {
          if (!songFile) return 0;
          return 10; 
    } else {
      if (!text) return 0;
      return Math.max(2, Math.ceil(text.length * 0.05));
    }
  };

  const estimatedTime = getEstimatedTime();

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      setProgress(0);
      const durationMs = Math.max(estimatedTime * 1000, 2000);
      const updateInterval = 100; 
      const totalSteps = durationMs / updateInterval;
      const incrementPerStep = 95 / totalSteps;

      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            return Math.min(prev + 0.05, 99);
          }
          return prev + incrementPerStep;
        });
      }, updateInterval);
    } else {
      if (progress > 0) {
        setProgress(100);
        const timeout = setTimeout(() => setProgress(0), 500);
        return () => clearTimeout(timeout);
      }
    }
    return () => clearInterval(interval);
  }, [isGenerating, estimatedTime]);

  const toggleMusicPreview = (trackId: string) => {
    if (!musicPreviewRef.current) return;
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (!track || !track.url) return;

    if (previewMusicId === trackId) {
      musicPreviewRef.current.pause();
      setPreviewMusicId(null);
    } else {
      musicPreviewRef.current.pause();
      musicPreviewRef.current.src = track.url;
      const playPromise = musicPreviewRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setPreviewMusicId(trackId)).catch(console.error);
      }
    }
  };

  const initDubbingMixer = () => {
      if (!videoPlayerRef.current || !audioPlayerRef.current) return;
      
      if (!dubAudioContextRef.current) {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          dubAudioContextRef.current = new AudioContext();
      }
      const ctx = dubAudioContextRef.current;
      if(ctx.state === 'suspended') ctx.resume();

      if (!dubVideoSourceRef.current) {
          dubVideoSourceRef.current = ctx.createMediaElementSource(videoPlayerRef.current);
      }
      if (!dubAudioSourceRef.current) {
          dubAudioSourceRef.current = ctx.createMediaElementSource(audioPlayerRef.current);
      }

      if (!dubVideoGainRef.current) dubVideoGainRef.current = ctx.createGain();
      if (!dubAudioGainRef.current) dubAudioGainRef.current = ctx.createGain();
      
      if (!dubVocalFilterRef.current) {
          const filter = ctx.createBiquadFilter();
          if (labMode === 'COVERS') {
             filter.type = 'peaking';
             filter.frequency.value = 1000;
             filter.Q.value = 2.0;
             filter.gain.value = -20; 
          } else {
             filter.type = 'peaking';
             filter.frequency.value = 1000; 
             filter.Q.value = 1.0; 
             filter.gain.value = -15;
          }
          dubVocalFilterRef.current = filter;
      } else {
          if (labMode === 'COVERS') {
              dubVocalFilterRef.current.gain.value = -20;
              dubVocalFilterRef.current.Q.value = 2.0;
          } else {
              dubVocalFilterRef.current.gain.value = -15;
              dubVocalFilterRef.current.Q.value = 1.0;
          }
      }

      dubVideoSourceRef.current.disconnect();
      dubAudioSourceRef.current.disconnect();
      dubVocalFilterRef.current?.disconnect();

      if (preserveBackground) {
        dubVideoSourceRef.current.connect(dubVocalFilterRef.current!);
        dubVocalFilterRef.current!.connect(dubVideoGainRef.current);
      } else {
        dubVideoSourceRef.current.connect(dubVideoGainRef.current);
      }

      dubVideoGainRef.current.connect(ctx.destination);
      dubAudioSourceRef.current.connect(dubAudioGainRef.current);
      dubAudioGainRef.current.connect(ctx.destination);
      
      dubVideoGainRef.current.gain.value = originalVol;
      dubAudioGainRef.current.gain.value = dubVol;
  };

  const handleDubPlayToggle = () => {
    if (videoPlayerRef.current && audioPlayerRef.current) {
      initDubbingMixer();
      if (videoPlayerRef.current.paused) {
        videoPlayerRef.current.play();
        audioPlayerRef.current.currentTime = videoPlayerRef.current.currentTime;
        audioPlayerRef.current.play().catch(console.warn);
        setIsDubPlaying(true);
      } else {
        videoPlayerRef.current.pause();
        audioPlayerRef.current.pause();
        setIsDubPlaying(false);
      }
    } else if (videoPlayerRef.current) {
       if(videoPlayerRef.current.paused) {
           videoPlayerRef.current.play();
           setIsDubPlaying(true);
       } else {
           videoPlayerRef.current.pause();
           setIsDubPlaying(false);
       }
    }
  };

  const handleVideoTimeUpdate = () => {
     if (videoPlayerRef.current && audioPlayerRef.current) {
         const diff = Math.abs(videoPlayerRef.current.currentTime - audioPlayerRef.current.currentTime);
         if (diff > 0.2) {
             audioPlayerRef.current.currentTime = videoPlayerRef.current.currentTime;
         }
     }
  };

  const handleVideoSeek = () => {
    if (videoPlayerRef.current && audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = videoPlayerRef.current.currentTime;
    }
  };

  const handleVideoEnded = () => {
    setIsDubPlaying(false);
    if(audioPlayerRef.current) audioPlayerRef.current.pause();
  };

  useEffect(() => {
      if (dubVideoGainRef.current) dubVideoGainRef.current.gain.value = originalVol;
      if (dubAudioGainRef.current) dubAudioGainRef.current.gain.value = dubVol;
      
      if (dubAudioContextRef.current && dubVideoSourceRef.current && dubVocalFilterRef.current && dubVideoGainRef.current) {
           dubVideoSourceRef.current.disconnect();
           dubVocalFilterRef.current.disconnect();
           
           if (preserveBackground) {
               dubVideoSourceRef.current.connect(dubVocalFilterRef.current);
               dubVocalFilterRef.current.connect(dubVideoGainRef.current);
           } else {
               dubVideoSourceRef.current.connect(dubVideoGainRef.current);
           }
      }
  }, [originalVol, dubVol, preserveBackground]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        showToast("File size too large. Limit is 50MB.", "error");
        return;
      }
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setDubbedAudioUrl(null);
      dubVideoSourceRef.current = null;
      dubAudioSourceRef.current = null;
    }
  };

  const handleSongUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSongFile(file);
      setSongUrl(URL.createObjectURL(file));
      setDubbedAudioUrl(null);
      dubVideoSourceRef.current = null;
      dubAudioSourceRef.current = null;
      setOriginalVol(0.6);
      setDubVol(1.0);
    }
  };

  const handleCloneFromVideo = async () => {
    if (!videoFile) return;
    setIsExtractingVoice(true);
    try {
        const audioBlob = await extractAudioFromVideo(videoFile);
        const description = await analyzeVoiceSample(audioBlob, settings);
        const newVoice: ClonedVoice = {
            id: `clone_vid_${Date.now()}`,
            name: `Video Voice ${clonedVoices.length + 1}`,
            gender: 'Unknown', 
            accent: 'Original',
            geminiVoiceName: 'Fenrir',
            originalSampleUrl: URL.createObjectURL(audioBlob),
            dateCreated: Date.now(),
            description: description,
            isCloned: true
        };
        addClonedVoice(newVoice);
        setSettings(prev => ({ ...prev, voiceId: newVoice.id }));
        showToast(`Voice extracted as "${newVoice.name}"`, "success");
    } catch (e) {
        console.error(e);
        showToast("Failed to extract voice.", "error");
    } finally {
        setIsExtractingVoice(false);
    }
  };

  const handleSongCoverGeneration = async () => {
      if (!songFile) return;
      if (isLimitReached) {
          setShowAdModal(true);
          return;
      }
      setIsGenerating(true);
      setIsExtractingLyrics(true);

      try {
          const lyrics = await extractLyrics(songFile, settings);
          if (!lyrics || lyrics.includes("No lyrics detected")) {
              throw new Error("Could not extract lyrics. The audio might be instrumental or too noisy.");
          }
          setSongLyrics(lyrics);
          setIsExtractingLyrics(false);

          let geminiVoiceName = '';
          const standardVoice = VOICES.find(v => v.id === settings.voiceId);
          const clonedVoice = clonedVoices.find(v => v.id === settings.voiceId);

          if (standardVoice) geminiVoiceName = standardVoice.geminiVoiceName;
          else if (clonedVoice) geminiVoiceName = clonedVoice.geminiVoiceName;
          else geminiVoiceName = settings.chatterboxId || 'Fenrir';

          const audioBuffer = await generateSpeech(lyrics, geminiVoiceName, settings, 'singing');
          const wavBlob = audioBufferToWav(audioBuffer);
          const url = URL.createObjectURL(wavBlob);
          setDubbedAudioUrl(url);

          if (!stats.isPremium) {
              updateStats({ generationsUsed: Math.min(stats.generationsUsed + 1, stats.generationsLimit) });
          }
          showToast("Song cover generated!", "success");

      } catch (e: any) {
          console.error("Song Cover failed", e);
          showToast("Cover failed: " + e.message, "error");
      } finally {
          setIsGenerating(false);
          setIsExtractingLyrics(false);
      }
  };

  const handleDubbing = async () => {
    if (!videoFile) return;
    if (isLimitReached) {
        setShowAdModal(true);
        return;
    }
    setIsGenerating(true);
    try {
      const targetLang = settings.language; 
      const translatedText = await translateVideoContent(videoFile, targetLang, settings);
      const tempSettings = { ...settings, language: 'Auto' }; 
      
      let geminiVoiceName = '';
      const standardVoice = VOICES.find(v => v.id === settings.voiceId);
      const clonedVoice = clonedVoices.find(v => v.id === settings.voiceId);

      if (standardVoice) {
        geminiVoiceName = standardVoice.geminiVoiceName;
      } else if (clonedVoice) {
        geminiVoiceName = clonedVoice.geminiVoiceName; 
      } else {
        if(settings.backendUrl && settings.chatterboxId) {
            geminiVoiceName = settings.chatterboxId;
        } else {
            geminiVoiceName = 'Fenrir';
        }
      }

      const audioBuffer = await generateSpeech(translatedText, geminiVoiceName, tempSettings, 'speech');
      const wavBlob = audioBufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      setDubbedAudioUrl(url);
      if (!stats.isPremium) {
        updateStats({ generationsUsed: Math.min(stats.generationsUsed + 1, stats.generationsLimit) });
      }
      showToast("Dubbing complete!", "success");
    } catch (error: any) {
      console.error("Dubbing failed:", error);
      showToast(`Dubbing failed: ${error.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (previewMusicId && musicPreviewRef.current) {
      musicPreviewRef.current.pause();
      setPreviewMusicId(null);
    }
    if (isLimitReached) {
        setShowAdModal(true);
        return;
    }
    setIsGenerating(true);
    setGeneratedAudioUrl(null);
    setGeneratedBuffer(null);

    try {
      let geminiVoiceName = '';
      let voiceDisplayName = '';
      
      // Voice Selection Logic
      if (settings.engine === 'COQ' && settings.chatterboxId) {
         geminiVoiceName = settings.chatterboxId;
         const v = coquiSpeakers.find(s => s.id === settings.chatterboxId);
         voiceDisplayName = v ? v.name : settings.chatterboxId;
      } else {
         const standardVoice = VOICES.find(v => v.id === settings.voiceId);
         const clonedVoice = clonedVoices.find(v => v.id === settings.voiceId);
         
         if (standardVoice) {
            geminiVoiceName = standardVoice.geminiVoiceName;
            voiceDisplayName = standardVoice.name;
         } else if (clonedVoice) {
            geminiVoiceName = clonedVoice.geminiVoiceName; 
            voiceDisplayName = clonedVoice.name;
         } else {
             geminiVoiceName = 'Fenrir'; 
             voiceDisplayName = 'Fenrir';
         }
      }
      
      const audioBuffer = await generateSpeech(text, geminiVoiceName, settings, 'speech');
      setGeneratedBuffer(audioBuffer);
      
      const wavBlob = audioBufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      setGeneratedAudioUrl(url);
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        text: text,
        audioUrl: url,
        voiceName: detectedSpeakers.length >= 2 ? "Multi-Speaker Cast" : voiceDisplayName,
        timestamp: Date.now(),
      };
      addToHistory(newItem);

      if (!stats.isPremium) {
        updateStats({ generationsUsed: Math.min(stats.generationsUsed + 1, stats.generationsLimit) });
      }
      showToast("Audio generated successfully!", "success");
    } catch (error: any) {
      console.error(error);
      showToast(`Error: ${error.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const insertAtCursor = (insertion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = text.substring(0, start) + insertion + text.substring(end);
    setText(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  const handleDownloadScript = () => {
     if (!text.trim()) return;
     const blob = new Blob([text], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `script_${Date.now()}.txt`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
  };

  const handleAutoCorrect = async () => {
    if (!text.trim()) return;
    setIsAutoCorrecting(true);
    try {
      const corrected = await autoCorrectText(text, settings);
      setText(corrected);
      showToast("Text auto-corrected successfully", "success");
    } catch (e: any) {
      showToast("Auto-correction failed: " + e.message, "error");
    } finally {
      setIsAutoCorrecting(false);
    }
  };

  const handleTranslateText = async (targetLang: string) => {
    if (!text.trim()) return;
    setIsAiWriting(true);
    setShowTranslateDropdown(false);
    try {
      const translated = await translateText(text, targetLang, settings);
      setText(translated);
      showToast(`Translated to ${targetLang}`, "success");
    } catch (e: any) {
      showToast("Translation failed: " + e.message, "error");
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleAiAssistSubmit = async (customPrompt?: string) => {
    const promptToUse = customPrompt || aiAssistPrompt;
    if (!promptToUse.trim()) return;

    setIsAiWriting(true);
    try {
        const textarea = textareaRef.current;
        const selectionStart = textarea?.selectionStart || 0;
        const selectionEnd = textarea?.selectionEnd || 0;
        const hasSelection = selectionEnd > selectionStart;
        
        const selectedText = hasSelection ? text.substring(selectionStart, selectionEnd) : undefined;
        
        // Context: If no selection, provide the last 2000 chars as context to continue
        const contextText = hasSelection ? selectedText : text.slice(-2000); 

        let finalPrompt = promptToUse;
        if (!hasSelection && (promptToUse.toLowerCase().includes('continue') || promptToUse.toLowerCase().includes('write'))) {
            finalPrompt = `Continue the story/script based on the context provided. ${promptToUse}`;
        }

        const result = await generateTextContent(finalPrompt, contextText, settings);
        
        if (hasSelection) {
            // Replace selection
            const newText = text.substring(0, selectionStart) + result + text.substring(selectionEnd);
            setText(newText);
        } else {
            // Append
            const newText = text + (text.endsWith(' ') || text.endsWith('\n') ? '' : ' ') + result;
            setText(newText);
        }
        
        setAiAssistPrompt('');
        showToast("AI suggestions applied!", "success");
        setShowAiAssist(false); 
    } catch (e: any) {
        showToast(e.message, "error");
    } finally {
        setIsAiWriting(false);
    }
  };

  const handleAiDirector = async () => {
    if (!text.trim()) return;
    setIsAiWriting(true);
    try {
      const { formattedText, cast, suggestedMusicTrackId } = await autoFormatScript(text, settings);
      setText(formattedText);

      const speakerNames = cast.map(c => c.name);
      setDetectedSpeakers(speakerNames);

      const newMapping = { ...settings.speakerMapping };
      
      if (settings.engine === 'COQ' && coquiSpeakers.length > 0) {
          // Coqui mapping logic
          let speakerIdx = 0;
          cast.forEach(char => {
             if(!newMapping[char.name]) {
                 newMapping[char.name] = coquiSpeakers[speakerIdx % coquiSpeakers.length].id;
                 speakerIdx++;
             }
          });
      } else {
          // Gemini mapping logic
          const availableMaleVoices = VOICES.filter(v => v.gender === 'Male');
          const availableFemaleVoices = VOICES.filter(v => v.gender === 'Female');
          
          let maleVoiceIndex = 0;
          let femaleVoiceIndex = 0;

          cast.forEach(char => {
            const existingVoice = getVoiceForCharacter(char.name);
            if (existingVoice) {
            newMapping[char.name] = existingVoice;
            } else {
            const gender = char.gender === 'Male' ? 'Male' : 'Female';
            const accent = char.accent || '';

            const findVoice = (gender: 'Male'|'Female', targetAccent: string) => {
                const pool = gender === 'Male' ? availableMaleVoices : availableFemaleVoices;
                let match = pool.find(v => v.accent.toLowerCase().includes(targetAccent.toLowerCase()) || targetAccent.toLowerCase().includes(v.accent.toLowerCase()));
                if (!match) {
                    const index = gender === 'Male' ? maleVoiceIndex : femaleVoiceIndex;
                    match = pool[index % pool.length];
                    if (gender === 'Male') maleVoiceIndex++; else femaleVoiceIndex++;
                }
                return match;
            };

            const selectedVoice = findVoice(gender, accent);
            const bestVoiceId = selectedVoice.id;
            
            updateCharacter({
                id: `char_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                name: char.name,
                voiceId: bestVoiceId,
                gender: char.gender,
                avatarColor: `hsl(${Math.random() * 360}, 70%, 80%)`
            });
            
            newMapping[char.name] = bestVoiceId;
            }
        });
      }
      
      let musicMsg = "";
      if (suggestedMusicTrackId && suggestedMusicTrackId !== 'm_none') {
          const track = MUSIC_TRACKS.find(t => t.id === suggestedMusicTrackId);
          if (track) {
              setSettings(prev => ({ ...prev, musicTrackId: suggestedMusicTrackId, speakerMapping: newMapping }));
              musicMsg = ` & Auto-selected music: ${track.name}`;
          } else {
              setSettings(prev => ({ ...prev, speakerMapping: newMapping }));
          }
      } else {
          setSettings(prev => ({ ...prev, speakerMapping: newMapping }));
      }

      showToast(`Director Mode: Formatted ${cast.length} characters${musicMsg}`, "success");

    } catch (e: any) {
      console.error("AI Director Failed", e);
      showToast("AI Director failed: " + e.message, "error");
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleCharacterVoiceChange = (charName: string, newVoiceId: string) => {
      setSettings(prev => ({
          ...prev,
          speakerMapping: { ...prev.speakerMapping, [charName]: newVoiceId }
      }));

      const existing = characterLibrary.find(c => c.name === charName);
      if (existing) {
          updateCharacter({ ...existing, voiceId: newVoiceId });
      } else {
          updateCharacter({
              id: `char_${Date.now()}`,
              name: charName,
              voiceId: newVoiceId,
              gender: 'Unknown', 
              avatarColor: '#ddd'
          });
      }
  };

  const handleSaveDraft = () => {
    if (!text.trim()) {
      showToast("Enter text to save", "info");
      return;
    }
    const name = prompt("Enter draft name:", `Draft ${new Date().toLocaleTimeString()}`);
    if (name) {
      saveDraft(name, text, settings);
      showToast("Draft saved!", "success");
    }
  };

  const handleDeleteDraft = (id: string) => {
      if (confirm("Delete this draft?")) {
          deleteDraft(id);
          showToast("Draft deleted", "info");
      }
  };

  // --- UI RENDER HELPERS ---

  const renderSettingsModal = () => {
    if (!showSettings) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Settings className="text-indigo-600" /> Settings & Configuration
            </h2>
            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">

            {/* Audio Engine Section */}
            <section>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Audio Generation Engine</label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div 
                    onClick={() => setSettings(s => ({...s, engine: 'GEM'}))}
                    className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${settings.engine === 'GEM' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                 >
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex items-center gap-2 font-bold text-gray-900">
                          <Sparkles size={20} className={settings.engine === 'GEM' ? "text-indigo-600" : "text-gray-400"} /> 
                          Gemini Cloud
                       </div>
                       {settings.engine === 'GEM' && <CheckCircle2 size={20} className="text-indigo-600" />}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">Fast, high-quality, standard voices. No setup required. Best for general use.</p>
                 </div>

                 <div 
                    onClick={() => setSettings(s => ({...s, engine: 'COQ'}))}
                    className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${settings.engine === 'COQ' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                 >
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex items-center gap-2 font-bold text-gray-900">
                          <Server size={20} className={settings.engine === 'COQ' ? "text-indigo-600" : "text-gray-400"} /> 
                          Coqui (Ngrok)
                       </div>
                       {settings.engine === 'COQ' && <CheckCircle2 size={20} className="text-indigo-600" />}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">Custom models, voice cloning, local execution. Requires Colab backend.</p>
                 </div>
              </div>

              {settings.engine === 'COQ' && (
                 <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-gray-700 mb-2 block">Ngrok Public URL</label>
                    <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="https://xxxx-xx-xx-xx.ngrok-free.app"
                          value={settings.backendUrl}
                          onChange={(e) => setSettings(s => ({...s, backendUrl: e.target.value}))}
                          className="flex-1 p-3 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none text-sm font-mono"
                        />
                        <button 
                            onClick={checkBackendConnection}
                            disabled={isFetchingSpeakers}
                            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isFetchingSpeakers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Test
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                       <AlertCircle size={12} /> Ensure your Google Colab notebook is running and the Ngrok tunnel is active.
                    </p>
                 </div>
              )}
            </section>

            <hr className="border-gray-100" />

            {/* AI Assistant Section */}
            <section>
               <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI Assistant (Text & Director)</label>
                  <span className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded-md font-bold border border-blue-100">
                      Current: {settings.helperProvider}
                  </span>
               </div>
               
               {/* Provider Tabs */}
               <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                  {['GEMINI', 'PERPLEXITY', 'LOCAL'].map((provider) => (
                      <button
                        key={provider}
                        onClick={() => setSettings(s => ({...s, helperProvider: provider as any}))}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${settings.helperProvider === provider ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {provider === 'GEMINI' && <Sparkles size={14} />}
                        {provider === 'PERPLEXITY' && <Globe size={14} />}
                        {provider === 'LOCAL' && <Laptop size={14} />}
                        {provider === 'LOCAL' ? 'Local LLM' : provider.charAt(0) + provider.slice(1).toLowerCase()}
                      </button>
                  ))}
               </div>

               {/* Provider Specific Config */}
               <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    {settings.helperProvider === 'GEMINI' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div className="flex items-center gap-2 text-indigo-600 mb-2">
                                <Sparkles size={18} />
                                <span className="font-bold text-sm">Gemini Configuration</span>
                            </div>
                            <p className="text-xs text-gray-500">
                                Using the system's default Gemini API key. This is the most stable and fastest option for general text generation and script directing.
                            </p>
                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-700 mb-1 block">Custom API Key (Optional)</label>
                                <input 
                                    type="password" 
                                    placeholder="Use default system key"
                                    value={settings.geminiApiKey || ''}
                                    onChange={(e) => setSettings(s => ({...s, geminiApiKey: e.target.value}))}
                                    className="w-full p-3 rounded-xl border border-gray-300 focus:border-indigo-500 outline-none text-sm font-mono"
                                />
                            </div>
                        </div>
                    )}

                    {settings.helperProvider === 'PERPLEXITY' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div className="flex items-center gap-2 text-blue-600 mb-2">
                                <Globe size={18} />
                                <span className="font-bold text-sm">Perplexity Configuration</span>
                            </div>
                            <p className="text-xs text-gray-500">
                                Best for research-heavy scripts and up-to-date information. Requires a Perplexity API Key.
                            </p>
                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-700 mb-1 block">Perplexity API Key</label>
                                <input 
                                    type="password" 
                                    placeholder="pplx-xxxxxxxxxxxxxxxxxxxxxxxx"
                                    value={settings.perplexityApiKey || ''}
                                    onChange={(e) => setSettings(s => ({...s, perplexityApiKey: e.target.value}))}
                                    className="w-full p-3 rounded-xl border border-gray-300 focus:border-blue-500 outline-none text-sm font-mono"
                                />
                            </div>
                        </div>
                    )}

                    {settings.helperProvider === 'LOCAL' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div className="flex items-center gap-2 text-green-600 mb-2">
                                <Laptop size={18} />
                                <span className="font-bold text-sm">Local LLM Configuration</span>
                            </div>
                            <p className="text-xs text-gray-500">
                                Connect to a local OpenAI-compatible server (e.g., LM Studio, Oobabooga, LocalAI).
                            </p>
                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-700 mb-1 block">Server URL</label>
                                <input 
                                    type="text" 
                                    placeholder="http://localhost:1234/v1"
                                    value={settings.localLlmUrl || ''}
                                    onChange={(e) => setSettings(s => ({...s, localLlmUrl: e.target.value}))}
                                    className="w-full p-3 rounded-xl border border-gray-300 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                        </div>
                    )}
               </div>
            </section>

          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-3xl">
               <Button fullWidth onClick={() => { setShowSettings(false); showToast("Configuration saved", "success"); }}>
                   Save Configuration
               </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col h-screen w-full overflow-hidden">
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 z-20 relative shadow-sm">
        <div className="flex items-center gap-3 md:w-64">
          <div className="bg-gradient-to-br from-[#8b5cf6] to-[#6366f1] p-2.5 rounded-xl shadow-lg shadow-indigo-200 text-white">
            <Mic size={20} strokeWidth={3} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none tracking-tight">VoiceFlow</h1>
            <p className="text-gray-500 text-[10px] font-medium mt-0.5">AI Audio Studio</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="hidden md:flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/50">
           {[Tab.STUDIO, Tab.DUBBING, Tab.LAB].map(t => (
             <button
               key={t}
               onClick={() => setActiveTab(t)}
               className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === t ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
             >
               {t === Tab.STUDIO && 'Studio'}
               {t === Tab.DUBBING && 'Video Dub'}
               {t === Tab.LAB && 'Voice Lab'}
             </button>
           ))}
        </div>

        <div className="flex items-center justify-end gap-3 md:w-64">
           
           {/* AI Assistant Status */}
           <button 
             onClick={() => setShowSettings(true)} 
             className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-100 transition-colors"
           >
             {settings.helperProvider === 'PERPLEXITY' ? <Globe size={12} /> : settings.helperProvider === 'LOCAL' ? <Laptop size={12} /> : <Sparkles size={12} />}
             <span>AI ASSISTANT: {settings.helperProvider}</span>
           </button>

           <div className="h-6 w-px bg-gray-200 hidden md:block mx-1"></div>

           <button onClick={() => setShowHistory(!showHistory)} className={`p-2.5 rounded-xl transition-colors relative ${showHistory ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-600'}`}>
             <History size={20} />
             {history.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border border-white"></span>}
           </button>
           <button onClick={() => setShowSettings(true)} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors">
             <Settings size={20} />
           </button>
           <button onClick={() => setScreen(AppScreen.PROFILE)} className="p-1.5 rounded-full hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all ml-1">
             <div className="w-8 h-8 bg-gray-200 rounded-full overflow-hidden border border-white shadow-sm">
                {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <User className="w-full h-full p-1.5 text-gray-500" />}
             </div>
           </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
         {/* Sidebar (Drafts) */}
         <div className={`absolute md:relative z-10 w-72 bg-white border-r border-gray-200 h-full transition-transform duration-300 ${showDrafts ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
               <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wider flex items-center gap-2">
                  <FolderOpen size={14} /> Saved Drafts
               </h3>
               <div className="flex gap-1">
                 <button onClick={() => { setText(''); setSettings(s => ({...s, speakerMapping: {}})); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500" title="New Draft">
                   <FileText size={16} />
                 </button>
               </div>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto h-[calc(100%-60px)] custom-scrollbar">
               {drafts.length === 0 && (
                 <div className="text-center py-10 text-gray-400 text-sm">
                    No saved drafts yet.
                 </div>
               )}
               {drafts.map(draft => (
                 <div key={draft.id} className="group relative p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all cursor-pointer" onClick={() => { setText(draft.text); setSettings(draft.settings); showToast("Draft loaded", "info"); }}>
                    <div className="flex justify-between items-start">
                       <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{draft.name}</h4>
                       <button onClick={(e) => { e.stopPropagation(); handleDeleteDraft(draft.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all">
                          <Trash2 size={14} />
                       </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{draft.text}</p>
                    <span className="text-[10px] text-gray-400 mt-2 block">{new Date(draft.lastModified).toLocaleDateString()}</span>
                 </div>
               ))}
            </div>
         </div>

         {/* Content Area */}
         <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f8fafc] relative w-full">
            
            {/* Mobile Tab Select */}
            <div className="md:hidden px-4 py-2 bg-white border-b border-gray-200 flex overflow-x-auto gap-2 no-scrollbar">
                {[Tab.STUDIO, Tab.DUBBING, Tab.LAB].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${activeTab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 pb-32">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* STUDIO TAB */}
                    {activeTab === Tab.STUDIO && (
                        <>
                         {/* Text Area Card */}
                         <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[500px] md:h-[600px] relative">
                            {/* Toolbar */}
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                               <div className="flex items-center gap-2">
                                  <button onClick={() => insertAtCursor(' [pause] ')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                                     <Clock size={12} /> Pause
                                  </button>
                                  <button onClick={() => insertAtCursor(' (Whispering): ')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                                     <Volume2 size={12} /> Whisper
                                  </button>
                                  <div className="h-4 w-px bg-gray-300 mx-1"></div>
                                  <button onClick={handleAutoCorrect} disabled={isAutoCorrecting} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center gap-1.5">
                                     {isAutoCorrecting ? <Loader2 size={12} className="animate-spin" /> : <SpellCheck size={12} />} Fix Grammar
                                  </button>
                                  
                                  {/* Translation Dropdown */}
                                  <div className="relative">
                                    <button 
                                        onClick={() => setShowTranslateDropdown(!showTranslateDropdown)} 
                                        disabled={isAiWriting}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
                                    >
                                        {isAiWriting ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />} 
                                        Translate
                                    </button>
                                    
                                    {showTranslateDropdown && (
                                        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-20 animate-in fade-in zoom-in-95">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2">Target Language</div>
                                            <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                {['English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese', 'Chinese', 'Russian', 'Portuguese', 'Arabic'].map(lang => (
                                                    <button
                                                        key={lang}
                                                        onClick={() => handleTranslateText(lang)}
                                                        className="text-left px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors flex items-center justify-between"
                                                    >
                                                        {lang}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                  </div>
                               </div>
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase hidden sm:block">
                                     {detectedLang ? `${LANGUAGES.find(l => l.code === detectedLang.toLowerCase())?.name || detectedLang}` : 'Auto-Detect'}
                                  </span>
                               </div>
                            </div>

                            {/* Text Input */}
                            <textarea 
                               ref={textareaRef}
                               value={text}
                               onChange={(e) => setText(e.target.value)}
                               placeholder="Start typing your script, story, or novel here...&#10;&#10;Tip: Click 'AI Director' to automatically adapt novels to scripts, assign voices, and detect emotions."
                               className="flex-1 w-full p-6 resize-none outline-none text-lg text-gray-700 leading-relaxed font-serif placeholder:text-gray-300"
                            />

                            {/* Floating AI Assistant Button */}
                            <div className="absolute bottom-20 right-6 z-20">
                                {/* The Panel */}
                                {showAiAssist && (
                                    <div className="absolute bottom-full right-0 mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden animate-in slide-in-from-bottom-2 zoom-in-95">
                                         <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center">
                                             <div className="flex items-center gap-2 font-bold text-sm">
                                                <Bot size={18} /> AI Writer
                                             </div>
                                             <button onClick={() => setShowAiAssist(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors"><X size={14} /></button>
                                         </div>
                                         <div className="p-4 bg-white space-y-4">
                                             {/* Quick Actions */}
                                             <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => handleAiAssistSubmit("Continue the story naturally")} disabled={isAiWriting} className="text-xs font-medium bg-indigo-50 text-indigo-700 py-2 rounded-lg hover:bg-indigo-100 transition-colors text-center border border-indigo-100">
                                                   Continue Story
                                                </button>
                                                <button onClick={() => handleAiAssistSubmit("Rewrite to be more descriptive")} disabled={isAiWriting} className="text-xs font-medium bg-purple-50 text-purple-700 py-2 rounded-lg hover:bg-purple-100 transition-colors text-center border border-purple-100">
                                                   Make Descriptive
                                                </button>
                                                <button onClick={() => handleAiAssistSubmit("Fix grammar and flow")} disabled={isAiWriting} className="text-xs font-medium bg-green-50 text-green-700 py-2 rounded-lg hover:bg-green-100 transition-colors text-center border border-green-100">
                                                   Fix Flow
                                                </button>
                                                <button onClick={() => handleAiAssistSubmit("Generate dialogue options")} disabled={isAiWriting} className="text-xs font-medium bg-amber-50 text-amber-700 py-2 rounded-lg hover:bg-amber-100 transition-colors text-center border border-amber-100">
                                                   Add Dialogue
                                                </button>
                                             </div>
                                             
                                             {/* Custom Input */}
                                             <div className="relative">
                                                 <input 
                                                    type="text" 
                                                    value={aiAssistPrompt}
                                                    onChange={(e) => setAiAssistPrompt(e.target.value)}
                                                    placeholder="Ask AI to..."
                                                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAiAssistSubmit()}
                                                 />
                                                 <button 
                                                    onClick={() => handleAiAssistSubmit()}
                                                    disabled={!aiAssistPrompt.trim() || isAiWriting}
                                                    className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                                 >
                                                    {isAiWriting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                                 </button>
                                             </div>
                                             <div className="text-[10px] text-gray-400 text-center">
                                                 Powered by {settings.helperProvider}
                                             </div>
                                         </div>
                                    </div>
                                )}

                                {/* The Trigger Button */}
                                <button 
                                    onClick={() => setShowAiAssist(!showAiAssist)}
                                    className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${showAiAssist ? 'bg-gray-800 text-white rotate-45' : 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white'}`}
                                >
                                    {showAiAssist ? <Plus size={24} /> : <Sparkles size={24} />}
                                </button>
                            </div>

                            {/* Bottom Bar */}
                            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between">
                               <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <span>{text.length} chars</span>
                                  <span>•</span>
                                  <span>~{Math.ceil(text.split(' ').length / 150)} min read</span>
                                  {detectedSpeakers.length > 0 && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 text-indigo-500 font-bold"><Users size={12} /> {detectedSpeakers.length} Speakers</span>
                                      </>
                                  )}
                               </div>
                               <div className="flex items-center gap-3">
                                  <button onClick={handleSaveDraft} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all" title="Save Draft">
                                     <Save size={18} />
                                  </button>
                                  <button onClick={handleDownloadScript} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all" title="Download Script">
                                     <Download size={18} />
                                  </button>
                                  <button 
                                    onClick={handleAiDirector}
                                    disabled={isAiWriting} 
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:scale-105 active:scale-95 transition-all disabled:opacity-70"
                                  >
                                     {isAiWriting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                     AI Director
                                  </button>
                               </div>
                            </div>
                         </div>

                         {/* Controls Area */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 duration-500">
                             {/* Voice Selector */}
                             <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 md:col-span-2">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Narrator Voice</h3>
                                    {settings.engine === 'COQ' && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-md font-bold">COQUI ENGINE</span>}
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                    {(settings.engine === 'COQ' ? coquiSpeakers : VOICES).map((v: any) => (
                                        <button
                                            key={v.id}
                                            onClick={() => settings.engine === 'COQ' ? setSettings(s => ({...s, chatterboxId: v.id})) : setSettings(s => ({...s, voiceId: v.id}))}
                                            className={`flex-shrink-0 flex items-center gap-3 p-2 pr-4 rounded-xl border transition-all ${
                                                (settings.engine === 'COQ' ? settings.chatterboxId === v.id : settings.voiceId === v.id)
                                                ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' 
                                                : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${(settings.engine === 'COQ' ? settings.chatterboxId === v.id : settings.voiceId === v.id) ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                {v.name[0]}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-gray-800">{v.name}</div>
                                                <div className="text-[10px] text-gray-500">{v.accent || 'Standard'}</div>
                                            </div>
                                        </button>
                                    ))}
                                    {/* Cloned Voices in List */}
                                    {settings.engine !== 'COQ' && clonedVoices.map(v => (
                                        <button
                                            key={v.id}
                                            onClick={() => setSettings(s => ({...s, voiceId: v.id}))}
                                            className={`flex-shrink-0 flex items-center gap-3 p-2 pr-4 rounded-xl border transition-all ${
                                                settings.voiceId === v.id
                                                ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-200' 
                                                : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center">
                                                <Fingerprint size={18} />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-gray-800">{v.name}</div>
                                                <div className="text-[10px] text-amber-600 font-medium">Cloned</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                             </div>

                             {/* Settings Mini */}
                             <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                                 <div className="flex items-center justify-between">
                                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Emotion</h3>
                                     <span className="text-xs font-medium text-indigo-600">{settings.emotion || 'Neutral'}</span>
                                 </div>
                                 <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                     {EMOTIONS.slice(0, 6).map(e => (
                                         <button 
                                            key={e} 
                                            onClick={() => setSettings(s => ({...s, emotion: e}))}
                                            className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${settings.emotion === e ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'}`}
                                         >
                                             {e}
                                         </button>
                                     ))}
                                     <button onClick={() => setShowSettings(true)} className="px-2 py-1 rounded-md text-[10px] font-bold bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100">More...</button>
                                 </div>
                             </div>
                         </div>

                         {/* Detected Characters Panel (If Multi-Speaker) */}
                         {detectedSpeakers.length > 0 && (
                             <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-4 animate-in fade-in">
                                 <div className="flex items-center justify-between mb-3">
                                     <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                         <Users size={14} /> Cast Configuration
                                     </h3>
                                     <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded-md font-bold">Auto-Mapped</span>
                                 </div>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                     {detectedSpeakers.map(speaker => {
                                         const assignedVoiceId = settings.speakerMapping?.[speaker];
                                         const voiceName = (settings.engine === 'COQ' ? coquiSpeakers : VOICES).find((v: any) => v.id === assignedVoiceId)?.name 
                                                           || clonedVoices.find(v => v.id === assignedVoiceId)?.name 
                                                           || 'Assigning...';
                                         
                                         const charProfile = characterLibrary.find(c => c.name === speaker);
                                         
                                         return (
                                             <div key={speaker} className="bg-white p-3 rounded-xl border border-indigo-100 flex items-center justify-between shadow-sm">
                                                 <div className="flex items-center gap-3">
                                                     <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: charProfile?.avatarColor || '#8b5cf6' }}>
                                                         {speaker[0]}
                                                     </div>
                                                     <div>
                                                         <div className="text-xs font-bold text-gray-800">{speaker}</div>
                                                         <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                                             <Mic size={8} /> {voiceName}
                                                         </div>
                                                     </div>
                                                 </div>
                                                 <select 
                                                    className="text-[10px] font-bold bg-gray-50 border-gray-200 rounded-md py-1 px-1 outline-none focus:ring-1 focus:ring-indigo-300"
                                                    value={assignedVoiceId || ''}
                                                    onChange={(e) => handleCharacterVoiceChange(speaker, e.target.value)}
                                                 >
                                                     {(settings.engine === 'COQ' ? coquiSpeakers : VOICES).map((v: any) => (
                                                         <option key={v.id} value={v.id}>{v.name}</option>
                                                     ))}
                                                 </select>
                                             </div>
                                         )
                                     })}
                                 </div>
                             </div>
                         )}

                         {/* Generated Output */}
                         {generatedAudioUrl && (
                             <div className="mb-24">
                                 <AudioPlayer 
                                    audioUrl={generatedAudioUrl} 
                                    backgroundMusicId={settings.musicTrackId}
                                    initialSpeechVolume={settings.speechVolume}
                                    initialMusicVolume={settings.musicVolume}
                                    audioBuffer={generatedBuffer}
                                    onReset={() => { setGeneratedAudioUrl(null); setGeneratedBuffer(null); }}
                                 />
                             </div>
                         )}
                        </>
                    )}
                    
                    {/* DUBBING TAB */}
                    {activeTab === Tab.DUBBING && (
                        <div className="flex flex-col items-center justify-center py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                            <div className="text-center space-y-2 max-w-lg">
                                <div className="w-16 h-16 bg-pink-100 text-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-pink-100">
                                    <Film size={32} />
                                </div>
                                <h2 className="text-3xl font-bold text-gray-900">AI Video Dubbing</h2>
                                <p className="text-gray-500">Translate and dub videos into any language while preserving the original voice (experimental).</p>
                            </div>

                            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                                {!videoFile ? (
                                    <div className="p-12 border-2 border-dashed border-gray-200 m-4 rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center hover:bg-gray-100 transition-colors cursor-pointer relative">
                                        <input type="file" accept="video/*" onChange={handleVideoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                        <UploadCloud size={48} className="text-gray-300 mb-4" />
                                        <h3 className="text-lg font-bold text-gray-700">Upload a Video</h3>
                                        <p className="text-sm text-gray-400 mt-1">MP4, MOV, WEBM up to 50MB</p>
                                    </div>
                                ) : (
                                    <div className="relative bg-black aspect-video group">
                                        <video 
                                            ref={videoPlayerRef} 
                                            src={videoUrl!} 
                                            className="w-full h-full object-contain"
                                            onTimeUpdate={handleVideoTimeUpdate}
                                            onSeeked={handleVideoSeek}
                                            onEnded={handleVideoEnded}
                                        />
                                        {dubbedAudioUrl && (
                                            <audio ref={audioPlayerRef} src={dubbedAudioUrl} className="hidden" />
                                        )}
                                        
                                        {/* Video Controls Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                            <div className="w-full flex items-center justify-between text-white">
                                                <button onClick={handleDubPlayToggle} className="p-3 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/30 transition-all">
                                                    {isDubPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                                                </button>
                                                {dubbedAudioUrl && (
                                                    <div className="px-3 py-1 bg-green-500/80 backdrop-blur-md rounded-lg text-xs font-bold flex items-center gap-2">
                                                        <CheckCircle2 size={12} /> DUBBED AUDIO ACTIVE
                                                    </div>
                                                )}
                                                <button onClick={() => { setVideoFile(null); setVideoUrl(null); setDubbedAudioUrl(null); }} className="p-2 hover:text-red-400 transition-colors">
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {videoFile && (
                                    <div className="p-6 space-y-6 bg-white">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-gray-500 uppercase">Target Language</label>
                                                <select 
                                                    className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 font-bold text-gray-700 outline-none focus:ring-2 focus:ring-pink-500"
                                                    value={settings.language}
                                                    onChange={(e) => setSettings(s => ({...s, language: e.target.value}))}
                                                >
                                                    <option value="English">English</option>
                                                    <option value="Spanish">Spanish</option>
                                                    <option value="French">French</option>
                                                    <option value="Hindi">Hindi</option>
                                                    <option value="Japanese">Japanese</option>
                                                    <option value="German">German</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                 <label className="text-xs font-bold text-gray-500 uppercase">Original Volume Mix</label>
                                                 <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.1" 
                                                    value={originalVol}
                                                    onChange={(e) => setOriginalVol(parseFloat(e.target.value))}
                                                    className="w-full accent-pink-500"
                                                 />
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                                            <Button variant="primary" onClick={handleDubbing} disabled={isGenerating || !!dubbedAudioUrl} className="bg-pink-600 hover:bg-pink-700 shadow-pink-200">
                                                {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={18} className="mr-2" />}
                                                {dubbedAudioUrl ? 'Dubbing Complete' : 'Generate Dub'}
                                            </Button>
                                            
                                            <Button variant="secondary" onClick={handleCloneFromVideo} disabled={isExtractingVoice}>
                                                 {isExtractingVoice ? <Loader2 className="animate-spin" /> : <Fingerprint size={18} className="mr-2" />}
                                                 Extract Voice Model
                                            </Button>

                                            {dubbedAudioUrl && (
                                                <a href={dubbedAudioUrl} download="dubbed_audio.wav" className="ml-auto">
                                                    <Button variant="outline"><Download size={18} className="mr-2"/> Download Audio</Button>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* LAB TAB */}
                    {activeTab === Tab.LAB && (
                        <div className="py-8 space-y-8 max-w-3xl mx-auto">
                            {/* Mode Switcher */}
                            <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 inline-flex mx-auto">
                                <button 
                                    onClick={() => setLabMode('CLONING')}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${labMode === 'CLONING' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    Voice Cloning
                                </button>
                                <button 
                                    onClick={() => setLabMode('COVERS')}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${labMode === 'COVERS' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    AI Covers
                                </button>
                            </div>

                            {labMode === 'CLONING' && (
                                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-200 animate-in fade-in">
                                    <div className="text-center mb-8">
                                        <h2 className="text-2xl font-bold text-gray-900">Instant Voice Cloning</h2>
                                        <p className="text-gray-500 mt-2">Create a digital replica of any voice from a short sample.</p>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Voice Name</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. My Personal Voice" 
                                                value={cloneName}
                                                onChange={(e) => setCloneName(e.target.value)}
                                                className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 focus:border-indigo-500 outline-none font-bold"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div 
                                                className={`p-6 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${cloneMode === 'record' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                                                onClick={() => setCloneMode('record')}
                                            >
                                                <Mic size={32} className={cloneMode === 'record' ? 'text-indigo-600' : 'text-gray-400'} />
                                                <span className="font-bold text-sm">Record Microphone</span>
                                            </div>
                                            <div 
                                                className={`p-6 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${cloneMode === 'upload' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                                                onClick={() => setCloneMode('upload')}
                                            >
                                                <UploadCloud size={32} className={cloneMode === 'upload' ? 'text-indigo-600' : 'text-gray-400'} />
                                                <span className="font-bold text-sm">Upload Audio</span>
                                            </div>
                                        </div>

                                        {cloneMode === 'upload' && (
                                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 relative">
                                                <input type="file" accept="audio/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setUploadVoiceFile(e.target.files?.[0] || null)} />
                                                {uploadVoiceFile ? (
                                                    <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold">
                                                        <FileAudio /> {uploadVoiceFile.name}
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-400 text-sm">Drag & drop or click to upload a clear sample (10s-30s)</div>
                                                )}
                                            </div>
                                        )}

                                        {cloneMode === 'record' && (
                                           <div className="flex justify-center py-4">
                                               <button 
                                                  onClick={() => setIsRecording(!isRecording)}
                                                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                               >
                                                   {isRecording ? <Square size={32} fill="white" className="text-white" /> : <Mic size={32} className="text-white" />}
                                               </button>
                                           </div>
                                        )}

                                        <Button fullWidth disabled={!cloneName || (cloneMode === 'upload' && !uploadVoiceFile)}>
                                            Create Voice Clone
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {labMode === 'COVERS' && (
                                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-200 animate-in fade-in">
                                     <div className="text-center mb-8">
                                        <div className="inline-block p-3 rounded-full bg-purple-100 text-purple-600 mb-3">
                                            <Music size={32} />
                                        </div>
                                        <h2 className="text-2xl font-bold text-gray-900">AI Song Covers</h2>
                                        <p className="text-gray-500 mt-2">Replace vocals in any song with an AI voice.</p>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="border-2 border-dashed border-purple-200 bg-purple-50/50 rounded-2xl p-8 text-center relative hover:bg-purple-50 transition-colors">
                                            <input type="file" accept="audio/*" onChange={handleSongUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            {!songFile ? (
                                                <>
                                                    <UploadCloud size={48} className="mx-auto text-purple-300 mb-3" />
                                                    <p className="font-bold text-purple-900">Upload Song (MP3/WAV)</p>
                                                </>
                                            ) : (
                                                <div className="font-bold text-purple-700 flex items-center justify-center gap-2">
                                                    <Disc className="animate-spin-slow" /> {songFile.name}
                                                </div>
                                            )}
                                        </div>

                                        {songFile && (
                                            <>
                                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Select Singer</h4>
                                                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                                                        {VOICES.map(v => (
                                                            <button 
                                                                key={v.id}
                                                                onClick={() => setSettings(s => ({...s, voiceId: v.id}))}
                                                                className={`flex-shrink-0 p-3 rounded-xl border text-center min-w-[80px] ${settings.voiceId === v.id ? 'bg-purple-100 border-purple-300 ring-1 ring-purple-300' : 'bg-white border-gray-200'}`}
                                                            >
                                                                <div className="w-8 h-8 rounded-full bg-gray-200 mx-auto mb-2 flex items-center justify-center font-bold text-gray-600">{v.name[0]}</div>
                                                                <div className="text-xs font-bold truncate">{v.name}</div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <Button fullWidth variant="primary" onClick={handleSongCoverGeneration} disabled={isGenerating} className="bg-purple-600 hover:bg-purple-700 shadow-purple-200">
                                                    {isGenerating ? (
                                                        <>
                                                          <Loader2 className="animate-spin mr-2" /> 
                                                          {isExtractingLyrics ? 'Extracting Lyrics...' : 'Synthesizing Vocals...'}
                                                        </>
                                                    ) : 'Generate AI Cover'}
                                                </Button>

                                                {dubbedAudioUrl && (
                                                    <div className="animate-in slide-in-from-bottom-2">
                                                        <AudioPlayer 
                                                            audioUrl={dubbedAudioUrl} 
                                                            onReset={() => setDubbedAudioUrl(null)}
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Generate Button Floating */}
            {activeTab === Tab.STUDIO && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 w-full max-w-md px-4">
                   <div className="bg-white/80 backdrop-blur-lg p-2 rounded-2xl shadow-2xl border border-white/50 flex items-center gap-2">
                      <button 
                        className={`flex-1 py-3.5 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${isGenerating ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] text-white hover:scale-[1.02] active:scale-95 shadow-indigo-300'}`}
                        onClick={handleGenerate}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                            <><Loader2 className="animate-spin" /> Generating...</>
                        ) : (
                            <><Sparkles size={20} fill="white" /> Generate Speech</>
                        )}
                      </button>
                      <button onClick={() => setSettings(s => ({...s, autoEnhance: !s.autoEnhance}))} className={`p-3.5 rounded-xl transition-all ${settings.autoEnhance ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`} title="Auto-Enhance">
                         <Wand2 size={24} />
                      </button>
                   </div>
                   {progress > 0 && progress < 100 && (
                      <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden w-full shadow-sm">
                         <div className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] transition-all duration-300 ease-out" style={{width: `${progress}%`}}></div>
                      </div>
                   )}
                </div>
            )}
         </div>

         {/* Right Sidebar (History) */}
         <div className={`fixed inset-y-0 right-0 z-40 w-80 bg-white shadow-2xl transform transition-transform duration-300 ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
             <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <History size={18} className="text-indigo-600" /> Generation History
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                    <X size={18} />
                </button>
             </div>
             <div className="p-4 space-y-4 overflow-y-auto h-[calc(100vh-60px)] custom-scrollbar bg-[#f8fafc]">
                {history.length === 0 && (
                    <div className="text-center text-gray-400 py-10 text-sm">No generations yet.</div>
                )}
                {history.map(item => (
                    <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{item.voiceName}</span>
                            <span className="text-[10px] text-gray-400">{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 mb-3 font-medium">{item.text}</p>
                        <div className="flex items-center gap-2">
                            <audio src={item.audioUrl} controls className="h-8 w-full" />
                            <a href={item.audioUrl} download={`voiceflow_${item.id}.wav`} className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600" title="Download">
                                <Download size={14} />
                            </a>
                        </div>
                    </div>
                ))}
             </div>
         </div>

      </main>

      {/* Settings Modal */}
      {renderSettingsModal()}

      {/* Ad Modal */}
      <AdModal 
        isOpen={showAdModal} 
        onClose={() => setShowAdModal(false)} 
        onReward={() => { 
            updateStats({ generationsUsed: Math.max(0, stats.generationsUsed - 1) }); 
            setShowAdModal(false); 
            showToast("Reward: +1 Generation added!", "success");
        }} 
      />

      {/* Toast Notification */}
      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}

    </div>
  );
};

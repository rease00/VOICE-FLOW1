
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, RefreshCw, Music, Volume2, AlertCircle } from 'lucide-react';
import { MusicTrack } from '../types';
import { MUSIC_TRACKS } from '../constants';
import { Visualizer } from './Visualizer';

interface AudioPlayerProps {
  audioUrl: string | null;
  backgroundMusicId?: string;
  initialSpeechVolume?: number;
  initialMusicVolume?: number;
  onReset: () => void;
  audioBuffer?: AudioBuffer | null;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  audioUrl, 
  backgroundMusicId,
  initialSpeechVolume = 1.0,
  initialMusicVolume = 0.3,
  onReset,
  audioBuffer
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speechVol, setSpeechVol] = useState(initialSpeechVolume);
  const [musicVol, setMusicVol] = useState(initialMusicVolume);
  const [showMixer, setShowMixer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speechRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const musicTrack = MUSIC_TRACKS.find(m => m.id === backgroundMusicId);
  const hasMusic = musicTrack && musicTrack.url !== '';

  // --- MIXING & SYNC LOGIC ---
  useEffect(() => {
    const speech = speechRef.current;
    const music = musicRef.current;
    
    if (!speech) return;

    const syncPlay = () => {
      if (music && hasMusic) {
         music.play().catch(() => {}); // Ignore abort errors
      }
      setIsPlaying(true);
    };

    const syncPause = () => {
      if (music) music.pause();
      setIsPlaying(false);
    };
    
    const syncWaiting = () => {
      if (music) music.pause();
    };
    
    const syncSeeked = () => {
       // When speech is seeked, restart music or just play if speech is playing
       // Ideally music loops background so exact time sync isn't required, just play/pause state
       if (!speech.paused && music && hasMusic) {
          music.play().catch(() => {});
       }
    };

    speech.addEventListener('play', syncPlay);
    speech.addEventListener('pause', syncPause);
    speech.addEventListener('waiting', syncWaiting);
    speech.addEventListener('playing', syncPlay);
    speech.addEventListener('seeked', syncSeeked);
    speech.addEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(100);
        if (music) music.pause();
        setTimeout(() => setProgress(0), 500);
    });

    return () => {
       speech.removeEventListener('play', syncPlay);
       speech.removeEventListener('pause', syncPause);
       speech.removeEventListener('waiting', syncWaiting);
       speech.removeEventListener('playing', syncPlay);
       speech.removeEventListener('seeked', syncSeeked);
    };
  }, [hasMusic, audioUrl]);

  // --- VISUALIZER SETUP ---
  useEffect(() => {
    if (audioUrl && speechRef.current) {
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
      }

      const ctx = audioContextRef.current;

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      }

      if (!sourceNodeRef.current && speechRef.current) {
        try {
            const source = ctx.createMediaElementSource(speechRef.current);
            sourceNodeRef.current = source;
            if (analyserRef.current) {
                source.connect(analyserRef.current);
            }
        } catch (e) {
            console.warn("Media source already connected:", e);
        }
      }
    }
  }, [audioUrl]);

  useEffect(() => {
    if (speechRef.current) speechRef.current.volume = speechVol;
  }, [speechVol]);

  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = musicVol;
      musicRef.current.loop = true;
    }
  }, [musicTrack, musicVol]);

  useEffect(() => {
    setError(null);
    setIsPlaying(false);
    setProgress(0);
  }, [audioUrl]);

  const togglePlay = async () => {
    if (!speechRef.current || !audioUrl) return;
    setError(null);
    
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume().catch(console.warn);
    }

    if (isPlaying) {
      speechRef.current.pause(); // Sync effect triggers music pause
    } else {
      try {
        if (musicRef.current && hasMusic) {
          // Reset music to start if at beginning
          if(speechRef.current.currentTime === 0) musicRef.current.currentTime = 0;
        }
        await speechRef.current.play();
        // Sync effect triggers music play
      } catch (e: any) {
        console.error("Playback error:", e);
        setIsPlaying(false);
        setError("Unable to play audio. Please check your device settings.");
      }
    }
  };

  const handleTimeUpdate = () => {
    if (speechRef.current) {
      const current = speechRef.current.currentTime;
      const duration = speechRef.current.duration || 1;
      setProgress((current / duration) * 100);
    }
  };

  const handleSpeechError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    console.error("Speech audio source error:", e);
    setIsPlaying(false);
    setError("Failed to load generated audio.");
  };

  if (!audioUrl) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-5 w-full animate-in slide-in-from-bottom-4 fade-in duration-300">
      <audio
        ref={speechRef}
        src={audioUrl}
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onError={handleSpeechError}
      />
      {hasMusic && (
        <audio 
          ref={musicRef}
          src={musicTrack.url}
          crossOrigin="anonymous"
        />
      )}
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Generated Audio</h3>
        <div className="flex gap-2">
           {hasMusic && (
             <button 
               onClick={() => setShowMixer(!showMixer)}
               className={`p-2 rounded-full transition-colors ${showMixer ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
               title="Audio Mixer"
             >
               <Volume2 size={18} />
             </button>
           )}

          <a 
            href={audioUrl} 
            download="voiceflow-output.wav"
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Download"
          >
            <Download size={18} />
          </a>
          <button 
            onClick={onReset}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Generate New"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2 mb-4">
           <AlertCircle size={16} className="mt-0.5 shrink-0" />
           <span>{error}</span>
        </div>
      )}

      {showMixer && hasMusic && (
        <div className="bg-gray-50 p-3 rounded-xl mb-4 border border-gray-100 animate-in slide-in-from-top-2">
           <div className="space-y-3">
              <div className="flex items-center gap-3">
                 <span className="text-xs font-bold text-gray-500 w-12">Voice</span>
                 <input 
                   type="range" 
                   min="0" max="1" step="0.1" 
                   value={speechVol} 
                   onChange={(e) => setSpeechVol(parseFloat(e.target.value))}
                   className="flex-1 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6]"
                 />
              </div>
              <div className="flex items-center gap-3">
                 <span className="text-xs font-bold text-gray-500 w-12">Music</span>
                 <input 
                   type="range" 
                   min="0" max="1" step="0.1" 
                   value={musicVol} 
                   onChange={(e) => setMusicVol(parseFloat(e.target.value))}
                   className="flex-1 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6]"
                 />
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
         <Visualizer 
           audioBuffer={audioBuffer || null} 
           isPlaying={isPlaying} 
           currentTime={0}
           analyser={analyserRef.current || undefined}
         />

        <div className="flex items-center gap-4">
            <button 
            onClick={togglePlay}
            className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 ${error ? 'bg-gray-400 cursor-not-allowed shadow-none' : 'bg-[#8b5cf6] hover:bg-[#7c3aed] shadow-indigo-200'}`}
            disabled={!!error}
            >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>

            <div className="flex-1">
                <div className={`w-full h-1 rounded-full overflow-hidden relative ${error ? 'bg-gray-100' : 'bg-gray-200 cursor-pointer'}`} onClick={(e) => {
                    if(!speechRef.current || error) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    speechRef.current.currentTime = pos * speechRef.current.duration;
                }}>
                    <div 
                        className={`absolute top-0 left-0 h-full transition-all duration-100 ${error ? 'bg-gray-400' : 'bg-[#8b5cf6]'}`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-2">
                    <span>{speechRef.current ? formatTime(speechRef.current.currentTime) : '0:00'}</span>
                    <span>{speechRef.current && !isNaN(speechRef.current.duration) ? formatTime(speechRef.current.duration) : '--:--'}</span>
                </div>
            </div>
        </div>
      </div>

      {hasMusic && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
           <Music size={12} />
           <span>Playing with: {musicTrack.name}</span>
        </div>
      )}
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

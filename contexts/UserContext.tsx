
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { UserStats, UserContextType, UserProfile, HistoryItem, ClonedVoice, Draft, GenerationSettings, CharacterProfile } from '../types';
import { INITIAL_STATS } from '../constants';
import { supabase } from '../services/supabaseClient';

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [user, setUser] = useState<UserProfile>({ name: '', email: '', googleId: '' });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [characterLibrary, setCharacterLibrary] = useState<CharacterProfile[]>([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Persistent Guest Data
  const guestUser: UserProfile = {
    name: 'Guest Artist',
    email: 'guest@voiceflow.ai',
    googleId: 'guest_mode'
  };

  useEffect(() => {
    const loadJSON = (key: string, fallback: any) => {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
      } catch (e) { return fallback; }
    };

    // Restore Guest Session immediately if flag is set
    const isGuest = localStorage.getItem('vf_is_guest') === 'true';
    if (isGuest) {
      setUser(guestUser);
    }

    setClonedVoices(loadJSON('vf_clones', []));
    setDrafts(loadJSON('vf_drafts', []));
    setCharacterLibrary(loadJSON('vf_character_lib', []));
    setHistory(loadJSON('vf_history', []).map((item: any) => ({
        ...item, 
        audioUrl: item.audioUrl?.startsWith('blob:') ? '' : item.audioUrl 
    })));
    
    const storedStats = loadJSON('vf_stats', INITIAL_STATS);
    if (storedStats.lastResetDate !== new Date().toDateString() && !storedStats.isPremium) {
       storedStats.generationsUsed = 0;
       storedStats.lastResetDate = new Date().toDateString();
    }
    setStats(storedStats);

    // Supabase Auth Listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        mapSessionToUser(session);
        localStorage.removeItem('vf_is_guest'); // Clear guest if real user found
      } else if (isGuest) {
        // Re-affirm guest status if no session found (prevents overwrite)
        setUser(guestUser);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        mapSessionToUser(session);
        localStorage.removeItem('vf_is_guest');
      } else {
        // Only clear user if not in guest mode
        if (localStorage.getItem('vf_is_guest') !== 'true') {
           setUser({ name: '', email: '', googleId: '' });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const mapSessionToUser = (session: any) => {
    if (session?.user) {
      setUser({
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
        email: session.user.email || '',
        googleId: session.user.id,
        avatarUrl: session.user.user_metadata?.avatar_url
      });
    }
  };

  const safeSetItem = (key: string, value: any) => {
    try {
      const cache = new Set();
      const json = JSON.stringify(value, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (cache.has(v)) return;
          cache.add(v);
        }
        return v;
      });
      localStorage.setItem(key, json);
    } catch (e) {}
  };

  useEffect(() => { safeSetItem('vf_stats', stats); }, [stats]);
  useEffect(() => { safeSetItem('vf_history', history); }, [history]);
  useEffect(() => { safeSetItem('vf_clones', clonedVoices); }, [clonedVoices]);
  useEffect(() => { safeSetItem('vf_drafts', drafts); }, [drafts]);
  useEffect(() => { safeSetItem('vf_character_lib', characterLibrary); }, [characterLibrary]);

  const loginAsGuest = () => {
    localStorage.setItem('vf_is_guest', 'true');
    setUser(guestUser);
  };

  const deleteAccount = async () => {
    setStats(INITIAL_STATS);
    setUser({ name: '', email: '', googleId: '' });
    setHistory([]);
    setClonedVoices([]);
    setDrafts([]);
    
    localStorage.clear(); // Wipe everything
    await supabase.auth.signOut();
  };

  return (
    <UserContext.Provider value={{ 
      user, updateUser: (u) => setUser(p => ({...p, ...u})),
      stats, updateStats: (s) => setStats(p => ({...p, ...s})),
      history, addToHistory: (h) => setHistory(p => [h, ...p]), clearHistory: () => { setHistory([]); localStorage.removeItem('vf_history'); },
      deleteAccount,
      clonedVoices, addClonedVoice: (v) => setClonedVoices(p => [v, ...p]),
      drafts, saveDraft: (n, t, s) => setDrafts(p => [{id: Date.now().toString(), name: n, text: t, settings: s, lastModified: Date.now()}, ...p]), deleteDraft: (id) => setDrafts(p => p.filter(d => d.id !== id)),
      showSubscriptionModal, setShowSubscriptionModal,
      watchAd: async () => { if(stats.generationsUsed > 0) setStats(p => ({...p, generationsUsed: p.generationsUsed - 1})); },
      characterLibrary, updateCharacter: (c) => setCharacterLibrary(p => { const i = p.findIndex(x => x.name === c.name); if(i>=0) { const n=[...p]; n[i]={...n[i], ...c}; return n; } return [...p, c]; }),
      getVoiceForCharacter: (n) => characterLibrary.find(c => c.name.toLowerCase() === n.toLowerCase())?.voiceId,
      loginAsGuest
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};


import { VoiceOption, UserStats, MusicTrack, Language } from './types';

export const VOICES: VoiceOption[] = [
  {
    id: 'v1',
    name: 'David',
    gender: 'Male',
    accent: 'American English',
    geminiVoiceName: 'Fenrir' 
  },
  {
    id: 'v2',
    name: 'Sarah',
    gender: 'Female',
    accent: 'American English',
    geminiVoiceName: 'Kore'
  },
  {
    id: 'v3',
    name: 'Michael',
    gender: 'Male',
    accent: 'British English',
    geminiVoiceName: 'Puck'
  },
  {
    id: 'v4',
    name: 'Emily',
    gender: 'Female',
    accent: 'British English',
    geminiVoiceName: 'Charon'
  },
  {
    id: 'v5',
    name: 'James',
    gender: 'Male',
    accent: 'Australian English',
    geminiVoiceName: 'Zephyr'
  }
];

export const LANGUAGES = [
  { code: 'en', name: Language.ENGLISH },
  { code: 'es', name: Language.SPANISH },
  { code: 'fr', name: Language.FRENCH },
  { code: 'de', name: Language.GERMAN },
  { code: 'hi', name: Language.HINDI },
  { code: 'ja', name: Language.JAPANESE },
  { code: 'zh', name: Language.CHINESE },
  { code: 'ar', name: Language.ARABIC },
  { code: 'ru', name: Language.RUSSIAN },
  { code: 'pt', name: Language.PORTUGUESE },
];

export const EMOTIONS = [
  // Universal / Basic
  'Neutral',
  'Happy',
  'Sad',
  'Angry',
  'Excited',
  'Calm',
  'Fearful',
  'Surprised',
  
  // Vocal Styles
  'Whispering',
  'Shouting',
  'Mumbling',
  'Breathless',
  
  // Complex / Nuanced
  'Contemplative',
  'Annoyed',
  'Defensive',
  'Frustrated',
  'Realizing',
  'Playful',
  'Laughing',
  'Wise',
  'Curious',
  'Genuine',
  'Reflective',
  'Nostalgic',
  'Thoughtful',
  'Agreeing',
  'Sarcastic',
  'Hopeful',
  'Desperate',
  'Proud',
  'Guilty',
  'Embarrassed',
  'Grateful',
  'Confident',
  'Hesitant',
  'Loving',
  'Romantic',
  'Teasing',
  'Sympathetic',
  'Disappointed',
  'Urgent',

  // Dramatic / Hindi Context (Navarasa inspired)
  'Heroic (Veera)',
  'Sorrowful (Karuna)',
  'Terrified (Bhayanaka)',
  'Disgusted (Bibhatsa)',
  'Wonderstruck (Adbhuta)',
  'Peaceful (Shanta)',
  'Amused (Hasya)',
  'Furious (Raudra)',
  'Romantic (Shringara)',
  'Devotional (Bhakti)',
  'Melodramatic',
  'Pleading',
  'Stern',
  'Authoritative',
  'Drunken',
  'Sleepy'
];

// Using cleaner URLs or placeholders where direct Pixabay links are unreliable
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'm_none',
    name: 'No Background Music',
    url: '',
    category: 'Calm'
  },
  {
    id: 'm_lofi',
    name: 'Lo-Fi Chill',
    url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3', 
    category: 'Lo-Fi'
  },
  {
    id: 'm_cinematic',
    name: 'Cinematic Ambient',
    url: 'https://cdn.pixabay.com/audio/2022/03/24/audio_c8c8a73467.mp3',
    category: 'Cinematic'
  },
  {
    id: 'm_upbeat',
    name: 'Corporate Upbeat',
    url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3',
    category: 'Upbeat'
  },
  {
    id: 'm_calm',
    name: 'Gentle Piano',
    url: 'https://cdn.pixabay.com/audio/2022/02/07/audio_1b9756c286.mp3',
    category: 'Calm'
  },
  {
    id: 'm_suspense',
    name: 'Dark Suspense',
    url: 'https://cdn.pixabay.com/audio/2022/11/02/audio_6f62574d89.mp3',
    category: 'Cinematic'
  },
  {
    id: 'm_happy',
    name: 'Happy Acoustic',
    url: 'https://cdn.pixabay.com/audio/2023/01/04/audio_9c80d7c449.mp3',
    category: 'Upbeat'
  }
];

export const INITIAL_STATS: UserStats = {
  generationsUsed: 0,
  generationsLimit: 5,
  isPremium: false,
  planName: 'Free'
};

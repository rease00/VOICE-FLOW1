
import React, { useState } from 'react';
import { ArrowLeft, User, Crown, Clock, Zap, Shield, CreditCard, LogOut, ChevronRight, Trash2, Download, Eye, Lock, AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { AppScreen } from '../types';
import { useUser } from '../contexts/UserContext';
import { Button } from '../components/Button';
import { supabase } from '../services/supabaseClient';

interface ProfileProps {
  setScreen: (screen: AppScreen) => void;
}

type ProfileView = 'MAIN' | 'PRIVACY';

export const Profile: React.FC<ProfileProps> = ({ setScreen }) => {
  const { stats, user, history, drafts, setShowSubscriptionModal, clearHistory, deleteAccount } = useUser();
  const [currentView, setCurrentView] = useState<ProfileView>('MAIN');

  const handleSignOut = async () => {
      await supabase.auth.signOut();
      setScreen(AppScreen.LOGIN);
  };

  const PrivacySettings = () => {
    const [exporting, setExporting] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
    const [publicProfile, setPublicProfile] = useState(false);

    const handleExport = () => {
      setExporting(true);
      setTimeout(() => {
          try {
            const exportData = {
              userProfile: user,
              stats: stats,
              historyCount: history.length,
              savedDrafts: drafts,
              exportedAt: new Date().toISOString()
            };
            
            const cache = new Set();
            const jsonString = JSON.stringify(exportData, (key, value) => {
               if (typeof value === 'object' && value !== null) {
                  if (cache.has(value)) return;
                  cache.add(value);
                  // Safe check for DOM nodes or React internals
                  if (value instanceof Node || key.startsWith('_react') || key === 'stateNode') return undefined;
               }
               return value;
            }, 2);
            
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `voiceflow_data_${Date.now()}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            
            alert("Your data has been exported successfully.");
          } catch (e) {
            console.error("Export failed", e);
            alert("Export failed. Some data might be corrupted or contain invalid references.");
          } finally {
            setExporting(false);
          }
      }, 1500);
    };

    const handleDeleteAccount = () => {
        const confirm1 = confirm("Are you sure you want to delete your account? This action cannot be undone.");
        if(confirm1) {
            const confirm2 = confirm("All your generations, cloned voices, and drafts will be permanently lost. Continue?");
            if (confirm2) {
                deleteAccount();
                setScreen(AppScreen.ONBOARDING);
            }
        }
    };

    return (
      <div className="animate-in slide-in-from-right duration-300 bg-gray-50 min-h-screen">
          <div className="bg-white sticky top-0 z-10 border-b border-gray-200 shadow-sm">
              <div className="max-w-3xl mx-auto w-full p-4 flex items-center gap-4">
              <button 
                  onClick={() => setCurrentView('MAIN')}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
              >
                  <ArrowLeft size={22} />
              </button>
              <h1 className="text-lg font-bold text-gray-900">Privacy & Security</h1>
              </div>
          </div>

          <div className="p-4 pb-24 max-w-md mx-auto space-y-8 mt-4">
              
              {/* Data Management */}
              <section className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Data Management</h3>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <button onClick={handleExport} disabled={exporting} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 group">
                          <div className="flex items-center gap-4">
                              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform"><Download size={20} /></div>
                              <div className="text-left">
                                  <span className="block font-bold text-gray-800 text-sm">Export Personal Data</span>
                                  <span className="block text-xs text-gray-500 mt-0.5">Download a JSON copy of your profile & drafts</span>
                              </div>
                          </div>
                          {exporting ? (
                             <span className="text-xs font-medium text-indigo-600 animate-pulse">Exporting...</span>
                          ) : (
                             <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-400" />
                          )}
                      </button>
                       <button onClick={() => { if(confirm("Clear all generation history from this device?")) { clearHistory(); alert("History cleared."); } }} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group">
                          <div className="flex items-center gap-4">
                              <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 group-hover:scale-110 transition-transform"><Trash2 size={20} /></div>
                              <div className="text-left">
                                  <span className="block font-bold text-gray-800 text-sm">Clear History</span>
                                  <span className="block text-xs text-gray-500 mt-0.5">Remove all local generation logs</span>
                              </div>
                          </div>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-orange-400" />
                      </button>
                  </div>
              </section>

              {/* Privacy Preferences */}
              <section className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Privacy Preferences</h3>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-5 space-y-6">
                      <div className="flex items-center justify-between">
                          <div className="flex gap-4">
                              <div className="mt-1"><Eye size={20} className="text-gray-400" /></div>
                              <div>
                                  <span className="block font-bold text-gray-800 text-sm">Public Profile</span>
                                  <span className="block text-xs text-gray-500 mt-0.5">Make your cloned voices discoverable</span>
                              </div>
                          </div>
                          <button 
                              onClick={() => setPublicProfile(!publicProfile)}
                              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${publicProfile ? 'bg-indigo-500' : 'bg-gray-200'}`}
                          >
                              <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${publicProfile ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                      </div>
                       <div className="flex items-center justify-between">
                          <div className="flex gap-4">
                              <div className="mt-1"><Shield size={20} className="text-gray-400" /></div>
                              <div>
                                  <span className="block font-bold text-gray-800 text-sm">Analytics</span>
                                  <span className="block text-xs text-gray-500 mt-0.5">Share anonymous usage statistics</span>
                              </div>
                          </div>
                          <button 
                              onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${analyticsEnabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
                          >
                              <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${analyticsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                      </div>
                  </div>
              </section>

              {/* Security */}
              <section className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Security</h3>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-5">
                      <div className="flex items-center gap-2 mb-4">
                          <Lock size={18} className="text-indigo-600" />
                          <span className="font-bold text-gray-800 text-sm">Authentication Method</span>
                      </div>
                       <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                                {user.googleId ? (
                                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                ) : (
                                  <Mail size={20} className="text-gray-600" />
                                )}
                              </div>
                              <div>
                                <span className="block text-sm font-semibold text-gray-700">{user.googleId ? 'Google Account' : 'Email Account'}</span>
                                <span className="block text-xs text-gray-400">{user.email}</span>
                              </div>
                          </div>
                          <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                             <CheckCircle2 size={12} />
                             <span className="text-[10px] font-bold uppercase">Active</span>
                          </div>
                       </div>
                       <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                           Your credentials and session are managed securely by Supabase Auth.
                       </p>
                  </div>
              </section>

               {/* Danger Zone */}
              <section className="pt-6">
                   <div className="bg-red-50 rounded-2xl border border-red-100 p-5 transition-colors hover:bg-red-50/80">
                      <div className="flex items-start gap-4 mb-4">
                          <div className="bg-red-100 p-2 rounded-lg">
                            <AlertTriangle className="text-red-500" size={20} />
                          </div>
                          <div>
                              <h4 className="text-sm font-bold text-red-900">Delete Account</h4>
                              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                                  Permanently remove your account, all cloned voices, generation history, and personal settings. This cannot be recovered.
                              </p>
                          </div>
                      </div>
                      <button 
                          onClick={handleDeleteAccount}
                          className="w-full py-3 bg-white border-2 border-red-100 text-red-600 font-bold rounded-xl text-sm hover:bg-red-50 hover:border-red-200 transition-all shadow-sm active:scale-[0.99]"
                      >
                          Permanently Delete Account
                      </button>
                   </div>
              </section>

          </div>
      </div>
    );
  };

  if (currentView === 'PRIVACY') {
    return <PrivacySettings />;
  }

  return (
    <div className="min-h-screen bg-gray-50 w-full flex flex-col relative animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto w-full p-4 flex items-center gap-4">
          <button 
            onClick={() => setScreen(AppScreen.MAIN)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-gray-900">My Profile</h1>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24 flex justify-center items-start">
        <div className="w-full max-w-md space-y-6">
          
          {/* User Info Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-4 relative overflow-hidden">
                {user.avatarUrl ? (
                   <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                   <User size={48} className="text-[#8b5cf6]" />
                )}
                <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-white ${stats.isPremium ? 'bg-amber-400' : 'bg-green-500'}`}></div>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{user.name || 'User'}</h2>
            <p className="text-gray-500 text-sm">{user.email}</p>
            
            <div className={`mt-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide ${stats.isPremium ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
              {stats.planName} Plan
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:shadow-md transition-shadow">
                <Clock className="text-orange-500" size={24} />
                <span className="text-2xl font-bold text-gray-900">
                  {stats.isPremium ? '∞' : Math.max(0, stats.generationsLimit - stats.generationsUsed)}
                </span>
                <span className="text-xs text-gray-500 font-medium">Remaining</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:shadow-md transition-shadow">
                <Zap className="text-amber-500" size={24} />
                <span className="text-2xl font-bold text-gray-900">{stats.generationsUsed}</span>
                <span className="text-xs text-gray-500 font-medium">Used (Session)</span>
            </div>
          </div>

          {/* Premium Banner */}
          {!stats.isPremium && (
            <div className="bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] p-5 rounded-2xl text-white relative overflow-hidden shadow-lg shadow-indigo-200 transform hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => setShowSubscriptionModal(true)}>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                    <Crown size={20} fill="white" />
                    <h3 className="font-bold">Upgrade to Pro</h3>
                </div>
                <p className="text-indigo-100 text-sm mb-4 opacity-90">
                  Get unlimited generations, premium voices, and priority support.
                </p>
                <button 
                  className="bg-white text-[#6366f1] py-2 px-4 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-50 transition-colors"
                >
                  View Plans
                </button>
              </div>
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white opacity-10 rounded-full"></div>
              <div className="absolute top-0 right-12 w-12 h-12 bg-white opacity-10 rounded-full"></div>
            </div>
          )}

          {/* Menu Options */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <MenuItem 
              icon={<CreditCard size={18} />} 
              label="Billing & Subscription" 
              onClick={() => setShowSubscriptionModal(true)}
              />
            <div className="h-px bg-gray-50 mx-4"></div>
            <MenuItem 
              icon={<Shield size={18} />} 
              label="Privacy & Security" 
              onClick={() => setCurrentView('PRIVACY')} 
            />
            <div className="h-px bg-gray-50 mx-4"></div>
            <MenuItem icon={<LogOut size={18} className="text-red-500" />} label="Sign Out" onClick={handleSignOut} isDestructive />
          </div>

          <div className="text-center text-xs text-gray-400 pt-4">
            Version 1.2.0 • Security Updated
          </div>

        </div>
      </div>
    </div>
  );
};

const MenuItem = ({ icon, label, onClick, isDestructive = false }: { icon: React.ReactNode, label: string, onClick?: () => void, isDestructive?: boolean }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group"
  >
     <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg transition-colors ${isDestructive ? 'bg-red-50 text-red-500 group-hover:bg-red-100' : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'}`}>
          {icon}
        </div>
        <span className={`font-medium ${isDestructive ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
     </div>
     <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
  </button>
);

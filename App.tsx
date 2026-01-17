
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from './types';
import { LoginSimulator } from './components/LoginSimulator';
import { RoleNavbar, TabType } from './components/RoleNavbar';
import { Dashboard } from './components/Dashboard';

import { SCHEMA_TABLES, FULL_JSON_MODEL, SUPABASE_SQL_SCRIPT } from './constants';
import { SchemaNode } from './components/SchemaNode';
import { JsonViewer } from './components/JsonViewer';
import { AiAssistant } from './components/AiAssistant';
import { ArchitectureView } from './components/ArchitectureView';
import { ConfigEditor } from './components/ConfigEditor';
import { CourseManager } from './components/CourseManager';
import { GeneralActivityManager } from './components/GeneralActivityManager'; 
import { ParticipantManager } from './components/ParticipantManager';
import { AdvisorManager } from './components/AdvisorManager'; 
import { PostgraduateManager, PublicActaVerification } from './components/PostgraduateManager'; 
import { AdvisoryManager, PublicVerification } from './components/AdvisoryManager';
import { StudentSignature } from './components/StudentSignature'; 
import { CertificateVerification } from './components/CertificateVerification'; 
import { ReportManager } from './components/ReportManager'; 
import { DatabaseCleaner } from './components/DatabaseCleaner'; 
import { TMSManager } from './components/TMSManager'; 
import { PassportVerification } from './components/PassportVerification';
import { DataProvider, useData } from './context/DataContext';
import { checkConnection, supabase } from './services/supabaseClient'; 

const TABLE_COLORS = [
  'bg-[#647FBC]', 
  'bg-[#91ADC8]', 
  'bg-[#AED6CF]', 
  'bg-slate-600'  
];

interface ChatMessage {
    from: string; 
    fromName: string;
    to: string; 
    text: string;
    timestamp: number;
}

const MainContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { resetData, error } = useData();
  
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [connectionMsg, setConnectionMsg] = useState('');

  const [signatureParams, setSignatureParams] = useState<{eid: string, sid: string} | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [actaVerificationCode, setActaVerificationCode] = useState<string | null>(null);
  const [certVerificationCode, setCertVerificationCode] = useState<string | null>(null); 
  const [passportCode, setPassportCode] = useState<string | null>(null);

  const [onlinePeers, setOnlinePeers] = useState<{rut: string, names: string, photoUrl: string}[]>([]);
  const channelRef = useRef<any>(null);
  
  const [activeChatPeer, setActiveChatPeer] = useState<{rut: string, names: string, photoUrl?: string} | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<Record<string, number>>({}); 
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeChatPeer]);

  useEffect(() => {
      const verify = async () => {
          const result = await checkConnection();
          if (result.success) {
              setConnectionStatus('connected');
          } else {
              setConnectionStatus('error');
              setConnectionMsg(result.message || 'Error desconocido');
          }
      };
      verify();

      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      
      if (mode === 'sign') {
          const eid = params.get('eid'); 
          const sid = params.get('sid'); 
          if (eid && sid) setSignatureParams({ eid, sid });
      } else if (mode === 'verify') {
          const code = params.get('code');
          if (code) setVerificationCode(code);
      } else if (mode === 'verify_acta') {
          const code = params.get('code');
          if (code) setActaVerificationCode(code);
      } else if (mode === 'verify_cert') { 
          const code = params.get('code');
          if (code) setCertVerificationCode(code);
      } else if (mode === 'verify_passport') {
          const code = params.get('code');
          if (code) setPassportCode(code);
      }

  }, []);

  useEffect(() => {
      if (!user || user.systemRole !== UserRole.ASESOR) {
          setOnlinePeers([]);
          return;
      }

      const channel = supabase.channel('online-advisors', {
          config: {
              presence: {
                  key: user.rut,
              },
          },
      });

      channelRef.current = channel;

      channel
          .on('presence', { event: 'sync' }, () => {
              const newState = channel.presenceState();
              const peers: any[] = [];
              
              for (let key in newState) {
                  if (newState[key].length > 0) {
                      const peerData = newState[key][0]; 
                      if (peerData.rut !== user.rut) {
                          peers.push(peerData);
                      }
                  }
              }
              setOnlinePeers(peers);
          })
          .on('broadcast', { event: 'private_msg' }, (payload: any) => {
              const msg: ChatMessage = payload.payload;
              if (msg.to === user.rut) {
                  setChatMessages(prev => [...prev, msg]);
                  if (!activeChatPeer || activeChatPeer.rut !== msg.from) {
                      setUnreadFrom(prev => ({
                          ...prev,
                          [msg.from]: (prev[msg.from] || 0) + 1
                      }));
                  }
              }
          })
          .subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                  await channel.track({
                      rut: user.rut,
                      names: user.names,
                      photoUrl: user.photoUrl,
                      role: user.systemRole
                  });
              }
          });

      return () => {
          supabase.removeChannel(channel);
          channelRef.current = null;
      };
  }, [user, activeChatPeer]);

  const sendMessage = (text: string) => {
      if (!user || !activeChatPeer || !channelRef.current || !text.trim()) return;

      const newMsg: ChatMessage = {
          from: user.rut,
          fromName: user.names,
          to: activeChatPeer.rut,
          text: text.trim(),
          timestamp: Date.now()
      };

      channelRef.current.send({
          type: 'broadcast',
          event: 'private_msg',
          payload: newMsg
      });

      setChatMessages(prev => [...prev, newMsg]);
  };

  const handleOpenChat = (peer: {rut: string, names: string, photoUrl?: string}) => {
      setActiveChatPeer(peer);
      setUnreadFrom(prev => {
          const next = { ...prev };
          delete next[peer.rut];
          return next;
      });
  };

  const handleTabChange = (newTab: TabType) => {
      const isPostgraduateDirty = (window as any).isPostgraduateDirty;
      const isAdvisoryDirty = (window as any).isAdvisoryDirty;

      if ((activeTab === 'postgraduate' && isPostgraduateDirty) || 
          (activeTab === 'advisory' && isAdvisoryDirty)) {
          window.dispatchEvent(new CustomEvent('app-nav-attempt', { detail: newTab }));
          return;
      }
      setActiveTab(newTab);
  };

  useEffect(() => {
    const handleForceNav = (e: any) => {
        setActiveTab(e.detail);
    };
    window.addEventListener('force-nav', handleForceNav);
    return () => window.removeEventListener('force-nav', handleForceNav);
  }, []);

  if (signatureParams) {
      return <StudentSignature enrollmentId={signatureParams.eid} sessionId={signatureParams.sid} />;
  }

  if (verificationCode) {
      return <PublicVerification code={verificationCode} />;
  }

  if (actaVerificationCode) {
      return <PublicActaVerification code={actaVerificationCode} />;
  }

  if (certVerificationCode) {
      return <CertificateVerification code={certVerificationCode} />;
  }

  if (passportCode) {
      return <PassportVerification code={passportCode} />;
  }

  const handleLogout = () => {
    setUser(null);
    setActiveTab('dashboard');
  };

  if (error && (error.includes("infinite recursion") || error.includes("42P17"))) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-50 p-6 animate-fadeIn">
              <div className="bg-white rounded-xl shadow-2xl border-l-8 border-red-600 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-8 pb-4">
                      <h1 className="text-3xl font-bold text-red-700 flex items-center gap-3">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Error Crítico de Base de Datos
                      </h1>
                      <p className="text-slate-600 mt-2 text-lg">
                          Se ha detectado un conflicto de <strong>Recursión Infinita</strong> en las políticas de seguridad de Supabase.
                      </p>
                  </div>
                  
                  <div className="px-8 py-4 bg-slate-50 border-y border-slate-200">
                      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-2">Instrucciones de Solución:</h3>
                      <ol className="list-decimal pl-5 space-y-2 text-slate-700 text-sm">
                          <li>Copia el siguiente Script SQL "Nuclear" (botón abajo).</li>
                          <li>Ve al <strong>SQL Editor</strong> en tu proyecto de Supabase.</li>
                          <li>Pega el código y ejecútalo. Esto limpiará todas las políticas conflictivas.</li>
                          <li>Recarga esta página.</li>
                      </ol>
                  </div>

                  <div className="flex-1 overflow-hidden relative bg-[#1e293b]">
                      <div className="absolute top-2 right-2 z-10">
                          <button 
                              onClick={() => navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold text-sm shadow-lg transition-colors flex items-center gap-2"
                          >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                              Copiar SQL de Reparación
                          </button>
                      </div>
                      <pre className="p-6 text-xs font-mono text-blue-200 overflow-auto custom-scrollbar h-full">
                          {SUPABASE_SQL_SCRIPT}
                      </pre>
                  </div>
              </div>
          </div>
      );
  }

  if (!user) {
    return (
        <>
            {connectionStatus === 'error' && (
                <div className="bg-red-600 text-white text-xs py-2 px-4 text-center font-bold relative z-50">
                    ⚠️ Error de Conexión a Supabase: {connectionMsg}
                </div>
            )}
            <LoginSimulator onLogin={setUser} />
        </>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} onNavigate={handleTabChange} />;
      
      case 'courses':
        return <CourseManager currentUser={user} />; 
      
      case 'generalActivities':
        return <GeneralActivityManager currentUser={user} />;

      case 'postgraduate':
        return <PostgraduateManager currentUser={user} />;

      case 'advisory':
        return <AdvisoryManager currentUser={user} />;

      case 'participants':
        return <ParticipantManager />;

      case 'dbCleaner':
        return <DatabaseCleaner />;
      
      case 'advisors':
        return <AdvisorManager currentUser={user} />;
      
      case 'reports':
        return <ReportManager />;
      
      case 'tms':
        return <TMSManager />;

      case 'config':
        return <ConfigEditor />;

      case 'arch':
        return <ArchitectureView />;

      case 'erd':
      case 'json':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fadeIn">
                <div className="xl:col-span-2 space-y-6">
                    {activeTab === 'erd' && (
                    <div className="space-y-8">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-slate-800">Diagrama Entidad-Relación</h2>
                            <span className="bg-[#91ADC8] text-white text-xs px-2 py-1 rounded font-mono font-bold">Vista Conceptual</span>
                        </div>
                        <div className="relative p-8 bg-white/50 rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                            {SCHEMA_TABLES.map((table, idx) => (
                                <div key={table.tableName} className="flex justify-center">
                                    <SchemaNode table={table} colorClass={TABLE_COLORS[idx % TABLE_COLORS.length]} />
                                </div>
                            ))}
                            </div>
                        </div>
                    </div>
                    )}
                    {activeTab === 'json' && (
                    <div className="h-[600px]">
                        <h2 className="text-2xl font-bold text-slate-800 mb-6">Modelo de Datos Generado</h2>
                        <JsonViewer data={FULL_JSON_MODEL} title="modelo_completo_export.json" />
                    </div>
                    )}
                </div>
                <div className="xl:col-span-1 space-y-6">
                    <AiAssistant />
                </div>
            </div>
        );

      default:
        return <div>Vista no encontrada</div>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-slate-900 font-sans pb-10">
      <RoleNavbar 
        user={user} 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        onLogout={handleLogout} 
        unreadMessagesRuts={Object.keys(unreadFrom)}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {renderContent()}
        <div className="fixed bottom-6 left-6 z-50 flex items-end gap-3 animate-fadeIn">
            <div className="relative group">
                <div className={`absolute -inset-1 rounded-full border-4 ${connectionStatus === 'error' ? 'border-red-500/60' : 'border-green-500/60'} animate-pulse`}></div>
                <div className={`absolute inset-0 rounded-full border-4 ${connectionStatus === 'error' ? 'border-red-500' : 'border-green-500'}`}></div>
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-xl bg-slate-200">
                    {user.photoUrl ? (
                        <img src={user.photoUrl} alt={user.names} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                             <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        </div>
                    )}
                </div>
            </div>
            {user.systemRole === UserRole.ASESOR && onlinePeers.length > 0 && (
                <div className="flex -space-x-3 items-center pb-1">
                    {onlinePeers.map((peer) => {
                        const count = unreadFrom[peer.rut] || 0;
                        return (
                        <div key={peer.rut} className="relative group/peer cursor-pointer" onClick={() => handleOpenChat(peer)}>
                            {/* BURBUJA DE DIÁLOGO PARA MENSAJES NO LEÍDOS */}
                            {count > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[60] animate-bounce pointer-events-auto">
                                    <div className="bg-indigo-600 border-2 border-white rounded-2xl px-4 py-2 shadow-2xl whitespace-nowrap">
                                        <p className="text-[10px] font-black text-white uppercase tracking-wider">
                                            Tienes {count} {count === 1 ? 'mensaje' : 'mensajes'}
                                        </p>
                                    </div>
                                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-indigo-600 mx-auto -mt-0.5"></div>
                                </div>
                            )}

                            <div className={`w-10 h-10 rounded-full border-2 shadow-md bg-slate-200 overflow-hidden relative z-10 hover:z-20 transition-all hover:scale-110 active:scale-95 ${count > 0 ? 'border-indigo-600 ring-4 ring-indigo-200 animate-pulse' : 'border-white'}`}>
                                {peer.photoUrl ? (
                                    <img src={peer.photoUrl} alt={peer.names} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-500 text-xs font-bold">
                                        {peer.names.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div className="absolute w-3 h-3 bg-green-500 border-2 border-white rounded-full bottom-0 right-0 z-20"></div>
                        </div>
                    )})}
                </div>
            )}
        </div>

        {activeChatPeer && (
            <div className="fixed bottom-16 right-6 w-80 h-96 bg-white rounded-t-2xl shadow-2xl border border-slate-200 flex flex-col z-[100] animate-fadeInUp">
                <div className="bg-[#647FBC] p-3 text-white flex justify-between items-center rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/20 overflow-hidden border border-white/30">
                            {activeChatPeer.photoUrl ? (
                                <img src={activeChatPeer.photoUrl} alt={activeChatPeer.names} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">{activeChatPeer.names.charAt(0)}</div>
                            )}
                        </div>
                        <div className="leading-tight">
                            <p className="text-xs font-bold truncate w-40">{activeChatPeer.names}</p>
                            <p className="text-[9px] text-blue-100 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> en línea
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setActiveChatPeer(null)} className="hover:bg-white/10 p-1 rounded transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F9F8F6] custom-scrollbar">
                    {chatMessages
                        .filter(m => (m.from === user.rut && m.to === activeChatPeer.rut) || (m.from === activeChatPeer.rut && m.to === user.rut))
                        .map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.from === user.rut ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs shadow-sm ${
                                    msg.from === user.rut 
                                        ? 'bg-[#647FBC] text-white rounded-tr-none' 
                                        : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                                }`}>
                                    {msg.text}
                                </div>
                                <span className="text-[8px] text-slate-400 mt-1 uppercase font-bold">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    <div ref={chatEndRef} />
                </div>
                <form 
                    onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
                        if (input.value.trim()) {
                            sendMessage(input.value);
                            input.value = '';
                        }
                    }}
                    className="p-3 bg-white border-t border-slate-100 flex gap-2"
                >
                    <input 
                        name="msg"
                        type="text" 
                        autoComplete="off"
                        placeholder="Escribe un mensaje..."
                        className="flex-1 text-xs border border-slate-200 rounded-full px-4 py-2 focus:ring-2 focus:ring-[#647FBC] focus:border-transparent outline-none bg-slate-50"
                    />
                    <button type="submit" className="bg-[#647FBC] text-white p-2 rounded-full hover:bg-blue-800 transition-colors shadow-md">
                        <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                    </button>
                </form>
            </div>
        )}

        <div className="fixed bottom-4 right-4">
             <button onClick={resetData} className="bg-[#91ADC8] hover:bg-slate-600 text-white text-xs px-3 py-1 rounded-full shadow-lg border border-white transition-colors opacity-70 hover:opacity-100">
                Reiniciar Datos (Debug)
             </button>
        </div>
      </main>
    </div>
  );
}

const App: React.FC = () => {
  return (
    <DataProvider>
      <MainContent />
    </DataProvider>
  );
};

export default App;

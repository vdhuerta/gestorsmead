import React, { useState } from 'react';
import { User } from './types';
import { LoginSimulator } from './components/LoginSimulator';
import { RoleNavbar, TabType } from './components/RoleNavbar';
import { Dashboard } from './components/Dashboard';

import { SCHEMA_TABLES, FULL_JSON_MODEL } from './constants';
import { SchemaNode } from './components/SchemaNode';
import { JsonViewer } from './components/JsonViewer';
import { AiAssistant } from './components/AiAssistant';
import { ArchitectureView } from './components/ArchitectureView';
import { ConfigEditor } from './components/ConfigEditor';
// Update import
import { CourseManager } from './components/CourseManager';
import { GeneralActivityManager } from './components/GeneralActivityManager'; // Nuevo Componente
import { ParticipantManager } from './components/ParticipantManager';
import { AdvisorManager } from './components/AdvisorManager'; // Nuevo Componente
import { DataProvider, useData } from './context/DataContext';

// Color Mapping for Visuals - Updated to New Institutional Palette
const TABLE_COLORS = [
  'bg-[#647FBC]', // Azul Acero
  'bg-[#91ADC8]', // Azul Grisáceo
  'bg-[#AED6CF]', // Verde Agua Suave
  'bg-slate-600'  // Neutro
];

const MainContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { resetData } = useData();

  const handleLogout = () => {
    setUser(null);
    setActiveTab('dashboard');
  };

  // 1. Si no hay usuario, mostrar Login
  if (!user) {
    return <LoginSimulator onLogin={setUser} />;
  }

  // 2. Renderizado condicional del contenido principal
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} />;
      
      case 'courses':
        // Gestion Cursos Académicos
        return <CourseManager currentUser={user} />; 
      
      case 'generalActivities':
        // Nueva Gestión de Charlas/Talleres
        return <GeneralActivityManager currentUser={user} />;

      case 'participants':
        return <ParticipantManager />;
      
      case 'advisors':
        return <AdvisorManager />;
      
      case 'config':
        return <ConfigEditor />;

      case 'arch':
        return <ArchitectureView />;

      case 'erd':
      case 'json':
        // ERD View Logic reuse
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
                            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                            
                            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                            {SCHEMA_TABLES.map((table, idx) => (
                                <div key={table.tableName} className="flex justify-center">
                                    <SchemaNode table={table} colorClass={TABLE_COLORS[idx % TABLE_COLORS.length]} />
                                </div>
                            ))}
                             <svg className="absolute inset-0 pointer-events-none hidden md:block w-full h-full overflow-visible opacity-20">
                                <path d="M 300 150 C 450 150, 450 400, 300 450" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="5,5" />
                                <path d="M 600 150 C 500 150, 500 400, 600 450" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="5,5" />
                            </svg>
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

                {/* Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    <AiAssistant />
                    <div className="bg-[#647FBC] text-white p-6 rounded-xl shadow-lg">
                        <h3 className="text-lg font-bold text-white mb-3">Restricciones del Modelo</h3>
                        <ul className="space-y-3 text-sm">
                            <li className="flex items-start gap-2"><span className="text-[#AED6CF] font-bold mt-0.5">✓</span><span><strong>RUT</strong> identificador único.</span></li>
                            <li className="flex items-start gap-2"><span className="text-[#AED6CF] font-bold mt-0.5">✓</span><span>Relación N:M Usuarios-Actividades.</span></li>
                        </ul>
                    </div>
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
        onTabChange={setActiveTab} 
        onLogout={handleLogout} 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {renderContent()}

        {/* FLOATING USER AVATAR (BOTTOM LEFT) */}
        <div className="fixed bottom-6 left-6 z-50 group flex items-center gap-3 animate-fadeIn">
            <div className="relative">
                {/* Pulse Animation Ring (Thicker, On/Off effect) */}
                <div className="absolute -inset-1 rounded-full border-4 border-green-500/60 animate-pulse"></div>
                {/* Static Ring (Thicker) */}
                <div className="absolute inset-0 rounded-full border-4 border-green-500"></div>
                
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
            
            {/* Tooltip / Name Label */}
            <div className="hidden group-hover:block bg-slate-800 text-white text-xs py-1 px-3 rounded shadow-lg transition-opacity whitespace-nowrap">
                <p className="font-bold">{user.names}</p>
                <p className="text-[10px] text-green-400">● En Línea</p>
            </div>
        </div>


        {/* Debug / Reset Button */}
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

import React from 'react';
import { UserRole, User } from '../types';

export type TabType = 'dashboard' | 'erd' | 'json' | 'arch' | 'config' | 'courses' | 'generalActivities' | 'participants' | 'advisors';

interface NavItem {
  id: TabType;
  label: string;
  allowedRoles: UserRole[];
  icon?: React.ReactNode; 
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Inicio', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR, UserRole.ESTUDIANTE] },
  { id: 'participants', label: 'Base Maestra Estudiantes', allowedRoles: [UserRole.ADMIN] }, 
  { id: 'advisors', label: 'Gestión Asesores', allowedRoles: [UserRole.ADMIN] }, 
  { id: 'courses', label: 'Gestión Cursos', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] },
  { id: 'generalActivities', label: 'Gestión Actividades', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] }, 
  { 
    id: 'config', 
    label: 'Configuración', 
    allowedRoles: [UserRole.ADMIN],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Configuración Global</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  { 
    id: 'erd', 
    label: 'Modelo ER', 
    allowedRoles: [UserRole.ADMIN, UserRole.ASESOR],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Modelo Entidad-Relación</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    )
  }, 
  { 
    id: 'arch', 
    label: 'Arquitectura', 
    allowedRoles: [UserRole.ADMIN],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Arquitectura Técnica</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  }, 
];

interface RoleNavbarProps {
  user: User;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
}

export const RoleNavbar: React.FC<RoleNavbarProps> = ({ user, activeTab, onTabChange, onLogout }) => {
  const availableTabs = NAV_ITEMS.filter(item => item.allowedRoles.includes(user.systemRole));

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          <div className="flex items-center gap-3">
            <div className="bg-transparent rounded-lg">
              <img 
                src="https://github.com/vdhuerta/assets-aplications/blob/main/Logo_SMEAD.png?raw=true" 
                alt="Logo SMEAD" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-none hidden sm:block">GestorSMEAD</h1>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full w-fit mt-0.5 ${
                  user.systemRole === UserRole.ADMIN ? 'bg-blue-50 text-blue-600' : 
                  user.systemRole === UserRole.ASESOR ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'
              }`}>
                {user.systemRole}
              </span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
            {availableTabs.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center ${
                  activeTab === tab.id 
                    ? 'bg-[#647FBC] text-white shadow-md' 
                    : 'text-slate-500 hover:text-[#647FBC] hover:bg-[#647FBC]/10'
                }`}
              >
                {tab.icon ? tab.icon : tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-700">{user.names}</p>
                <p className="text-[10px] text-slate-400">Sesión Activa</p>
            </div>
            <button 
                onClick={onLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Cerrar Sesión"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </button>
          </div>
        </div>
        
        <div className="md:hidden flex overflow-x-auto pb-3 gap-2 scrollbar-hide pt-1">
            {availableTabs.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border flex items-center justify-center ${
                  activeTab === tab.id 
                    ? 'bg-[#647FBC] text-white border-[#647FBC]' 
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {tab.icon ? tab.icon : tab.label}
              </button>
            ))}
        </div>
      </div>
    </header>
  );
};

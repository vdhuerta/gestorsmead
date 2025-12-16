
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext';

export type TabType = 'dashboard' | 'erd' | 'json' | 'arch' | 'config' | 'courses' | 'generalActivities' | 'postgraduate' | 'advisory' | 'participants' | 'advisors';

interface NavItem {
  id: TabType;
  label: string;
  allowedRoles: UserRole[];
  icon?: React.ReactNode; 
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Inicio', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR, UserRole.ESTUDIANTE] },
  { id: 'participants', label: 'Base Maestra', allowedRoles: [UserRole.ADMIN] }, 
  { id: 'advisors', label: 'Gestión Asesores', allowedRoles: [UserRole.ADMIN] }, 
  { id: 'courses', label: 'Gestión Cursos', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] },
  { id: 'generalActivities', label: 'Gestión Actividades', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] }, 
  { id: 'postgraduate', label: 'Postítulos', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] }, 
  { id: 'advisory', label: 'Asesorías', allowedRoles: [UserRole.ASESOR] }, 
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
    allowedRoles: [UserRole.ASESOR], 
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
    allowedRoles: [], 
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Arquitectura Técnica</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 01-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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

// --- COMPONENTE INTERNO DE NOTIFICACIONES (ASESOR) ---
const NotificationDropdown: React.FC = () => {
    const { activities, enrollments } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const notifications = useMemo(() => {
        const list: { type: 'course'|'general'|'postgrad'|'advisory', title: string, subtitle: string, urgency: 'high'|'medium'|'info', date: string }[] = [];
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Helper para diferencia de días
        const getDaysDiff = (dateStr: string) => {
            if (!dateStr) return -999;
            const target = new Date(dateStr);
            const diffTime = target.getTime() - today.getTime();
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        };

        activities.forEach(act => {
            // 1. CURSOS PRONTO A CERRAR (0 a 5 días)
            if (act.category === 'ACADEMIC' && act.endDate) {
                const diff = getDaysDiff(act.endDate);
                if (diff >= 0 && diff <= 5) {
                    list.push({
                        type: 'course',
                        title: 'Cierre de Curso Próximo',
                        subtitle: `${act.name} cierra en ${diff === 0 ? 'hoy' : diff + ' días'}.`,
                        urgency: diff <= 2 ? 'high' : 'medium',
                        date: act.endDate
                    });
                }
            }

            // 2. ACTIVIDAD GENERAL (Pronto a iniciar - Simulamos "Hoy" como 30 min antes)
            if (act.category === 'GENERAL' && act.startDate) {
                if (act.startDate === todayStr) {
                    list.push({
                        type: 'general',
                        title: 'Actividad por Iniciar',
                        subtitle: `"${act.name}" comienza hoy.`,
                        urgency: 'high',
                        date: act.startDate
                    });
                }
            }

            // 3. POSTITULOS (Módulo cerrando en <= 3 días)
            if (act.category === 'POSTGRADUATE' && act.programConfig?.modules) {
                act.programConfig.modules.forEach(mod => {
                    if (mod.endDate) {
                        const diff = getDaysDiff(mod.endDate);
                        if (diff >= 0 && diff <= 3) {
                            list.push({
                                type: 'postgrad',
                                title: 'Cierre de Módulo Postítulo',
                                subtitle: `${mod.name} (${act.name}) finaliza pronto.`,
                                urgency: diff <= 1 ? 'high' : 'medium',
                                date: mod.endDate
                            });
                        }
                    }
                });
            }
        });

        // 4. ASESORIA CERRADA SATISFACTORIAMENTE (Hoy)
        // Buscamos en los logs de sesión que estén verificados y tengan fecha de hoy (simulado con date del log)
        enrollments.forEach(enr => {
            if (enr.sessionLogs) {
                enr.sessionLogs.forEach(log => {
                    if (log.verified && log.date === todayStr) {
                        list.push({
                            type: 'advisory',
                            title: 'Asesoría Realizada',
                            subtitle: `Sesión completada con éxito.`,
                            urgency: 'info',
                            date: log.date
                        });
                    }
                });
            }
        });

        return list.sort((a, b) => (a.urgency === 'high' ? -1 : 1));
    }, [activities, enrollments]);

    const getIcon = (type: string) => {
        switch(type) {
            case 'course': return <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
            case 'general': return <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            case 'postgrad': return <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
            case 'advisory': return <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
            default: return <div className="w-2 h-2 rounded-full bg-slate-400"></div>;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`p-2 rounded-full transition-colors relative ${isOpen ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-[#647FBC] hover:bg-slate-50'}`}
                title="Mensajería y Alertas"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
                {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-12 right-0 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fadeIn">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm">Centro de Notificaciones</h3>
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{notifications.length} Nuevas</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-xs">
                                No hay alertas pendientes por el momento.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map((notif, idx) => (
                                    <div key={idx} className={`p-4 hover:bg-slate-50 transition-colors ${notif.urgency === 'high' ? 'bg-red-50/30' : ''}`}>
                                        <div className="flex gap-3">
                                            <div className="mt-1 flex-shrink-0">
                                                {getIcon(notif.type)}
                                            </div>
                                            <div>
                                                <h4 className={`text-xs font-bold ${notif.urgency === 'high' ? 'text-red-600' : 'text-slate-700'}`}>
                                                    {notif.title}
                                                </h4>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                                    {notif.subtitle}
                                                </p>
                                                <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                                                    {notif.date}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-50 p-2 text-center border-t border-slate-100">
                        <button onClick={() => setIsOpen(false)} className="text-[10px] text-[#647FBC] font-bold hover:underline">
                            Cerrar Panel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const RoleNavbar: React.FC<RoleNavbarProps> = ({ user, activeTab, onTabChange, onLogout }) => {
  const availableTabs = NAV_ITEMS.filter(item => item.allowedRoles.includes(user.systemRole));

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          <div className="flex items-center gap-3">
            <div className="bg-transparent rounded-lg">
              <img 
                src="https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Logo_SMEAD.png" 
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
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center ${
                  activeTab === tab.id 
                    ? 'bg-[#647FBC] text-white shadow-md' 
                    : 'text-slate-500 hover:text-[#647FBC] hover:bg-[#647FBC]/10'
                }`}
              >
                {tab.icon ? tab.icon : tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            
            {/* NEW: NOTIFICATION CENTER FOR ADVISORS */}
            {user.systemRole === UserRole.ASESOR && (
                <NotificationDropdown />
            )}

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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserRole, User, ActivityState } from '../types';
import { useData } from '../context/DataContext';
// @ts-ignore
import { utils, writeFile } from 'xlsx';

export type TabType = 'dashboard' | 'erd' | 'json' | 'arch' | 'config' | 'courses' | 'generalActivities' | 'postgraduate' | 'advisory' | 'participants' | 'advisors' | 'reports' | 'dbCleaner';

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
  { id: 'advisory', label: 'Asesorías', allowedRoles: [UserRole.ADMIN, UserRole.ASESOR] }, 
  { 
    id: 'dbCleaner', 
    label: 'Base de Datos', 
    allowedRoles: [UserRole.ADMIN, UserRole.ASESOR],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Limpieza de Base de Datos</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    )
  },
  { 
    id: 'reports', 
    label: 'Informes', 
    allowedRoles: [UserRole.ADMIN, UserRole.ASESOR],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <title>Informes y Reportes</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
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
    allowedRoles: [], 
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  }, 
];

// --- COMPONENTE DE DESCARGA DE PLANTILLAS (ASESOR) ---
const TemplateDownloadDropdown: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDownload = () => {
        const headers = ["RUT", "Nombre", "Apellido Paterno", "Apellido Materno", "Correo", "Teléfono", "Rol", "Facultad", "Departamento", "Carrera", "Contrato", "Semestre Docente", "Sede"];
        const worksheet = utils.aoa_to_sheet([headers]);
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, worksheet, "Plantilla");
        writeFile(workbook, "Plantilla de Subida de Datos.xlsx");
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`p-2 rounded-full transition-colors relative ${isOpen ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-50'}`}
                title="Descargar Plantillas de Subida"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-12 right-0 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fadeIn">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700 text-sm">Plantillas Disponibles</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Formato Excel .xlsx</p>
                    </div>
                    <div className="p-2">
                        <button 
                            onClick={handleDownload}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-50 transition-colors text-left border border-transparent hover:border-emerald-100 group"
                        >
                            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="block text-xs font-bold text-slate-700 truncate">Plantilla de Subida de Datos</span>
                                <span className="block text-[10px] text-slate-400">13 columnas requeridas</span>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- COMPONENTE INTERNO DE NOTIFICACIONES (ASESOR) ---
const NotificationDropdown: React.FC<{ unreadMessagesRuts: string[] }> = ({ unreadMessagesRuts }) => {
    const { activities, enrollments, users, config } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
        const list: { type: 'course-closing'|'course-active'|'chat'|'kpi-risk'|'kpi-critical'|'advisory', title: string, subtitle: string, urgency: 'high'|'medium'|'info', date?: string }[] = [];
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // 1. CHAT - Mensajes sin leer
        unreadMessagesRuts.forEach(rut => {
            const sender = users.find(u => u.rut === rut);
            list.push({
                type: 'chat',
                title: 'Nuevo Mensaje de Chat',
                subtitle: `${sender?.names || 'Compañero'} te ha enviado un mensaje privado.`,
                urgency: 'high'
            });
        });

        // 2. CURSOS - Cierres Proximos (Cuenta Regresiva 5 dias)
        activities.forEach(act => {
            if (act.endDate) {
                const end = new Date(act.endDate + 'T12:00:00');
                const diffTime = end.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 0 && diffDays <= 5) {
                    list.push({
                        type: 'course-closing',
                        title: '⚠️ Cierre de Curso Próximo',
                        subtitle: `"${act.name}" finaliza en ${diffDays === 0 ? 'HOY' : diffDays + ' días'}.`,
                        urgency: diffDays <= 2 ? 'high' : 'medium',
                        date: act.endDate
                    });
                }

                // Cursos abiertos HOY
                if (act.startDate && act.startDate <= todayStr && act.endDate >= todayStr) {
                    list.push({
                        type: 'course-active',
                        title: '📚 Curso en Ejecución',
                        subtitle: `"${act.name}" se encuentra activo actualmente.`,
                        urgency: 'info',
                        date: act.startDate
                    });
                }
            }
        });

        // 3. KPIs - Alumnos en Riesgo & Cursos Críticos
        const minGrade = config.minPassingGrade || 4.0;
        const minAtt = config.minAttendancePercentage || 75;

        // Cursos Críticos (< 5 alumnos)
        activities.filter(a => a.category === 'ACADEMIC' && a.year === today.getFullYear()).forEach(act => {
            const count = enrollments.filter(e => e.activityId === act.id).length;
            if (count > 0 && count < 5) {
                list.push({
                    type: 'kpi-critical',
                    title: '📉 Curso con Baja Matrícula',
                    subtitle: `"${act.name}" solo tiene ${count} inscritos. Requiere gestión.`,
                    urgency: 'medium'
                });
            }
        });

        // Alumnos en Riesgo (Análisis de Matrícula)
        const atRiskCount = enrollments.filter(e => {
            const isFailingGrade = e.finalGrade !== undefined && e.finalGrade > 0 && e.finalGrade < minGrade;
            const isFailingAttendance = e.attendancePercentage !== undefined && e.attendancePercentage > 0 && e.attendancePercentage < minAtt;
            return isFailingGrade || isFailingAttendance;
        }).length;

        if (atRiskCount > 0) {
            list.push({
                type: 'kpi-risk',
                title: '🚨 Alerta de Rendimiento',
                subtitle: `Hay ${atRiskCount} alumnos en riesgo académico (nota/asistencia) para revisar.`,
                urgency: 'high'
            });
        }

        return list.sort((a, b) => {
            const priority = { 'high': 0, 'medium': 1, 'info': 2 };
            return priority[a.urgency] - priority[b.urgency];
        });
    }, [activities, enrollments, unreadMessagesRuts, config, users]);

    const getIcon = (type: string) => {
        switch(type) {
            case 'chat': return <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div>;
            case 'course-closing': return <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>;
            case 'course-active': return <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>;
            case 'kpi-risk': return <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>;
            case 'kpi-critical': return <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></div>;
            default: return <div className="w-8 h-8 rounded-full bg-slate-100"></div>;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`p-2 rounded-full transition-all relative ${isOpen ? 'bg-indigo-100 text-indigo-600 scale-110 shadow-inner' : 'text-slate-400 hover:text-[#647FBC] hover:bg-slate-50'}`}
                title="Mensajería y Alertas"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full text-[9px] text-white font-bold flex items-center justify-center animate-bounce">
                        {notifications.length}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-12 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fadeInUp">
                    <div className="bg-[#647FBC] px-4 py-4 flex justify-between items-center text-white">
                        <div>
                            <h3 className="font-bold text-sm">Centro de Notificaciones</h3>
                            <p className="text-[10px] opacity-80 uppercase font-bold tracking-widest">Resumen de Gestión Hoy</p>
                        </div>
                        <span className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold">{notifications.length} Alertas</span>
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar bg-[#F9F8F6]">
                        {notifications.length === 0 ? (
                            <div className="p-10 text-center flex flex-col items-center gap-2">
                                <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                <p className="text-xs text-slate-400 font-medium">Todo al día, Asesor.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {notifications.map((notif, idx) => (
                                    <div key={idx} className={`p-4 transition-colors hover:bg-white ${notif.urgency === 'high' ? 'bg-red-50/20' : ''}`}>
                                        <div className="flex gap-4">
                                            <div className="flex-shrink-0 mt-0.5">
                                                {getIcon(notif.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-xs font-bold leading-tight ${notif.urgency === 'high' ? 'text-red-700' : 'text-slate-800'}`}>
                                                    {notif.title}
                                                </h4>
                                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                                    {notif.subtitle}
                                                </p>
                                                {notif.date && (
                                                    <span className="text-[9px] font-mono text-indigo-400 mt-2 block font-bold">
                                                        VENCIMIENTO: {notif.date}
                                                    </span>
                                                )}
                                            </div>
                                            {notif.urgency === 'high' && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1"></div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white p-3 text-center border-t border-slate-100">
                        <button onClick={() => setIsOpen(false)} className="text-[10px] text-[#647FBC] font-black uppercase tracking-widest hover:underline transition-all">
                            Cerrar Panel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const RoleNavbar: React.FC<RoleNavbarProps> = ({ user, activeTab, onTabChange, onLogout, unreadMessagesRuts = [] }) => {
  const availableTabs = useMemo(() => {
    return NAV_ITEMS.filter(item => item.allowedRoles.includes(user.systemRole)).map(item => {
      // REQUERIMIENTO: Nombre Dashboard en lugar de Inicio para Estudiante
      if (item.id === 'dashboard' && user.systemRole === UserRole.ESTUDIANTE) {
        return { ...item, label: 'Dashboard' };
      }
      return item;
    });
  }, [user.systemRole]);

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
            
            {/* HERRAMIENTA DE PLANTILLAS (SOLO ASESORES) */}
            {user.systemRole === UserRole.ASESOR && (
                <TemplateDownloadDropdown />
            )}

            {/* NOTIFICACIONES (SOLO ASESORES) */}
            {user.systemRole === UserRole.ASESOR && (
                <NotificationDropdown unreadMessagesRuts={unreadMessagesRuts} />
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

interface RoleNavbarProps {
  user: User;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
  unreadMessagesRuts?: string[];
}
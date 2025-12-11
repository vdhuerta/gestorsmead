import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Enrollment, User, UserRole, Activity, SessionLog } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
import { supabase } from '../services/supabaseClient';

// ID Constante para la actividad contenedora de todas las asesorías del año
const ADVISORY_ACTIVITY_ID = `ADVISORY-GENERAL-${new Date().getFullYear()}`;

// Utility
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

interface AdvisoryManagerProps {
    currentUser?: User;
}

export const AdvisoryManager: React.FC<AdvisoryManagerProps> = ({ currentUser }) => {
    const { enrollments, users, addActivity, activities, upsertUsers, enrollUser, updateEnrollment, deleteEnrollment, getUser, config } = useData();
    
    // Listas dinámicas
    const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
    const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
    const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
    const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
    const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
    const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

    // Estados de Vista
    const [view, setView] = useState<'list' | 'manage'>('list');
    const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
    
    // Estados de Buscador Rápido (Quick Search)
    const [searchRut, setSearchRut] = useState('');
    const [searchSurname, setSearchSurname] = useState('');
    const [rutSuggestions, setRutSuggestions] = useState<{enrollmentId: string, user: User}[]>([]);
    const [surnameSuggestions, setSurnameSuggestions] = useState<{enrollmentId: string, user: User}[]>([]);

    // Estados de Formulario de Ingreso (13 Campos)
    const [enrollForm, setEnrollForm] = useState({
        rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
        academicRole: '', faculty: '', department: '', career: '', contractType: '',
        teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
    });
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollMsg, setEnrollMsg] = useState<{ type: 'success'|'error', text: string } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // --- STATES PARA FIRMA DIGITAL REAL ---
    const [signatureStep, setSignatureStep] = useState<'form' | 'qr-wait' | 'success'>('form');
    const [currentSessionId, setCurrentSessionId] = useState<string>(''); // ID Real de la sesión pendiente
    const [showVerificationModal, setShowVerificationModal] = useState<SessionLog | null>(null);

    // Estados de Bitácora (Sesiones) - ACTUALIZADO CON LUGAR Y MODALIDAD
    const [sessionForm, setSessionForm] = useState({
        date: new Date().toISOString().split('T')[0],
        duration: 60,
        observation: '',
        location: '',
        modality: 'Presencial'
    });

    // --- INIT: Asegurar que existe la "Actividad" Contenedora ---
    useEffect(() => {
        const checkAndCreateActivity = async () => {
            if (activities.length > 0 && !activities.some(a => a.id === ADVISORY_ACTIVITY_ID)) {
                console.log("Inicializando contenedor de Asesorías...");
                const advisoryAct: Activity = {
                    id: ADVISORY_ACTIVITY_ID,
                    category: 'ADVISORY',
                    name: `Asesorías y Acompañamiento ${new Date().getFullYear()}`,
                    modality: 'Presencial/Virtual',
                    hours: 0,
                    year: new Date().getFullYear(),
                    isPublic: false,
                    internalCode: 'ASE-GEN',
                    startDate: new Date().toISOString().split('T')[0]
                };
                await addActivity(advisoryAct);
            }
        };
        checkAndCreateActivity();
    }, [activities, addActivity]);

    // Filtrar inscripciones solo de Asesoría
    const advisoryEnrollments = useMemo(() => {
        return enrollments.filter(e => e.activityId === ADVISORY_ACTIVITY_ID);
    }, [enrollments]);

    // Calcular estadísticas
    const stats = useMemo(() => {
        let totalSessions = 0;
        let totalHours = 0;
        advisoryEnrollments.forEach(e => {
            const logs = e.sessionLogs || [];
            totalSessions += logs.length;
            totalHours += logs.reduce((acc, log) => acc + (log.duration / 60), 0);
        });
        return { students: advisoryEnrollments.length, sessions: totalSessions, hours: totalHours.toFixed(1) };
    }, [advisoryEnrollments]);

    // --- HANDLERS BUSQUEDA ---
    const handleSearchRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchRut(val);
        setSearchSurname('');
        setSurnameSuggestions([]);

        if (val.length < 2) {
            setRutSuggestions([]);
            return;
        }
        
        const cleanVal = val.toLowerCase().replace(/[^0-9k]/g, '');
        const matches = advisoryEnrollments.map(enr => {
            const user = users.find(u => u.rut === enr.rut);
            return { enrollmentId: enr.id, user };
        }).filter(item => item.user && item.user.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(cleanVal));
        
        // @ts-ignore
        setRutSuggestions(matches);
    };

    const handleSearchSurnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchSurname(val);
        setSearchRut('');
        setRutSuggestions([]);

        if (val.length < 2) {
            setSurnameSuggestions([]);
            return;
        }

        const lowerVal = val.toLowerCase();
        const matches = advisoryEnrollments.map(enr => {
            const user = users.find(u => u.rut === enr.rut);
            return { enrollmentId: enr.id, user };
        }).filter(item => item.user && item.user.paternalSurname.toLowerCase().includes(lowerVal));

        // @ts-ignore
        setSurnameSuggestions(matches);
    };

    const selectSearchResult = (enrollmentId: string) => {
        handleManageStudent(enrollmentId);
        setSearchRut('');
        setSearchSurname('');
        setRutSuggestions([]);
        setSurnameSuggestions([]);
    };

    // --- HANDLERS GESTIÓN ---

    const handleOpenEnrollModal = () => {
        setEnrollForm({
            rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
            academicRole: '', faculty: '', department: '', career: '', contractType: '',
            teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
        });
        setEnrollMsg(null);
        setIsProcessing(false);
        setShowEnrollModal(true);
    };

    const handleRutBlur = () => {
        if (!enrollForm.rut) return;
        const formatted = cleanRutFormat(enrollForm.rut);
        setEnrollForm(prev => ({...prev, rut: formatted}));
        
        const existing = getUser(formatted);
        if (existing) {
            setEnrollForm(prev => ({
                ...prev,
                names: existing.names,
                paternalSurname: existing.paternalSurname,
                maternalSurname: existing.maternalSurname || '',
                email: existing.email || '',
                phone: existing.phone || '',
                academicRole: existing.academicRole || '',
                faculty: existing.faculty || '',
                department: existing.department || '',
                career: existing.career || '',
                contractType: existing.contractType || '',
                teachingSemester: existing.teachingSemester || '',
                campus: existing.campus || '',
                systemRole: existing.systemRole
            }));
            setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
        }
    };

    const handleEnrollSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname) {
            setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios (*).' });
            return;
        }

        setIsProcessing(true);
        setEnrollMsg(null);

        const cleanRut = cleanRutFormat(enrollForm.rut);

        if (!activities.some(a => a.id === ADVISORY_ACTIVITY_ID)) {
             const advisoryAct: Activity = {
                id: ADVISORY_ACTIVITY_ID,
                category: 'ADVISORY',
                name: `Asesorías y Acompañamiento ${new Date().getFullYear()}`,
                modality: 'Presencial/Virtual',
                hours: 0,
                year: new Date().getFullYear(),
                isPublic: false,
                internalCode: 'ASE-GEN',
                startDate: new Date().toISOString().split('T')[0]
            };
            await addActivity(advisoryAct);
        }

        const userPayload: User = {
            ...enrollForm,
            rut: cleanRut,
            systemRole: enrollForm.systemRole as UserRole
        };

        try {
            await upsertUsers([userPayload]);
            await enrollUser(userPayload.rut, ADVISORY_ACTIVITY_ID);

            setEnrollMsg({ type: 'success', text: 'Expediente creado correctamente.' });
            
            setTimeout(() => {
                setShowEnrollModal(false);
                setIsProcessing(false);
            }, 1500);

        } catch (err: any) {
            console.error("Error creando expediente:", err);
            setEnrollMsg({ type: 'error', text: `Error: ${err.message || 'No se pudo guardar'}` });
            setIsProcessing(false);
        }
    };

    const handleManageStudent = (enrollmentId: string) => {
        setSelectedEnrollmentId(enrollmentId);
        // Reset form con nuevos campos
        setSessionForm({ 
            date: new Date().toISOString().split('T')[0], 
            duration: 60, 
            observation: '',
            location: '',
            modality: 'Presencial' 
        });
        setSignatureStep('form');
        setView('manage');
    };

    const handleDeleteBitacora = async (id: string, name: string) => {
        if(window.confirm(`ADVERTENCIA: ¿Está seguro que desea eliminar la bitácora completa de ${name}?\n\nEsta acción eliminará todas las sesiones registradas y no se puede deshacer.`)) {
            await deleteEnrollment(id);
        }
    };

    // --- REAL WORLD SIGNATURE LOGIC ---

    // 1. Crear Sesión Pendiente en BD y Mostrar QR
    const handleStartSignature = async () => {
        if (!sessionForm.date || !sessionForm.observation) {
            alert("Por favor complete fecha y observaciones antes de generar el QR.");
            return;
        }
        if (!selectedEnrollmentId) return;

        // Crear registro REAL en la BD pero verified: false
        const sessionId = `SES-${Date.now()}`; // ID temporal único
        setCurrentSessionId(sessionId);

        const newLog: SessionLog = {
            id: sessionId,
            date: sessionForm.date,
            duration: sessionForm.duration,
            observation: sessionForm.observation,
            advisorName: currentUser?.names,
            verified: false, // Pendiente
            signedAt: undefined,
            location: sessionForm.location, // Nuevo campo
            modality: sessionForm.modality  // Nuevo campo
        };

        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        const currentLogs = enrollment?.sessionLogs || [];
        
        // Guardamos en BD para que el estudiante pueda encontrarla
        await updateEnrollment(selectedEnrollmentId, { sessionLogs: [...currentLogs, newLog] });
        
        setSignatureStep('qr-wait');
    };

    // 2. Efecto para escuchar cambios en tiempo real (Polling Robustecido)
    // Se usa polling directo a Supabase para evitar retrasos del contexto en Netlify
    useEffect(() => {
        let interval: any;

        if (signatureStep === 'qr-wait' && selectedEnrollmentId && currentSessionId) {
            
            const checkStatus = async () => {
                try {
                    // Consulta directa para mayor velocidad y fiabilidad
                    const { data, error } = await supabase
                        .from('enrollments')
                        .select('session_logs')
                        .eq('id', selectedEnrollmentId)
                        .single();

                    if (data && data.session_logs) {
                        const logs = data.session_logs as SessionLog[];
                        const mySession = logs.find(l => l.id === currentSessionId);

                        if (mySession && mySession.verified) {
                            clearInterval(interval);
                            
                            // 1. Actualizar contexto local para que el historial refleje el cambio INMEDIATAMENTE
                            await updateEnrollment(selectedEnrollmentId, { sessionLogs: logs });
                            
                            // 2. Cambiar UI a éxito
                            setSignatureStep('success');
                            
                            setTimeout(() => {
                                setSessionForm({ 
                                    date: new Date().toISOString().split('T')[0], 
                                    duration: 60, 
                                    observation: '',
                                    location: '',
                                    modality: 'Presencial'
                                });
                                setSignatureStep('form');
                            }, 3000);
                        }
                    }
                } catch (err) {
                    console.error("Error verificando firma:", err);
                }
            };

            // Chequeo inicial inmediato y luego polling
            checkStatus();
            interval = setInterval(checkStatus, 3000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [signatureStep, selectedEnrollmentId, currentSessionId, updateEnrollment]);

    // MODIFIED: Delete Session Logic using Index fallback for legacy data
    const handleDeleteSession = async (indexOrId: number | string) => {
        if (!selectedEnrollmentId) return;
        
        if (window.confirm("¿Está seguro que desea eliminar este registro de sesión del historial?")) {
            const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
            if (enrollment) {
                const currentLogs = enrollment.sessionLogs || [];
                let updatedLogs = [];

                if (typeof indexOrId === 'number') {
                    // Si se pasa un número, es el índice original en el array
                    updatedLogs = currentLogs.filter((_, i) => i !== indexOrId);
                } else {
                    // Si se pasa un string, es el ID
                    updatedLogs = currentLogs.filter(log => log.id !== indexOrId);
                }
                
                await updateEnrollment(selectedEnrollmentId, { sessionLogs: updatedLogs });
            }
        }
    };

    // Construir URL Real para el QR
    const getQrUrl = () => {
        if (!selectedEnrollmentId || !currentSessionId) return '';
        const baseUrl = window.location.origin;
        return `${baseUrl}/?mode=sign&eid=${selectedEnrollmentId}&sid=${currentSessionId}`;
    };

    // Copiar enlace al portapapeles
    const handleCopyLink = () => {
        const url = getQrUrl();
        navigator.clipboard.writeText(url);
        alert("Enlace de firma copiado. Puede pegarlo en el chat de Zoom/Teams.");
    };

    // --- RENDER ---

    if (view === 'manage' && selectedEnrollmentId) {
        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        const student = users.find(u => u.rut === enrollment?.rut);
        const logs = enrollment?.sessionLogs || [];

        // Calcular total horas de este estudiante
        const studentTotalHours = (logs.reduce((acc, log) => acc + log.duration, 0) / 60).toFixed(1);

        return (
            <div className="animate-fadeIn max-w-6xl mx-auto space-y-6">
                <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm font-bold">
                    ← Volver al Listado
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* COL 1: Ficha del Estudiante (Solo Lectura aquí) */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">
                                    {student?.names.charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800 leading-tight">{student?.names} {student?.paternalSurname}</h2>
                                    <p className="text-xs text-slate-500 font-mono">{student?.rut}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
                                <div>
                                    <span className="block text-xs font-bold text-slate-400 uppercase">Correo</span>
                                    <span className="text-slate-700">{student?.email}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-400 uppercase">Unidad Académica</span>
                                    <span className="text-slate-700">{student?.faculty}</span>
                                    <span className="block text-xs text-slate-500">{student?.department}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-400 uppercase">Carrera</span>
                                    <span className="text-slate-700">{student?.career}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center">
                            <h3 className="text-indigo-900 font-bold text-lg mb-1">Resumen Atención</h3>
                            <div className="flex justify-center gap-4 mt-4">
                                <div>
                                    <span className="block text-2xl font-bold text-indigo-700">{logs.length}</span>
                                    <span className="text-[10px] uppercase font-bold text-indigo-400">Sesiones</span>
                                </div>
                                <div>
                                    <span className="block text-2xl font-bold text-indigo-700">{studentTotalHours}</span>
                                    <span className="text-[10px] uppercase font-bold text-indigo-400">Horas Tot.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COL 2 & 3: Bitácora & Firma */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* FORMULARIO SESIÓN CON FIRMA DIGITAL */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Registrar Nueva Sesión
                            </h3>

                            {/* PASO 1: DATOS DE SESIÓN */}
                            {signatureStep === 'form' && (
                                <div className="animate-fadeIn">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Fecha</label>
                                            <input type="date" value={sessionForm.date} onChange={e => setSessionForm({...sessionForm, date: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Duración (Minutos)</label>
                                            <select value={sessionForm.duration} onChange={e => setSessionForm({...sessionForm, duration: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                                                <option value={30}>30 Minutos</option>
                                                <option value={60}>60 Minutos</option>
                                                <option value={90}>90 Minutos</option>
                                                <option value={120}>120 Minutos</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* NUEVOS CAMPOS: LUGAR Y MODALIDAD */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Modalidad</label>
                                            <select 
                                                value={sessionForm.modality} 
                                                onChange={e => setSessionForm({...sessionForm, modality: e.target.value})} 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="Presencial">Presencial</option>
                                                <option value="Virtual">Virtual</option>
                                                <option value="Correo Electrónico">Correo Electrónico</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Lugar / Plataforma</label>
                                            <input 
                                                type="text" 
                                                placeholder="Ej. Oficina 304, Zoom, Email..."
                                                value={sessionForm.location} 
                                                onChange={e => setSessionForm({...sessionForm, location: e.target.value})} 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Observaciones / Temática Tratada</label>
                                        <textarea rows={3} value={sessionForm.observation} onChange={e => setSessionForm({...sessionForm, observation: e.target.value})} placeholder="Describa los puntos principales abordados en la sesión..." className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"/>
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={handleStartSignature} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md text-sm flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 17h.01M9 20h.01M12 20h.01M15 20h.01M15 17h.01M15 14h.01M9 17h.01M9 14h.01M6 20h.01M6 17h.01" /></svg>
                                            Generar QR para Firma
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* PASO 2: QR Y ESPERA */}
                            {signatureStep === 'qr-wait' && (
                                <div className="animate-fadeIn flex flex-col items-center justify-center py-6 space-y-4">
                                    <div className="bg-white p-2 rounded-xl shadow-lg border-2 border-indigo-100">
                                        {/* QR REAL */}
                                        <img 
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getQrUrl())}`} 
                                            alt="QR Firma" 
                                            className="w-48 h-48"
                                        />
                                    </div>
                                    <div className="text-center w-full max-w-sm">
                                        <h4 className="text-lg font-bold text-slate-800 animate-pulse">Esperando firma...</h4>
                                        <p className="text-sm text-slate-500 mb-3">Escanee el QR o envíe el enlace al estudiante.</p>
                                        
                                        {/* Link Copy Section */}
                                        <div className="flex gap-2 justify-center mb-4">
                                            <input 
                                                type="text" 
                                                readOnly 
                                                value={getQrUrl()} 
                                                className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 flex-1 truncate font-mono"
                                            />
                                            <button 
                                                onClick={handleCopyLink}
                                                className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded text-xs font-bold hover:bg-indigo-200 flex items-center gap-1 transition-colors whitespace-nowrap"
                                                title="Copiar para Zoom/Teams"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                Copiar
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mb-4 italic">El enlace se genera según su dirección actual: {window.location.origin}</p>

                                        <button onClick={() => setSignatureStep('form')} className="px-4 py-2 text-xs text-red-500 font-bold hover:text-red-700 hover:underline">Cancelar Espera</button>
                                    </div>
                                </div>
                            )}

                            {/* PASO 3: ÉXITO */}
                            {signatureStep === 'success' && (
                                <div className="animate-fadeIn flex flex-col items-center justify-center py-10 text-center">
                                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-800">Sesión Firmada Correctamente</h4>
                                    <p className="text-slate-500 text-sm mt-1">Se ha generado el código de autenticidad.</p>
                                </div>
                            )}
                        </div>

                        {/* Historial (Timeline) */}
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                            <h3 className="font-bold text-slate-600 mb-4 uppercase text-xs tracking-wide">Historial de Acompañamiento</h3>
                            
                            {logs.length === 0 ? (
                                <p className="text-slate-400 text-sm italic text-center py-8">No hay sesiones registradas aún.</p>
                            ) : (
                                <div className="space-y-4">
                                    {[...logs].reverse().map((log, idx) => {
                                        // Calculate original index because array is reversed
                                        const originalIndex = logs.length - 1 - idx;
                                        
                                        return (
                                        <div key={log.id || idx} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative pl-6 group">
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.verified ? 'bg-green-500' : 'bg-amber-300'} rounded-l-lg`}></div>
                                            
                                            {/* Delete Session Button - FIXED & ROBUST */}
                                            <button 
                                                type="button"
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    // Pass index if id is missing, or prefer ID if present
                                                    handleDeleteSession(log.id ? log.id : originalIndex); 
                                                }}
                                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors z-10 cursor-pointer"
                                                title="Eliminar registro de sesión"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>

                                            <div className="flex justify-between items-start mb-2 pr-6">
                                                <div>
                                                    <span className="text-sm font-bold text-indigo-700 block">{new Date(log.date).toLocaleDateString()}</span>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-slate-400">Atendido por: {log.advisorName || 'Asesor'}</span>
                                                        {(log.modality || log.location) && (
                                                            <span className="text-[10px] text-slate-500 mt-0.5">
                                                                {log.modality} {log.location ? `• ${log.location}` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-xs font-bold border border-indigo-100">{log.duration} min</span>
                                                    {log.verified ? (
                                                        <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                            Firma Digital
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                            Pendiente
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <p className="text-slate-600 text-sm leading-relaxed mb-3">{log.observation}</p>
                                            
                                            {log.verified && (
                                                <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                                                    <span className="text-[10px] font-mono text-slate-400">COD: {log.verificationCode}</span>
                                                    <button 
                                                        onClick={() => setShowVerificationModal(log)}
                                                        className="text-[10px] text-blue-600 hover:underline font-bold flex items-center gap-1"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        Verificar Autenticidad
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
                
                {/* MODAL CERTIFICADO DE AUTENTICIDAD */}
                {showVerificationModal && (
                    // ... (Modal Content remains the same)
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
                                <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide">
                                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    Certificado de Autenticidad
                                </h3>
                                <button onClick={() => setShowVerificationModal(null)} className="text-white/50 hover:text-white">✕</button>
                            </div>
                            <div className="p-6 flex flex-col items-center text-center">
                                <div className="border-4 border-slate-800 p-2 rounded-lg mb-4">
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=UPLA-VERIFY:${showVerificationModal.verificationCode}`} 
                                        alt="QR Verificación" 
                                        className="w-32 h-32"
                                    />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800 mb-1">Sesión Verificada</h2>
                                <p className="text-sm text-green-600 font-bold mb-6 flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    Firma Digital Válida
                                </p>
                                
                                <div className="w-full text-left bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3 text-sm">
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-500 font-medium">Código Verificación:</span>
                                        <span className="font-mono font-bold text-slate-700">{showVerificationModal.verificationCode}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-500 font-medium">Estudiante:</span>
                                        <span className="font-bold text-slate-700">{student?.names} {student?.paternalSurname}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-500 font-medium">Fecha y Hora:</span>
                                        <span className="font-bold text-slate-700">
                                            {showVerificationModal.date} {showVerificationModal.signedAt ? `• ${new Date(showVerificationModal.signedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-500 font-medium">Modalidad:</span>
                                        <span className="font-bold text-slate-700">{showVerificationModal.modality || 'Presencial'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500 font-medium">Asesor Responsable:</span>
                                        <span className="font-bold text-slate-700">{showVerificationModal.advisorName}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-4 max-w-xs">
                                    Escanee el código QR para validar los datos de esta sesión en el sistema institucional.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div className="animate-fadeIn space-y-6">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-700 p-6 rounded-xl shadow-lg text-white">
                <div>
                    <h2 className="text-2xl font-bold">Bitácora de Asesorías</h2>
                    <p className="text-slate-300 text-sm mt-1">Gestión de acompañamiento individual docente.</p>
                </div>
                <div className="flex gap-4 text-center">
                    <div className="px-4 border-r border-slate-600">
                        <span className="block text-2xl font-bold text-indigo-400">{stats.students}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Docentes</span>
                    </div>
                    <div className="px-4 border-r border-slate-600">
                        <span className="block text-2xl font-bold text-emerald-400">{stats.sessions}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Sesiones</span>
                    </div>
                    <div className="px-4">
                        <span className="block text-2xl font-bold text-amber-400">{stats.hours}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Horas</span>
                    </div>
                </div>
                <button 
                    onClick={handleOpenEnrollModal}
                    className="bg-white text-slate-800 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition-colors shadow-md flex items-center gap-2 text-sm"
                >
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Nuevo Expediente
                </button>
            </div>

            {/* SECCIÓN BUSCADOR RÁPIDO */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <h3 className="font-bold text-indigo-900 text-sm uppercase tracking-wide">Búsqueda Rápida de Expedientes</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Campo RUT */}
                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Buscar por RUT</label>
                        <input 
                            type="text" 
                            placeholder="Ingrese RUT..." 
                            value={searchRut} 
                            onChange={handleSearchRutChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                        {rutSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 z-20 max-h-48 overflow-y-auto">
                                {rutSuggestions.map(s => (
                                    <button 
                                        key={s.enrollmentId} 
                                        onClick={() => selectSearchResult(s.enrollmentId)}
                                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
                                    >
                                        <span className="block font-bold text-slate-700 text-sm">{s.user.names} {s.user.paternalSurname}</span>
                                        <span className="block text-xs text-slate-500 font-mono">{s.user.rut}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Campo Apellido */}
                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Buscar por Apellido Paterno</label>
                        <input 
                            type="text" 
                            placeholder="Ingrese Apellido..." 
                            value={searchSurname} 
                            onChange={handleSearchSurnameChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                        {surnameSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 z-20 max-h-48 overflow-y-auto">
                                {surnameSuggestions.map(s => (
                                    <button 
                                        key={s.enrollmentId} 
                                        onClick={() => selectSearchResult(s.enrollmentId)}
                                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
                                    >
                                        <span className="block font-bold text-slate-700 text-sm">{s.user.names} {s.user.paternalSurname}</span>
                                        <span className="block text-xs text-slate-500 font-mono">{s.user.rut}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* List Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">Docente Asesorado</th>
                            <th className="px-6 py-4">Unidad Académica</th>
                            <th className="px-6 py-4 text-center">Sesiones</th>
                            <th className="px-6 py-4 text-center">Última Atención</th>
                            <th className="px-6 py-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {advisoryEnrollments.map(enr => {
                            const user = users.find(u => u.rut === enr.rut);
                            const lastSession = enr.sessionLogs && enr.sessionLogs.length > 0 
                                ? enr.sessionLogs[enr.sessionLogs.length - 1].date 
                                : '-';
                            const sessionCount = enr.sessionLogs?.length || 0;

                            return (
                                <tr key={enr.id} className="hover:bg-indigo-50/20 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{user?.names} {user?.paternalSurname}</div>
                                        <div className="text-xs text-slate-500 font-mono">{enr.rut}</div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-600">
                                        <div className="font-bold">{user?.faculty || 'Sin Facultad'}</div>
                                        <div>{user?.department}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${sessionCount > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {sessionCount}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center text-slate-600 font-mono text-xs">
                                        {lastSession}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => handleManageStudent(enr.id)}
                                                className="text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 bg-indigo-50 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                                            >
                                                Gestionar Bitácora
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteBitacora(enr.id, `${user?.names} ${user?.paternalSurname}`)}
                                                className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 bg-red-50 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                                                title="Eliminar Expediente Completo"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {advisoryEnrollments.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                    No hay expedientes de asesoría abiertos. Cree uno nuevo para comenzar.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Crear Expediente (13 Campos) */}
            {showEnrollModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                            <h3 className="text-lg font-bold text-slate-800">Apertura de Expediente (Ficha Base)</h3>
                            <button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
                        </div>
                        
                        <form onSubmit={handleEnrollSubmit} className="p-8 space-y-6">
                            
                            {/* Identificación */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wide border-b border-indigo-100 pb-1">1. Identificación del Docente</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                        <input type="text" value={enrollForm.rut} onChange={e => setEnrollForm({...enrollForm, rut: e.target.value})} onBlur={handleRutBlur} placeholder="12345678-9" className="w-full px-3 py-2 border border-slate-300 rounded font-bold text-sm focus:ring-2 focus:ring-indigo-500"/>
                                    </div>
                                    <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" required value={enrollForm.names} onChange={e => setEnrollForm({...enrollForm, names: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div>
                                    <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" required value={enrollForm.paternalSurname} onChange={e => setEnrollForm({...enrollForm, paternalSurname: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div>
                                    <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" value={enrollForm.maternalSurname} onChange={e => setEnrollForm({...enrollForm, maternalSurname: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Email</label><input type="email" value={enrollForm.email} onChange={e => setEnrollForm({...enrollForm, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div>
                                    <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" value={enrollForm.phone} onChange={e => setEnrollForm({...enrollForm, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div>
                                </div>
                            </div>

                            {/* Datos Académicos (Base Maestra) */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wide border-b border-indigo-100 pb-1">2. Antecedentes Institucionales</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <SmartSelect label="Sede / Campus" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={(e) => setEnrollForm({...enrollForm, campus: e.target.value})} />
                                    <SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={(e) => setEnrollForm({...enrollForm, faculty: e.target.value})} />
                                    <SmartSelect label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={(e) => setEnrollForm({...enrollForm, department: e.target.value})} />
                                    <SmartSelect label="Carrera" name="career" value={enrollForm.career} options={listCareers} onChange={(e) => setEnrollForm({...enrollForm, career: e.target.value})} />
                                    <SmartSelect label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={(e) => setEnrollForm({...enrollForm, contractType: e.target.value})} />
                                    <SmartSelect label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={(e) => setEnrollForm({...enrollForm, academicRole: e.target.value})} />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 items-center">
                                <button type="button" onClick={() => setShowEnrollModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold">Cancelar</button>
                                <button 
                                    type="submit" 
                                    disabled={isProcessing}
                                    className={`bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 ${isProcessing ? 'opacity-70 cursor-wait' : ''}`}
                                >
                                    {isProcessing && (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    Crear Expediente
                                </button>
                            </div>
                            
                            {enrollMsg && (
                                <div className={`text-center p-2 rounded text-sm font-bold animate-fadeIn ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {enrollMsg.text}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};
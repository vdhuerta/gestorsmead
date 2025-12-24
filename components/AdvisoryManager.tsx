
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Enrollment, User, UserRole, Activity, SessionLog, ActivityState } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
import { supabase } from '../services/supabaseClient';
import { useReloadDirective } from '../hooks/useReloadDirective';

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

// Utility para formatear Fecha (YYYY-MM-DD -> DD-MM-YYYY)
const formatDateCL = (dateStr: string): string => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

// Utility para colores pastel aleatorios basados en texto
const getTagColor = (text: string) => {
    const colors = [
        'bg-blue-50 text-blue-700 border-blue-100',
        'bg-green-50 text-green-700 border-green-100',
        'bg-purple-50 text-purple-700 border-purple-100',
        'bg-amber-50 text-amber-700 border-amber-100',
        'bg-rose-50 text-rose-700 border-rose-100',
        'bg-indigo-50 text-indigo-700 border-indigo-100',
        'bg-teal-50 text-teal-700 border-teal-100'
    ];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

// --- ALGORITMO LOCAL DE SUGERENCIA DE TAGS ---
const generateLocalTags = (text: string): string[] => {
    if (!text) return [];
    const stopWords = new Set([
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'si', 'no', 'en', 'de', 'del', 'al', 'a', 'con', 'sin', 'por', 'para', 'es', 'son', 'fue', 'era', 'muy', 'mas', 'que', 'como', 'este', 'esta', 'ese', 'esa', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nos', 'se', 'lo', 'les', 'me', 'te', 'le'
    ]);
    const academicBoost = new Set([
        'evaluación', 'rúbrica', 'planificación', 'didáctica', 'metodología', 'curricular', 'aprendizaje', 'enseñanza', 'taller', 'investigación', 'proyecto', 'tesis', 'acompañamiento', 'feedback', 'retroalimentación', 'clase', 'virtual', 'aula', 'competencia', 'resultado', 'objetivo'
    ]);
    const words = text.toLowerCase().replace(/[.,;!?()"\-]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    const counts: Record<string, number> = {};
    words.forEach(w => {
        let score = 1;
        if ([...academicBoost].some(boost => w.includes(boost))) score += 2; 
        counts[w] = (counts[w] || 0) + score;
    });
    const topTags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(pair => pair[0].charAt(0).toUpperCase() + pair[0].slice(1));
    return topTags;
};

const ExpandableText: React.FC<{ text: string }> = ({ text }) => {
    const [expanded, setExpanded] = useState(false);
    const limit = 200; 
    if (text.length <= limit) return <p className="text-slate-600 text-sm leading-relaxed mb-3 italic">"{text}"</p>;
    return (
        <div className="mb-3 relative z-10">
            <p className="text-slate-600 text-sm leading-relaxed italic inline">"{expanded ? text : text.substring(0, limit) + '...'}"</p>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }} className="text-indigo-600 text-xs font-bold hover:underline ml-2">
                {expanded ? 'Leer menos' : 'Leer más'}
            </button>
        </div>
    );
};

// --- COMPONENTE DE VERIFICACIÓN PÚBLICA (VISTA QR) ---
export const PublicVerification: React.FC<{ code: string }> = ({ code }) => {
    const [loading, setLoading] = useState(true);
    const [verifiedData, setVerifiedData] = useState<{log: SessionLog, student: any} | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const verifyCode = async () => {
            try {
                const { data, error } = await supabase
                    .from('enrollments')
                    .select('*, user:users(*)')
                    .contains('session_logs', JSON.stringify([{ verificationCode: code }]))
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (!data) throw new Error('El código no existe en nuestros registros.');

                const logs = data.session_logs as SessionLog[];
                const targetLog = logs.find(l => l.verificationCode === code);
                if (!targetLog) throw new Error('Registro de sesión no coincide (Integridad de datos).');

                setVerifiedData({ log: targetLog, student: data.user });
            } catch (err: any) {
                console.error("Verification Error:", err);
                setError(err.message || 'Error de verificación');
            } finally {
                setLoading(false);
            }
        };
        if (code) verifyCode();
        else { setError('Código no proporcionado'); setLoading(false); }
    }, [code]);

    if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600"></div></div>;
    if (error || !verifiedData) return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border-t-4 border-red-500"><h2 className="text-2xl font-bold text-slate-800 mb-2">Verificación Fallida</h2><p className="text-slate-600 mb-6">{error}</p><a href="/" className="text-indigo-600 hover:underline text-sm font-bold">Volver al inicio</a></div></div>;

    const { log, student } = verifiedData;
    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide">Certificado de Autenticidad</h3></div>
                <div className="p-6 flex flex-col items-center text-center">
                    <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-xl p-6 w-full"><h2 className="text-lg font-black text-green-800 uppercase">DOCUMENTO AUTÉNTICO</h2><p className="text-sm text-green-700 font-bold mt-1">Unidad de Acompañamiento Docente</p></div>
                    <div className="w-full text-left bg-slate-50 rounded-lg border border-slate-200 p-5 space-y-4 text-sm">
                        <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500 font-medium text-xs uppercase">Código Único</span><span className="font-mono font-bold text-slate-800 bg-slate-200 px-2 rounded">{log.verificationCode}</span></div>
                        <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500 font-medium text-xs uppercase">Docente</span><div className="text-right"><span className="font-bold text-slate-800 block">{student?.names} {student?.paternal_surname}</span></div></div>
                        <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500 font-medium text-xs uppercase">Fecha</span><span className="font-bold text-slate-800">{formatDateCL(log.date)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500 font-medium text-xs uppercase">Asesor</span><span className="font-bold text-indigo-700 text-right">{log.advisorName}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface AdvisoryManagerProps { currentUser?: User; }

export const AdvisoryManager: React.FC<AdvisoryManagerProps> = ({ currentUser }) => {
    const { enrollments, users, addActivity, activities, upsertUsers, enrollUser, updateEnrollment, deleteEnrollment, getUser, config } = useData();
    const { isSyncing, executeReload } = useReloadDirective(); // DIRECTIVA_RECARGA
    
    // Lists & Config
    const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
    const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
    const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
    const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
    const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
    const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

    const isAdmin = currentUser?.systemRole === UserRole.ADMIN;

    // Lista de Asesores (para el desplegable)
    const advisorsList = useMemo(() => users.filter(u => u.systemRole === UserRole.ASESOR), [users]);

    // States
    const [view, setView] = useState<'list' | 'manage'>('list');
    const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
    const [realtimeLogs, setRealtimeLogs] = useState<SessionLog[] | null>(null);

    // Search
    const [searchRut, setSearchRut] = useState('');
    const [searchSurname, setSearchSurname] = useState('');
    const [rutSuggestions, setRutSuggestions] = useState<{enrollmentId: string, user: User}[]>([]);
    const [surnameSuggestions, setSurnameSuggestions] = useState<{enrollmentId: string, user: User}[]>([]);

    // Enrollment Form
    const [enrollForm, setEnrollForm] = useState({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE, responsible: '' });
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollMsg, setEnrollMsg] = useState<{ type: 'success'|'error'|'duplicate', text: string, existingId?: string } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Session Management
    const [signatureStep, setSignatureStep] = useState<'form' | 'qr-wait' | 'success'>('form');
    const [currentSessionId, setCurrentSessionId] = useState<string>(''); 
    const [showVerificationModal, setShowVerificationModal] = useState<SessionLog | null>(null);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);
    const [isGeneratingTags, setIsGeneratingTags] = useState(false);
    
    // Updated Session Form to include advisorName for admins
    const [sessionForm, setSessionForm] = useState<{ date: string; duration: number; observation: string; location: string; modality: string; tags: string[]; advisorName: string; }>({ 
        date: new Date().toISOString().split('T')[0], 
        duration: 60, 
        observation: '', 
        location: '', 
        modality: 'Presencial', 
        tags: [],
        advisorName: ''
    });

    const [tagInput, setTagInput] = useState('');
    const [manageTab, setManageTab] = useState<'management' | 'tracking'>('management');

    // --- EFFECT: Suggestions Click Outside ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) { setShowSuggestions(false); } };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- EFFECT: Init Activity ---
    useEffect(() => {
        const checkAndCreateActivity = async () => {
            if (activities.length > 0 && !activities.some(a => a.id === ADVISORY_ACTIVITY_ID)) {
                await addActivity({ id: ADVISORY_ACTIVITY_ID, category: 'ADVISORY', name: `Asesorías y Acompañamiento ${new Date().getFullYear()}`, modality: 'Presencial/Virtual', hours: 0, year: new Date().getFullYear(), isPublic: false, internalCode: 'ASE-GEN', startDate: new Date().toISOString().split('T')[0] });
            }
        };
        checkAndCreateActivity();
    }, [activities, addActivity]);

    // Data filtering
    const advisoryEnrollments = useMemo(() => enrollments.filter(e => e.activityId === ADVISORY_ACTIVITY_ID), [enrollments]);
    const stats = useMemo(() => {
        let totalSessions = 0, totalHours = 0;
        advisoryEnrollments.forEach(e => { const logs = e.sessionLogs || []; totalSessions += logs.length; totalHours += logs.reduce((acc, log) => acc + (log.duration / 60), 0); });
        return { students: advisoryEnrollments.length, sessions: totalSessions, hours: totalHours.toFixed(1) };
    }, [advisoryEnrollments]);

    // --- Realtime Sync Logic (Local) ---
    useEffect(() => { setRealtimeLogs(null); }, [selectedEnrollmentId]);

    const fetchLatestLogs = async (id: string) => {
        const { data } = await supabase.from('enrollments').select('session_logs').eq('id', id).single();
        if (data && data.session_logs) setRealtimeLogs(data.session_logs as SessionLog[]);
    };

    useEffect(() => {
        if (view !== 'manage' || !selectedEnrollmentId) return;
        const channel = supabase.channel(`advisory-sync-${selectedEnrollmentId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'enrollments' }, async (payload) => {
                if (payload.new && payload.new.id === selectedEnrollmentId) await fetchLatestLogs(selectedEnrollmentId);
            })
            .subscribe((status) => { if (status === 'SUBSCRIBED') fetchLatestLogs(selectedEnrollmentId); });
        return () => { supabase.removeChannel(channel); };
    }, [view, selectedEnrollmentId]);

    const handleManualRefresh = async () => {
        await executeReload(); // APPLY DIRECTIVE
        if (selectedEnrollmentId) await fetchLatestLogs(selectedEnrollmentId);
    };

    // --- Search & Enroll Handlers ---
    const handleSearchRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value; setSearchRut(val); setSearchSurname(''); setSurnameSuggestions([]);
        if (val.length < 2) { setRutSuggestions([]); return; }
        const cleanVal = val.toLowerCase().replace(/[^0-9k]/g, '');
        const matches = advisoryEnrollments.map(enr => ({ enrollmentId: enr.id, user: users.find(u => u.rut === enr.rut) })).filter(item => item.user && item.user.rut.toLowerCase().includes(cleanVal));
        // @ts-ignore
        setRutSuggestions(matches);
    };

    const handleSearchSurnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value; setSearchSurname(val); setSearchRut(''); setRutSuggestions([]);
        if (val.length < 2) { setSurnameSuggestions([]); return; }
        const lowerVal = val.toLowerCase();
        const matches = advisoryEnrollments.map(enr => ({ enrollmentId: enr.id, user: users.find(u => u.rut === enr.rut) })).filter(item => item.user && item.user.paternalSurname.toLowerCase().includes(lowerVal));
        // @ts-ignore
        setSurnameSuggestions(matches);
    };

    const selectSearchResult = (enrollmentId: string) => { handleManageStudent(enrollmentId); setSearchRut(''); setSearchSurname(''); setRutSuggestions([]); setSurnameSuggestions([]); };

    const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target; setEnrollForm(prev => ({ ...prev, [name]: value }));
        if (name === 'rut') {
            const rawInput = value.replace(/[^0-9kK]/g, '').toLowerCase();
            if (rawInput.length >= 2) { const matches = users.filter(u => u.rut.replace(/[^0-9kK]/g, '').toLowerCase().includes(rawInput)); setSuggestions(matches.slice(0, 5)); setShowSuggestions(matches.length > 0); } 
            else { setSuggestions([]); setShowSuggestions(false); }
        }
    };

    const handleSelectSuggestion = (user: User) => {
        setEnrollForm(prev => ({ ...prev, rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole }));
        setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' }); setShowSuggestions(false);
    };

    const handleOpenEnrollModal = () => { setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE, responsible: '' }); setEnrollMsg(null); setIsProcessing(false); setShowEnrollModal(true); setSuggestions([]); setShowSuggestions(false); };

    const handleRutBlur = () => { setTimeout(() => { if (!enrollForm.rut) return; const formatted = cleanRutFormat(enrollForm.rut); setEnrollForm(prev => ({...prev, rut: formatted})); const existing = getUser(formatted); if (existing) setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' }); }, 200); };

    const handleEnrollSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname) { setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios (*).' }); return; }
        
        setIsProcessing(true);
        setEnrollMsg(null);
        const cleanRut = cleanRutFormat(enrollForm.rut);
        const normRut = normalizeRut(cleanRut);

        // --- VALIDACIÓN DE DUPLICADO (SOLICITADA) ---
        const existingEnrollment = advisoryEnrollments.find(e => normalizeRut(e.rut) === normRut);
        if (existingEnrollment) {
            setEnrollMsg({ 
                type: 'duplicate', 
                text: 'Este docente ya cuenta con un expediente de asesoría activo.',
                existingId: existingEnrollment.id 
            });
            setIsProcessing(false);
            return;
        }
        // -------------------------------------------

        try {
            await upsertUsers([{ ...enrollForm, rut: cleanRut, systemRole: enrollForm.systemRole as UserRole }]);
            await enrollUser(cleanRut, ADVISORY_ACTIVITY_ID);
            
            // --- NUEVO: ASIGNAR RESPONSABLE ---
            if (currentUser) {
                // Buscamos la matrícula recién creada para obtener su ID y actualizarla
                const { data: enrData } = await supabase
                    .from('enrollments')
                    .select('id')
                    .eq('user_rut', cleanRut)
                    .eq('activity_id', ADVISORY_ACTIVITY_ID)
                    .maybeSingle();
                
                if (enrData) {
                    await updateEnrollment(enrData.id, { 
                        responsible: enrollForm.responsible || `${currentUser.names} ${currentUser.paternalSurname}` // Usar seleccionado o actual
                    });
                }
            }
            // --------------------------------------------------

            await executeReload(); // DIRECTIVA_RECARGA

            setEnrollMsg({ type: 'success', text: 'Expediente creado correctamente.' });
            setTimeout(() => { setShowEnrollModal(false); setIsProcessing(false); }, 1500);
        } catch (err: any) { setEnrollMsg({ type: 'error', text: `Error: ${err.message || 'No se pudo guardar'}` }); setIsProcessing(false); }
    };

    const handleManageStudent = (enrollmentId: string) => { 
        setSelectedEnrollmentId(enrollmentId); 
        setSessionForm({ 
            date: new Date().toISOString().split('T')[0], 
            duration: 60, 
            observation: '', 
            location: '', 
            modality: 'Presencial', 
            tags: [],
            advisorName: '' // Se resetea al abrir expediente
        }); 
        setTagInput(''); 
        setSignatureStep('form'); 
        setManageTab('management'); 
        setEditingLogId(null); 
        setEditingLogIndex(null); 
        setView('manage'); 
        setShowEnrollModal(false); // Por si venimos de la advertencia de duplicado
    };

    const handleDeleteBitacora = async (id: string, name: string) => { 
        if(window.confirm(`ADVERTENCIA: ¿Está seguro que desea eliminar la bitácora completa de ${name}?`)) {
            await deleteEnrollment(id);
            await executeReload(); // DIRECTIVA_RECARGA
        }
    };

    // --- Session Handlers ---
    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault(); const newTag = tagInput.trim().replace(/,/g, '');
            if (newTag && !sessionForm.tags.includes(newTag)) { setSessionForm(prev => ({ ...prev, tags: [...prev.tags, newTag] })); setTagInput(''); }
        }
    };
    const removeTag = (tagToRemove: string) => { setSessionForm(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) })); };
    const handleSuggestTags = async () => {
        if (!sessionForm.observation || sessionForm.observation.trim().length < 5) { alert("Por favor ingrese una observación más detallada."); return; }
        setIsGeneratingTags(true);
        setTimeout(() => { const newTags = generateLocalTags(sessionForm.observation); if (newTags.length > 0) setSessionForm(prev => ({ ...prev, tags: Array.from(new Set([...sessionForm.tags, ...newTags])).slice(0, 5) })); setIsGeneratingTags(false); }, 500);
    };

    const handleStartSignature = async () => {
        if (!sessionForm.date || !sessionForm.observation) { alert("Por favor complete fecha y observaciones."); return; }
        if (!selectedEnrollmentId) return;

        // Logic for advisor name selection
        const advisorToUse = isAdmin && sessionForm.advisorName 
            ? sessionForm.advisorName 
            : (currentUser ? `${currentUser.names} ${currentUser.paternalSurname}` : 'Asesor');

        const sessionId = `SES-${Date.now()}`; setCurrentSessionId(sessionId);
        const newLog: any = { 
            id: sessionId, 
            date: sessionForm.date, 
            duration: sessionForm.duration, 
            observation: sessionForm.observation, 
            advisorName: advisorToUse, 
            verified: false, 
            signedAt: undefined, 
            location: sessionForm.location, 
            modality: sessionForm.modality, 
            tags: sessionForm.tags 
        };
        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        
        await updateEnrollment(selectedEnrollmentId, { sessionLogs: [...(enrollment?.sessionLogs || []), newLog] });
        setSignatureStep('qr-wait');
    };

    // --- NUEVA FUNCIÓN: GUARDAR SIN FIRMA (SF) PARA ADMINISTRADOR ---
    const handleSaveSF = async () => {
        if (!sessionForm.date || !sessionForm.observation) { alert("Por favor complete fecha y observaciones."); return; }
        if (!selectedEnrollmentId) return;
        
        // Logic for advisor name selection
        const advisorToUse = isAdmin && sessionForm.advisorName 
            ? sessionForm.advisorName 
            : (currentUser ? `${currentUser.names} ${currentUser.paternalSurname}` : 'Administrador');

        const sessionId = `SES-SF-${Date.now()}`;
        const newLog: SessionLog = {
            id: sessionId,
            date: sessionForm.date,
            duration: sessionForm.duration,
            observation: sessionForm.observation,
            advisorName: advisorToUse,
            verified: true,
            authorizedByAdmin: true, // Marcado como autorizado manualmente
            verificationCode: `ADMIN-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            signedAt: new Date().toISOString(),
            location: sessionForm.location,
            modality: sessionForm.modality,
            tags: sessionForm.tags
        };

        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        try {
            await updateEnrollment(selectedEnrollmentId, { sessionLogs: [...(enrollment?.sessionLogs || []), newLog] });
            await executeReload(); // DIRECTIVA_RECARGA
            if (selectedEnrollmentId) await fetchLatestLogs(selectedEnrollmentId);
            
            setSessionForm({ date: new Date().toISOString().split('T')[0], duration: 60, observation: '', location: '', modality: 'Presencial', tags: [], advisorName: '' });
            setSignatureStep('form');
            alert("Registro guardado exitosamente (Autorizado por ADMIN).");
        } catch (err) {
            alert("Error al guardar registro.");
        }
    };

    const handleCancelSession = () => { if(sessionForm.observation || sessionForm.tags.length > 0) { if(!window.confirm("¿Desea cancelar el registro?")) return; } setEditingLogId(null); setEditingLogIndex(null); setSessionForm({ date: new Date().toISOString().split('T')[0], duration: 60, observation: '', location: '', modality: 'Presencial', tags: [], advisorName: '' }); setTagInput(''); setSignatureStep('form'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    const handleEditLog = (log: any, index: number) => {
        if (log.id) { setEditingLogId(log.id); setEditingLogIndex(null); } else { setEditingLogId(null); setEditingLogIndex(index); }
        setSessionForm({ date: log.date, duration: log.duration, observation: log.observation, location: log.location || '', modality: log.modality || 'Presencial', tags: log.tags || [] , advisorName: log.advisorName || '' }); setTagInput(''); setSignatureStep('form'); window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveEdit = async () => {
        if (!selectedEnrollmentId || (!editingLogId && editingLogIndex === null)) return;
        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        if (!enrollment) return;
        const updatedLogs = (enrollment.sessionLogs || []).map((log, i) => {
            const isTarget = (editingLogId && log.id === editingLogId) || (editingLogIndex !== null && i === editingLogIndex);
            if (isTarget) return { ...log, id: log.id || `SES-LEGACY-${Date.now()}`, date: sessionForm.date, duration: sessionForm.duration, observation: sessionForm.observation, location: sessionForm.location, modality: sessionForm.modality, tags: sessionForm.tags, advisorName: isAdmin && sessionForm.advisorName ? sessionForm.advisorName : log.advisorName };
            return log;
        });
        await updateEnrollment(selectedEnrollmentId, { sessionLogs: updatedLogs });
        
        await executeReload(); // DIRECTIVA_RECARGA
        if (selectedEnrollmentId) await fetchLatestLogs(selectedEnrollmentId); // Refresh local logs specific

        setEditingLogId(null); setEditingLogIndex(null); setSessionForm({ date: new Date().toISOString().split('T')[0], duration: 60, observation: '', location: '', modality: 'Presencial', tags: [], advisorName: '' }); setSignatureStep('form'); alert("Registro actualizado.");
    };

    const handleCancelEdit = () => { handleCancelSession(); };

    const handleDeleteSession = async (e: React.MouseEvent, logId: string | undefined, originalIndex: number) => {
        e.preventDefault();
        e.stopPropagation(); 

        if (!selectedEnrollmentId) return;
        
        if (window.confirm("¿Confirma que desea eliminar este registro de sesión del historial?")) {
            const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
            const currentLogs = realtimeLogs || enrollment?.sessionLogs || [];
            
            let updatedLogs: SessionLog[] = [];

            if (logId) {
                updatedLogs = currentLogs.filter(l => l.id !== logId);
            } else {
                updatedLogs = currentLogs.filter((_, i) => i !== originalIndex);
            }
            
            setRealtimeLogs(updatedLogs);
            
            try {
                await updateEnrollment(selectedEnrollmentId, { sessionLogs: updatedLogs });
                await executeReload(); 
                if (selectedEnrollmentId) await fetchLatestLogs(selectedEnrollmentId);
            } catch (err) {
                alert("Error al eliminar. Verifique su conexión.");
                fetchLatestLogs(selectedEnrollmentId);
            }
        }
    };

    const getQrUrl = () => { if (!selectedEnrollmentId || !currentSessionId) return ''; return `${window.location.origin}/?mode=sign&eid=${selectedEnrollmentId}&sid=${currentSessionId}`; };
    const handleCopyLink = () => { navigator.clipboard.writeText(getQrUrl()); alert("Enlace copiado al portapapeles."); };

    // --- POLLING FOR QR SIGNATURE ---
    useEffect(() => {
        let interval: any;
        if (signatureStep === 'qr-wait' && selectedEnrollmentId && currentSessionId) {
            const checkStatus = async () => {
                const { data } = await supabase.from('enrollments').select('session_logs').eq('id', selectedEnrollmentId).single();
                if (data && data.session_logs) {
                    const logs = data.session_logs as SessionLog[];
                    if (logs.find(l => l.id === currentSessionId && l.verified)) {
                        clearInterval(interval);
                        await updateEnrollment(selectedEnrollmentId, { sessionLogs: logs });
                        await executeReload(); 
                        setSignatureStep('success');
                        setTimeout(() => { setSessionForm({ date: new Date().toISOString().split('T')[0], duration: 60, observation: '', location: '', modality: 'Presencial', tags: [], advisorName: '' }); setSignatureStep('form'); }, 3000);
                    }
                }
            };
            interval = setInterval(checkStatus, 3000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [signatureStep, selectedEnrollmentId, currentSessionId]);

    // --- RENDER ---
    if (view === 'manage' && selectedEnrollmentId) {
        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        const student = users.find(u => u.rut === enrollment?.rut);
        const logs = realtimeLogs || enrollment?.sessionLogs || [];
        const studentTotalHours = (logs.reduce((acc, log) => acc + (log.duration || 0), 0) / 60).toFixed(1);

        return (
            <div className="animate-fadeIn max-w-6xl mx-auto space-y-6">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-20 z-40">
                    <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm font-bold">← Volver al Listado</button>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-200">
                            <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                            <span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Sincronizando...' : 'En Línea'}</span>
                        </div>
                        <button onClick={handleManualRefresh} className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 border border-indigo-200">Actualizar</button>
                    </div>
                </div>

                <div className="mt-8">
                    <div className="flex items-end gap-2 border-b border-indigo-200 pl-4 mb-0">
                        <button onClick={() => setManageTab('management')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 ${manageTab === 'management' ? 'bg-white text-indigo-700 border-t-indigo-600 shadow-sm z-10' : 'bg-slate-200 text-slate-600 border-transparent hover:bg-slate-100'}`}>GESTIÓN ASESORÍA</button>
                        <button onClick={() => setManageTab('tracking')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 ${manageTab === 'tracking' ? 'bg-white text-indigo-700 border-t-indigo-600 shadow-sm z-10' : 'bg-slate-200 text-slate-600 border-transparent hover:bg-slate-100'}`}>SEGUIMIENTO</button>
                    </div>

                    <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-indigo-200 border-t-0 p-8 animate-fadeIn">
                        {manageTab === 'management' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="space-y-6">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">{student?.names.charAt(0)}</div>
                                            <div><h2 className="text-lg font-bold text-slate-800 leading-tight">{student?.names} {student?.paternalSurname}</h2><p className="text-xs text-slate-500 font-mono">{student?.rut}</p></div>
                                        </div>
                                        <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
                                            <div><span className="block text-xs font-bold text-slate-400 uppercase">Correo</span><span className="text-slate-700">{student?.email}</span></div>
                                            <div><span className="block text-xs font-bold text-slate-400 uppercase">Unidad Académica</span><span className="text-slate-700">{student?.faculty}</span><span className="block text-xs text-slate-500">{student?.department}</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center">
                                        <h3 className="text-indigo-900 font-bold text-lg mb-1">Resumen Atención</h3>
                                        <div className="flex justify-center gap-4 mt-4">
                                            <div><span className="block text-2xl font-bold text-indigo-700">{logs.length}</span><span className="text-[10px] uppercase font-bold text-indigo-400">Sesiones</span></div>
                                            <div><span className="block text-2xl font-bold text-indigo-700">{studentTotalHours}</span><span className="text-[10px] uppercase font-bold text-indigo-400">Horas Tot.</span></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-2 space-y-6">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> {editingLogId || editingLogIndex !== null ? 'Editar Sesión Existente' : 'Registrar Nueva Sesión'}</h3>
                                            {(editingLogId || editingLogIndex !== null) && (<span className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-100">Modo Edición</span>)}
                                        </div>

                                        {signatureStep === 'form' && (
                                            <div className="animate-fadeIn">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Fecha</label><input type="date" value={sessionForm.date} onChange={e => setSessionForm({...sessionForm, date: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/></div>
                                                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Duración (Minutos)</label><select value={sessionForm.duration} onChange={e => setSessionForm({...sessionForm, duration: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"><option value={30}>30 Minutos</option><option value={60}>60 Minutos</option><option value={90}>90 Minutos</option><option value={120}>120 Minutos</option></select></div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Modalidad</label><select value={sessionForm.modality} onChange={e => setSessionForm({...sessionForm, modality: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="Presencial">Presencial</option><option value="Virtual">Virtual</option><option value="Correo Electrónico">Correo Electrónico</option></select></div>
                                                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Lugar / Plataforma</label><input type="text" placeholder="Ej. Oficina 304, Zoom, Email..." value={sessionForm.location} onChange={e => setSessionForm({...sessionForm, location: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/></div>
                                                </div>

                                                {/* NUEVO: CUADRO DESPLEGABLE DE ASESOR RESPONSABLE (SOLO ADMIN) */}
                                                {isAdmin && (
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Asesor Responsable de la Sesión</label>
                                                        <select 
                                                            name="advisorName"
                                                            value={sessionForm.advisorName} 
                                                            onChange={e => setSessionForm({...sessionForm, advisorName: e.target.value})} 
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                                        >
                                                            <option value="">Seleccionar Asesor...</option>
                                                            {advisorsList.map(adv => (
                                                                <option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>
                                                                    {adv.names} {adv.paternalSurname}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[10px] text-slate-400 mt-1 italic">Si se deja vacío, se asignará su nombre automáticamente.</p>
                                                    </div>
                                                )}

                                                <div className="mb-4"><label className="block text-xs font-bold text-slate-600 mb-1">Observaciones / Temática Tratada</label><textarea rows={6} value={sessionForm.observation} onChange={e => setSessionForm({...sessionForm, observation: e.target.value})} placeholder="Describa los puntos principales abordados en la sesión..." className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm resize-y"/></div>
                                                <div className="mb-4">
                                                    <div className="flex justify-between items-center mb-1"><label className="block text-xs font-bold text-slate-600">Etiquetas (Conceptos Clave)</label><button type="button" onClick={handleSuggestTags} disabled={isGeneratingTags} className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-full border border-indigo-200 flex items-center gap-1 transition-colors">{isGeneratingTags ? '...' : 'Sugerir Tags'}</button></div>
                                                    <div className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 bg-white flex flex-wrap gap-2 items-center min-h-[42px]">
                                                        {sessionForm.tags.map((tag, index) => (<span key={index} className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${getTagColor(tag)}`}>{tag}<button onClick={() => removeTag(tag)} className="hover:text-red-500 font-bold ml-1">×</button></span>))}
                                                        <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagInputKeyDown} placeholder={sessionForm.tags.length === 0 ? "Escribe conceptos y presiona Enter o Coma..." : "..."} className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"/>
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={handleCancelSession} className="bg-white border border-slate-300 text-slate-500 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-slate-700 transition-colors text-sm shadow-sm">Cancelar</button>
                                                    {editingLogId || editingLogIndex !== null ? (
                                                        <button onClick={handleSaveEdit} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-md text-sm flex items-center gap-2">Guardar Cambios</button>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            {isAdmin && (
                                                                <button onClick={handleSaveSF} className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-amber-700 transition-colors shadow-md text-sm flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                                    Guardar SF
                                                                </button>
                                                            )}
                                                            <button onClick={handleStartSignature} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md text-sm flex items-center gap-2">Generar QR para Firma</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {signatureStep === 'qr-wait' && (
                                            <div className="animate-fadeIn flex flex-col items-center justify-center py-6 space-y-6">
                                                <div className="bg-white p-2 rounded-xl shadow-lg border-2 border-indigo-100 relative">
                                                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getQrUrl())}`} alt="QR Firma" className="w-48 h-48"/>
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <div className="w-40 h-0.5 bg-red-500/30 animate-pulse"></div>
                                                    </div>
                                                </div>
                                                <div className="w-full max-w-sm">
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wide text-center mb-2">O comparte el enlace para firma remota:</p>
                                                    <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
                                                        <input type="text" readOnly value={getQrUrl()} className="flex-1 bg-transparent text-xs text-slate-600 font-mono outline-none px-1"/>
                                                        <button onClick={handleCopyLink} className="bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 p-1.5 rounded-md transition-colors" title="Copiar Enlace"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                                                    </div>
                                                </div>
                                                <button onClick={() => setSignatureStep('form')} className="px-4 py-2 text-xs text-red-500 font-bold hover:text-red-700 hover:underline">Cancelar Espera</button>
                                            </div>
                                        )}
                                        {signatureStep === 'success' && (<div className="animate-fadeIn flex flex-col items-center justify-center py-10 text-center"><h4 className="text-xl font-bold text-slate-800">Sesión Firmada Correctamente</h4></div>)}
                                    </div>

                                    {/* --- HISTORY LIST --- */}
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                                        <h3 className="font-bold text-slate-600 mb-4 uppercase text-xs tracking-wide">Historial de Acompañamiento</h3>
                                        {logs.length === 0 ? (
                                            <p className="text-slate-400 text-sm italic text-center py-8">No hay sesiones registradas aún.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {[...logs].reverse().map((log, idx) => {
                                                    const originalIndex = logs.length - 1 - idx;
                                                    const logTags = log.tags || [];
                                                    const isEditing = (editingLogId && log.id === editingLogId) || (editingLogIndex !== null && originalIndex === editingLogIndex);
                                                    
                                                    return (
                                                    <div key={log.id || originalIndex} className={`bg-white p-4 rounded-lg border shadow-sm relative pl-6 group transition-all ${isEditing ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}>
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.verified ? 'bg-green-500' : 'bg-amber-300'} rounded-l-lg`}></div>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <span className="text-sm font-bold text-indigo-700 block">{formatDateCL(log.date)}</span>
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs text-slate-400">Atendido por: {log.advisorName || 'Asesor'}</span>
                                                                    {(log.modality || log.location) && (<span className="text-[10px] text-slate-500 mt-0.5">{log.modality} {log.location ? `• ${log.location}` : ''}</span>)}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1.5 relative z-50">
                                                                <div className="flex items-center gap-1">
                                                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditLog(log, originalIndex); }} className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                                    <button type="button" onClick={(e) => handleDeleteSession(e, log.id, originalIndex)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                                </div>
                                                                <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-100">{log.duration} min</span>
                                                                {log.verified ? (
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded border border-green-100">Firma Digital</span>
                                                                        {log.authorizedByAdmin && <span className="text-[8px] font-black text-indigo-500 uppercase mt-0.5">Autorizado por ADMIN</span>}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Pendiente</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {logTags.length > 0 && (<div className="flex flex-wrap gap-1 mb-2">{logTags.map((t: string, i: number) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${getTagColor(t)} bg-opacity-50`}>{t}</span>))}</div>)}
                                                        <ExpandableText text={log.observation} />
                                                        {log.verified && (<div className="border-t border-slate-100 pt-2 flex justify-between items-center"><span className="text-[10px] font-mono text-slate-400">COD: {log.verificationCode}</span><button onClick={() => setShowVerificationModal(log)} className="text-[10px] text-blue-600 hover:underline font-bold flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Verificar Autenticidad</button></div>)}
                                                    </div>
                                                )})}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {manageTab === 'tracking' && (
                            <div className="animate-fadeIn">
                                <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                                    <h3 className="text-xl font-bold text-slate-500 mb-2">Módulo de Seguimiento Avanzado</h3>
                                    <p className="text-slate-400">Próximamente: Gráficos de evolución y análisis de impacto.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {showVerificationModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-white rounded-xl shadow-2xl p-6 relative w-full max-w-md text-center">
                            <button onClick={() => setShowVerificationModal(null)} className="absolute top-4 right-4 text-slate-400 font-bold">✕</button>
                            <h2 className="text-xl font-bold text-slate-800 mb-4">Código de Verificación</h2>
                            <div className="bg-slate-100 p-4 rounded-lg font-mono text-lg font-bold text-slate-700 tracking-wider mb-4">{showVerificationModal.verificationCode}</div>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify&code=${showVerificationModal.verificationCode}`)}`} alt="QR" className="mx-auto mb-4"/>
                            <p className="text-xs text-slate-500">Escanee para validar autenticidad.</p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-700 p-6 rounded-xl shadow-lg text-white">
                <div><h2 className="text-2xl font-bold">Bitácora de Asesorías</h2><p className="text-slate-300 text-sm mt-1">Gestión de acompañamiento individual docente.</p></div>
                <div className="flex gap-4 text-center">
                    <div className="px-4 border-r border-slate-600"><span className="block text-2xl font-bold text-indigo-400">{stats.students}</span><span className="text-[10px] uppercase font-bold text-slate-400">Docentes</span></div>
                    <div className="px-4 border-r border-slate-600"><span className="block text-2xl font-bold text-emerald-400">{stats.sessions}</span><span className="text-[10px] uppercase font-bold text-slate-400">Sesiones</span></div>
                    <div className="px-4"><span className="block text-2xl font-bold text-amber-400">{stats.hours}</span><span className="text-[10px] uppercase font-bold text-slate-400">Horas</span></div>
                </div>
                <button onClick={handleOpenEnrollModal} className="bg-white text-slate-800 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition-colors shadow-md flex items-center gap-2 text-sm"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Nuevo Expediente</button>
            </div>
            
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3"><svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg><h3 className="font-bold text-indigo-900 text-sm uppercase tracking-wide">Búsqueda Rápida de Expedientes</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative"><label className="block text-xs font-bold text-slate-600 mb-1">Buscar por RUT</label><input type="text" placeholder="Ingrese RUT..." value={searchRut} onChange={handleSearchRutChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/>{rutSuggestions.length > 0 && (<div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 z-20 max-h-48 overflow-y-auto">{rutSuggestions.map(s => (<button key={s.enrollmentId} onClick={() => selectSearchResult(s.enrollmentId)} className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"><span className="block font-bold text-slate-700 text-sm">{s.user.names} {s.user.paternalSurname}</span><span className="block text-xs text-slate-500 font-mono">{s.user.rut}</span></button>))}</div>)}</div>
                    <div className="relative"><label className="block text-xs font-bold text-slate-600 mb-1">Buscar por Apellido Paterno</label><input type="text" placeholder="Ingrese Apellido..." value={searchSurname} onChange={handleSearchSurnameChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/>{surnameSuggestions.length > 0 && (<div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 z-20 max-h-48 overflow-y-auto">{surnameSuggestions.map(s => (<button key={s.enrollmentId} onClick={() => selectSearchResult(s.enrollmentId)} className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"><span className="block font-bold text-slate-700 text-sm">{s.user.names} {s.user.paternalSurname}</span><span className="block text-xs text-slate-500 font-mono">{s.user.rut}</span></button>))}</div>)}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">Docente Asesorado</th>
                            <th className="px-6 py-4">Unidad Académica</th>
                            <th className="px-6 py-4">Asesor Responsable</th>
                            <th className="px-6 py-4 text-center">Sesiones</th>
                            <th className="px-6 py-4 text-center">Última Atención</th>
                            <th className="px-6 py-4 text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {advisoryEnrollments.map(enr => {
                            const user = users.find(u => u.rut === enr.rut);
                            const lastSession = enr.sessionLogs && enr.sessionLogs.length > 0 ? formatDateCL(enr.sessionLogs[enr.sessionLogs.length - 1].date) : '-';
                            const sessionCount = enr.sessionLogs?.length || 0;
                            const advisorDisplay = enr.responsible || (enr.sessionLogs && enr.sessionLogs.length > 0 ? enr.sessionLogs[0].advisorName : 'Sin Asignar');

                            return (
                                <tr key={enr.id} className="hover:bg-indigo-50/20 transition-colors">
                                    <td className="px-6 py-4"><div className="font-bold text-slate-800">{user?.names} {user?.paternalSurname}</div><div className="text-xs text-slate-500 font-mono">{enr.rut}</div></td>
                                    <td className="px-6 py-4 text-xs text-slate-600"><div className="font-bold">{user?.faculty || 'Sin Facultad'}</div><div>{user?.department}</div></td>
                                    <td className="px-6 py-4 text-xs font-bold text-indigo-700">{advisorDisplay}</td>
                                    <td className="px-6 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-bold ${sessionCount > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{sessionCount}</span></td>
                                    <td className="px-6 py-4 text-center text-slate-600 font-mono text-xs">{lastSession}</td>
                                    <td className="px-6 py-4 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => handleManageStudent(enr.id)} className="text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 bg-indigo-50 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">Gestionar Bitácora</button><button onClick={() => handleDeleteBitacora(enr.id, `${user?.names} ${user?.paternalSurname}`)} className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 bg-red-50 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors" title="Eliminar Expediente Completo"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></td>
                                </tr>
                            );
                        })}
                        {advisoryEnrollments.length === 0 && (<tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No hay expedientes de asesoría abiertos. Cree uno nuevo para comenzar.</td></tr>)}
                    </tbody>
                </table>
            </div>
            
            {showEnrollModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200"><div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10"><h3 className="text-lg font-bold text-slate-800">Apertura de Expediente (Ficha Base)</h3><button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button></div><form onSubmit={handleEnrollSubmit} className="p-8 space-y-6"> <div className="space-y-4"><h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wide border-b border-indigo-100 pb-1">1. Identificación del Docente</h4><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="md:col-span-1 relative"><label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label><input type="text" name="rut" value={enrollForm.rut} onChange={handleEnrollChange} onBlur={handleRutBlur} placeholder="12345678-9" autoComplete="off" className="w-full px-3 py-2 border border-slate-300 rounded font-bold text-sm focus:ring-2 focus:ring-indigo-500"/>{showSuggestions && suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">{suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span></div>))}</div>)}</div><div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" required value={enrollForm.names} onChange={e => setEnrollForm({...enrollForm, names: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div><div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" required value={enrollForm.paternalSurname} onChange={e => setEnrollForm({...enrollForm, paternalSurname: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div><div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" value={enrollForm.maternalSurname} onChange={e => setEnrollForm({...enrollForm, maternalSurname: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-slate-700 mb-1">Email</label><input type="email" value={enrollForm.email} onChange={e => setEnrollForm({...enrollForm, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div><div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" value={enrollForm.phone} onChange={e => setEnrollForm({...enrollForm, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded text-sm"/></div></div></div> <div className="space-y-4"><h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wide border-b border-indigo-100 pb-1">2. Antecedentes Institucionales</h4><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><SmartSelect label="Sede / Campus" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={(e) => setEnrollForm({...enrollForm, campus: e.target.value})} /><SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={(e) => setEnrollForm({...enrollForm, faculty: e.target.value})} /><SmartSelect label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={(e) => setEnrollForm({...enrollForm, department: e.target.value})} /><SmartSelect label="Carrera" name="career" value={enrollForm.career} options={listCareers} onChange={(e) => setEnrollForm({...enrollForm, career: e.target.value})} /><SmartSelect label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={(e) => setEnrollForm({...enrollForm, contractType: e.target.value})} /><SmartSelect label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={(e) => setEnrollForm({...enrollForm, academicRole: e.target.value})} /><div className="md:col-span-2"><label className="block text-xs font-medium text-slate-700 mb-1">Asesor Responsable</label><select name="responsible" value={enrollForm.responsible} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"><option value="">Seleccione Asesor...</option>{advisorsList.map(adv => (<option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>{adv.names} {adv.paternalSurname}</option>))}</select></div></div></div> <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 items-center"><button type="button" onClick={() => setShowEnrollModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold">Cancelar</button><button type="submit" disabled={isProcessing} className={`bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 ${isProcessing ? 'opacity-70 cursor-wait' : ''}`}>{isProcessing && (<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>)} Crear Expediente</button></div> {enrollMsg && (<div className={`mt-4 p-4 rounded-xl text-sm font-bold animate-fadeIn flex flex-col items-center gap-3 ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}><p className="text-center">{enrollMsg.text}</p>{enrollMsg.type === 'duplicate' && enrollMsg.existingId && (<button type="button" onClick={() => handleManageStudent(enrollMsg.existingId!)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-black uppercase text-xs shadow-lg transition-all transform active:scale-95 flex items-center gap-2 animate-bounce"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Ir al Expediente Existente</button>)}</div>)} </form></div></div>)}
        </div>
    );
};

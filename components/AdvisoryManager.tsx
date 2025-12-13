
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Enrollment, User, UserRole, Activity, SessionLog } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
import { supabase } from '../services/supabaseClient';
import { GoogleGenAI } from "@google/genai";

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

// --- COMPONENTE DE VERIFICACIÓN PÚBLICA (VISTA QR) ---
export const PublicVerification: React.FC<{ code: string }> = ({ code }) => {
    const [loading, setLoading] = useState(true);
    const [verifiedData, setVerifiedData] = useState<{log: SessionLog, student: any} | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const verifyCode = async () => {
            try {
                // CORRECCIÓN: Usar .contains en lugar de .ilike para columnas JSONB
                const { data, error } = await supabase
                    .from('enrollments')
                    .select('*, user:users(*)')
                    .contains('session_logs', JSON.stringify([{ verificationCode: code }]))
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                
                if (!data) {
                    throw new Error('El código no existe en nuestros registros.');
                }

                const logs = data.session_logs as SessionLog[];
                const targetLog = logs.find(l => l.verificationCode === code);

                if (!targetLog) throw new Error('Registro de sesión no coincide (Integridad de datos).');

                setVerifiedData({
                    log: targetLog,
                    student: data.user
                });
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

    if (loading) return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600"></div>
                <p className="text-slate-500 font-medium animate-pulse">Verificando autenticidad...</p>
            </div>
        </div>
    );

    if (error || !verifiedData) return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border-t-4 border-red-500">
                <div className="text-red-500 text-5xl mb-4 mx-auto w-fit">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Verificación Fallida</h2>
                <p className="text-slate-600 mb-6">{error}</p>
                <a href="/" className="text-indigo-600 hover:underline text-sm font-bold">Volver al inicio</a>
            </div>
        </div>
    );

    const { log, student } = verifiedData;

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide">
                        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        Certificado de Autenticidad
                    </h3>
                </div>
                <div className="p-6 flex flex-col items-center text-center">
                    <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-xl p-6 w-full">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h2 className="text-lg font-black text-green-800 uppercase tracking-tight leading-tight">
                            DOCUMENTO AUTÉNTICO
                        </h2>
                        <p className="text-sm text-green-700 font-bold mt-1">
                            Unidad de Acompañamiento Docente
                        </p>
                        <p className="text-xs text-green-600/80 mt-1">Universidad de Playa Ancha</p>
                    </div>
                    
                    <div className="w-full text-left bg-slate-50 rounded-lg border border-slate-200 p-5 space-y-4 text-sm">
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Código Único</span>
                            <span className="font-mono font-bold text-slate-800 bg-slate-200 px-2 rounded">{log.verificationCode}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-2 items-center">
                            <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Docente Atendido</span>
                            <div className="text-right">
                                <span className="font-bold text-slate-800 block">{student?.names} {student?.paternal_surname}</span>
                                <span className="text-xs text-slate-500 font-mono block">{student?.rut}</span>
                            </div>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Fecha Sesión</span>
                            <span className="font-bold text-slate-800">
                                {new Date(log.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Modalidad</span>
                            <span className="font-bold text-slate-800">{log.modality || 'Presencial'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Asesor Responsable</span>
                            <span className="font-bold text-indigo-700 text-right">{log.advisorName}</span>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Validación criptográfica segura mediante Supabase
                    </div>
                </div>
            </div>
        </div>
    );
};

interface AdvisoryManagerProps {
    currentUser?: User;
}

export const AdvisoryManager: React.FC<AdvisoryManagerProps> = ({ currentUser }) => {
    const { enrollments, users, addActivity, activities, upsertUsers, enrollUser, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
    
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
    
    // --- ESTADO PARA ACTUALIZACIÓN EN TIEMPO REAL (MULTI-USUARIO) ---
    const [realtimeLogs, setRealtimeLogs] = useState<SessionLog[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

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

    // --- ESTADOS PARA SUGERENCIAS EN MODAL ---
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // --- STATES PARA FIRMA DIGITAL REAL ---
    const [signatureStep, setSignatureStep] = useState<'form' | 'qr-wait' | 'success'>('form');
    const [currentSessionId, setCurrentSessionId] = useState<string>(''); // ID Real de la sesión pendiente
    const [showVerificationModal, setShowVerificationModal] = useState<SessionLog | null>(null);

    // --- ESTADO PARA EDICIÓN DE LOG ---
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [isGeneratingTags, setIsGeneratingTags] = useState(false);

    // Estados de Bitácora (Sesiones) - ACTUALIZADO CON ETIQUETAS
    const [sessionForm, setSessionForm] = useState<{
        date: string;
        duration: number;
        observation: string;
        location: string;
        modality: string;
        tags: string[]; // Nuevo campo para etiquetas
    }>({
        date: new Date().toISOString().split('T')[0],
        duration: 60,
        observation: '',
        location: '',
        modality: 'Presencial',
        tags: []
    });
    const [tagInput, setTagInput] = useState(''); // Estado local para el input de etiquetas

    // --- ESTADO DE PESTAÑAS EN VISTA GESTIÓN ---
    const [manageTab, setManageTab] = useState<'management' | 'tracking'>('management');

    // --- CLICK OUTSIDE FOR SUGGESTIONS ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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

    // --- LÓGICA DE SINCRONIZACIÓN REALTIME (MULTI-USUARIO) ---
    // Cuando cambiamos de estudiante, limpiamos los logs "live"
    useEffect(() => {
        setRealtimeLogs(null);
    }, [selectedEnrollmentId]);

    // Función auxiliar para refrescar logs manualmente
    const fetchLatestLogs = async (id: string) => {
        setIsSyncing(true);
        const { data, error } = await supabase
            .from('enrollments')
            .select('session_logs')
            .eq('id', id)
            .single();
        
        if (data && data.session_logs) {
            setRealtimeLogs(data.session_logs as SessionLog[]);
        }
        setTimeout(() => setIsSyncing(false), 500);
    };

    // Suscripción específica a la bitácora que estamos viendo
    useEffect(() => {
        if (view !== 'manage' || !selectedEnrollmentId) return;

        console.log(`🔌 Conectando a canal de actualizaciones para ID: ${selectedEnrollmentId}`);

        // Crear un canal con nombre único para evitar colisiones
        const channel = supabase.channel(`advisory-sync-${selectedEnrollmentId}`)
            .on(
                'postgres_changes',
                // Escuchamos TODOS los UPDATEs en la tabla enrollment (sin filtro server-side para evitar problemas de formato UUID)
                { event: 'UPDATE', schema: 'public', table: 'enrollments' },
                async (payload) => {
                    // Filtramos en el cliente para asegurarnos que es el registro que nos interesa
                    if (payload.new && payload.new.id === selectedEnrollmentId) {
                        console.log("⚡ Cambio detectado en tiempo real. Actualizando bitácora...");
                        await fetchLatestLogs(selectedEnrollmentId);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // Carga inicial al suscribirse para asegurar frescura
                    fetchLatestLogs(selectedEnrollmentId);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [view, selectedEnrollmentId]);

    const handleManualRefresh = async () => {
        setIsSyncing(true);
        await refreshData();
        if (selectedEnrollmentId) {
            await fetchLatestLogs(selectedEnrollmentId);
        }
        setTimeout(() => setIsSyncing(false), 800);
    };


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

    // --- HANDLERS GESTIÓN (MODIFICADO PARA SUGERENCIAS) ---

    const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEnrollForm(prev => ({ ...prev, [name]: value }));

        if (name === 'rut') {
            const rawInput = value.replace(/[^0-9kK]/g, '').toLowerCase();
            if (rawInput.length >= 2) {
                const matches = users.filter(u =>
                    u.rut.replace(/[^0-9kK]/g, '').toLowerCase().includes(rawInput)
                );
                setSuggestions(matches.slice(0, 5)); // Limit to 5
                setShowSuggestions(matches.length > 0);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }
    };

    const handleSelectSuggestion = (user: User) => {
        setEnrollForm(prev => ({
            ...prev,
            rut: user.rut,
            names: user.names,
            paternalSurname: user.paternalSurname,
            maternalSurname: user.maternalSurname || '',
            email: user.email || '',
            phone: user.phone || '',
            academicRole: user.academicRole || '',
            faculty: user.faculty || '',
            department: user.department || '',
            career: user.career || '',
            contractType: user.contractType || '',
            teachingSemester: user.teachingSemester || '',
            campus: user.campus || '',
            systemRole: user.systemRole
        }));
        setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
        setShowSuggestions(false);
    };

    const handleOpenEnrollModal = () => {
        setEnrollForm({
            rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
            academicRole: '', faculty: '', department: '', career: '', contractType: '',
            teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
        });
        setEnrollMsg(null);
        setIsProcessing(false);
        setShowEnrollModal(true);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleRutBlur = () => {
        // Small delay to allow click on suggestion
        setTimeout(() => {
            if (!enrollForm.rut) return;
            const formatted = cleanRutFormat(enrollForm.rut);
            setEnrollForm(prev => ({...prev, rut: formatted}));
            
            const existing = getUser(formatted);
            if (existing) {
                // ... same logic as before for consistency
                setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
            }
        }, 200);
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
            modality: 'Presencial',
            tags: [] 
        });
        setTagInput('');
        setSignatureStep('form');
        setManageTab('management'); // Reset tab to management
        setEditingLogId(null); // Reset editing mode
        setView('manage');
    };

    const handleDeleteBitacora = async (id: string, name: string) => {
        if(window.confirm(`ADVERTENCIA: ¿Está seguro que desea eliminar la bitácora completa de ${name}?\n\nEsta acción eliminará todas las sesiones registradas y no se puede deshacer.`)) {
            await deleteEnrollment(id);
        }
    };

    // --- TAG INPUT HANDLERS ---
    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = tagInput.trim().replace(/,/g, '');
            if (newTag && !sessionForm.tags.includes(newTag)) {
                setSessionForm(prev => ({
                    ...prev,
                    tags: [...prev.tags, newTag]
                }));
                setTagInput('');
            }
        }
    };

    const removeTag = (tagToRemove: string) => {
        setSessionForm(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    // --- AI TAG SUGGESTION HANDLER ---
    const handleSuggestTags = async () => {
        if (!sessionForm.observation || sessionForm.observation.trim().length < 5) {
            alert("Por favor ingrese una observación más detallada para generar etiquetas.");
            return;
        }

        setIsGeneratingTags(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
            
            const prompt = `Analiza el siguiente texto de una asesoría académica y extrae 3 etiquetas clave breves (1-2 palabras) que resuman los temas tratados. Devuelve SOLO las etiquetas separadas por comas, sin numeración ni texto adicional. Texto: "${sessionForm.observation}"`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            if (text) {
                const newTags = text.split(',').map(t => t.trim()).filter(t => t.length > 0);
                // Merge unique tags
                const mergedTags = Array.from(new Set([...sessionForm.tags, ...newTags]));
                setSessionForm(prev => ({ ...prev, tags: mergedTags.slice(0, 5) })); // Limit to 5 max
            }
        } catch (error) {
            console.error("Error generating tags:", error);
            // Fallback mock simple si no hay API key o error
            if (!process.env.API_KEY) {
                alert("Nota: Para usar sugerencias IA, configure su API Key. Se usarán etiquetas de ejemplo.");
                setSessionForm(prev => ({ ...prev, tags: [...prev.tags, "Planificación", "Evaluación", "Estrategias"] }));
            }
        } finally {
            setIsGeneratingTags(false);
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

        // CASTEO EXPLICITO: Para agregar 'tags' sin cambiar types.ts globalmente
        const newLog: any = {
            id: sessionId,
            date: sessionForm.date,
            duration: sessionForm.duration,
            observation: sessionForm.observation,
            // UPDATED: Now saves Full Name + Paternal Surname
            advisorName: currentUser ? `${currentUser.names} ${currentUser.paternalSurname}` : 'Asesor',
            verified: false, // Pendiente
            signedAt: undefined,
            location: sessionForm.location, // Nuevo campo
            modality: sessionForm.modality,  // Nuevo campo
            tags: sessionForm.tags // Nuevo campo etiquetas
        };

        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        const currentLogs = enrollment?.sessionLogs || [];
        
        // Guardamos en BD para que el estudiante pueda encontrarla
        await updateEnrollment(selectedEnrollmentId, { sessionLogs: [...currentLogs, newLog] });
        
        setSignatureStep('qr-wait');
    };

    // --- EDICIÓN DE HISTORIAL ---
    const handleEditLog = (log: any) => {
        setEditingLogId(log.id);
        setSessionForm({
            date: log.date,
            duration: log.duration,
            observation: log.observation,
            location: log.location || '',
            modality: log.modality || 'Presencial',
            tags: log.tags || []
        });
        setTagInput('');
        setSignatureStep('form');
        // Scroll top to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveEdit = async () => {
        if (!selectedEnrollmentId || !editingLogId) return;
        
        const enrollment = enrollments.find(e => e.id === selectedEnrollmentId);
        if (!enrollment) return;

        const currentLogs = enrollment.sessionLogs || [];
        const updatedLogs = currentLogs.map(log => {
            if (log.id === editingLogId) {
                // Actualizamos campos editables pero mantenemos la firma si existe
                return {
                    ...log,
                    date: sessionForm.date,
                    duration: sessionForm.duration,
                    observation: sessionForm.observation,
                    location: sessionForm.location,
                    modality: sessionForm.modality,
                    tags: sessionForm.tags
                };
            }
            return log;
        });

        await updateEnrollment(selectedEnrollmentId, { sessionLogs: updatedLogs });
        
        // Reset form
        setEditingLogId(null);
        setSessionForm({ 
            date: new Date().toISOString().split('T')[0], 
            duration: 60, 
            observation: '',
            location: '',
            modality: 'Presencial',
            tags: []
        });
        setSignatureStep('form');
        alert("Registro de sesión actualizado correctamente.");
    };

    const handleCancelEdit = () => {
        setEditingLogId(null);
        setSessionForm({ 
            date: new Date().toISOString().split('T')[0], 
            duration: 60, 
            observation: '',
            location: '',
            modality: 'Presencial',
            tags: []
        });
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
                                    modality: 'Presencial',
                                    tags: []
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
        
        // --- REALTIME OVERRIDE ---
        // Si tenemos datos en tiempo real (prioridad), los usamos. Si no, usamos el contexto (que puede tener lag).
        const logs = realtimeLogs || enrollment?.sessionLogs || [];

        // Calcular total horas de este estudiante
        const studentTotalHours = (logs.reduce((acc, log) => acc + (log.duration || 0), 0) / 60).toFixed(1);

        return (
            <div className="animate-fadeIn max-w-6xl mx-auto space-y-6">
                
                {/* --- CABECERA CON BOTÓN ACTUALIZAR E INDICADOR --- */}
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-20 z-40">
                    <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm font-bold">
                        ← Volver al Listado
                    </button>
                    
                    <div className="flex items-center gap-4">
                        {/* Indicador de Conexión */}
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-200">
                            <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                            <span className="text-[10px] font-bold uppercase text-slate-500">
                                {isSyncing ? 'Sincronizando...' : 'En Línea'}
                            </span>
                        </div>

                        {/* Botón Actualizar */}
                        <button 
                            onClick={handleManualRefresh}
                            className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-200"
                            title="Forzar actualización de datos"
                        >
                            <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Actualizar
                        </button>
                    </div>
                </div>

                {/* --- PESTAÑAS DE NAVEGACIÓN Y CAJA CONTENEDORA --- */}
                <div className="mt-8">
                    <div className="flex items-end gap-2 border-b border-indigo-200 pl-4 mb-0">
                        <button 
                            onClick={() => setManageTab('management')} 
                            className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${manageTab === 'management' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-indigo-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}
                        >
                            GESTIÓN ASESORÍA
                        </button>
                        <button 
                            onClick={() => setManageTab('tracking')} 
                            className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${manageTab === 'tracking' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-indigo-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}
                        >
                            SEGUIMIENTO
                        </button>
                    </div>

                    <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-indigo-200 border-t-0 p-8 animate-fadeIn">
                        {manageTab === 'management' && (
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
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                {editingLogId ? 'Editar Sesión Existente' : 'Registrar Nueva Sesión'}
                                            </h3>
                                            {editingLogId && (
                                                <button onClick={handleCancelEdit} className="text-xs text-red-500 hover:text-red-700 underline font-bold">
                                                    Cancelar Edición
                                                </button>
                                            )}
                                        </div>

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

                                                {/* CAMPO DE ETIQUETAS (REUBICADO ABAJO DE OBSERVACIONES) */}
                                                <div className="mb-4">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="block text-xs font-bold text-slate-600">Etiquetas (Conceptos Clave)</label>
                                                        <button 
                                                            type="button" 
                                                            onClick={handleSuggestTags}
                                                            disabled={isGeneratingTags}
                                                            className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-full border border-indigo-200 flex items-center gap-1 transition-colors"
                                                            title="Sugerir etiquetas con IA basado en las observaciones"
                                                        >
                                                            {isGeneratingTags ? (
                                                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                            ) : (
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                            )}
                                                            Sugerir Tags IA
                                                        </button>
                                                    </div>
                                                    <div className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 bg-white flex flex-wrap gap-2 items-center min-h-[42px]">
                                                        {sessionForm.tags.map((tag, index) => (
                                                            <span key={index} className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${getTagColor(tag)}`}>
                                                                {tag}
                                                                <button onClick={() => removeTag(tag)} className="hover:text-red-500 font-bold ml-1">×</button>
                                                            </span>
                                                        ))}
                                                        <input 
                                                            type="text" 
                                                            value={tagInput}
                                                            onChange={(e) => setTagInput(e.target.value)}
                                                            onKeyDown={handleTagInputKeyDown}
                                                            placeholder={sessionForm.tags.length === 0 ? "Escribe conceptos y presiona Enter o Coma..." : "..."}
                                                            className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-1">Separa conceptos con coma (,) o Enter.</p>
                                                </div>

                                                <div className="flex justify-end">
                                                    {editingLogId ? (
                                                        <button 
                                                            onClick={handleSaveEdit} 
                                                            className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-md text-sm flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                            Guardar Cambios
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={handleStartSignature} 
                                                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md text-sm flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 17h.01M9 20h.01M12 20h.01M15 20h.01M15 17h.01M15 14h.01M9 17h.01M9 14h.01M6 20h.01M6 17h.01" /></svg>
                                                            Generar QR para Firma
                                                        </button>
                                                    )}
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
                                                    // @ts-ignore - Handle potential missing tags array in old records
                                                    const logTags = log.tags || [];
                                                    const isEditing = editingLogId === log.id;
                                                    
                                                    return (
                                                    <div key={log.id || idx} className={`bg-white p-4 rounded-lg border shadow-sm relative pl-6 group transition-all ${isEditing ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}>
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.verified ? 'bg-green-500' : 'bg-amber-300'} rounded-l-lg`}></div>
                                                        
                                                        {/* Actions Container */}
                                                        <div className="absolute top-4 right-4 flex items-center gap-2">
                                                            {/* Edit Button */}
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    handleEditLog(log); 
                                                                }}
                                                                className="text-slate-300 hover:text-blue-500 transition-colors z-10 cursor-pointer"
                                                                title="Editar sesión"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                            </button>

                                                            {/* Delete Session Button */}
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    // Pass index if id is missing, or prefer ID if present
                                                                    handleDeleteSession(log.id ? log.id : originalIndex); 
                                                                }}
                                                                className="text-slate-300 hover:text-red-500 transition-colors z-10 cursor-pointer"
                                                                title="Eliminar registro de sesión"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>

                                                        <div className="flex justify-between items-start mb-2 pr-14">
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
                                                        
                                                        {logTags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                {logTags.map((t: string, i: number) => (
                                                                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${getTagColor(t)} bg-opacity-50`}>{t}</span>
                                                                ))}
                                                            </div>
                                                        )}

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
                        )}

                        {manageTab === 'tracking' && (
                            <div className="animate-fadeIn">
                                {/* SECCIÓN NUBE DE PALABRAS (CONCEPTOS CLAVE) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mb-6">
                                    <h3 className="font-bold text-slate-700 text-lg mb-4 flex items-center gap-2">
                                        <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                        Conceptos Clave Trabajados (Nube de Etiquetas)
                                    </h3>
                                    
                                    {(() => {
                                        // Calcular frecuencias
                                        const tagCounts: Record<string, number> = {};
                                        let maxCount = 0;
                                        logs.forEach(log => {
                                            // @ts-ignore
                                            if (log.tags && Array.isArray(log.tags)) {
                                                // @ts-ignore
                                                log.tags.forEach(tag => {
                                                    const normalized = tag.trim(); // Podríamos hacer toLowerCase() si queremos agrupar
                                                    tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
                                                    if (tagCounts[normalized] > maxCount) maxCount = tagCounts[normalized];
                                                });
                                            }
                                        });

                                        const tags = Object.entries(tagCounts);

                                        if (tags.length === 0) {
                                            return (
                                                <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                                                    <p className="text-slate-400">No se han registrado etiquetas en las sesiones aún.</p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="flex flex-wrap items-center justify-center gap-4 p-6 bg-slate-50 rounded-xl border border-slate-100">
                                                {tags.map(([tag, count]) => {
                                                    // Calcular tamaño: base 0.8rem + factor
                                                    // Si maxCount es 1, todos tendrán tamaño base.
                                                    const fontSize = maxCount > 1 
                                                        ? 0.8 + (count / maxCount) * 1.5 
                                                        : 1; 
                                                    
                                                    return (
                                                        <span 
                                                            key={tag} 
                                                            className={`font-bold px-3 py-1 rounded-full transition-all hover:scale-110 cursor-default shadow-sm border ${getTagColor(tag)}`}
                                                            style={{ fontSize: `${fontSize}rem` }}
                                                            title={`${count} sesiones`}
                                                        >
                                                            {tag}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                                    <div className="mb-4 text-slate-300 mx-auto w-fit">
                                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-500 mb-2">Módulo de Seguimiento Avanzado</h3>
                                    <p className="text-slate-400">Próximamente: Gráficos de evolución y análisis de impacto.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* MODAL CERTIFICADO DE AUTENTICIDAD */}
                {showVerificationModal && (
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
                                    {/* MODIFIED: QR ahora apunta a la ruta de verificación pública (?mode=verify) */}
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify&code=${showVerificationModal.verificationCode}`)}`} 
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
                                    <div className="md:col-span-1 relative">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                        <input 
                                            type="text" 
                                            name="rut"
                                            value={enrollForm.rut} 
                                            onChange={handleEnrollChange} 
                                            onBlur={handleRutBlur} 
                                            placeholder="12345678-9" 
                                            autoComplete="off"
                                            className="w-full px-3 py-2 border border-slate-300 rounded font-bold text-sm focus:ring-2 focus:ring-indigo-500"
                                        />
                                        {/* Suggestions Dropdown */}
                                        {showSuggestions && suggestions.length > 0 && (
                                            <div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">
                                                {suggestions.map((s) => (
                                                    <div 
                                                        key={s.rut} 
                                                        onMouseDown={() => handleSelectSuggestion(s)} 
                                                        className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"
                                                    >
                                                        <span className="font-bold block text-slate-800">{s.rut}</span>
                                                        <span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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

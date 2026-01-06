import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Activity, User, UserRole, Enrollment, ActivityState } from '../types';
import { GENERAL_ACTIVITY_TYPES, ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';
import { SmartSelect } from './SmartSelect';
import { suggestCompetencies, CompetencySuggestion } from '../services/geminiService';
// @ts-ignore
import { read, utils } from 'xlsx';
import { useReloadDirective } from '../hooks/useReloadDirective';

interface GeneralActivityManagerProps {
    currentUser: User;
}

type ViewState = 'list' | 'create' | 'edit' | 'details';
type TabType = 'details' | 'attendance';

const TYPE_PREFIXES: Record<string, string> = {
    "Charla": "CHA",
    "Taller": "TAL",
    "Reunión": "REU",
    "Capacitación": "CAP",
    "Seminario": "SEM",
    "Foro": "FOR",
    "Webinar": "WEB",
    "Otro": "OTR"
};

const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

export const GeneralActivityManager: React.FC<GeneralActivityManagerProps> = ({ currentUser }) => {
    const { activities, addActivity, deleteActivity, enrollments, users, getUser, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, config, refreshData } = useData();
    const { isSyncing, executeReload } = useReloadDirective();

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    
    const advisors = useMemo(() => users.filter(u => u.systemRole === UserRole.ASESOR), [users]);

    const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
    const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
    const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
    const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
    const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
    const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "Online"];
    const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

    const generalActivities = activities.filter(a => a.category === 'GENERAL' && a.year === selectedYear);
    
    const [view, setView] = useState<ViewState>('list');
    const [activeTab, setActiveTab] = useState<TabType>('details');
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        internalCode: '', year: new Date().getFullYear(), semester: '2025-1', version: 'V1', activityType: 'Charla', otherType: '',
        nombre: '', modality: 'Presencial', horas: 0, relator: '', fechaInicio: '', fechaTermino: '',
        linkRecursos: '', linkClase: '', linkEvaluacion: '', isPublic: true,
        competencyCodes: [] as string[]
    });

    // IA States
    const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
    const [isAnalyzingIA, setIsAnalyzingIA] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<CompetencySuggestion[]>([]);
    const [showAiReview, setShowAiReview] = useState(false);

    // Enrollment Form States
    const [enrollForm, setEnrollForm] = useState({
        rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
        academicRole: '', faculty: '', department: '', career: '', contractType: '',
        teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE, responsible: ''
    });
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const suggestionClickedRef = useRef(false);
    const [isFoundInMaster, setIsFoundInMaster] = useState(false);
    const [enrollMsg, setEnrollMsg] = useState<{ type: 'success'|'error', text: string } | null>(null);
    
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [hasHeaders, setHasHeaders] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const isAdmin = currentUser.systemRole === UserRole.ADMIN;
    const isAdvisor = currentUser.systemRole === UserRole.ASESOR;

    const sortedActivityEnrollments = useMemo(() => {
        const filtered = selectedActivity ? enrollments.filter(e => e.activityId === selectedActivity.id) : [];
        return [...filtered].sort((a, b) => {
            const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
            const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
            return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '', 'es');
        });
    }, [selectedActivity, enrollments, users]);

    useEffect(() => {
        if (view === 'create' || view === 'edit') {
            const prefix = TYPE_PREFIXES[formData.activityType] || "ACT";
            let d = "", m = "", y = "";
            if (formData.fechaInicio) {
                const parts = formData.fechaInicio.split('-');
                if (parts.length === 3) { y = parts[0]; m = parts[1]; d = parts[2]; }
            } else {
                const today = new Date();
                d = String(today.getDate()).padStart(2, '0');
                m = String(today.getMonth() + 1).padStart(2, '0');
                y = String(today.getFullYear());
            }
            if (d && m && y) {
                const verSuffix = formData.version ? `-${formData.version}` : '';
                const semSuffix = formData.semester.includes('1') ? '-S1' : formData.semester.includes('2') ? '-S2' : '';
                const autoCode = `${prefix}-${d}${m}${y.slice(2)}${verSuffix}${semSuffix}`;
                if (view === 'create') setFormData(prev => ({ ...prev, internalCode: autoCode }));
            }
        }
    }, [formData.activityType, formData.fechaInicio, formData.version, formData.semester, view]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) setShowSuggestions(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleEdit = (act: Activity) => {
        setSelectedActivity(act);
        setFormData({
            internalCode: act.internalCode || '',
            year: act.year || new Date().getFullYear(),
            semester: act.academicPeriod || '',
            version: act.version || 'V1',
            activityType: GENERAL_ACTIVITY_TYPES.includes(act.activityType || '') ? (act.activityType || 'Charla') : 'Otro',
            otherType: !GENERAL_ACTIVITY_TYPES.includes(act.activityType || '') ? (act.activityType || '') : '',
            nombre: act.name,
            modality: act.modality,
            horas: act.hours,
            relator: act.relator || '',
            fechaInicio: act.startDate || '',
            fechaTermino: act.endDate || '',
            linkRecursos: act.linkResources || '',
            linkClase: act.classLink || '',
            linkEvaluacion: act.evaluationLink || '',
            isPublic: act.isPublic !== false,
            competencyCodes: act.competencyCodes || []
        });
        setSyllabusFile(null);
        setActiveTab('details'); 
        setView('edit');
    };

    const handleToggleCompetence = (code: string) => {
        setFormData(prev => ({
            ...prev,
            competencyCodes: prev.competencyCodes.includes(code)
                ? prev.competencyCodes.filter(c => c !== code)
                : [...prev.competencyCodes, code]
        }));
    };

    const handleAnalyzeSyllabus = async () => {
        if (!syllabusFile) { alert("Por favor suba primero el programa (PDF o TXT)."); return; }
        setIsAnalyzingIA(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const simulatedText = `Análisis de programa: ${syllabusFile.name}. Contenido pedagógico simulado para sugerir competencias UPLA.`;
                const suggestions = await suggestCompetencies(simulatedText);
                if (suggestions.length > 0) {
                    setAiSuggestions(suggestions);
                    setShowAiReview(true);
                } else {
                    alert("La IA no ha podido identificar tributaciones claras en el programa proporcionado.");
                }
                setIsAnalyzingIA(false);
            };
            if (syllabusFile.type.includes('pdf')) reader.readAsArrayBuffer(syllabusFile);
            else reader.readAsText(syllabusFile);
        } catch (err) {
            alert("Error al conectar con Gemini AI.");
            setIsAnalyzingIA(false);
        }
    };

    const applyAiSuggestions = () => {
        const suggestedCodes = aiSuggestions.map(s => s.code);
        setFormData(prev => ({
            ...prev,
            competencyCodes: Array.from(new Set([...prev.competencyCodes, ...suggestedCodes]))
        }));
        setShowAiReview(false);
        setAiSuggestions([]);
        alert("Competencias aplicadas exitosamente.");
    };

    const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEnrollForm(prev => ({ ...prev, [name]: value }));
        if (name === 'rut') {
            setIsFoundInMaster(false); setEnrollMsg(null);
            const rawInput = normalizeRut(value);
            if (rawInput.length >= 2) { 
                const matches = users.filter(u => normalizeRut(u.rut).includes(rawInput));
                setSuggestions(matches.slice(0, 5)); setShowSuggestions(matches.length > 0);
            } else { setSuggestions([]); setShowSuggestions(false); }
        }
    };

    const handleSelectSuggestion = (user: User) => {
        suggestionClickedRef.current = true;
        setEnrollForm({
            rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole, responsible: ''
        });
        setIsFoundInMaster(true); setShowSuggestions(false); setSuggestions([]);
        setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
        setTimeout(() => { suggestionClickedRef.current = false; }, 300);
    };

    const handleRutBlur = () => {
        setTimeout(() => {
            if (suggestionClickedRef.current) return;
            if (showSuggestions) setShowSuggestions(false);
            if (!enrollForm.rut) return;
            
            const formatted = cleanRutFormat(enrollForm.rut);
            const rawSearch = normalizeRut(formatted);
            setEnrollForm(prev => ({ ...prev, rut: formatted }));
            
            const masterUser = users.find(u => normalizeRut(u.rut) === rawSearch);
            if (masterUser) {
                handleSelectSuggestion(masterUser);
            }
        }, 200);
    };

    const handleEnrollSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedActivity) return;
        if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname) {
            setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios (*).' }); return;
        }
        setIsProcessing(true);
        const formattedRut = cleanRutFormat(enrollForm.rut);
        const userToUpsert: User = { ...enrollForm, rut: formattedRut, systemRole: enrollForm.systemRole as UserRole };
        try {
            await upsertUsers([userToUpsert]);
            await enrollUser(formattedRut, selectedActivity.id);
            await executeReload();
            setEnrollMsg({ type: 'success', text: 'Participante registrado exitosamente.' });
            setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE, responsible: '' });
            setIsFoundInMaster(false);
        } catch (error: any) { setEnrollMsg({ type: 'error', text: `Error: ${error.message}` });
        } finally { setIsProcessing(false); }
    };

    const handleUnenrollFromList = async (enrollmentId: string, studentName: string) => {
        if (confirm(`¿Confirma que desea desmatricular a ${studentName} de esta actividad?\n\nEl registro del estudiante permanecerá en la Base Maestra.`)) {
            try {
                await deleteEnrollment(enrollmentId);
                await executeReload();
                setEnrollMsg({ type: 'success', text: 'Participante desmatriculado correctamente.' });
                setTimeout(() => setEnrollMsg(null), 3000);
            } catch (err) {
                alert("Error al desmatricular.");
            }
        }
    };

    const handleBulkUpload = () => {
        if (!uploadFile || !selectedActivity) return;
        setIsProcessing(true);
        const reader = new FileReader();
        const isExcel = uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls');

        reader.onload = async (e) => {
            try {
                let rows: any[][] = [];
                if (isExcel) {
                    const data = e.target?.result;
                    const workbook = read(data, { type: 'array' });
                    rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                } else {
                    const text = e.target?.result as string;
                    const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
                    if (lines.length > 0) {
                        const delimiter = lines[0].includes(';') ? ';' : ',';
                        rows = lines.map(line => line.split(delimiter));
                    }
                }
                if (rows.length < 1) {
                    setIsProcessing(false);
                    return;
                }

                const processedRuts = new Set<string>();
                const currentEnrolledRuts = new Set(enrollments.filter(enr => enr.activityId === selectedActivity.id).map(enr => normalizeRut(enr.rut)));
                const usersToUpsert: User[] = [];
                const rutsToEnroll: string[] = [];
                let startRow = hasHeaders ? 1 : 0;

                for (let i = startRow; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;
                    const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
                    if (!rowStrings[0]) continue;

                    const cleanRut = cleanRutFormat(rowStrings[0]);
                    const normRut = normalizeRut(cleanRut);
                    
                    if (processedRuts.has(normRut)) continue;
                    processedRuts.add(normRut);

                    if (!currentEnrolledRuts.has(normRut)) {
                        rutsToEnroll.push(cleanRut);
                    }

                    const masterUser = users.find(u => normalizeRut(u.rut) === normRut);
                    const hasNameInRow = rowStrings[1] && rowStrings[1].length > 1;

                    if (hasNameInRow || !masterUser) {
                        usersToUpsert.push({
                            rut: cleanRut,
                            names: (rowStrings[1] || masterUser?.names || 'Pendiente').trim(),
                            paternalSurname: (rowStrings[2] || masterUser?.paternalSurname || 'Pendiente').trim(),
                            maternalSurname: (rowStrings[3] || masterUser?.maternalSurname || '').trim(),
                            email: (rowStrings[4] || masterUser?.email || '').trim(),
                            phone: (rowStrings[5] || masterUser?.phone || '').trim(),
                            academicRole: normalizeValue(rowStrings[6] || masterUser?.academicRole || '', listRoles),
                            faculty: normalizeValue(rowStrings[7] || masterUser?.faculty || '', listFaculties),
                            department: normalizeValue(rowStrings[8] || masterUser?.department || '', listDepts),
                            career: normalizeValue(rowStrings[9] || masterUser?.career || '', listCareers),
                            contractType: normalizeValue(rowStrings[10] || masterUser?.contractType || '', listContracts),
                            teachingSemester: normalizeValue(rowStrings[11] || masterUser?.teachingSemester || '', listSemesters),
                            campus: (rowStrings[12] || masterUser?.campus || '').trim(),
                            systemRole: masterUser?.systemRole || UserRole.ESTUDIANTE
                        });
                    }
                }

                if (usersToUpsert.length > 0) {
                    await upsertUsers(usersToUpsert);
                }
                
                if (rutsToEnroll.length > 0) {
                    const result = await bulkEnroll(rutsToEnroll, selectedActivity.id);
                    await executeReload();
                    setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos.` });
                } else {
                    setEnrollMsg({ type: 'success', text: 'No hay nuevos participantes para matricular.' });
                }
            } catch (err: any) {
                setEnrollMsg({ type: 'error', text: `Error al matricular: ${err.message}` });
            } finally {
                setIsProcessing(false);
                setUploadFile(null);
            }
        };
        if (isExcel) reader.readAsArrayBuffer(uploadFile);
        else reader.readAsText(uploadFile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const finalType = formData.activityType === 'Otro' ? formData.otherType : formData.activityType;
        const finalCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
        const generatedId = selectedActivity ? selectedActivity.id : finalCode;
        const activityToSave: Activity = {
            id: generatedId, category: 'GENERAL', activityType: finalType, internalCode: finalCode, year: formData.year, academicPeriod: formData.semester, version: formData.version, name: formData.nombre, modality: formData.modality, hours: formData.horas, relator: formData.relator, startDate: formData.fechaInicio, endDate: formData.fechaTermino, linkResources: formData.linkRecursos, classLink: formData.linkClase, evaluationLink: formData.linkEvaluacion, isPublic: formData.isPublic, competencyCodes: formData.competencyCodes
        };
        try {
            await addActivity(activityToSave); await executeReload(); setView('list'); setSelectedActivity(null);
        } catch (err) { alert("Error al guardar."); }
    };

    if (view === 'list') {
        return (
            <div className="animate-fadeIn space-y-6">
                 <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Gestión de Actividades Generales</h2>
                        <p className="text-sm text-slate-500">Charlas, Talleres y eventos de extensión.</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-200 shadow-inner group">
                            <label className="text-[10px] font-black text-slate-400 uppercase mr-3">Periodo:</label>
                            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="text-sm font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase">
                                <option value={currentYear}>{currentYear}</option>
                                <option value={currentYear - 1}>{currentYear - 1}</option>
                            </select>
                        </div>
                        {(isAdmin || isAdvisor) && (
                            <button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), semester: '2025-1', version: 'V1', activityType: 'Charla', otherType: '', nombre: '', modality: 'Presencial', horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: '', isPublic: true, competencyCodes: [] }); setSyllabusFile(null); setView('create'); }} className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 flex items-center gap-2 shadow-lg transition-all active:scale-95"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nueva Actividad</button>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {generalActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative group hover:border-teal-300 transition-colors">
                            <div className="absolute top-0 right-0 p-3 flex gap-1">
                                <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-0.5 rounded border border-teal-100">{act.activityType}</span>
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg mb-2 pr-16 truncate" title={act.name}>{act.name}</h3>
                            <div className="text-sm text-slate-500 space-y-1 mb-4">
                                <p>ID: {act.id}</p>
                                <p>Docente: {act.relator || 'S/D'}</p>
                                <p>Fecha: {formatDateCL(act.startDate)}</p>
                                
                                {/* TAGS TAXONÓMICOS DE COMPETENCIAS (DEBAJO DE FECHA) */}
                                {act.competencyCodes && act.competencyCodes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2 h-auto min-h-[22px]">
                                        {act.competencyCodes.map(code => {
                                            const paMeta = ACADEMIC_PROFILE_COMPETENCIES.find(c => c.code.replace(/-/g, '').toUpperCase() === code.replace(/-/g, '').toUpperCase());
                                            return (
                                                <span 
                                                    key={code} 
                                                    title={PEI_COMPETENCIES.find(c => c.code === code)?.name || PMI_COMPETENCIES.find(c => c.code === code)?.name || paMeta?.name || ''}
                                                    className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter ${
                                                        paMeta ? `${paMeta.lightColor} ${paMeta.textColor} ${paMeta.borderColor}` :
                                                        code.startsWith('PEI') ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 
                                                        'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    }`}
                                                >
                                                    {code}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => handleEdit(act)} className="w-full bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-teal-500 hover:text-teal-600 transition-colors text-sm">Gestionar / Editar</button>
                        </div>
                    ))}
                    {generalActivities.length === 0 && <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed rounded-xl text-slate-400">No hay actividades para el año {selectedYear}.</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-fadeIn">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
            {view === 'edit' && (
                <div className="flex items-end gap-2 border-b border-teal-200 mb-0">
                    <button onClick={() => setActiveTab('details')} className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeTab === 'details' ? 'bg-white text-teal-700 border-t-teal-600 border-x border-teal-100 shadow-sm translate-y-[1px] z-10' : 'bg-slate-100 text-slate-500 border-t-transparent hover:bg-slate-200'}`}>Editar Actividad</button>
                    <button onClick={() => setActiveTab('attendance')} className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeTab === 'attendance' ? 'bg-white text-teal-700 border-t-teal-600 border-x border-teal-100 shadow-sm translate-y-[1px] z-10' : 'bg-slate-100 text-slate-500 border-t-transparent hover:bg-slate-200'}`}>Asistencia</button>
                </div>
            )}
            <div className={`bg-white rounded-xl shadow-lg border border-slate-200 p-10 ${view === 'edit' && activeTab === 'attendance' ? '' : ''}`}>
                {(activeTab === 'details' || view === 'create') && (
                    <form onSubmit={handleSubmit} className="space-y-10">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-6 mb-4">
                            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{view === 'create' ? 'Crear Nueva Actividad' : 'Editar Actividad'}</h2>
                        </div>
                        
                        {/* FILA 1: NOMBRE, TIPO, PUBLICO */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                            <div className="md:col-span-7">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Actividad</label>
                                <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"/>
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo Actividad</label>
                                <select value={formData.activityType} onChange={e => setFormData({...formData, activityType: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                                    {GENERAL_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 flex items-center h-[42px] pb-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={formData.isPublic} onChange={e => setFormData({...formData, isPublic: e.target.checked})} className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"/>
                                    <span className="text-xs font-bold text-slate-700">Mostrar en Calendario Público</span>
                                </label>
                            </div>
                        </div>

                        {/* FILA 2: CODIGO, AÑO, VERSION, SEMESTRE, MODALIDAD */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Código Interno</label>
                                <input type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg font-mono uppercase bg-slate-50 text-xs"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Año</label>
                                <input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-bold"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Versión</label>
                                <input type="text" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-bold"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Semestre</label>
                                <input type="text" value={formData.semester} onChange={e => setFormData({...formData, semester: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-bold"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Modalidad</label>
                                <select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm">
                                    <option value="Presencial">Presencial</option>
                                    <option value="Virtual">Virtual</option>
                                    <option value="Híbrido">Híbrido</option>
                                </select>
                            </div>
                        </div>

                        {/* FILA 3: HORAS, RELATOR, INICIO, TERMINO */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Horas</label>
                                <input type="number" value={formData.horas} onChange={e => setFormData({...formData, horas: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Relator (Asesor Responsable)</label>
                                <select value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                                    <option value="">Seleccione Asesor...</option>
                                    {advisors.map(adv => <option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>{adv.names} {adv.paternalSurname}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Inicio</label>
                                <input type="date" value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Término</label>
                                <input type="date" value={formData.fechaTermino} onChange={e => setFormData({...formData, fechaTermino: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"/>
                            </div>
                        </div>

                        {/* SECCION RECURSOS DIGITALES */}
                        <div className="space-y-4 pt-6 border-t-2 border-slate-50">
                            <h3 className="text-sm font-bold text-teal-600 uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.826a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" /></svg>
                                RECURSOS DIGITALES (EDITABLE)
                            </h3>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Link de Recursos</label>
                                <input type="text" placeholder="https://..." value={formData.linkRecursos} onChange={e => setFormData({...formData, linkRecursos: e.target.value})} className="w-full px-4 py-2 border border-teal-100 rounded-lg focus:ring-2 focus:ring-teal-500 bg-teal-50/20 text-sm"/>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Link de la Clase</label>
                                    <input type="text" placeholder="https://..." value={formData.linkClase} onChange={e => setFormData({...formData, linkClase: e.target.value})} className="w-full px-4 py-2 border border-teal-100 rounded-lg focus:ring-2 focus:ring-teal-500 bg-teal-50/20 text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Link de Evaluación</label>
                                    <input type="text" placeholder="https://..." value={formData.linkEvaluacion} onChange={e => setFormData({...formData, linkEvaluacion: e.target.value})} className="w-full px-4 py-2 border border-teal-100 rounded-lg focus:ring-2 focus:ring-teal-500 bg-teal-50/20 text-sm"/>
                                </div>
                            </div>
                        </div>

                        {/* SUBIDA DE PROGRAMA Y ANÁLISIS IA */}
                        <div className="space-y-4 pt-6 border-t-2 border-slate-50">
                            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                PROGRAMA O DESCRIPCIÓN (ANÁLISIS IA)
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                                <div className="flex-1 w-full">
                                    <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all ${syllabusFile ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                                        <div className="flex flex-col items-center justify-center pt-2">
                                            {syllabusFile ? (
                                                <div className="flex items-center gap-2"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0116 0z" /></svg><p className="text-xs font-bold text-indigo-700 truncate max-w-[200px]">{syllabusFile.name}</p></div>
                                            ) : (
                                                <><svg className="w-6 h-6 text-slate-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><p className="text-[10px] text-slate-500 font-bold uppercase">Subir Documento (PDF/TXT)</p></>
                                            )}
                                        </div>
                                        <input type="file" className="hidden" accept=".pdf,.txt" onChange={(e) => setSyllabusFile(e.target.files ? e.target.files[0] : null)} />
                                    </label>
                                </div>
                                <button type="button" onClick={handleAnalyzeSyllabus} disabled={isAnalyzingIA || !syllabusFile} className={`flex items-center gap-2 px-8 py-4 rounded-xl text-xs font-black uppercase transition-all shadow-md h-24 ${isAnalyzingIA || !syllabusFile ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5'}`}>
                                    <svg className={`w-5 h-5 ${isAnalyzingIA ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {isAnalyzingIA ? 'Analizando...' : 'Analizar IA'}
                                </button>
                            </div>
                        </div>

                        {/* TAXONOMÍA DE COMPETENCIAS UPLA */}
                        <div className="space-y-6 pt-6 border-t-2 border-slate-50">
                            <div>
                                <h3 className="text-lg font-black text-[#647FBC] uppercase tracking-tight">TAXONOMÍA DE COMPETENCIAS UPLA</h3>
                                <p className="text-xs text-slate-400">Vincule la actividad con el Plan Estratégico y de Mejora Institucional.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-indigo-400"></span><h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Plan Estratégico (PEI)</h4></div>
                                    <div className="flex flex-wrap gap-2">
                                        {PEI_COMPETENCIES.map(c => (
                                            <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border transition-all ${formData.competencyCodes.includes(c.code) ? 'bg-indigo-100 border-indigo-300 text-indigo-800 scale-105 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-400'}`}>{c.code}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span><h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Plan de Mejora (PMI)</h4></div>
                                    <div className="flex flex-wrap gap-2">
                                        {PMI_COMPETENCIES.map(c => (
                                            <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border transition-all ${formData.competencyCodes.includes(c.code) ? 'bg-emerald-100 border-emerald-300 text-emerald-800 scale-105 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-400'}`}>{c.code}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* PERFIL ACADÉMICO (DINÁMICO) - NUEVO */}
                            <div className="space-y-4 pt-6">
                                <h4 className="text-sm font-black text-rose-600 uppercase tracking-[0.2em] flex items-center gap-2">Perfil del Académico UPLA</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                                    {['Pedagógica', 'Investigación y/o Creación', 'Vinculación', 'Interpersonal y Ética', 'Formación Continua'].map(dim => (
                                        <div key={dim} className="space-y-2">
                                            <h5 className="text-[9px] font-black uppercase text-slate-400 border-b pb-1">{dim}</h5>
                                            <div className="flex flex-wrap gap-1">
                                                {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === dim).map(c => (
                                                    <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase border transition-all ${formData.competencyCodes.includes(c.code) ? `${c.color} text-white shadow-sm scale-110` : 'bg-white border-slate-100 text-slate-300 hover:border-slate-300'}`}>{c.code}</button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-8 border-t border-slate-100">
                            <button type="submit" disabled={isSyncing} className={`bg-teal-600 text-white px-10 py-3.5 rounded-xl font-bold shadow-lg hover:bg-teal-700 transition-all transform active:scale-95 flex items-center gap-2 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                {view === 'create' ? 'Crear Actividad' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                )}

                {activeTab === 'attendance' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center justify-between">
                            <div><h3 className="text-teal-800 font-bold text-lg">Registro de Asistencia</h3><p className="text-teal-600 text-sm">Gestione los participantes de esta actividad.</p></div>
                            <div className="bg-white px-4 py-2 rounded shadow-sm"><span className="block text-2xl font-bold text-teal-700 text-center">{sortedActivityEnrollments.length}</span><span className="text-[10px] uppercase font-bold text-slate-400">Total Inscritos</span></div>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        Inscripción Manual (13 Campos Base Maestra)
                                    </h4>
                                </div>
                                <form onSubmit={handleEnrollSubmit} className="space-y-8">
                                    <div className="space-y-4">
                                        <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b pb-1">Identidad y Contacto</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="relative">
                                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">RUT *</label>
                                                <input required type="text" name="rut" placeholder="12345678-9" value={enrollForm.rut} onChange={handleEnrollChange} onBlur={handleRutBlur} autoComplete="off" className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:ring-2 focus:ring-teal-500 ${isFoundInMaster ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-slate-300'}`}/>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                                                        {suggestions.map((s) => (
                                                            <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-teal-50 cursor-pointer text-xs border-b border-slate-50 last:border-0">
                                                                <span className="font-bold block text-slate-800">{s.rut}</span>
                                                                <span className="text-slate-500">{s.names} {s.paternalSurname}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Email Institucional</label><input type="email" name="email" value={enrollForm.email} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombres *</label><input required type="text" name="names" value={enrollForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Ap. Paterno *</label><input required type="text" name="paternalSurname" value={enrollForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                        </div>
                                        <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Teléfono</label><input type="text" name="phone" value={enrollForm.phone} onChange={handleEnrollChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                    </div>

                                    <div className="space-y-4">
                                        <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b pb-1">Datos Institucionales</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <SmartSelect label="Sede / Campus" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollChange} />
                                            <SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={handleEnrollChange} />
                                            <SmartSelect label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={handleEnrollChange} />
                                            <SmartSelect label="Carrera Profesional" name="career" value={enrollForm.career} options={listCareers} onChange={handleEnrollChange} />
                                            <SmartSelect label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={handleEnrollChange} />
                                            <SmartSelect label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={handleEnrollChange} />
                                            <SmartSelect label="Semestre Docencia" name="teachingSemester" value={enrollForm.teachingSemester} options={listSemesters} onChange={handleEnrollChange} />
                                            <div className="flex items-end">
                                                <button type="submit" disabled={isSyncing || isProcessing} className={`w-full bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-lg font-bold shadow-lg transition-all text-sm transform active:scale-95 ${(isSyncing || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                    {isProcessing ? 'Procesando...' : 'Registrar Participante'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {enrollMsg && (<div className={`text-xs p-3 rounded-xl text-center font-bold animate-fadeIn ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{enrollMsg.text}</div>)}
                                </form>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-4"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Carga Masiva de Asistencia</h4>
                                <div className="flex-1 flex flex-col justify-center space-y-4">
                                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}><div className="flex flex-col items-center justify-center pt-5 pb-6">{uploadFile ? (<><svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><p className="mb-1 text-xs font-bold text-emerald-700">{uploadFile.name}</p></>) : (<><svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="mb-1 text-xs text-slate-500">Click para subir CSV/Excel</p></>)}</div><input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} /></label>
                                    <button type="button" onClick={handleBulkUpload} disabled={!uploadFile || isProcessing || isSyncing} className={`w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-sm hover:bg-black transition-all shadow-md`}>Procesar Archivo</button>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <table className="w-full text-sm text-left"><thead className="bg-slate-50 font-bold border-b"><tr><th className="px-6 py-3">Participante</th><th className="px-6 py-3">RUT</th><th className="px-6 py-3 text-center">Acción</th></tr></thead><tbody className="divide-y">
                                {sortedActivityEnrollments.map(enr => { const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut)); return (
                                    <tr key={enr.id} className="hover:bg-slate-50"><td className="px-6 py-3 font-medium">{u ? `${u.names} ${u.paternalSurname}` : 'S/I'}</td><td className="px-6 py-3 font-mono text-xs">{enr.rut}</td><td className="px-6 py-3 text-center"><button onClick={() => handleUnenrollFromList(enr.id, u ? `${u.names} ${u.paternalSurname}` : enr.rut)} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded text-[9px] font-black uppercase">RETIRAR</button></td></tr>
                                );})}
                                {sortedActivityEnrollments.length === 0 && <tr><td colSpan={3} className="py-12 text-center text-slate-400 italic">No hay participantes registrados.</td></tr>}
                            </tbody></table>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL DE REVISIÓN DE SUGERENCIAS IA */}
            {showAiReview && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-indigo-200 flex flex-col overflow-hidden">
                        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                <div><h3 className="text-xl font-bold">Sugerencias Curriculares IA</h3><p className="text-xs text-indigo-100 uppercase tracking-widest font-bold">Taxonomía Institucional</p></div>
                            </div>
                            <button onClick={() => setShowAiReview(false)} className="text-indigo-200 hover:text-white text-3xl font-light">&times;</button>
                        </div>
                        <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar max-h-[60vh]">
                            <p className="text-slate-600 text-sm italic">Basado en el programa <strong>"{syllabusFile?.name}"</strong>, la IA sugiere estas competencias:</p>
                            <div className="space-y-4">
                                {aiSuggestions.map((suggestion, idx) => (
                                    <div key={idx} className={`p-4 rounded-2xl border flex gap-4 ${suggestion.code.startsWith('PEI') ? 'bg-indigo-50 border-indigo-100' : suggestion.code.startsWith('PA') ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <div className={`w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center font-black text-sm border-2 ${suggestion.code.startsWith('PEI') ? 'bg-white text-indigo-700 border-indigo-200' : suggestion.code.startsWith('PA') ? 'bg-white text-rose-700 border-rose-200' : 'bg-white text-emerald-700 border-emerald-200'}`}>{suggestion.code}</div>
                                        <div className="flex-1">
                                            <h4 className={`font-bold text-sm uppercase ${suggestion.code.startsWith('PEI') ? 'text-indigo-800' : suggestion.code.startsWith('PA') ? 'text-rose-800' : 'text-emerald-800'}`}>{PEI_COMPETENCIES.find(c => c.code === suggestion.code)?.name || PMI_COMPETENCIES.find(c => c.code === suggestion.code)?.name || ACADEMIC_PROFILE_COMPETENCIES.find(c => c.code === suggestion.code)?.name || 'Competencia Institucional'}</h4>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed"><span className="font-bold text-slate-700">Intencionalidad:</span> "{suggestion.reason}"</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button onClick={() => setShowAiReview(false)} className="px-6 py-2.5 text-slate-500 font-bold hover:text-slate-800 transition-colors">Descartar</button>
                            <button onClick={applyAiSuggestions} className="px-8 py-2.5 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Aplicar Taxonomía</button>
                        </div>
                    </div>
                </div>
              )}
        </div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Activity, User, UserRole, Enrollment, ActivityState } from '../types';
import { GENERAL_ACTIVITY_TYPES, ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
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

// Utility para formatear Fecha (DD-MM-AAAA)
const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

// Utility para limpiar RUT (Formato Visual)
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

// Utility para normalizar RUT (Lógica de Comparación)
const normalizeRut = (rut: string): string => {
    if (!rut) return '';
    return rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '').toLowerCase();
};

// Utility para normalizar valores de Excel
const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

export const GeneralActivityManager: React.FC<GeneralActivityManagerProps> = ({ currentUser }) => {
    const { activities, addActivity, deleteActivity, enrollments, users, getUser, upsertUsers, enrollUser, bulkEnroll, config } = useData();
    const { isSyncing, executeReload } = useReloadDirective();
    
    // Lists needed for enrollment form
    const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
    const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
    const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
    const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
    const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
    const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

    // FILTER: Only General Activities
    const generalActivities = activities.filter(a => a.category === 'GENERAL');
    
    const [view, setView] = useState<ViewState>('list');
    const [activeTab, setActiveTab] = useState<TabType>('details');
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

    // Form State (Activity Details)
    const [formData, setFormData] = useState({
        internalCode: '',
        year: new Date().getFullYear(),
        activityType: 'Charla',
        otherType: '',
        nombre: '', 
        modality: 'Presencial', 
        horas: 0, 
        relator: '', 
        fechaInicio: '',
        linkRecursos: '',
        linkClase: '',
        linkEvaluacion: '',
        isPublic: true
    });

    // --- ATTENDANCE MANAGEMENT STATES ---
    const [enrollForm, setEnrollForm] = useState({
        rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
        academicRole: '', faculty: '', department: '', career: '', contractType: '',
        teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
    });
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const suggestionClickedRef = useRef(false);
    const [isFoundInMaster, setIsFoundInMaster] = useState(false);
    const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
    
    // Bulk Upload States
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [hasHeaders, setHasHeaders] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const isAdmin = currentUser.systemRole === UserRole.ADMIN;
    const isAdvisor = currentUser.systemRole === UserRole.ASESOR;
    
    // El Asesor ahora puede editar información general en creación o si es admin
    const canEditGeneralInfo = isAdmin || isAdvisor || view === 'create'; 

    const activityEnrollments = selectedActivity ? enrollments.filter(e => e.activityId === selectedActivity.id) : [];

    // --- AUTO-GENERATE CODE LOGIC ---
    useEffect(() => {
        if (view === 'create' || view === 'edit') {
            const typeKey = formData.activityType; 
            const prefix = TYPE_PREFIXES[typeKey] || "ACT";
            let d = "", m = "", y = "";
            
            if (formData.fechaInicio) {
                const parts = formData.fechaInicio.split('-');
                if (parts.length === 3) {
                    y = parts[0].slice(2);
                    m = parts[1];
                    d = parts[2];
                }
            } else {
                const today = new Date();
                d = String(today.getDate()).padStart(2, '0');
                m = String(today.getMonth() + 1).padStart(2, '0');
                y = String(today.getFullYear()).slice(2);
            }

            if (d && m && y) {
                const autoCode = `${prefix}-${d}${m}${y}-V1`;
                if (view === 'create') {
                     setFormData(prev => ({ ...prev, internalCode: autoCode }));
                }
            }
        }
    }, [formData.activityType, formData.fechaInicio, view]);

    // Handle Click Outside Suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleEdit = (act: Activity) => {
        setSelectedActivity(act);
        setFormData({
            internalCode: act.internalCode || '',
            year: act.year || new Date().getFullYear(),
            activityType: GENERAL_ACTIVITY_TYPES.includes(act.activityType || '') ? (act.activityType || 'Charla') : 'Otro',
            otherType: !GENERAL_ACTIVITY_TYPES.includes(act.activityType || '') ? (act.activityType || '') : '',
            nombre: act.name,
            modality: act.modality,
            horas: act.hours,
            relator: act.relator || '',
            fechaInicio: act.startDate || '',
            linkRecursos: act.linkResources || '',
            linkClase: act.classLink || '',
            linkEvaluacion: act.evaluationLink || '',
            isPublic: act.isPublic !== false // Default to true if undefined
        });
        setActiveTab('details'); // Reset tab
        setView('edit');
    };

    // --- ENROLLMENT HANDLERS ---
    const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEnrollForm(prev => ({ ...prev, [name]: value }));
        
        if (name === 'rut') {
            setIsFoundInMaster(false);
            setEnrollMsg(null);
            const rawInput = normalizeRut(value);
            if (rawInput.length >= 2) { 
                const matches = users.filter(u => normalizeRut(u.rut).includes(rawInput));
                setSuggestions(matches.slice(0, 5)); 
                setShowSuggestions(matches.length > 0);
            } else { 
                setSuggestions([]); 
                setShowSuggestions(false); 
            }
        }
    };

    const handleSelectSuggestion = (user: User) => {
        suggestionClickedRef.current = true;
        setEnrollForm({
            rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole
        });
        setIsFoundInMaster(true); 
        setShowSuggestions(false); 
        setSuggestions([]);
        setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
        setTimeout(() => { suggestionClickedRef.current = false; }, 300);
    };

    const handleEnrollSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedActivity) return;
        
        if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname || !enrollForm.campus || !enrollForm.faculty) {
            setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios de la Base Maestra.' });
            return;
        }

        setIsProcessing(true);
        const formattedRut = cleanRutFormat(enrollForm.rut);
        const userToUpsert: User = {
            rut: formattedRut, names: enrollForm.names, paternalSurname: enrollForm.paternalSurname, maternalSurname: enrollForm.maternalSurname, email: enrollForm.email, phone: enrollForm.phone, academicRole: enrollForm.academicRole, faculty: enrollForm.faculty, department: enrollForm.department, career: enrollForm.career, contractType: enrollForm.contractType, teachingSemester: enrollForm.teachingSemester, campus: enrollForm.campus, systemRole: enrollForm.systemRole as UserRole
        };

        try {
            await upsertUsers([userToUpsert]);
            await enrollUser(formattedRut, selectedActivity.id);
            await executeReload();
            setEnrollMsg({ type: 'success', text: 'Participante registrado exitosamente.' });
            setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
            setIsFoundInMaster(false);
        } catch (error) {
            setEnrollMsg({ type: 'error', text: 'Error al registrar participante.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkUpload = () => {
        if (!uploadFile || !selectedActivity) return;
        setIsProcessing(true);
        setEnrollMsg(null);

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
                
                const usersToUpsert: User[] = []; 
                const rutsToEnroll: string[] = []; 
                let startRow = hasHeaders ? 1 : 0;
                
                for (let i = startRow; i < rows.length; i++) {
                    const row = rows[i]; 
                    const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
                    if (rowStrings.length < 1 || !rowStrings[0]) continue;
                    
                    const cleanRut = cleanRutFormat(rowStrings[0]); 
                    rutsToEnroll.push(cleanRut);
                    
                    const hasName = rowStrings[1] && rowStrings[1].length > 1;
                    if (hasName) {
                        usersToUpsert.push({ 
                            rut: cleanRut, 
                            names: rowStrings[1] || '', 
                            paternalSurname: rowStrings[2] || '', 
                            maternalSurname: rowStrings[3] || '', 
                            email: rowStrings[4] || '', 
                            phone: rowStrings[5] || '', 
                            academicRole: normalizeValue(rowStrings[6], listRoles), 
                            faculty: normalizeValue(rowStrings[7], listFaculties), 
                            department: normalizeValue(rowStrings[8], listDepts), 
                            career: normalizeValue(rowStrings[9], listCareers), 
                            contractType: normalizeValue(rowStrings[10], listContracts), 
                            teachingSemester: normalizeValue(rowStrings[11], listSemesters), 
                            campus: rowStrings[12] || '', 
                            systemRole: UserRole.ESTUDIANTE 
                        });
                    }
                }
                
                if (usersToUpsert.length > 0) { await upsertUsers(usersToUpsert); }
                const result = await bulkEnroll(rutsToEnroll, selectedActivity.id);
                await executeReload();
                setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos, ${result.skipped} ya existentes.` }); 
                setUploadFile(null);
            } catch (err) {
                console.error("Bulk Upload Error:", err);
                setEnrollMsg({ type: 'error', text: 'Error procesando el archivo masivo.' });
            } finally {
                setIsProcessing(false);
            }
        };

        reader.onerror = () => {
            setEnrollMsg({ type: 'error', text: 'Error al leer el archivo.' });
            setIsProcessing(false);
        };

        if (isExcel) {
            reader.readAsArrayBuffer(uploadFile);
        } else {
            reader.readAsText(uploadFile);
        }
    };

    // --- SUBMIT MAIN FORM ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const finalType = formData.activityType === 'Otro' ? formData.otherType : formData.activityType;
        const finalCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
        const generatedId = selectedActivity ? selectedActivity.id : finalCode;

        const activityToSave: Activity = {
            id: generatedId,
            category: 'GENERAL',
            activityType: finalType,
            internalCode: finalCode,
            year: formData.year,
            name: formData.nombre,
            version: 'V1', 
            modality: formData.modality,
            hours: formData.horas,
            relator: formData.relator,
            startDate: formData.fechaInicio,
            linkResources: formData.linkRecursos,
            classLink: formData.linkClase,
            evaluationLink: formData.linkEvaluacion,
            isPublic: formData.isPublic
        };
        
        await addActivity(activityToSave); 
        await executeReload();
        setView('list');
        setSelectedActivity(null);
    };

    const handleDelete = async () => {
        if (!selectedActivity) return;
        const password = prompt(`ADVERTENCIA: Eliminar "${selectedActivity.name}"? Contraseña ADMIN:`);
        if (password === currentUser.password) {
            await deleteActivity(selectedActivity.id);
            await executeReload();
            alert("Eliminado.");
            setView('list');
            setSelectedActivity(null);
        } else if (password !== null) {
            alert("Incorrecto.");
        }
    };

    if (view === 'list') {
        return (
            <div className="animate-fadeIn space-y-6">
                 <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Gestión de Actividades Generales</h2>
                        <p className="text-sm text-slate-500">Charlas, Talleres, Webinars y otras instancias de extensión.</p>
                    </div>
                    {(isAdmin || isAdvisor) && (
                        <button onClick={() => {
                            setFormData({
                                internalCode: '', year: new Date().getFullYear(), activityType: 'Charla', otherType: '',
                                nombre: '', modality: 'Presencial', horas: 0, relator: '', fechaInicio: '',
                                linkRecursos: '', linkClase: '', linkEvaluacion: '', isPublic: true
                            });
                            setView('create');
                        }} className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 flex items-center gap-2 shadow-lg transition-all active:scale-95">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Nueva Actividad
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {generalActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:border-teal-300 transition-colors">
                            <div className="absolute top-0 right-0 p-3">
                                <span className="bg-teal-50 text-teal-700 text-xs font-bold px-2 py-1 rounded border border-teal-100">{act.activityType}</span>
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg mb-2 pr-16 truncate" title={act.name}>{act.name}</h3>
                            <div className="text-sm text-slate-500 space-y-1 mb-4">
                                <p className="text-xs font-mono text-slate-400">ID: {act.id}</p>
                                <p>Modalidad: {act.modality}</p>
                                <p>Fecha: {formatDateCL(act.startDate)}</p>
                            </div>
                            <button onClick={() => handleEdit(act)} className="w-full bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-teal-500 hover:text-teal-600 transition-colors text-sm">
                                Gestionar / Editar
                            </button>
                        </div>
                    ))}
                    {generalActivities.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            No hay actividades generales registradas.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- CREATE / EDIT / DETAILS VIEW ---
    return (
        <div className="max-w-5xl mx-auto animate-fadeIn">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
            
            {/* TABS HEADER */}
            {view === 'edit' && (
                <div className="flex items-end gap-2 border-b border-teal-200 mb-0">
                    <button 
                        onClick={() => setActiveTab('details')} 
                        className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeTab === 'details' ? 'bg-white text-teal-700 border-t-teal-600 border-x border-teal-100 shadow-sm translate-y-[1px] z-10' : 'bg-slate-100 text-slate-500 border-t-transparent hover:bg-slate-200'}`}
                    >
                        Editar Actividad
                    </button>
                    <button 
                        onClick={() => setActiveTab('attendance')} 
                        className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeTab === 'attendance' ? 'bg-white text-teal-700 border-t-teal-600 border-x border-teal-100 shadow-sm translate-y-[1px] z-10' : 'bg-slate-100 text-slate-500 border-t-transparent hover:bg-slate-200'}`}
                    >
                        Asistencia
                    </button>
                </div>
            )}

            <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-8 ${view === 'edit' ? 'rounded-tl-none border-t-teal-100' : ''}`}>
                
                {/* --- TAB 1: DETAILS / EDIT --- */}
                {(activeTab === 'details' || view === 'create') && (
                    <>
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                            <h2 className="text-xl font-bold text-slate-800">
                                {view === 'create' ? 'Crear Nueva Actividad' : 'Detalles de Actividad'}
                            </h2>
                            {!isAdmin && view === 'edit' && (
                                <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                                    Modo Asesor
                                </span>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Actividad</label>
                                        <input type="text" disabled={!canEditGeneralInfo} required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"/>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Tipo Actividad</label>
                                        <select disabled={!canEditGeneralInfo} value={formData.activityType} onChange={e => setFormData({...formData, activityType: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500">
                                            {GENERAL_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    {(isAdmin || isAdvisor) && (
                                        <div className="flex items-center justify-start pt-6">
                                            <input 
                                                type="checkbox" 
                                                id="isPublic"
                                                checked={formData.isPublic}
                                                onChange={e => setFormData(prev => ({...prev, isPublic: e.target.checked}))}
                                                className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500"
                                            />
                                            <label htmlFor="isPublic" className="ml-2 text-sm font-medium text-slate-700">Mostrar en Calendario Público</label>
                                        </div>
                                    )}
                                    {formData.activityType === 'Otro' && (
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-bold text-slate-700 mb-1">Especifique Otro</label>
                                            <input type="text" disabled={!canEditGeneralInfo} required value={formData.otherType} onChange={e => setFormData({...formData, otherType: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"/>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label>
                                    <input 
                                        type="text" 
                                        disabled={!canEditGeneralInfo} 
                                        value={formData.internalCode} 
                                        onChange={e => setFormData({...formData, internalCode: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100 focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                                    />
                                    {(view === 'create' || view === 'edit') && (
                                        <p className="text-[10px] text-teal-600 mt-1">
                                            Sugerencia automática: TIPO-DDMMAA-V1
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
                                    <input type="number" disabled={!canEditGeneralInfo} value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100"/>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label>
                                    <select disabled={!canEditGeneralInfo} value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100">
                                        <option value="Presencial">Presencial</option>
                                        <option value="Híbrido">Híbrido</option>
                                        <option value="Online">Online</option>
                                        <option value="Presencia Digital">Presencia Digital</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Horas</label>
                                    <input type="number" disabled={!canEditGeneralInfo} value={formData.horas} onChange={e => setFormData({...formData, horas: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100"/>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Relator</label>
                                    <input type="text" disabled={!canEditGeneralInfo} value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio</label>
                                    <input type="date" disabled={!canEditGeneralInfo} value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded disabled:bg-slate-100"/>
                                </div>
                            </div>

                            {/* Resources Section - ALWAYS EDITABLE FOR PERMITTED ROLES */}
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-teal-600 uppercase tracking-wide flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                    Recursos Digitales (Editable)
                                </h3>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Link de Recursos</label>
                                    <input type="url" placeholder="https://..." value={formData.linkRecursos} onChange={e => setFormData({...formData, linkRecursos: e.target.value})} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"/>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Link de la Clase</label>
                                        <input type="url" placeholder="https://..." value={formData.linkClase} onChange={e => setFormData({...formData, linkClase: e.target.value})} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Link de Evaluación</label>
                                        <input type="url" placeholder="https://..." value={formData.linkEvaluacion} onChange={e => setFormData({...formData, linkEvaluacion: e.target.value})} className="w-full px-4 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"/>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between pt-6">
                                {isAdmin && view === 'edit' && (
                                    <button 
                                        type="button" 
                                        onClick={handleDelete}
                                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        Eliminar Actividad
                                    </button>
                                )}
                                <button type="submit" className="bg-teal-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-teal-700 transition-colors ml-auto">
                                    {view === 'create' ? 'Crear Actividad' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </>
                )}

                {/* --- TAB 2: ATTENDANCE / ENROLLMENT --- */}
                {activeTab === 'attendance' && (
                    <div className="space-y-8 animate-fadeIn">
                        
                        {/* Summary Stats */}
                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-teal-800 font-bold text-lg">Registro de Asistencia</h3>
                                <p className="text-teal-600 text-sm">Gestione los participantes de esta actividad.</p>
                            </div>
                            <div className="bg-white px-4 py-2 rounded shadow-sm">
                                <span className="block text-2xl font-bold text-teal-700 text-center">{activityEnrollments.length}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">Total Inscritos</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            
                            {/* LEFT: Manual Enrollment Form */}
                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        Inscripción Manual (Base Maestra)
                                    </h4>
                                    {isFoundInMaster && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200">Encontrado</span>}
                                </div>

                                <form onSubmit={handleEnrollSubmit} className="space-y-4">
                                    
                                    {/* SECCIÓN 1: IDENTIFICACIÓN */}
                                    <h5 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1 mb-2">Identificación Personal</h5>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="relative col-span-2">
                                            <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                            <input 
                                                type="text" 
                                                name="rut" 
                                                placeholder="12345678-9" 
                                                value={enrollForm.rut} 
                                                onChange={handleEnrollChange} 
                                                className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-teal-500 font-bold ${isFoundInMaster ? 'bg-green-50 border-green-300 text-green-800' : ''}`}
                                            />
                                            {/* Suggestions Dropdown */}
                                            {showSuggestions && suggestions.length > 0 && (
                                                <div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                                                    {suggestions.map((s) => (
                                                        <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-teal-50 cursor-pointer text-xs border-b border-slate-50">
                                                            <span className="font-bold block text-slate-800">{s.rut}</span>
                                                            <span className="text-slate-500">{s.names} {s.paternalSurname}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label>
                                            <input type="text" name="names" required value={enrollForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label>
                                            <input type="text" name="paternalSurname" required value={enrollForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label>
                                            <input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        </div>
                                    </div>

                                    {/* SECCIÓN 2: CONTACTO */}
                                    <h5 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1 mb-2 mt-4">Contacto</h5>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                                            <input type="email" name="email" value={enrollForm.email} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
                                            <input type="tel" name="phone" value={enrollForm.phone} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        </div>
                                    </div>

                                    {/* SECCIÓN 3: FICHA ACADÉMICA (BASE MAESTRA) */}
                                    <h5 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-1 mb-2 mt-4">Ficha Académica (Completa)</h5>
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <SmartSelect className="text-xs" label="Sede / Campus" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs" label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs col-span-2" label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs col-span-2" label="Carrera" name="career" value={enrollForm.career} options={listCareers} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs" label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs" label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={handleEnrollChange} />
                                        <SmartSelect className="text-xs col-span-2" label="Semestre Docencia" name="teachingSemester" value={enrollForm.teachingSemester} options={listSemesters} onChange={handleEnrollChange} />
                                    </div>

                                    <button type="submit" disabled={isSyncing || isProcessing} className={`w-full bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-lg font-bold shadow-sm transition-colors text-sm mt-4 ${(isSyncing || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        {isProcessing ? 'Procesando...' : 'Registrar Participante'}
                                    </button>
                                    
                                    {enrollMsg && (
                                        <div className={`text-xs p-2 rounded text-center ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {enrollMsg.text}
                                        </div>
                                    )}
                                </form>
                            </div>

                            {/* RIGHT: Bulk Upload */}
                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-4">
                                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Carga Masiva de Asistencia
                                </h4>
                                
                                <div className="flex-1 flex flex-col justify-center space-y-4">
                                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {uploadFile ? (
                                                <>
                                                    <svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    <p className="mb-1 text-xs font-bold text-emerald-700">{uploadFile.name}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                    <p className="mb-1 text-xs text-slate-500">Click para subir CSV/Excel</p>
                                                </>
                                            )}
                                        </div>
                                        <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} />
                                    </label>

                                    <div className="flex items-center gap-2 justify-center">
                                        <input type="checkbox" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-teal-600 focus:ring-teal-500"/>
                                        <span className="text-xs text-slate-500">Ignorar encabezados (fila 1)</span>
                                    </div>

                                    <button 
                                        type="button"
                                        onClick={handleBulkUpload} 
                                        disabled={!uploadFile || isProcessing || isSyncing}
                                        className={`w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${isProcessing ? 'cursor-wait' : ''}`}
                                    >
                                        {(isProcessing || isSyncing) ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                Procesando...
                                            </>
                                        ) : 'Procesar Archivo'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* LIST OF ENROLLED USERS */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                                <h4 className="font-bold text-slate-700 text-sm">Listado de Asistentes</h4>
                            </div>
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-500 font-bold border-b border-slate-100 sticky top-0">
                                        <tr>
                                            <th className="px-6 py-3">Participante</th>
                                            <th className="px-6 py-3">RUT</th>
                                            <th className="px-6 py-3">Email</th>
                                            <th className="px-6 py-3">Unidad</th>
                                            <th className="px-6 py-3 text-center">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {activityEnrollments.map(enr => {
                                            const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut));
                                            return (
                                                <tr key={enr.id} className="hover:bg-slate-50">
                                                    <td className="px-6 py-3 font-medium text-slate-700">
                                                        {u ? `${u.names} ${u.paternalSurname}` : 'Usuario Desconocido'}
                                                    </td>
                                                    <td className="px-6 py-3 font-mono text-xs text-slate-500">{enr.rut}</td>
                                                    <td className="px-6 py-3 text-xs text-slate-500">{u?.email || '-'}</td>
                                                    <td className="px-6 py-3 text-xs text-slate-500">{u?.faculty || '-'}</td>
                                                    <td className="px-6 py-3 text-center">
                                                        <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold uppercase">
                                                            {enr.state}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {activityEnrollments.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                                    No hay participantes registrados aún.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}

            </div>
        </div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Activity, User, UserRole, ActivityState, Enrollment } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
// @ts-ignore
import { read, utils } from 'xlsx';

// --- Utility Functions ---
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

interface CourseManagerProps {
    currentUser?: User;
}

type ViewState = 'list' | 'create' | 'edit' | 'details';
type TabType = 'enrollment' | 'tracking';

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
    const { activities, addActivity, deleteActivity, enrollments, users, getUser, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, config } = useData();
    const isAdmin = currentUser?.systemRole === UserRole.ADMIN;

    // Listas dinámicas
    const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
    const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
    const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
    const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
    const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
    const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

    // Estados
    const [view, setView] = useState<ViewState>('list');
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [activeDetailTab, setActiveDetailTab] = useState<TabType>('enrollment');

    // Estados de Formulario Curso
    const [formData, setFormData] = useState({
        internalCode: '',
        year: new Date().getFullYear(),
        nombre: '',
        modality: 'Presencial',
        horas: 0,
        relator: '',
        fechaInicio: '',
        evaluationCount: 3,
        linkRecursos: '',
        linkClase: '',
        linkEvaluacion: '',
        isPublic: true
    });

    // Estados de Matrícula Manual
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

    // Estados de Carga Masiva
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [hasHeaders, setHasHeaders] = useState(true);
    const [enrollMsg, setEnrollMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const academicActivities = activities.filter(a => a.category === 'ACADEMIC');
    const selectedCourse = activities.find(a => a.id === selectedCourseId);
    const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

    // Click Outside Suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- LOGIC: CREATE / EDIT COURSE ---
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
        const activityId = selectedCourseId || finalCode; // If editing, keep ID. If creating, use code.

        const activity: Activity = {
            id: activityId,
            category: 'ACADEMIC',
            internalCode: formData.internalCode,
            year: formData.year,
            name: formData.nombre,
            version: 'V1',
            modality: formData.modality,
            hours: formData.horas,
            relator: formData.relator,
            evaluationCount: formData.evaluationCount,
            startDate: formData.fechaInicio,
            linkResources: formData.linkRecursos,
            classLink: formData.linkClase,
            evaluationLink: formData.linkEvaluacion,
            isPublic: formData.isPublic
        };

        addActivity(activity);
        setView('list');
        setSelectedCourseId(null);
    };

    const handleEdit = (act: Activity) => {
        setSelectedCourseId(act.id);
        setFormData({
            internalCode: act.internalCode || '',
            year: act.year || new Date().getFullYear(),
            nombre: act.name,
            modality: act.modality,
            horas: act.hours,
            relator: act.relator || '',
            fechaInicio: act.startDate || '',
            evaluationCount: act.evaluationCount || 3,
            linkRecursos: act.linkResources || '',
            linkClase: act.classLink || '',
            linkEvaluacion: act.evaluationLink || '',
            isPublic: act.isPublic !== false
        });
        setView('edit');
    };

    const handleDelete = async () => {
        if (!selectedCourseId) return;
        const password = prompt(`ADVERTENCIA: ¿Eliminar "${selectedCourse?.name}"? Contraseña ADMIN:`);
        if (password === currentUser?.password) {
            await deleteActivity(selectedCourseId);
            alert("Curso eliminado.");
            setView('list');
            setSelectedCourseId(null);
        } else if (password !== null) {
            alert("Incorrecto.");
        }
    };

    // --- LOGIC: MANUAL ENROLLMENT ---
    const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEnrollForm(prev => ({ ...prev, [name]: value }));
        
        if (name === 'rut') {
            setIsFoundInMaster(false);
            setEnrollMsg(null);
            const rawInput = value.replace(/[^0-9kK]/g, '').toLowerCase();
            if (rawInput.length >= 2) { 
                const matches = users.filter(u => u.rut.replace(/[^0-9kK]/g, '').toLowerCase().includes(rawInput));
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

    const handleEnrollSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourseId) return;
        
        if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname) {
            setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios.' });
            return;
        }

        const formattedRut = cleanRutFormat(enrollForm.rut);
        const userToUpsert: User = {
            rut: formattedRut, names: enrollForm.names, paternalSurname: enrollForm.paternalSurname, maternalSurname: enrollForm.maternalSurname, email: enrollForm.email, phone: enrollForm.phone, academicRole: enrollForm.academicRole, faculty: enrollForm.faculty, department: enrollForm.department, career: enrollForm.career, contractType: enrollForm.contractType, teachingSemester: enrollForm.teachingSemester, campus: enrollForm.campus, systemRole: enrollForm.systemRole as UserRole
        };

        upsertUsers([userToUpsert]);
        enrollUser(formattedRut, selectedCourseId);
        setEnrollMsg({ type: 'success', text: 'Estudiante matriculado.' });
        setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
        setIsFoundInMaster(false);
    };

    // --- LOGIC: BULK ENROLLMENT (Fixing the snippet provided by user) ---
    const handleBulkEnroll = () => {
        if (!uploadFile || !selectedCourseId) return;
        const reader = new FileReader(); 
        const isExcel = uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls');
        
        reader.onload = async (e) => {
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
            
            if (rows.length < 1) return;
            
            const usersToUpsert: User[] = []; 
            const rutsToEnroll: string[] = []; 
            
            // Contadores para reporte
            const seenRutsInFile = new Set<string>();
            let duplicatesInFile = 0;
            let invalidRows = 0;
            
            let startRow = hasHeaders ? 1 : 0;
            
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i]; 
                const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
                
                // Validación básica de fila
                if (rowStrings.length < 1 || !rowStrings[0]) {
                    invalidRows++;
                    continue;
                }
                
                const cleanRut = cleanRutFormat(rowStrings[0]); 
                
                // Validación de RUT
                if (cleanRut.length < 2) {
                    invalidRows++;
                    continue;
                }

                // Detección de duplicados DENTRO del archivo
                if (seenRutsInFile.has(cleanRut)) {
                    duplicatesInFile++;
                    console.warn(`RUT duplicado en archivo omitido: ${cleanRut} (Fila ${i + 1})`);
                    continue;
                }
                
                seenRutsInFile.add(cleanRut);
                rutsToEnroll.push(cleanRut);
                
                const hasName = rowStrings[1] && rowStrings[1].length > 1; 
                const hasSurname = rowStrings[2] && rowStrings[2].length > 1;
                
                if (hasName || hasSurname) {
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
            
            // Procesar Upsert de Usuarios
            if (usersToUpsert.length > 0) { 
                await upsertUsers(usersToUpsert); 
            }
            
            // Procesar Matrícula Masiva
            const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
            
            // Construir mensaje de reporte detallado
            let msgType: 'success' | 'error' = 'success';
            let details = `Procesados correctamente: ${result.success}. Ya estaban inscritos: ${result.skipped}.`;
            
            if (duplicatesInFile > 0 || invalidRows > 0) {
                msgType = 'error'; // Usamos estilo de error (rojo) para llamar la atención aunque haya funcionado parcialmente
                details += ` ATENCIÓN: Se omitieron ${duplicatesInFile} RUTs duplicados en el archivo y ${invalidRows} filas inválidas.`;
            }
            
            setEnrollMsg({ type: msgType, text: details }); 
            setUploadFile(null);
        };
        isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
    };

    // --- JSX RENDER ---

    if (view === 'list') {
        return (
            <div className="animate-fadeIn space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos Académicos</h2>
                        <p className="text-sm text-slate-500">Cursos curriculares con notas y asistencia.</p>
                    </div>
                    {isAdmin && (
                        <button onClick={() => {
                            setFormData({
                                internalCode: '', year: new Date().getFullYear(), nombre: '', modality: 'Presencial', horas: 0, relator: '', fechaInicio: '', evaluationCount: 3, linkRecursos: '', linkClase: '', linkEvaluacion: '', isPublic: true
                            });
                            setView('create');
                        }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Nuevo Curso
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {academicActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative group hover:border-indigo-300 transition-colors">
                            <h3 className="font-bold text-slate-800 text-lg mb-2 pr-2">{act.name}</h3>
                            <div className="text-sm text-slate-500 space-y-1 mb-4">
                                <p className="text-xs font-mono text-slate-400">ID: {act.id}</p>
                                <p>Modalidad: {act.modality}</p>
                                <p>Fecha: {formatDateCL(act.startDate)}</p>
                            </div>
                            <button onClick={() => { setSelectedCourseId(act.id); setView('details'); }} className="w-full bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-indigo-500 hover:text-indigo-600 transition-colors text-sm">
                                Gestionar / Detalles
                            </button>
                        </div>
                    ))}
                    {academicActivities.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            No hay cursos académicos registrados.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // CREATE / EDIT / DETAILS
    return (
        <div className="max-w-5xl mx-auto animate-fadeIn">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
            
            {/* TABS HEADER FOR DETAILS */}
            {view === 'details' && (
                <div className="flex items-end gap-2 border-b border-indigo-200 mb-0">
                    <button 
                        onClick={() => setActiveDetailTab('enrollment')} 
                        className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-indigo-100 shadow-sm translate-y-[1px] z-10' : 'bg-slate-100 text-slate-500 border-t-transparent hover:bg-slate-200'}`}
                    >
                        Matrícula
                    </button>
                    {/* Add Tracking Tab logic here if needed */}
                </div>
            )}

            <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-8 ${view === 'details' ? 'rounded-tl-none border-t-indigo-100' : ''}`}>
                
                {/* FORM VIEW (Create/Edit) */}
                {(view === 'create' || view === 'edit') && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                            <h2 className="text-xl font-bold text-slate-800">{view === 'create' ? 'Crear Curso Académico' : 'Editar Curso'}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Curso</label>
                                <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label>
                                <input type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded font-mono"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label>
                                <select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded">
                                    <option value="Presencial">Presencial</option>
                                    <option value="Híbrido">Híbrido</option>
                                    <option value="Online">Online</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Cant. Evaluaciones</label>
                                <input type="number" min="1" max="10" value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio</label>
                                <input type="date" value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded"/>
                            </div>
                        </div>
                        <div className="flex justify-end pt-6 border-t border-slate-100">
                            {view === 'edit' && <button type="button" onClick={handleDelete} className="text-red-600 mr-auto font-bold text-sm">Eliminar Curso</button>}
                            <button type="submit" className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-colors">Guardar</button>
                        </div>
                    </form>
                )}

                {/* DETAILS VIEW (Enrollment) */}
                {view === 'details' && activeDetailTab === 'enrollment' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{selectedCourse?.name}</h3>
                                <p className="text-sm text-slate-500">Matrícula y Asignación</p>
                            </div>
                            <button onClick={() => handleEdit(selectedCourse!)} className="text-indigo-600 bg-indigo-50 px-3 py-1 rounded text-sm font-bold border border-indigo-200">
                                Editar Datos Curso
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Manual Enroll */}
                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                    Matrícula Individual
                                </h4>
                                <form onSubmit={handleEnrollSubmit} className="space-y-4">
                                    <div className="relative">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                        <input 
                                            type="text" 
                                            name="rut" 
                                            placeholder="12345678-9" 
                                            value={enrollForm.rut} 
                                            onChange={handleEnrollChange} 
                                            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 font-bold"
                                        />
                                        {showSuggestions && suggestions.length > 0 && (
                                            <div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                                                {suggestions.map((s) => (
                                                    <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs border-b border-slate-50">
                                                        <span className="font-bold block text-slate-800">{s.rut}</span>
                                                        <span className="text-slate-500">{s.names} {s.paternalSurname}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" name="names" placeholder="Nombres" value={enrollForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                        <input type="text" name="paternalSurname" placeholder="Ap. Paterno" value={enrollForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-xs"/>
                                    </div>
                                    <SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={handleEnrollChange} className="text-xs" />
                                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">Matricular</button>
                                    {enrollMsg && <div className={`text-xs p-2 rounded text-center ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{enrollMsg.text}</div>}
                                </form>
                            </div>

                            {/* Bulk Enroll */}
                            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Carga Masiva (CSV/Excel)
                                </h4>
                                <div className="flex flex-col gap-4">
                                    <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {uploadFile ? <p className="text-xs font-bold text-emerald-700">{uploadFile.name}</p> : <p className="text-xs text-slate-500">Click para subir archivo</p>}
                                        </div>
                                        <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} />
                                    </label>
                                    <div className="flex items-center gap-2 justify-center">
                                        <input type="checkbox" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500"/>
                                        <span className="text-xs text-slate-500">Ignorar encabezados</span>
                                    </div>
                                    <button onClick={handleBulkEnroll} disabled={!uploadFile} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-sm hover:bg-slate-900 disabled:opacity-50">Procesar Carga</button>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-3">Estudiante</th>
                                        <th className="px-6 py-3">RUT</th>
                                        <th className="px-6 py-3 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {courseEnrollments.map(enr => {
                                        const u = users.find(user => user.rut === enr.rut);
                                        return (
                                            <tr key={enr.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3">{u?.names} {u?.paternalSurname}</td>
                                                <td className="px-6 py-3 font-mono text-xs text-slate-500">{enr.rut}</td>
                                                <td className="px-6 py-3 text-center"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">{enr.state}</span></td>
                                            </tr>
                                        );
                                    })}
                                    {courseEnrollments.length === 0 && <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No hay estudiantes matriculados.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
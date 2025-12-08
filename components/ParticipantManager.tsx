
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';

// Utility para formatear RUT
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

// --- Helper de Normalización ---
const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};


export const ParticipantManager: React.FC = () => {
  const { upsertUsers, getUser, deleteUser, users, config } = useData(); 
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  
  // DYNAMIC LISTS
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // Solo filtramos Estudiantes para auditoría visual, aunque la gestión permite todo
  const studentsOnly = users.filter(u => u.systemRole === UserRole.ESTUDIANTE);

  const [isEditing, setIsEditing] = useState(false);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const originalUserRef = useRef<User | null>(null);

  // --- Audit States ---
  const [filterMode, setFilterMode] = useState<'inconsistent' | 'incomplete' | null>(null);

  const totalStudents = studentsOnly.length;
  const uniqueFaculties = new Set(studentsOnly.map(u => u.faculty).filter(f => f && f !== '')).size;

  // --- Audit Logic ---
  const checkInconsistency = (u: User) => {
      if (u.faculty && !listFaculties.includes(u.faculty)) return true;
      if (u.department && !listDepts.includes(u.department)) return true;
      if (u.career && !listCareers.includes(u.career)) return true;
      return false;
  };

  const checkIncomplete = (u: User) => {
      if (!u.email || u.email === '') return true;
      if (!u.campus || u.campus === '') return true;
      return false;
  };

  const inconsistentUsers = useMemo(() => studentsOnly.filter(checkInconsistency), [studentsOnly, listFaculties]);
  const incompleteUsers = useMemo(() => studentsOnly.filter(checkIncomplete), [studentsOnly]);

  const filteredUsers = useMemo(() => {
      if (filterMode === 'inconsistent') return inconsistentUsers;
      if (filterMode === 'incomplete') return incompleteUsers;
      return [];
  }, [filterMode, inconsistentUsers, incompleteUsers]);


  // Manual Form State
  const [manualForm, setManualForm] = useState({
    rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
    faculty: '', department: '', career: '', contractType: '', teachingSemester: '',
    campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [manualStatus, setManualStatus] = useState<'idle' | 'error' | 'success' | 'deleted'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [rutError, setRutError] = useState<string | null>(null);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [fileReport, setFileReport] = useState<{ total: number, success: number, updated: number, existing: number, errors: any[] } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRutBlur = () => {
      if (!manualForm.rut) return;
      const formatted = cleanRutFormat(manualForm.rut);
      setManualForm(prev => ({ ...prev, rut: formatted }));
      loadUserIntoForm(formatted);
  };

  const loadUserIntoForm = (rut: string) => {
      const existingUser = getUser(rut);
      setSearchTriggered(true);

      if (existingUser) {
          setIsEditing(true);
          originalUserRef.current = { ...existingUser };
          
          setManualForm({
              rut: existingUser.rut,
              names: existingUser.names || '',
              paternalSurname: existingUser.paternalSurname || '',
              maternalSurname: existingUser.maternalSurname || '',
              email: existingUser.email || '',
              phone: existingUser.phone || '',
              faculty: existingUser.faculty || '',
              department: existingUser.department || '',
              career: existingUser.career || '',
              contractType: existingUser.contractType || '',
              teachingSemester: existingUser.teachingSemester || '',
              campus: existingUser.campus || '',
              academicRole: existingUser.academicRole || '',
              systemRole: existingUser.systemRole || UserRole.ESTUDIANTE
          });
          setManualStatus('idle');
          setStatusMsg('');
      } else {
          setIsEditing(false);
          originalUserRef.current = null;
      }
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
    if (name === 'rut') { setRutError(null); setSearchTriggered(false); }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) {
        setManualStatus('error');
        setRutError('Complete los campos obligatorios');
        return;
    }
    
    // Check existing role to avoid accidental downgrade manually
    const existing = getUser(manualForm.rut);
    const roleToSave = existing ? existing.systemRole : (manualForm.systemRole as UserRole);

    const newUser: User = {
        rut: manualForm.rut,
        names: manualForm.names,
        paternalSurname: manualForm.paternalSurname,
        maternalSurname: manualForm.maternalSurname,
        email: manualForm.email,
        phone: manualForm.phone,
        faculty: manualForm.faculty,
        department: manualForm.department,
        career: manualForm.career,
        contractType: manualForm.contractType,
        teachingSemester: manualForm.teachingSemester,
        campus: manualForm.campus,
        academicRole: manualForm.academicRole,
        systemRole: roleToSave,
        password: existing?.password, // Preserve password
        photoUrl: existing?.photoUrl  // Preserve photo
    };

    upsertUsers([newUser]);
    setManualStatus('success');
    setStatusMsg(isEditing ? 'Usuario actualizado.' : 'Usuario creado.');

    setTimeout(() => {
        setManualStatus('idle');
        setStatusMsg('');
        if (!isEditing) {
            setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE });
            setSearchTriggered(false);
        }
    }, 2000);
  };

  const handleDelete = () => {
      if (confirm(`¿Está seguro de eliminar al estudiante ${manualForm.rut}?`)) {
          deleteUser(manualForm.rut);
          setManualStatus('deleted');
          setStatusMsg('Estudiante eliminado.');
          setIsEditing(false);
          setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE });
      }
  };

  // CSV Processing simplified for brevity... (same logic)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { setFile(e.target.files[0]); setFileReport(null); }
  };

  const processFile = () => {
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = async (e) => {
      let rows: any[][] = [];
      if (isExcel) {
          const data = e.target?.result;
          const workbook = read(data, { type: 'array' });
          rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      } else {
          const text = e.target?.result as string;
          const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
          if (lines.length > 0) rows = lines.map(line => line.split(lines[0].includes(';') ? ';' : ','));
      }

      if (rows.length === 0) { setIsProcessing(false); return; }

      const validUsers: User[] = [];
      let startRow = hasHeaders ? 1 : 0;

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rowStrings = row.map(cell => cell ? String(cell).trim() : '');
        if (!rowStrings[0]) continue;

        const rut = cleanRutFormat(rowStrings[0]);
        
        // --- CRITICAL PROTECTION LOGIC START ---
        // Verificar si el usuario ya existe en la Base Maestra
        const existingUser = users.find(u => u.rut === rut);

        // Si existe y es ASESOR o ADMIN, mantenemos sus credenciales y roles.
        // Si no existe, se asume ESTUDIANTE.
        const protectedRole = existingUser ? existingUser.systemRole : UserRole.ESTUDIANTE;
        const protectedPassword = existingUser ? existingUser.password : undefined;
        const protectedPhoto = existingUser ? existingUser.photoUrl : undefined;
        const protectedTitle = existingUser ? existingUser.title : undefined;
        // --- CRITICAL PROTECTION LOGIC END ---

        validUsers.push({
             rut: rut,
             names: rowStrings[1] || '',
             paternalSurname: rowStrings[2] || '',
             maternalSurname: rowStrings[3] || '',
             email: rowStrings[4] || '',
             phone: rowStrings[5] || '',
             
             // Datos Académicos (estos sí se actualizan desde el Excel)
             academicRole: normalizeValue(rowStrings[6], listRoles),
             faculty: normalizeValue(rowStrings[7], listFaculties),
             department: normalizeValue(rowStrings[8], listDepts),
             career: normalizeValue(rowStrings[9], listCareers),
             contractType: normalizeValue(rowStrings[10], listContracts),
             teachingSemester: normalizeValue(rowStrings[11], listSemesters),
             campus: rowStrings[12] || '',
             
             // Datos Protegidos del Sistema
             systemRole: protectedRole,
             password: protectedPassword,
             photoUrl: protectedPhoto,
             title: protectedTitle
        });
      }

      const result = await upsertUsers(validUsers);
      setFileReport({ total: validUsers.length, success: result.added, updated: result.updated, existing: 0, errors: [] });
      setIsProcessing(false);
      setFile(null); 
    };
    isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
      
      <div className="bg-[#647FBC]/5 border border-[#647FBC]/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-[#647FBC]">Base Maestra de Estudiantes</h2>
            <p className="text-[#647FBC]/80">Administración de perfiles de profesores-estudiantes.</p>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 md:mt-0">
               <button onClick={() => setFilterMode(prev => prev === 'inconsistent' ? null : 'inconsistent')} className="px-4 py-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700 text-xs font-bold uppercase">
                   Inconsistencias: {inconsistentUsers.length}
               </button>
               <button onClick={() => setFilterMode(prev => prev === 'incomplete' ? null : 'incomplete')} className="px-4 py-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700 text-xs font-bold uppercase">
                   Incompletos: {incompleteUsers.length}
               </button>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
          <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 bg-[#F9F8F6] pt-4">
             <button onClick={() => setActiveTab('manual')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 ${activeTab === 'manual' ? 'bg-white text-[#647FBC] border-t-[#647FBC] shadow-sm' : 'bg-slate-200 text-slate-600 border-transparent'}`}>Gestión Individual</button>
             <button onClick={() => setActiveTab('upload')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 ${activeTab === 'upload' ? 'bg-white text-[#647FBC] border-t-[#647FBC] shadow-sm' : 'bg-slate-200 text-slate-600 border-transparent'}`}>Carga Masiva (CSV)</button>
          </div>

          <div className="p-8">
            {activeTab === 'manual' && (
              <div className="animate-fadeIn">
                 <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-700">{isEditing ? 'Editar Estudiante' : 'Registrar Nuevo Estudiante'}</h3>
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] uppercase font-bold rounded">Estudiantes Activos: {totalStudents}</span>
                 </div>

                 <form onSubmit={handleManualSubmit} className="space-y-8">
                    {/* Campos requeridos de Base Maestra (13 Campos) */}
                    
                    {/* 1. IDENTIFICACIÓN */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Identificación</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-700 mb-1">RUT *</label>
                                <input type="text" name="rut" placeholder="12345678-9" value={manualForm.rut} onChange={handleManualChange} onBlur={handleRutBlur} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] font-bold"/>
                            </div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualChange} className="w-full px-3 py-2 border rounded"/></div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualChange} className="w-full px-3 py-2 border rounded"/></div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualChange} className="w-full px-3 py-2 border rounded"/></div>
                        </div>
                    </div>

                    {/* 2. CONTACTO */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Contacto</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Electrónico</label><input type="email" name="email" value={manualForm.email} onChange={handleManualChange} className="w-full px-3 py-2 border rounded"/></div>
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualChange} className="w-full px-3 py-2 border rounded"/></div>
                        </div>
                    </div>

                    {/* 3. ANTECEDENTES ACADÉMICOS */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Antecedentes Académicos</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><SmartSelect label="Sede / Campus" name="campus" value={manualForm.campus} options={config.campuses || ["Valparaíso", "San Felipe"]} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Rol Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Tipo Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Semestre Docencia" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleManualChange} /></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Perfil (App)</label>
                            <select name="systemRole" value={manualForm.systemRole} onChange={handleManualChange} className="w-full px-3 py-2 border rounded bg-slate-50">
                                <option value={UserRole.ESTUDIANTE}>Estudiante (Profesor)</option>
                                <option value={UserRole.ASESOR}>Asesor (Gestión)</option>
                                <option value={UserRole.ADMIN}>Administrador</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-6 flex justify-between items-center">
                        {isEditing && <button type="button" onClick={handleDelete} className="text-red-600 hover:text-red-800 text-sm font-bold">Eliminar Estudiante</button>}
                        <div className="flex-1 flex justify-end gap-3 items-center">
                             {manualStatus === 'success' && <span className="text-green-600 font-bold">{statusMsg}</span>}
                             <button type="submit" className="px-8 py-2.5 bg-[#647FBC] text-white rounded-lg font-bold">{isEditing ? 'Actualizar' : 'Crear Estudiante'}</button>
                        </div>
                    </div>
                 </form>
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="max-w-3xl mx-auto animate-fadeIn">
                   
                   <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-8 flex items-start gap-4">
                       <div className="p-3 bg-white rounded-full shadow-sm text-indigo-600">
                           <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                       </div>
                       <div>
                           <h3 className="text-lg font-bold text-indigo-900">Importación Masiva de Estudiantes</h3>
                           <p className="text-sm text-indigo-700 mt-1">
                               Utilice esta herramienta para cargar o actualizar la Base Maestra de estudiantes desde un archivo Excel o CSV.
                               El sistema utilizará el <strong>RUT</strong> como identificador único para crear nuevos registros o actualizar los existentes.
                           </p>
                       </div>
                   </div>

                   <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
                       
                       <div className="flex flex-col items-center justify-center space-y-6">
                           
                           {/* DROPZONE */}
                           <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 group
                               ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-[#647FBC]'}`}>
                               
                               <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                   {file ? (
                                       <>
                                           <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-3 text-emerald-600 shadow-sm">
                                               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                           </div>
                                           <p className="mb-1 text-lg font-bold text-emerald-700">{file.name}</p>
                                           <p className="text-xs text-emerald-600">{(file.size / 1024).toFixed(1)} KB - Listo para procesar</p>
                                       </>
                                   ) : (
                                       <>
                                           <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-[#647FBC] group-hover:scale-110 transition-transform shadow-sm">
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                           </div>
                                           <p className="mb-2 text-sm text-slate-500"><span className="font-bold text-[#647FBC]">Haga clic para seleccionar</span> o arrastre el archivo aquí</p>
                                           <p className="text-xs text-slate-400">Formatos soportados: .xlsx, .xls, .csv</p>
                                       </>
                                   )}
                               </div>
                               <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={handleFileChange} />
                           </label>

                           {/* OPTIONS */}
                           <div className="flex items-center gap-2 self-start pl-2">
                                <input 
                                    type="checkbox" 
                                    id="hasHeaders" 
                                    checked={hasHeaders} 
                                    onChange={e => setHasHeaders(e.target.checked)}
                                    className="w-4 h-4 text-[#647FBC] rounded border-slate-300 focus:ring-[#647FBC]"
                                />
                                <label htmlFor="hasHeaders" className="text-sm text-slate-600 cursor-pointer select-none">
                                    La primera fila contiene encabezados (Ignorar fila 1)
                                </label>
                           </div>

                           {/* PROCESS BUTTON */}
                           <button 
                                onClick={processFile} 
                                disabled={!file || isProcessing}
                                className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-3
                                    ${!file 
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                        : isProcessing 
                                            ? 'bg-slate-800 text-white cursor-wait' 
                                            : 'bg-[#647FBC] text-white hover:bg-blue-800 hover:shadow-lg hover:-translate-y-1'
                                    }`}
                           >
                               {isProcessing ? (
                                   <>
                                       <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                       </svg>
                                       Procesando Archivo...
                                   </>
                               ) : (
                                   <>
                                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                       Cargar Estudiantes a Base Maestra
                                   </>
                               )}
                           </button>

                           {/* REPORT */}
                           {fileReport && (
                               <div className="w-full animate-fadeIn bg-slate-50 border border-slate-200 rounded-xl p-6 mt-4">
                                   <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                       <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                       Resumen de Carga
                                   </h4>
                                   <div className="grid grid-cols-3 gap-4 text-center">
                                       <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                           <span className="block text-2xl font-bold text-slate-800">{fileReport.total}</span>
                                           <span className="text-xs text-slate-500 uppercase font-bold">Total Filas</span>
                                       </div>
                                       <div className="bg-white p-3 rounded-lg border border-green-200 shadow-sm">
                                           <span className="block text-2xl font-bold text-green-600">{fileReport.success}</span>
                                           <span className="text-xs text-green-600 uppercase font-bold">Nuevos</span>
                                       </div>
                                       <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                                           <span className="block text-2xl font-bold text-blue-600">{fileReport.updated}</span>
                                           <span className="text-xs text-blue-600 uppercase font-bold">Actualizados</span>
                                       </div>
                                   </div>
                               </div>
                           )}

                           <div className="w-full border-t border-slate-100 pt-6 mt-2">
                               <p className="text-xs text-slate-400 text-center mb-2">Columnas esperadas en el archivo (Orden sugerido):</p>
                               <div className="bg-slate-100 rounded-lg p-3 text-[10px] font-mono text-slate-500 text-center overflow-x-auto whitespace-nowrap border border-slate-200">
                                   RUT | NOMBRES | AP.PATERNO | AP.MATERNO | EMAIL | TELEFONO | ROL | FACULTAD | DEPTO | CARRERA | CONTRATO | SEMESTRE | SEDE
                               </div>
                           </div>

                       </div>
                   </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

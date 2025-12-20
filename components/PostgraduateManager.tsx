
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole, ProgramModule, ProgramConfig } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
import { useReloadDirective } from '../hooks/useReloadDirective';

// --- Utility Functions ---
const normalizeRut = (rut: string): string => {
    if (!rut) return '';
    return rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '').toLowerCase();
};

const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
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

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking' | 'config';

interface PostgraduateManagerProps {
    currentUser?: User;
}

export const PostgraduateManager: React.FC<PostgraduateManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective();
  
  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  const isAdvisor = currentUser?.systemRole === UserRole.ASESOR;
  
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  const postgraduateActivities = activities.filter(a => a.category === 'POSTGRADUATE');

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), semester: 'ANUAL', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: ''
  });

  const [programConfig, setProgramConfig] = useState<ProgramConfig>({
      programType: 'Diplomado', modules: [], globalAttendanceRequired: 75
  });

  const selectedCourse = useMemo(() => postgraduateActivities.find(a => a.id === selectedCourseId), [postgraduateActivities, selectedCourseId]);

  useEffect(() => {
      if (selectedCourse && selectedCourse.programConfig) {
          setProgramConfig(selectedCourse.programConfig);
      } else if (selectedCourse) {
          setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75 });
      }
  }, [selectedCourse]);

  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          const surnameA = userA?.paternalSurname || '';
          const surnameB = userB?.paternalSurname || '';
          return surnameA.localeCompare(surnameB, 'es', { sensitivity: 'base' });
      });
  }, [courseEnrollments, users]);

  const handleAddModule = () => {
      const newModule: ProgramModule = { id: `MOD-${Date.now()}`, name: `Módulo ${programConfig.modules.length + 1}`, evaluationCount: 1, evaluationWeights: [100], weight: 0, classDates: [] };
      setProgramConfig(prev => ({ ...prev, modules: [...prev.modules, newModule] }));
  };

  const handleUpdateModule = (id: string, field: keyof ProgramModule, value: any) => {
      setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => m.id === id ? { ...m, [field]: value } : m) }));
  };

  const handleRemoveModule = (id: string) => {
      if(confirm("¿Eliminar este módulo?")) setProgramConfig(prev => ({ ...prev, modules: prev.modules.filter(m => m.id !== id) }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
    const academicPeriodText = `${formData.year}-${formData.semester}`;
    const generatedId = (view === 'edit' && selectedCourseId) ? selectedCourseId : `${cleanCode}-${academicPeriodText}-${formData.version}`;
    
    const newActivity: Activity = { id: generatedId, category: 'POSTGRADUATE', internalCode: formData.internalCode, year: formData.year, academicPeriod: academicPeriodText, name: formData.nombre, version: formData.version, modality: formData.modality, hours: formData.horas, moduleCount: programConfig.modules.length, evaluationCount: programConfig.modules.length, relator: formData.relator, startDate: formData.fechaInicio, endDate: formData.fechaTermino, linkResources: formData.linkRecursos, classLink: formData.linkClase, evaluationLink: formData.linkEvaluacion, isPublic: true, programConfig: programConfig };
    
    await addActivity(newActivity);
    await executeReload();
    setView('list');
  };

  if (view === 'list') {
      return (
          <div className="animate-fadeIn space-y-6">
              <div className="flex justify-between items-center">
                  <div>
                      <h2 className="text-2xl font-bold text-slate-800">Programas de Postítulo y Diplomados</h2>
                      <p className="text-sm text-slate-500">Gestión académica modular para programas de especialización.</p>
                  </div>
                  {(isAdmin || isAdvisor) && (
                      <button onClick={() => setView('create')} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-purple-700 flex items-center gap-2 transition-all">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Nuevo Programa
                      </button>
                  )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {postgraduateActivities.map(act => (
                      <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] font-bold uppercase bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">{act.programConfig?.programType || 'Postítulo'}</span>
                              <span className="text-xs text-slate-400 font-mono">{act.internalCode}</span>
                          </div>
                          <h3 className="text-lg font-bold text-slate-800 mb-2 h-14 line-clamp-2">{act.name}</h3>
                          <div className="text-xs text-slate-500 space-y-1 mb-4">
                              <p>Director: {act.relator || 'No asignado'}</p>
                              <p>Módulos: {act.programConfig?.modules?.length || 0}</p>
                              <p>Modalidad: {act.modality}</p>
                          </div>
                          <button 
                            id="tour-postgrad-btn-manage"
                            onClick={() => { setSelectedCourseId(act.id); setView('details'); }} 
                            className="w-full py-2 bg-purple-600 text-white rounded-lg font-bold text-xs hover:bg-purple-700 transition-all shadow-sm"
                          >
                            Gestionar Programa
                          </button>
                      </div>
                  ))}
                  {postgraduateActivities.length === 0 && (
                      <div className="col-span-full py-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                          <p className="text-slate-400 italic">No hay programas de postítulo registrados.</p>
                      </div>
                  )}
              </div>
          </div>
      );
  }

  return (
      <div className="animate-fadeIn max-w-6xl mx-auto">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al Listado</button>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="bg-purple-600 p-6 text-white">
                  <h2 className="text-xl font-bold">{view === 'create' ? 'Crear Programa de Postítulo' : 'Edición de Programa'}</h2>
              </div>
              <form onSubmit={handleCreateSubmit} className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre Oficial del Programa</label><input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                      <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tipo de Programa</label><select value={programConfig.programType} onChange={e => setProgramConfig({...programConfig, programType: e.target.value as any})} className="w-full px-4 py-2 border rounded-lg bg-white"><option value="Diplomado">Diplomado</option><option value="Postítulo">Postítulo</option><option value="Magíster">Magíster</option></select></div>
                      <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Director / Responsable</label><input type="text" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-2 border rounded-lg"/></div>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="flex justify-between items-center"><h3 className="text-sm font-bold text-purple-600 uppercase">Estructura Modular del Programa</h3><button type="button" onClick={handleAddModule} className="bg-purple-50 text-purple-600 px-3 py-1 rounded-full text-xs font-bold border border-purple-200 hover:bg-purple-100">+ Agregar Módulo</button></div>
                      <div className="grid grid-cols-1 gap-4">
                          {programConfig.modules.map((mod, idx) => (
                              <div key={mod.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
                                  <div className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</div>
                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <div className="md:col-span-2"><input placeholder="Nombre del Módulo" value={mod.name} onChange={e => handleUpdateModule(mod.id, 'name', e.target.value)} className="w-full px-3 py-2 border rounded bg-white text-sm font-bold"/></div>
                                      <div><input type="number" placeholder="Ponderación %" value={mod.weight || ''} onChange={e => handleUpdateModule(mod.id, 'weight', Number(e.target.value))} className="w-full px-3 py-2 border rounded bg-white text-sm" /></div>
                                  </div>
                                  <button type="button" onClick={() => handleRemoveModule(mod.id)} className="text-red-400 hover:text-red-600 p-2">&times;</button>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="flex justify-end pt-6 border-t"><button type="submit" className="bg-purple-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-purple-700 transition-all">Guardar Programa Completo</button></div>
              </form>
          </div>
      </div>
  );
};


import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Activity, User, UserRole } from '../types';
import { GENERAL_ACTIVITY_TYPES } from '../constants';

interface GeneralActivityManagerProps {
    currentUser: User;
}

type ViewState = 'list' | 'create' | 'edit' | 'details';

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

export const GeneralActivityManager: React.FC<GeneralActivityManagerProps> = ({ currentUser }) => {
    const { activities, addActivity, deleteActivity } = useData();
    
    // FILTER: Only General Activities
    const generalActivities = activities.filter(a => a.category === 'GENERAL');
    
    const [view, setView] = useState<ViewState>('list');
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        internalCode: '',
        year: new Date().getFullYear(),
        activityType: 'Charla',
        otherType: '', // For "Otro"
        nombre: '', 
        modality: 'Presencial', 
        horas: 0, 
        relator: '', 
        fechaInicio: '',
        linkRecursos: '',
        linkClase: '',
        linkEvaluacion: ''
    });

    const isAdmin = currentUser.systemRole === UserRole.ADMIN;
    // Asesores can only edit Resources
    const canEditGeneralInfo = isAdmin || view === 'create'; 

    // --- AUTO-GENERATE CODE LOGIC ---
    useEffect(() => {
        // Enable for both CREATE and EDIT modes so updates to Date/Type reflect in Code
        if (view === 'create' || view === 'edit') {
            // 1. Determine Prefix
            const typeKey = formData.activityType; 
            const prefix = TYPE_PREFIXES[typeKey] || "ACT";

            // 2. Determine Date (Selected or Today)
            let d = "", m = "", y = "";
            
            if (formData.fechaInicio) {
                const parts = formData.fechaInicio.split('-'); // YYYY-MM-DD
                if (parts.length === 3) {
                    y = parts[0].slice(2); // Last 2 digits
                    m = parts[1];
                    d = parts[2];
                }
            } else {
                const today = new Date();
                d = String(today.getDate()).padStart(2, '0');
                m = String(today.getMonth() + 1).padStart(2, '0');
                y = String(today.getFullYear()).slice(2);
            }

            // 3. Construct Code: PRE-DDMMAA-V1
            // Only auto-update if we have a valid date structure to avoid "undefined" strings
            if (d && m && y) {
                const autoCode = `${prefix}-${d}${m}${y}-V1`;
                // In Edit mode, we update the code. Note: This might overwrite manual codes if the date is touched.
                setFormData(prev => ({ ...prev, internalCode: autoCode }));
            }
        }
    }, [formData.activityType, formData.fechaInicio, view]);


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
            linkEvaluacion: act.evaluationLink || ''
        });
        setView('edit');
    };

    // --- AUTO-JUMP LOGIC FROM DASHBOARD ---
    useEffect(() => {
        const jumpId = localStorage.getItem('jumpto_activity_id');
        if (jumpId && generalActivities.length > 0) {
            const found = generalActivities.find(a => a.id === jumpId);
            if (found) {
                handleEdit(found);
            }
            localStorage.removeItem('jumpto_activity_id');
        }
    }, [generalActivities]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const finalType = formData.activityType === 'Otro' ? formData.otherType : formData.activityType;
        const finalCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
        
        // FIX: Use finalCode directly as ID for new activities to maintain standard format (CHA-DDMMAA-V1)
        // Do not append timestamp or year.
        const generatedId = selectedActivity ? selectedActivity.id : finalCode;

        const activityToSave: Activity = {
            id: generatedId,
            category: 'GENERAL',
            activityType: finalType,
            internalCode: finalCode,
            year: formData.year,
            name: formData.nombre,
            version: 'V1', // Default
            modality: formData.modality,
            hours: formData.horas,
            relator: formData.relator,
            startDate: formData.fechaInicio,
            // Only update these if edited
            linkResources: formData.linkRecursos,
            classLink: formData.linkClase,
            evaluationLink: formData.linkEvaluacion
        };
        
        addActivity(activityToSave); 
        
        setView('list');
        setSelectedActivity(null);
    };

    const handleDelete = async () => {
        if (!selectedActivity) return;
        
        const password = prompt(`ADVERTENCIA: Está a punto de ELIMINAR la actividad:\n\n"${selectedActivity.name}"\n\nEsta acción es irreversible. Para confirmar, ingrese su contraseña de ADMINISTRADOR:`);
        
        if (password === currentUser.password) {
            await deleteActivity(selectedActivity.id);
            alert("Actividad eliminada correctamente.");
            setView('list');
            setSelectedActivity(null);
        } else if (password !== null) {
            alert("Contraseña incorrecta. Acción cancelada.");
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
                    {isAdmin && (
                        <button onClick={() => {
                            setFormData({
                                internalCode: '', year: new Date().getFullYear(), activityType: 'Charla', otherType: '',
                                nombre: '', modality: 'Presencial', horas: 0, relator: '', fechaInicio: '',
                                linkRecursos: '', linkClase: '', linkEvaluacion: ''
                            });
                            setView('create');
                        }} className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 flex items-center gap-2 shadow-lg">
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

    // CREATE / EDIT VIEW
    return (
        <div className="max-w-4xl mx-auto animate-fadeIn">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                    <h2 className="text-xl font-bold text-slate-800">
                        {view === 'create' ? 'Crear Nueva Actividad' : 'Editar Actividad'}
                    </h2>
                    {!isAdmin && view === 'edit' && (
                        <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                            Modo Asesor: Solo Recursos Editables
                        </span>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Actividad</label>
                                <input type="text" disabled={!canEditGeneralInfo} required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"/>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo Actividad</label>
                                <select disabled={!canEditGeneralInfo} value={formData.activityType} onChange={e => setFormData({...formData, activityType: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500">
                                    {GENERAL_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                             </div>
                             {formData.activityType === 'Otro' && (
                                 <div>
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

                    {/* Resources Section - ALWAYS EDITABLE */}
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
            </div>
        </div>
    );
};

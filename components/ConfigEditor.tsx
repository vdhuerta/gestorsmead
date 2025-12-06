
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { SystemConfig } from '../types';

export const ConfigEditor: React.FC = () => {
  const { config, updateConfig } = useData();
  // Local state for form editing
  const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalConfig(prev => ({
      ...prev,
      [name]: name === 'contactEmail' ? value : Number(value)
    }));
  };

  // Helper para convertir string (textarea) a array de strings
  const handleListChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const arrayValues = value.split('\n').filter(line => line.trim() !== '');
    // @ts-ignore - Dynamic key access
    setLocalConfig(prev => ({
      ...prev,
      [name]: arrayValues
    }));
  };

  const handleSave = () => {
    // Validación básica de negocio
    if (localConfig.minPassingGrade > localConfig.gradingScaleMax || localConfig.minPassingGrade < localConfig.gradingScaleMin) {
        setMessage({ text: 'Error: La nota de aprobación debe estar dentro de la escala.', type: 'error' });
        return;
    }

    setIsSaving(true);
    setMessage(null);

    // Update Global Context and Persist
    setTimeout(() => {
      updateConfig(localConfig);
      setIsSaving(false);
      setMessage({ text: 'Configuración actualizada y guardada localmente.', type: 'success' });
      
      // Limpiar mensaje después de 3 seg
      setTimeout(() => setMessage(null), 3000);
    }, 800);
  };

  // Helper para renderizar textareas de lista
  const renderListEditor = (label: string, fieldName: keyof SystemConfig, placeholder: string) => (
      <div>
          <label className="block text-xs font-bold text-[#647FBC] uppercase tracking-wide mb-2">{label}</label>
          <textarea
              name={fieldName}
              // @ts-ignore
              value={localConfig[fieldName]?.join('\n') || ''}
              onChange={handleListChange}
              placeholder={placeholder}
              className="w-full h-32 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] font-mono whitespace-pre resize-y"
          />
          <p className="text-[10px] text-slate-400 mt-1">Un elemento por línea.</p>
      </div>
  );

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#647FBC] to-slate-700 px-8 py-6">
            <h2 className="text-2xl font-bold text-white mb-2">Configuración Global del Sistema</h2>
            <p className="text-blue-100 text-sm">
                Define las variables por defecto y listas maestras que se utilizarán en todo el sistema.
            </p>
        </div>

        <div className="p-8">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-b border-slate-200 pb-8">
                
                {/* Sección Académica */}
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Parámetros Académicos
                    </h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Año Académico Vigente</label>
                        <input 
                            type="number" 
                            name="academicYear"
                            value={localConfig.academicYear}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"
                        />
                        <p className="text-xs text-slate-500 mt-1">Se usará como filtro por defecto en reportes.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Porcentaje Mínimo de Asistencia (%)</label>
                        <input 
                            type="number" 
                            name="minAttendancePercentage"
                            min="0" max="100"
                            value={localConfig.minAttendancePercentage}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"
                        />
                        <p className="text-xs text-slate-500 mt-1">Requisito para aprobar cursos automáticamente.</p>
                    </div>
                </div>

                {/* Sección Evaluación */}
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
                         <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Escala de Evaluación
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">Nota Mínima</label>
                             <input 
                                type="number" 
                                name="gradingScaleMin"
                                step="0.1"
                                value={localConfig.gradingScaleMin}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC] bg-slate-100"
                                readOnly
                             />
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">Nota Máxima</label>
                             <input 
                                type="number" 
                                name="gradingScaleMax"
                                step="0.1"
                                value={localConfig.gradingScaleMax}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC] bg-slate-100"
                                readOnly
                             />
                        </div>
                    </div>
                     <p className="text-xs text-slate-400 -mt-4">Escala estándar nacional (Chile).</p>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nota de Aprobación</label>
                        <input 
                            type="number" 
                            name="minPassingGrade"
                            step="0.1"
                            value={localConfig.minPassingGrade}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"
                        />
                        <p className="text-xs text-slate-500 mt-1">Los promedios inferiores a este valor serán marcados como "Reprobado".</p>
                    </div>
                </div>
            </div>

            {/* SECCIÓN GESTIÓN ADMINISTRATIVA GLOBAL */}
            <div className="space-y-6 mb-8">
                 <h3 className="text-lg font-bold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    Gestión Administrativa Global (Listas Maestras)
                </h3>
                <p className="text-sm text-slate-500">
                    Edite el contenido de las listas desplegables del sistema. Ingrese un elemento por línea.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {renderListEditor("Modalidades", "modalities", "Presencial\nOnline...")}
                    {renderListEditor("Roles Académicos", "academicRoles", "Docente\nDirector...")}
                    {renderListEditor("Facultades", "faculties", "Facultad de Ingeniería...")}
                    {renderListEditor("Departamentos", "departments", "Informática...")}
                    {renderListEditor("Carreras", "careers", "Ingeniería Civil...")}
                    {renderListEditor("Tipos de Contrato", "contractTypes", "Planta\nContrata...")}
                    {renderListEditor("Semestres", "semesters", "1er Semestre...")}
                    {renderListEditor("Sedes", "campuses", "Valparaíso\nSan Felipe...")}
                </div>
            </div>


             <div className="pt-6 border-t border-slate-200">
                 <h3 className="text-sm font-bold text-slate-700 mb-4">Contacto de Soporte</h3>
                 <div className="flex gap-4 items-center">
                    <input 
                        type="email" 
                        name="contactEmail"
                        value={localConfig.contactEmail}
                        onChange={handleChange}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"
                    />
                 </div>
             </div>

            {/* Actions */}
            <div className="mt-8 flex items-center justify-end gap-4">
                {message && (
                    <span className={`text-sm font-medium px-4 py-2 rounded-lg ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {message.text}
                    </span>
                )}
                <button 
                    onClick={() => setLocalConfig(config)}
                    className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    disabled={isSaving}
                >
                    Restaurar
                </button>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-[#647FBC] text-white font-bold rounded-lg hover:bg-blue-800 shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Guardando...
                        </>
                    ) : (
                        'Guardar Cambios'
                    )}
                </button>
            </div>

        </div>
      </div>
    </div>
  );
};

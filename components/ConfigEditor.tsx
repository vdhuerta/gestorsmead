
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { SystemConfig } from '../types';
import { ArchitectureView } from './ArchitectureView';
import { SchemaNode } from './SchemaNode';
import { JsonViewer } from './JsonViewer';
import { AiAssistant } from './AiAssistant';
import { SCHEMA_TABLES, FULL_JSON_MODEL } from '../constants';

// Color Mapping for ERD Visuals
const TABLE_COLORS = [
  'bg-[#647FBC]', // Azul Acero
  'bg-[#91ADC8]', // Azul Grisáceo
  'bg-[#AED6CF]', // Verde Agua Suave
  'bg-slate-600'  // Neutro
];

type ConfigTab = 'params' | 'erd' | 'architecture';

export const ConfigEditor: React.FC = () => {
  const { config, updateConfig } = useData();
  const [activeTab, setActiveTab] = useState<ConfigTab>('params');
  
  // ERD Sub-state
  const [erdViewMode, setErdViewMode] = useState<'diagram' | 'json'>('diagram');

  // Local state for form editing (Global Params)
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

  const handleListChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const arrayValues = value.split('\n').filter(line => line.trim() !== '');
    // @ts-ignore
    setLocalConfig(prev => ({
      ...prev,
      [name]: arrayValues
    }));
  };

  const handleSave = () => {
    if (localConfig.minPassingGrade > localConfig.gradingScaleMax || localConfig.minPassingGrade < localConfig.gradingScaleMin) {
        setMessage({ text: 'Error: La nota de aprobación debe estar dentro de la escala.', type: 'error' });
        return;
    }

    setIsSaving(true);
    setMessage(null);

    setTimeout(() => {
      updateConfig(localConfig);
      setIsSaving(false);
      setMessage({ text: 'Configuración actualizada y guardada localmente.', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    }, 800);
  };

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
    <div className="animate-fadeIn max-w-7xl mx-auto space-y-6">
      
      {/* TABS HEADER */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 flex flex-col md:flex-row gap-2">
          <button 
            onClick={() => setActiveTab('params')}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'params' ? 'bg-[#647FBC] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Parámetros Globales
          </button>
          <button 
            onClick={() => setActiveTab('erd')}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'erd' ? 'bg-[#647FBC] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
              Modelo Entidad-Relación
          </button>
          <button 
            onClick={() => setActiveTab('architecture')}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'architecture' ? 'bg-[#647FBC] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Arquitectura Técnica
          </button>
      </div>

      {/* --- TAB CONTENT: GLOBAL PARAMS --- */}
      {activeTab === 'params' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-6">
                <h2 className="text-2xl font-bold text-white mb-2">Configuración Global del Sistema</h2>
                <p className="text-slate-300 text-sm">
                    Define las variables por defecto y listas maestras que se utilizarán en todo el sistema.
                </p>
            </div>

            <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-b border-slate-200 pb-8">
                    {/* Sección Académica */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                            Parámetros Académicos
                        </h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Año Académico Vigente</label>
                            <input type="number" name="academicYear" value={localConfig.academicYear} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"/>
                            <p className="text-xs text-slate-500 mt-1">Se usará como filtro por defecto en reportes.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Porcentaje Mínimo de Asistencia (%)</label>
                            <input type="number" name="minAttendancePercentage" min="0" max="100" value={localConfig.minAttendancePercentage} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"/>
                            <p className="text-xs text-slate-500 mt-1">Requisito para aprobar cursos automáticamente.</p>
                        </div>
                    </div>

                    {/* Sección Evaluación */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            Escala de Evaluación
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Nota Mínima</label><input type="number" name="gradingScaleMin" step="0.1" value={localConfig.gradingScaleMin} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100" readOnly/></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Nota Máxima</label><input type="number" name="gradingScaleMax" step="0.1" value={localConfig.gradingScaleMax} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100" readOnly/></div>
                        </div>
                        <p className="text-xs text-slate-400 -mt-4">Escala estándar nacional (Chile).</p>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nota de Aprobación</label>
                            <input type="number" name="minPassingGrade" step="0.1" value={localConfig.minPassingGrade} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"/>
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
                    <p className="text-sm text-slate-500">Edite el contenido de las listas desplegables del sistema. Ingrese un elemento por línea.</p>
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
                        <input type="email" name="contactEmail" value={localConfig.contactEmail} onChange={handleChange} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:border-[#647FBC]"/>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-8 flex items-center justify-end gap-4">
                    {message && <span className={`text-sm font-medium px-4 py-2 rounded-lg ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</span>}
                    <button onClick={() => setLocalConfig(config)} className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors" disabled={isSaving}>Restaurar</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-[#647FBC] text-white font-bold rounded-lg hover:bg-blue-800 shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center gap-2">
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- TAB CONTENT: ER MODEL --- */}
      {activeTab === 'erd' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fadeIn">
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex justify-end gap-2 mb-4">
                        <button onClick={() => setErdViewMode('diagram')} className={`px-3 py-1 rounded text-xs font-bold ${erdViewMode === 'diagram' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Diagrama Visual</button>
                        <button onClick={() => setErdViewMode('json')} className={`px-3 py-1 rounded text-xs font-bold ${erdViewMode === 'json' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Estructura JSON</button>
                    </div>

                    {erdViewMode === 'diagram' && (
                    <div className="space-y-8">
                        <div className="relative p-8 bg-white/50 rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                            {SCHEMA_TABLES.map((table, idx) => (
                                <div key={table.tableName} className="flex justify-center">
                                    <SchemaNode table={table} colorClass={TABLE_COLORS[idx % TABLE_COLORS.length]} />
                                </div>
                            ))}
                            </div>
                        </div>
                    </div>
                    )}

                    {erdViewMode === 'json' && (
                    <div className="h-[600px]">
                        <JsonViewer data={FULL_JSON_MODEL} title="modelo_completo_export.json" />
                    </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    <AiAssistant />
                </div>
            </div>
      )}

      {/* --- TAB CONTENT: ARCHITECTURE --- */}
      {activeTab === 'architecture' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fadeIn">
              <ArchitectureView />
          </div>
      )}

    </div>
  );
};

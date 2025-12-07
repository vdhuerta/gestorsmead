
import React, { useState } from 'react';
import { ARCHITECTURE_DATA, AUTH_SNIPPETS, CONFIG_SNIPPETS, COURSE_SNIPPETS, USER_SNIPPETS, EXPORT_SNIPPETS, TESTING_SNIPPETS, DATABASE_STRATEGY, SUPABASE_SQL_SCRIPT } from '../constants';

// Snippet para mostrar cómo usar el cliente
const CLIENT_USAGE_SNIPPET = `
// ejemplo_uso.ts
import { supabase } from '../services/supabaseClient';

// 1. Obtener Usuarios
const getUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('system_role', 'Asesor');
    
  if (error) console.error('Error:', error);
  return data;
};

// 2. Matricular (Insertar)
const enrollStudent = async (rut, courseId) => {
  const { data, error } = await supabase
    .from('enrollments')
    .insert([
      { user_rut: rut, activity_id: courseId, state: 'Inscrito' }
    ])
    .select();
};
`;

export const ArchitectureView: React.FC = () => {
  const [activeCodeTab, setActiveCodeTab] = useState<'middleware' | 'controller' | 'routes'>('middleware');
  const [activeConfigTab, setActiveConfigTab] = useState<'controller' | 'routes'>('controller');
  const [activeCourseTab, setActiveCourseTab] = useState<'validator' | 'controller' | 'routes'>('controller');
  const [activeUserTab, setActiveUserTab] = useState<'middleware' | 'controller' | 'routes'>('controller');
  const [activeExportTab, setActiveExportTab] = useState<'controller' | 'routes'>('controller');
  
  // Estado para el visor de Pruebas
  const [activeTestTab, setActiveTestTab] = useState<'unit' | 'integration' | 'security'>('unit');
  
  // Estado principal de navegación
  const [mainView, setMainView] = useState<'structure' | 'supabase'>('structure');
  
  // Sub-tab dentro de Supabase
  const [supabaseSubTab, setSupabaseSubTab] = useState<'sql' | 'integration'>('sql');

  return (
    <div className="pb-12 animate-fadeIn">
        
        {/* Navigation Toggle */}
        <div className="flex justify-center mb-8">
            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 inline-flex">
                <button 
                    onClick={() => setMainView('structure')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${mainView === 'structure' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Arquitectura & Backend
                </button>
                <button 
                    onClick={() => setMainView('supabase')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${mainView === 'supabase' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 12.3l-9-9c-.4-.4-1-.4-1.4 0l-9 9c-.4.4-.4 1 0 1.4l9 9c.4.4 1 .4 1.4 0l9-9c.4-.4.4-1 0-1.4zm-9.7 7.3l-7.3-7.3 7.3-7.3 7.3 7.3-7.3 7.3z"/></svg>
                    Implementación DB (Supabase)
                </button>
            </div>
        </div>

      {mainView === 'supabase' ? (
          <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
              
              {/* Supabase Sub-Navigation */}
              <div className="flex border-b border-slate-200 mb-6">
                  <button 
                    onClick={() => setSupabaseSubTab('sql')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${supabaseSubTab === 'sql' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      Paso 1: Esquema SQL
                  </button>
                  <button 
                    onClick={() => setSupabaseSubTab('integration')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${supabaseSubTab === 'integration' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      Paso 2: Conexión Frontend
                  </button>
              </div>

              {supabaseSubTab === 'sql' && (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-emerald-800 mb-2">1. Crear Estructura de Base de Datos</h2>
                        <p className="text-emerald-700 text-sm mb-4">
                            Copia este script y ejecútalo en el <strong>SQL Editor</strong> de tu proyecto en Supabase. Esto creará las tablas <code>users</code>, <code>activities</code> e <code>enrollments</code>.
                        </p>
                        <button 
                            onClick={() => navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            Copiar SQL al Portapapeles
                        </button>
                    </div>

                    <div className="bg-[#1e293b] rounded-xl shadow-2xl overflow-hidden border border-slate-700">
                        <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                            <span className="text-xs font-mono text-emerald-400">migration_v1.sql</span>
                            <span className="text-xs text-slate-500">PostgreSQL 15+</span>
                        </div>
                        <div className="p-0 overflow-hidden relative">
                            <pre className="font-mono text-xs md:text-sm leading-relaxed text-slate-300 p-6 overflow-x-auto custom-scrollbar h-[600px] whitespace-pre">
                                {SUPABASE_SQL_SCRIPT}
                            </pre>
                        </div>
                    </div>
                  </>
              )}

              {supabaseSubTab === 'integration' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                              <h3 className="font-bold text-slate-800 text-lg mb-4">Guía de Instalación</h3>
                              <ol className="space-y-4 list-decimal pl-4 text-sm text-slate-600">
                                  <li className="pl-2">
                                      <strong>Instalar Librería:</strong> Ya hemos agregado <code>@supabase/supabase-js</code> al <code>index.html</code> de este proyecto. No necesitas ejecutar <code>npm install</code>.
                                  </li>
                                  <li className="pl-2">
                                      <strong>Obtener Credenciales:</strong> Ve a tu Dashboard de Supabase &rarr; Project Settings &rarr; API.
                                      <ul className="list-disc pl-4 mt-2 space-y-1 text-slate-500">
                                          <li>Copiar <code>Project URL</code></li>
                                          <li>Copiar <code>anon public key</code></li>
                                      </ul>
                                  </li>
                                  <li className="pl-2">
                                      <strong>Configurar Cliente:</strong> Edita el archivo <code>services/supabaseClient.ts</code> (ya creado) y pega tus credenciales.
                                  </li>
                                  <li className="pl-2">
                                      <strong>Reemplazar Contexto:</strong> Modificar <code>DataContext.tsx</code> para que en lugar de leer <code>localStorage</code>, haga llamadas a <code>supabase.from(...)</code>.
                                  </li>
                              </ol>
                          </div>

                          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl">
                              <h3 className="font-bold text-indigo-900 mb-2">¿Por qué Supabase?</h3>
                              <p className="text-sm text-indigo-700 mb-2">
                                  Supabase te entrega un backend completo (PostgreSQL + API REST + Auth) sin configurar servidores.
                              </p>
                              <ul className="text-xs text-indigo-600 space-y-1">
                                  <li>✓ Base de Datos Relacional Real</li>
                                  <li>✓ API instantánea sobre tus tablas</li>
                                  <li>✓ Autenticación de Usuarios integrada</li>
                              </ul>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                              <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                                  <span className="text-xs font-mono text-blue-400">services/supabaseClient.ts</span>
                                  <span className="text-[10px] text-slate-500 uppercase">Configuración</span>
                              </div>
                              <pre className="font-mono text-xs text-blue-100 p-4 overflow-x-auto">
{`import { createClient } from '@supabase/supabase-js';

const url = 'TU_SUPABASE_URL';
const key = 'TU_SUPABASE_ANON_KEY';

export const supabase = createClient(url, key);`}
                              </pre>
                          </div>

                          <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                              <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                                  <span className="text-xs font-mono text-yellow-400">Ejemplo de Uso</span>
                                  <span className="text-[10px] text-slate-500 uppercase">JavaScript / TypeScript</span>
                              </div>
                              <pre className="font-mono text-xs text-yellow-100 p-4 overflow-x-auto whitespace-pre">
                                  {CLIENT_USAGE_SNIPPET}
                              </pre>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn pb-12">
      {/* ... (Existing Architecture View Content) ... */}
      
      {/* Columna Izquierda: Estructura y Stack */}
      <div className="space-y-8">
        
        {/* Stack Tecnológico */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Stack Tecnológico Recomendado
                </h3>
            </div>
            <div className="p-0">
                <table className="w-full text-sm text-left">
                    <tbody className="divide-y divide-slate-100">
                        {ARCHITECTURE_DATA.stack.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-6 py-4 font-semibold text-slate-700 w-1/3">{item.name}</td>
                                <td className="px-6 py-4 text-slate-600">{item.details}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Estructura de Carpetas */}
        <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden text-slate-300 font-mono text-sm">
            <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                 <h3 className="font-bold text-white text-sm uppercase tracking-wider">Estructura de Carpetas</h3>
                 <span className="text-xs text-slate-500">Tree View</span>
            </div>
            <div className="p-6 overflow-x-auto custom-scrollbar">
                <pre className="leading-relaxed whitespace-pre">{ARCHITECTURE_DATA.folderStructure}</pre>
            </div>
        </div>
        
         {/* Módulo Configuración */}
         <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Lógica de Negocio: Configuración (CRUD)
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveConfigTab('controller')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeConfigTab === 'controller' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    config.controller.ts
                </button>
                <button 
                    onClick={() => setActiveConfigTab('routes')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeConfigTab === 'routes' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    config.routes.ts
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[300px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-amber-100 leading-relaxed">
                        {CONFIG_SNIPPETS[activeConfigTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Permite parametrizar variables globales sin redesplegar.
            </div>
          </div>
          
          {/* Módulo Participantes (CSV) */}
          <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Gestión Participantes & CSV (Backend)
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveUserTab('middleware')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeUserTab === 'middleware' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    upload.ts
                </button>
                <button 
                    onClick={() => setActiveUserTab('controller')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeUserTab === 'controller' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    user.controller.ts
                </button>
                <button 
                    onClick={() => setActiveUserTab('routes')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeUserTab === 'routes' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    user.routes.ts
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[300px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-cyan-100 leading-relaxed">
                        {USER_SNIPPETS[activeUserTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Manejo de Streams para CSV y validación de RUT.
            </div>
          </div>

      </div>

      {/* Columna Derecha: API Endpoints y Módulo Auth */}
      <div className="space-y-8">
          
          {/* Endpoints */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Definición de API REST
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Endpoints principales para gestión y carga de datos.</p>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar max-h-[300px]">
                  {ARCHITECTURE_DATA.endpoints.map((ep, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors group">
                          <div className="flex items-center gap-3 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                  ep.method === 'GET' ? 'bg-blue-100 text-blue-700' : 
                                  ep.method === 'POST' ? 'bg-emerald-100 text-emerald-700' : 
                                  ep.method === 'PUT' ? 'bg-amber-100 text-amber-700' :
                                  'bg-slate-100 text-slate-700'
                              }`}>
                                  {ep.method}
                              </span>
                              <code className="text-slate-700 font-bold bg-slate-50 px-2 py-0.5 rounded text-sm">{ep.path}</code>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">{ep.description}</p>
                          <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Acceso:</span>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                                  {ep.role}
                              </span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* ESTRATEGIA DE BASE DE DATOS (NUEVO PANEL) */}
          <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col animate-fadeIn">
                <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                        Estrategia de Base de Datos & Indexación
                    </h3>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Índices Críticos (Performance)</h4>
                        <ul className="space-y-2">
                            {DATABASE_STRATEGY.indexes.map((idx, i) => (
                                <li key={i} className="text-xs bg-slate-800/50 p-2 rounded border border-slate-700">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-indigo-400 font-mono font-bold">{idx.table}</span>
                                        <span className="text-slate-500">→</span>
                                        <span className="text-white font-mono bg-slate-700 px-1 rounded">{idx.fields.join(', ')}</span>
                                    </div>
                                    <p className="text-slate-400 pl-1 border-l-2 border-indigo-500/30">{idx.reason}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Integridad Referencial</h4>
                        <ul className="list-disc list-inside text-xs text-slate-300 space-y-1 font-mono">
                            {DATABASE_STRATEGY.integrity.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-indigo-900/20 border border-indigo-500/30 p-2 rounded">
                        <p className="text-[10px] text-indigo-200">
                            <strong>Nota Arquitectónica:</strong> {DATABASE_STRATEGY.partitioning}
                        </p>
                    </div>
                </div>
          </div>

           {/* Módulo Pruebas y QA */}
           <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Estrategia de QA y Pruebas Automatizadas
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveTestTab('unit')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeTestTab === 'unit' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Pruebas Unitarias
                </button>
                <button 
                    onClick={() => setActiveTestTab('integration')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeTestTab === 'integration' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Integración (CSV)
                </button>
                <button 
                    onClick={() => setActiveTestTab('security')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeTestTab === 'security' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Seguridad (RBAC)
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[300px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-orange-100 leading-relaxed">
                        {TESTING_SNIPPETS[activeTestTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Implementación recomendada usando Jest + Supertest
            </div>
          </div>

          {/* Módulo Auth */}
          <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Módulo de Seguridad (Backend)
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveCodeTab('middleware')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCodeTab === 'middleware' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    auth.middleware.ts
                </button>
                <button 
                    onClick={() => setActiveCodeTab('controller')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCodeTab === 'controller' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    auth.controller.ts
                </button>
                <button 
                    onClick={() => setActiveCodeTab('routes')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCodeTab === 'routes' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    auth.routes.ts
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[300px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-blue-100 leading-relaxed">
                        {AUTH_SNIPPETS[activeCodeTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Estrategia JWT escalable a OAuth.
            </div>
          </div>
          
          {/* Módulo Exportación */}
           <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Reportes & Exportación (Backend)
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveExportTab('controller')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeExportTab === 'controller' ? 'text-green-400 border-b-2 border-green-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    report.controller.ts
                </button>
                <button 
                    onClick={() => setActiveExportTab('routes')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeExportTab === 'routes' ? 'text-green-400 border-b-2 border-green-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    report.routes.ts
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[250px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-green-100 leading-relaxed">
                        {EXPORT_SNIPPETS[activeExportTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Generación de CSV mediante Streams para Dashboard Externo.
            </div>
          </div>

          {/* Módulo Cursos */}
          <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Gestión de Cursos (Backend)
                </h3>
            </div>
            
            <div className="flex border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setActiveCourseTab('validator')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCourseTab === 'validator' ? 'text-pink-400 border-b-2 border-pink-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    validator.ts
                </button>
                <button 
                    onClick={() => setActiveCourseTab('controller')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCourseTab === 'controller' ? 'text-pink-400 border-b-2 border-pink-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    controller.ts
                </button>
                <button 
                    onClick={() => setActiveCourseTab('routes')}
                    className={`px-4 py-2 text-xs font-mono transition-colors ${activeCourseTab === 'routes' ? 'text-pink-400 border-b-2 border-pink-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    routes.ts
                </button>
            </div>

            <div className="p-0 overflow-hidden relative h-[300px]">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                    <pre className="font-mono text-xs text-pink-100 leading-relaxed">
                        {COURSE_SNIPPETS[activeCourseTab]}
                    </pre>
                </div>
            </div>
            <div className="px-4 py-2 bg-slate-800/80 text-[10px] text-slate-400 border-t border-slate-700 text-center">
                Validación Zod y endpoints CRUD.
            </div>
          </div>

      </div>
      )}

    </div>
  );
};

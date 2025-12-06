import React, { useState } from 'react';
import { askAiAboutModel } from '../services/geminiService';

export const AiAssistant: React.FC = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResponse(null);
    const result = await askAiAboutModel(query);
    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="bg-white border border-indigo-100 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-indigo-100 p-2 rounded-lg">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Asistente del Modelo</h3>
          <p className="text-xs text-slate-500">Potenciado por Gemini 2.5 Flash</p>
        </div>
      </div>

      <form onSubmit={handleAsk} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pregunta sobre relaciones, claves o SQL..."
          className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
        />
        <button
          type="submit"
          disabled={loading || !query}
          className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      </form>

      {response && (
        <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 animate-fadeIn">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{response}</p>
        </div>
      )}

      {!response && !loading && (
        <div className="mt-4 flex gap-2 flex-wrap">
            <button onClick={() => setQuery("¿Cuál es la clave primaria de Usuarios?")} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors">PK de Usuarios</button>
            <button onClick={() => setQuery("Generar SQL para la tabla Inscripciones")} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors">SQL para Inscripciones</button>
            <button onClick={() => setQuery("Explicar la relación entre Usuario y Actividad")} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors">Relación lógica</button>
        </div>
      )}
    </div>
  );
};
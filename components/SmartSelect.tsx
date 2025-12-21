import React, { useMemo } from 'react';

// --- Utility: Text Normalization (Removes accents, lowercase, trim) ---
const normalizeString = (str: string): string => {
    if (!str) return '';
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
};

// --- Advanced Similarity Helper: Token-based keyword matching (Replicando DatabaseCleaner) ---
const getSmartSuggestions = (val: string, masterList: string[]) => {
    if (!val || val.length < 2) return [];
    
    const inputNorm = normalizeString(val);
    const inputTokens = inputNorm.split(/\s+/).filter(t => t.length > 2); // Solo palabras significativas
    
    if (inputTokens.length === 0 && inputNorm.length < 3) return [];

    // Mapear opciones con puntaje de relevancia
    const scoredOptions = masterList.map(option => {
        const optionNorm = normalizeString(option);
        let score = 0;

        // Regla 1: Coincidencia exacta normalizada (+100 puntos)
        if (optionNorm === inputNorm) score += 100;

        // Regla 2: Coincidencia por tokens (palabras clave) (+10 puntos por palabra)
        inputTokens.forEach(token => {
            if (optionNorm.includes(token)) {
                score += 10;
                // Regla 3: El token es el inicio de la opción (+5 puntos extra)
                if (optionNorm.startsWith(token)) score += 5;
            }
        });

        return { option, score };
    });

    // Filtrar opciones con puntaje y ordenar por relevancia
    return scoredOptions
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4) // Mostrar máximo 4 sugerencias
        .map(item => item.option);
};

interface SmartSelectProps {
  label: string;
  name: string;
  value: string;
  options: string[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  required?: boolean;
}

export const SmartSelect: React.FC<SmartSelectProps> = ({ 
  label, name, value, options, onChange, className, required 
}) => {
  // Validación de Pertenencia
  const isInvalid = useMemo(() => {
    if (!value || value === "") return false;
    return !options.includes(value);
  }, [value, options]);

  // Cálculo de Sugerencias usando la lógica de DatabaseCleaner
  const suggestions = useMemo(() => {
    if (isInvalid) return getSmartSuggestions(value, options);
    return [];
  }, [isInvalid, value, options]);

  const handleSuggestionClick = (suggestedValue: string) => {
    const syntheticEvent = {
      target: { name, value: suggestedValue },
      currentTarget: { name, value: suggestedValue }
    } as unknown as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-tight">{label}</label>
      <div className="relative">
        <select 
          name={name}
          value={value}
          onChange={onChange}
          className={`w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 transition-all appearance-none pr-10 ${
             isInvalid 
             ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-200' 
             : 'border-slate-300 bg-white text-slate-700 focus:ring-indigo-500'
          }`}
          required={required}
        >
          <option value="">Seleccione...</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          {isInvalid && (
            <option value={value} disabled className="bg-red-100 text-red-800 font-bold">
              ⚠ {value} (Dato Erróneo)
            </option>
          )}
        </select>
        
        <div className="absolute right-3 top-2.5 pointer-events-none flex items-center gap-1">
            {isInvalid && (
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
            )}
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </div>
      </div>

      {isInvalid && (
        <div className="mt-1.5 space-y-1.5 animate-fadeIn">
            <span className="text-[10px] text-red-600 font-bold leading-tight flex items-start gap-1">
               <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
               Inconsistencia: El valor "{value}" no está en la lista estándar.
            </span>
            
            {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[9px] text-slate-400 uppercase font-black mr-1">Sugerencias Inteligentes:</span>
                    {suggestions.map(s => (
                        <button 
                          key={s}
                          type="button"
                          onClick={() => handleSuggestionClick(s)}
                          className="text-[10px] bg-white hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200 px-2 py-1 rounded shadow-sm transition-all transform active:scale-95"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
            {suggestions.length === 0 && value.length > 2 && (
                <span className="text-[9px] text-slate-400 italic">No se encontraron coincidencias cercanas en la Lista Maestra.</span>
            )}
        </div>
      )}
    </div>
  );
};
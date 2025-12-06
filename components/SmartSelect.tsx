
import React from 'react';

// --- Levenshtein Distance Helper ---
const levenshtein = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const getClosestMatch = (value: string, options: string[]) => {
  let minDistance = Infinity;
  let closest = options[0];

  options.forEach(opt => {
    const dist = levenshtein(value.toLowerCase(), opt.toLowerCase());
    if (dist < minDistance) {
      minDistance = dist;
      closest = opt;
    }
  });

  // Solo sugerir si la distancia es razonable (ej. menor a 50% del largo o < 5 chars)
  if (minDistance > value.length * 0.6 && minDistance > 4) return null;
  return closest;
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
  const isInvalid = value && value !== "" && !options.includes(value);
  const suggestion = isInvalid ? getClosestMatch(value, options) : null;

  const handleSuggestionClick = () => {
    if (suggestion) {
      // Create a synthetic event to pass to the parent handler
      const syntheticEvent = {
        target: { name, value: suggestion },
        currentTarget: { name, value: suggestion }
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <select 
          name={name}
          value={value}
          onChange={onChange}
          className={`w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${
             isInvalid 
             ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-200' 
             : 'border-slate-300 bg-white'
          }`}
          required={required}
        >
          <option value="">Seleccione...</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          {/* Si el valor es inválido, lo agregamos como una opción visual extra para no perderlo */}
          {isInvalid && (
            <option value={value} disabled className="bg-red-100 text-red-800 font-bold">
              ⚠ {value} (Dato Original)
            </option>
          )}
        </select>
        
        {isInvalid && (
           <div className="absolute right-8 top-2 text-red-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </div>
        )}
      </div>

      {isInvalid && (
        <div className="mt-1.5 flex flex-col gap-1 animate-fadeIn">
            <span className="text-[10px] text-red-600 font-medium">
               Inconsistencia: El valor "{value}" no está en la lista estándar.
            </span>
            {suggestion && (
                <button 
                  type="button"
                  onClick={handleSuggestionClick}
                  className="text-left text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 flex items-center gap-1 transition-colors w-fit"
                >
                    <span className="font-bold">¿Quiso decir:</span> 
                    <span className="underline">{suggestion}</span>?
                </button>
            )}
        </div>
      )}
    </div>
  );
};

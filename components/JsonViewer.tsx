import React from 'react';

interface JsonViewerProps {
  data: any;
  title: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title }) => {
  const jsonString = JSON.stringify(data, null, 2);

  // Simple syntax highlighting regex
  const highlightedJson = jsonString.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-purple-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-blue-400 font-semibold'; // key
        } else {
          cls = 'text-green-400'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-orange-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-gray-400'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2 px-1">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">{title}</h3>
        <button 
          onClick={() => navigator.clipboard.writeText(jsonString)}
          className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded transition-colors"
        >
          Copiar JSON
        </button>
      </div>
      <div className="bg-[#1e293b] rounded-lg shadow-inner overflow-hidden flex-1 relative group">
        <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
            <pre className="font-mono text-xs md:text-sm leading-relaxed whitespace-pre"
                dangerouslySetInnerHTML={{ __html: highlightedJson }} 
            />
        </div>
      </div>
    </div>
  );
};
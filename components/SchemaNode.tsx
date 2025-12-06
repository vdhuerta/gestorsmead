import React from 'react';
import { SchemaTable } from '../types';

interface SchemaNodeProps {
  table: SchemaTable;
  colorClass: string;
}

export const SchemaNode: React.FC<SchemaNodeProps> = ({ table, colorClass }) => {
  return (
    <div className={`rounded-lg shadow-lg overflow-hidden border border-slate-200 bg-white min-w-[300px] hover:shadow-xl transition-shadow duration-300`}>
      <div className={`${colorClass} p-3 border-b border-slate-100`}>
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          {table.tableName}
        </h3>
        <p className="text-xs text-white/80 mt-1 font-light">{table.description}</p>
      </div>
      <div className="p-0">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-4 py-2 w-8">Clave</th>
              <th className="px-4 py-2">Campo</th>
              <th className="px-4 py-2 text-right">Tipo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.fields.map((field, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="px-4 py-2 text-xs font-mono">
                  {field.isPk && <span className="text-yellow-600 font-bold" title="Clave Primaria">PK</span>}
                  {field.isFk && <span className="text-blue-500 font-bold ml-1" title={`Clave Foránea -> ${field.fkTarget}`}>FK</span>}
                </td>
                <td className="px-4 py-2 font-medium text-slate-700">
                  {field.name}
                </td>
                <td className="px-4 py-2 text-right text-slate-400 text-xs font-mono">
                  {field.type}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
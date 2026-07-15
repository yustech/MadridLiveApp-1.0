import { Code, Copy, Server, Shield, Terminal } from 'lucide-react';
import { buildNodeBridgePreview, buildNodeBridgeSnippet, MYSQL_SCHEMA_DDL } from './exampleSnippets';
import { ConnectionTestResult, MariaDbConfig, SecuritySubTab } from './types';

interface SecurityTabProps {
  securitySubTab: SecuritySubTab;
  copiedText: boolean;
  mariadbConfig: MariaDbConfig;
  isTestingConnection: boolean;
  connectionTestResult: ConnectionTestResult | null;
  onConfigChange: (config: MariaDbConfig) => void;
  onTestConnection: () => void;
  onCopiedTextChange: (copied: boolean) => void;
  showStatus: (text: string, isError?: boolean) => void;
}

function copyToClipboard(
  value: string,
  statusMessage: string,
  onCopiedTextChange: (copied: boolean) => void,
  showStatus: (text: string, isError?: boolean) => void
) {
  navigator.clipboard.writeText(value);
  onCopiedTextChange(true);
  setTimeout(() => onCopiedTextChange(false), 2000);
  showStatus(statusMessage);
}

export function SecurityTab({
  securitySubTab,
  copiedText,
  mariadbConfig,
  isTestingConnection,
  connectionTestResult,
  onConfigChange,
  onTestConnection,
  onCopiedTextChange,
  showStatus,
}: SecurityTabProps) {
  if (securitySubTab === 'schema') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="font-mono text-xs">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Esquema SQL Físico para MySQL / MariaDB
            </p>
            <p className="text-[10px] text-white/50 mt-1 leading-relaxed">
              Referencia del esquema real de la app: 4 tablas de negocio (staff, events, shifts, alerts) y schema_migrations como metadata técnica del runner versionado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(
              MYSQL_SCHEMA_DDL,
              'Esquema DDL de MySQL / MariaDB copiado al portapapeles.',
              onCopiedTextChange,
              showStatus
            )}
            className="w-full sm:w-auto shrink-0 bg-indigo-500 hover:bg-indigo-400 text-white font-mono text-[10px] font-bold px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedText ? '¡COPIADO!' : 'COPIAR SQL DDL'}</span>
          </button>
        </div>

        <div className="bg-[#030008] border border-white/10 rounded-2xl p-4 font-mono text-[10px] text-indigo-300 leading-normal overflow-x-auto max-h-[320px]">
          <pre>{MYSQL_SCHEMA_DDL}</pre>
        </div>
      </div>
    );
  }

  if (securitySubTab === 'bridge') {
    const bridgeSnippet = buildNodeBridgeSnippet(mariadbConfig);
    const bridgePreview = buildNodeBridgePreview(mariadbConfig);

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="font-mono text-xs">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Code className="w-4 h-4 text-emerald-400" />
              Script API Bridge de Producción Node.js
            </p>
            <p className="text-[10px] text-white/50 mt-1 leading-relaxed">
              Este código Express se conecta directamente a tu servidor MySQL / MariaDB remoto en <span className="text-emerald-300 font-bold">{mariadbConfig.host}</span> usando los parámetros que has personalizado en la pestaña de Políticas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(
              bridgeSnippet,
              'Código del Servidor Node.js copiado al portapapeles.',
              onCopiedTextChange,
              showStatus
            )}
            className="w-full sm:w-auto shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedText ? '¡COPIADO!' : 'COPIAR SCRIPT NODE.JS'}</span>
          </button>
        </div>

        <div className="bg-[#030008] border border-white/10 rounded-2xl p-4 font-mono text-[10px] text-emerald-300 leading-normal overflow-x-auto max-h-[320px]">
          <pre>{bridgePreview}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs font-mono">
      <div className="space-y-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 bg-indigo-500/10 text-indigo-300 border-l border-b border-white/10 rounded-bl-xl text-[9px] font-bold">
            MYSQL CONFIG
          </div>

          <h4 className="text-sm font-display font-bold text-white mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            Ajustes del Servidor de Producción
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-white/40 block mb-1">Host de Base de Datos (MySQL / MariaDB)</label>
              <input
                type="text"
                value={mariadbConfig.host}
                onChange={(e) => onConfigChange({ ...mariadbConfig, host: e.target.value })}
                className="w-full bg-[#120e2a]/80 border border-white/10 focus:border-indigo-400/40 rounded-xl px-3 py-2 text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Puerto</label>
                <input
                  type="text"
                  value={mariadbConfig.port}
                  onChange={(e) => onConfigChange({ ...mariadbConfig, port: e.target.value })}
                  className="w-full bg-[#120e2a]/80 border border-white/10 focus:border-indigo-400/40 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Usuario SQL</label>
                <input
                  type="text"
                  value={mariadbConfig.user}
                  onChange={(e) => onConfigChange({ ...mariadbConfig, user: e.target.value })}
                  className="w-full bg-[#120e2a]/80 border border-white/10 focus:border-indigo-400/40 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Nombre de Base de Datos</label>
                <input
                  type="text"
                  value={mariadbConfig.name}
                  onChange={(e) => onConfigChange({ ...mariadbConfig, name: e.target.value })}
                  className="w-full bg-[#120e2a]/80 border border-white/10 focus:border-indigo-400/40 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Clave de Conexión</label>
                <input
                  type="password"
                  value={mariadbConfig.password}
                  onChange={(e) => onConfigChange({ ...mariadbConfig, password: e.target.value })}
                  className="w-full bg-[#120e2a]/80 border border-white/10 focus:border-indigo-400/40 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-300 leading-normal">
                Cambiar estos campos actualizará dinámicamente el código del bridge en la tercera pestaña.
              </span>
            </div>

            <button
              type="button"
              disabled={isTestingConnection}
              onClick={onTestConnection}
              className={`w-full py-2.5 font-mono text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${
                isTestingConnection
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 cursor-wait animate-pulse'
                  : 'bg-indigo-500 hover:bg-indigo-400 text-white'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>{isTestingConnection ? 'PROBANDO CONEXIÓN...' : 'TESTEAR CONEXIÓN EN TIEMPO REAL'}</span>
            </button>

            {connectionTestResult && (
              <div className={`mt-2 border rounded-xl p-3.5 font-mono text-[10px] leading-relaxed transition-all ${
                connectionTestResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-1.5 font-bold text-[11px] mb-2 uppercase">
                  <span className={`w-2 h-2 rounded-full ${connectionTestResult.success ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span>{connectionTestResult.success ? 'CONEXIÓN EXITOSA' : 'ERROR DE CONEXIÓN'}</span>
                </div>

                <p className="mb-2 font-sans font-medium text-white/95">{connectionTestResult.message}</p>

                {connectionTestResult.advice && (
                  <p className="mb-3 text-white/60 text-[9px] bg-black/30 px-2 py-1.5 rounded-lg border border-white/5 leading-normal">
                    <strong className="text-white">Consejo técnico:</strong> {connectionTestResult.advice}
                  </p>
                )}

                {connectionTestResult.logs && connectionTestResult.logs.length > 0 && (
                  <div className="bg-black/40 rounded-lg p-2 max-h-[140px] overflow-y-auto space-y-1 text-white/40 font-mono text-[9px]">
                    {connectionTestResult.logs.map((log, idx) => (
                      <div key={idx} className="whitespace-pre-wrap breakdown-words">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h4 className="text-sm font-display font-bold text-white mb-3.5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Políticas de Seguridad Activas
          </h4>
          <ul className="space-y-2 text-[11px] text-white/70">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>Autenticación real: <strong className="text-white">sesión única de admin</strong> con login y cookie firmada.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>Operaciones administrativas API: <strong className="text-white">sesión admin o x-admin-token</strong>.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>Prevención Bruta: <strong className="text-white">bloqueo temporal de IP</strong> tras 5 intentos erróneos.</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 h-full">
          <h4 className="text-sm font-display font-bold text-white mb-3.5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Modelo de acceso actual
          </h4>
          <p className="text-[11px] leading-relaxed text-white/65">
            La app utiliza una única sesión de administrador para el panel de control y el token administrativo para acciones API. El multi-usuario real no existe en producción todavía y queda reservado para una tarea futura de diseño-primero.
          </p>
        </div>
      </div>
    </div>
  );
}

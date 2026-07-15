import { CollectionTab, SecuritySubTab } from './types';

export const collectionTabs = ['staff', 'events', 'shifts', 'alerts', 'security'] as const;
export const securitySubTabs: SecuritySubTab[] = ['credentials', 'schema', 'bridge'];

export const tabLabelMap: Record<CollectionTab, string> = {
  staff: 'Colaboradores',
  events: 'Eventos',
  shifts: 'Turnos',
  alerts: 'Alertas',
  security: 'Seguridad & MySQL',
};

export const sectorTranslationMap: Record<string, string> = {
  'Auxiliar': 'Auxiliar',
  'Auxiliar Plus': 'Auxiliar Plus',
  'Coordinación': 'Coordinación',
};

/**
 * Backend bridge - re-exports migration engine.
 * In dev: resolves to project root dist/ via TypeScript compilation.
 * In production: gui/dist/backend/ contains the compiled backend (copied by prepare-backend.js).
 */
export { migrate } from '../../../dist/index';
export type { MigrationConfig, MigrationResult, ProgressUpdate } from '../../../dist/types';

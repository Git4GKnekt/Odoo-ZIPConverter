/**
 * BETA Timeline - ZIP Extraction and Packing
 *
 * Handles the simple disk-based extraction approach:
 * 1. Extract entire ZIP to temp directory
 * 2. Validate required files exist
 * 3. Repack modified contents to new ZIP
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import {
  BackupContents,
  ExtractionContext,
  Logger,
  OdooManifest
} from './types';

/** Required files in an Odoo backup ZIP */
const REQUIRED_FILES = ['dump.sql', 'manifest.json'];
const REQUIRED_DIRS = ['filestore'];

/**
 * Create a unique temporary directory for extraction
 */
export function createTempDirectory(basePath?: string): string {
  const base = basePath || os.tmpdir();
  const uniqueId = uuidv4().slice(0, 8);
  const timestamp = Date.now();
  const dirName = `odoo-migration-${timestamp}-${uniqueId}`;
  const tempDir = path.join(base, dirName);

  fs.mkdirSync(tempDir, { recursive: true });

  return tempDir;
}

/**
 * Validate that a ZIP file contains required Odoo backup structure
 */
export function validateBackupZip(zipPath: string, logger: Logger): string[] {
  const errors: string[] = [];

  if (!fs.existsSync(zipPath)) {
    errors.push(`Input file does not exist: ${zipPath}`);
    return errors;
  }

  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const entryNames = entries.map(e => e.entryName);

    logger.debug('ZIP entries found', { count: entries.length });

    // Check required files
    for (const required of REQUIRED_FILES) {
      const found = entryNames.some(name =>
        name === required || name.endsWith(`/${required}`)
      );
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      }
    }

    // Check required directories
    for (const required of REQUIRED_DIRS) {
      const found = entryNames.some(name =>
        name.startsWith(`${required}/`) || name.includes(`/${required}/`)
      );
      if (!found) {
        logger.warn(`Directory not found (may be empty): ${required}`);
      }
    }

  } catch (err) {
    errors.push(`Failed to read ZIP file: ${(err as Error).message}`);
  }

  return errors;
}

/**
 * Extract Odoo backup ZIP to temporary directory
 */
export async function extractBackup(
  zipPath: string,
  tempDir: string,
  logger: Logger
): Promise<ExtractionContext> {
  logger.info('Starting extraction', { zipPath, tempDir });

  const context: ExtractionContext = {
    tempDir,
    contents: null as unknown as BackupContents,
    complete: false
  };

  try {
    // Validate ZIP structure first
    const validationErrors = validateBackupZip(zipPath, logger);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid backup ZIP: ${validationErrors.join(', ')}`);
    }

    // Extract ZIP
    const zip = new AdmZip(zipPath);
    logger.info('Extracting ZIP contents...');
    zip.extractAllTo(tempDir, true);

    // Locate extracted files (handle nested structure)
    const contents = await locateBackupContents(tempDir, logger);
    context.contents = contents;
    context.complete = true;

    logger.info('Extraction complete', {
      dumpPath: contents.dumpPath,
      filestorePath: contents.filestorePath,
      version: contents.manifest.version
    });

  } catch (err) {
    logger.error('Extraction failed', { error: (err as Error).message });
    throw err;
  }

  return context;
}

/**
 * Locate backup contents in extracted directory
 * Handles both flat and nested ZIP structures
 */
async function locateBackupContents(
  tempDir: string,
  logger: Logger
): Promise<BackupContents> {
  // Try flat structure first
  let dumpPath = path.join(tempDir, 'dump.sql');
  let manifestPath = path.join(tempDir, 'manifest.json');
  let filestorePath = path.join(tempDir, 'filestore');

  // If not found, look for nested structure
  if (!fs.existsSync(dumpPath)) {
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      const entryPath = path.join(tempDir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        const nestedDump = path.join(entryPath, 'dump.sql');
        if (fs.existsSync(nestedDump)) {
          dumpPath = nestedDump;
          manifestPath = path.join(entryPath, 'manifest.json');
          filestorePath = path.join(entryPath, 'filestore');
          logger.debug('Found nested structure', { root: entryPath });
          break;
        }
      }
    }
  }

  // Validate required files exist
  if (!fs.existsSync(dumpPath)) {
    throw new Error('dump.sql not found in extracted contents');
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found in extracted contents');
  }

  // Parse manifest
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const manifest: OdooManifest = JSON.parse(manifestContent);

  // Validate manifest has required fields
  if (!manifest.version) {
    throw new Error('manifest.json missing version field');
  }

  return {
    dumpPath,
    manifestPath,
    filestorePath,
    manifest
  };
}

/**
 * Update manifest.json with new version information
 */
export function updateManifest(
  manifestPath: string,
  updates: Partial<OdooManifest>,
  logger: Logger
): OdooManifest {
  logger.info('Updating manifest', { updates });

  const content = fs.readFileSync(manifestPath, 'utf-8');
  const manifest: OdooManifest = JSON.parse(content);

  const updatedManifest: OdooManifest = {
    ...manifest,
    ...updates,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));

  return updatedManifest;
}

/**
 * Create output ZIP from migrated contents
 */
export async function packBackup(
  contents: BackupContents,
  outputPath: string,
  logger: Logger
): Promise<void> {
  logger.info('Creating output ZIP', { outputPath });

  const zip = new AdmZip();

  // Add dump.sql
  logger.debug('Adding dump.sql');
  zip.addLocalFile(contents.dumpPath, '', 'dump.sql');

  // Add manifest.json
  logger.debug('Adding manifest.json');
  zip.addLocalFile(contents.manifestPath, '', 'manifest.json');

  // Add filestore directory if it exists
  if (fs.existsSync(contents.filestorePath)) {
    logger.debug('Adding filestore directory');
    zip.addLocalFolder(contents.filestorePath, 'filestore');
  } else {
    logger.warn('Filestore directory not found, creating empty');
    // Create empty filestore entry
    zip.addFile('filestore/', Buffer.alloc(0));
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write ZIP file
  zip.writeZip(outputPath);

  const stats = fs.statSync(outputPath);
  logger.info('Output ZIP created', {
    path: outputPath,
    size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`
  });
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDirectory(tempDir: string, logger: Logger): void {
  logger.info('Cleaning up temp directory', { tempDir });

  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      logger.debug('Temp directory removed');
    }
  } catch (err) {
    logger.warn('Failed to clean up temp directory', {
      error: (err as Error).message
    });
  }
}

/**
 * Get file size in human-readable format
 */
export function getFileSize(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '0 B';
  }
  const stats = fs.statSync(filePath);
  const bytes = stats.size;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

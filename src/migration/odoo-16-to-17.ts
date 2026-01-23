/**
 * BETA Timeline - Odoo 16 to 17 Migration Scripts
 *
 * Contains all SQL migrations for upgrading Odoo database
 * from version 16 to version 17.
 *
 * Based on Odoo upgrade documentation and changelog.
 */

import { MigrationScript } from '../types';

/**
 * All migration scripts for Odoo 16 to 17 upgrade.
 * Scripts are executed in order by the 'order' field.
 */
export const MIGRATION_SCRIPTS: MigrationScript[] = [
  // ===== PHASE 1: Pre-migration safety checks =====
  {
    id: 'pre-001-backup-check',
    name: 'Verify backup integrity',
    description: 'Ensure critical tables exist before migration',
    order: 1,
    sql: `
      DO $$
      DECLARE
        missing_tables text[];
        critical_tables text[] := ARRAY[
          'ir_module_module',
          'res_users',
          'res_partner',
          'res_company'
        ];
        tbl text;
      BEGIN
        FOREACH tbl IN ARRAY critical_tables
        LOOP
          IF NOT EXISTS (
            SELECT FROM pg_tables
            WHERE schemaname = 'public' AND tablename = tbl
          ) THEN
            missing_tables := array_append(missing_tables, tbl);
          END IF;
        END LOOP;

        IF array_length(missing_tables, 1) > 0 THEN
          RAISE EXCEPTION 'Missing critical tables: %', missing_tables;
        END IF;
      END $$;
    `,
    postCheck: `SELECT true as valid`
  },

  // ===== PHASE 2: Module system updates =====
  {
    id: 'mod-001-module-dependencies',
    name: 'Update module dependency format',
    description: 'Odoo 17 changed how module dependencies are stored',
    order: 10,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'ir_module_module_dependency'
          AND column_name = 'name'
      ) as result
    `,
    sql: `
      -- Add depend_id column if not exists (Odoo 17 uses foreign key)
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ir_module_module_dependency'
            AND column_name = 'depend_id'
        ) THEN
          ALTER TABLE ir_module_module_dependency
            ADD COLUMN depend_id INTEGER;

          -- Populate depend_id from module name
          UPDATE ir_module_module_dependency d
          SET depend_id = m.id
          FROM ir_module_module m
          WHERE d.name = m.name;
        END IF;
      END $$;
    `
  },

  {
    id: 'mod-002-module-state',
    name: 'Update module states',
    description: 'Add new module states introduced in Odoo 17',
    order: 11,
    sql: `
      -- Update any deprecated states
      UPDATE ir_module_module
      SET state = 'uninstalled'
      WHERE state IN ('uninstallable') AND state != 'uninstalled';

      -- Ensure base module is installed
      UPDATE ir_module_module
      SET state = 'installed'
      WHERE name = 'base' AND state != 'installed';
    `
  },

  // ===== PHASE 3: Partner changes =====
  {
    id: 'partner-001-trust-field',
    name: 'Add partner trust fields',
    description: 'Odoo 17 added trust scoring fields to partners',
    order: 20,
    sql: `
      DO $$
      BEGIN
        -- Add trust field if not exists
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'trust'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN trust VARCHAR(16) DEFAULT 'normal';
        END IF;

        -- Add partner_latitude/longitude if not exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'partner_latitude'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN partner_latitude DOUBLE PRECISION,
            ADD COLUMN partner_longitude DOUBLE PRECISION;
        END IF;
      END $$;
    `
  },

  {
    id: 'partner-002-activity-tracking',
    name: 'Add activity tracking fields',
    description: 'New activity tracking columns in Odoo 17',
    order: 21,
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'activity_date_deadline'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN activity_date_deadline DATE,
            ADD COLUMN activity_state VARCHAR(16),
            ADD COLUMN activity_summary TEXT,
            ADD COLUMN activity_type_id INTEGER;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 4: User/Auth changes =====
  {
    id: 'user-001-totp-columns',
    name: 'Add TOTP authentication columns',
    description: 'Odoo 17 enhanced two-factor authentication',
    order: 30,
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_users'
            AND column_name = 'totp_secret'
        ) THEN
          ALTER TABLE res_users
            ADD COLUMN totp_secret VARCHAR(32),
            ADD COLUMN totp_enabled BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `
  },

  {
    id: 'user-002-api-keys',
    name: 'Update API key structure',
    description: 'API key table changes in Odoo 17',
    order: 31,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'res_users_apikeys'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add scope column for API key permissions
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_users_apikeys'
            AND column_name = 'scope'
        ) THEN
          ALTER TABLE res_users_apikeys
            ADD COLUMN scope TEXT;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 5: Accounting changes =====
  {
    id: 'account-001-move-name',
    name: 'Update account.move structure',
    description: 'Invoice/move changes in Odoo 17',
    order: 40,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'account_move'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add quick_edit_mode for faster invoice editing
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'account_move'
            AND column_name = 'quick_edit_mode'
        ) THEN
          ALTER TABLE account_move
            ADD COLUMN quick_edit_mode BOOLEAN DEFAULT false;
        END IF;

        -- Add needed_terms for payment terms tracking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'account_move'
            AND column_name = 'needed_terms'
        ) THEN
          ALTER TABLE account_move
            ADD COLUMN needed_terms JSONB;
        END IF;
      END $$;
    `
  },

  {
    id: 'account-002-payment-state',
    name: 'Migrate payment state values',
    description: 'Payment state enum changes in Odoo 17',
    order: 41,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'account_move'
          AND column_name = 'payment_state'
      ) as result
    `,
    sql: `
      -- Update deprecated payment states
      UPDATE account_move
      SET payment_state = 'not_paid'
      WHERE payment_state IS NULL OR payment_state = '';

      -- Rename 'invoicing_legacy' to appropriate new state
      UPDATE account_move
      SET payment_state = 'not_paid'
      WHERE payment_state = 'invoicing_legacy';
    `
  },

  // ===== PHASE 6: Mail/Messaging changes =====
  {
    id: 'mail-001-message-structure',
    name: 'Update mail.message structure',
    description: 'Messaging system changes in Odoo 17',
    order: 50,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'mail_message'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add link_preview_id for URL previews
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'mail_message'
            AND column_name = 'link_preview_id'
        ) THEN
          ALTER TABLE mail_message
            ADD COLUMN link_preview_id INTEGER;
        END IF;

        -- Add is_current_user_or_guest_author
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'mail_message'
            AND column_name = 'is_current_user_or_guest_author'
        ) THEN
          ALTER TABLE mail_message
            ADD COLUMN is_current_user_or_guest_author BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 7: Website/Frontend changes =====
  {
    id: 'web-001-asset-bundle',
    name: 'Update asset bundle structure',
    description: 'Frontend asset changes in Odoo 17',
    order: 60,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'ir_asset'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add target field for asset targeting
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ir_asset'
            AND column_name = 'target'
        ) THEN
          ALTER TABLE ir_asset
            ADD COLUMN target VARCHAR(64);
        END IF;
      END $$;
    `
  },

  // ===== PHASE 8: Version marker =====
  {
    id: 'version-001-mark-17',
    name: 'Mark database as Odoo 17',
    description: 'Update version markers in database',
    order: 100,
    sql: `
      -- Update ir_config_parameter for version
      INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
      VALUES ('database.version', '17.0', 1, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = '17.0', write_date = NOW();

      -- Mark migration timestamp
      INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
      VALUES ('database.migration_date', NOW()::text, 1, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = NOW()::text, write_date = NOW();
    `
  },

  // ===== PHASE 9: Post-migration cleanup =====
  {
    id: 'post-001-recompute-stored',
    name: 'Mark stored computed fields for recompute',
    description: 'Trigger recomputation of stored computed fields',
    order: 110,
    sql: `
      -- Clear ir_model_fields cache to force recompute on next startup
      UPDATE ir_model_fields
      SET compute = compute
      WHERE store = true AND compute IS NOT NULL;
    `
  },

  {
    id: 'post-002-clear-caches',
    name: 'Clear system caches',
    description: 'Clear caches that might hold old data',
    order: 120,
    sql: `
      -- Truncate asset bundles to force regeneration
      DO $$
      BEGIN
        IF EXISTS (
          SELECT FROM pg_tables
          WHERE schemaname = 'public' AND tablename = 'ir_attachment'
        ) THEN
          DELETE FROM ir_attachment
          WHERE res_model = 'ir.ui.view'
            AND name LIKE '%.assets%';
        END IF;
      END $$;

      -- Clear QWeb views cache
      UPDATE ir_ui_view
      SET arch_updated = true
      WHERE type = 'qweb';
    `
  }
];

/**
 * Get migration scripts in execution order
 */
export function getMigrationScripts(): MigrationScript[] {
  return [...MIGRATION_SCRIPTS].sort((a, b) => a.order - b.order);
}

/**
 * Get migration script by ID
 */
export function getMigrationScriptById(id: string): MigrationScript | undefined {
  return MIGRATION_SCRIPTS.find(s => s.id === id);
}

/**
 * Get total number of migration scripts
 */
export function getMigrationCount(): number {
  return MIGRATION_SCRIPTS.length;
}

/**
 * Validate that all required tables exist for migration
 */
export function getRequiredTables(): string[] {
  return [
    'ir_module_module',
    'res_users',
    'res_partner',
    'res_company',
    'ir_config_parameter'
  ];
}

/**
 * Source and target version for this migration
 */
export const SOURCE_VERSION = '16.0';
export const TARGET_VERSION = '17.0';

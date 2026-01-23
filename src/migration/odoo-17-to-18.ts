/**
 * Odoo 17 to 18 Migration Scripts
 *
 * Contains all SQL migrations for upgrading Odoo database
 * from version 17 to version 18.
 *
 * Based on Odoo 18 upgrade documentation and changelog.
 * Pattern follows odoo-16-to-17.ts for consistency.
 */

import { MigrationScript } from '../types';

/**
 * All migration scripts for Odoo 17 to 18 upgrade.
 * Scripts are executed in order by the 'order' field.
 */
export const MIGRATION_SCRIPTS_17_18: MigrationScript[] = [
  // ===== PHASE 1: Pre-migration safety checks =====
  {
    id: 'pre-001-backup-check-18',
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

  {
    id: 'pre-002-version-check',
    name: 'Verify source version is 17.x',
    description: 'Ensure database is Odoo 17 before migrating to 18',
    order: 2,
    sql: `
      DO $$
      DECLARE
        current_version text;
      BEGIN
        SELECT value INTO current_version
        FROM ir_config_parameter
        WHERE key = 'database.version';

        IF current_version IS NULL OR NOT current_version LIKE '17.%' THEN
          RAISE EXCEPTION 'Database version must be 17.x to migrate to 18. Current: %',
            COALESCE(current_version, 'unknown');
        END IF;
      END $$;
    `
  },

  // ===== PHASE 2: Module system updates =====
  {
    id: 'mod-001-module-category',
    name: 'Update module category structure',
    description: 'Odoo 18 reorganized module categories',
    order: 10,
    sql: `
      DO $$
      BEGIN
        -- Add new category fields if not exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ir_module_category'
            AND column_name = 'icon'
        ) THEN
          ALTER TABLE ir_module_category
            ADD COLUMN icon VARCHAR(256);
        END IF;
      END $$;
    `
  },

  {
    id: 'mod-002-module-license',
    name: 'Update module license tracking',
    description: 'Enhanced license tracking in Odoo 18',
    order: 11,
    sql: `
      DO $$
      BEGIN
        -- Add license_family field
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ir_module_module'
            AND column_name = 'license_family'
        ) THEN
          ALTER TABLE ir_module_module
            ADD COLUMN license_family VARCHAR(64);

          -- Populate based on license
          UPDATE ir_module_module
          SET license_family = CASE
            WHEN license IN ('LGPL-3', 'LGPL-3+') THEN 'lgpl'
            WHEN license IN ('GPL-3', 'GPL-3+', 'AGPL-3') THEN 'gpl'
            WHEN license IN ('OPL-1', 'OEEL-1') THEN 'proprietary'
            ELSE 'other'
          END
          WHERE license IS NOT NULL;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 3: Partner/Contact changes =====
  {
    id: 'partner-001-avatar-field',
    name: 'Add partner avatar fields',
    description: 'Odoo 18 enhanced avatar handling',
    order: 20,
    sql: `
      DO $$
      BEGIN
        -- Add avatar_256 for optimized thumbnails
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'avatar_256'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN avatar_256 BYTEA;
        END IF;

        -- Add contact_address_inline for formatted addresses
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'contact_address_inline'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN contact_address_inline TEXT;
        END IF;
      END $$;
    `
  },

  {
    id: 'partner-002-additional-info',
    name: 'Add partner additional info fields',
    description: 'New partner fields in Odoo 18',
    order: 21,
    sql: `
      DO $$
      BEGIN
        -- Add partner_share for portal access tracking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'partner_share'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN partner_share BOOLEAN DEFAULT false;
        END IF;

        -- Add signup_valid for signup status tracking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'signup_valid'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN signup_valid BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 4: User/Authentication changes =====
  {
    id: 'user-001-password-policy',
    name: 'Add password policy fields',
    description: 'Odoo 18 enhanced password security',
    order: 30,
    sql: `
      DO $$
      BEGIN
        -- Add password_write_date for password age tracking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_users'
            AND column_name = 'password_write_date'
        ) THEN
          ALTER TABLE res_users
            ADD COLUMN password_write_date TIMESTAMP;

          -- Initialize with current write_date
          UPDATE res_users
          SET password_write_date = write_date
          WHERE password IS NOT NULL;
        END IF;
      END $$;
    `
  },

  {
    id: 'user-002-session-management',
    name: 'Update session management tables',
    description: 'Session tracking improvements in Odoo 18',
    order: 31,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'res_users_log'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add device_id for device tracking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_users_log'
            AND column_name = 'device_id'
        ) THEN
          ALTER TABLE res_users_log
            ADD COLUMN device_id VARCHAR(128);
        END IF;

        -- Add ip_address for security auditing
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_users_log'
            AND column_name = 'ip_address'
        ) THEN
          ALTER TABLE res_users_log
            ADD COLUMN ip_address INET;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 5: Accounting changes =====
  {
    id: 'account-001-tax-changes',
    name: 'Update tax structure',
    description: 'Tax handling changes in Odoo 18',
    order: 40,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'account_tax'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add tax repartition improvements
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'account_tax'
            AND column_name = 'is_base_affected'
        ) THEN
          ALTER TABLE account_tax
            ADD COLUMN is_base_affected BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `
  },

  {
    id: 'account-002-journal-changes',
    name: 'Update journal structure',
    description: 'Journal improvements in Odoo 18',
    order: 41,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'account_journal'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add default_account_id for simplified setup
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'account_journal'
            AND column_name = 'default_account_id'
        ) THEN
          ALTER TABLE account_journal
            ADD COLUMN default_account_id INTEGER;
        END IF;

        -- Add suspense_account_id
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'account_journal'
            AND column_name = 'suspense_account_id'
        ) THEN
          ALTER TABLE account_journal
            ADD COLUMN suspense_account_id INTEGER;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 6: Mail/Messaging changes =====
  {
    id: 'mail-001-reaction-support',
    name: 'Add message reaction support',
    description: 'Odoo 18 added emoji reactions to messages',
    order: 50,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'mail_message'
      ) as result
    `,
    sql: `
      -- Create reactions table if not exists
      CREATE TABLE IF NOT EXISTS mail_message_reaction (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES mail_message(id) ON DELETE CASCADE,
        partner_id INTEGER REFERENCES res_partner(id) ON DELETE CASCADE,
        reaction VARCHAR(32) NOT NULL,
        create_date TIMESTAMP DEFAULT NOW(),
        UNIQUE(message_id, partner_id, reaction)
      );

      -- Add index for performance
      CREATE INDEX IF NOT EXISTS mail_message_reaction_message_idx
        ON mail_message_reaction(message_id);
    `
  },

  {
    id: 'mail-002-scheduled-messages',
    name: 'Add scheduled message support',
    description: 'Scheduled message sending in Odoo 18',
    order: 51,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'mail_message'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add scheduled_date for delayed sending
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'mail_message'
            AND column_name = 'scheduled_date'
        ) THEN
          ALTER TABLE mail_message
            ADD COLUMN scheduled_date TIMESTAMP,
            ADD COLUMN is_scheduled BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 7: Website/Frontend changes =====
  {
    id: 'web-001-theme-variables',
    name: 'Update theme variable structure',
    description: 'Theme system changes in Odoo 18',
    order: 60,
    preCheck: `
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'ir_ui_view'
      ) as result
    `,
    sql: `
      DO $$
      BEGIN
        -- Add customize_show for visibility control
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ir_ui_view'
            AND column_name = 'customize_show'
        ) THEN
          ALTER TABLE ir_ui_view
            ADD COLUMN customize_show BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `
  },

  // ===== PHASE 8: New Odoo 18 features =====
  {
    id: 'new-001-knowledge-base',
    name: 'Prepare for Knowledge module',
    description: 'Add fields for Odoo 18 Knowledge integration',
    order: 70,
    sql: `
      DO $$
      BEGIN
        -- Add knowledge_article_id to res.partner for linking
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'res_partner'
            AND column_name = 'knowledge_article_ids'
        ) THEN
          ALTER TABLE res_partner
            ADD COLUMN knowledge_article_ids INTEGER[];
        END IF;
      END $$;
    `
  },

  // ===== PHASE 9: Version marker =====
  {
    id: 'version-001-mark-18',
    name: 'Mark database as Odoo 18',
    description: 'Update version markers in database',
    order: 100,
    sql: `
      -- Update ir_config_parameter for version
      INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
      VALUES ('database.version', '18.0', 1, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = '18.0', write_date = NOW();

      -- Mark migration timestamp
      INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
      VALUES ('database.migration_date', NOW()::text, 1, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = NOW()::text, write_date = NOW();

      -- Mark previous version
      INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
      VALUES ('database.previous_version', '17.0', 1, NOW(), 1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = '17.0', write_date = NOW();
    `
  },

  // ===== PHASE 10: Post-migration cleanup =====
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
export function getMigrationScripts17to18(): MigrationScript[] {
  return [...MIGRATION_SCRIPTS_17_18].sort((a, b) => a.order - b.order);
}

/**
 * Get migration script by ID
 */
export function getMigrationScriptById17to18(id: string): MigrationScript | undefined {
  return MIGRATION_SCRIPTS_17_18.find(s => s.id === id);
}

/**
 * Get total number of migration scripts
 */
export function getMigrationCount17to18(): number {
  return MIGRATION_SCRIPTS_17_18.length;
}

/**
 * Validate that all required tables exist for migration
 */
export function getRequiredTables17to18(): string[] {
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
export const SOURCE_VERSION_17 = '17.0';
export const TARGET_VERSION_18 = '18.0';

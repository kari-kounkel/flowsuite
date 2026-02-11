-- =============================================
-- FLOWSUITE FOUNDATION: Multi-Tenant Infrastructure
-- Run in Supabase SQL Editor (keegxjuckohhtxllqxak)
-- =============================================

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter','pro','enterprise')),
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORG_USERS (who belongs to which org, with what role)
CREATE TABLE IF NOT EXISTS org_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin','org_admin','manager','viewer')),
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- 3. ORG_MODULES (which modules each org has access to)
CREATE TABLE IF NOT EXISTS org_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('peopleflow','paperflow','scanflow','moneyflow')),
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, module)
);

-- 4. ADD org_id TO ALL EXISTING TABLES
-- (Run these one at a time if any fail — some tables may not exist yet)

-- Employees
DO $$ BEGIN
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Disciplines
DO $$ BEGIN
  ALTER TABLE disciplines ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Onboarding
DO $$ BEGIN
  ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Documents
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Payroll Items
DO $$ BEGIN
  ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Settings
DO $$ BEGIN
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Contract Sections
DO $$ BEGIN
  ALTER TABLE contract_sections ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Contract Notes
DO $$ BEGIN
  ALTER TABLE contract_notes ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Policy Pushes
DO $$ BEGIN
  ALTER TABLE policy_pushes ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Push Acknowledgments
DO $$ BEGIN
  ALTER TABLE push_acknowledgments ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'minuteman';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 5. SEED MINUTEMAN AS ORG #1
INSERT INTO organizations (id, name, slug, plan) 
VALUES ('minuteman', 'Minuteman Press', 'minuteman', 'pro')
ON CONFLICT (id) DO NOTHING;

-- 6. SEED ORG MODULES FOR MINUTEMAN
INSERT INTO org_modules (org_id, module, enabled) VALUES
  ('minuteman', 'peopleflow', true),
  ('minuteman', 'paperflow', true),
  ('minuteman', 'scanflow', false)
ON CONFLICT (org_id, module) DO NOTHING;

-- 7. RLS POLICIES
-- Organizations: users can see orgs they belong to
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own orgs" ON organizations FOR SELECT
  USING (id IN (SELECT org_id FROM org_users WHERE user_id = auth.uid()));
CREATE POLICY "Super admins manage orgs" ON organizations FOR ALL
  USING (id IN (SELECT org_id FROM org_users WHERE user_id = auth.uid() AND role = 'super_admin'));

-- Org Users: users can see members of their orgs
ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see org members" ON org_users FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_users ou WHERE ou.user_id = auth.uid()));
CREATE POLICY "Admins manage org users" ON org_users FOR ALL
  USING (org_id IN (SELECT org_id FROM org_users WHERE user_id = auth.uid() AND role IN ('super_admin','org_admin')));

-- Org Modules: users can see modules for their orgs
ALTER TABLE org_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see org modules" ON org_modules FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_users WHERE user_id = auth.uid()));
CREATE POLICY "Super admins manage modules" ON org_modules FOR ALL
  USING (org_id IN (SELECT org_id FROM org_users WHERE user_id = auth.uid() AND role = 'super_admin'));

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_org_users_user ON org_users(user_id);
CREATE INDEX IF NOT EXISTS idx_org_users_org ON org_users(org_id);
CREATE INDEX IF NOT EXISTS idx_org_modules_org ON org_modules(org_id);

-- Add org_id indexes to existing tables (safe to run multiple times)
DO $$ BEGIN CREATE INDEX idx_employees_org ON employees(org_id); EXCEPTION WHEN duplicate_table THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX idx_disciplines_org ON disciplines(org_id); EXCEPTION WHEN duplicate_table THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX idx_contract_sections_org ON contract_sections(org_id); EXCEPTION WHEN duplicate_table THEN NULL; WHEN undefined_table THEN NULL; END $$;

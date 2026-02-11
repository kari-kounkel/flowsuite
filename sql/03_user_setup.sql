-- =============================================
-- USER SETUP: Assign roles after users sign up
-- Run AFTER users have created accounts via Auth
-- =============================================
-- INSTRUCTIONS:
-- 1. Have each user sign up at flowsuite.caresmn.com
-- 2. Go to Supabase → Authentication → Users
-- 3. Copy each user's UUID
-- 4. Replace the placeholder UUIDs below
-- 5. Run this script

-- Kari = super_admin (sees everything, all orgs, admin panel)
INSERT INTO org_users (org_id, user_id, role, display_name, email)
VALUES ('minuteman', 'REPLACE_WITH_KARI_UUID', 'super_admin', 'Kari', 'kari@caresmn.com')
ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'super_admin';

-- Frank = org_admin (manages Minuteman, no admin panel)
INSERT INTO org_users (org_id, user_id, role, display_name, email)
VALUES ('minuteman', 'REPLACE_WITH_FRANK_UUID', 'org_admin', 'Frank', 'frank@minutemanpress.com')
ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'org_admin';

-- Desiree = manager (team lead access)
INSERT INTO org_users (org_id, user_id, role, display_name, email)
VALUES ('minuteman', 'REPLACE_WITH_DESIREE_UUID', 'manager', 'Desiree', 'desiree@minutemanpress.com')
ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'manager';

-- VERIFY:
-- SELECT * FROM org_users WHERE org_id = 'minuteman';

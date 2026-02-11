-- =============================================
-- SEED: All 35 Local 1B Union Contract Sections
-- Run AFTER 01_foundation.sql
-- =============================================

-- Ensure contract_sections table exists
CREATE TABLE IF NOT EXISTS contract_sections (
  id SERIAL PRIMARY KEY,
  org_id TEXT DEFAULT 'minuteman',
  doc_type TEXT NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract', 'handbook')),
  section_number TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure contract_notes table exists
CREATE TABLE IF NOT EXISTS contract_notes (
  id SERIAL PRIMARY KEY,
  org_id TEXT DEFAULT 'minuteman',
  section_id INTEGER REFERENCES contract_sections(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  note TEXT NOT NULL,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general','negotiation','question','proposed_change')),
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure policy_pushes table exists
CREATE TABLE IF NOT EXISTS policy_pushes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id TEXT DEFAULT 'minuteman',
  section_id INTEGER REFERENCES contract_sections(id) ON DELETE CASCADE,
  pushed_by TEXT NOT NULL,
  pushed_to TEXT[] NOT NULL DEFAULT '{}',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure push_acknowledgments table exists
CREATE TABLE IF NOT EXISTS push_acknowledgments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id TEXT DEFAULT 'minuteman',
  push_id UUID REFERENCES policy_pushes(id) ON DELETE CASCADE,
  employee_id UUID,
  employee_name TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','declined'))
);

-- RLS for contract tables
ALTER TABLE contract_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_pushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_acknowledgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users access contract_sections" ON contract_sections;
CREATE POLICY "Auth users access contract_sections" ON contract_sections FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth users access contract_notes" ON contract_notes;
CREATE POLICY "Auth users access contract_notes" ON contract_notes FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth users access policy_pushes" ON policy_pushes;
CREATE POLICY "Auth users access policy_pushes" ON policy_pushes FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth users access push_acknowledgments" ON push_acknowledgments;
CREATE POLICY "Auth users access push_acknowledgments" ON push_acknowledgments FOR ALL USING (auth.role() = 'authenticated');

-- Clear existing seed data (safe re-run)
DELETE FROM contract_sections WHERE org_id = 'minuteman' AND doc_type = 'contract';

-- SEED ALL 35 SECTIONS
INSERT INTO contract_sections (org_id, doc_type, section_number, title, category, sort_order, body) VALUES
-- DURATION
('minuteman','contract','1.1','Duration of Agreement','Duration',1,'This Agreement shall be effective from [date] and shall remain in full force and effect until [date], unless amended by mutual consent of both parties.'),

-- UNION SECURITY
('minuteman','contract','2.1','Recognition','Union Security',2,'The Employer recognizes the Union as the sole and exclusive bargaining representative for all employees in the bargaining unit.'),
('minuteman','contract','2.2','Union Security','Union Security',3,'All employees covered by this Agreement shall, as a condition of employment, become and remain members of the Union in good standing.'),
('minuteman','contract','2.3','Dues Checkoff','Union Security',4,'The Employer agrees to deduct from the wages of each employee who authorizes such deduction, the monthly Union dues and initiation fees.'),

-- GRIEVANCE
('minuteman','contract','3.1','Grievance Procedure','Grievance',5,'A grievance is defined as any dispute or difference between the Employer and the Union or any employee concerning the interpretation or application of this Agreement.'),
('minuteman','contract','3.2','Grievance Steps','Grievance',6,'Step 1: Employee and steward present grievance to supervisor within 5 working days. Step 2: Written grievance to management within 10 working days. Step 3: Arbitration.'),
('minuteman','contract','3.3','Arbitration','Grievance',7,'If the grievance is not resolved through Steps 1 and 2, either party may submit the matter to arbitration within 30 calendar days.'),

-- WAGES
('minuteman','contract','4.1','Wage Rates','Wages',8,'Wage rates for all classifications covered by this Agreement are set forth in Appendix A attached hereto and made a part of this Agreement.'),
('minuteman','contract','4.2','Overtime','Wages',9,'All hours worked in excess of eight (8) hours per day or forty (40) hours per week shall be paid at one and one-half (1.5) times the regular rate.'),
('minuteman','contract','4.3','Shift Differential','Wages',10,'Employees assigned to second or third shift shall receive a shift differential as specified in Appendix A.'),
('minuteman','contract','4.4','Pay Period','Wages',11,'Employees shall be paid bi-weekly on Friday for the preceding two-week pay period.'),

-- OPERATIONS
('minuteman','contract','5.1','Management Rights','Operations',12,'The Employer retains all rights to manage the business and direct the workforce except as specifically limited by this Agreement.'),
('minuteman','contract','5.2','Subcontracting','Operations',13,'The Employer shall not subcontract bargaining unit work if it would result in the layoff of bargaining unit employees.'),
('minuteman','contract','5.3','Work Rules','Operations',14,'The Employer may establish reasonable work rules and policies. New rules shall be posted 7 days before taking effect.'),

-- HOLIDAYS
('minuteman','contract','6.1','Recognized Holidays','Holidays',15,'The following days shall be recognized as paid holidays: New Year''s Day, Memorial Day, Independence Day, Labor Day, Thanksgiving Day, day after Thanksgiving, Christmas Eve, Christmas Day.'),
('minuteman','contract','6.2','Holiday Pay','Holidays',16,'Eligible employees shall receive eight (8) hours of pay at their straight-time rate for each recognized holiday.'),

-- PTO
('minuteman','contract','7.1','Vacation Eligibility','PTO',17,'Employees shall earn vacation based on continuous service: 1-4 years: 2 weeks; 5-14 years: 3 weeks; 15+ years: 4 weeks.'),
('minuteman','contract','7.2','Vacation Scheduling','PTO',18,'Vacation requests shall be submitted at least two weeks in advance. Seniority shall prevail in scheduling conflicts.'),
('minuteman','contract','7.3','Sick Leave','PTO',19,'Employees shall accrue sick leave at the rate of one (1) day per month of service, cumulative to sixty (60) days.'),

-- LEAVE
('minuteman','contract','8.1','FMLA Leave','Leave',20,'Eligible employees are entitled to leave under the Family and Medical Leave Act as provided by federal and state law.'),
('minuteman','contract','8.2','Bereavement Leave','Leave',21,'Employees shall be granted up to three (3) days of paid bereavement leave for the death of an immediate family member.'),
('minuteman','contract','8.3','Jury Duty','Leave',22,'Employees summoned for jury duty shall receive their regular pay for each day of required service, less any jury fees received.'),

-- HOURS
('minuteman','contract','9.1','Work Week','Hours',23,'The normal work week shall consist of five (5) consecutive eight-hour days, Monday through Friday.'),
('minuteman','contract','9.2','Breaks and Meals','Hours',24,'Employees shall receive two (2) paid fifteen-minute breaks and one (1) unpaid thirty-minute meal period per eight-hour shift.'),

-- SEPARATION
('minuteman','contract','10.1','Discharge and Discipline','Separation',25,'No employee shall be discharged or disciplined without just cause. Progressive discipline: verbal warning, written warning, suspension, termination.'),
('minuteman','contract','10.2','Layoff and Recall','Separation',26,'In the event of layoff, employees shall be laid off in reverse order of seniority within their classification. Recall in order of seniority.'),

-- BENEFITS
('minuteman','contract','11.1','Health Insurance','Benefits',27,'The Employer shall provide group health insurance to all eligible employees and their dependents as outlined in Appendix B.'),
('minuteman','contract','11.2','Retirement/401k','Benefits',28,'The Employer shall contribute to a 401(k) retirement plan. Employer match: 50% of employee contribution up to 6% of gross wages.'),

-- APPRENTICE
('minuteman','contract','12.1','Apprenticeship Program','Apprentice',29,'The Employer and Union agree to maintain a Joint Apprenticeship Committee to oversee training programs for new employees.'),

-- DEFINITIONS
('minuteman','contract','13.1','Definitions','Definitions',30,'Bargaining Unit: All production and maintenance employees. Probationary Period: First 90 calendar days of employment. Seniority: Length of continuous service.'),

-- SENIORITY
('minuteman','contract','14.1','Seniority Rights','Seniority',31,'Seniority shall be defined as the length of continuous service with the Employer from the most recent date of hire.'),
('minuteman','contract','14.2','Loss of Seniority','Seniority',32,'An employee shall lose seniority for: voluntary quit, discharge for just cause, failure to return from layoff within 5 working days of recall notice.'),

-- COMPLIANCE
('minuteman','contract','15.1','Non-Discrimination','Compliance',33,'The Employer and Union agree not to discriminate against any employee on the basis of race, color, religion, sex, national origin, age, disability, or union activity.'),
('minuteman','contract','15.2','Safety and Health','Compliance',34,'The Employer shall maintain safe and healthful working conditions in accordance with applicable federal and state regulations.'),

-- LEGAL
('minuteman','contract','16.1','Savings Clause','Legal',35,'If any provision of this Agreement is found to be in conflict with applicable law, such provision shall be modified to comply, and all other provisions shall remain in full force.');

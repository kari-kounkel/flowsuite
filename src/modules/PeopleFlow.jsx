import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import { Card, Tag, Btn, fm, dbt, td } from '../theme.jsx'
import { generateLetterPDF, buildOfferLetterHTML, buildUnionLetterHTML } from './letterHelpers.js'

// ── Constants ──
const OBS = [
  // Pre-Hire
  {id:'app_accepted',  p:'Pre-Hire',   l:'Accept Application'},
  {id:'interview',     p:'Pre-Hire',   l:'Interview(s) Conducted'},
  {id:'offer_letter',  p:'Pre-Hire',   l:'Job Offer Letter Issued'},
  // Hire Day
  {id:'manual_issued', p:'Hire Day',   l:'Employment Manual Issued'},
  {id:'union_report',  p:'Hire Day',   l:'Report to Union (Ruth & Marty)'},
  {id:'start_date',    p:'Hire Day',   l:'Start Date Confirmed'},
  {id:'qbo_email',     p:'Hire Day',   l:'QuickBooks Onboarding Email Sent'},
  {id:'i9_docs',       p:'Hire Day',   l:'I-9 Supporting Docs Uploaded'},
  {id:'mn_new_hire',   p:'Hire Day',   l:'MN New Hire Reported'},
  // Benefits (30-day window)
  {id:'benefits_offer',p:'Benefits',   l:'Benefits Offered (Health/Dental/Vision/Sam\'s/LegalShield)'},
  {id:'union_contract',p:'Benefits',   l:'Union Contract Issued'},
  // Setup
  {id:'badge',         p:'Setup',      l:'Employee Badge Issued'},
  {id:'training_manual',p:'Setup',     l:'Training Manual Issued'},
  // Training
  {id:'training_start',p:'Training',   l:'Training Begins'},
  {id:'union_enroll',  p:'Training',   l:'Union Enrollment Confirmed (from Ruth/Marty)'},
  {id:'withhold_info', p:'Training',   l:'Withholding Authorization Info Sent (Dues & Pension)'},
  {id:'withhold_init', p:'Training',   l:'Withholdings Initiated'},
  {id:'org_chart',     p:'Training',   l:'Org Chart Reviewed'},
  // Completion
  {id:'orientation',   p:'Completion', l:'Orientation Complete'},
  {id:'checkin_30',    p:'Completion', l:'30-Day Check-In'},
]

const DOC_ITEMS = [
  {id:'d_app',         c:'Hiring',     l:'Application / Resume'},
  {id:'d_offer',       c:'Hiring',     l:'Offer Letter'},
  {id:'d_i9_docs',     c:'Tax & Legal',l:'I-9 Supporting Documents'},
  {id:'d_health',      c:'Benefits',   l:'Health Insurance Enrollment'},
  {id:'d_dental',      c:'Benefits',   l:'Dental Enrollment'},
  {id:'d_vision',      c:'Benefits',   l:'Vision Enrollment'},
  {id:'d_sams',        c:'Benefits',   l:'Sam\'s Club Membership'},
  {id:'d_legalshield', c:'Benefits',   l:'LegalShield Enrollment'},
]

const ADMIN_EMAILS = ['kari@karikounkel.com','accounting@mpuptown.com','fbrown@mpuptown.com','operationsmanager@mpuptown.com']
const HR_EMAILS = ['kari@karikounkel.com','operationsmanager@mpuptown.com']

const DISC_TYPES = [
  {v:'verbal',l:'Verbal Warning',c:'#F59E0B'},
  {v:'written',l:'Written Warning',c:'#EF4444'},
  {v:'final_written',l:'Final Written Warning',c:'#DC2626'},
  {v:'suspension',l:'Suspension',c:'#B91C1C'},
  {v:'termination',l:'Termination',c:'#991B1B'},
  {v:'reinstatement',l:'Reinstatement w/ Conditions',c:'#0EA5E9'},
  {v:'last_chance',l:'Last Chance Agreement',c:'#7C3AED'},
  {v:'coaching',l:'Coaching',c:'#3B82F6'},
  {v:'commendation',l:'Commendation',c:'#22C55E'}
]
const RC = '#0EA5E9' // reinstatement color

const SEPARATION_TYPES = [
  {v:'layoff',l:'Layoff — Lack of Work',c:'#6366F1',hasRecall:true},
  {v:'termination_cause',l:'Termination for Cause',c:'#991B1B',hasRecall:false},
  {v:'voluntary_resignation',l:'Voluntary Resignation',c:'#78716C',hasRecall:false},
  {v:'job_abandonment',l:'Job Abandonment',c:'#DC2626',hasRecall:false},
  {v:'retirement',l:'Retirement',c:'#059669',hasRecall:false}
]

const EQUIPMENT_CHECKLIST = [
  {id:'keys',l:'Keys'},
  {id:'badge',l:'Badge / Access Card'},
  {id:'tools',l:'Tools / Equipment'},
  {id:'uniform',l:'Uniform / PPE'},
  {id:'laptop',l:'Laptop / Tablet'},
  {id:'phone',l:'Company Phone'},
  {id:'parking',l:'Parking Pass'},
  {id:'other',l:'Other'}
]

const REPORT_TYPES = [
  {v:'concern',l:'Concern',c:'#F59E0B',i:'⚠'},
  {v:'incident',l:'Incident',c:'#EF4444',i:'◉'},
  {v:'safety',l:'Safety',c:'#DC2626',i:'▲'},
  {v:'praise',l:'Praise',c:'#22C55E',i:'★'}
]

const INCIDENT_NATURES = [
  'Safety Violation','Tardiness/Attendance','Performance',
  'Violation of Company Policy/Procedure','Other (Please See Below)','Willful Misconduct'
]

const REPORT_STATUSES = [
  {v:'submitted',l:'Submitted',c:'#F59E0B'},
  {v:'reviewed',l:'Reviewed',c:'#3B82F6'},
  {v:'escalated',l:'Escalated',c:'#DC2626'},
  {v:'closed',l:'Closed',c:'#6B7280'}
]

const ROLE_COLORS = {
  'C-Level':  {bg:'#FFF7ED',text:'#C2410C',border:'#EA580C'},
  'Manager':  {bg:'#F0FDF4',text:'#166534',border:'#16A34A'},
  'Lead':     {bg:'#FFF7ED',text:'#9A3412',border:'#C2410C'},
  'Staff':    {bg:'#F1F5F9',text:'#475569',border:'#64748B'}
}

const EMP_FIELDS = [
  ['preferred_name','Preferred Name'],['last_name','Last Name'],['first_name','Legal First'],
  ['role','Classification'],['dept','Department'],['hire_date','Hire Date'],
  ['status','Status'],['union_status','Union Status'],
  ['rate','Pay Rate'],['email','Email'],['phone','Phone'],
  ['address','Address'],['city','City'],['state','State'],['zip','Zip Code'],
  ['badge_code','Badge Code'],
  ['layoff_date','Layoff Date'],['expected_recall_date','Expected Recall Date'],
  ['ec_name','Emergency Contact'],['ec_relationship','EC Relationship'],['ec_phone','Emergency Phone'],
  ['reports_to','Reports To'],['emp_code','Emp Code'],['notes','Notes'],
  ['offer_date','Offer Date'],['start_date','Start Date'],['offer_status','Offer Status']
]

const DEPARTMENTS = ['Digital Production','Wide Format','Operations/CS','Executive','Shipping/Receiving','Sales','Admin']

// ── Helpers ──
const gn = (e) => ((e.preferred_name || e.first_name || '') + ' ' + (e.last_name || '')).trim()

// Progressive Discipline — auto-calculated status + next-level suggestion
const PROGRESSION_CHAIN = ['verbal','written','final_written','suspension','termination']

const isDiscActive = (d) => {
  const discDate = d.date || d.created_at
  if (!discDate) return true
  const daysSince = Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24))
  return daysSince < 365
}

const getDiscStatus = (d) => isDiscActive(d) ? 'Active' : 'Retired'

// ── US Federal Holidays (static list) ──
const US_HOLIDAYS = [
  '2024-01-01','2024-01-15','2024-02-19','2024-05-27','2024-06-19','2024-07-04',
  '2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-12-25',
  '2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04',
  '2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-04',
  '2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
]
const isHoliday = (d) => US_HOLIDAYS.includes(d.toISOString().split('T')[0])
const isWeekend = (d) => d.getDay()===0||d.getDay()===6
const addWorkingDays = (startStr, days) => {
  if (!startStr) return null
  let d = new Date(startStr)
  let count = 0
  while (count < days) {
    d.setDate(d.getDate()+1)
    if (!isWeekend(d) && !isHoliday(d)) count++
  }
  return d.toISOString().split('T')[0]
}

// ── Union contacts ──
const UNION_CONTACTS = {
  ruth: { name: 'Ruth', role: 'Union Contact' },
  marty: { name: 'Marty Hallberg', role: 'Union President' }
}

// generateLetterPDF, buildOfferLetterHTML, buildUnionLetterHTML → see letterHelpers.js

// Get active progressive records for an employee (excludes coaching/commendation)
const getActiveProgressive = (empId, allDisc) => {
  return allDisc
    .filter(d => d.employee_id === empId && isDiscActive(d) && PROGRESSION_CHAIN.includes(d.type))
    .sort((a,b) => PROGRESSION_CHAIN.indexOf(b.type) - PROGRESSION_CHAIN.indexOf(a.type))
}

// Suggest next discipline level based on active progressive records
const suggestNextLevel = (empId, allDisc) => {
  const active = getActiveProgressive(empId, allDisc)
  if (active.length === 0) return 'verbal'
  const highest = active[0].type
  const idx = PROGRESSION_CHAIN.indexOf(highest)
  return idx < PROGRESSION_CHAIN.length - 1 ? PROGRESSION_CHAIN[idx + 1] : 'termination'
}

// Last Chance Agreement — calculate remaining days with layoff freeze support
const getLCAStatus = (lcaRecord, empRecord) => {
  if (!lcaRecord || !lcaRecord.lca_start_date || !lcaRecord.lca_duration_days) return null
  const startDate = new Date(lcaRecord.lca_start_date)
  const durationDays = parseInt(lcaRecord.lca_duration_days) || 0
  const now = new Date()

  // Calculate freeze days (time spent on layoff during LCA period)
  let freezeDays = 0
  if (empRecord?.layoff_date) {
    const layoffStart = new Date(empRecord.layoff_date)
    const layoffEnd = empRecord.recall_date ? new Date(empRecord.recall_date) : now
    // Only count freeze days that overlap with the LCA period
    const freezeStart = layoffStart > startDate ? layoffStart : startDate
    const freezeEnd = layoffEnd
    if (freezeEnd > freezeStart) {
      freezeDays = Math.floor((freezeEnd - freezeStart) / (1000*60*60*24))
    }
  }

  const elapsedTotal = Math.floor((now - startDate) / (1000*60*60*24))
  const elapsedActive = elapsedTotal - freezeDays
  const remaining = Math.max(0, durationDays - elapsedActive)
  const isComplete = remaining === 0 && elapsedActive >= durationDays
  const isFrozen = empRecord?.status === 'laid_off'

  return { durationDays, elapsedActive, freezeDays, remaining, isComplete, isFrozen, startDate }
}

// New-hire probation days with freeze support
const getProbationDays = (emp) => {
  if (!emp?.hire_date) return { elapsed: 0, remaining: 90, frozen: false }
  const hireDate = new Date(emp.hire_date)
  const now = new Date()
  const totalDays = Math.floor((now - hireDate) / (1000*60*60*24))

  let freezeDays = 0
  if (emp.layoff_date) {
    const layoffStart = new Date(emp.layoff_date)
    const layoffEnd = emp.recall_date ? new Date(emp.recall_date) : now
    const freezeStart = layoffStart > hireDate ? layoffStart : hireDate
    if (layoffEnd > freezeStart) {
      freezeDays = Math.floor((layoffEnd - freezeStart) / (1000*60*60*24))
    }
  }

  const activeDays = totalDays - freezeDays
  const remaining = Math.max(0, 90 - activeDays)
  return { elapsed: activeDays, remaining, frozen: emp.status === 'laid_off', freezeDays }
}

// Walk up reports_to chain to find first Manager or C-Level
const findManager = (employeeId, emps) => {
  const visited = new Set()
  let current = emps.find(e => e.id === employeeId)
  while (current && current.reports_to) {
    if (visited.has(current.reports_to)) break // prevent infinite loop
    visited.add(current.reports_to)
    const superior = emps.find(e => e.id === current.reports_to)
    if (!superior) break
    if (superior.role === 'Manager' || superior.role === 'C-Level') return superior
    current = superior
  }
  return null
}

// Build downline recursively
const getDownline = (managerId, emps) => {
  const directs = emps.filter(e => e.reports_to === managerId)
  let all = [...directs]
  directs.forEach(d => { all = all.concat(getDownline(d.id, emps)) })
  return all
}

// ─── LETTER TEMPLATE MODAL ────────────────────────────────────────────────────
// letterType: 'layoff' | 'termination' | 'garnishment' | 'child_support'
// record: the separation or payment order object
// defaults: { companyName, companyAddress, preparedBy } pulled from org/user

export default function PeopleFlowModule({ orgId, C }) {
  const [emps, setEmps] = useState([])
  const [disc, setDisc] = useState([])
  const [separations, setSeparations] = useState([])
  const [reports, setReports] = useState([])
  const [injuries, setInjuries] = useState([])
  const [onb, setOnb] = useState({})
  const [docs, setDocs] = useState({})
  const [view, setView] = useState('dashboard')
  const [sel, setSel] = useState(null)
  const [mod, setMod] = useState(null)
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userEmpRecord, setUserEmpRecord] = useState(null)
  const [xJobs, setXJobs] = useState({active:0,waiting:0,rush:0,overdue:0})
  const [xTasks, setXTasks] = useState({open:0,overdue:0,started:0})
  const [xMoney, setXMoney] = useState({openTasks:0})
  const [xPaper, setXPaper] = useState({unacked:0,pushTitle:''})

  const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase())
  const isHR = HR_EMAILS.includes(userEmail.toLowerCase())
  const isManager = userEmpRecord?.role === 'Manager' || userEmpRecord?.role === 'C-Level'
  const isLead = userEmpRecord?.role === 'Lead'
  const canManage = isAdmin || isManager

  // Build lookup: UUID → display name
  const empNameMap = {}
  emps.forEach(e => { empNameMap[e.id] = gn(e) })
  const resolveReportsTo = (val) => { if (!val) return '—'; return empNameMap[val] || val }

  // Get managers/C-Level/Lead for dropdown
  const managerOptions = emps.filter(e => e.role === 'Manager' || e.role === 'C-Level' || e.role === 'Lead')

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }
  const go = v => { setView(v); setSel(null); setMod(null) }

  // Get current user email on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  // Set user's own employee record once emps + email are loaded
  useEffect(() => {
    if (userEmail && emps.length > 0) {
      const me = emps.find(e => e.email?.toLowerCase() === userEmail.toLowerCase())
      setUserEmpRecord(me || null)
    }
  }, [userEmail, emps])

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      const [eR, dR, oR, dcR, rR, sR, iR] = await Promise.all([
        supabase.from('employees').select('*').eq('org_id', orgId),
        supabase.from('disciplines').select('*').eq('org_id', orgId),
        supabase.from('onboarding').select('*').eq('org_id', orgId),
        supabase.from('documents').select('*').eq('org_id', orgId),
        supabase.from('workplace_reports').select('*').eq('org_id', orgId),
        supabase.from('separations').select('*').eq('org_id', orgId),
        supabase.from('injuries').select('*').eq('org_id', orgId)
      ])
      setEmps(eR.data||[])
      setDisc(dR.data||[])
      setSeparations(sR.data||[])
      setInjuries(iR.data||[])
      const om={}; (oR.data||[]).forEach(r=>{if(!om[r.employee_id])om[r.employee_id]={};om[r.employee_id][r.step_id]={completed:r.completed,completed_date:r.completed_date||null,row_id:r.id}}); setOnb(om)
      const dm={}; (dcR.data||[]).forEach(r=>{if(!dm[r.employee_id])dm[r.employee_id]={};dm[r.employee_id][r.doc_id]={received:r.received,received_date:r.received_date||null,file_url:r.file_url||null,row_id:r.id}}); setDocs(dm)
      setReports(rR.data||[])
    }
    load()
  }, [orgId])

  useEffect(() => {
    if (!orgId || !userEmail) return
    const loadCross = async () => {
      const now = new Date().toISOString()
      const [jobsR, tasksR, moneyR, paperR, acksR] = await Promise.all([
        supabase.from('job_sleeves').select('id,status,is_rush,due_date').in('status',['active','waiting']),
        supabase.from('tasks').select('id,is_complete,due_date,priority').eq('org_id',orgId).eq('is_complete',false),
        supabase.from('moneyflow_tasks').select('id,status').eq('org_id',orgId).neq('status','complete'),
        supabase.from('policy_pushes').select('id,title,created_at').eq('org_id',orgId).order('created_at',{ascending:false}).limit(1),
        supabase.from('push_acknowledgments').select('id,status,push_id').eq('org_id',orgId).eq('user_email',userEmail.toLowerCase())
      ])
      const jobs = jobsR.data || []
      const overdueJobs = jobs.filter(j=>j.due_date && new Date(j.due_date)<new Date())
      setXJobs({active:jobs.filter(j=>j.status==='active').length,waiting:jobs.filter(j=>j.status==='waiting').length,rush:jobs.filter(j=>j.is_rush).length,overdue:overdueJobs.length})
      const tasks = tasksR.data || []
      const overdueTasks = tasks.filter(t=>t.due_date && new Date(t.due_date)<new Date())
      setXTasks({open:tasks.length,overdue:overdueTasks.length,started:tasks.filter(t=>t.priority==='high').length})
      setXMoney({openTasks:(moneyR.data||[]).length})
      const latestPush = (paperR.data||[])[0]
      const acks = acksR.data || []
      const unacked = latestPush ? (acks.find(a=>a.push_id===latestPush.id && a.status==='acknowledged') ? 0 : 1) : 0
      setXPaper({unacked, pushTitle: latestPush ? latestPush.title : ''})
    }
    loadCross()
  }, [orgId, userEmail])

  const ac = emps.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive'&&e.status!=='laid_off')

  const saveEmp = async(emp)=>{
    const{id,...rest}=emp
    if(id){await supabase.from('employees').update({...rest,org_id:orgId}).eq('id',id);setEmps(p=>p.map(e=>e.id===id?{...e,...rest}:e))}
    else{const{data}=await supabase.from('employees').insert({...rest,org_id:orgId}).select().single();if(data)setEmps(p=>[...p,data])}
    sh('Employee saved ✓')
  }
  const saveDisc = async(d)=>{
    if(d.id){await supabase.from('disciplines').update(d).eq('id',d.id);setDisc(p=>p.map(x=>x.id===d.id?d:x))}
    else{
      const payload = {...d,org_id:orgId}
      delete payload.org_id_undefined
      console.log('DISCIPLINE INSERT PAYLOAD:', JSON.stringify(payload, null, 2))
      const{data,error}=await supabase.from('disciplines').insert(payload).select().single()
      console.log('DISCIPLINE INSERT RESULT:', {data, error})
      if(error){sh('ERROR: '+error.message);return}
      if(data)setDisc(p=>[...p,data])
      // ── Flip employee status based on discipline type ──
      if(d.employee_id){
        if(d.type==='termination'){
          await supabase.from('employees').update({status:'Inactive'}).eq('id',d.employee_id)
          setEmps(p=>p.map(e=>e.id===d.employee_id?{...e,status:'Inactive'}:e))
        } else if(d.type==='reinstatement'){
          await supabase.from('employees').update({status:'probation'}).eq('id',d.employee_id)
          setEmps(p=>p.map(e=>e.id===d.employee_id?{...e,status:'probation'}:e))
        }
      }
    }
    sh('Record saved ✓')
  }
  const saveReport = async(r)=>{
    if(r.id){
      await supabase.from('workplace_reports').update(r).eq('id',r.id)
      setReports(p=>p.map(x=>x.id===r.id?{...r}:x))
    } else {
      const{data}=await supabase.from('workplace_reports').insert({...r,org_id:orgId}).select().single()
      if(data) setReports(p=>[...p,data])
    }
    sh('Report saved ✓')
  }
  const saveSeparation = async(s)=>{
    if(s.id){
      const{id,...rest}=s
      delete rest.created_at
      const{error}=await supabase.from('separations').update(rest).eq('id',id)
      if(error){sh('ERROR: '+error.message);return}
      setSeparations(p=>p.map(x=>x.id===id?{...x,...rest}:x))
    } else {
      const payload={...s,org_id:orgId}
      const{data,error}=await supabase.from('separations').insert(payload).select().single()
      if(error){sh('ERROR: '+error.message);return}
      if(data) setSeparations(p=>[...p,data])
    }
    sh('Separation saved ✓')
  }
  const recallEmployee = async(sep)=>{
    const recallDate = new Date().toISOString().split('T')[0]
    // Update separation record
    await supabase.from('separations').update({status:'recalled',recall_date:recallDate}).eq('id',sep.id)
    setSeparations(p=>p.map(x=>x.id===sep.id?{...x,status:'recalled',recall_date:recallDate}:x))
    // Update employee status back to active and set recall_date
    if(sep.employee_id){
      await supabase.from('employees').update({status:'active',recall_date:recallDate}).eq('id',sep.employee_id)
      setEmps(p=>p.map(e=>e.id===sep.employee_id?{...e,status:'active',recall_date:recallDate}:e))
    }
    sh('Employee recalled ✓ — probation clock resumed')
  }
  // ── Confirm end of reinstatement probation → reverse last N disciplines ──
  const confirmProbationEnd = async(reinstDisc) => {
    if (!reinstDisc?.employee_id) return
    const reverseCount = reinstDisc.reverse_count || 2
    // Get all open discipline records for this employee, sorted newest first, excluding reinstatement itself
    const empDiscs = disc
      .filter(d => d.employee_id===reinstDisc.employee_id && (d.status||d.st)==='open' && d.type!=='reinstatement' && d.id!==reinstDisc.id)
      .sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))
    const toReverse = empDiscs.slice(0, reverseCount)
    for (const d of toReverse) {
      await supabase.from('disciplines').update({status:'reversed',reversed_by_reinstatement:reinstDisc.id}).eq('id',d.id)
      setDisc(p=>p.map(x=>x.id===d.id?{...x,status:'reversed',reversed_by_reinstatement:reinstDisc.id}:x))
    }
    // Close the reinstatement record and restore employee to active
    await supabase.from('disciplines').update({status:'closed'}).eq('id',reinstDisc.id)
    setDisc(p=>p.map(x=>x.id===reinstDisc.id?{...x,status:'closed'}:x))
    await supabase.from('employees').update({status:'Active'}).eq('id',reinstDisc.employee_id)
    setEmps(p=>p.map(e=>e.id===reinstDisc.employee_id?{...e,status:'Active'}:e))
    sh('Probation confirmed -- ' + toReverse.length + ' discipline(s) reversed, employee restored to Active')
  }
  const toggleOnb = async(empId,stepId,curObj,dateOverride)=>{
    const cur = curObj?.completed || false
    const nv = !cur
    const today = new Date().toISOString().split('T')[0]
    const completed_date = nv ? (dateOverride || today) : null
    const existingId = curObj?.row_id
    if(existingId){
      await supabase.from('onboarding').update({completed:nv,completed_date}).eq('id',existingId)
    } else {
      const{data}=await supabase.from('onboarding').insert({employee_id:empId,step_id:stepId,completed:nv,completed_date,org_id:orgId}).select().single()
      if(data) {
        setOnb(p=>({...p,[empId]:{...(p[empId]||{}),[stepId]:{completed:nv,completed_date,row_id:data.id}}}))
        return
      }
    }
    setOnb(p=>({...p,[empId]:{...(p[empId]||{}),[stepId]:{...(p[empId]?.[stepId]||{}),completed:nv,completed_date}}}))
  }

  const updateOnbDate = async(empId,stepId,curObj,newDate)=>{
    const existingId = curObj?.row_id
    if(existingId){
      await supabase.from('onboarding').update({completed_date:newDate}).eq('id',existingId)
      setOnb(p=>({...p,[empId]:{...(p[empId]||{}),[stepId]:{...(p[empId]?.[stepId]||{}),completed_date:newDate}}}))
    }
  }

  const toggleDoc = async(empId,docId,curObj,opts={})=>{
    const cur = curObj?.received || false
    const nv = !cur
    const today = new Date().toISOString().split('T')[0]
    const received_date = nv ? (opts.received_date || today) : null
    const file_url = nv ? (opts.file_url || curObj?.file_url || null) : null
    const existingId = curObj?.row_id
    if(existingId){
      await supabase.from('documents').update({received:nv,received_date,file_url}).eq('id',existingId)
    } else {
      const{data}=await supabase.from('documents').insert({employee_id:empId,doc_id:docId,received:nv,received_date,file_url,org_id:orgId}).select().single()
      if(data){
        setDocs(p=>({...p,[empId]:{...(p[empId]||{}),[docId]:{received:nv,received_date,file_url,row_id:data.id}}}))
        return
      }
    }
    setDocs(p=>({...p,[empId]:{...(p[empId]||{}),[docId]:{...(p[empId]?.[docId]||{}),received:nv,received_date,file_url}}}))
  }

  const updateDocMeta = async(empId,docId,curObj,patch)=>{
    const existingId = curObj?.row_id
    if(existingId){
      await supabase.from('documents').update(patch).eq('id',existingId)
      setDocs(p=>({...p,[empId]:{...(p[empId]||{}),[docId]:{...(p[empId]?.[docId]||{}),...patch}}}))
    }
  }
  // ── Dashboard Stats (role-filtered) ──
  const sts={
    total:emps.length,active:ac.length,
    union:ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length,
    disc:disc.filter(d=>(d.status||d.st)==='open'&&isDiscActive(d)).length,
    newHires:ac.filter(e=>dbt(e.hire_date||td,td)<=90).length,
    openReports:reports.filter(r=>r.status!=='closed').length,
    laidOff:emps.filter(e=>e.status==='laid_off').length
  }

  // Role-filtered dashboard cards
  const getDashCards = () => {
    const cards = [
      {l:'Active',v:sts.active,c:C.gr,k:'active'},
      {l:'Union',v:sts.union,c:C.bl,k:'union'}
    ]
    if (canManage) {
      cards.push({l:'New Hires',v:sts.newHires,c:C.am,k:'newhires'})
      cards.push({l:'Open Disc',v:sts.disc,c:C.rd,k:'disc'})
      cards.push({l:'Reports',v:sts.openReports,c:'#8B5CF6',k:'reports'})
      if (sts.laidOff > 0) cards.push({l:'Laid Off',v:sts.laidOff,c:'#6366F1',k:'laidoff'})
    }
    return cards
  }

  const alerts=[]
  if (canManage) {
    ac.filter(e=>dbt(e.hire_date||td,td)<=90).forEach(e=>alerts.push({t:'New Hire',m:gn(e)+' -- Day '+dbt(e.hire_date||td,td),c:C.bl}))
    disc.filter(d=>(d.status||d.st)==='open'&&isDiscActive(d)).forEach(d=>alerts.push({t:'Open Disc',m:(d.employee_name||'Employee')+' -- '+d.type,c:C.am}))
    emps.filter(e=>e.status==='laid_off').forEach(e=>{
      const recallDate = e.expected_recall_date
      if (recallDate) {
        const daysUntil = Math.floor((new Date(recallDate) - new Date()) / (1000*60*60*24))
        alerts.push({t:'Recall Due',m:gn(e)+' -- '+(daysUntil <= 0 ? 'PAST DUE' : daysUntil + ' days'),c:'#6366F1'})
      } else {
        alerts.push({t:'Laid Off',m:gn(e)+' -- no recall date set',c:'#6366F1'})
      }
    })
    // ── Reinstatement probation ending alerts ──
    disc.filter(d=>d.type==='reinstatement'&&(d.status||d.st)==='open'&&d.probation_end_date).forEach(d=>{
      const daysUntil = Math.floor((new Date(d.probation_end_date) - new Date()) / (1000*60*60*24))
      if (daysUntil <= 7) {
        const emp = emps.find(e=>e.id===d.employee_id)
        const label = daysUntil <= 0 ? 'ENDED -- confirm reversal' : daysUntil+'d remaining'
        alerts.push({t:'Probation Ending',m:(emp?gn(emp):d.employee_name||'Employee')+' -- '+label,c:RC,reinstatementDisc:d})
      }
    })
  }
  // ── Tab Configuration (role-filtered) ──
  const ADMIN_TABS = ['onboard']
  const MANAGER_TABS = ['onboard']
  const allTabs=[
    {k:'dashboard',l:'Home',i:'◆'},
    {k:'employees',l:'Team',i:'◉'},
    {k:'orgchart',l:'Org',i:'⊞'},
    {k:'workplace',l:'HR Inbox',i:'⚡'},
    {k:'onboard',l:'Onboarding',i:'★'},
    {k:'resources',l:'Resources',i:'◇'}
  ]
  const canAccessTab = (tabKey) => {
    if (isAdmin) return true
    if (isManager && MANAGER_TABS.includes(tabKey)) return true
    if (ADMIN_TABS.includes(tabKey)) return false
    return true
  }

  return(<div>
    {/* Tab Nav */}
    <div style={{display:'flex',gap:2,flexWrap:'wrap',alignItems:'center',marginBottom:12,padding:'8px 0',borderBottom:'1px solid '+C.bdr}}>
      {allTabs.map(t=>{
        const allowed = canAccessTab(t.k)
        return <button key={t.k} onClick={()=>{if(allowed)go(t.k)}} style={{
          background:view===t.k&&allowed?C.gD:'transparent',
          border:'1px solid '+(view===t.k&&allowed?C.go:C.bdrF),
          color:view===t.k&&allowed?C.go:allowed?C.g:'rgba(128,128,128,0.3)',
          padding:'4px 8px',borderRadius:6,
          cursor:allowed?'pointer':'not-allowed',
          fontSize:10,fontWeight:500,display:'flex',alignItems:'center',gap:2,fontFamily:'inherit',
          opacity:allowed?1:0.4
        }}>{t.i} {t.l}</button>
      })}
    </div>

    {/* DASHBOARD */}
    {view==='dashboard'&&(()=>{
      const newHireList = ac.filter(e=>dbt(e.hire_date||td,td)<=90).sort((a,b)=>dbt(a.hire_date||td,td)-dbt(b.hire_date||td,td))
      const avgOnbPct = newHireList.length > 0 ? Math.round(newHireList.reduce((sum,e)=>{
        const ed = onb[e.id]||{}; return sum + Math.round(OBS.filter(s=>ed[s.id]?.completed).length/OBS.length*100)
      },0)/newHireList.length) : null

      const StatCard = ({label,value,sub,color,warn}) => (
        <Card C={C} style={{padding:'14px 16px',borderLeft: warn ? '3px solid '+C.rd : '3px solid transparent'}}>
          <div style={{fontSize:9,color:C.g,textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{label}</div>
          <div style={{fontSize:28,fontWeight:700,color:color||C.go,lineHeight:1}}>{value}</div>
          {sub && <div style={{fontSize:10,color:C.g,marginTop:4}}>{sub}</div>}
        </Card>
      )

      return <div>
        <div style={{fontSize:11,color:C.g,marginBottom:14,fontWeight:500,textTransform:'uppercase',letterSpacing:1}}>{'FlowSuite — Operations Snapshot'}</div>

        {/* ── PEOPLE ── */}
        <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid '+C.bdr}}>{'◉ People'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
          <StatCard label={'Active'} value={ac.length} color={C.gr}/>
          <StatCard label={'Union'} value={ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length} color={C.bl}/>
          <StatCard label={'New Hires'} value={newHireList.length} sub={avgOnbPct!==null ? 'avg '+avgOnbPct+'% onboarded' : null} color={C.am}/>
          {emps.filter(e=>e.status==='laid_off').length > 0 && <StatCard label={'Laid Off'} value={emps.filter(e=>e.status==='laid_off').length} color={'#6366F1'}/>}
        </div>

        {/* ── SCAN FLOW ── */}
        <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid '+C.bdr}}>{'📦 ScanFlow — Jobs'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
          <StatCard label={'Active'} value={xJobs.active} color={C.gr}/>
          <StatCard label={'Waiting'} value={xJobs.waiting} color={C.am}/>
          <StatCard label={'Rush'} value={xJobs.rush} color={C.rd} warn={xJobs.rush>0}/>
          <StatCard label={'Overdue'} value={xJobs.overdue} color={C.rd} warn={xJobs.overdue>0}/>
        </div>

        {/* ── TASK FLOW ── */}
        <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid '+C.bdr}}>{'✅ TaskFlow — Work Items'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
          <StatCard label={'Open Tasks'} value={xTasks.open} color={C.bl}/>
          <StatCard label={'Overdue'} value={xTasks.overdue} color={C.rd} warn={xTasks.overdue>0}/>
        </div>

        {/* ── MONEY FLOW ── */}
        {canManage && <div>
          <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid '+C.bdr}}>{'💰 MoneyFlow — Action Items'}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
            <StatCard label={'Open Items'} value={xMoney.openTasks} color={xMoney.openTasks>0?C.am:C.gr} warn={xMoney.openTasks>0}/>
          </div>
        </div>}

        {/* ── PAPER FLOW ── */}
        {xPaper.unacked > 0 && <Card C={C} style={{marginBottom:16,padding:'14px 16px',borderLeft:'3px solid '+C.am}}>
          <div style={{fontSize:10,color:C.am,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{'📄 PaperFlow — Action Required'}</div>
          <div style={{fontSize:13,color:C.w,marginBottom:8}}>{'You have an unacknowledged policy update: '}<span style={{fontWeight:700}}>{xPaper.pushTitle||'Policy Update'}</span></div>
          <div style={{fontSize:11,color:C.g}}>{'Go to PaperFlow to review and acknowledge.'}</div>
        </Card>}

        {/* ── NEW HIRES DETAIL (admin/manager only) ── */}
        {canManage && newHireList.length > 0 && <div>
          <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid '+C.bdr}}>{'★ New Hire Progress'}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8,marginBottom:16}}>
            {newHireList.map(e=>{
              const day = dbt(e.hire_date||td,td)
              const pct = Math.min(100,Math.round(day/90*100))
              const barColor = pct>=100?C.gr:pct>=60?C.am:C.bl
              const onbDone = OBS.filter(s=>(onb[e.id]||{})[s.id]?.completed).length
              const onbPct = Math.round(onbDone/OBS.length*100)
              const onbColor = onbPct===100?C.gr:onbPct>=50?C.am:C.rd
              return <div key={e.id} style={{background:C.nL,borderRadius:8,padding:'10px 12px',border:'1px solid '+C.bdr}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:1}}>{gn(e)}</div>
                <div style={{fontSize:10,color:C.g,marginBottom:8}}>{e.role||'—'}{' · '}{e.dept||'—'}</div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:C.g,marginBottom:2}}>
                  <span>{'Probation'}</span><span style={{color:barColor,fontWeight:700}}>{'Day '+day+' / 90'}</span>
                </div>
                <div style={{height:3,borderRadius:99,background:C.bdr,marginBottom:6}}>
                  <div style={{height:'100%',borderRadius:99,background:barColor,width:pct+'%'}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:C.g,marginBottom:2}}>
                  <span>{'Onboarding'}</span><span style={{color:onbColor,fontWeight:700}}>{onbPct+'%'}</span>
                </div>
                <div style={{height:3,borderRadius:99,background:C.bdr}}>
                  <div style={{height:'100%',borderRadius:99,background:onbColor,width:onbPct+'%'}}/>
                </div>
              </div>
            })}
          </div>
        </div>}
      </div>
    })()}

    {/* TEAM */}
    {view==='employees'&&<TeamView emps={emps} ac={ac} sel={sel} setSel={setSel} mod={mod} setMod={setMod} saveEmp={saveEmp} C={C} isAdmin={isAdmin} isManager={isManager} isHR={isHR} userEmpRecord={userEmpRecord} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions} disc={disc} onb={onb}/>}

    {/* ORG CHART */}
    {view==='orgchart'&&<OrgChartView emps={emps} C={C}/>}

    {/* WORKPLACE (replaces Discipline) */}
    {view==='workplace'&&<WorkplaceView
      disc={disc} setDisc={setDisc} saveDisc={saveDisc}
      reports={reports} saveReport={saveReport} setReports={setReports}
      separations={separations} setSeparations={setSeparations} saveSeparation={saveSeparation} recallEmployee={recallEmployee}
      injuries={injuries} setInjuries={setInjuries}
      emps={emps} setEmps={setEmps} ac={ac} mod={mod} setMod={setMod} C={C}
      isAdmin={isAdmin} isHR={isHR} isManager={isManager}
      userEmail={userEmail} userEmpRecord={userEmpRecord} orgId={orgId}
    />}

    {/* ONBOARDING */}
    {view==='onboard'&&<OnbView ac={ac} onb={onb} docs={docs} toggleOnb={toggleOnb} toggleDoc={toggleDoc} updateOnbDate={updateOnbDate} updateDocMeta={updateDocMeta} orgId={orgId} C={C}/>}

    {/* UNION */}
    {view==='union'&&<UnionView ac={emps.filter(e=>e.status!=='terminated'&&e.status!=='inactive'&&e.status!=='Terminated'&&e.status!=='Inactive')} C={C}/>}

    {/* DOCUMENTS */}
    {view==='documents'&&<DocsView ac={ac} docs={docs} toggleDoc={toggleDoc} C={C}/>}

    {/* EMPLOYEE RESOURCES */}
    {view==='resources'&&<ResourcesView C={C} isAdmin={isAdmin} isManager={isManager} emps={emps} orgId={orgId} userEmail={userEmail}/>}

    {/* REPORTS */}
    {view==='reports'&&<RptView emps={emps} ac={ac} disc={disc} reports={reports} C={C}/>}

    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:C.go,color:C.bg,padding:'10px 18px',borderRadius:8,fontWeight:600,fontSize:13,zIndex:1e3}}>{toast}</div>}
  </div>)
}

// ═══════════════════════════════════════════
// ── TEAM VIEW ──
// ═══════════════════════════════════════════
function TeamView({emps,ac,sel,setSel,mod,setMod,saveEmp,C,isAdmin,isManager,isHR,userEmpRecord,resolveReportsTo,managerOptions,disc,onb}){
  const[filter,setFilter]=useState('')
  const[expandedId,setExpandedId]=useState(null)
  const[letterMod,setLetterMod]=useState(null)

  const handleConfirmStart = async (empId, startDate, seniorityDate) => {
    const emp = emps.find(e=>e.id===empId)
    if (!emp) return
    await saveEmp({...emp, start_date: startDate, seniority_date: seniorityDate, offer_status:'Accepted'})
    setLetterMod(null)
  }

  let visibleEmps = emps
  if (!isAdmin) {
    if ((isManager) && userEmpRecord) {
      const downline = getDownline(userEmpRecord.id, emps)
      const downlineIds = new Set(downline.map(e => e.id))
      downlineIds.add(userEmpRecord.id)
      visibleEmps = emps.filter(e => downlineIds.has(e.id))
    } else if (userEmpRecord) {
      visibleEmps = emps.filter(e => e.id === userEmpRecord.id)
    }
  }

  const filtered=visibleEmps.filter(e=>gn(e).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''))
  const activeVisible = filtered.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive')

  const readOnlyFields = [
    ['dept','Department'],['hire_date','Hire Date'],['role','Classification'],
    ['union_status','Union Status'],['email','Email'],['phone','Phone'],
    ['ec_name','Emergency Contact'],['ec_phone','Emergency Phone'],['reports_to','Reports To']
  ]

  const getOnbPct = (empId) => {
    const ed = onb[empId] || {}
    if (!OBS.length) return null
    const done = OBS.filter(s => ed[s.id]?.completed).length
    return Math.round(done / OBS.length * 100)
  }

  const getDiscCounts = (empId) => {
    const empDisc = disc.filter(d => d.employee_id === empId)
    const active = empDisc.filter(d => isDiscActive(d) && PROGRESSION_CHAIN.includes(d.type)).length
    return { total: empDisc.length, active }
  }

  const isPreHire = (e) => e.offer_status==='Pending' || !e.hire_date

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <h2 style={{margin:0,fontSize:18}}>{'Team ('+activeVisible.length+')'}</h2>
      {isAdmin&&<Btn small gold onClick={()=>{setSel(null);setMod('emp')}} C={C}>{'+ Add'}</Btn>}
    </div>

    {visibleEmps.length === 0 && !isAdmin && <Card C={C} style={{padding:20,textAlign:'center',color:C.g}}>
      <div style={{fontSize:13,marginBottom:4}}>{'Your account is not linked to an employee record yet.'}</div>
      <div style={{fontSize:11}}>{'Ask HR to make sure your login email matches your employee record.'}</div>
    </Card>}

    {visibleEmps.length > 0 && <input placeholder="Search team..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%',padding:'8px 12px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:8,color:C.w,fontSize:13,marginBottom:10,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}/>}

    {filtered.map(e=>{
      const isExpanded = expandedId === e.id
      const onbPct = getOnbPct(e.id)
      const {total:discTotal, active:discActive} = getDiscCounts(e.id)
      const st = e.status||'active'
      const statusColor = st==='Active'||st==='active'?C.gr:st==='Terminated'||st==='terminated'?C.rd:st==='laid_off'?'#6366F1':st==='probation'?C.am:C.am
      const statusLabel = st==='laid_off'?'Laid Off':st==='probation'?'Probation':st.charAt(0).toUpperCase()+st.slice(1)
      const onbPctColor = onbPct===null?C.g:onbPct===100?C.gr:onbPct>=50?C.am:C.rd
      const canSeeDisc = isAdmin||isHR||isManager
      const preHire = isPreHire(e)

      return <Card key={e.id} C={C} style={{marginBottom:8,padding:0,overflow:'hidden'}}>
        {/* ── Card Header ── */}
        <div
          onClick={()=>{
            if(isAdmin){setSel(e);setMod('emp')}
            else{setExpandedId(isExpanded?null:e.id)}
          }}
          style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',cursor:'pointer'}}
        >
          <div style={{minWidth:0,flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span style={{fontWeight:700,fontSize:14}}>{gn(e)}</span>
              {preHire && <span style={{fontSize:9,padding:'2px 6px',borderRadius:99,background:'rgba(245,158,11,0.15)',color:C.am,fontWeight:700,border:'1px solid rgba(245,158,11,0.3)'}}>{'PRE-HIRE'}</span>}
            </div>
            <div style={{fontSize:11,color:C.g,marginTop:1}}>{e.role||'—'}{' · '}{e.dept||e.department||'—'}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0,marginLeft:8}}>
            <Tag c={statusColor}>{statusLabel}</Tag>
            {canSeeDisc && onbPct !== null && <div style={{textAlign:'center',minWidth:36}}>
              <div style={{fontSize:13,fontWeight:700,color:onbPctColor}}>{onbPct+'%'}</div>
              <div style={{fontSize:8,color:C.g,textTransform:'uppercase'}}>{'Onb'}</div>
            </div>}
            {canSeeDisc && discActive > 0 && <div style={{textAlign:'center',minWidth:28}}>
              <div style={{fontSize:13,fontWeight:700,color:C.rd}}>{discActive}</div>
              <div style={{fontSize:8,color:C.g,textTransform:'uppercase'}}>{'Disc'}</div>
            </div>}
            {!isAdmin && <span style={{fontSize:10,color:C.g,marginLeft:2}}>{isExpanded?'▲':'▼'}</span>}
          </div>
        </div>

        {/* ── Expandable Panel (non-admin) ── */}
        {!isAdmin && isExpanded && <div style={{padding:'10px 14px',paddingTop:0,borderTop:'1px solid '+C.bdr}}>
          {onbPct !== null && <div style={{marginBottom:10,paddingTop:10}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:10,color:C.g}}>
              <span>{'Onboarding Progress'}</span><span style={{color:onbPctColor,fontWeight:700}}>{onbPct+'%'}</span>
            </div>
            <div style={{height:4,borderRadius:99,background:C.nL}}>
              <div style={{height:'100%',borderRadius:99,background:onbPctColor,width:onbPct+'%',transition:'width 0.3s'}}/>
            </div>
          </div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
            {readOnlyFields.map(([k,l])=>
              <div key={k} style={{fontSize:11}}>
                <span style={{color:C.g,textTransform:'uppercase',fontSize:9,display:'block'}}>{l}</span>
                <span style={{color:C.w}}>{k==='reports_to'?resolveReportsTo(e[k]):(e[k]||'—')}</span>
              </div>
            )}
          </div>
          {canSeeDisc && discTotal > 0 && (()=>{
            const empDisc = disc.filter(d=>d.employee_id===e.id).sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at))
            return <div style={{paddingTop:8,borderTop:'1px solid '+C.bdr}}>
              <div style={{fontSize:9,color:C.am,textTransform:'uppercase',fontWeight:700,marginBottom:4}}>
                {'Discipline History ('+empDisc.length+') · '+discActive+' active progressive'}
              </div>
              {empDisc.map((d,i)=>{
                const pdt = DISC_TYPES.find(t=>t.v===d.type)
                const active = isDiscActive(d)
                const isProgressive = PROGRESSION_CHAIN.includes(d.type)
                return <div key={i} style={{fontSize:10,padding:'2px 0',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:active||!isProgressive?1:0.5}}>
                  <span style={{display:'flex',alignItems:'center',gap:3}}>
                    <Tag c={pdt?.c||C.g}>{pdt?.l||d.type}</Tag>
                    {isProgressive && <span style={{fontSize:7,padding:'1px 4px',borderRadius:99,fontWeight:700,background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',color:active?'#22C55E':'#6B7280'}}>{active?'Active':'Retired'}</span>}
                  </span>
                  <span style={{color:C.g,fontSize:9}}>{fm(d.date||d.created_at)}</span>
                </div>
              })}
            </div>
          })()}
        </div>}

        {/* ── Pre-hire action buttons (admin only, no hire_date or Pending) ── */}
        {isAdmin && preHire && <div style={{display:'flex',gap:6,padding:'8px 14px',borderTop:'1px solid '+C.bdr,flexWrap:'wrap'}}>
          {(!e.offer_status || e.offer_status==='Pending') &&
            <Btn small gold onClick={ev=>{ev.stopPropagation();setLetterMod({type:'offer',emp:e})}} C={C}>{'📄 Send Offer'}</Btn>}
          {e.offer_status==='Pending' &&
            <Btn small onClick={ev=>{ev.stopPropagation();setLetterMod({type:'union',emp:e})}} C={C} style={{background:C.gr,color:'#fff',border:'none'}}>{'✓ Accept + Notify Union'}</Btn>}
        </div>}
        {isAdmin && e.offer_status==='Accepted' && e.seniority_date &&
          <div style={{fontSize:10,color:C.g,padding:'6px 14px',borderTop:'1px solid '+C.bdr}}>{'Seniority eligible: '}<span style={{color:C.gr,fontWeight:700}}>{fm(e.seniority_date)}</span></div>}

      </Card>
    })}

    {isAdmin&&mod==='emp'&&<EmpModal emp={sel} onSave={saveEmp} onClose={()=>setMod(null)} C={C} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions}/>}
    {letterMod?.type==='offer'&&<OfferLetterModal emp={letterMod.emp} onClose={()=>setLetterMod(null)} C={C}/>}
    {letterMod?.type==='union'&&<UnionNotificationModal emp={letterMod.emp} onClose={()=>setLetterMod(null)} onConfirmStart={(sd,sen)=>handleConfirmStart(letterMod.emp.id,sd,sen)} C={C}/>}
  </div>)
}
// ═══════════════════════════════════════════
// ── OFFER LETTER MODAL ──────────────────────
// ═══════════════════════════════════════════
function OfferLetterModal({emp, onClose, C}) {
  const today = new Date().toISOString().split('T')[0]
  const [f, setF] = useState({
    company: '[COMPANY NAME]',
    emp_name: gn(emp),
    role: emp.role || '',
    dept: emp.dept || emp.department || '',
    pay_rate: emp.rate || '',
    offer_date: emp.offer_date || today,
    start_date: emp.start_date || '',
    body: 'We are pleased to extend this offer of employment for the position of {role} in the {dept} department.\n\nYour starting pay rate will be {pay_rate} per hour.\n\nYour anticipated start date is {start_date}.\n\nThis offer is contingent upon successful completion of a background check and any other pre-employment requirements.\n\nPlease sign and return this letter to confirm your acceptance. This is an at-will employment offer.'
  })
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const resolvedBody = f.body
    .replace(/{role}/g, f.role)
    .replace(/{dept}/g, f.dept)
    .replace(/{pay_rate}/g, f.pay_rate ? '$'+f.pay_rate : '[PAY RATE]')
    .replace(/{start_date}/g, f.start_date ? fm(f.start_date) : '[START DATE]')

  const handleGenerate = () => {
    const html = buildOfferLetterHTML(f, resolvedBody, fm)
    generateLetterPDF(html, 'Offer Letter -- '+f.emp_name)
  }

  const inp = {width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:3}

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
      <div style={{background:C.bg2,borderRadius:12,padding:24,width:520,maxHeight:'85vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16}}>Offer Letter — {gn(emp)}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div><label style={lbl}>Company Name</label><input value={f.company} onChange={e=>up('company',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Employee Name</label><input value={f.emp_name} onChange={e=>up('emp_name',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Role / Classification</label><input value={f.role} onChange={e=>up('role',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Department</label><input value={f.dept} onChange={e=>up('dept',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Pay Rate ($/hr)</label><input value={f.pay_rate} onChange={e=>up('pay_rate',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Offer Date</label><input type="date" value={f.offer_date} onChange={e=>up('offer_date',e.target.value)} style={inp}/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Start Date</label><input type="date" value={f.start_date} onChange={e=>up('start_date',e.target.value)} style={inp}/></div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={lbl}>Letter Body — placeholders: {'{role}'} {'{dept}'} {'{pay_rate}'} {'{start_date}'}</label>
          <textarea value={f.body} onChange={e=>up('body',e.target.value)} rows={10} style={{...inp,resize:'vertical',lineHeight:1.6}}/>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
          <Btn gold small onClick={handleGenerate} C={C}>Generate PDF →</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// ── UNION NOTIFICATION MODAL ────────────────
// ═══════════════════════════════════════════
function UnionNotificationModal({emp, onClose, onConfirmStart, C}) {
  const [startDate, setStartDate] = useState(emp.start_date || '')
  const seniority = startDate ? addWorkingDays(startDate, 30) : null

  const [f, setF] = useState({
    company: '[COMPANY NAME]',
    emp_name: gn(emp),
    role: emp.role || '',
    dept: emp.dept || emp.department || '',
    pay_rate: emp.rate || '',
    union_status: emp.union_status || '',
    body: 'This letter serves as official notification that the above-referenced employee has accepted a position and will be joining our team.\n\nTheir 30-working-day at-will period concludes on {seniority_date}, at which point they will be eligible for union membership and seniority consideration per the terms of our collective bargaining agreement.\n\nPlease ensure a union card is made available to the employee at the appropriate time.\n\nThank you for your attention to this matter.'
  })
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const resolvedBody = f.body.replace(/{seniority_date}/g, seniority ? fm(seniority) : '[SENIORITY DATE]')

  const handleGenerate = () => {
    if (!startDate) { alert('Please enter a start date first.'); return }
    const html = buildUnionLetterHTML(f, startDate, seniority, resolvedBody, fm, UNION_CONTACTS)
    generateLetterPDF(html, 'Union Notification -- '+f.emp_name)
    if (onConfirmStart) onConfirmStart(startDate, seniority)
  }

  const inp = {width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:3}

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
      <div style={{background:C.bg2,borderRadius:12,padding:24,width:520,maxHeight:'85vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16}}>Union Notification — {gn(emp)}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        <div style={{background:C.nL,borderRadius:8,padding:12,marginBottom:14,border:'1px solid '+C.bdr}}>
          <div style={{fontSize:11,color:C.am,fontWeight:700,marginBottom:6}}>⚠ Confirm Start Date Before Generating</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={lbl}>Start Date</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inp}/></div>
            <div>
              <label style={lbl}>Seniority Date (auto)</label>
              <div style={{padding:'6px 8px',background:C.bg2,border:'1px solid '+C.bdr,borderRadius:6,fontSize:12,color:seniority?C.gr:C.g}}>
                {seniority ? fm(seniority) : 'Enter start date →'}
              </div>
            </div>
          </div>
          <div style={{fontSize:10,color:C.g,marginTop:6}}>30 working days · weekends + US federal holidays excluded</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div><label style={lbl}>Company Name</label><input value={f.company} onChange={e=>up('company',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Employee Name</label><input value={f.emp_name} onChange={e=>up('emp_name',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Role / Classification</label><input value={f.role} onChange={e=>up('role',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Department</label><input value={f.dept} onChange={e=>up('dept',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Pay Rate ($/hr)</label><input value={f.pay_rate} onChange={e=>up('pay_rate',e.target.value)} style={inp}/></div>
          <div><label style={lbl}>Union Status</label><input value={f.union_status} onChange={e=>up('union_status',e.target.value)} style={inp}/></div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={lbl}>Letter Body — placeholder: {'{seniority_date}'}</label>
          <textarea value={f.body} onChange={e=>up('body',e.target.value)} rows={8} style={{...inp,resize:'vertical',lineHeight:1.6}}/>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
          <Btn gold small onClick={handleGenerate} C={C}>Generate PDF + Confirm Accept →</Btn>
        </div>
      </div>
    </div>
  )
}

function EmpModal({emp,onSave,onClose,C,resolveReportsTo,managerOptions}){
  const[f,setF]=useState(emp||{status:'Active'})
  const up=(k,v)=>setF(p=>({...p,[k]:v}))
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}}>
    <div style={{background:C.bg2,borderRadius:12,padding:24,width:420,maxHeight:'80vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}><h3 style={{margin:0,fontSize:16}}>{emp?'Edit':'New'} Employee</h3><button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {EMP_FIELDS.map(([k,l])=><div key={k}><label style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{l}</label>
          {k==='role'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>{['','C-Level','Manager','Lead','Staff'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='dept'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>{[''].concat(DEPARTMENTS).map(s=><option key={s}>{s}</option>)}</select>
          :k==='status'?<select value={f[k]||'Active'} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['active','laid_off','on_leave','probation','terminated','inactive'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='union_status'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['','Union Active','Non-Union','1099','Probation'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='reports_to'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            <option value="">— None —</option>
            {managerOptions.map(m=><option key={m.id} value={m.id}>{gn(m)} ({m.role})</option>)}
          </select>
          :k==='offer_status'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['','Pending','Accepted','Declined'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='emp_code'?<input value={f[k]||''} readOnly style={{width:'100%',padding:'6px 8px',background:C.nL,border:'1px solid '+C.bdr,borderRadius:6,color:C.g,fontSize:12,boxSizing:'border-box',fontFamily:'inherit',cursor:'not-allowed'}}/>
          :<input value={f[k]||''} onChange={e=>up(k,e.target.value)} type={['hire_date','dob','seniority_date','layoff_date','expected_recall_date','offer_date','start_date'].includes(k)?'date':'text'} style={{width:'100%',padding:'6px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}}/>}
        </div>)}
      </div>
      <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}><Btn ghost small onClick={onClose} C={C}>Cancel</Btn><Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Save</Btn></div>
    </div></div>)
}

// ═══════════════════════════════════════════
// ── ORG TAB — Chart + Seniority toggle ──
// ═══════════════════════════════════════════
function OrgChartView({emps, C}){
  const [mode, setMode] = useState('chart')

  // ── Org chart helpers ──
  const empIds = new Set(emps.map(e=>e.id))
  const roots = emps.filter(e => !e.reports_to || !empIds.has(e.reports_to))
    .sort((a,b) => {
      const order = {'C-Level':0,'Manager':1,'Lead':2,'Staff':3}
      return (order[a.role]||3) - (order[b.role]||3)
    })

  const renderNode = (emp, depth=0) => {
    const rc = ROLE_COLORS[emp.role] || ROLE_COLORS['Staff']
    const directs = emps.filter(e => e.reports_to === emp.id)
      .sort((a,b) => {
        const order = {'C-Level':0,'Manager':1,'Lead':2,'Staff':3}
        return (order[a.role]||3) - (order[b.role]||3)
      })
    return (
      <div key={emp.id} style={{marginLeft: depth * 24, marginBottom: 4}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 12px',borderRadius:8,background:rc.bg,border:'1px solid '+rc.border,fontSize:12}}>
          <div style={{width:8,height:8,borderRadius:99,background:rc.border,flexShrink:0}}/>
          <div>
            <span style={{fontWeight:600,color:rc.text}}>{gn(emp)}</span>
            <span style={{color:rc.text,opacity:0.7,marginLeft:6,fontSize:10}}>{emp.role||'Staff'}{' • '}{emp.dept||'—'}</span>
          </div>
        </div>
        {directs.map(d => renderNode(d, depth+1))}
      </div>
    )
  }

  // ── Seniority list helpers ──
  const activeEmps = emps.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive')
  const byHireDate = [...activeEmps].sort((a,b)=>new Date(a.hire_date||'2099-01-01')-new Date(b.hire_date||'2099-01-01'))

  const btnStyle = (active) => ({
    padding:'5px 14px',borderRadius:6,fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer',
    background:active?C.gD:'transparent',
    border:'1px solid '+(active?C.go:C.bdrF),
    color:active?C.go:C.g
  })

  return(<div>
    {/* Toggle */}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0,fontSize:18}}>{mode==='chart'?'Organization Chart':'Seniority List'}</h2>
      <div style={{display:'flex',gap:4}}>
        <button style={btnStyle(mode==='chart')} onClick={()=>setMode('chart')}>{'⊞ Org Chart'}</button>
        <button style={btnStyle(mode==='seniority')} onClick={()=>setMode('seniority')}>{'★ Seniority'}</button>
      </div>
    </div>

    {/* ── ORG CHART ── */}
    {mode==='chart' && <div>
      <div style={{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap'}}>
        {Object.entries(ROLE_COLORS).map(([role,rc])=>(
          <div key={role} style={{display:'flex',alignItems:'center',gap:4,fontSize:10}}>
            <div style={{width:8,height:8,borderRadius:99,background:rc.border}}/>
            <span style={{color:C.g}}>{role}</span>
          </div>
        ))}
      </div>
      <Card C={C} style={{padding:16,overflowX:'auto'}}>
        {roots.length === 0
          ? <div style={{color:C.g,textAlign:'center',padding:20}}>{'No reporting structure found. Set "Reports To" on employee records.'}</div>
          : roots.map(r => renderNode(r, 0))
        }
      </Card>
    </div>}

    {/* ── SENIORITY LIST ── */}
    {mode==='seniority' && <div>
      <div style={{fontSize:11,color:C.g,marginBottom:12}}>{'All active employees sorted by hire date — earliest first.'}</div>
      <Card C={C} style={{padding:0,overflow:'hidden'}}>
        {byHireDate.map((e,i)=>{
          const rc = ROLE_COLORS[e.role] || ROLE_COLORS['Staff']
          const isUnion = e.union_status && e.union_status!=='Non-Union' && e.union_status!=='1099'
          return <div key={e.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'1px solid '+C.bdr,background:i===0?C.gD:'transparent'}}>
            <div style={{fontSize:13,fontWeight:700,color:i===0?C.go:C.g,minWidth:28,textAlign:'right'}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                {gn(e)}
                {i===0 && <span style={{fontSize:9,padding:'1px 6px',borderRadius:99,background:C.go,color:C.bg,fontWeight:700}}>{'TOP'}</span>}
                {isUnion && <span style={{fontSize:9,padding:'1px 6px',borderRadius:99,background:'rgba(59,130,246,0.15)',color:C.bl,border:'1px solid rgba(59,130,246,0.3)'}}>{'Union'}</span>}
              </div>
              <div style={{fontSize:10,color:C.g,marginTop:1}}>{e.role||'—'}{' · '}{e.dept||'—'}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:11,color:C.w,fontWeight:500}}>{e.hire_date ? new Date(e.hire_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</div>
              <div style={{fontSize:9,color:C.g,marginTop:1}}>{e.seniority_date ? 'Seniority: '+new Date(e.seniority_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'No seniority date'}</div>
            </div>
          </div>
        })}
      </Card>
    </div>}
  </div>)
}

// ═══════════════════════════════════════════
// ── UNION VIEW (sorted by seniority) ──
// ═══════════════════════════════════════════
function UnionView({ac, C}){
  const unionEmps = ac
    .filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099'&&e.union_status!=='Management')
    .sort((a,b) => new Date(a.hire_date||'2099-01-01') - new Date(b.hire_date||'2099-01-01'))

  const calcTenure = (hireDate) => {
    if (!hireDate) return '—'
    const days = dbt(hireDate, td)
    if (days < 365) return days+'d'
    const yrs = Math.floor(days / 365)
    const remaining = days % 365
    const mos = Math.floor(remaining / 30)
    return yrs+'y '+mos+'m'
  }

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:4}}>Union Seniority List ({unionEmps.length})</h2>
    <div style={{fontSize:11,color:C.g,marginBottom:12}}>Sorted by hire date (ascending). Actual seniority begins 30 working days after hire.</div>
    <Card C={C}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:'2px solid '+C.bdr}}>
              {['#','Name','Dept','Local','Hire Date','Tenure','Status'].map(h=>
                <th key={h} style={{textAlign:'left',padding:'8px',color:C.g,fontSize:10,textTransform:'uppercase',letterSpacing:0.5}}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {unionEmps.map((e,i)=>(
              <tr key={e.id} style={{borderBottom:'1px solid '+C.bdr}}>
                <td style={{padding:'8px',color:C.g,fontWeight:600,fontSize:11}}>{i+1}</td>
                <td style={{padding:'8px',fontWeight:500}}>{gn(e)}</td>
                <td style={{padding:'8px',color:C.g}}>{e.dept||'—'}</td>
                <td style={{padding:'8px'}}>{e.union_status}</td>
                <td style={{padding:'8px',color:C.g}}>{fm(e.hire_date)}</td>
                <td style={{padding:'8px',fontWeight:600,color:C.go}}>{calcTenure(e.hire_date)}</td>
                <td style={{padding:'8px'}}><Tag c={e.status==='Active'?C.gr:C.am}>{e.status}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unionEmps.length===0 && <div style={{textAlign:'center',color:C.g,padding:20}}>No union members found.</div>}
    </Card>
  </div>)
}

// ═══════════════════════════════════════════
// ── WORKPLACE VIEW (Reports + Discipline + Injuries) ──
// ═══════════════════════════════════════════════════════
function WorkplaceView({disc,setDisc,saveDisc,reports,saveReport,setReports,separations,setSeparations,saveSeparation,recallEmployee,injuries,setInjuries,emps,setEmps,ac,mod,setMod,C,isAdmin,isHR,isManager,userEmail,userEmpRecord,orgId}){
  const [subTab, setSubTab] = useState('reports')

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:8}}>Workplace</h2>
    <div style={{display:'flex',gap:2,marginBottom:16,flexWrap:'wrap'}}>
      {[{k:'reports',l:'Reports',i:'◉',show:true},{k:'discipline',l:'Formal Discipline',i:'⚡',show:isHR},{k:'separations',l:'Separations',i:'◇',show:isHR},{k:'injuries',l:'Injuries',i:'🩹',show:isHR}].map(t=>{
        if (!t.show) return null
        return <button key={t.k} onClick={()=>setSubTab(t.k)} style={{
          background:subTab===t.k?C.gD:'transparent',
          border:'1px solid '+(subTab===t.k?C.go:C.bdrF),
          color:subTab===t.k?C.go:C.g,
          padding:'6px 14px',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:'inherit'
        }}>{t.i} {t.l}</button>
      })}
    </div>

    {subTab==='reports'&&<ReportsSubView
      reports={reports} saveReport={saveReport} setReports={setReports}
      emps={emps} ac={ac} mod={mod} setMod={setMod} C={C}
      isAdmin={isAdmin} isHR={isHR} isManager={isManager}
      userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}

    {subTab==='discipline'&&isHR&&<DisciplineSubView
      disc={disc} setDisc={setDisc} saveDisc={saveDisc}
      emps={emps} ac={ac} mod={mod} setMod={setMod} C={C}
      userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}

    {subTab==='separations'&&isHR&&<SeparationsSubView
      separations={separations} setSeparations={setSeparations} saveSeparation={saveSeparation} recallEmployee={recallEmployee}
      emps={emps} setEmps={setEmps} ac={ac} disc={disc} mod={mod} setMod={setMod} C={C}
      userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}

    {subTab==='injuries'&&isHR&&<InjuriesSubView
      injuries={injuries} setInjuries={setInjuries}
      emps={emps} ac={ac} C={C}
      userEmail={userEmail} orgId={orgId}
    />}
  </div>)
}

// ── Injuries Sub-Tab (HR Only) ──
// ════════════════════════════════
function InjuriesSubView({injuries,setInjuries,emps,ac,C,userEmail,orgId}){
  const [showForm, setShowForm] = useState(false)
  const [viewRecord, setViewRecord] = useState(null)
  const [editRecord, setEditRecord] = useState(null)

  const empName = (id) => {
    const e = emps.find(x=>x.id===id)
    return e ? ((e.preferred_name||e.first_name||'')+ ' ' +e.last_name).trim() : '—'
  }

  const STATUS_COLORS = {open:'#EF4444', monitoring:'#F59E0B', closed:'#6B7280'}
  const OSHA_COLORS = {yes:'#EF4444', no:'#22C55E', tbd:'#F59E0B'}

  const sorted = [...injuries].sort((a,b)=>new Date(b.injury_date)-new Date(a.injury_date))

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:C.go}}>Injury Reports</div>
        <div style={{fontSize:12,color:C.g}}>HR only — workers' comp, OSHA, and return-to-work tracking</div>
      </div>
      <Btn onClick={()=>setShowForm(true)} C={C}>+ Report Injury</Btn>
    </div>

    {sorted.length===0&&<div style={{fontSize:12,color:C.g,padding:'20px 0',textAlign:'center'}}>No injury reports on file.</div>}

    {sorted.map(inj=>{
      const sc = STATUS_COLORS[inj.status]||'#6B7280'
      const oc = OSHA_COLORS[inj.osha_recordable]||'#F59E0B'
      return(
        <div key={inj.id} onClick={()=>setViewRecord(inj)} style={{
          background:C.bg,border:'1px solid '+C.bdrF,borderRadius:8,padding:'10px 14px',
          marginBottom:8,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'
        }}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:C.go,marginBottom:2}}>{empName(inj.employee_id)}</div>
            <div style={{fontSize:11,color:C.g}}>{inj.injury_date} · {inj.location||'Location not recorded'}</div>
            <div style={{fontSize:11,color:C.g,marginTop:2}}>{(inj.nature||'')}{inj.body_part?' · '+inj.body_part:''}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
            <Tag style={{background:sc+'22',color:sc,border:'1px solid '+sc+'44',fontSize:10}}>{(inj.status||'open').toUpperCase()}</Tag>
            <Tag style={{background:oc+'22',color:oc,border:'1px solid '+oc+'44',fontSize:10}}>OSHA: {(inj.osha_recordable||'tbd').toUpperCase()}</Tag>
            {inj.sfm_confirmation&&<Tag style={{background:'#3B82F622',color:'#3B82F6',border:'1px solid #3B82F644',fontSize:10}}>SFM ✓</Tag>}
          </div>
        </div>
      )
    })}

    {showForm&&<InjuryFormModal
      onSave={async(f)=>{
        const payload={...f,org_id:orgId,reported_by:userEmail,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
        const{data,error}=await supabase.from('injuries').insert(payload).select().single()
        if(!error&&data){setInjuries(p=>[...p,data]);setShowForm(false)}
      }}
      onClose={()=>setShowForm(false)}
      emps={ac} C={C} userEmail={userEmail}
    />}

    {viewRecord&&!editRecord&&<InjuryViewModal
      record={viewRecord}
      onClose={()=>setViewRecord(null)}
      onEdit={()=>setEditRecord(viewRecord)}
      empName={empName(viewRecord.employee_id)}
      C={C}
    />}

    {editRecord&&<InjuryFormModal
      record={editRecord}
      onSave={async(f)=>{
        const payload={...f,updated_at:new Date().toISOString()}
        const{error}=await supabase.from('injuries').update(payload).eq('id',editRecord.id)
        if(!error){setInjuries(p=>p.map(x=>x.id===editRecord.id?{...x,...payload}:x));setEditRecord(null);setViewRecord(null)}
      }}
      onClose={()=>{setEditRecord(null);setViewRecord(null)}}
      emps={ac} C={C} userEmail={userEmail}
    />}
  </div>)
}

// ── Injury Form Modal ──
function InjuryFormModal({record,onSave,onClose,emps,C,userEmail}){
  const blank={employee_id:'',injury_date:'',injury_time:'',location:'',description:'',body_part:'',nature:'',witness_names:'',immediate_action:'',treated_by:'none',medical_provider:'',sfm_report_method:'',sfm_confirmation:'',sfm_reported_date:'',sfm_reported_by:userEmail||'',osha_recordable:'tbd',osha_days_away:0,osha_days_restricted:0,osha_case_number:'',rtw_light_duty_offered:false,rtw_restrictions:'',rtw_date:'',rtw_full_duty_date:'',status:'open',notes:''}
  const [f,setF]=useState(record||blank)
  const upd=(k,v)=>setF(p=>({...p,[k]:v}))
  const lbl={fontSize:10,color:C.g,textTransform:'uppercase',fontWeight:700,marginBottom:3,marginTop:10,display:'block'}
  const inp={width:'100%',padding:'6px 8px',border:'1px solid '+C.bdrF,borderRadius:5,fontSize:12,background:C.bg,color:C.go,fontFamily:'inherit',boxSizing:'border-box'}
  const sel={...inp}

  return(<div style={{position:'fixed',inset:0,background:'#0008',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{background:C.bg,borderRadius:10,padding:20,width:'100%',maxWidth:600,maxHeight:'90vh',overflowY:'auto',border:'1px solid '+C.bdrF}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:C.go}}>🩹 {record?'Edit':'Report'} Injury</div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:C.g}}>✕</button>
      </div>

      <div style={{background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:6,padding:'8px 12px',fontSize:11,color:'#92400E',marginBottom:12}}>
        <b>SFM Work Injury Hotline: (855) 675-3501</b> · Report online at sfmic.com (policy # required) · Or email FirstReports@sfmic.com
      </div>

      <label style={lbl}>Employee</label>
      <select style={sel} value={f.employee_id} onChange={e=>upd('employee_id',e.target.value)}>
        <option value=''>— Select Employee —</option>
        {emps.map(e=><option key={e.id} value={e.id}>{((e.preferred_name||e.first_name||'')+' '+e.last_name).trim()}</option>)}
      </select>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={lbl}>Date of Injury</label><input style={inp} type='date' value={f.injury_date} onChange={e=>upd('injury_date',e.target.value)}/></div>
        <div><label style={lbl}>Time of Injury</label><input style={inp} type='time' value={f.injury_time} onChange={e=>upd('injury_time',e.target.value)}/></div>
      </div>

      <label style={lbl}>Location / Area</label>
      <input style={inp} value={f.location} onChange={e=>upd('location',e.target.value)} placeholder='e.g. Production floor, shipping dock'/>

      <label style={lbl}>Description of Injury</label>
      <textarea style={{...inp,minHeight:60,resize:'vertical'}} value={f.description} onChange={e=>upd('description',e.target.value)} placeholder='What happened? Be specific.'/>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={lbl}>Body Part Affected</label><input style={inp} value={f.body_part} onChange={e=>upd('body_part',e.target.value)} placeholder='e.g. Right wrist'/></div>
        <div><label style={lbl}>Nature of Injury</label><input style={inp} value={f.nature} onChange={e=>upd('nature',e.target.value)} placeholder='e.g. Laceration, strain'/></div>
      </div>

      <label style={lbl}>Witness Names</label>
      <input style={inp} value={f.witness_names} onChange={e=>upd('witness_names',e.target.value)} placeholder='Names of anyone who witnessed the injury'/>

      <label style={lbl}>Immediate Action Taken</label>
      <input style={inp} value={f.immediate_action} onChange={e=>upd('immediate_action',e.target.value)} placeholder='e.g. First aid applied, sent to clinic'/>

      <label style={lbl}>Treatment</label>
      <select style={sel} value={f.treated_by} onChange={e=>upd('treated_by',e.target.value)}>
        <option value='none'>No treatment needed</option>
        <option value='first_aid'>First Aid Only</option>
        <option value='clinic'>Clinic / Urgent Care</option>
        <option value='er'>Emergency Room</option>
      </select>

      {(f.treated_by==='clinic'||f.treated_by==='er')&&<>
        <label style={lbl}>Medical Provider / Facility</label>
        <input style={inp} value={f.medical_provider} onChange={e=>upd('medical_provider',e.target.value)} placeholder='Provider name and address'/>
      </>}

      <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginTop:16,marginBottom:4,borderTop:'1px solid '+C.bdrF,paddingTop:12}}>SFM / Workers' Comp</div>

      <label style={lbl}>How was SFM notified?</label>
      <select style={sel} value={f.sfm_report_method} onChange={e=>upd('sfm_report_method',e.target.value)}>
        <option value=''>— Not yet reported —</option>
        <option value='hotline'>Work Injury Hotline (855) 675-3501</option>
        <option value='online'>Online at sfmic.com</option>
        <option value='email'>Email — FirstReports@sfmic.com</option>
        <option value='na'>Not required (first aid only)</option>
      </select>

      {f.sfm_report_method&&f.sfm_report_method!=='na'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={lbl}>SFM Confirmation #</label><input style={inp} value={f.sfm_confirmation} onChange={e=>upd('sfm_confirmation',e.target.value)}/></div>
        <div><label style={lbl}>Date Reported to SFM</label><input style={inp} type='date' value={f.sfm_reported_date} onChange={e=>upd('sfm_reported_date',e.target.value)}/></div>
      </div>}

      <label style={lbl}>Reported to SFM by</label>
      <input style={inp} value={f.sfm_reported_by} onChange={e=>upd('sfm_reported_by',e.target.value)}/>

      <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginTop:16,marginBottom:4,borderTop:'1px solid '+C.bdrF,paddingTop:12}}>OSHA Recordkeeping</div>

      <label style={lbl}>OSHA Recordable?</label>
      <select style={sel} value={f.osha_recordable} onChange={e=>upd('osha_recordable',e.target.value)}>
        <option value='tbd'>TBD — Pending determination</option>
        <option value='yes'>Yes — Recordable</option>
        <option value='no'>No — Not recordable</option>
      </select>

      {f.osha_recordable==='yes'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        <div><label style={lbl}>Days Away from Work</label><input style={inp} type='number' min='0' value={f.osha_days_away} onChange={e=>upd('osha_days_away',parseInt(e.target.value)||0)}/></div>
        <div><label style={lbl}>Days Restricted</label><input style={inp} type='number' min='0' value={f.osha_days_restricted} onChange={e=>upd('osha_days_restricted',parseInt(e.target.value)||0)}/></div>
        <div><label style={lbl}>OSHA Case #</label><input style={inp} value={f.osha_case_number} onChange={e=>upd('osha_case_number',e.target.value)}/></div>
      </div>}

      <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginTop:16,marginBottom:4,borderTop:'1px solid '+C.bdrF,paddingTop:12}}>Return to Work</div>

      <label style={lbl}>Light Duty Offered?</label>
      <select style={sel} value={f.rtw_light_duty_offered?'yes':'no'} onChange={e=>upd('rtw_light_duty_offered',e.target.value==='yes')}>
        <option value='no'>No</option>
        <option value='yes'>Yes</option>
      </select>

      {f.rtw_light_duty_offered&&<>
        <label style={lbl}>Work Restrictions</label>
        <textarea style={{...inp,minHeight:48,resize:'vertical'}} value={f.rtw_restrictions} onChange={e=>upd('rtw_restrictions',e.target.value)} placeholder='Describe physician-ordered restrictions'/>
      </>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={lbl}>Return to Work Date</label><input style={inp} type='date' value={f.rtw_date} onChange={e=>upd('rtw_date',e.target.value)}/></div>
        <div><label style={lbl}>Full Duty Release Date</label><input style={inp} type='date' value={f.rtw_full_duty_date} onChange={e=>upd('rtw_full_duty_date',e.target.value)}/></div>
      </div>

      <label style={lbl}>Status</label>
      <select style={sel} value={f.status} onChange={e=>upd('status',e.target.value)}>
        <option value='open'>Open</option>
        <option value='monitoring'>Monitoring</option>
        <option value='closed'>Closed</option>
      </select>

      <label style={lbl}>Internal Notes</label>
      <textarea style={{...inp,minHeight:60,resize:'vertical'}} value={f.notes} onChange={e=>upd('notes',e.target.value)} placeholder='HR notes — not shared with employee'/>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
        <Btn onClick={onClose} C={C} style={{background:'transparent',color:C.g,border:'1px solid '+C.bdrF}}>Cancel</Btn>
        <Btn onClick={()=>{if(!f.employee_id||!f.injury_date){alert('Employee and injury date are required.');return}onSave(f)}} C={C}>Save Injury Report</Btn>
      </div>
    </div>
  </div>)
}

// ── Injury View Modal ──
function InjuryViewModal({record,onClose,onEdit,empName,C}){
  const r=record
  const row=(l,v)=>v?<div style={{marginBottom:6}}><span style={{fontSize:10,color:C.g,textTransform:'uppercase',fontWeight:700}}>{l}: </span><span style={{fontSize:12,color:C.go}}>{v}</span></div>:null
  const SC={open:'#EF4444',monitoring:'#F59E0B',closed:'#6B7280'}
  const OC={yes:'#EF4444',no:'#22C55E',tbd:'#F59E0B'}
  const sc=SC[r.status]||'#6B7280'
  const oc=OC[r.osha_recordable]||'#F59E0B'

  return(<div style={{position:'fixed',inset:0,background:'#0008',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{background:C.bg,borderRadius:10,padding:20,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',border:'1px solid '+C.bdrF}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:C.go}}>🩹 Injury Report</div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:C.g}}>✕</button>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <Tag style={{background:sc+'22',color:sc,border:'1px solid '+sc+'44'}}>{(r.status||'open').toUpperCase()}</Tag>
        <Tag style={{background:oc+'22',color:oc,border:'1px solid '+oc+'44'}}>OSHA: {(r.osha_recordable||'tbd').toUpperCase()}</Tag>
        {r.sfm_confirmation&&<Tag style={{background:'#3B82F622',color:'#3B82F6',border:'1px solid #3B82F644'}}>SFM ✓ {r.sfm_confirmation}</Tag>}
      </div>

      {row('Employee',empName)}
      {row('Date of Injury',r.injury_date+(r.injury_time?' at '+r.injury_time:''))}
      {row('Location',r.location)}
      {row('Description',r.description)}
      {row('Body Part',r.body_part)}
      {row('Nature',r.nature)}
      {row('Witnesses',r.witness_names)}
      {row('Immediate Action',r.immediate_action)}
      {row('Treatment',{none:'None required',first_aid:'First Aid Only',clinic:'Clinic/Urgent Care',er:'Emergency Room'}[r.treated_by]||r.treated_by)}
      {row('Medical Provider',r.medical_provider)}

      <div style={{borderTop:'1px solid '+C.bdrF,marginTop:10,paddingTop:10}}>
        <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginBottom:6}}>SFM / Workers' Comp</div>
        {row('Report Method',{hotline:'Work Injury Hotline',online:'Online (sfmic.com)',email:'Email (FirstReports@sfmic.com)',na:'Not required'}[r.sfm_report_method]||r.sfm_report_method)}
        {row('Confirmation #',r.sfm_confirmation)}
        {row('Reported Date',r.sfm_reported_date)}
        {row('Reported By',r.sfm_reported_by)}
      </div>

      <div style={{borderTop:'1px solid '+C.bdrF,marginTop:10,paddingTop:10}}>
        <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginBottom:6}}>OSHA</div>
        {row('Recordable',r.osha_recordable?.toUpperCase())}
        {r.osha_recordable==='yes'&&<>{row('Days Away',r.osha_days_away)}{row('Days Restricted',r.osha_days_restricted)}{row('Case #',r.osha_case_number)}</>}
      </div>

      <div style={{borderTop:'1px solid '+C.bdrF,marginTop:10,paddingTop:10}}>
        <div style={{fontSize:11,color:C.go,fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Return to Work</div>
        {row('Light Duty Offered',r.rtw_light_duty_offered?'Yes':'No')}
        {row('Restrictions',r.rtw_restrictions)}
        {row('RTW Date',r.rtw_date)}
        {row('Full Duty Date',r.rtw_full_duty_date)}
      </div>

      {r.notes&&<div style={{borderTop:'1px solid '+C.bdrF,marginTop:10,paddingTop:10}}>
        <div style={{fontSize:10,color:C.g,textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Internal Notes</div>
        <div style={{fontSize:12,color:C.go}}>{r.notes}</div>
      </div>}

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
        <Btn onClick={onClose} C={C} style={{background:'transparent',color:C.g,border:'1px solid '+C.bdrF}}>Close</Btn>
        <Btn onClick={onEdit} C={C}>Edit</Btn>
      </div>
    </div>
  </div>)
}

// ── Reports Sub-Tab ──
function ReportsSubView({reports,saveReport,setReports,emps,ac,mod,setMod,C,isAdmin,isHR,isManager,userEmail,userEmpRecord}){
  const [viewReport, setViewReport] = useState(null)

  // Filter reports based on role:
  // HR sees all. Managers see reports routed to them + own submissions. Staff sees own submissions only.
  const visibleReports = reports.filter(r => {
    if (isHR) return true
    if (isManager && userEmpRecord) {
      return r.routed_to === userEmpRecord.id || r.submitted_by_email?.toLowerCase() === userEmail.toLowerCase()
    }
    return r.submitted_by_email?.toLowerCase() === userEmail.toLowerCase()
  }).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))

  const updateStatus = async (report, newStatus) => {
    const updated = {...report, status: newStatus}
    await saveReport(updated)
    setViewReport(updated)
  }

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{fontSize:13,color:C.g}}>
        {isHR ? 'All workplace reports' : isManager ? 'Reports routed to you + your submissions' : 'Your submissions'}
      </div>
      <Btn small gold onClick={()=>setMod('report')} C={C}>+ New Report</Btn>
    </div>

    {visibleReports.map(r => {
      const rt = REPORT_TYPES.find(t=>t.v===r.report_type)
      const rs = REPORT_STATUSES.find(s=>s.v===r.status)
      const subjectEmp = emps.find(e=>e.id===r.subject_employee_id)
      return <Card key={r.id} C={C} style={{marginBottom:6,padding:'10px 14px',cursor:'pointer'}} onClick={()=>setViewReport(viewReport?.id===r.id?null:r)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:14}}>{rt?.i||'◉'}</span>
              <b style={{fontSize:13}}>{rt?.l||r.report_type}</b>
              <span style={{fontSize:11,color:C.g}}>re: {subjectEmp ? gn(subjectEmp) : (r.subject_name||'—')}</span>
            </div>
            <div style={{fontSize:11,color:C.g,marginTop:2}}>{r.description?.substring(0,80)}{(r.description?.length||0)>80?'...':''}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <Tag c={rs?.c||C.g}>{rs?.l||r.status}</Tag>
            <div style={{fontSize:9,color:C.g,marginTop:2}}>{fm(r.created_at)}</div>
          </div>
        </div>
        {viewReport?.id===r.id&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid '+C.bdr}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Submitted By</span><div>{r.submitted_by_name||r.submitted_by_email||'—'}</div></div>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Routed To</span><div>{r.routed_to ? (emps.find(e=>e.id===r.routed_to) ? gn(emps.find(e=>e.id===r.routed_to)) : r.routed_to) : '—'}</div></div>
            <div style={{fontSize:11,gridColumn:'1/-1'}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Full Description</span><div style={{whiteSpace:'pre-wrap',lineHeight:1.5}}>{r.description||'—'}</div></div>
            {(r.attachments||[]).length > 0 && <div style={{fontSize:11,gridColumn:'1/-1'}}>
              <span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Attachments</span>
              <div style={{display:'flex',flexDirection:'column',gap:3,marginTop:4}}>
                {(r.attachments||[]).map((att,i)=><div key={i} style={{fontSize:11,color:C.w}}>📎 {att.name||att}</div>)}
              </div>
            </div>}
          </div>
          {(isHR || (isManager && r.routed_to === userEmpRecord?.id)) && <div style={{display:'flex',gap:4,marginTop:8}}>
            {REPORT_STATUSES.filter(s=>s.v!==r.status).map(s=>
              <button key={s.v} onClick={(e)=>{e.stopPropagation();updateStatus(r,s.v)}} style={{
                padding:'4px 10px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',
                background:'transparent',border:'1px solid '+s.c,color:s.c
              }}>→ {s.l}</button>
            )}
          </div>}
        </div>}
      </Card>
    })}

    {visibleReports.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No reports found.</Card>}

    {mod==='report'&&<ReportModal
      onSave={saveReport} onClose={()=>setMod(null)} C={C}
      emps={ac} userEmail={userEmail} userEmpRecord={userEmpRecord}
      allEmps={emps}
    />}
  </div>)
}

function ReportModal({onSave,onClose,C,emps,userEmail,userEmpRecord,allEmps}){
  const [f, setF] = useState({
    status:'submitted',
    submitted_by_email: userEmail,
    submitted_by_name: userEmpRecord ? gn(userEmpRecord) : '',
    report_type:'concern',
    created_at: new Date().toISOString()
  })

  const handleSubjectChange = (empId) => {
    const subject = allEmps.find(e=>e.id===empId)
    const manager = subject ? findManager(empId, allEmps) : null
    setF(p=>({
      ...p,
      subject_employee_id: empId,
      subject_name: subject ? gn(subject) : '',
      routed_to: manager?.id || null,
      routed_to_name: manager ? gn(manager) : 'HR (no manager found)'
    }))
  }

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:440,maxHeight:'80vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
        <h3 style={{margin:0,fontSize:16}}>Submit Workplace Report</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button>
      </div>

      <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}}>Report Type</label>
      <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap'}}>
        {REPORT_TYPES.map(t=>
          <button key={t.v} onClick={()=>setF(p=>({...p,report_type:t.v}))} style={{
            padding:'6px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',
            background:f.report_type===t.v?t.c+'22':'transparent',
            border:'1px solid '+(f.report_type===t.v?t.c:C.bdr),
            color:f.report_type===t.v?t.c:C.g
          }}>{t.i} {t.l}</button>
        )}
      </div>

      <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}}>About (Employee)</label>
      <select value={f.subject_employee_id||''} onChange={e=>handleSubjectChange(e.target.value)} style={{width:'100%',padding:8,background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,marginBottom:4,fontFamily:'inherit'}}>
        <option value="">Select Employee</option>
        {emps.map(e=><option key={e.id} value={e.id}>{gn(e)} — {e.dept||'—'}</option>)}
      </select>
      {f.routed_to_name && <div style={{fontSize:10,color:C.g,marginBottom:10}}>Auto-routed to: <b style={{color:C.go}}>{f.routed_to_name}</b></div>}

      <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}}>Description</label>
      <textarea value={f.description||''} onChange={e=>setF(p=>({...p,description:e.target.value}))} rows={4} placeholder="Describe the concern, incident, safety issue, or praise..." style={{width:'100%',padding:8,background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,marginBottom:12,boxSizing:'border-box',fontFamily:'inherit',resize:'vertical'}}/>

      <div style={{marginBottom:12}}>
        <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:6}}>Attachments <span style={{fontWeight:400,textTransform:'none'}}>(doctor notes, supporting docs)</span></label>
        <div style={{border:'1px dashed '+C.bdr,borderRadius:8,padding:'10px 12px',background:'rgba(255,255,255,0.02)'}}>
          {(f.attachments||[]).length > 0 && <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
            {(f.attachments||[]).map((att,i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:'rgba(255,255,255,0.04)',borderRadius:4,border:'1px solid '+C.bdr}}>
                <span style={{fontSize:11}}>📎 {att.name}</span>
                <button onClick={()=>setF(p=>({...p,attachments:(p.attachments||[]).filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:14,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>}
          <label style={{display:'inline-flex',alignItems:'center',gap:6,color:C.go,fontSize:11,fontWeight:600,cursor:'pointer'}}>
            <span>+ Add File</span>
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" onChange={e=>{
              const files=Array.from(e.target.files).map(file=>({name:file.name,size:file.size,type:file.type}))
              setF(p=>({...p,attachments:[...(p.attachments||[]),...files]}))
              e.target.value=''
            }} style={{display:'none'}}/>
          </label>
        </div>
      </div>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
        <Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Submit Report</Btn>
      </div>
    </div>
  </div>)
}

// ── Formal Discipline Sub-Tab (HR Only) ──
function DisciplineSubView({disc,setDisc,saveDisc,emps,ac,mod,setMod,C,userEmail,userEmpRecord}){
  const [viewRecord, setViewRecord] = useState(null)
  const [editRecord, setEditRecord] = useState(null)
  const sorted=[...disc].sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at))

  const handleUpdate = async (updated) => {
    const {error} = await supabase.from('disciplines').update(updated).eq('id', updated.id)
    if (error) { console.error('Update error:', error); return }
    setDisc(p => p.map(x => x.id === updated.id ? {...x, ...updated} : x))
    setEditRecord(null)
    setViewRecord(null)
  }

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{fontSize:13,color:C.g}}>HR only — formal progressive discipline records</div>
      <Btn small gold onClick={()=>setMod('formaldisc')} C={C}>+ New Discipline</Btn>
    </div>

    {sorted.map(d=>{
      const dt=DISC_TYPES.find(t=>t.v===d.type)
      const active = isDiscActive(d)
      const discDate = d.date || d.created_at
      const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
      const daysRemaining = Math.max(0, 365 - daysSince)
      const isProgressive = PROGRESSION_CHAIN.includes(d.type)
      const isClosed = (d.status||d.st)==='closed'
      return <div key={d.id} onClick={()=>setViewRecord(d)} style={{cursor:'pointer'}}>
        <Card C={C} style={{marginBottom:6,padding:'10px 14px',opacity:isClosed?0.45:1,filter:isClosed?'grayscale(0.6)':'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <b style={{fontSize:13,textDecoration:isClosed?'line-through':'none',color:isClosed?C.g:C.w}}>{d.employee_name||'—'}</b>{' '}
            <Tag c={isClosed?'#6B7280':dt?dt.c:C.g}>{dt?dt.l:d.type}</Tag>
            {isClosed && <span style={{display:'inline-block',padding:'1px 6px',borderRadius:99,fontSize:8,fontWeight:700,marginLeft:4,background:'rgba(107,114,128,0.2)',color:'#9CA3AF',border:'1px solid #6B7280',letterSpacing:1}}>CLOSED — does not count</span>}
            {!isClosed && isProgressive && <span style={{
              display:'inline-block',padding:'1px 6px',borderRadius:99,fontSize:8,fontWeight:700,marginLeft:4,
              background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
              color:active?'#22C55E':'#6B7280',
              border:'1px solid '+(active?'#22C55E':'#6B7280')
            }}>{active ? 'Active - '+daysRemaining+'d left' : 'Retired'}</span>}
            <div style={{fontSize:11,color:C.g}}>{d.category||d.natures||'—'} — {(d.description||d.specifics||'—').substring(0,60)}{((d.description||d.specifics)?.length||0)>60?'...':''}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:10,color:C.g}}>{fm(d.date||d.created_at)}</div>
            <button onClick={async(e)=>{
              e.stopPropagation()
              const st=(d.status||d.st)==='open'?'closed':'open'
              await supabase.from('disciplines').update({status:st}).eq('id',d.id)
              setDisc(p=>p.map(x=>x.id===d.id?{...x,status:st,st}:x))
            }} style={{background:(d.status||d.st)==='open'?C.aD:C.grD,color:(d.status||d.st)==='open'?C.am:C.gr,border:'none',padding:'2px 8px',borderRadius:99,fontSize:9,cursor:'pointer',marginTop:2}}>
              {d.status||d.st||'open'}
            </button>
            {d.emp_signature && <div style={{fontSize:8,color:'#22C55E',marginTop:2}}>✓ Signed</div>}
            {d.type==='reinstatement'&&d.probation_end_date&&(()=>{
              const daysLeft=Math.floor((new Date(d.probation_end_date)-new Date())/(1000*60*60*24))
              return <div style={{fontSize:8,color:daysLeft<=0?'#22C55E':RC,marginTop:2,fontWeight:700}}>
                {daysLeft<=0?'✓ Probation ended':daysLeft+'d probation left'}
              </div>
            })()}
            {d.status==='reversed'&&<div style={{fontSize:8,color:'#6B7280',marginTop:2}}>↩ Reversed</div>}
          </div>
        </div>
      </Card></div>
    })}

    {sorted.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No discipline records.</Card>}

    {viewRecord && !editRecord && <DisciplineViewModal record={viewRecord} onClose={()=>setViewRecord(null)} C={C} disc={disc} onEdit={()=>setEditRecord(viewRecord)}/>}

    {editRecord && <EditDisciplineModal record={editRecord} onSave={handleUpdate} onClose={()=>{setEditRecord(null);setViewRecord(null)}} C={C} emps={ac} disc={disc} userEmail={userEmail} userEmpRecord={userEmpRecord}/>}

    {mod==='formaldisc'&&<FormalDisciplineModal
      onSave={saveDisc} onClose={()=>setMod(null)} C={C}
      emps={ac} disc={disc} userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}
  </div>)
}

// ── View Completed Discipline Record ──
function DisciplineViewModal({record,onClose,C,disc,onEdit}){
  const r = record
  const dt = DISC_TYPES.find(t=>t.v===r.type)
  const priorDisc = disc.filter(d => d.id !== r.id && (d.employee_id === r.employee_id || d.employee_name === r.employee_name))
    .sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))

  const fmSigTs = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  }

  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2,fontWeight:700}
  const val = {fontSize:13,color:C.w,marginBottom:10}
  const row = (label, value) => value ? (
    <div style={{marginBottom:10}}>
      <div style={lbl}>{label}</div>
      <div style={val}>{value}</div>
    </div>
  ) : null

  let atts = []
  try { atts = r.attachments ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments) : [] } catch(e) {}

  const printNotice = () => {
    const dt2 = DISC_TYPES.find(t=>t.v===r.type)
    const stepLabels2 = {'1':'Step 1 — Verbal Warning','2':'Step 2 — Written Warning','3':'Step 3 — Final Written Warning','4':'Step 4 — Suspension','5':'Step 5 — Termination'}
    const sigRow = (label, name, ts) => name ? (
      '<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:600;width:160px">' + label + '</td>' +
      '<td style="padding:8px 12px;border:1px solid #ddd;font-style:italic">' + name + '</td>' +
      '<td style="padding:8px 12px;border:1px solid #ddd;color:#666;font-size:11px">' + (ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '') + '</td></tr>'
    ) : ''
    const html = '<!DOCTYPE html><html><head><title>Discipline Notice — ' + (r.employee_name||'') + '</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:750px;margin:40px auto;color:#111;font-size:15px}' +
      'h1{font-size:21px;margin-bottom:4px}h2{font-size:16px;color:#555;margin:0 0 20px}' +
      '.header{border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;gap:24px}' +
      '.header-text{flex:1}.logo{height:70px;width:auto}' +
      '.section{margin-bottom:18px}.label{font-size:11px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:3px}' +
      '.value{font-size:15px;color:#111;white-space:pre-wrap}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}' +
      '.weingarten{background:#fffbeb;border:2px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:18px;font-size:14px}' +
      '.future{background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:12px 16px;margin-bottom:18px;font-size:14px}' +
      'table{width:100%;border-collapse:collapse;margin-top:4px}td{font-size:14px}' +
      '@media print{body{margin:20px}}</style></head><body>' +
      '<div class="header"><img class="logo" src="data:image/webp;base64,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" alt="Minuteman Press Uptown"/>' +
      '<div class="header-text"><h1>Unsatisfactory Performance and/or Conduct Action Notice</h1>' +
      '<h2>' + (dt2?.l||r.type||'') + (r.step ? ' · ' + (stepLabels2[r.step]||'Step '+r.step) : '') + '</h2></div></div>' +
      '<div class="grid">' +
      '<div><div class="label">Employee</div><div class="value">' + (r.employee_name||'—') + '</div></div>' +
      '<div><div class="label">Date</div><div class="value">' + (r.date ? new Date(r.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—') + '</div></div>' +
      '<div><div class="label">Prepared By</div><div class="value">' + (r.prepared_by||'—') + '</div></div>' +
      (r.suspension_return_date ? '<div><div class="label">Return to Work Date</div><div class="value">' + new Date(r.suspension_return_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div></div>' : '') +
      '</div>' +
      (r.weingarten_offered||r.weingarten_rep_requested ? '<div class="weingarten">⚖ Weingarten rights offered' + (r.weingarten_rep_requested ? ' · Rep requested' + (r.weingarten_rep_name ? ': ' + r.weingarten_rep_name : '') : '') + '</div>' : '') +
      (r.natures ? '<div class="section"><div class="label">Nature of Incident</div><div class="value">' + r.natures + '</div></div>' : '') +
      (r.specifics ? '<div class="section"><div class="label">Specifics</div><div class="value">' + r.specifics + '</div></div>' : '') +
      (r.current_action ? '<div class="section"><div class="label">Current Disciplinary Action</div><div class="value">' + r.current_action + '</div></div>' : '') +
      (r.employee_comments ? '<div class="section"><div class="label">Employee Comments</div><div class="value">' + r.employee_comments + '</div></div>' : '') +
      '<div class="future">If performance does not improve, it may result in further disciplinary action, up to and including termination of employment.<br><br><em>My signature below signifies that I have read and understand the above report.</em></div>' +
      '<div class="section"><div class="label">Signatures</div>' +
      '<table>' + sigRow('Employee', r.emp_signature, r.emp_sig_date) + sigRow('Employer', r.employer_signature, r.sup_sig_date) + sigRow('Witness', r.witness_name, r.witness_sig_date) + '</table></div>' +
      '<script>window.onload=()=>window.print()<\/script></body></html>'
    const w = window.open('','_blank')
    w.document.write(html)
    w.document.close()
  }

  const printSummary = () => {
    const empDisc = [...disc].filter(d => d.employee_id === r.employee_id || d.employee_name === r.employee_name)
      .sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))
    const rows = empDisc.map(d => {
      const pdt = DISC_TYPES.find(t=>t.v===d.type)
      const isCl = (d.status||d.st)==='closed'
      const discDate = d.date || d.created_at
      const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
      const daysLeft = Math.max(0, 365 - daysSince)
      const activeStr = isCl ? 'Closed' : isDiscActive(d) ? 'Active (' + daysLeft + 'd left)' : 'Retired'
      return '<tr style="opacity:' + (isCl?'0.5':'1') + '">' +
        '<td style="padding:7px 10px;border:1px solid #ddd">' + (d.date ? new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-weight:600">' + (pdt?.l||d.type||'—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-size:11px">' + (d.natures||d.category||'—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-size:11px;color:#555">' + activeStr + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-size:11px">' + (d.prepared_by||'—') + '</td></tr>'
    }).join('')
    const activeCount = empDisc.filter(d => (d.status||d.st)!=='closed' && isDiscActive(d) && PROGRESSION_CHAIN.includes(d.type)).length
    const html = '<!DOCTYPE html><html><head><title>Discipline Summary — ' + (r.employee_name||'') + '</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:15px}' +
      'h1{font-size:21px;margin-bottom:4px}.header{border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;gap:24px}' +
      '.header-text{flex:1}.logo{height:70px;width:auto}' +
      'table{width:100%;border-collapse:collapse}th{background:#111;color:#fff;padding:10px 12px;text-align:left;font-size:13px;text-transform:uppercase}' +
      'td{font-size:14px;padding:9px 10px}' +
      '.stat{display:inline-block;padding:8px 16px;border-radius:6px;font-weight:700;font-size:15px;margin-right:10px;margin-bottom:18px}' +
      '@media print{body{margin:20px}}</style></head><body>' +
      '<div class="header"><img class="logo" src="data:image/webp;base64,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" alt="Minuteman Press Uptown"/>' +
      '<div class="header-text"><h1>Discipline History Summary</h1>' +
      '<div style="font-size:16px;font-weight:700;margin:4px 0">' + (r.employee_name||'—') + '</div>' +
      '<div style="font-size:13px;color:#888">Printed ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div></div></div>' +
      '<div><span class="stat" style="background:#fee2e2;color:#991b1b">' + empDisc.length + ' Total Records</span>' +
      '<span class="stat" style="background:#fef3c7;color:#92400e">' + activeCount + ' Active Progressive</span></div>' +
      '<table><thead><tr><th>Date</th><th>Type</th><th>Nature</th><th>Status</th><th>Prepared By</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<script>window.onload=()=>window.print()<\/script></body></html>'
    const w = window.open('','_blank')
    w.document.write(html)
    w.document.close()
  }

  const printCombined = () => {
    const dt2 = DISC_TYPES.find(t=>t.v===r.type)
    const stepLabels2 = {'1':'Step 1 — Verbal Warning','2':'Step 2 — Written Warning','3':'Step 3 — Final Written Warning','4':'Step 4 — Suspension','5':'Step 5 — Termination'}
    const logo = "data:image/webp;base64,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"
    const sigLine = (label) =>
      '<tr><td style="padding:16px 12px 4px;border-bottom:1px solid #ddd;font-size:12px;font-weight:600;color:#555;width:33%">' + label + '</td>' +
      '<td style="padding:16px 12px 4px;border-bottom:1px solid #ddd;width:40%">&nbsp;</td>' +
      '<td style="padding:16px 12px 4px;border-bottom:1px solid #ddd;font-size:11px;color:#888;width:27%">Date: _______________</td></tr>'
    const empDisc = [...disc].filter(d => d.employee_id === r.employee_id || d.employee_name === r.employee_name)
      .sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))
    const rows = empDisc.map(d => {
      const pdt = DISC_TYPES.find(t=>t.v===d.type)
      const isCl = (d.status||d.st)==='closed'
      const discDate = d.date || d.created_at
      const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
      const daysLeft = Math.max(0, 365 - daysSince)
      const activeStr = isCl ? 'Closed' : isDiscActive(d) ? 'Active (' + daysLeft + 'd left)' : 'Retired'
      return '<tr style="opacity:' + (isCl?'0.5':'1') + '">' +
        '<td style="padding:7px 10px;border:1px solid #ddd">' + (d.date ? new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-weight:600">' + (pdt?.l||d.type||'—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-size:12px">' + (d.natures||d.category||'—') + '</td>' +
        '<td style="padding:7px 10px;border:1px solid #ddd;font-size:12px;color:#555">' + activeStr + '</td></tr>'
    }).join('')
    const activeCount = empDisc.filter(d => (d.status||d.st)!=='closed' && isDiscActive(d) && PROGRESSION_CHAIN.includes(d.type)).length
    const futureAction = r.future_action || 'If Performance does not improve, it may result in further disciplinary action, up to and including termination of employment.'
    const html = '<!DOCTYPE html><html><head><title>HR Discipline Packet — ' + (r.employee_name||'') + '</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#111;font-size:15px}' +
      'h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#555;margin:0 0 16px}' +
      '.header{border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;gap:24px}' +
      '.header-text{flex:1}.logo{height:70px;width:auto}' +
      '.section{margin-bottom:16px}.label{font-size:11px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:3px}' +
      '.value{font-size:15px;color:#111;white-space:pre-wrap}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}' +
      '.weingarten{background:#fffbeb;border:2px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px}' +
      '.future{background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:12px 14px;margin-bottom:20px;font-size:14px}' +
      'table{width:100%;border-collapse:collapse;margin-top:4px}td{font-size:14px}' +
      '.sig-table td{padding:8px 12px;font-size:13px}' +
      '.page-break{page-break-before:always;padding-top:40px}' +
      '.stat{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;font-size:14px;margin-right:10px;margin-bottom:16px}' +
      'th{background:#111;color:#fff;padding:9px 10px;text-align:left;font-size:12px;text-transform:uppercase}' +
      '@media print{body{margin:20px}.no-print{display:none}}</style></head><body>' +
      '<div class="header"><img class="logo" src="' + logo + '" alt="Minuteman Press Uptown"/>' +
      '<div class="header-text"><h1>Unsatisfactory Performance and/or Conduct Action Notice</h1>' +
      '<h2>' + (dt2?.l||r.type||'') + (r.step ? ' · ' + (stepLabels2[r.step]||'Step '+r.step) : '') + '</h2></div></div>' +
      '<div class="grid">' +
      '<div><div class="label">Employee</div><div class="value">' + (r.employee_name||'—') + '</div></div>' +
      '<div><div class="label">Date</div><div class="value">' + (r.date ? new Date(r.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—') + '</div></div>' +
      '<div><div class="label">Prepared By</div><div class="value">' + (r.prepared_by||'—') + '</div></div>' +
      (r.suspension_return_date ? '<div><div class="label">Return to Work Date</div><div class="value">' + new Date(r.suspension_return_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div></div>' : '') +
      '</div>' +
      (r.weingarten_offered||r.weingarten_rep_requested ? '<div class="weingarten">⚖ Weingarten rights offered' + (r.weingarten_rep_requested ? ' · Rep requested' + (r.weingarten_rep_name ? ': ' + r.weingarten_rep_name : '') : '') + '</div>' : '') +
      (r.natures ? '<div class="section"><div class="label">Nature of Incident</div><div class="value">' + r.natures + '</div></div>' : '') +
      (r.specifics ? '<div class="section"><div class="label">Specifics</div><div class="value">' + r.specifics + '</div></div>' : '') +
      (r.current_action ? '<div class="section"><div class="label">Current Disciplinary Action</div><div class="value">' + r.current_action + '</div></div>' : '') +
      (r.employee_comments ? '<div class="section"><div class="label">Employee Comments</div><div class="value">' + r.employee_comments + '</div></div>' : '') +
      '<div class="future">' + futureAction + '<br><br><em>My signature below signifies that I have read and understand the above report.</em></div>' +
      '<div class="section"><div class="label">Signatures</div>' +
      '<table class="sig-table"><tbody>' + sigLine('Employee Signature') + sigLine('Employer / Supervisor') + sigLine('Witness (optional)') + '</tbody></table></div>' +
      '<div class="page-break">' +
      '<div class="header"><img class="logo" src="' + logo + '" alt="Minuteman Press Uptown"/>' +
      '<div class="header-text"><h1>Discipline History Summary</h1>' +
      '<div style="font-size:15px;font-weight:700;margin:4px 0">' + (r.employee_name||'—') + '</div>' +
      '<div style="font-size:12px;color:#888">Printed ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div></div></div>' +
      '<div><span class="stat" style="background:#fee2e2;color:#991b1b">' + empDisc.length + ' Total Records</span>' +
      '<span class="stat" style="background:#fef3c7;color:#92400e">' + activeCount + ' Active Progressive</span></div>' +
      '<table><thead><tr><th>Date</th><th>Type</th><th>Nature of Incident</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<script>window.onload=()=>window.print()<\/script></body></html>'
    const w = window.open('','_blank')
    w.document.write(html)
    w.document.close()
  }

  const stepLabels = {'1':'Step 1 — Verbal Warning','2':'Step 2 — Written Warning','3':'Step 3 — Final Written Warning','4':'Step 4 — Suspension','5':'Step 5 — Termination'}

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:C.go,textTransform:'uppercase',letterSpacing:2}}>Discipline Record</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>{r.employee_name||'—'}</h3>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18,flexShrink:0}}>✕</button>
      </div>

      {/* Type + Date + Step */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
        {dt && <Tag c={dt.c}>{dt.l}</Tag>}
        <span style={{fontSize:11,color:C.g}}>{r.date ? new Date(r.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span>
        {r.step && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'rgba(59,130,246,0.15)',color:'#3B82F6',border:'1px solid #3B82F6',fontWeight:700}}>{stepLabels[r.step]||'Step '+r.step}</span>}
        <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:700,
          background:(r.status||r.st)==='closed'?'rgba(107,114,128,0.15)':(r.status||r.st)==='open'?'rgba(245,158,11,0.15)':'rgba(107,114,128,0.15)',
          color:(r.status||r.st)==='closed'?'#6B7280':(r.status||r.st)==='open'?'#F59E0B':'#6B7280',
          border:'1px solid '+((r.status||r.st)==='closed'?'#6B7280':(r.status||r.st)==='open'?'#F59E0B':'#6B7280')
        }}>{(r.status||r.st||'open').toUpperCase()}</span>
      </div>

      {/* Weingarten */}
      {(r.weingarten_offered || r.weingarten_rep_requested) && <div style={{background:'#FFFBEB',border:'1px solid #F59E0B',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:11,color:'#92400E'}}>
        ⚖ Weingarten rights offered{r.weingarten_rep_requested ? ' · Rep requested' + (r.weingarten_rep_name ? ': '+r.weingarten_rep_name : '') : ''}
      </div>}

      {row('Prepared By', r.prepared_by)}
      {r.suspension_return_date && row('Suspension Return Date', new Date(r.suspension_return_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}
      {r.natures && row('Nature of Incident', r.natures)}
      {row('Specifics', r.specifics||r.description)}
      {row('Current Action', r.current_action)}
      {row('Employee Comments', r.employee_comments)}

      {/* Signatures */}
      {(r.emp_signature || r.employer_signature || r.witness_name) && <div style={{borderTop:'1px solid '+C.bdr,paddingTop:10,marginTop:4,marginBottom:12}}>
        <div style={{fontSize:10,color:C.g,textTransform:'uppercase',fontWeight:700,marginBottom:8}}>Signatures</div>
        {[
          {label:'Employee',name:r.emp_signature,ts:r.emp_sig_date},
          {label:'Employer',name:r.employer_signature,ts:r.sup_sig_date},
          {label:'Witness',name:r.witness_name,ts:r.witness_sig_date}
        ].filter(s=>s.name).map((s,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'rgba(34,197,94,0.05)',border:'1px solid #22C55E',borderRadius:6,marginBottom:4}}>
            <div>
              <div style={{fontSize:9,color:C.g,textTransform:'uppercase'}}>{s.label}</div>
              <div style={{fontSize:13,fontStyle:'italic',color:C.w}}>{s.name}</div>
            </div>
            {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
          </div>
        ))}
      </div>}

      {/* Attachments */}
      {atts.length > 0 && <div style={{borderTop:'1px solid '+C.bdr,paddingTop:10,marginBottom:12}}>
        <div style={{fontSize:10,color:C.g,textTransform:'uppercase',fontWeight:700,marginBottom:6}}>Attachments ({atts.length})</div>
        {atts.map((att,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',background:C.ch,borderRadius:4,border:'1px solid '+C.bdr,marginBottom:4}}>
            <span>📎</span>
            {att.url
              ? <a href={att.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.go,textDecoration:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name||'File'}</a>
              : <span style={{fontSize:11,color:C.w,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name||'File'}</span>}
          </div>
        ))}
      </div>}

      {/* Prior history */}
      {priorDisc.length > 0 && <div style={{borderTop:'1px solid '+C.bdr,paddingTop:10,marginBottom:12}}>
        <div style={{fontSize:10,color:C.am,textTransform:'uppercase',fontWeight:700,marginBottom:6}}>Prior Records ({priorDisc.length})</div>
        {priorDisc.map((d,i)=>{
          const pdt = DISC_TYPES.find(t=>t.v===d.type)
          const isCl = (d.status||d.st)==='closed'
          const isRev = d.status==='reversed'
          const active = isDiscActive(d)
          const discDate = d.date || d.created_at
          const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
          const daysLeft = Math.max(0, 365 - daysSince)
          const statusBadge = isCl
            ? {label:'CLOSED',bg:'rgba(107,114,128,0.15)',color:'#6B7280',border:'#6B7280'}
            : isRev
              ? {label:'REVERSED',bg:'rgba(107,114,128,0.1)',color:'#9CA3AF',border:'#9CA3AF'}
              : active
                ? {label:daysLeft+'d left',bg:'rgba(34,197,94,0.12)',color:'#22C55E',border:'#22C55E'}
                : {label:'RETIRED',bg:'rgba(107,114,128,0.1)',color:'#9CA3AF',border:'#9CA3AF'}
          return <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,padding:'5px 0',borderBottom:'1px solid '+C.bdr+'44',opacity:(isCl||isRev)?0.5:1}}>
            <span style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
              <Tag c={isCl||isRev?'#6B7280':pdt?.c||C.g}>{pdt?.l||d.type}</Tag>
              <span style={{color:C.g,fontSize:10}}>{d.natures||d.category||''}</span>
              <span style={{fontSize:8,padding:'1px 6px',borderRadius:99,fontWeight:700,background:statusBadge.bg,color:statusBadge.color,border:'1px solid '+statusBadge.border}}>{statusBadge.label}</span>
            </span>
            <span style={{color:C.g,fontSize:10,flexShrink:0,marginLeft:8}}>{d.date ? new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span>
          </div>
        })}
      </div>}

      <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6}}>
          <button onClick={printNotice} style={{fontSize:10,padding:'5px 12px',borderRadius:6,border:'1px solid '+C.bdr,background:'transparent',color:C.g,cursor:'pointer',fontFamily:'inherit'}}>🖨 Notice</button>
          <button onClick={printSummary} style={{fontSize:10,padding:'5px 12px',borderRadius:6,border:'1px solid '+C.bdr,background:'transparent',color:C.g,cursor:'pointer',fontFamily:'inherit'}}>📋 Summary</button>
          <button onClick={printCombined} style={{fontSize:10,padding:'5px 12px',borderRadius:6,border:'1px solid '+C.go,background:'transparent',color:C.go,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>📄 Full Packet</button>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn ghost small onClick={onClose} C={C}>Close</Btn>
          <Btn gold small onClick={onEdit} C={C}>Edit Record</Btn>
        </div>
      </div>
    </div>
  </div>)
}

// ── Formal Discipline Form Modal ──
function FormalDisciplineModal({onSave,onClose,C,emps,disc,userEmail,userEmpRecord}){
  const [f, setF] = useState({status:'open', date:td, weingarten_offered:false, weingarten_rep_requested:false,
    prepared_by: userEmpRecord ? gn(userEmpRecord) : (userEmail||''), prepared_by_email: userEmail || '',
    future_action:'If Performance doesn\'t improve, it may result in further disciplinary action, up to and including termination of employment.'
  })
  const [selNatures, setSelNatures] = useState([])
  const [priorDisc, setPriorDisc] = useState([])
  const [sigMode, setSigMode] = useState(null)
  const [sigName, setSigName] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const handleEmpChange = (empId) => {
    const emp = emps.find(e=>e.id===empId)
    up('employee_id', empId)
    up('employee_name', emp ? gn(emp) : '')
    // Get ALL prior records for this employee (active + retired)
    const allPrior = disc.filter(d => d.employee_id === empId || d.employee_name === gn(emp))
      .sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))
    setPriorDisc(allPrior)
    // Auto-suggest next progressive level based on ACTIVE records only
    if (empId) {
      const suggested = suggestNextLevel(empId, disc)
      up('type', suggested)
    }
  }

  const toggleNature = (n) => {
    setSelNatures(prev => prev.includes(n) ? prev.filter(x=>x!==n) : [...prev, n])
  }

  const applySignature = () => {
    if (!sigName.trim()) return
    const ts = new Date().toISOString()
    if (sigMode === 'employee') { up('emp_signature', sigName.trim()); up('emp_sig_date', ts) }
    else if (sigMode === 'employer') { up('employer_signature', sigName.trim()); up('sup_sig_date', ts) }
    else if (sigMode === 'witness') { up('witness_name', sigName.trim()); up('witness_sig_date', ts) }
    setSigName(''); setSigMode(null)
  }

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files)
    if (attachments.length + files.length > 7) { alert('Maximum 7 attachments'); return }
    setAttachments(prev => [...prev, ...files].slice(0, 7))
    e.target.value = ''
  }

  const removeFile = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setUploading(true)
    try {
      // Upload attachments to Supabase Storage
      const uploaded = []
      for (const file of attachments) {
        const ts = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = 'discipline/'+(f.employee_id || 'unknown')+'/'+ts+'_'+safeName
        const { data: upData, error: upErr } = await supabase.storage.from('flowsuite-files').upload(path, file)
        if (upErr) { console.error('Upload error:', upErr); continue }
        const { data: urlData } = supabase.storage.from('flowsuite-files').getPublicUrl(path)
        uploaded.push({ name: file.name, path, url: urlData?.publicUrl || path, size: file.size, type: file.type, uploaded_at: new Date().toISOString() })
      }
      const record = { ...f, natures: selNatures.join(', '), attachments: uploaded.length > 0 ? JSON.stringify(uploaded) : null, org_id: undefined }
      onSave(record)
      onClose()
    } catch (err) { console.error('Save error:', err) }
    setUploading(false)
  }

  const fmSigTs = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  }

  const inp = {width:'100%',padding:8,background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  // ── Signature Overlay ──
  if (sigMode) {
    const labels = {employee:'Employee Signature',employer:'Employer Signature',witness:'Witness Signature'}
    return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1001}}>
      <div style={{background:C.bg2,borderRadius:16,padding:32,width:420,border:'2px solid '+C.go,textAlign:'center'}}>
        <div style={{fontSize:10,color:C.am,textTransform:'uppercase',letterSpacing:2,marginBottom:8}}>Electronic Signature</div>
        <h3 style={{margin:'0 0 6px',fontSize:18,color:C.w}}>{labels[sigMode]}</h3>
        <div style={{fontSize:11,color:C.g,marginBottom:20,lineHeight:1.5}}>
          By typing your name below, you acknowledge this constitutes your electronic signature and has the same legal effect as a handwritten signature.
        </div>
        <input value={sigName} onChange={e=>setSigName(e.target.value)} placeholder="Type full legal name" autoFocus
          style={{...inp,fontSize:16,padding:12,textAlign:'center',marginBottom:16}}
          onKeyDown={e=>{if(e.key==='Enter')applySignature()}}/>
        <div style={{display:'flex',gap:8,justifyContent:'center'}}>
          <Btn ghost small onClick={()=>{setSigMode(null);setSigName('')}} C={C}>Cancel</Btn>
          <Btn gold small onClick={applySignature} C={C}>Apply Signature</Btn>
        </div>
      </div>
    </div>)
  }

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:C.go,textTransform:'uppercase',letterSpacing:2}}>Minuteman Press Uptown</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>Unsatisfactory Performance and/or Conduct Action Notice</h3>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18,flexShrink:0}}>✕</button>
      </div>

      {/* ── WEINGARTEN RIGHTS — TOP OF FORM ── */}
      <div style={{background:'#FFFBEB',border:'2px solid #F59E0B',borderRadius:8,padding:'12px 16px',marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:'#92400E',marginBottom:6}}>⚖ WEINGARTEN RIGHTS NOTICE</div>
        <div style={{fontSize:11,color:'#78350F',lineHeight:1.6,marginBottom:10}}>
          You have the right to request union representation during any investigatory interview that you reasonably believe may result in disciplinary action. If you request representation, the interview will be paused until a union representative is available.
        </div>
        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <label style={{fontSize:12,display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#92400E',fontWeight:600}}>
            <input type="checkbox" checked={f.weingarten_offered||false} onChange={e=>up('weingarten_offered',e.target.checked)}
              style={{width:16,height:16,accentColor:'#F59E0B'}}/> Rights Offered
          </label>
          <label style={{fontSize:12,display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#92400E',fontWeight:600}}>
            <input type="checkbox" checked={f.weingarten_rep_requested||false} onChange={e=>up('weingarten_rep_requested',e.target.checked)}
              style={{width:16,height:16,accentColor:'#F59E0B'}}/> Rep Requested
          </label>
          {f.weingarten_rep_requested && <input value={f.weingarten_rep_name||''} onChange={e=>up('weingarten_rep_name',e.target.value)} placeholder="Union Rep Name"
            style={{padding:'5px 10px',background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:4,fontSize:12,color:'#78350F',fontFamily:'inherit',flex:1,minWidth:140}}/>}
        </div>
      </div>

      {/* ── Employee / Date / Type / Prepared By ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div>
          <label style={lbl}>Employee Name</label>
          <select value={f.employee_id||''} onChange={e=>handleEmpChange(e.target.value)} style={inp}>
            <option value="">Select Employee</option>
            {emps.map(e=><option key={e.id} value={e.id}>{gn(e)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Today's Date</label>
          <input type="date" value={f.date||''} onChange={e=>up('date',e.target.value)} style={inp}/>
        </div>
        <div>
          <label style={lbl}>Type of Report</label>
          <select value={f.type||''} onChange={e=>up('type',e.target.value)} style={inp}>
            <option value="">Select Type</option>
            {DISC_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Current Step (Manual)</label>
          <select value={f.step||''} onChange={e=>up('step',e.target.value)} style={inp}>
            <option value="">-- Select Step --</option>
            <option value="1">Step 1 — Verbal Warning</option>
            <option value="2">Step 2 — Written Warning</option>
            <option value="3">Step 3 — Final Written Warning</option>
            <option value="4">Step 4 — Suspension</option>
            <option value="5">Step 5 — Termination</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Prepared By</label>
          <input value={f.prepared_by||''} readOnly style={{...inp,opacity:0.7,cursor:'default'}}/>
        </div>
        {f.type==='suspension' && <div>
          <label style={{...lbl,color:'#B91C1C'}}>Suspension Return Date</label>
          <input type="date" value={f.suspension_return_date||''} onChange={e=>up('suspension_return_date',e.target.value)} style={{...inp,borderColor:'#B91C1C'}}/>
        </div>}
      </div>

      {/* ── Prior History + Progression Suggestion ── */}
      {priorDisc.length > 0 && <>
        {/* Progression suggestion banner */}
        {f.employee_id && (() => {
          const activeRecs = getActiveProgressive(f.employee_id, disc)
          const suggested = suggestNextLevel(f.employee_id, disc)
          const sugDt = DISC_TYPES.find(t=>t.v===suggested)
          return <div style={{background:'rgba(59,130,246,0.1)',border:'1px solid #3B82F6',borderRadius:8,padding:'10px 14px',marginBottom:8}}>
            <div style={{fontSize:10,color:'#3B82F6',textTransform:'uppercase',fontWeight:700,marginBottom:3}}>Progressive Discipline Recommendation</div>
            <div style={{fontSize:12,color:C.w}}>
              {activeRecs.length === 0
                ? <span>No active progressive records — starting fresh at <b style={{color:sugDt?.c||'#3B82F6'}}>{sugDt?.l||suggested}</b></span>
                : <span>{activeRecs.length} active progressive record{activeRecs.length>1?'s':''} — suggested next step: <b style={{color:sugDt?.c||'#3B82F6'}}>{sugDt?.l||suggested}</b></span>
              }
            </div>
            <div style={{fontSize:9,color:C.g,marginTop:3}}>Records retire after 1 year from date. Only active progressive records count toward escalation.</div>
          </div>
        })()}
        <Card C={C} style={{marginBottom:12,padding:'8px 12px',background:C.aD,border:'1px solid '+C.am}}>
          <div style={{fontSize:10,color:C.am,textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Prior Discipline ({priorDisc.length})</div>
          {priorDisc.map((d,i)=>{
            const pdt=DISC_TYPES.find(t=>t.v===d.type)
            const active = isDiscActive(d)
            const discDate = d.date || d.created_at
            const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
            const daysLeft = Math.max(0, 365 - daysSince)
            return <div key={i} style={{fontSize:11,padding:'3px 0',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:active?1:0.5}}>
              <span style={{display:'flex',alignItems:'center',gap:4}}>
                <Tag c={pdt?.c||C.g}>{pdt?.l||d.type}</Tag>
                {d.natures||d.category||'—'}
                <span style={{fontSize:8,padding:'1px 5px',borderRadius:99,fontWeight:700,
                  background:(d.status||d.st)==='closed'?'rgba(107,114,128,0.15)':active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
                  color:(d.status||d.st)==='closed'?'#6B7280':active?'#22C55E':'#6B7280'
                }}>{(d.status||d.st)==='closed'?'0d / Expired':active?'Active - '+daysLeft+'d':'Retired'}</span>
              </span>
              <span style={{color:C.g}}>{fm(d.date||d.created_at)}</span>
            </div>
          })}
        </Card>
      </>}

      {/* ── Nature of Incident ── */}
      <label style={{...lbl,marginBottom:6}}>Nature of Incident <span style={{fontWeight:400,textTransform:'none'}}>(check all that apply)</span></label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
        {INCIDENT_NATURES.map(n=>(
          <button key={n} onClick={()=>toggleNature(n)} style={{
            padding:'6px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',textAlign:'left',
            background:selNatures.includes(n)?'#FEE2E2':'transparent',
            border:'1px solid '+(selNatures.includes(n)?'#DC2626':C.bdr),
            color:selNatures.includes(n)?'#DC2626':C.g
          }}>{selNatures.includes(n)?'☑':'☐'} {n}</button>
        ))}
      </div>

      {/* ── Specifics ── */}
      <label style={lbl}>Specifics of Incident <span style={{fontWeight:400,textTransform:'none'}}>(be as specific as possible)</span></label>
      <textarea value={f.specifics||''} onChange={e=>up('specifics',e.target.value)} rows={4} placeholder="Describe the specific incident(s)..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* ── Current Action ── */}
      <label style={lbl}>Current Disciplinary Action</label>
      <textarea value={f.current_action||''} onChange={e=>up('current_action',e.target.value)} rows={2} placeholder="e.g., Verbal Warning" style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* ── Last Chance Agreement Fields ── */}
      {f.type==='last_chance' && <div style={{background:'rgba(124,58,237,0.08)',border:'1px solid #7C3AED',borderRadius:8,padding:'12px 16px',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#7C3AED',marginBottom:8}}>Last Chance Agreement Terms</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div>
            <label style={{...lbl,color:'#7C3AED'}}>Start Date</label>
            <input type="date" value={f.lca_start_date||f.date||''} onChange={e=>up('lca_start_date',e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{...lbl,color:'#7C3AED'}}>Duration (Days)</label>
            <input type="number" value={f.lca_duration_days||60} onChange={e=>up('lca_duration_days',parseInt(e.target.value)||0)} style={inp} min="1" max="365"/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{...lbl,color:'#7C3AED'}}>Conditions / Terms</label>
            <textarea value={f.lca_terms||''} onChange={e=>up('lca_terms',e.target.value)} rows={3} placeholder="e.g., Perfect attendance and on-time punch-ins for 60 days. Any violation results in immediate termination." style={{...inp,resize:'vertical'}}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#7C3AED',fontWeight:600,cursor:'pointer'}}>
              <input type="checkbox" checked={f.lca_union_agreed||false} onChange={e=>up('lca_union_agreed',e.target.checked)} style={{width:16,height:16,accentColor:'#7C3AED'}}/>
              Union agreed to terms
            </label>
          </div>
        </div>
        <div style={{fontSize:9,color:C.g,marginTop:6}}>LCA clock freezes automatically during any layoff period and resumes on recall.</div>
      </div>}

      {/* ── Reinstatement w/ Conditions Fields ── */}
      {f.type==='reinstatement' && <div style={{background:'rgba(14,165,233,0.08)',border:'1px solid '+RC,borderRadius:8,padding:'12px 16px',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:RC,marginBottom:8}}>Reinstatement Terms</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div>
            <label style={{...lbl,color:RC}}>Reinstatement Date</label>
            <input type="date" value={f.reinstatement_date||f.date||''} onChange={e=>up('reinstatement_date',e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{...lbl,color:RC}}>Probation End Date</label>
            <input type="date" value={f.probation_end_date||''} onChange={e=>up('probation_end_date',e.target.value)} style={inp}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{...lbl,color:RC}}>Conditions / Terms</label>
            <textarea value={f.reinstatement_conditions||''} onChange={e=>up('reinstatement_conditions',e.target.value)} rows={3}
              placeholder="e.g., Employee is reinstated on a probationary basis. Attendance and punctuality will be monitored weekly."
              style={{...inp,resize:'vertical'}}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{...lbl,color:RC}}>Specific Violation Rules</label>
            <textarea value={f.reinstatement_rules||''} onChange={e=>up('reinstatement_rules',e.target.value)} rows={2}
              placeholder="e.g., Any single late punch-in during the probationary period will result in immediate termination."
              style={{...inp,resize:'vertical'}}/>
          </div>
          <div>
            <label style={{...lbl,color:RC}}>Disciplines to Reverse at End</label>
            <select value={f.reverse_count||2} onChange={e=>up('reverse_count',parseInt(e.target.value))} style={inp}>
              <option value={1}>Last 1 discipline</option>
              <option value={2}>Last 2 disciplines</option>
              <option value={3}>Last 3 disciplines</option>
            </select>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:RC,fontWeight:600,cursor:'pointer'}}>
              <input type="checkbox" checked={f.union_negotiated||false} onChange={e=>up('union_negotiated',e.target.checked)} style={{width:16,height:16,accentColor:RC}}/>
              Union negotiated
            </label>
          </div>
        </div>
        <div style={{fontSize:9,color:C.g,marginTop:6}}>
          When probation ends, you will be prompted to confirm reversal of the last {f.reverse_count||2} discipline record(s).
        </div>
      </div>}

      {/* ── Employee Comments ── */}
      <label style={lbl}>Employee's Comments</label>
      <textarea value={f.employee_comments||''} onChange={e=>up('employee_comments',e.target.value)} rows={2} placeholder="Employee's response or comments..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* ── Attachments (up to 7) ── */}
      <label style={{...lbl,marginBottom:6}}>Attachments <span style={{fontWeight:400,textTransform:'none'}}>({attachments.length}/7 — emails, documents, photos)</span></label>
      <div style={{border:'1px dashed '+C.bdr,borderRadius:8,padding:'12px 14px',marginBottom:12,background:C.nL}}>
        {attachments.length > 0 && <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
          {attachments.map((file,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:'1px solid '+C.bdr}}>
              <div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
                <span style={{fontSize:12}}>📎</span>
                <span style={{fontSize:11,color:C.w,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
                <span style={{fontSize:9,color:C.g,flexShrink:0}}>{(file.size/1024).toFixed(0)}KB</span>
              </div>
              <button onClick={()=>removeFile(i)} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:14,padding:'0 4px',flexShrink:0}}>×</button>
            </div>
          ))}
        </div>}
        {attachments.length < 7 && <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',cursor:'pointer',color:C.go,fontSize:11,fontWeight:600}}>
          <span>+ Add File{attachments.length > 0 ? 's' : ''}</span>
          <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.xlsx,.xls,.csv" onChange={handleFileAdd} style={{display:'none'}}/>
        </label>}
      </div>

      {/* ── Future Action Warning ── */}
      <label style={lbl}>Future Action if Unsatisfactory Performance Recurs</label>
      <textarea value={f.future_action||'If Performance doesn\'t improve, it may result in further disciplinary action, up to and including termination of employment.'} onChange={e=>up('future_action',e.target.value)} rows={3} style={{...inp,resize:'vertical',marginBottom:6}}/>
      <div style={{fontSize:10,color:C.g,marginBottom:14,fontStyle:'italic'}}>My signature below signifies that I have read and understand the above report.</div>

      {/* ── SIGNATURES — iPad Pass-Around ── */}
      <label style={{...lbl,marginBottom:8,fontSize:11}}>Signatures</label>
      <div style={{display:'grid',gap:8,marginBottom:16}}>
        {[
          {key:'employee',label:'Employee Signature',name:f.emp_signature,ts:f.emp_sig_date,
            clear:()=>{up('emp_signature','');up('emp_sig_date','')}},
          {key:'employer',label:'Employer Signature',name:f.employer_signature,ts:f.sup_sig_date,
            clear:()=>{up('employer_signature','');up('sup_sig_date','')}},
          {key:'witness',label:'Witness Signature',name:f.witness_name&&f.witness_sig_date?f.witness_name:null,ts:f.witness_sig_date,
            clear:()=>{up('witness_name','');up('witness_sig_date','')}}
        ].map((s,i)=>(
          <div key={i} style={{border:'1px solid '+(s.name?'#22C55E':C.bdr),borderRadius:8,padding:'10px 14px',background:s.name?'rgba(34,197,94,0.05)':'transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{s.label}</div>
                {s.name ? <div style={{fontSize:14,fontStyle:'italic',color:C.w,marginTop:2}}>{s.name}</div>
                  : <div style={{fontSize:11,color:C.g,marginTop:2}}>{s.key==='witness'?'Optional — tap to add':'Not yet signed'}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
                {!s.name ?
                  <button onClick={()=>setSigMode(s.key)} style={{background:s.key==='witness'?'transparent':C.go,color:s.key==='witness'?C.go:'#000',border:s.key==='witness'?'1px solid '+C.go:'none',padding:'5px 12px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginTop:2}}>Tap to Sign</button>
                  : <button onClick={s.clear} style={{background:'transparent',border:'1px solid '+C.bdr,color:C.g,padding:'3px 8px',borderRadius:4,fontSize:9,cursor:'pointer',fontFamily:'inherit',marginTop:2}}>Clear</button>
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
        <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
        <Btn gold small onClick={handleSave} C={C}>{uploading ? 'Saving...' : 'Save Record'}</Btn>
      </div>
    </div>
  </div>)
}

// ── Edit Existing Discipline Record ──
function EditDisciplineModal({record, onSave, onClose, C, emps, disc, userEmail, userEmpRecord}) {
  const [f, setF] = useState({...record})
  const [selNatures, setSelNatures] = useState(() => {
    if (!record.natures) return []
    return typeof record.natures === 'string' ? record.natures.split(', ').filter(Boolean) : record.natures
  })
  const [sigMode, setSigMode] = useState(null)
  const [sigName, setSigName] = useState('')
  const [existingAtts, setExistingAtts] = useState(() => {
    try { return record.attachments ? (typeof record.attachments === 'string' ? JSON.parse(record.attachments) : record.attachments) : [] } catch(e) { return [] }
  })
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const toggleNature = (n) => setSelNatures(prev => prev.includes(n) ? prev.filter(x=>x!==n) : [...prev, n])

  const applySignature = () => {
    if (!sigName.trim()) return
    const ts = new Date().toISOString()
    if (sigMode==='employee') { up('emp_signature',sigName.trim()); up('emp_sig_date',ts) }
    else if (sigMode==='employer') { up('employer_signature',sigName.trim()); up('sup_sig_date',ts) }
    else if (sigMode==='witness') { up('witness_name',sigName.trim()); up('witness_sig_date',ts) }
    setSigName(''); setSigMode(null)
  }

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files)
    if (existingAtts.length + attachments.length + files.length > 7) { alert('Maximum 7 attachments'); return }
    setAttachments(prev => [...prev, ...files].slice(0, 7))
    e.target.value = ''
  }
  const removeExistingAtt = (i) => setExistingAtts(prev => prev.filter((_,idx)=>idx!==i))
  const removeNewFile = (i) => setAttachments(prev => prev.filter((_,idx)=>idx!==i))

  const handleSave = async () => {
    setUploading(true)
    try {
      const uploaded = []
      for (const file of attachments) {
        const ts = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
        const path = 'discipline/'+(f.employee_id||'unknown')+'/'+ts+'_'+safeName
        const {data:upData,error:upErr} = await supabase.storage.from('flowsuite-files').upload(path,file)
        if (upErr) { console.error('Upload error:',upErr); continue }
        const {data:urlData} = supabase.storage.from('flowsuite-files').getPublicUrl(path)
        uploaded.push({name:file.name,path,url:urlData?.publicUrl||path,size:file.size,type:file.type,uploaded_at:new Date().toISOString()})
      }
      const allAtts = [...existingAtts, ...uploaded]
      const updated = {...f, natures:selNatures.join(', '), attachments:allAtts.length>0?JSON.stringify(allAtts):null}
      onSave(updated)
    } catch(err) { console.error('Save error:',err) }
    setUploading(false)
  }

  const fmSigTs = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  }

  const inp = {width:'100%',padding:8,background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  if (sigMode) {
    const labels = {employee:'Employee Signature',employer:'Employer Signature',witness:'Witness Signature'}
    return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1001}}>
      <div style={{background:C.bg2,borderRadius:16,padding:32,width:420,border:'2px solid '+C.go,textAlign:'center'}}>
        <div style={{fontSize:10,color:C.am,textTransform:'uppercase',letterSpacing:2,marginBottom:8}}>Electronic Signature</div>
        <h3 style={{margin:'0 0 6px',fontSize:18,color:C.w}}>{labels[sigMode]}</h3>
        <div style={{fontSize:11,color:C.g,marginBottom:20,lineHeight:1.5}}>By typing your name below, you acknowledge this constitutes your electronic signature and has the same legal effect as a handwritten signature.</div>
        <input value={sigName} onChange={e=>setSigName(e.target.value)} placeholder="Type full legal name" autoFocus
          style={{...inp,fontSize:16,padding:12,textAlign:'center',marginBottom:16}} onKeyDown={e=>{if(e.key==='Enter')applySignature()}}/>
        <div style={{display:'flex',gap:8,justifyContent:'center'}}>
          <Btn ghost small onClick={()=>{setSigMode(null);setSigName('')}} C={C}>Cancel</Btn>
          <Btn gold small onClick={applySignature} C={C}>Apply Signature</Btn>
        </div>
      </div>
    </div>)
  }

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:C.am,textTransform:'uppercase',letterSpacing:2}}>Editing Record</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>{f.employee_name||'Discipline Record'}</h3>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18,flexShrink:0}}>✕</button>
      </div>

      {/* Weingarten */}
      <div style={{background:'#FFFBEB',border:'2px solid #F59E0B',borderRadius:8,padding:'12px 16px',marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:'#92400E',marginBottom:6}}>⚖ WEINGARTEN RIGHTS NOTICE</div>
        <div style={{fontSize:11,color:'#78350F',lineHeight:1.6,marginBottom:10}}>You have the right to request union representation during any investigatory interview that you reasonably believe may result in disciplinary action.</div>
        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <label style={{fontSize:12,display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#92400E',fontWeight:600}}>
            <input type="checkbox" checked={f.weingarten_offered||false} onChange={e=>up('weingarten_offered',e.target.checked)} style={{width:16,height:16,accentColor:'#F59E0B'}}/> Rights Offered
          </label>
          <label style={{fontSize:12,display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#92400E',fontWeight:600}}>
            <input type="checkbox" checked={f.weingarten_rep_requested||false} onChange={e=>up('weingarten_rep_requested',e.target.checked)} style={{width:16,height:16,accentColor:'#F59E0B'}}/> Rep Requested
          </label>
          {f.weingarten_rep_requested && <input value={f.weingarten_rep_name||''} onChange={e=>up('weingarten_rep_name',e.target.value)} placeholder="Union Rep Name"
            style={{padding:'5px 10px',background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:4,fontSize:12,color:'#78350F',fontFamily:'inherit',flex:1,minWidth:140}}/>}
        </div>
      </div>

      {/* Fields */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div><label style={lbl}>Employee Name</label>
          <select value={f.employee_id||''} onChange={e=>{const emp=emps.find(x=>x.id===e.target.value);up('employee_id',e.target.value);up('employee_name',emp?gn(emp):'')}} style={inp}>
            <option value="">Select</option>{emps.map(e=><option key={e.id} value={e.id}>{gn(e)}</option>)}
          </select></div>
        <div><label style={lbl}>Date</label><input type="date" value={f.date||''} onChange={e=>up('date',e.target.value)} style={inp}/></div>
        <div><label style={lbl}>Type</label>
          <select value={f.type||''} onChange={e=>up('type',e.target.value)} style={inp}>
            <option value="">Select</option>{DISC_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
          </select></div>
        <div><label style={lbl}>Current Step (Manual)</label>
          <select value={f.step||''} onChange={e=>up('step',e.target.value)} style={inp}>
            <option value="">-- Select Step --</option>
            <option value="1">Step 1 — Verbal Warning</option>
            <option value="2">Step 2 — Written Warning</option>
            <option value="3">Step 3 — Final Written Warning</option>
            <option value="4">Step 4 — Suspension</option>
            <option value="5">Step 5 — Termination</option>
          </select></div>
        <div><label style={lbl}>Prepared By</label><input value={f.prepared_by||''} readOnly style={{...inp,opacity:0.7}}/></div>
        {f.type==='suspension' && <div><label style={{...lbl,color:'#B91C1C'}}>Suspension Return Date</label>
          <input type="date" value={f.suspension_return_date||''} onChange={e=>up('suspension_return_date',e.target.value)} style={{...inp,borderColor:'#B91C1C'}}/></div>}
      </div>

      {/* Natures */}
      <label style={{...lbl,marginBottom:6}}>Nature of Incident</label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
        {INCIDENT_NATURES.map(n=>(<button key={n} onClick={()=>toggleNature(n)} style={{
          padding:'6px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',textAlign:'left',
          background:selNatures.includes(n)?'#FEE2E2':'transparent',border:'1px solid '+(selNatures.includes(n)?'#DC2626':C.bdr),color:selNatures.includes(n)?'#DC2626':C.g
        }}>{selNatures.includes(n)?'☑':'☐'} {n}</button>))}
      </div>

      <label style={lbl}>Specifics</label>
      <textarea value={f.specifics||''} onChange={e=>up('specifics',e.target.value)} rows={4} style={{...inp,resize:'vertical',marginBottom:10}}/>

      <label style={lbl}>Current Disciplinary Action</label>
      <textarea value={f.current_action||''} onChange={e=>up('current_action',e.target.value)} rows={2} style={{...inp,resize:'vertical',marginBottom:10}}/>

      <label style={lbl}>Employee's Comments</label>
      <textarea value={f.employee_comments||''} onChange={e=>up('employee_comments',e.target.value)} rows={2} style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* Attachments */}
      <label style={{...lbl,marginBottom:6}}>Attachments ({existingAtts.length + attachments.length}/7)</label>
      <div style={{border:'1px dashed '+C.bdr,borderRadius:8,padding:'12px 14px',marginBottom:12,background:C.nL}}>
        {existingAtts.map((att,i) => (
          <div key={'ex'+i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:'1px solid '+C.bdr,marginBottom:4}}>
            <div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
              <span style={{fontSize:12}}>📎</span>
              <span style={{fontSize:11,color:C.w,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name||'File'}</span>
            </div>
            <button onClick={()=>removeExistingAtt(i)} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>×</button>
          </div>
        ))}
        {attachments.map((file,i) => (
          <div key={'new'+i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:'1px solid #22C55E',marginBottom:4}}>
            <div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
              <span style={{fontSize:12}}>📎</span>
              <span style={{fontSize:11,color:C.w,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
              <span style={{fontSize:8,color:'#22C55E'}}>NEW</span>
            </div>
            <button onClick={()=>removeNewFile(i)} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>×</button>
          </div>
        ))}
        {(existingAtts.length + attachments.length) < 7 && <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',cursor:'pointer',color:C.go,fontSize:11,fontWeight:600}}>
          <span>+ Add File</span><input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.xlsx,.xls,.csv" onChange={handleFileAdd} style={{display:'none'}}/>
        </label>}
      </div>

      {/* Future Action */}
      <label style={lbl}>Future Action if Unsatisfactory Performance Recurs</label>
      <textarea value={f.future_action||'If Performance doesn\'t improve, it may result in further disciplinary action, up to and including termination of employment.'} onChange={e=>up('future_action',e.target.value)} rows={3} style={{...inp,resize:'vertical',marginBottom:6}}/>
      <div style={{fontSize:10,color:C.g,marginBottom:14,fontStyle:'italic'}}>My signature below signifies that I have read and understand the above report.</div>

      {/* Signatures */}
      <label style={{...lbl,marginBottom:8,fontSize:11}}>Signatures</label>
      <div style={{display:'grid',gap:8,marginBottom:16}}>
        {[
          {key:'employee',label:'Employee Signature',name:f.emp_signature,ts:f.emp_sig_date,clear:()=>{up('emp_signature','');up('emp_sig_date','')}},
          {key:'employer',label:'Employer Signature',name:f.employer_signature,ts:f.sup_sig_date,clear:()=>{up('employer_signature','');up('sup_sig_date','')}},
          {key:'witness',label:'Witness Signature',name:f.witness_name&&f.witness_sig_date?f.witness_name:null,ts:f.witness_sig_date,clear:()=>{up('witness_name','');up('witness_sig_date','')}}
        ].map((s,i)=>(
          <div key={i} style={{border:'1px solid '+(s.name?'#22C55E':C.bdr),borderRadius:8,padding:'10px 14px',background:s.name?'rgba(34,197,94,0.05)':'transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{s.label}</div>
                {s.name ? <div style={{fontSize:14,fontStyle:'italic',color:C.w,marginTop:2}}>{s.name}</div> : <div style={{fontSize:11,color:C.g,marginTop:2}}>{s.key==='witness'?'Optional':'Not yet signed'}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
                {!s.name ? <button onClick={()=>setSigMode(s.key)} style={{background:s.key==='witness'?'transparent':C.go,color:s.key==='witness'?C.go:'#000',border:s.key==='witness'?'1px solid '+C.go:'none',padding:'5px 12px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginTop:2}}>Tap to Sign</button>
                  : <button onClick={s.clear} style={{background:'transparent',border:'1px solid '+C.bdr,color:C.g,padding:'3px 8px',borderRadius:4,fontSize:9,cursor:'pointer',fontFamily:'inherit',marginTop:2}}>Clear</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
        <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
        <Btn gold small onClick={handleSave} C={C}>{uploading ? 'Saving...' : 'Update Record'}</Btn>
      </div>
    </div>
  </div>)
}

// ═══════════════════════════════════════════
// ── SEPARATIONS SUB-TAB (HR Only) ──
// ═══════════════════════════════════════════
function SeparationsSubView({separations,setSeparations,saveSeparation,recallEmployee,emps,setEmps,ac,disc,mod,setMod,C,userEmail,userEmpRecord}){
  const [viewSep, setViewSep] = useState(null)
  const [editingSep, setEditingSep] = useState(null)
  const sorted = [...separations].sort((a,b) => new Date(b.effective_date||b.created_at) - new Date(a.effective_date||a.created_at))

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{fontSize:13,color:C.g}}>HR only — layoffs, terminations, resignations, and recalls</div>
      <Btn small gold onClick={()=>setMod('separation')} C={C}>+ New Separation</Btn>
    </div>

    {sorted.map(s=>{
      const st=SEPARATION_TYPES.find(t=>t.v===s.separation_type)
      const emp=emps.find(e=>e.id===s.employee_id)
      const isRecalled = s.status === 'recalled'
      return <div key={s.id} onClick={()=>setViewSep(viewSep?.id===s.id?null:s)} style={{cursor:'pointer'}}>
        <Card C={C} style={{marginBottom:6,padding:'10px 14px',opacity:isRecalled?0.6:1}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <b style={{fontSize:13}}>{s.employee_name||'—'}</b>{' '}
            <Tag c={st?.c||C.g}>{st?.l||s.separation_type}</Tag>
            {isRecalled && <span style={{display:'inline-block',padding:'1px 6px',borderRadius:99,fontSize:8,fontWeight:700,marginLeft:4,background:'rgba(34,197,94,0.15)',color:'#22C55E',border:'1px solid #22C55E'}}>Recalled {fm(s.recall_date)}</span>}
            <div style={{fontSize:11,color:C.g}}>{s.reason||'—'}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:10,color:C.g}}>{fm(s.effective_date||s.created_at)}</div>
            {st?.hasRecall && !isRecalled && s.expected_recall_date && <div style={{fontSize:9,color:'#6366F1',marginTop:2}}>Recall: {fm(s.expected_recall_date)}</div>}
          </div>
        </div>

        {/* Expanded detail */}
        {viewSep?.id===s.id&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid '+C.bdr}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Effective Date</span><div>{fm(s.effective_date)||'—'}</div></div>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Type</span><div>{st?.l||s.separation_type}</div></div>
            {s.expected_recall_date&&<div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Expected Recall</span><div style={{color:'#6366F1',fontWeight:600}}>{fm(s.expected_recall_date)}</div></div>}
            {s.recall_date&&<div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Actual Recall</span><div style={{color:'#22C55E',fontWeight:600}}>{fm(s.recall_date)}</div></div>}
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Union Notified</span><div>{s.union_notified?'Yes':'No'}</div></div>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Prepared By</span><div>{s.prepared_by||'—'}</div></div>
          </div>

          {s.reason&&<div style={{fontSize:11,marginBottom:6}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Reason</span><div style={{whiteSpace:'pre-wrap'}}>{s.reason}</div></div>}
          {s.final_paycheck_notes&&<div style={{fontSize:11,marginBottom:6}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Final Paycheck</span><div>{s.final_paycheck_notes}</div></div>}
          {s.cobra_notes&&<div style={{fontSize:11,marginBottom:6}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>COBRA / Benefits</span><div>{s.cobra_notes}</div></div>}
          {s.exit_notes&&<div style={{fontSize:11,marginBottom:6}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Exit Interview Notes</span><div style={{whiteSpace:'pre-wrap'}}>{s.exit_notes}</div></div>}

          {/* Equipment checklist */}
          {s.equipment_returned && (()=>{
            let eq = []; try{eq=typeof s.equipment_returned==='string'?JSON.parse(s.equipment_returned):s.equipment_returned||[]}catch(e){}
            if(eq.length===0) return null
            return <div style={{fontSize:11,marginBottom:6}}>
              <span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Equipment Returned</span>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:2}}>{eq.map(id=>{
                const item=EQUIPMENT_CHECKLIST.find(e=>e.id===id)
                return <span key={id} style={{padding:'2px 6px',borderRadius:4,fontSize:9,background:'rgba(34,197,94,0.1)',color:'#22C55E',border:'1px solid #22C55E'}}>✓ {item?.l||id}</span>
              })}</div>
            </div>
          })()}

          {/* Probation freeze info */}
          {s.separation_type==='layoff'&&emp&&<div style={{background:'rgba(124,58,237,0.08)',border:'1px solid #7C3AED',borderRadius:6,padding:'8px 12px',marginTop:8}}>
            <div style={{fontSize:10,color:'#7C3AED',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Probation Status</div>
            {(()=>{
              const prob = getProbationDays(emp)
              const lcaRec = disc.find(d=>d.employee_id===emp.id && d.type==='last_chance')
              const lca = lcaRec ? getLCAStatus(lcaRec, emp) : null
              return <div style={{fontSize:11,color:C.w}}>
                {prob.remaining > 0 && <div>New-hire probation (90-day): <b>{prob.elapsed}</b> active days / 90 — <b style={{color:prob.frozen?'#7C3AED':'#22C55E'}}>{prob.frozen?'FROZEN ('+prob.remaining+'d remaining)':prob.remaining+'d remaining'}</b></div>}
                {prob.remaining === 0 && <div style={{color:C.g}}>New-hire probation: Complete ✓</div>}
                {lca && <div style={{marginTop:3}}>Disciplinary probation (LCA): <b>{lca.elapsedActive}</b> active days / {lca.durationDays} — <b style={{color:lca.isFrozen?'#7C3AED':'#22C55E'}}>{lca.isFrozen?'FROZEN ('+lca.remaining+'d remaining)':lca.remaining+'d remaining'}</b>{lca.freezeDays>0&&'('+lca.freezeDays+'d frozen)'}</div>}
              </div>
            })()}
          </div>}

          {/* Action buttons */}
          <div style={{display:'flex',gap:6,marginTop:10}}>
            {st?.hasRecall && !isRecalled && <button onClick={(e)=>{e.stopPropagation();if(confirm('Recall this employee? This will set their status back to Active and resume all probation clocks.'))recallEmployee(s)}} style={{background:'#22C55E',color:'#fff',border:'none',padding:'6px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>↩ Recall Employee</button>}
            {isRecalled && <button onClick={async(e)=>{e.stopPropagation();if(confirm('Undo recall? This will set the employee back to Laid Off.')){
              await supabase.from('separations').update({status:'active',recall_date:null}).eq('id',s.id)
              setSeparations(p=>p.map(x=>x.id===s.id?{...x,status:'active',recall_date:null}:x))
              if(s.employee_id){
                await supabase.from('employees').update({status:'laid_off',recall_date:null}).eq('id',s.employee_id)
                setEmps(p=>p.map(e=>e.id===s.employee_id?{...e,status:'laid_off',recall_date:null}:e))
              }
            }}} style={{background:'transparent',color:'#EF4444',border:'1px solid #EF4444',padding:'6px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>↺ Undo Recall</button>}
            <button onClick={(e)=>{e.stopPropagation();setEditingSep(s);setMod('separation')}} style={{background:'transparent',color:C.go,border:'1px solid '+C.go,padding:'6px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>✏️ Edit</button>

          </div>
        </div>}
      </Card></div>
    })}

    {sorted.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No separation records.</Card>}

    {mod==='separation'&&<SeparationFormModal
      onSave={saveSeparation} onClose={()=>{setMod(null);setEditingSep(null)}} C={C}
      emps={[...ac,...emps.filter(e=>e.status==='laid_off')] } allEmps={emps} disc={disc}
      userEmail={userEmail} userEmpRecord={userEmpRecord} setEmps={setEmps}
      sep={editingSep}
    />}

  </div>)
}


// ── Separation Form Modal ──
function SeparationFormModal({onSave,onClose,C,emps,allEmps,disc,userEmail,userEmpRecord,setEmps,sep}){
  const isEdit = !!sep?.id
  const [f, setF] = useState(isEdit ? {
    ...sep,
    union_notified: sep.union_notified || false,
    equipment_returned: sep.equipment_returned || '[]',
  } : {
    status:'active',
    effective_date: new Date().toISOString().split('T')[0],
    prepared_by: userEmpRecord ? gn(userEmpRecord) : (userEmail||''),
    prepared_by_email: userEmail||'',
    union_notified: false,
    equipment_returned: '[]'
  })
  const [equipChecked, setEquipChecked] = useState(() => {
    if (!isEdit) return []
    try { return typeof sep.equipment_returned === 'string' ? JSON.parse(sep.equipment_returned) : (sep.equipment_returned || []) } catch(e) { return [] }
  })
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const handleEmpChange = (empId) => {
    const emp = allEmps.find(e=>e.id===empId)
    up('employee_id', empId)
    up('employee_name', emp ? gn(emp) : '')
  }

  const toggleEquip = (id) => setEquipChecked(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])

  const sepType = SEPARATION_TYPES.find(t=>t.v===f.separation_type)

  const handleSave = () => {
    const record = {...f, equipment_returned: JSON.stringify(equipChecked)}
    onSave(record)
    // Also update employee status if needed
    if (f.employee_id && f.separation_type) {
      const newStatus = f.separation_type === 'layoff' ? 'laid_off' : 'terminated'
      const empUpdate = {status: newStatus}
      if (f.separation_type === 'layoff') {
        empUpdate.layoff_date = f.effective_date
        empUpdate.expected_recall_date = f.expected_recall_date || null
      }
      supabase.from('employees').update(empUpdate).eq('id', f.employee_id).then(()=>{
        setEmps(p=>p.map(e=>e.id===f.employee_id?{...e,...empUpdate}:e))
      })
    }
    onClose()
  }

  const inp = {width:'100%',padding:8,background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:'1px solid '+C.bdr}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:sepType?.c||C.go,textTransform:'uppercase',letterSpacing:2}}>FlowSuite PeopleFlow</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>{isEdit ? '✏️ Edit Separation Record' : 'New Employee Separation'}</h3>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18,flexShrink:0}}>✕</button>
      </div>

      {/* Type Selection */}
      <label style={{...lbl,marginBottom:6}}>Separation Type</label>
      <div style={{display:'flex',gap:4,marginBottom:14,flexWrap:'wrap'}}>
        {SEPARATION_TYPES.map(t=>
          <button key={t.v} onClick={()=>up('separation_type',t.v)} style={{
            padding:'6px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',
            background:f.separation_type===t.v?t.c+'22':'transparent',
            border:'1px solid '+(f.separation_type===t.v?t.c:C.bdr),
            color:f.separation_type===t.v?t.c:C.g
          }}>{t.l}</button>
        )}
      </div>

      {/* Core Fields */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div>
          <label style={lbl}>Employee</label>
          <select value={f.employee_id||''} onChange={e=>handleEmpChange(e.target.value)} style={inp}>
            <option value="">Select Employee</option>
            {emps.map(e=><option key={e.id} value={e.id}>{gn(e)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Effective Date</label>
          <input type="date" value={f.effective_date||''} onChange={e=>up('effective_date',e.target.value)} style={inp}/>
        </div>
        <div>
          <label style={lbl}>Prepared By</label>
          <input value={f.prepared_by||''} readOnly style={{...inp,opacity:0.7}}/>
        </div>
        {sepType?.hasRecall && <div>
          <label style={{...lbl,color:'#6366F1'}}>Expected Recall Date</label>
          <input type="date" value={f.expected_recall_date||''} onChange={e=>up('expected_recall_date',e.target.value)} style={{...inp,borderColor:'#6366F1'}}/>
        </div>}
      </div>

      {/* Layoff-specific fields */}
      {f.separation_type==='layoff' && <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid #6366F1',borderRadius:8,padding:'12px 16px',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#6366F1',marginBottom:8}}>Layoff Details</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{...lbl,color:'#6366F1'}}>Reason</label>
            <select value={f.layoff_reason||''} onChange={e=>up('layoff_reason',e.target.value)} style={inp}>
              <option value="">Select Reason</option>
              <option value="lack_of_work">Lack of Work</option>
              <option value="reduction_in_force">Reduction in Force</option>
              <option value="seasonal">Seasonal Reduction</option>
              <option value="restructuring">Restructuring</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#6366F1',fontWeight:600,cursor:'pointer'}}>
              <input type="checkbox" checked={f.union_notified||false} onChange={e=>up('union_notified',e.target.checked)} style={{width:16,height:16,accentColor:'#6366F1'}}/>
              Union notified (Ruth & Marty)
            </label>
          </div>
        </div>

        {/* Probation freeze preview */}
        {f.employee_id && (()=>{
          const emp = allEmps.find(e=>e.id===f.employee_id)
          if (!emp) return null
          const prob = getProbationDays(emp)
          const lcaRec = disc.find(d=>d.employee_id===emp.id && d.type==='last_chance')
          const lca = lcaRec ? getLCAStatus(lcaRec, emp) : null
          return <div style={{background:'rgba(124,58,237,0.08)',border:'1px solid #7C3AED',borderRadius:6,padding:'8px 12px',marginTop:8}}>
            <div style={{fontSize:10,color:'#7C3AED',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>⏸ Clocks that will freeze on layoff</div>
            <div style={{fontSize:11,color:C.w}}>
              {prob.remaining > 0 && <div>New-hire probation (90-day): {prob.elapsed}d / 90d — <b>{prob.remaining}d will freeze</b></div>}
              {prob.remaining === 0 && <div style={{color:C.g}}>New-hire probation: Complete ✓</div>}
              {lca && lca.remaining > 0 && <div style={{marginTop:2}}>Disciplinary probation (LCA): {lca.elapsedActive}d / {lca.durationDays}d — <b>{lca.remaining}d will freeze</b></div>}
              {lca && lca.remaining === 0 && <div style={{color:C.g,marginTop:2}}>Disciplinary probation (LCA): Complete ✓</div>}
            </div>
          </div>
        })()}
      </div>}

      {/* Reason / Notes */}
      <label style={lbl}>Reason / Details</label>
      <textarea value={f.reason||''} onChange={e=>up('reason',e.target.value)} rows={3} placeholder="Describe the circumstances..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* Equipment Return */}
      <label style={{...lbl,marginBottom:6}}>Equipment Return Checklist</label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
        {EQUIPMENT_CHECKLIST.map(item=>(
          <button key={item.id} onClick={()=>toggleEquip(item.id)} style={{
            padding:'6px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',textAlign:'left',
            background:equipChecked.includes(item.id)?'rgba(34,197,94,0.1)':'transparent',
            border:'1px solid '+(equipChecked.includes(item.id)?'#22C55E':C.bdr),
            color:equipChecked.includes(item.id)?'#22C55E':C.g
          }}>{equipChecked.includes(item.id)?'✓':'○'} {item.l}</button>
        ))}
      </div>

      {/* Final Paycheck */}
      <label style={lbl}>Final Paycheck Notes</label>
      <textarea value={f.final_paycheck_notes||''} onChange={e=>up('final_paycheck_notes',e.target.value)} rows={2} placeholder="Final check date, PTO payout, deductions..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* COBRA */}
      <label style={lbl}>COBRA / Benefits Continuation Notes</label>
      <textarea value={f.cobra_notes||''} onChange={e=>up('cobra_notes',e.target.value)} rows={2} placeholder="COBRA eligibility, continuation details..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* Exit Interview */}
      <label style={lbl}>Exit Interview Notes</label>
      <textarea value={f.exit_notes||''} onChange={e=>up('exit_notes',e.target.value)} rows={2} placeholder="Employee feedback, concerns, reason for leaving..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
        <Btn ghost small onClick={onClose} C={C}>Cancel</Btn>
        <Btn gold small onClick={handleSave} C={C}>{isEdit ? 'Save Changes' : 'Save Separation'}</Btn>
      </div>
    </div>
  </div>)
}

function OnbView({ac,onb,docs,toggleOnb,toggleDoc,updateOnbDate,updateDocMeta,orgId,C}){
  const [expanded, setExpanded] = useState(null)
  const [editingDate, setEditingDate] = useState(null) // {empId, stepId, current}
  const [uploadingDoc, setUploadingDoc] = useState(null) // docId being uploaded

  const today = new Date().toISOString().split('T')[0]

  // Show all active employees — fully onboarded ones show as complete
  const sorted = [...ac].sort((a,b)=>(a.last_name||a.first_name||'').localeCompare(b.last_name||b.first_name||''))

  const phs = [...new Set(OBS.map(s=>s.p))]
  const docCats = [...new Set(DOC_ITEMS.map(d=>d.c))]

  const getOnbPct = (empId) => {
    const ed = onb[empId]||{}
    const done = OBS.filter(s=>ed[s.id]?.completed).length
    return Math.round(done/OBS.length*100)
  }
  const getDocPct = (empId) => {
    const dd = docs[empId]||{}
    const done = DOC_ITEMS.filter(d=>dd[d.id]?.received).length
    return Math.round(done/DOC_ITEMS.length*100)
  }

  const fmDate = (d) => {
    if (!d) return null
    return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  }

  const dateGap = (d1, d2) => {
    if (!d1 || !d2) return null
    return Math.round((new Date(d2) - new Date(d1)) / (1000*60*60*24))
  }

  const handleUpload = async(empId, docId, curObj, file) => {
    if (!file) return
    setUploadingDoc(docId)
    try {
      const ext = file.name.split('.').pop()
      const path = `onboarding/${orgId}/${empId}/${docId}_${Date.now()}.${ext}`
      const {error:upErr} = await supabase.storage.from('flowsuite-files').upload(path, file, {upsert:true})
      if (upErr) { console.error('Upload error:', upErr); setUploadingDoc(null); return }
      const {data:urlData} = supabase.storage.from('flowsuite-files').getPublicUrl(path)
      const file_url = urlData?.publicUrl || null
      const received_date = curObj?.received_date || today
      if (curObj?.received) {
        await updateDocMeta(empId, docId, curObj, {file_url, received_date})
      } else {
        await toggleDoc(empId, docId, curObj, {file_url, received_date})
      }
    } catch(e){ console.error(e) }
    setUploadingDoc(null)
  }

  const inp = {padding:'4px 8px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:5,color:C.w,fontSize:11,fontFamily:'inherit'}

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0,fontSize:18}}>{'Onboarding'}</h2>
      <div style={{fontSize:11,color:C.g}}>{sorted.length+' employees'}</div>
    </div>

    {sorted.length===0
      ? <Card C={C} style={{padding:30,textAlign:'center',color:C.g}}>{'No active employees found.'}</Card>
      : sorted.map(e=>{
          const ed = onb[e.id]||{}
          const dd = docs[e.id]||{}
          const onbPct = getOnbPct(e.id)
          const docPct = getDocPct(e.id)
          const isOpen = expanded===e.id
          const probDay = dbt(e.hire_date||td,td)
          const offerToHire = dateGap(e.offer_date, e.hire_date)
          const hireToStart = dateGap(e.hire_date, e.start_date)
          const startToSeniority = dateGap(e.start_date, e.seniority_date)
          const onbColor = onbPct===100?C.gr:onbPct>=50?C.am:C.rd
          const docColor = docPct===100?C.gr:docPct>=50?C.am:C.rd
          const isComplete = onbPct===100 && docPct===100

          return <Card key={e.id} C={C} style={{marginBottom:10,padding:0,overflow:'hidden',opacity:isComplete?0.75:1}}>

            {/* ── Header ── */}
            <div onClick={()=>setExpanded(isOpen?null:e.id)} style={{padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <span style={{fontWeight:700,fontSize:14}}>{gn(e)}</span>
                  {isComplete && <span style={{fontSize:9,padding:'1px 6px',borderRadius:99,background:'rgba(34,197,94,0.15)',color:C.gr,border:'1px solid rgba(34,197,94,0.3)',fontWeight:700}}>COMPLETE</span>}
                </div>
                <div style={{fontSize:10,color:C.g}}>{e.role||'—'}{' · '}{e.dept||'—'}{e.hire_date?' · Day '+probDay+' of 90':''}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0,marginLeft:12}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:13,fontWeight:700,color:onbColor}}>{onbPct+'%'}</div>
                  <div style={{fontSize:8,color:C.g,textTransform:'uppercase'}}>{'Steps'}</div>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:13,fontWeight:700,color:docColor}}>{docPct+'%'}</div>
                  <div style={{fontSize:8,color:C.g,textTransform:'uppercase'}}>{'Docs'}</div>
                </div>
                <span style={{fontSize:10,color:C.g}}>{isOpen?'▲':'▼'}</span>
              </div>
            </div>

            {/* ── Progress bars ── */}
            <div style={{padding:'0 16px 10px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={{fontSize:9,color:C.g,marginBottom:2}}>{'Steps ('+OBS.filter(s=>ed[s.id]?.completed).length+'/'+OBS.length+')'}</div>
                <div style={{height:3,borderRadius:99,background:C.bdr}}>
                  <div style={{height:'100%',borderRadius:99,background:onbColor,width:onbPct+'%',transition:'width 0.3s'}}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:9,color:C.g,marginBottom:2}}>{'Documents ('+DOC_ITEMS.filter(d=>dd[d.id]?.received).length+'/'+DOC_ITEMS.length+')'}</div>
                <div style={{height:3,borderRadius:99,background:C.bdr}}>
                  <div style={{height:'100%',borderRadius:99,background:docColor,width:docPct+'%',transition:'width 0.3s'}}/>
                </div>
              </div>
            </div>

            {/* ── Date Timeline ── */}
            <div style={{padding:'8px 16px',background:C.nL,borderTop:'1px solid '+C.bdr,borderBottom:'1px solid '+C.bdr}}>
              <div style={{display:'flex',gap:0,alignItems:'center',flexWrap:'wrap'}}>
                {[
                  {label:'Offer',    date:e.offer_date},
                  {label:'Hire',     date:e.hire_date,     gap:offerToHire},
                  {label:'Start',    date:e.start_date,    gap:hireToStart},
                  {label:'Seniority',date:e.seniority_date,gap:startToSeniority}
                ].map((item,i)=>(
                  <div key={item.label} style={{display:'flex',alignItems:'center'}}>
                    {i>0 && <div style={{fontSize:9,color:C.g,padding:'0 6px',whiteSpace:'nowrap'}}>
                      {item.gap!==null?item.gap+'d →':'→'}
                    </div>}
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:9,color:C.go,textTransform:'uppercase',fontWeight:700}}>{item.label}</div>
                      <div style={{fontSize:10,color:item.date?C.w:C.g,fontWeight:item.date?500:400}}>{fmDate(item.date)||'—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Expanded: Steps + Docs ── */}
            {isOpen && <div style={{padding:'14px 16px'}}>

              {/* ── Onboarding Steps ── */}
              <div style={{marginBottom:18}}>
                <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>{'Onboarding Steps'}</div>
                {phs.map(ph=>(
                  <div key={ph} style={{marginBottom:12}}>
                    <div style={{fontSize:9,color:C.g,textTransform:'uppercase',letterSpacing:1,marginBottom:5,paddingBottom:3,borderBottom:'1px solid '+C.bdr}}>{ph}</div>
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {OBS.filter(s=>s.p===ph).map(s=>{
                        const stepObj = ed[s.id] || {completed:false,completed_date:null,row_id:null}
                        const done = stepObj.completed
                        const stepDate = stepObj.completed_date
                        const isEditingThis = editingDate?.empId===e.id && editingDate?.stepId===s.id

                        return (
                          <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:done?C.grD:C.nL,borderRadius:6,border:'1px solid '+(done?C.gr:C.bdr)}}>
                            {/* Checkbox */}
                            <button
                              onClick={()=>{
                                if(done){if(window.confirm('Uncheck "'+s.l+'"? This will clear the date.'))toggleOnb(e.id,s.id,stepObj)}
                                else toggleOnb(e.id,s.id,stepObj)
                              }}
                              style={{background:'none',border:'none',cursor:'pointer',padding:0,fontSize:14,color:done?C.gr:C.g,flexShrink:0,lineHeight:1}}
                            >{done?'✓':'○'}</button>

                            {/* Label */}
                            <span style={{flex:1,fontSize:11,color:done?C.g:C.w,textDecoration:done?'line-through':'none'}}>{s.l}</span>

                            {/* Date area */}
                            {done && !isEditingThis && (
                              <button
                                onClick={()=>setEditingDate({empId:e.id,stepId:s.id,current:stepDate})}
                                style={{background:'none',border:'none',cursor:'pointer',padding:'1px 6px',borderRadius:4,fontSize:10,color:C.go,fontWeight:600,fontFamily:'inherit',borderBottom:'1px dashed '+C.go,flexShrink:0}}
                                title={'Click to change date'}
                              >{fmDate(stepDate)||'Set date'}</button>
                            )}
                            {done && isEditingThis && (
                              <input
                                type='date'
                                defaultValue={stepDate||today}
                                autoFocus
                                onBlur={ev=>{
                                  const nd=ev.target.value
                                  if(nd && nd!==stepDate) updateOnbDate(e.id,s.id,stepObj,nd)
                                  setEditingDate(null)
                                }}
                                onKeyDown={ev=>{if(ev.key==='Escape')setEditingDate(null)}}
                                style={{...inp,width:130,flexShrink:0}}
                              />
                            )}
                            {!done && (
                              <span style={{fontSize:9,color:C.g,flexShrink:0}}>{'—'}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Documents ── */}
              <div style={{borderTop:'1px solid '+C.bdr,paddingTop:14}}>
                <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>{'Documents'}</div>
                {docCats.map(cat=>(
                  <div key={cat} style={{marginBottom:12}}>
                    <div style={{fontSize:9,color:C.g,textTransform:'uppercase',letterSpacing:1,marginBottom:5,paddingBottom:3,borderBottom:'1px solid '+C.bdr}}>{cat}</div>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {DOC_ITEMS.filter(d=>d.c===cat).map(d=>{
                        const docObj = dd[d.id] || {received:false,received_date:null,file_url:null,row_id:null}
                        const recv = docObj.received
                        const isUploading = uploadingDoc===d.id

                        return (
                          <div key={d.id} style={{padding:'8px 10px',background:recv?C.grD:C.nL,borderRadius:6,border:'1px solid '+(recv?C.gr:C.bdr)}}>
                            {/* Top row: checkbox + label + date */}
                            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:recv||!recv?4:0}}>
                              <button
                                onClick={()=>{
                                  if(recv){if(window.confirm('Mark "'+d.l+'" as not received? This will clear the file and date.'))toggleDoc(e.id,d.id,docObj)}
                                  else toggleDoc(e.id,d.id,docObj)
                                }}
                                style={{background:'none',border:'none',cursor:'pointer',padding:0,fontSize:14,color:recv?C.gr:C.g,flexShrink:0,lineHeight:1}}
                              >{recv?'✓':'○'}</button>
                              <span style={{flex:1,fontSize:11,color:recv?C.g:C.w,textDecoration:recv?'line-through':'none',fontWeight:recv?400:500}}>{d.l}</span>
                              {recv && (
                                <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                                  <input
                                    type='date'
                                    value={docObj.received_date||today}
                                    onChange={ev=>updateDocMeta(e.id,d.id,docObj,{received_date:ev.target.value})}
                                    style={{...inp,width:130}}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Upload row */}
                            <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:22}}>
                              {docObj.file_url ? (
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <a href={docObj.file_url} target='_blank' rel='noopener noreferrer' style={{fontSize:10,color:C.go,fontWeight:600,textDecoration:'none'}}>{'📎 View File'}</a>
                                  <span style={{fontSize:9,color:C.g}}>·</span>
                                  <label style={{fontSize:10,color:C.g,cursor:'pointer',fontFamily:'inherit'}}>
                                    {'Replace'}
                                    <input type='file' accept='.pdf,.doc,.docx,.jpg,.jpeg,.png' onChange={ev=>{const f=ev.target.files[0];if(f)handleUpload(e.id,d.id,docObj,f);ev.target.value=''}} style={{display:'none'}}/>
                                  </label>
                                </div>
                              ) : (
                                <label style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:isUploading?C.g:C.go,fontWeight:600,cursor:isUploading?'default':'pointer',fontFamily:'inherit'}}>
                                  {isUploading?'Uploading...':'+ Upload File'}
                                  {!isUploading && <input type='file' accept='.pdf,.doc,.docx,.jpg,.jpeg,.png' onChange={ev=>{const f=ev.target.files[0];if(f)handleUpload(e.id,d.id,docObj,f);ev.target.value=''}} style={{display:'none'}}/>}
                                </label>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>}
          </Card>
        })
    }
  </div>)
}

function DocsView({ac,docs,toggleDoc,C}){
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Document Tracker</h2>
    {ac.map(e=>{const ed=docs[e.id]||{};const dn=DOC_ITEMS.filter(d=>ed[d.id]?.received).length;const pc=Math.round(dn/DOC_ITEMS.length*100);const cats=[...new Set(DOC_ITEMS.map(d=>d.c))]
      return<Card key={e.id} C={C} style={{marginBottom:8}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><div style={{fontWeight:600,fontSize:13}}>{gn(e)}</div><div style={{fontSize:12,fontWeight:700,color:pc===100?C.gr:pc>50?C.am:C.rd}}>{pc}%</div></div>
        <div style={{height:2,background:C.nL,borderRadius:99,marginBottom:6,overflow:'hidden'}}><div style={{height:'100%',width:pc+'%',background:pc===100?C.gr:C.go}}/></div>
        {cats.map(cat=><div key={cat} style={{display:'flex',gap:2,flexWrap:'wrap',marginBottom:2}}>
          {DOC_ITEMS.filter(d=>d.c===cat).map(d=><span key={d.id} onClick={()=>toggleDoc(e.id,d.id,ed[d.id]||null)} style={{padding:'2px 6px',borderRadius:4,fontSize:9,cursor:'pointer',background:ed[d.id]?.received?C.grD:C.nL,color:ed[d.id]?.received?C.gr:C.g,textDecoration:ed[d.id]?.received?'line-through':'none'}}>{d.l}</span>)}</div>)}
      </Card>})}</div>)
}

function RptView({emps,ac,disc,reports,C}){
  const uC=ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length
  const dC={};ac.forEach(e=>{const d=e.dept||'Unassigned';dC[d]=(dC[d]||0)+1})
  const openReports = (reports||[]).filter(r=>r.status!=='closed').length
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Reports</h2>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Headcount</h3><div style={{fontSize:12}}>
        <div>Total: <b>{emps.length}</b></div><div>Active: <b>{ac.length}</b></div><div>Union: <b>{uC}</b></div><div>Terminated: <b>{emps.filter(e=>e.status==='Terminated').length}</b></div></div></Card>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>By Department</h3>
        {Object.entries(dC).sort((a,b)=>b[1]-a[1]).map(([d,c])=><div key={d} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}><span>{d}</span><b>{c}</b></div>)}</Card>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Discipline</h3><div style={{fontSize:12}}>
        <div>Total: <b>{disc.length}</b></div><div>Open: <b style={{color:C.rd}}>{disc.filter(d=>(d.status||d.st)==='open').length}</b></div></div></Card>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Workplace Reports</h3><div style={{fontSize:12}}>
        <div>Total: <b>{(reports||[]).length}</b></div><div>Open: <b style={{color:'#8B5CF6'}}>{openReports}</b></div></div></Card>
    </div></div>)
}

function ResourcesView({C,isAdmin,isManager,emps,orgId,userEmail}){
  const canManage = isAdmin || isManager
  const [tab, setTab] = useState('forms')
  const [forms, setForms] = useState([])
  const [loadingForms, setLoadingForms] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [pushEmp, setPushEmp] = useState('')
  const [pushForm, setPushForm] = useState('')
  const [pushNote, setPushNote] = useState('')
  const [pushing, setPushing] = useState(false)
  const [toast, setToast] = useState('')
  const [pushHistory, setPushHistory] = useState([])
  const [acks, setAcks] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const sh = msg => { setToast(msg); setTimeout(()=>setToast(''),3000) }

  const activeEmps = emps.filter(e=>
    e.status!=='Terminated'&&e.status!=='terminated'&&
    e.status!=='Inactive'&&e.status!=='inactive'
  ).sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''))

  useEffect(()=>{
    const load = async () => {
      setLoadingForms(true)
      const {data} = await supabase.from('settings').select('value').eq('org_id',orgId).eq('key','resource_forms').single()
      if (data && Array.isArray(data.value)) setForms(data.value)
      setLoadingForms(false)
    }
    load()
  },[orgId])

  const saveForms = async (updated) => {
    await supabase.from('settings').update({value:updated}).eq('org_id',orgId).eq('key','resource_forms')
    setForms(updated)
  }

  const addForm = async () => {
    if (!newLabel.trim()||!newUrl.trim()){sh('Label and URL are required.');return}
    const f = {id:'form_'+Date.now(),l:newLabel.trim(),url:newUrl.trim(),desc:newDesc.trim()}
    await saveForms([...forms, f])
    setNewLabel('');setNewUrl('');setNewDesc('');setShowAddForm(false)
    sh('Form added.')
  }

  const removeForm = async (id) => {
    await saveForms(forms.filter(f=>f.id!==id))
    sh('Form removed.')
  }

  const startEdit = (f) => {
    setEditingId(f.id);setEditLabel(f.l);setEditUrl(f.url);setEditDesc(f.desc||'')
  }

  const saveEdit = async () => {
    await saveForms(forms.map(f=>f.id===editingId?{...f,l:editLabel,url:editUrl,desc:editDesc}:f))
    setEditingId(null)
    sh('Form updated.')
  }

  const loadHistory = async () => {
    setLoadingHistory(true)
    const {data:pushes,error:pe} = await supabase.from('policy_pushes').select('*').eq('org_id',orgId).is('section_id',null).order('created_at',{ascending:false}).limit(100)
    const {data:ackData} = await supabase.from('push_acknowledgments').select('*').eq('org_id',orgId)
    if (!pe) setPushHistory(pushes||[])
    setAcks(ackData||[])
    setLoadingHistory(false)
  }

  useEffect(()=>{
    if(tab==='history') loadHistory()
  },[tab])

  const handlePush = async () => {
    if (!pushEmp||!pushForm){sh('Select an employee and a form.');return}
    const emp = activeEmps.find(e=>e.id===pushEmp)
    const form = forms.find(f=>f.id===pushForm)
    if (!emp||!form){sh('Invalid selection.');return}
    setPushing(true)
    const msg = (pushNote?pushNote+' — ':'')+form.l+' : '+form.url
    const {data:push,error} = await supabase.from('policy_pushes').insert({
      org_id:orgId,
      pushed_by:userEmail||'admin',
      pushed_to:[gn(emp)],
      message:msg,
      section_id:null
    }).select().single()
    if (error){sh('Error: '+error.message);setPushing(false);return}
    if (push){
      const ackRow = {push_id:push.id,employee_id:emp.id,employee_name:gn(emp),status:'pending',org_id:orgId}
      await supabase.from('push_acknowledgments').insert(ackRow)
    }
    setPushing(false)
    sh('Pushed to '+gn(emp)+' checkmark')
    setPushEmp('');setPushForm('');setPushNote('')
    if(tab==='history') loadHistory()
  }

  const inp = {width:'100%',padding:'7px 10px',background:C.ch,border:'1px solid '+C.bdr,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}

  const tabBtn = (k,l) => (
    <button key={k} onClick={()=>setTab(k)} style={{
      padding:'5px 14px',borderRadius:6,fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer',
      background:tab===k?C.gD:'transparent',
      border:'1px solid '+(tab===k?C.go:C.bdrF),
      color:tab===k?C.go:C.g
    }}>{l}</button>
  )

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{margin:0,fontSize:18}}>{'Employee Resources'}</h2>
        <div style={{display:'flex',gap:4}}>
          {tabBtn('forms','Forms')}
          {tabBtn('push','Push to Employee')}
          {tabBtn('history','Push History')}
        </div>
      </div>

      {tab==='forms'&&<div>
        {canManage&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontSize:11,color:C.g}}>{'Your form library. Add any JotForm, PDF, or link.'}</div>
          <button onClick={()=>setShowAddForm(p=>!p)} style={{fontSize:10,padding:'4px 14px',borderRadius:5,border:'1px solid '+C.bdr,background:'transparent',color:C.g,cursor:'pointer',fontFamily:'inherit'}}>{showAddForm?'Cancel':'+ Add Form'}</button>
        </div>}

        {canManage&&showAddForm&&<Card C={C} style={{padding:'14px 16px',marginBottom:14}}>
          <div style={{fontSize:10,color:C.go,fontWeight:700,textTransform:'uppercase',marginBottom:10}}>{'New Form'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div>
              <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:3}}>{'Label'}</div>
              <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder={'e.g. Reimbursement Request'} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:3}}>{'URL'}</div>
              <input value={newUrl} onChange={e=>setNewUrl(e.target.value)} placeholder={'https://form.jotform.com/...'} style={inp}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:3}}>{'Description (optional)'}</div>
            <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder={'What is this form for?'} style={inp}/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <Btn gold small onClick={addForm} C={C}>{'Add Form'}</Btn>
          </div>
        </Card>}

        {loadingForms
          ?<div style={{color:C.g,padding:30,textAlign:'center'}}>{'Loading...'}</div>
          :forms.length===0
            ?<Card C={C} style={{padding:30,textAlign:'center',color:C.g}}>
              {canManage?'No forms yet. Use + Add Form to get started.':'No forms available.'}
            </Card>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
              {forms.map(f=>
                editingId===f.id
                  ?<Card key={f.id} C={C} style={{padding:'14px 16px'}}>
                    <div style={{display:'grid',gap:6,marginBottom:10}}>
                      <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} placeholder={'Label'} style={inp}/>
                      <input value={editUrl} onChange={e=>setEditUrl(e.target.value)} placeholder={'URL'} style={inp}/>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder={'Description'} style={inp}/>
                    </div>
                    <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                      <button onClick={()=>setEditingId(null)} style={{fontSize:10,padding:'3px 10px',borderRadius:5,border:'1px solid '+C.bdr,background:'transparent',color:C.g,cursor:'pointer',fontFamily:'inherit'}}>{'Cancel'}</button>
                      <Btn gold small onClick={saveEdit} C={C}>{'Save'}</Btn>
                    </div>
                  </Card>
                  :<Card key={f.id} C={C} style={{padding:'14px 16px',position:'relative'}}>
                    {canManage&&<div style={{position:'absolute',top:8,right:10,display:'flex',gap:8}}>
                      <button onClick={()=>startEdit(f)} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>{'Edit'}</button>
                      <button onClick={()=>removeForm(f.id)} style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>{'Remove'}</button>
                    </div>}
                    <div style={{fontWeight:700,fontSize:13,color:C.w,marginBottom:4,paddingRight:canManage?70:0}}>{f.l}</div>
                    {f.desc&&<div style={{fontSize:11,color:C.g,marginBottom:10,lineHeight:1.4}}>{f.desc}</div>}
                    <a href={f.url} target={'_blank'} rel={'noopener noreferrer'} style={{display:'inline-block',padding:'5px 14px',borderRadius:6,background:C.go,color:C.bg,fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:'inherit'}}>{'Open Form'}</a>
                  </Card>
              )}
            </div>
        }
        {toast&&<div style={{marginTop:10,fontSize:11,color:C.go,fontWeight:600}}>{toast}</div>}
      </div>}

      {tab==='push'&&<div>
        {!canManage
          ?<div style={{color:C.g,padding:30,textAlign:'center'}}>{'Admin or manager access required.'}</div>
          :forms.length===0
            ?<Card C={C} style={{padding:30,textAlign:'center',color:C.g}}>{'Add forms in the Forms tab before pushing.'}</Card>
            :<Card C={C} style={{padding:'16px'}}>
              <div style={{fontSize:11,color:C.g,marginBottom:14}}>{'Employee receives a notification in PaperFlow to complete the selected form.'}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div>
                  <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:4}}>{'Employee'}</div>
                  <select value={pushEmp} onChange={e=>setPushEmp(e.target.value)} style={inp}>
                    <option value={''}>{'-- Select employee --'}</option>
                    {activeEmps.map(e=><option key={e.id} value={e.id}>{gn(e)}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:4}}>{'Form'}</div>
                  <select value={pushForm} onChange={e=>setPushForm(e.target.value)} style={inp}>
                    <option value={''}>{'-- Select form --'}</option>
                    {forms.map(f=><option key={f.id} value={f.id}>{f.l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,color:C.g,textTransform:'uppercase',marginBottom:4}}>{'Note to Employee (optional)'}</div>
                <input value={pushNote} onChange={e=>setPushNote(e.target.value)} placeholder={'e.g. Please complete by Friday'} style={inp}/>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:10}}>
                {toast&&<span style={{fontSize:11,color:C.go,fontWeight:600}}>{toast}</span>}
                <Btn gold small onClick={handlePush} C={C}>{pushing?'Sending...':'Push Form'}</Btn>
              </div>
            </Card>
        }
      </div>}

      {tab==='history'&&<div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:11,color:C.g}}>{'Form pushes only — most recent first.'}</div>
          <button onClick={loadHistory} style={{fontSize:10,padding:'3px 10px',borderRadius:5,border:'1px solid '+C.bdr,background:'transparent',color:C.g,cursor:'pointer',fontFamily:'inherit'}}>{'Refresh'}</button>
        </div>
        {loadingHistory
          ?<div style={{color:C.g,padding:30,textAlign:'center'}}>{'Loading...'}</div>
          :pushHistory.length===0
            ?<Card C={C} style={{padding:24,textAlign:'center',color:C.g}}>{'No form pushes yet.'}</Card>
            :pushHistory.map(p=>{
              const pushAcks = acks.filter(a=>a.push_id===p.id)
              const allAcked = pushAcks.length>0&&pushAcks.every(a=>a.status==='acknowledged')
              const anyPending = pushAcks.some(a=>a.status==='pending')
              const statusLabel = pushAcks.length===0?'No Acks':allAcked?'Acknowledged':anyPending?'Pending':'Partial'
              const statusColor = allAcked?C.gr:anyPending?C.am:'#6B7280'
              const sentTo = Array.isArray(p.pushed_to)?p.pushed_to.join(', '):(p.pushed_to||'—')
              const sentDate = p.created_at?new Date(p.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'
              return(
                <Card key={p.id} C={C} style={{marginBottom:8,padding:'12px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:C.g,marginBottom:3}}>{'To: '+sentTo+' · '+sentDate}</div>
                      <div style={{fontSize:12,color:C.w,wordBreak:'break-word'}}>{p.message}</div>
                    </div>
                    <div style={{flexShrink:0}}>
                      <div style={{
                        fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:99,
                        background:allAcked?'rgba(34,197,94,0.15)':'rgba(245,158,11,0.15)',
                        color:statusColor,
                        border:'1px solid '+statusColor
                      }}>{statusLabel}</div>
                    </div>
                  </div>
                </Card>
              )
            })
        }
      </div>}
    </div>
  )
}

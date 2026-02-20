import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import { Card, Tag, Btn, fm, dbt, td } from '../theme.jsx'

// ── Constants ──
const OBS = [
  {id:'w4',p:'Tax & Legal',l:'W-4 Federal'},{id:'i9',p:'Tax & Legal',l:'I-9 Verification'},
  {id:'sw',p:'Tax & Legal',l:'State W-4'},{id:'dd',p:'Tax & Legal',l:'Direct Deposit'},
  {id:'hb',p:'Benefits',l:'Health Benefits'},{id:'rt',p:'Benefits',l:'401k Enrollment'},
  {id:'eh',p:'Handbook',l:'Employee Handbook'},{id:'sp',p:'Handbook',l:'Safety Policy'},
  {id:'ha',p:'Handbook',l:'Harassment Policy'},{id:'it',p:'Setup',l:'IT/Email Setup'},
  {id:'bd',p:'Setup',l:'Badge/Access'},{id:'tr',p:'Setup',l:'Equipment/Tools'},
  {id:'mt',p:'Training',l:'Mentor Assigned'},{id:'ot',p:'Training',l:'Orientation Complete'},
  {id:'jt',p:'Training',l:'Job Training Started'},{id:'p30',p:'Review',l:'30-Day Check-in'},
  {id:'p60',p:'Review',l:'60-Day Check-in'},{id:'p90',p:'Review',l:'90-Day Review'}
]
const DOC_ITEMS = [
  {id:'offer_letter',c:'Hiring',l:'Offer Letter'},{id:'app',c:'Hiring',l:'Application'},
  {id:'bg',c:'Hiring',l:'Background Check'},{id:'w4f',c:'Tax',l:'W-4 Federal'},
  {id:'w4s',c:'Tax',l:'W-4 State'},{id:'i9f',c:'Tax',l:'I-9'},
  {id:'ddf',c:'Tax',l:'Direct Deposit Form'},{id:'hbe',c:'Benefits',l:'Health Benefits Election'},
  {id:'rte',c:'Benefits',l:'401k Enrollment'},{id:'ehk',c:'Policy',l:'Handbook Ack'},
  {id:'sfa',c:'Policy',l:'Safety Ack'},{id:'hpa',c:'Policy',l:'Harassment Ack'},
  {id:'cba',c:'Union',l:'CBA Copy Provided'},{id:'uc',c:'Union',l:'Union Card Signed'}
]

const ADMIN_EMAILS = ['kari@karikounkel.com','accounting@mpuptown.com','fbrown@mpuptown.com','operationsmanager@mpuptown.com']
const HR_EMAILS = ['kari@karikounkel.com','operationsmanager@mpuptown.com']

const DISC_TYPES = [
  {v:'verbal',l:'Verbal Warning',c:'#F59E0B'},
  {v:'written',l:'Written Warning',c:'#EF4444'},
  {v:'final_written',l:'Final Written Warning',c:'#DC2626'},
  {v:'suspension',l:'Suspension',c:'#B91C1C'},
  {v:'termination',l:'Termination',c:'#991B1B'},
  {v:'last_chance',l:'Last Chance Agreement',c:'#7C3AED'},
  {v:'coaching',l:'Coaching',c:'#3B82F6'},
  {v:'commendation',l:'Commendation',c:'#22C55E'}
]

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
  ['reports_to','Reports To'],['emp_code','Emp Code'],['notes','Notes']
]

const DEPARTMENTS = ['Digital Production','Wide Format','Operations/CS','Executive','Shipping/Receiving','Sales','Admin']

// ── Helpers ──
const gn = (e) => `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()

// Progressive Discipline — auto-calculated status + next-level suggestion
const PROGRESSION_CHAIN = ['verbal','written','final_written','suspension','termination']

const isDiscActive = (d) => {
  const discDate = d.date || d.created_at
  if (!discDate) return true
  const daysSince = Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24))
  return daysSince < 365
}

const getDiscStatus = (d) => isDiscActive(d) ? 'Active' : 'Retired'

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

export default function PeopleFlowModule({ orgId, C }) {
  const [emps, setEmps] = useState([])
  const [disc, setDisc] = useState([])
  const [separations, setSeparations] = useState([])
  const [reports, setReports] = useState([])
  const [onb, setOnb] = useState({})
  const [docs, setDocs] = useState({})
  const [pay, setPay] = useState([])
  const [view, setView] = useState('dashboard')
  const [sel, setSel] = useState(null)
  const [mod, setMod] = useState(null)
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userEmpRecord, setUserEmpRecord] = useState(null)

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
      const [eR, dR, oR, dcR, pR, rR, sR] = await Promise.all([
        supabase.from('employees').select('*').eq('org_id', orgId),
        supabase.from('disciplines').select('*').eq('org_id', orgId),
        supabase.from('onboarding').select('*').eq('org_id', orgId),
        supabase.from('documents').select('*').eq('org_id', orgId),
        supabase.from('payroll_items').select('*').eq('org_id', orgId),
        supabase.from('workplace_reports').select('*').eq('org_id', orgId),
        supabase.from('separations').select('*').eq('org_id', orgId)
      ])
      setEmps(eR.data||[])
      setDisc(dR.data||[])
      setSeparations(sR.data||[])
      const om={}; (oR.data||[]).forEach(r=>{if(!om[r.employee_id])om[r.employee_id]={};om[r.employee_id][r.step_id]=r.completed}); setOnb(om)
      const dm={}; (dcR.data||[]).forEach(r=>{if(!dm[r.employee_id])dm[r.employee_id]={};dm[r.employee_id][r.doc_id]=r.received}); setDocs(dm)
      setPay(pR.data||[])
      setReports(rR.data||[])
    }
    load()
  }, [orgId])

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
  const toggleOnb = async(empId,stepId,cur)=>{
    const nv=!cur
    const ex=await supabase.from('onboarding').select('id').eq('employee_id',empId).eq('step_id',stepId).single()
    if(ex.data)await supabase.from('onboarding').update({completed:nv}).eq('id',ex.data.id)
    else await supabase.from('onboarding').insert({employee_id:empId,step_id:stepId,completed:nv,org_id:orgId})
    setOnb(p=>({...p,[empId]:{...(p[empId]||{}),[stepId]:nv}}))
  }
  const toggleDoc = async(empId,docId,cur)=>{
    const nv=!cur
    const ex=await supabase.from('documents').select('id').eq('employee_id',empId).eq('doc_id',docId).single()
    if(ex.data)await supabase.from('documents').update({received:nv}).eq('id',ex.data.id)
    else await supabase.from('documents').insert({employee_id:empId,doc_id:docId,received:nv,org_id:orgId})
    setDocs(p=>({...p,[empId]:{...(p[empId]||{}),[docId]:nv}}))
  }
  const savePay = async(item)=>{
    if(item.id){await supabase.from('payroll_items').update(item).eq('id',item.id);setPay(p=>p.map(x=>x.id===item.id?item:x))}
    else{const{data}=await supabase.from('payroll_items').insert({...item,org_id:orgId}).select().single();if(data)setPay(p=>[...p,data])}
    sh('Payroll updated ✓')
  }
  const markAllPay = async()=>{
    const pnd=pay.filter(p=>p.status==='pending')
    for(const p of pnd)await supabase.from('payroll_items').update({status:'processed'}).eq('id',p.id)
    setPay(prev=>prev.map(p=>p.status==='pending'?{...p,status:'processed'}:p))
    sh(`${pnd.length} items processed ✓`)
  }
  const lpr = pay.filter(p=>p.status==='processed').sort((a,b)=>new Date(b.processed_at||b.created_at)-new Date(a.processed_at||a.created_at))[0]

  // ── Dashboard Stats (role-filtered) ──
  const sts={
    total:emps.length,active:ac.length,
    union:ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length,
    disc:disc.filter(d=>(d.status||d.st)==='open'&&isDiscActive(d)).length,
    newHires:ac.filter(e=>dbt(e.hire_date||td,td)<=90).length,
    pP:pay.filter(p=>p.status==='pending').length,
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
    if (isAdmin) {
      cards.push({l:'Payroll',v:sts.pP,c:C.go,k:'payroll'})
    }
    return cards
  }

  const alerts=[]
  if (canManage) {
    ac.filter(e=>dbt(e.hire_date||td,td)<=90).forEach(e=>alerts.push({t:'New Hire',m:`${gn(e)} — Day ${dbt(e.hire_date||td,td)}`,c:C.bl}))
    disc.filter(d=>(d.status||d.st)==='open'&&isDiscActive(d)).forEach(d=>alerts.push({t:'Open Disc',m:`${d.employee_name||'Employee'} — ${d.type}`,c:C.am}))
    emps.filter(e=>e.status==='laid_off').forEach(e=>{
      const recallDate = e.expected_recall_date
      if (recallDate) {
        const daysUntil = Math.floor((new Date(recallDate) - new Date()) / (1000*60*60*24))
        alerts.push({t:'Recall Due',m:`${gn(e)} — ${daysUntil <= 0 ? 'PAST DUE' : daysUntil + ' days'}`,c:'#6366F1'})
      } else {
        alerts.push({t:'Laid Off',m:`${gn(e)} — no recall date set`,c:'#6366F1'})
      }
    })
  }
  if (isAdmin && sts.pP>0) alerts.push({t:'Payroll',m:`${sts.pP} pending items`,c:C.rd})

  // ── Tab Configuration (role-filtered) ──
  const ADMIN_TABS = ['onboard','payroll','documents','reports']
  const MANAGER_TABS = ['onboard']
  const allTabs=[
    {k:'dashboard',l:'Home',i:'◆'},
    {k:'employees',l:'Team',i:'◉'},
    {k:'orgchart',l:'Org',i:'⊞'},
    {k:'workplace',l:'Workplace',i:'⚡'},
    {k:'onboard',l:'Onb',i:'★'},
    {k:'union',l:'Union',i:'⊕'},
    {k:'payroll',l:'PR',i:'$'},
    {k:'documents',l:'Docs',i:'▤'},
    {k:'resources',l:'Resources',i:'◇'},
    {k:'reports',l:'Rpt',i:'◧'}
  ]
  const tabs = allTabs.filter(t => {
    if (isAdmin) return true
    if (isManager && MANAGER_TABS.includes(t.k)) return true
    if (ADMIN_TABS.includes(t.k)) return false
    return true
  })

  return(<div>
    {/* Tab Nav */}
    <div style={{display:'flex',gap:2,flexWrap:'wrap',alignItems:'center',marginBottom:12,padding:'8px 0',borderBottom:`1px solid ${C.bdr}`}}>
      {tabs.map(t=><button key={t.k} onClick={()=>go(t.k)} style={{background:view===t.k?C.gD:'transparent',border:`1px solid ${view===t.k?C.go:C.bdrF}`,color:view===t.k?C.go:C.g,padding:'4px 8px',borderRadius:6,cursor:'pointer',fontSize:10,fontWeight:500,display:'flex',alignItems:'center',gap:2,fontFamily:'inherit'}}>{t.i} {t.l}{t.k==='payroll'&&sts.pP>0&&<span style={{background:C.rd,color:'#fff',borderRadius:99,padding:'0 4px',fontSize:8,marginLeft:1}}>{sts.pP}</span>}</button>)}
    </div>

    {/* DASHBOARD */}
    {view==='dashboard'&&<div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
        {getDashCards().map(s=>
          <Card key={s.l} C={C}><div style={{fontSize:10,color:C.g,textTransform:'uppercase',letterSpacing:1}}>{s.l}</div><div style={{fontSize:28,fontWeight:700,color:s.c}}>{s.v}</div></Card>)}
      </div>
      {alerts.length>0&&<Card C={C} style={{marginBottom:16}}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>⚠ Alerts</h3>
        {alerts.map((a,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:i<alerts.length-1?`1px solid ${C.bdr}`:'none'}}><span style={{fontSize:12,color:C.w}}>{a.m}</span><Tag c={a.c}>{a.t}</Tag></div>)}</Card>}
      {isAdmin&&<Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Quick Links</h3><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Btn small onClick={()=>go('employees')} C={C}>+ Employee</Btn><Btn small onClick={()=>go('workplace')} C={C}>+ Discipline</Btn><Btn small onClick={()=>go('payroll')} C={C}>Run Payroll</Btn></div></Card>}
    </div>}

    {/* TEAM */}
    {view==='employees'&&<TeamView emps={emps} ac={ac} sel={sel} setSel={setSel} mod={mod} setMod={setMod} saveEmp={saveEmp} C={C} isAdmin={isAdmin} isManager={isManager} isHR={isHR} userEmpRecord={userEmpRecord} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions} disc={disc}/>}

    {/* ORG CHART */}
    {view==='orgchart'&&<OrgChartView emps={ac} C={C}/>}

    {/* WORKPLACE (replaces Discipline) */}
    {view==='workplace'&&<WorkplaceView
      disc={disc} setDisc={setDisc} saveDisc={saveDisc}
      reports={reports} saveReport={saveReport} setReports={setReports}
      separations={separations} saveSeparation={saveSeparation} recallEmployee={recallEmployee}
      emps={emps} setEmps={setEmps} ac={ac} mod={mod} setMod={setMod} C={C}
      isAdmin={isAdmin} isHR={isHR} isManager={isManager}
      userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}

    {/* ONBOARDING */}
    {view==='onboard'&&<OnbView ac={ac} onb={onb} toggleOnb={toggleOnb} C={C}/>}

    {/* UNION */}
    {view==='union'&&<UnionView ac={ac} C={C}/>}

    {/* PAYROLL */}
    {view==='payroll'&&<PayView pay={pay} sts={sts} lpr={lpr} markAllPay={markAllPay} savePay={savePay} ac={ac} mod={mod} setMod={setMod} C={C}/>}

    {/* DOCUMENTS */}
    {view==='documents'&&<DocsView ac={ac} docs={docs} toggleDoc={toggleDoc} C={C}/>}

    {/* EMPLOYEE RESOURCES */}
    {view==='resources'&&<ResourcesView C={C} isAdmin={isAdmin} isManager={isManager}/>}

    {/* REPORTS */}
    {view==='reports'&&<RptView emps={emps} ac={ac} disc={disc} pay={pay} reports={reports} C={C}/>}

    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:C.go,color:C.bg,padding:'10px 18px',borderRadius:8,fontWeight:600,fontSize:13,zIndex:1e3}}>{toast}</div>}
  </div>)
}

// ═══════════════════════════════════════════
// ── TEAM VIEW ──
// ═══════════════════════════════════════════
function TeamView({emps,ac,sel,setSel,mod,setMod,saveEmp,C,isAdmin,isManager,isHR,userEmpRecord,resolveReportsTo,managerOptions,disc}){
  const[filter,setFilter]=useState('')

  // Determine visible employees based on role
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

  const filtered=visibleEmps.filter(e=>gn(e).toLowerCase().includes(filter.toLowerCase()))
  const activeVisible = filtered.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive')

  // Fields visible to non-admins (hide pay rate)
  const readOnlyFields = [
    ['dept','Department'],['hire_date','Hire Date'],['role','Classification'],
    ['union_status','Union Status'],['email','Email'],['phone','Phone'],
    ['ec_name','Emergency Contact'],['ec_phone','Emergency Phone'],['reports_to','Reports To']
  ]

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h2 style={{margin:0,fontSize:18}}>Team ({activeVisible.length})</h2>{isAdmin&&<Btn small gold onClick={()=>{setSel(null);setMod('emp')}} C={C}>+ Add</Btn>}</div>
    <input placeholder="Search..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%',padding:'8px 12px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:8,color:C.w,fontSize:13,marginBottom:10,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}/>
    {filtered.map(e=><Card key={e.id} C={C} style={{marginBottom:6,cursor:isAdmin?'pointer':'default',padding:'10px 14px'}}>
      <div onClick={()=>{if(isAdmin){setSel(e);setMod('emp')}else{setSel(sel?.id===e.id?null:e)}}} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontWeight:600,fontSize:14}}>{gn(e)}</div><div style={{fontSize:11,color:C.g}}>{e.role||'—'} • {e.dept||e.department||'—'}</div></div>
        <div style={{textAlign:'right'}}><Tag c={e.status==='Active'||e.status==='active'?C.gr:e.status==='Terminated'||e.status==='terminated'?C.rd:e.status==='laid_off'?'#6366F1':C.am}>{e.status==='laid_off'?'Laid Off':e.status||'Active'}</Tag>
          {e.status==='laid_off'&&e.expected_recall_date&&<div style={{fontSize:9,color:'#6366F1',marginTop:1}}>Recall: {fm(e.expected_recall_date)}</div>}
          <div style={{fontSize:10,color:C.g,marginTop:2}}>{e.union_status||'—'}</div></div>
      </div>
      {/* Read-only detail for non-admin when card is selected */}
      {!isAdmin&&sel?.id===e.id&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr}`,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        {readOnlyFields.map(([k,l])=>
          <div key={k} style={{fontSize:11}}><span style={{color:C.g,textTransform:'uppercase',fontSize:9}}>{l}</span><div style={{color:C.w}}>{k==='reports_to'?resolveReportsTo(e[k]):(e[k]||'—')}</div></div>
        )}
        {/* Discipline History (HR/Manager only) */}
        {(isHR || isManager) && (() => {
          const empDisc = disc.filter(d => d.employee_id === e.id).sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at))
          const activeCount = empDisc.filter(d => isDiscActive(d) && PROGRESSION_CHAIN.includes(d.type)).length
          if (empDisc.length === 0) return null
          return <div style={{gridColumn:'1/-1',marginTop:6,paddingTop:8,borderTop:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:9,color:C.am,textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Discipline History ({empDisc.length}) · {activeCount} active progressive</div>
            {empDisc.map((d,i) => {
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
    </Card>)}
    {isAdmin&&mod==='emp'&&<EmpModal emp={sel} onSave={saveEmp} onClose={()=>setMod(null)} C={C} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions}/>}
  </div>)
}

function EmpModal({emp,onSave,onClose,C,resolveReportsTo,managerOptions}){
  const[f,setF]=useState(emp||{status:'Active'})
  const up=(k,v)=>setF(p=>({...p,[k]:v}))
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}}>
    <div style={{background:C.bg2,borderRadius:12,padding:24,width:420,maxHeight:'80vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}><h3 style={{margin:0,fontSize:16}}>{emp?'Edit':'New'} Employee</h3><button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {EMP_FIELDS.map(([k,l])=><div key={k}><label style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{l}</label>
          {k==='role'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>{['','C-Level','Manager','Lead','Staff'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='dept'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>{[''].concat(DEPARTMENTS).map(s=><option key={s}>{s}</option>)}</select>
          :k==='status'?<select value={f[k]||'Active'} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['active','laid_off','on_leave','probation','terminated','inactive'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='union_status'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['','Union Active','Non-Union','1099','Probation'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='reports_to'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            <option value="">— None —</option>
            {managerOptions.map(m=><option key={m.id} value={m.id}>{gn(m)} ({m.role})</option>)}
          </select>
          :k==='emp_code'?<input value={f[k]||''} readOnly style={{width:'100%',padding:'6px 8px',background:C.nL,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.g,fontSize:12,boxSizing:'border-box',fontFamily:'inherit',cursor:'not-allowed'}}/>
          :<input value={f[k]||''} onChange={e=>up(k,e.target.value)} type={['hire_date','dob','seniority_date','layoff_date','expected_recall_date'].includes(k)?'date':'text'} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}}/>}
        </div>)}
      </div>
      <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}><Btn ghost small onClick={onClose} C={C}>Cancel</Btn><Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Save</Btn></div>
    </div></div>)
}

// ═══════════════════════════════════════════
// ── ORG CHART VIEW (Tree from reports_to) ──
// ═══════════════════════════════════════════
function OrgChartView({emps, C}){
  // Build tree: find roots (no reports_to or reports_to not in employee list)
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
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          padding:'6px 12px', borderRadius:8,
          background:rc.bg, border:`1px solid ${rc.border}`,
          fontSize:12
        }}>
          <div style={{width:8,height:8,borderRadius:99,background:rc.border,flexShrink:0}}/>
          <div>
            <span style={{fontWeight:600,color:rc.text}}>{gn(emp)}</span>
            <span style={{color:rc.text,opacity:0.7,marginLeft:6,fontSize:10}}>{emp.role||'Staff'} • {emp.dept||'—'}</span>
          </div>
        </div>
        {directs.map(d => renderNode(d, depth+1))}
      </div>
    )
  }

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:4}}>Organization Chart</h2>
    <div style={{fontSize:11,color:C.g,marginBottom:12}}>View only — full hierarchy from reporting structure.</div>
    <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
      {Object.entries(ROLE_COLORS).map(([role,rc])=>(
        <div key={role} style={{display:'flex',alignItems:'center',gap:4,fontSize:10}}>
          <div style={{width:8,height:8,borderRadius:99,background:rc.border}}/>
          <span style={{color:C.g}}>{role}</span>
        </div>
      ))}
    </div>
    <Card C={C} style={{padding:16,overflowX:'auto'}}>
      {roots.length === 0
        ? <div style={{color:C.g,textAlign:'center',padding:20}}>No reporting structure found. Set "Reports To" on employee records.</div>
        : roots.map(r => renderNode(r, 0))
      }
    </Card>
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
    if (days < 365) return `${days}d`
    const yrs = Math.floor(days / 365)
    const remaining = days % 365
    const mos = Math.floor(remaining / 30)
    return `${yrs}y ${mos}m`
  }

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:4}}>Union Seniority List ({unionEmps.length})</h2>
    <div style={{fontSize:11,color:C.g,marginBottom:12}}>Sorted by hire date (ascending). Actual seniority begins 30 working days after hire.</div>
    <Card C={C}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${C.bdr}`}}>
              {['#','Name','Dept','Local','Hire Date','Tenure','Status'].map(h=>
                <th key={h} style={{textAlign:'left',padding:'8px',color:C.g,fontSize:10,textTransform:'uppercase',letterSpacing:0.5}}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {unionEmps.map((e,i)=>(
              <tr key={e.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
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
// ── WORKPLACE VIEW (Reports + Discipline) ──
// ═══════════════════════════════════════════
function WorkplaceView({disc,setDisc,saveDisc,reports,saveReport,setReports,separations,saveSeparation,recallEmployee,emps,setEmps,ac,mod,setMod,C,isAdmin,isHR,isManager,userEmail,userEmpRecord}){
  const [subTab, setSubTab] = useState('reports')

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:8}}>Workplace</h2>
    <div style={{display:'flex',gap:2,marginBottom:16}}>
      {[{k:'reports',l:'Reports',i:'◉',show:true},{k:'discipline',l:'Formal Discipline',i:'⚡',show:isHR},{k:'separations',l:'Separations',i:'◇',show:isHR}].map(t=>{
        if (!t.show) return null
        return <button key={t.k} onClick={()=>setSubTab(t.k)} style={{
          background:subTab===t.k?C.gD:'transparent',
          border:`1px solid ${subTab===t.k?C.go:C.bdrF}`,
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
      separations={separations} saveSeparation={saveSeparation} recallEmployee={recallEmployee}
      emps={emps} setEmps={setEmps} ac={ac} disc={disc} mod={mod} setMod={setMod} C={C}
      userEmail={userEmail} userEmpRecord={userEmpRecord}
    />}
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
        {viewReport?.id===r.id&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr}`}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Submitted By</span><div>{r.submitted_by_name||r.submitted_by_email||'—'}</div></div>
            <div style={{fontSize:11}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Routed To</span><div>{r.routed_to ? (emps.find(e=>e.id===r.routed_to) ? gn(emps.find(e=>e.id===r.routed_to)) : r.routed_to) : '—'}</div></div>
            <div style={{fontSize:11,gridColumn:'1/-1'}}><span style={{color:C.g,fontSize:9,textTransform:'uppercase'}}>Full Description</span><div style={{whiteSpace:'pre-wrap',lineHeight:1.5}}>{r.description||'—'}</div></div>
          </div>
          {(isHR || (isManager && r.routed_to === userEmpRecord?.id)) && <div style={{display:'flex',gap:4,marginTop:8}}>
            {REPORT_STATUSES.filter(s=>s.v!==r.status).map(s=>
              <button key={s.v} onClick={(e)=>{e.stopPropagation();updateStatus(r,s.v)}} style={{
                padding:'4px 10px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',
                background:'transparent',border:`1px solid ${s.c}`,color:s.c
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
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:440,maxHeight:'80vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
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
            border:`1px solid ${f.report_type===t.v?t.c:C.bdr}`,
            color:f.report_type===t.v?t.c:C.g
          }}>{t.i} {t.l}</button>
        )}
      </div>

      <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}}>About (Employee)</label>
      <select value={f.subject_employee_id||''} onChange={e=>handleSubjectChange(e.target.value)} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:4,fontFamily:'inherit'}}>
        <option value="">Select Employee</option>
        {emps.map(e=><option key={e.id} value={e.id}>{gn(e)} — {e.dept||'—'}</option>)}
      </select>
      {f.routed_to_name && <div style={{fontSize:10,color:C.g,marginBottom:10}}>Auto-routed to: <b style={{color:C.go}}>{f.routed_to_name}</b></div>}

      <label style={{fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}}>Description</label>
      <textarea value={f.description||''} onChange={e=>setF(p=>({...p,description:e.target.value}))} rows={4} placeholder="Describe the concern, incident, safety issue, or praise..." style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:12,boxSizing:'border-box',fontFamily:'inherit',resize:'vertical'}}/>

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
      return <div key={d.id} onClick={()=>setViewRecord(d)} style={{cursor:'pointer'}}>
        <Card C={C} style={{marginBottom:6,padding:'10px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <b style={{fontSize:13}}>{d.employee_name||'—'}</b>{' '}
            <Tag c={dt?dt.c:C.g}>{dt?dt.l:d.type}</Tag>
            {isProgressive && <span style={{
              display:'inline-block',padding:'1px 6px',borderRadius:99,fontSize:8,fontWeight:700,marginLeft:4,
              background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
              color:active?'#22C55E':'#6B7280',border:`1px solid ${active?'#22C55E':'#6B7280'}`
            }}>{active ? `Active · ${daysRemaining}d left` : 'Retired'}</span>}
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

  const handlePrint = () => {
    const natures = (r.natures||'').split(', ').filter(Boolean)
    const html = `<!DOCTYPE html><html><head><title>Discipline Record — ${r.employee_name||'Employee'}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:40px;color:#111;font-size:13px;line-height:1.6}
      h1{font-size:18px;margin-bottom:2px} h2{font-size:13px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:3px;text-transform:uppercase;letter-spacing:1px;color:#555}
      .field{margin-bottom:6px} .label{font-weight:bold;color:#555;font-size:10px;text-transform:uppercase}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .natures{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}
      .nature-tag{padding:3px 8px;border:1px solid #999;border-radius:4px;font-size:11px}
      .nature-tag.checked{background:#FEE2E2;border-color:#DC2626;font-weight:bold}
      .prior{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:10px;margin:6px 0}
      .weingarten{background:#FFFBEB;border:2px solid #F59E0B;border-radius:6px;padding:12px;margin:12px 0}
      .sig-box{border:1px solid #E5E7EB;border-radius:6px;padding:10px 14px;margin-bottom:8px}
      .sig-name{font-size:16px;font-style:italic;margin:4px 0} .sig-ts{font-size:9px;color:#888}
      .e-sig-notice{font-size:8px;color:#999;text-align:center;margin-top:12px;font-style:italic}
      @media print{body{margin:20px}button{display:none}}
    </style></head><body>
    <div style="text-align:center;margin-bottom:20px">
      <h1>UNSATISFACTORY PERFORMANCE AND/OR CONDUCT ACTION NOTICE</h1>
      <div style="color:#888;font-size:11px">Minuteman Press Uptown — Confidential</div>
    </div>
    <div class="weingarten">
      <div style="font-weight:bold;font-size:12px;color:#92400E;margin-bottom:4px">⚖ WEINGARTEN RIGHTS NOTICE</div>
      <div style="font-size:11px;color:#78350F;line-height:1.5">You have the right to request union representation during any investigatory interview that you reasonably believe may result in disciplinary action. If you request representation, the interview will be paused until a union representative is available.</div>
      <div style="margin-top:8px;font-size:11px"><b>Rights Offered:</b> ${r.weingarten_offered?'Yes':'No'} &nbsp; <b>Rep Requested:</b> ${r.weingarten_rep_requested?'Yes':'No'}${r.weingarten_rep_name?' &nbsp; <b>Rep:</b> '+r.weingarten_rep_name:''}</div>
    </div>
    <div class="grid">
      <div class="field"><div class="label">Employee Name</div>${r.employee_name||'—'}</div>
      <div class="field"><div class="label">Today's Date</div>${r.date||'—'}</div>
      <div class="field"><div class="label">Type of Report</div>${dt?.l||r.type||'—'}</div>
      <div class="field"><div class="label">Prepared By</div>${r.prepared_by||'—'}</div>
      <div class="field"><div class="label">Progressive Status</div>${PROGRESSION_CHAIN.includes(r.type) ? (isDiscActive(r) ? 'ACTIVE — ' + Math.max(0, 365 - Math.floor((new Date() - new Date(r.date || r.created_at)) / (1000*60*60*24))) + ' days remaining' : 'RETIRED (1yr+)') : 'N/A'}</div>
    </div>
    <h2>Nature of Incident</h2>
    <div class="natures">${INCIDENT_NATURES.map(n=>`<span class="nature-tag ${natures.includes(n)?'checked':''}">${natures.includes(n)?'☑':'☐'} ${n}</span>`).join('')}</div>
    <h2>Specifics of Incident</h2>
    <div class="field">${(r.specifics||r.description||'—').replace(/\n/g,'<br>')}</div>
    <h2>Current Disciplinary Action</h2>
    <div class="field">${(r.current_action||'—').replace(/\n/g,'<br>')}</div>
    ${r.employee_comments?`<h2>Employee's Comments</h2><div class="field">${r.employee_comments.replace(/\n/g,'<br>')}</div>`:''}
    ${(()=>{ let atts=[]; try{atts=typeof r.attachments==='string'?JSON.parse(r.attachments):(r.attachments||[])}catch(e){} return atts.length>0?`<h2>Attachments (${atts.length})</h2><div class="field">${atts.map(a=>`<div>📎 ${a.name||'File'}</div>`).join('')}</div>`:'' })()}
    <h2>Future Action if Unsatisfactory Performance Recurs</h2>
    <div class="field">${r.future_action||'If Performance doesn\'t improve, it may result in further disciplinary action, up to and including termination of employment.'}</div>
    <div style="font-weight:bold;font-style:italic;margin:12px 0">My signature below signifies that I have read and understand the above report.</div>
    <div style="margin:16px 0">
      <div class="sig-box"><div class="label">Employee Signature</div>${r.emp_signature?`<div class="sig-name">${r.emp_signature}</div><div class="sig-ts">${r.emp_sig_date||''}</div>`:'<div style="color:#999;padding:8px 0">— not signed —</div>'}</div>
      <div class="sig-box"><div class="label">Employer Signature</div>${r.employer_signature?`<div class="sig-name">${r.employer_signature}</div><div class="sig-ts">${r.sup_sig_date||''}</div>`:'<div style="color:#999;padding:8px 0">— not signed —</div>'}</div>
      <div class="sig-box"><div class="label">Witness Signature</div>${r.witness_name&&r.witness_sig_date?`<div class="sig-name">${r.witness_name}</div><div class="sig-ts">${r.witness_sig_date||''}</div>`:'<div style="color:#999;padding:8px 0">— none —</div>'}</div>
    </div>
    <div class="e-sig-notice">Electronic signatures applied via FlowSuite PeopleFlow. Each signature includes a timestamp and the signer's acknowledgment that it carries the same legal effect as a handwritten signature.</div>
    ${priorDisc.length>0?`<h2>Prior Discipline History</h2><div class="prior">${priorDisc.map(d=>`<div style="margin-bottom:4px"><b>${DISC_TYPES.find(t=>t.v===d.type)?.l||d.type}</b> — ${d.date||'—'} — ${d.natures||d.category||'—'} (${d.status||d.st||'open'})</div>`).join('')}</div>`:''}
    <div style="margin-top:30px;text-align:center;color:#999;font-size:9px">Generated by FlowSuite PeopleFlow — ${new Date().toLocaleString()}</div>
    </body></html>`
    const win = window.open('','_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(()=>win.print(), 500)
  }

  const natures = (r.natures||'').split(', ').filter(Boolean)
  const sec = {marginBottom:14}
  const slbl = {fontSize:9,color:C.g,textTransform:'uppercase',letterSpacing:1,marginBottom:2}

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:C.go,textTransform:'uppercase',letterSpacing:2}}>Discipline Record</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>{r.employee_name||'—'}</h3>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
          <button onClick={onEdit} style={{background:C.go,color:'#000',border:'none',padding:'4px 10px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>✎ Edit</button>
          <button onClick={handlePrint} style={{background:'transparent',border:`1px solid ${C.go}`,color:C.go,padding:'4px 10px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit'}}>🖨 Print / PDF</button>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
      </div>

      {/* Weingarten */}
      <div style={{background:'#FFFBEB',border:'2px solid #F59E0B',borderRadius:8,padding:'10px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'#92400E',marginBottom:4}}>⚖ WEINGARTEN RIGHTS NOTICE</div>
        <div style={{fontSize:11,color:'#78350F'}}>
          Rights Offered: <b>{r.weingarten_offered?'Yes':'No'}</b> &nbsp; Rep Requested: <b>{r.weingarten_rep_requested?'Yes':'No'}</b>
          {r.weingarten_rep_name && <span> &nbsp; Rep: <b>{r.weingarten_rep_name}</b></span>}
        </div>
      </div>

      {/* Grid info */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,...sec}}>
        <div><div style={slbl}>Date</div><div style={{fontSize:13,color:C.w}}>{fm(r.date)}</div></div>
        <div><div style={slbl}>Type</div><Tag c={dt?.c||C.g}>{dt?.l||r.type||'—'}</Tag></div>
        <div><div style={slbl}>Prepared By</div><div style={{fontSize:12,color:C.w}}>{r.prepared_by||'—'}</div></div>
        <div><div style={slbl}>Progressive Status</div>
          {PROGRESSION_CHAIN.includes(r.type) ? (() => {
            const active = isDiscActive(r)
            const discDate = r.date || r.created_at
            const daysSince = discDate ? Math.floor((new Date() - new Date(discDate)) / (1000*60*60*24)) : 0
            const daysLeft = Math.max(0, 365 - daysSince)
            return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700,
              background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
              color:active?'#22C55E':'#6B7280',border:`1px solid ${active?'#22C55E':'#6B7280'}`
            }}>{active ? `Active · ${daysLeft} days remaining` : 'Retired (1yr+)'}</span>
          })() : <span style={{fontSize:11,color:C.g}}>N/A — {r.type==='coaching'?'Coaching':'Commendation'}</span>}
        </div>
      </div>

      {/* Natures */}
      <div style={sec}>
        <div style={slbl}>Nature of Incident</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
          {INCIDENT_NATURES.map(n=>(
            <span key={n} style={{padding:'3px 8px',borderRadius:4,fontSize:10,
              background:natures.includes(n)?'#FEE2E2':'transparent',
              border:`1px solid ${natures.includes(n)?'#DC2626':C.bdr}`,
              color:natures.includes(n)?'#DC2626':C.g
            }}>{natures.includes(n)?'☑':'☐'} {n}</span>
          ))}
        </div>
      </div>

      {/* Specifics */}
      <div style={sec}><div style={slbl}>Specifics</div><div style={{fontSize:12,color:C.w,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{r.specifics||r.description||'—'}</div></div>

      {/* Current Action */}
      <div style={sec}><div style={slbl}>Current Disciplinary Action</div><div style={{fontSize:12,color:C.w}}>{r.current_action||'—'}</div></div>

      {/* Employee Comments */}
      {r.employee_comments && <div style={sec}><div style={slbl}>Employee's Comments</div><div style={{fontSize:12,color:C.w,whiteSpace:'pre-wrap'}}>{r.employee_comments}</div></div>}

      {/* Attachments */}
      {(()=>{
        let atts = []
        try { atts = typeof r.attachments === 'string' ? JSON.parse(r.attachments) : (r.attachments || []) } catch(e){}
        if (!atts || atts.length === 0) return null
        return <div style={sec}>
          <div style={slbl}>Attachments ({atts.length})</div>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
            {atts.map((att,i) => (
              <a key={i} href={att.url || '#'} target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:C.nL,borderRadius:4,border:`1px solid ${C.bdr}`,textDecoration:'none',color:C.w,fontSize:11}}>
                <span>📎</span>
                <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name||'File'}</span>
                <span style={{fontSize:9,color:C.g,flexShrink:0}}>{att.size ? (att.size/1024).toFixed(0)+'KB' : ''}</span>
                <span style={{fontSize:9,color:C.go,flexShrink:0}}>View ↗</span>
              </a>
            ))}
          </div>
        </div>
      })()}

      {/* Future Action */}
      <div style={{...sec,background:C.nL,borderRadius:6,padding:'8px 12px',border:`1px solid ${C.bdr}`}}>
        <div style={slbl}>Future Action Warning</div>
        <div style={{fontSize:11,color:C.w,lineHeight:1.5}}>{r.future_action||'If Performance doesn\'t improve, it may result in further disciplinary action, up to and including termination of employment.'}</div>
      </div>

      {/* Signatures */}
      <div style={{marginTop:14}}>
        <div style={slbl}>Signatures</div>
        <div style={{display:'grid',gap:6,marginTop:6}}>
          {[
            {label:'Employee',name:r.emp_signature,ts:r.emp_sig_date},
            {label:'Employer',name:r.employer_signature,ts:r.sup_sig_date},
            {label:'Witness',name:r.witness_name&&r.witness_sig_date?r.witness_name:null,ts:r.witness_sig_date}
          ].map((s,i)=>(
            <div key={i} style={{border:`1px solid ${s.name?'#22C55E':C.bdr}`,borderRadius:6,padding:'8px 12px',background:s.name?'rgba(34,197,94,0.05)':'transparent'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:9,color:C.g,textTransform:'uppercase'}}>{s.label} Signature</div>
                  {s.name ? <div style={{fontSize:14,fontStyle:'italic',color:C.w}}>{s.name}</div>
                    : <div style={{fontSize:11,color:C.g}}>— not signed —</div>}
                </div>
                {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:8,color:C.g,textAlign:'center',marginTop:8,fontStyle:'italic'}}>Electronic signatures carry the same legal effect as handwritten signatures per signer acknowledgment.</div>
      </div>

      {/* Prior History */}
      {priorDisc.length > 0 && <div style={{marginTop:14}}>
        <div style={slbl}>Prior Discipline History ({priorDisc.length})</div>
        <Card C={C} style={{padding:'8px 12px',marginTop:4}}>
          {priorDisc.map((d,i)=>{
            const pdt=DISC_TYPES.find(t=>t.v===d.type)
            const active = isDiscActive(d)
            const isProgressive = PROGRESSION_CHAIN.includes(d.type)
            return <div key={i} style={{fontSize:11,padding:'3px 0',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:active||!isProgressive?1:0.5}}>
              <span style={{display:'flex',alignItems:'center',gap:4}}>
                <Tag c={pdt?.c||C.g}>{pdt?.l||d.type}</Tag> {d.natures||d.category||'—'}
                {isProgressive && <span style={{fontSize:8,padding:'1px 5px',borderRadius:99,fontWeight:700,
                  background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
                  color:active?'#22C55E':'#6B7280'
                }}>{active?'Active':'Retired'}</span>}
              </span>
              <span style={{color:C.g}}>{fm(d.date||d.created_at)}</span>
            </div>
          })}
        </Card>
      </div>}
    </div>
  </div>)
}

// ── Edit Discipline Record Modal ──
function EditDisciplineModal({record,onSave,onClose,C,emps,disc,userEmail,userEmpRecord}){
  const [f, setF] = useState({...record})
  const [selNatures, setSelNatures] = useState((record.natures||'').split(', ').filter(Boolean))
  const [attachments, setAttachments] = useState([])
  const [existingAtts, setExistingAtts] = useState(()=>{
    try { return typeof record.attachments === 'string' ? JSON.parse(record.attachments) : (record.attachments || []) } catch(e){ return [] }
  })
  const [uploading, setUploading] = useState(false)
  const [sigMode, setSigMode] = useState(null)
  const [sigName, setSigName] = useState('')
  const up = (k,v) => setF(p=>({...p,[k]:v}))

  const toggleNature = (n) => { setSelNatures(prev => prev.includes(n) ? prev.filter(x=>x!==n) : [...prev, n]) }

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files)
    const total = existingAtts.length + attachments.length + files.length
    if (total > 7) { alert('Maximum 7 attachments total'); return }
    setAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }
  const removeNewFile = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx))
  const removeExistingAtt = (idx) => setExistingAtts(prev => prev.filter((_, i) => i !== idx))

  const applySignature = () => {
    if (!sigName.trim()) return
    const ts = new Date().toISOString()
    if (sigMode === 'employee') { up('emp_signature', sigName.trim()); up('emp_sig_date', ts) }
    else if (sigMode === 'employer') { up('employer_signature', sigName.trim()); up('sup_sig_date', ts) }
    else if (sigMode === 'witness') { up('witness_name', sigName.trim()); up('witness_sig_date', ts) }
    setSigName(''); setSigMode(null)
  }

  const fmSigTs = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  }

  const handleSave = async () => {
    setUploading(true)
    try {
      const uploaded = [...existingAtts]
      for (const file of attachments) {
        const ts = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `discipline/${f.employee_id || 'unknown'}/${ts}_${safeName}`
        const { error: upErr } = await supabase.storage.from('flowsuite-files').upload(path, file)
        if (upErr) { console.error('Upload error:', upErr); continue }
        const { data: urlData } = supabase.storage.from('flowsuite-files').getPublicUrl(path)
        uploaded.push({ name: file.name, path, url: urlData?.publicUrl || path, size: file.size, type: file.type, uploaded_at: new Date().toISOString() })
      }
      const updated = { ...f, natures: selNatures.join(', '), attachments: uploaded.length > 0 ? JSON.stringify(uploaded) : null }
      // Remove fields Supabase won't accept on update
      delete updated.created_at
      onSave(updated)
    } catch (err) { console.error('Save error:', err) }
    setUploading(false)
  }

  const inp = {width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  // Signature overlay
  if (sigMode) {
    const labels = {employee:'Employee Signature',employer:'Employer Signature',witness:'Witness Signature'}
    return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1001}}>
      <div style={{background:C.bg2,borderRadius:16,padding:32,width:420,border:`2px solid ${C.go}`,textAlign:'center'}}>
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
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
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
        <div><label style={lbl}>Prepared By</label><input value={f.prepared_by||''} readOnly style={{...inp,opacity:0.7}}/></div>
      </div>

      {/* Natures */}
      <label style={{...lbl,marginBottom:6}}>Nature of Incident</label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
        {INCIDENT_NATURES.map(n=>(<button key={n} onClick={()=>toggleNature(n)} style={{
          padding:'6px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',textAlign:'left',
          background:selNatures.includes(n)?'#FEE2E2':'transparent',border:`1px solid ${selNatures.includes(n)?'#DC2626':C.bdr}`,color:selNatures.includes(n)?'#DC2626':C.g
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
      <div style={{border:`1px dashed ${C.bdr}`,borderRadius:8,padding:'12px 14px',marginBottom:12,background:C.nL}}>
        {existingAtts.map((att,i) => (
          <div key={'ex'+i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:`1px solid ${C.bdr}`,marginBottom:4}}>
            <div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
              <span style={{fontSize:12}}>📎</span>
              <span style={{fontSize:11,color:C.w,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name||'File'}</span>
            </div>
            <button onClick={()=>removeExistingAtt(i)} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>×</button>
          </div>
        ))}
        {attachments.map((file,i) => (
          <div key={'new'+i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:`1px solid #22C55E`,marginBottom:4}}>
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
      <div style={{background:C.nL,borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:12,color:C.w,lineHeight:1.5,border:`1px solid ${C.bdr}`}}>
        If Performance doesn't improve, it may result in further disciplinary action, up to and including termination of employment.
        <div style={{marginTop:6,fontSize:11,fontWeight:600,fontStyle:'italic'}}>My signature below signifies that I have read and understand the above report.</div>
      </div>

      {/* Signatures */}
      <label style={{...lbl,marginBottom:8,fontSize:11}}>Signatures</label>
      <div style={{display:'grid',gap:8,marginBottom:16}}>
        {[
          {key:'employee',label:'Employee Signature',name:f.emp_signature,ts:f.emp_sig_date,clear:()=>{up('emp_signature','');up('emp_sig_date','')}},
          {key:'employer',label:'Employer Signature',name:f.employer_signature,ts:f.sup_sig_date,clear:()=>{up('employer_signature','');up('sup_sig_date','')}},
          {key:'witness',label:'Witness Signature',name:f.witness_name&&f.witness_sig_date?f.witness_name:null,ts:f.witness_sig_date,clear:()=>{up('witness_name','');up('witness_sig_date','')}}
        ].map((s,i)=>(
          <div key={i} style={{border:`1px solid ${s.name?'#22C55E':C.bdr}`,borderRadius:8,padding:'10px 14px',background:s.name?'rgba(34,197,94,0.05)':'transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{s.label}</div>
                {s.name ? <div style={{fontSize:14,fontStyle:'italic',color:C.w,marginTop:2}}>{s.name}</div> : <div style={{fontSize:11,color:C.g,marginTop:2}}>{s.key==='witness'?'Optional':'Not yet signed'}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
                {!s.name ? <button onClick={()=>setSigMode(s.key)} style={{background:s.key==='witness'?'transparent':C.go,color:s.key==='witness'?C.go:'#000',border:s.key==='witness'?`1px solid ${C.go}`:'none',padding:'5px 12px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginTop:2}}>Tap to Sign</button>
                  : <button onClick={s.clear} style={{background:'transparent',border:`1px solid ${C.bdr}`,color:C.g,padding:'3px 8px',borderRadius:4,fontSize:9,cursor:'pointer',fontFamily:'inherit',marginTop:2}}>Clear</button>}
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
        const path = `discipline/${f.employee_id || 'unknown'}/${ts}_${safeName}`
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

  const inp = {width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  // ── Signature Overlay ──
  if (sigMode) {
    const labels = {employee:'Employee Signature',employer:'Employer Signature',witness:'Witness Signature'}
    return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1001}}>
      <div style={{background:C.bg2,borderRadius:16,padding:32,width:420,border:`2px solid ${C.go}`,textAlign:'center'}}>
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
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
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
          <label style={lbl}>Prepared By</label>
          <input value={f.prepared_by||''} readOnly style={{...inp,opacity:0.7,cursor:'default'}}/>
        </div>
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
        <Card C={C} style={{marginBottom:12,padding:'8px 12px',background:C.aD,border:`1px solid ${C.am}`}}>
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
                  background:active?'rgba(34,197,94,0.15)':'rgba(107,114,128,0.15)',
                  color:active?'#22C55E':'#6B7280'
                }}>{active?`Active · ${daysLeft}d`:'Retired'}</span>
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
            border:`1px solid ${selNatures.includes(n)?'#DC2626':C.bdr}`,
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

      {/* ── Employee Comments ── */}
      <label style={lbl}>Employee's Comments</label>
      <textarea value={f.employee_comments||''} onChange={e=>up('employee_comments',e.target.value)} rows={2} placeholder="Employee's response or comments..." style={{...inp,resize:'vertical',marginBottom:10}}/>

      {/* ── Attachments (up to 7) ── */}
      <label style={{...lbl,marginBottom:6}}>Attachments <span style={{fontWeight:400,textTransform:'none'}}>({attachments.length}/7 — emails, documents, photos)</span></label>
      <div style={{border:`1px dashed ${C.bdr}`,borderRadius:8,padding:'12px 14px',marginBottom:12,background:C.nL}}>
        {attachments.length > 0 && <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
          {attachments.map((file,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',background:C.bg2,borderRadius:4,border:`1px solid ${C.bdr}`}}>
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
      <div style={{background:C.nL,borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:12,color:C.w,lineHeight:1.5,border:`1px solid ${C.bdr}`}}>
        If Performance doesn't improve, it may result in further disciplinary action, up to and including termination of employment.
        <div style={{marginTop:6,fontSize:11,fontWeight:600,fontStyle:'italic'}}>My signature below signifies that I have read and understand the above report.</div>
      </div>

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
          <div key={i} style={{border:`1px solid ${s.name?'#22C55E':C.bdr}`,borderRadius:8,padding:'10px 14px',background:s.name?'rgba(34,197,94,0.05)':'transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{s.label}</div>
                {s.name ? <div style={{fontSize:14,fontStyle:'italic',color:C.w,marginTop:2}}>{s.name}</div>
                  : <div style={{fontSize:11,color:C.g,marginTop:2}}>{s.key==='witness'?'Optional — tap to add':'Not yet signed'}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                {s.ts && <div style={{fontSize:9,color:C.g}}>{fmSigTs(s.ts)}</div>}
                {!s.name ?
                  <button onClick={()=>setSigMode(s.key)} style={{background:s.key==='witness'?'transparent':C.go,color:s.key==='witness'?C.go:'#000',border:s.key==='witness'?`1px solid ${C.go}`:'none',padding:'5px 12px',borderRadius:6,fontSize:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginTop:2}}>Tap to Sign</button>
                  : <button onClick={s.clear} style={{background:'transparent',border:`1px solid ${C.bdr}`,color:C.g,padding:'3px 8px',borderRadius:4,fontSize:9,cursor:'pointer',fontFamily:'inherit',marginTop:2}}>Clear</button>
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

// ═══════════════════════════════════════════
// ── SEPARATIONS SUB-TAB (HR Only) ──
// ═══════════════════════════════════════════
function SeparationsSubView({separations,saveSeparation,recallEmployee,emps,setEmps,ac,disc,mod,setMod,C,userEmail,userEmpRecord}){
  const [viewSep, setViewSep] = useState(null)
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
        {viewSep?.id===s.id&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr}`}}>
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
                {prob.remaining > 0 && <div>New-hire probation (90-day): <b>{prob.elapsed}</b> active days / 90 — <b style={{color:prob.frozen?'#7C3AED':'#22C55E'}}>{prob.frozen?`FROZEN (${prob.remaining}d remaining)`:`${prob.remaining}d remaining`}</b></div>}
                {prob.remaining === 0 && <div style={{color:C.g}}>New-hire probation: Complete ✓</div>}
                {lca && <div style={{marginTop:3}}>Disciplinary probation (LCA): <b>{lca.elapsedActive}</b> active days / {lca.durationDays} — <b style={{color:lca.isFrozen?'#7C3AED':'#22C55E'}}>{lca.isFrozen?`FROZEN (${lca.remaining}d remaining)`:`${lca.remaining}d remaining`}</b>{lca.freezeDays>0&&` (${lca.freezeDays}d frozen)`}</div>}
              </div>
            })()}
          </div>}

          {/* Action buttons */}
          <div style={{display:'flex',gap:6,marginTop:10}}>
            {st?.hasRecall && !isRecalled && <button onClick={(e)=>{e.stopPropagation();if(confirm('Recall this employee? This will set their status back to Active and resume all probation clocks.'))recallEmployee(s)}} style={{background:'#22C55E',color:'#fff',border:'none',padding:'6px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>↩ Recall Employee</button>}
            {s.separation_type==='layoff'&&s.employee_name&&s.effective_date&&<button onClick={(e)=>{e.stopPropagation();generateLayoffLetter(s)}} style={{background:'#6366F1',color:'#fff',border:'none',padding:'6px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>🖨 Print Layoff Notice</button>}
          </div>
        </div>}
      </Card></div>
    })}

    {sorted.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No separation records.</Card>}

    {mod==='separation'&&<SeparationFormModal
      onSave={saveSeparation} onClose={()=>setMod(null)} C={C}
      emps={[...ac,...emps.filter(e=>e.status==='laid_off')] } allEmps={emps} disc={disc}
      userEmail={userEmail} userEmpRecord={userEmpRecord} setEmps={setEmps}
    />}
  </div>)
}

const generateLayoffLetter = (s) => {
  const reasonLabels = {lack_of_work:'lack of work',reduction_in_force:'a reduction in force',seasonal:'seasonal reduction',restructuring:'restructuring',other:'business reasons'}
  const reason = reasonLabels[s.layoff_reason] || 'lack of work'
  const recallStr = s.expected_recall_date ? `Your expected recall date is approximately <b>${new Date(s.expected_recall_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</b>. You will be notified in advance when work becomes available.` : 'You will be notified when work becomes available and a recall date is determined.'
  const html = `<!DOCTYPE html><html><head><title>Layoff Notice — ${s.employee_name}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:50px;color:#111;font-size:13px;line-height:1.8;max-width:700px}
    h1{font-size:16px;text-align:center;margin-bottom:4px}
    .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px}
    .subhead{font-size:11px;color:#666;text-align:center}
    .sig-line{border-bottom:1px solid #333;width:250px;display:inline-block;margin:0 10px}
    .sig-section{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
    .notice{background:#F5F3FF;border:1px solid #6366F1;border-radius:6px;padding:14px;margin:20px 0;font-size:12px}
    @media print{body{margin:30px}.notice{background:#F5F3FF !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="header">
    <h1>NOTICE OF TEMPORARY LAYOFF</h1>
    <div class="subhead">Minuteman Press Uptown — Confidential</div>
  </div>
  <p><b>Date:</b> ${new Date(s.effective_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
  <p><b>To:</b> ${s.employee_name}</p>
  <p><b>From:</b> ${s.prepared_by || 'Management'}</p>
  <p><b>Re:</b> Temporary Layoff — ${reason.charAt(0).toUpperCase()+reason.slice(1)}</p>
  <hr style="border:none;border-top:1px solid #ccc;margin:20px 0"/>
  <p>Dear ${(s.employee_name||'').split(' ')[0]||s.employee_name},</p>
  <p>This letter is to inform you that, due to ${reason}, your position at Minuteman Press Uptown will be temporarily laid off effective <b>${new Date(s.effective_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</b>.</p>
  <p>${recallStr}</p>
  <div class="notice">
    <b>Important Information:</b><br/>
    • Your seniority and hire date are preserved during this temporary layoff.<br/>
    • Union membership status remains active per the Collective Bargaining Agreement.<br/>
    • Any probationary periods (new-hire or conditional) are frozen and will resume upon recall.<br/>
    • Please file for unemployment benefits promptly. Your employer will not contest your claim.<br/>
    • Health insurance continuation information will be provided separately (COBRA/state continuation if applicable).<br/>
    ${s.notes?'• '+s.notes.replace(/\n/g,'<br/>• ')+'<br/>':''}
  </div>
  <p>We value your contributions to our team and look forward to your return. If you have questions about your layoff status, benefits, or recall, please contact ${s.prepared_by || 'HR'}.</p>
  <p>The union has been notified of this action per the Collective Bargaining Agreement.</p>
  <div class="sig-section">
    <div><p><span class="sig-line"></span><br/><b>Employee Signature</b><br/><span style="font-size:10px;color:#666">Date: _______________</span></p></div>
    <div><p><span class="sig-line"></span><br/><b>Management Signature</b><br/><span style="font-size:10px;color:#666">Date: _______________</span></p></div>
  </div>
  <div style="margin-top:30px;text-align:center;color:#999;font-size:9px">Generated by FlowSuite PeopleFlow — ${new Date().toLocaleString()}</div>
  </body></html>`
  const win = window.open('','_blank')
  win.document.write(html)
  win.document.close()
  setTimeout(()=>win.print(), 500)
}

// ── Separation Form Modal ──
function SeparationFormModal({onSave,onClose,C,emps,allEmps,disc,userEmail,userEmpRecord,setEmps}){
  const [f, setF] = useState({
    status:'active',
    effective_date: new Date().toISOString().split('T')[0],
    prepared_by: userEmpRecord ? gn(userEmpRecord) : (userEmail||''),
    prepared_by_email: userEmail||'',
    union_notified: false,
    equipment_returned: '[]'
  })
  const [equipChecked, setEquipChecked] = useState([])
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

  const inp = {width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}
  const lbl = {fontSize:10,color:C.g,textTransform:'uppercase',display:'block',marginBottom:2}

  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,borderRadius:12,padding:24,width:560,maxHeight:'88vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:9,color:sepType?.c||C.go,textTransform:'uppercase',letterSpacing:2}}>Minuteman Press Uptown</div>
          <h3 style={{margin:'2px 0 0',fontSize:16}}>Employee Separation</h3>
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
            border:`1px solid ${f.separation_type===t.v?t.c:C.bdr}`,
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
            border:`1px solid ${equipChecked.includes(item.id)?'#22C55E':C.bdr}`,
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
        <Btn gold small onClick={handleSave} C={C}>Save Separation</Btn>
      </div>
    </div>
  </div>)
}

function OnbView({ac,onb,toggleOnb,C}){
  const recent=ac.filter(e=>dbt(e.hire_date||td,td)<=180&&e.union_status!=='Non-Union'&&e.union_status!=='1099').sort((a,b)=>new Date(b.hire_date)-new Date(a.hire_date))
  const phs=[...new Set(OBS.map(s=>s.p))]
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Onboarding</h2>
    {recent.length===0?<Card C={C} style={{padding:30,textAlign:'center',color:C.g}}>No recent hires.</Card>:
      recent.map(e=>{const ed=onb[e.id]||{};const dn=OBS.filter(s=>ed[s.id]).length;const pc=Math.round(dn/OBS.length*100);return<Card key={e.id} C={C} style={{marginBottom:10}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><div><h3 style={{margin:0,fontSize:14}}>{gn(e)}</h3><div style={{fontSize:11,color:C.g}}>{fm(e.hire_date)} • Day {dbt(e.hire_date||td,td)}</div></div><div style={{fontSize:18,fontWeight:700,color:pc===100?C.gr:C.go}}>{pc}%</div></div>
        <div style={{height:3,background:C.nL,borderRadius:99,marginBottom:8,overflow:'hidden'}}><div style={{height:'100%',width:`${pc}%`,background:pc===100?C.gr:C.go,borderRadius:99}}/></div>
        {phs.map(ph=><div key={ph} style={{marginBottom:6}}><div style={{fontSize:9,color:C.go,textTransform:'uppercase',marginBottom:2}}>{ph}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:2}}>{OBS.filter(s=>s.p===ph).map(s=><label key={s.id} onClick={()=>toggleOnb(e.id,s.id,ed[s.id])} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',background:ed[s.id]?C.grD:C.nL,borderRadius:5,cursor:'pointer',fontSize:10,textDecoration:ed[s.id]?'line-through':'none',color:ed[s.id]?C.g:C.w}}>{ed[s.id]?'✓':'○'} {s.l}</label>)}</div></div>)}</Card>})}</div>)
}

function PayView({pay,sts,lpr,markAllPay,savePay,ac,mod,setMod,C}){
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <h2 style={{margin:0,fontSize:18}}>Payroll {sts.pP>0&&<Tag c={C.rd}>{sts.pP} pending</Tag>}</h2>
      <div style={{display:'flex',gap:6}}>{sts.pP>0&&<Btn small gold onClick={markAllPay} C={C}>Process All</Btn>}<Btn small onClick={()=>setMod('pay')} C={C}>+ Add</Btn></div></div>
    {lpr&&<div style={{fontSize:11,color:C.g,marginBottom:10}}>Last run: {fm(lpr.processed_at||lpr.created_at)}</div>}
    {pay.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(p=><Card key={p.id} C={C} style={{marginBottom:6,padding:'10px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:600,fontSize:13}}>{p.employee_name||'—'}</div><div style={{fontSize:11,color:C.g}}>{p.description||p.type||'—'} • {fm(p.created_at)}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontWeight:700,fontSize:14,color:C.go}}>${parseFloat(p.amount||0).toFixed(2)}</div><Tag c={p.status==='processed'?C.gr:C.am}>{p.status}</Tag></div></div></Card>)}
    {pay.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No payroll items.</Card>}
    {mod==='pay'&&<PayModal onSave={savePay} onClose={()=>setMod(null)} C={C} emps={ac}/>}
  </div>)
}

function PayModal({onSave,onClose,C,emps}){
  const[f,setF]=useState({status:'pending'})
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}}>
    <div style={{background:C.bg2,borderRadius:12,padding:24,width:380,border:`1px solid ${C.bdr}`}}>
      <h3 style={{margin:'0 0 16px'}}>New Payroll Item</h3>
      <select value={f.employee_name||''} onChange={e=>setF(p=>({...p,employee_name:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,fontFamily:'inherit'}}>
        <option value="">Select Employee</option>{emps.map(e=><option key={e.id} value={gn(e)}>{gn(e)}</option>)}</select>
      <input placeholder="Description" value={f.description||''} onChange={e=>setF(p=>({...p,description:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,boxSizing:'border-box',fontFamily:'inherit'}}/>
      <input placeholder="Amount" type="number" value={f.amount||''} onChange={e=>setF(p=>({...p,amount:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,boxSizing:'border-box',fontFamily:'inherit'}}/>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn ghost small onClick={onClose} C={C}>Cancel</Btn><Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Save</Btn></div>
    </div></div>)
}

function DocsView({ac,docs,toggleDoc,C}){
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Document Tracker</h2>
    {ac.map(e=>{const ed=docs[e.id]||{};const dn=DOC_ITEMS.filter(d=>ed[d.id]).length;const pc=Math.round(dn/DOC_ITEMS.length*100);const cats=[...new Set(DOC_ITEMS.map(d=>d.c))]
      return<Card key={e.id} C={C} style={{marginBottom:8}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><div style={{fontWeight:600,fontSize:13}}>{gn(e)}</div><div style={{fontSize:12,fontWeight:700,color:pc===100?C.gr:pc>50?C.am:C.rd}}>{pc}%</div></div>
        <div style={{height:2,background:C.nL,borderRadius:99,marginBottom:6,overflow:'hidden'}}><div style={{height:'100%',width:`${pc}%`,background:pc===100?C.gr:C.go}}/></div>
        {cats.map(cat=><div key={cat} style={{display:'flex',gap:2,flexWrap:'wrap',marginBottom:2}}>
          {DOC_ITEMS.filter(d=>d.c===cat).map(d=><span key={d.id} onClick={()=>toggleDoc(e.id,d.id,ed[d.id])} style={{padding:'2px 6px',borderRadius:4,fontSize:9,cursor:'pointer',background:ed[d.id]?C.grD:C.nL,color:ed[d.id]?C.gr:C.g,textDecoration:ed[d.id]?'line-through':'none'}}>{d.l}</span>)}</div>)}
      </Card>})}</div>)
}

function RptView({emps,ac,disc,pay,reports,C}){
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
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Payroll</h3><div style={{fontSize:12}}>
        <div>Pending: <b style={{color:C.am}}>{pay.filter(p=>p.status==='pending').length}</b></div>
        <div>Total: <b style={{color:C.go}}>${pay.reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(2)}</b></div></div></Card>
    </div></div>)
}

function ResourcesView({C,isAdmin,isManager}){
  const [activeForm, setActiveForm] = useState(null)
  const canManage = isAdmin || isManager

  const FORMS = [
    {id:'reimburse',l:'Reimbursement Request',desc:'Submit a reimbursement with receipt upload',icon:'$',url:'https://form.jotform.com/260085486550056',access:'all',flow:'employee'},
    {id:'advance',l:'Payroll Advance Request',desc:'Request a payroll advance — deducted from next check',icon:'↑',url:'https://form.jotform.com/260495386436063',access:'all',flow:'employee'},
    {id:'cashack',l:'Cash Reimbursement Acknowledgment',desc:'Send to employee to sign after reimbursement is issued',icon:'✓',url:'https://form.jotform.com/260085845634058',access:'manage',flow:'management'},
    {id:'withhold',l:'Payroll Withholding Notification',desc:'Authorize payroll deductions — send to employee for signature',icon:'§',url:'https://form.jotform.com/260084859075061',access:'manage',flow:'management'},
  ]

  const visibleForms = FORMS.filter(f => f.access === 'all' || canManage)
  const empForms = visibleForms.filter(f => f.flow === 'employee')
  const mgtForms = visibleForms.filter(f => f.flow === 'management')

  const LINKS = [
    {cat:'Payroll & Time',items:[
      {l:'QuickBooks Online',url:'https://qbo.intuit.com',desc:'Clock in/out, view pay stubs, W-2s',icon:'$'},
      {l:'QBO Workforce (Pay Stubs)',url:'https://workforce.intuit.com',desc:'View and print pay stubs and tax forms',icon:'◈'},
      {l:'Direct Deposit Form',url:null,desc:'See HR for paper form or update in QBO',icon:'▤'}
    ]},
    {cat:'Tax Forms',items:[
      {l:'W-4 Federal Withholding',url:'https://www.irs.gov/pub/irs-pdf/fw4.pdf',desc:'Federal tax withholding certificate',icon:'§'},
      {l:'W-4MN State Withholding',url:'https://www.revenue.state.mn.us/sites/default/files/2023-12/w-4mn_0.pdf',desc:'Minnesota state withholding',icon:'§'},
      {l:'I-9 Employment Verification',url:'https://www.uscis.gov/sites/default/files/document/forms/i-9-paper-version.pdf',desc:'Employment eligibility verification',icon:'§'},
      {l:'W-2 (Year-End)',url:'https://workforce.intuit.com',desc:'Available in QBO Workforce after Jan 31',icon:'◈'}
    ]},
    {cat:'Benefits & Retirement',items:[
      {l:'Health Insurance Info',url:null,desc:'Company pays 80% of medical premium. See HR for plan details and enrollment.',icon:'♥'},
      {l:'Dental Insurance',url:null,desc:'Available to eligible employees. See HR for details.',icon:'♥'},
      {l:'Vision Insurance',url:null,desc:'Available to eligible employees. See HR for details.',icon:'♥'},
      {l:'401(k) Enrollment',url:null,desc:'Eligible employees may participate. See HR for plan documents.',icon:'◆'},
      {l:'TMRP Pension (Union)',url:null,desc:'Local 1-B Pension Fund — 6% of earnings. See union rep or HR.',icon:'⊕'}
    ]},
    {cat:'Policies & Handbook',items:[
      {l:'Employee Handbook',url:null,desc:'Minuteman Press Uptown — January 2024. Available in PaperFlow.',icon:'📋'},
      {l:'Union Contract (CBA)',url:null,desc:'Local 1-B, Jan 2024–Dec 2026. Available in PaperFlow.',icon:'§'},
      {l:'Attendance & Discipline Policy',url:null,desc:'Progressive discipline, points system, no-call/no-show. Available in PaperFlow.',icon:'⚡'},
      {l:'Safety Policy',url:null,desc:'See HR or PaperFlow for current safety documentation.',icon:'▲'}
    ]},
    {cat:'Union Information',items:[
      {l:'Local 1-B Contact',url:null,desc:'Packaging & Production Workers Union of North America, Twin Cities',icon:'⊕'},
      {l:'Shop Steward',url:null,desc:'Contact your Shop Steward for grievances, questions, or representation.',icon:'◉'},
      {l:'Union Reps: Ruth & Marty',url:null,desc:'Ruth (contact) and Marty Hallberg (President). For onboarding notifications and union card.',icon:'◉'}
    ]},
    {cat:'New Hire Essentials',items:[
      {l:'Probation Period',url:null,desc:'First 90 calendar days. 30-day extension possible for just cause. No PTO accrual during probation.',icon:'★'},
      {l:'Seniority Timeline',url:null,desc:'Placed on Seniority List after 30 successive shifts or 30 days worked in a 60-day window.',icon:'★'},
      {l:'PTO Accrual (Year 1)',url:null,desc:'1 hour per 30 hours worked. Max 48 hrs/year. Cap 80 hrs. Starts after 90-day probation.',icon:'★'},
      {l:'Sick & Safe Time (MN ESSL)',url:null,desc:'Accrues from hire date at 1hr/30hrs worked. Available after 80 hrs worked. Max 48 hrs/year.',icon:'♥'},
      {l:'Union Enrollment',url:null,desc:'Union notified within 30 days of hire. No dues deducted during first 30 days worked.',icon:'⊕'}
    ]}
  ]

  return(<div>
    <h2 style={{fontSize:18,marginTop:0,marginBottom:4}}>Employee Resources</h2>
    <div style={{fontSize:11,color:C.g,marginBottom:16}}>Quick access to forms, links, policies, and benefits information.</div>

    {/* ── FORMS SECTION ── */}
    <div style={{marginBottom:20}}>
      <h3 style={{fontSize:13,color:C.go,margin:'0 0 8px',textTransform:'uppercase',letterSpacing:1}}>Forms & Requests</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8,marginBottom:8}}>
        {empForms.map(f=>(
          <Card key={f.id} C={C} style={{padding:'12px 14px',cursor:'pointer',border:activeForm===f.id?`2px solid ${C.go}`:`1px solid ${C.bdr}`}} onClick={()=>setActiveForm(activeForm===f.id?null:f.id)}>
            <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
              <div style={{width:28,height:28,borderRadius:6,background:activeForm===f.id?C.go:C.gD,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:activeForm===f.id?C.bg:C.go,flexShrink:0,fontWeight:700}}>{f.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:activeForm===f.id?C.go:C.w,marginBottom:2}}>{f.l}</div>
                <div style={{fontSize:11,color:C.g,lineHeight:1.4}}>{f.desc}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {canManage && mgtForms.length > 0 && <>
        <div style={{fontSize:10,color:C.g,textTransform:'uppercase',letterSpacing:1,marginBottom:6,marginTop:12}}>Management Forms — Send to Employee</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8}}>
          {mgtForms.map(f=>(
            <Card key={f.id} C={C} style={{padding:'12px 14px',cursor:'pointer',border:activeForm===f.id?`2px solid ${C.am}`:`1px solid ${C.bdr}`}} onClick={()=>setActiveForm(activeForm===f.id?null:f.id)}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <div style={{width:28,height:28,borderRadius:6,background:activeForm===f.id?C.am:C.aD,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:activeForm===f.id?C.bg:C.am,flexShrink:0,fontWeight:700}}>{f.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:activeForm===f.id?C.am:C.w,marginBottom:2}}>{f.l}</div>
                  <div style={{fontSize:11,color:C.g,lineHeight:1.4}}>{f.desc}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </>}

      {/* Embedded Form */}
      {activeForm && (()=>{
        const form = FORMS.find(f=>f.id===activeForm)
        if(!form) return null
        return <Card C={C} style={{marginTop:12,padding:0,overflow:'hidden'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',borderBottom:`1px solid ${C.bdr}`}}>
            <div style={{fontWeight:600,fontSize:13,color:C.go}}>{form.l}</div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <a href={form.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:C.g,textDecoration:'none'}}>Open in new tab ↗</a>
              <button onClick={()=>setActiveForm(null)} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:16}}>✕</button>
            </div>
          </div>
          <iframe src={form.url} style={{width:'100%',height:600,border:'none',background:C.bg2}} title={form.l} allow="camera;microphone"/>
        </Card>
      })()}
    </div>

    {/* ── EXISTING RESOURCE LINKS ── */}
    {LINKS.map(cat=>(
      <div key={cat.cat} style={{marginBottom:16}}>
        <h3 style={{fontSize:13,color:C.go,margin:'0 0 8px',textTransform:'uppercase',letterSpacing:1}}>{cat.cat}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8}}>
          {cat.items.map(item=>(
            <Card key={item.l} C={C} style={{padding:'12px 14px'}}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none',color:'inherit',display:'block'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{width:28,height:28,borderRadius:6,background:C.gD,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.go,flexShrink:0}}>{item.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,color:C.go,marginBottom:2}}>{item.l} ↗</div>
                      <div style={{fontSize:11,color:C.g,lineHeight:1.4}}>{item.desc}</div>
                    </div>
                  </div>
                </a>
              ) : (
                <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                  <div style={{width:28,height:28,borderRadius:6,background:C.ch,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.g,flexShrink:0}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{item.l}</div>
                    <div style={{fontSize:11,color:C.g,lineHeight:1.4}}>{item.desc}</div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    ))}
  </div>)
}

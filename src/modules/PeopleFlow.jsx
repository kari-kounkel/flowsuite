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
const DISC_TYPES = [
  {v:'verbal',l:'Verbal',c:'#F59E0B'},{v:'written',l:'Written',c:'#EF4444'},
  {v:'suspension',l:'Suspension',c:'#DC2626'},{v:'termination',l:'Termination',c:'#991B1B'},
  {v:'coaching',l:'Coaching',c:'#3B82F6'},{v:'commendation',l:'Commendation',c:'#22C55E'}
]
const EMP_FIELDS = [
  ['preferred_name','Preferred Name'],['last_name','Last Name'],['first_name','Legal First'],
  ['role','Classification'],['dept','Department'],['hire_date','Hire Date'],
  ['status','Status'],['union_status','Union Status'],
  ['rate','Pay Rate'],['email','Email'],['phone','Phone'],['zip','Zip Code'],
  ['ec_name','Emergency Contact'],['ec_relationship','EC Relationship'],['ec_phone','Emergency Phone'],
  ['reports_to','Reports To'],['emp_code','Emp Code'],['notes','Notes']
]

const ADMIN_EMAILS = ['kari@karikounkel.com','accounting@mpuptown.com','fbrown@mpuptown.com','operationsmanager@mpuptown.com']

export default function PeopleFlowModule({ orgId, C }) {
  const [emps, setEmps] = useState([])
  const [disc, setDisc] = useState([])
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
  const isManager = userEmpRecord?.role === 'Manager' || userEmpRecord?.role === 'C-Level'

  // Build lookup: UUID → display name
  const empNameMap = {}
  emps.forEach(e => { empNameMap[e.id] = `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim() })
  const resolveReportsTo = (val) => { if (!val) return '—'; return empNameMap[val] || val }

  // Get managers/C-Level for dropdown
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
      const [eR, dR, oR, dcR, pR] = await Promise.all([
        supabase.from('employees').select('*').eq('org_id', orgId),
        supabase.from('disciplines').select('*').eq('org_id', orgId),
        supabase.from('onboarding').select('*').eq('org_id', orgId),
        supabase.from('documents').select('*').eq('org_id', orgId),
        supabase.from('payroll_items').select('*').eq('org_id', orgId)
      ])
      setEmps(eR.data||[])
      setDisc(dR.data||[])
      const om={}; (oR.data||[]).forEach(r=>{if(!om[r.employee_id])om[r.employee_id]={};om[r.employee_id][r.step_id]=r.completed}); setOnb(om)
      const dm={}; (dcR.data||[]).forEach(r=>{if(!dm[r.employee_id])dm[r.employee_id]={};dm[r.employee_id][r.doc_id]=r.received}); setDocs(dm)
      setPay(pR.data||[])
    }
    load()
  }, [orgId])

  const ac = emps.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive')

  const saveEmp = async(emp)=>{
    const{id,...rest}=emp
    if(id){await supabase.from('employees').update({...rest,org_id:orgId}).eq('id',id);setEmps(p=>p.map(e=>e.id===id?{...e,...rest}:e))}
    else{const{data}=await supabase.from('employees').insert({...rest,org_id:orgId}).select().single();if(data)setEmps(p=>[...p,data])}
    sh('Employee saved ✓')
  }
  const saveDisc = async(d)=>{
    if(d.id){await supabase.from('disciplines').update(d).eq('id',d.id);setDisc(p=>p.map(x=>x.id===d.id?d:x))}
    else{const{data}=await supabase.from('disciplines').insert({...d,org_id:orgId}).select().single();if(data)setDisc(p=>[...p,data])}
    sh('Record saved ✓')
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

  const sts={
    total:emps.length,active:ac.length,
    union:ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length,
    disc:disc.filter(d=>(d.status||d.st)==='open').length,
    newHires:ac.filter(e=>dbt(e.hire_date||td,td)<=90).length,
    pP:pay.filter(p=>p.status==='pending').length
  }
  const alerts=[]
  ac.filter(e=>dbt(e.hire_date||td,td)<=90).forEach(e=>alerts.push({t:'New Hire',m:`${gn(e)} — Day ${dbt(e.hire_date||td,td)}`,c:C.bl}))
  disc.filter(d=>(d.status||d.st)==='open').forEach(d=>alerts.push({t:'Open Disc',m:`${d.employee_name||'Employee'} — ${d.type}`,c:C.am}))
  if(sts.pP>0)alerts.push({t:'Payroll',m:`${sts.pP} pending items`,c:C.rd})

  const ADMIN_TABS = ['discipline','onboard','payroll','documents','reports']
  const MANAGER_TABS = ['discipline','onboard']
  const allTabs=[{k:'dashboard',l:'Home',i:'◆'},{k:'employees',l:'Team',i:'◉'},{k:'orgchart',l:'Org',i:'⊞'},{k:'discipline',l:'Disc',i:'⚡'},{k:'onboard',l:'Onb',i:'★'},{k:'union',l:'Union',i:'⊕'},{k:'payroll',l:'PR',i:'$'},{k:'documents',l:'Docs',i:'▤'},{k:'resources',l:'Resources',i:'◇'},{k:'reports',l:'Rpt',i:'◧'}]
  const tabs = allTabs.filter(t => {
    if (isAdmin) return true
    if (isManager && MANAGER_TABS.includes(t.k)) return true
    if (ADMIN_TABS.includes(t.k)) return false
    return true
  })

  const gn=(e)=>`${e.preferred_name||e.first_name||''} ${e.last_name||''}`

  return(<div>
    {/* Tab Nav */}
    <div style={{display:'flex',gap:2,flexWrap:'wrap',alignItems:'center',marginBottom:12,padding:'8px 0',borderBottom:`1px solid ${C.bdr}`}}>
      {tabs.map(t=><button key={t.k} onClick={()=>go(t.k)} style={{background:view===t.k?C.gD:'transparent',border:`1px solid ${view===t.k?C.go:C.bdrF}`,color:view===t.k?C.go:C.g,padding:'4px 8px',borderRadius:6,cursor:'pointer',fontSize:10,fontWeight:500,display:'flex',alignItems:'center',gap:2,fontFamily:'inherit'}}>{t.i} {t.l}{t.k==='payroll'&&sts.pP>0&&<span style={{background:C.rd,color:'#fff',borderRadius:99,padding:'0 4px',fontSize:8,marginLeft:1}}>{sts.pP}</span>}</button>)}
    </div>

    {/* DASHBOARD */}
    {view==='dashboard'&&<div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
        {[{l:'Active',v:sts.active,c:C.gr},{l:'Union',v:sts.union,c:C.bl},{l:'New Hires',v:sts.newHires,c:C.am},{l:'Open Disc',v:sts.disc,c:C.rd},{l:'Payroll',v:sts.pP,c:C.go}].map(s=>
          <Card key={s.l} C={C}><div style={{fontSize:10,color:C.g,textTransform:'uppercase',letterSpacing:1}}>{s.l}</div><div style={{fontSize:28,fontWeight:700,color:s.c}}>{s.v}</div></Card>)}
      </div>
      {alerts.length>0&&<Card C={C} style={{marginBottom:16}}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>⚠ Alerts</h3>
        {alerts.map((a,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:i<alerts.length-1?`1px solid ${C.bdr}`:'none'}}><span style={{fontSize:12,color:C.w}}>{a.m}</span><Tag c={a.c}>{a.t}</Tag></div>)}</Card>}
      {isAdmin&&<Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Quick Links</h3><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Btn small onClick={()=>go('employees')} C={C}>+ Employee</Btn><Btn small onClick={()=>go('discipline')} C={C}>+ Discipline</Btn><Btn small onClick={()=>go('payroll')} C={C}>Run Payroll</Btn></div></Card>}
    </div>}

    {/* TEAM */}
    {view==='employees'&&<TeamView emps={emps} ac={ac} gn={gn} sel={sel} setSel={setSel} mod={mod} setMod={setMod} saveEmp={saveEmp} C={C} isAdmin={isAdmin} isManager={isManager} userEmpRecord={userEmpRecord} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions}/>}

    {/* ORG CHART */}
    {view==='orgchart'&&<div><h2 style={{fontSize:18,marginTop:0}}>Org Chart</h2>
      {[...new Set(ac.map(e=>e.dept||'Unassigned'))].map(d=><Card key={d} C={C} style={{marginBottom:10}}>
        <h3 style={{margin:'0 0 8px',fontSize:14,color:C.go}}>{d}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:6}}>
          {ac.filter(e=>(e.dept||'Unassigned')===d).map(e=><div key={e.id} style={{padding:'6px 10px',background:C.ch,borderRadius:6,fontSize:12}}><div style={{fontWeight:600}}>{gn(e)}</div><div style={{fontSize:10,color:C.g}}>{e.role||'—'}</div></div>)}
        </div></Card>)}</div>}

    {/* DISCIPLINE */}
    {view==='discipline'&&<DiscView disc={disc} setDisc={setDisc} saveDisc={saveDisc} ac={ac} gn={gn} mod={mod} setMod={setMod} C={C}/>}

    {/* ONBOARDING */}
    {view==='onboard'&&<OnbView ac={ac} onb={onb} toggleOnb={toggleOnb} gn={gn} C={C}/>}

    {/* UNION */}
    {view==='union'&&<div><h2 style={{fontSize:18,marginTop:0}}>Union Members ({ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099'&&e.union_status!=='Management').length})</h2>
      <Card C={C}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{borderBottom:`1px solid ${C.bdr}`}}>
        {['Name','Local','Hire Date','Seniority','Status'].map(h=><th key={h} style={{textAlign:'left',padding:'6px 8px',color:C.g,fontSize:10,textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
        <tbody>{ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099'&&e.union_status!=='Management').map(e=><tr key={e.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
          <td style={{padding:'6px 8px',fontWeight:500}}>{gn(e)}</td><td style={{padding:'6px 8px'}}>{e.union_status}</td>
          <td style={{padding:'6px 8px',color:C.g}}>{fm(e.hire_date)}</td>
          <td style={{padding:'6px 8px',color:C.g}}>{Math.round(dbt(e.hire_date||td,td)/365*10)/10} yrs</td>
          <td style={{padding:'6px 8px'}}><Tag c={e.status==='Active'?C.gr:C.am}>{e.status}</Tag></td>
        </tr>)}</tbody></table></Card></div>}

    {/* PAYROLL */}
    {view==='payroll'&&<PayView pay={pay} sts={sts} lpr={lpr} markAllPay={markAllPay} savePay={savePay} ac={ac} gn={gn} mod={mod} setMod={setMod} C={C}/>}

    {/* DOCUMENTS */}
    {view==='documents'&&<DocsView ac={ac} docs={docs} toggleDoc={toggleDoc} gn={gn} C={C}/>}

    {/* EMPLOYEE RESOURCES */}
    {view==='resources'&&<ResourcesView C={C} isAdmin={isAdmin} isManager={isManager}/>}

    {/* REPORTS */}
    {view==='reports'&&<RptView emps={emps} ac={ac} disc={disc} pay={pay} C={C}/>}

    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:C.go,color:C.bg,padding:'10px 18px',borderRadius:8,fontWeight:600,fontSize:13,zIndex:1e3}}>{toast}</div>}
  </div>)
}

// ── Sub-components ──

function TeamView({emps,ac,gn,sel,setSel,mod,setMod,saveEmp,C,isAdmin,isManager,userEmpRecord,resolveReportsTo,managerOptions}){
  const[filter,setFilter]=useState('')

  // Build full downline: recursively find everyone who reports to this person, and their reports, etc.
  const getDownline = (managerId) => {
    const directs = emps.filter(e => e.reports_to === managerId)
    let all = [...directs]
    directs.forEach(d => { all = all.concat(getDownline(d.id)) })
    return all
  }

  // Determine visible employees based on role
  let visibleEmps = emps
  if (!isAdmin) {
    if (isManager && userEmpRecord) {
      // Manager sees themselves + full downline chain
      const downline = getDownline(userEmpRecord.id)
      const downlineIds = new Set(downline.map(e => e.id))
      downlineIds.add(userEmpRecord.id)
      visibleEmps = emps.filter(e => downlineIds.has(e.id))
    } else if (userEmpRecord) {
      // Staff sees only themselves
      visibleEmps = emps.filter(e => e.id === userEmpRecord.id)
    }
  }

  const filtered=visibleEmps.filter(e=>gn(e).toLowerCase().includes(filter.toLowerCase()))
  const activeVisible = filtered.filter(e=>e.status!=='Terminated'&&e.status!=='Inactive'&&e.status!=='terminated'&&e.status!=='inactive')

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h2 style={{margin:0,fontSize:18}}>Team ({activeVisible.length})</h2>{isAdmin&&<Btn small gold onClick={()=>{setSel(null);setMod('emp')}} C={C}>+ Add</Btn>}</div>
    <input placeholder="Search..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%',padding:'8px 12px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:8,color:C.w,fontSize:13,marginBottom:10,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}/>
    {filtered.map(e=><Card key={e.id} C={C} style={{marginBottom:6,cursor:isAdmin?'pointer':'default',padding:'10px 14px'}}>
      <div onClick={()=>{if(isAdmin){setSel(e);setMod('emp')}else{setSel(sel?.id===e.id?null:e)}}} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontWeight:600,fontSize:14}}>{gn(e)}</div><div style={{fontSize:11,color:C.g}}>{e.role||'—'} • {e.dept||e.department||'—'}</div></div>
        <div style={{textAlign:'right'}}><Tag c={e.status==='Active'?C.gr:e.status==='Terminated'?C.rd:C.am}>{e.status||'Active'}</Tag><div style={{fontSize:10,color:C.g,marginTop:2}}>{e.union_status||'—'}</div></div>
      </div>
      {/* Read-only detail for non-admin when card is selected */}
      {!isAdmin&&sel?.id===e.id&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr}`,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        {[['dept','Department'],['hire_date','Hire Date'],['role','Classification'],['union_status','Union Status'],['email','Email'],['phone','Phone'],['ec_name','Emergency Contact'],['ec_phone','Emergency Phone'],['reports_to','Reports To']].map(([k,l])=>
          <div key={k} style={{fontSize:11}}><span style={{color:C.g,textTransform:'uppercase',fontSize:9}}>{l}</span><div style={{color:C.w}}>{k==='reports_to'?resolveReportsTo(e[k]):(e[k]||'—')}</div></div>
        )}
      </div>}
    </Card>)}
    {isAdmin&&mod==='emp'&&<EmpModal emp={sel} onSave={saveEmp} onClose={()=>setMod(null)} C={C} resolveReportsTo={resolveReportsTo} managerOptions={managerOptions} gn={gn}/>}
  </div>)
}

function EmpModal({emp,onSave,onClose,C,resolveReportsTo,managerOptions,gn}){
  const[f,setF]=useState(emp||{status:'Active'})
  const up=(k,v)=>setF(p=>({...p,[k]:v}))
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}}>
    <div style={{background:C.bg2,borderRadius:12,padding:24,width:420,maxHeight:'80vh',overflowY:'auto',border:`1px solid ${C.bdr}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}><h3 style={{margin:0,fontSize:16}}>{emp?'Edit':'New'} Employee</h3><button onClick={onClose} style={{background:'none',border:'none',color:C.g,cursor:'pointer',fontSize:18}}>✕</button></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {EMP_FIELDS.map(([k,l])=><div key={k}><label style={{fontSize:10,color:C.g,textTransform:'uppercase'}}>{l}</label>
          {k==='role'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>{['','C-Level','Manager','Lead','Staff'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='status'?<select value={f[k]||'Active'} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['active','on_leave','probation','terminated','inactive'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='union_status'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            {['','Union Active','Non-Union','1099','Probation'].map(s=><option key={s}>{s}</option>)}</select>
          :k==='reports_to'?<select value={f[k]||''} onChange={e=>up(k,e.target.value)} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,fontFamily:'inherit'}}>
            <option value="">— None —</option>
            {managerOptions.map(m=><option key={m.id} value={m.id}>{gn(m)} ({m.role})</option>)}
          </select>
          :k==='emp_code'?<input value={f[k]||''} readOnly style={{width:'100%',padding:'6px 8px',background:C.nL,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.g,fontSize:12,boxSizing:'border-box',fontFamily:'inherit',cursor:'not-allowed'}}/>
          :<input value={f[k]||''} onChange={e=>up(k,e.target.value)} type={['hire_date','dob','seniority_date'].includes(k)?'date':'text'} style={{width:'100%',padding:'6px 8px',background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}}/>}
        </div>)}
      </div>
      <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}><Btn ghost small onClick={onClose} C={C}>Cancel</Btn><Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Save</Btn></div>
    </div></div>)
}

function DiscView({disc,setDisc,saveDisc,ac,gn,mod,setMod,C}){
  const sorted=[...disc].sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at))
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h2 style={{margin:0,fontSize:18}}>Discipline ({disc.length})</h2><Btn small gold onClick={()=>setMod('disc')} C={C}>+ New</Btn></div>
    {sorted.map(d=>{const dt=DISC_TYPES.find(t=>t.v===d.type);return<Card key={d.id} C={C} style={{marginBottom:6,padding:'10px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><b style={{fontSize:13}}>{d.employee_name||'—'}</b> <Tag c={dt?dt.c:C.g}>{dt?dt.l:d.type}</Tag><div style={{fontSize:11,color:C.g}}>{d.category||'—'} — {d.description||'—'}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontSize:10,color:C.g}}>{fm(d.date||d.created_at)}</div>
          <button onClick={async()=>{const st=(d.status||d.st)==='open'?'closed':'open';await supabase.from('disciplines').update({status:st}).eq('id',d.id);setDisc(p=>p.map(x=>x.id===d.id?{...x,status:st,st}:x))}} style={{background:(d.status||d.st)==='open'?C.aD:C.grD,color:(d.status||d.st)==='open'?C.am:C.gr,border:'none',padding:'2px 8px',borderRadius:99,fontSize:9,cursor:'pointer'}}>{d.status||d.st||'open'}</button></div>
      </div></Card>})}
    {mod==='disc'&&<DiscModal onSave={saveDisc} onClose={()=>setMod(null)} C={C} emps={ac} gn={gn}/>}
  </div>)
}

function DiscModal({onSave,onClose,C,emps,gn}){
  const[f,setF]=useState({status:'open',date:td})
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1e3}}>
    <div style={{background:C.bg2,borderRadius:12,padding:24,width:400,border:`1px solid ${C.bdr}`}}>
      <h3 style={{margin:'0 0 16px'}}>New Discipline Record</h3>
      <select value={f.employee_name||''} onChange={e=>setF(p=>({...p,employee_name:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,fontFamily:'inherit'}}>
        <option value="">Select Employee</option>{emps.map(e=><option key={e.id} value={gn(e)}>{gn(e)}</option>)}</select>
      <select value={f.type||''} onChange={e=>setF(p=>({...p,type:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,fontFamily:'inherit'}}>
        <option value="">Type</option>{DISC_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select>
      <input placeholder="Category" value={f.category||''} onChange={e=>setF(p=>({...p,category:e.target.value}))} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,boxSizing:'border-box',fontFamily:'inherit'}}/>
      <textarea placeholder="Description" value={f.description||''} onChange={e=>setF(p=>({...p,description:e.target.value}))} rows={3} style={{width:'100%',padding:8,background:C.ch,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.w,fontSize:12,marginBottom:8,boxSizing:'border-box',fontFamily:'inherit',resize:'vertical'}}/>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn ghost small onClick={onClose} C={C}>Cancel</Btn><Btn gold small onClick={()=>{onSave(f);onClose()}} C={C}>Save</Btn></div>
    </div></div>)
}

function OnbView({ac,onb,toggleOnb,gn,C}){
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

function PayView({pay,sts,lpr,markAllPay,savePay,ac,gn,mod,setMod,C}){
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <h2 style={{margin:0,fontSize:18}}>Payroll {sts.pP>0&&<Tag c={C.rd}>{sts.pP} pending</Tag>}</h2>
      <div style={{display:'flex',gap:6}}>{sts.pP>0&&<Btn small gold onClick={markAllPay} C={C}>Process All</Btn>}<Btn small onClick={()=>setMod('pay')} C={C}>+ Add</Btn></div></div>
    {lpr&&<div style={{fontSize:11,color:C.g,marginBottom:10}}>Last run: {fm(lpr.processed_at||lpr.created_at)}</div>}
    {pay.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(p=><Card key={p.id} C={C} style={{marginBottom:6,padding:'10px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:600,fontSize:13}}>{p.employee_name||'—'}</div><div style={{fontSize:11,color:C.g}}>{p.description||p.type||'—'} • {fm(p.created_at)}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontWeight:700,fontSize:14,color:C.go}}>${parseFloat(p.amount||0).toFixed(2)}</div><Tag c={p.status==='processed'?C.gr:C.am}>{p.status}</Tag></div></div></Card>)}
    {pay.length===0&&<Card C={C} style={{textAlign:'center',color:C.g,padding:30}}>No payroll items.</Card>}
    {mod==='pay'&&<PayModal onSave={savePay} onClose={()=>setMod(null)} C={C} emps={ac} gn={gn}/>}
  </div>)
}

function PayModal({onSave,onClose,C,emps,gn}){
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

function DocsView({ac,docs,toggleDoc,gn,C}){
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Document Tracker</h2>
    {ac.map(e=>{const ed=docs[e.id]||{};const dn=DOC_ITEMS.filter(d=>ed[d.id]).length;const pc=Math.round(dn/DOC_ITEMS.length*100);const cats=[...new Set(DOC_ITEMS.map(d=>d.c))]
      return<Card key={e.id} C={C} style={{marginBottom:8}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><div style={{fontWeight:600,fontSize:13}}>{gn(e)}</div><div style={{fontSize:12,fontWeight:700,color:pc===100?C.gr:pc>50?C.am:C.rd}}>{pc}%</div></div>
        <div style={{height:2,background:C.nL,borderRadius:99,marginBottom:6,overflow:'hidden'}}><div style={{height:'100%',width:`${pc}%`,background:pc===100?C.gr:C.go}}/></div>
        {cats.map(cat=><div key={cat} style={{display:'flex',gap:2,flexWrap:'wrap',marginBottom:2}}>
          {DOC_ITEMS.filter(d=>d.c===cat).map(d=><span key={d.id} onClick={()=>toggleDoc(e.id,d.id,ed[d.id])} style={{padding:'2px 6px',borderRadius:4,fontSize:9,cursor:'pointer',background:ed[d.id]?C.grD:C.nL,color:ed[d.id]?C.gr:C.g,textDecoration:ed[d.id]?'line-through':'none'}}>{d.l}</span>)}</div>)}
      </Card>})}</div>)
}

function RptView({emps,ac,disc,pay,C}){
  const uC=ac.filter(e=>e.union_status&&e.union_status!=='Non-Union'&&e.union_status!=='1099').length
  const dC={};ac.forEach(e=>{const d=e.dept||'Unassigned';dC[d]=(dC[d]||0)+1})
  return(<div><h2 style={{fontSize:18,marginTop:0}}>Reports</h2>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Headcount</h3><div style={{fontSize:12}}>
        <div>Total: <b>{emps.length}</b></div><div>Active: <b>{ac.length}</b></div><div>Union: <b>{uC}</b></div><div>Terminated: <b>{emps.filter(e=>e.status==='Terminated').length}</b></div></div></Card>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>By Department</h3>
        {Object.entries(dC).sort((a,b)=>b[1]-a[1]).map(([d,c])=><div key={d} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}><span>{d}</span><b>{c}</b></div>)}</Card>
      <Card C={C}><h3 style={{margin:'0 0 8px',fontSize:13,color:C.go}}>Discipline</h3><div style={{fontSize:12}}>
        <div>Total: <b>{disc.length}</b></div><div>Open: <b style={{color:C.rd}}>{disc.filter(d=>(d.status||d.st)==='open').length}</b></div></div></Card>
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

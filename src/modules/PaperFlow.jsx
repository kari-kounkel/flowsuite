import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import { Card, Tag, Btn, fm, td } from '../theme.jsx'

const DOC_TYPES = [
  { k: 'contract', l: 'Union Contract', i: '§', desc: 'Local 1-B CBA — Jan 2024–Dec 2026' },
  { k: 'handbook', l: 'Employee Handbook', i: '📋', desc: 'Policies, Conduct & Attendance — Jan 2024' }
]

export default function PaperFlowModule({ orgId, C, user }) {
  const [sections, setSections] = useState([])
  const [notes, setNotes] = useState([])
  const [pushes, setPushes] = useState([])
  const [acks, setAcks] = useState([])
  const [employees, setEmployees] = useState([])
  const [view, setView] = useState('sections')
  const [selSection, setSelSection] = useState(null)
  const [toast, setToast] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [docType, setDocType] = useState('contract')
  const [expandedSubs, setExpandedSubs] = useState({})

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      const [sR, nR, pR, aR, eR] = await Promise.all([
        supabase.from('contract_sections').select('*').eq('org_id', orgId).order('sort_order'),
        supabase.from('contract_notes').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('policy_pushes').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('push_acknowledgments').select('*').eq('org_id', orgId),
        supabase.from('employees').select('*').eq('org_id', orgId)
      ])
      setSections(sR.data || [])
      setNotes(nR.data || [])
      setPushes(pR.data || [])
      setAcks(aR.data || [])
      setEmployees((eR.data || []).map(e => ({ ...e, ...(e.data || {}) })))
    }
    load()
  }, [orgId])

  const ac = employees.filter(e => e.status !== 'Terminated' && e.status !== 'Inactive')
  const gn = e => `${e.pn || e.preferred_name || e.first_name || ''} ${e.ln || e.last_name || ''}`

  const tabs = [
    { k: 'sections', l: 'Browse', i: '§' },
    { k: 'negotiate', l: 'Negotiate', i: '✎' },
    { k: 'push', l: 'Push', i: '▶' },
    { k: 'acks', l: 'Acks', i: '✓' }
  ]

  const saveNote = async (sectionId, text, noteType = 'general') => {
    const { data } = await supabase.from('contract_notes').insert({
      section_id: sectionId, author: user.email, note: text,
      note_type: noteType, org_id: orgId
    }).select().single()
    if (data) setNotes(p => [data, ...p])
    sh('Note saved ✓')
  }

  const pushSection = async (sectionId, empIds, message) => {
    const empNames = empIds.map(id => { const e = ac.find(x => x.id === id); return e ? gn(e) : id })
    const { data: push } = await supabase.from('policy_pushes').insert({
      section_id: sectionId, pushed_by: user.email,
      pushed_to: empNames, message, org_id: orgId
    }).select().single()
    if (push) {
      setPushes(p => [push, ...p])
      const ackRows = empIds.map(eid => ({
        push_id: push.id, employee_id: eid,
        employee_name: gn(ac.find(x => x.id === eid) || {}),
        status: 'pending', org_id: orgId
      }))
      const { data: newAcks } = await supabase.from('push_acknowledgments').insert(ackRows).select()
      if (newAcks) setAcks(p => [...p, ...newAcks])
    }
    sh(`Pushed to ${empIds.length} employees ✓`)
  }

  const acknowledge = async (ackId) => {
    await supabase.from('push_acknowledgments').update({
      status: 'acknowledged', acknowledged_at: new Date().toISOString()
    }).eq('id', ackId)
    setAcks(p => p.map(a => a.id === ackId ? { ...a, status: 'acknowledged', acknowledged_at: new Date().toISOString() } : a))
    sh('Acknowledged ✓')
  }

  const typeSections = sections.filter(s => (s.doc_type || 'contract') === docType)
  const categories = [...new Set(typeSections.map(s => s.category))].sort()
  const filtered = catFilter ? typeSections.filter(s => s.category === catFilter) : typeSections
  const toggleSub = (id) => setExpandedSubs(p => ({ ...p, [id]: !p[id] }))
  const parseSubs = (s) => {
    if (!s) return []
    if (Array.isArray(s)) return s
    try { return JSON.parse(s) } catch { return [] }
  }

  return (<div>
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 12, padding: '8px 0', borderBottom: `1px solid ${C.bdr}` }}>
      {tabs.map(t => <button key={t.k} onClick={() => { setView(t.k); setSelSection(null) }} style={{
        background: view === t.k ? C.gD : 'transparent', border: `1px solid ${view === t.k ? C.go : C.bdrF}`,
        color: view === t.k ? C.go : C.g, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
        fontSize: 10, fontWeight: 500, fontFamily: 'inherit'
      }}>{t.i} {t.l}</button>)}
    </div>

    {view === 'sections' && <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {DOC_TYPES.map(dt => (
          <div key={dt.k} onClick={() => { setDocType(dt.k); setCatFilter(''); setSelSection(null) }} style={{
            flex: 1, padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
            background: docType === dt.k ? C.gD : C.ch,
            border: `1px solid ${docType === dt.k ? C.go : C.bdr}`,
            transition: 'all 0.15s'
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: docType === dt.k ? C.go : C.w, marginBottom: 2 }}>{dt.i} {dt.l}</div>
            <div style={{ fontSize: 10, color: C.g }}>{dt.desc}</div>
            <div style={{ fontSize: 10, color: docType === dt.k ? C.go : C.g, marginTop: 4, fontWeight: 600 }}>
              {sections.filter(s => (s.doc_type || 'contract') === dt.k).length} sections
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, marginTop: 0 }}>{DOC_TYPES.find(d => d.k === docType)?.l || 'Sections'} ({filtered.length})</h2>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <Btn small ghost onClick={() => setCatFilter('')} C={C}
          style={!catFilter ? { border: `1px solid ${C.go}`, color: C.go } : {}}>All</Btn>
        {categories.map(c => <Btn key={c} small ghost onClick={() => setCatFilter(c)} C={C}
          style={catFilter === c ? { border: `1px solid ${C.go}`, color: C.go } : {}}>{c}</Btn>)}
      </div>

      {filtered.map(s => {
        const subs = parseSubs(s.subsections)
        const isExpanded = selSection?.id === s.id
        const subExpanded = expandedSubs[s.id]
        const noteCount = notes.filter(n => n.section_id === s.id).length
        return (
          <Card key={s.id} C={C} style={{ marginBottom: 6, padding: '10px 14px' }}>
            <div onClick={() => setSelSection(isExpanded ? null : s)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: C.go, fontWeight: 600 }}>
                    {docType === 'contract' ? '§' : docType === 'handbook' ? '◈' : '⚡'}{s.section_number}
                  </span>
                  <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 13 }}>{s.title}</span>
                  {noteCount > 0 && <span style={{ marginLeft: 6, fontSize: 9, color: C.am }}>{noteCount} note{noteCount > 1 ? 's' : ''}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Tag c={C.bl}>{s.category}</Tag>
                  {subs.length > 0 && <span style={{ fontSize: 9, color: C.g }}>{subs.length} sub</span>}
                </div>
              </div>
              {isExpanded && <div style={{ marginTop: 10, padding: '10px 0', borderTop: `1px solid ${C.bdr}` }}>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: C.w, marginBottom: subs.length > 0 ? 10 : 0 }}>{s.body}</div>
                {subs.length > 0 && <div>
                  <div onClick={(e) => { e.stopPropagation(); toggleSub(s.id) }}
                    style={{ fontSize: 10, color: C.go, cursor: 'pointer', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {subExpanded ? '▾' : '▸'} {subs.length} Subsection{subs.length > 1 ? 's' : ''}
                  </div>
                  {subExpanded && <div style={{ paddingLeft: 12, borderLeft: `2px solid ${C.gD}` }}>
                    {subs.map((sub, i) => (
                      <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < subs.length - 1 ? `1px solid ${C.bdr}` : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.go, marginBottom: 2 }}>{sub.sub}</div>
                        <div style={{ fontSize: 11, lineHeight: 1.6, color: C.g }}>{sub.text}</div>
                      </div>
                    ))}
                  </div>}
                </div>}
              </div>}
            </div>
          </Card>
        )
      })}
      {filtered.length === 0 && <Card C={C} style={{ textAlign: 'center', color: C.g, padding: 30 }}>No sections found.</Card>}
    </div>}

    {view === 'negotiate' && <NegotiateView sections={sections} notes={notes} saveNote={saveNote} C={C} />}
    {view === 'push' && <PushView sections={sections} ac={ac} gn={gn} pushSection={pushSection} pushes={pushes} acks={acks} C={C} />}
    {view === 'acks' && <AcksView pushes={pushes} acks={acks} sections={sections} acknowledge={acknowledge} C={C} />}

    {toast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: C.go, color: C.bg, padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, zIndex: 1e3 }}>{toast}</div>}
  </div>)
}

function NegotiateView({ sections, notes, saveNote, C }) {
  const [selId, setSelId] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('general')
  const [docFilter, setDocFilter] = useState('')

  const displaySections = docFilter ? sections.filter(s => (s.doc_type || 'contract') === docFilter) : sections
  const sectionNotes = selId ? notes.filter(n => n.section_id === selId) : []
  const sel = sections.find(s => s.id === selId)
  const typeColors = { general: C.g, negotiation: C.am, question: C.bl, proposed_change: C.rd, management_note: C.gr }
  const dtIcon = (s) => { const dt = s?.doc_type || 'contract'; return dt === 'contract' ? '§' : dt === 'handbook' ? '◈' : '§' }

  return (<div>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>Negotiation Notes</h2>
    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
      <Btn small ghost onClick={() => setDocFilter('')} C={C}
        style={!docFilter ? { border: `1px solid ${C.go}`, color: C.go } : {}}>All Docs</Btn>
      {DOC_TYPES.map(dt => <Btn key={dt.k} small ghost onClick={() => setDocFilter(dt.k)} C={C}
        style={docFilter === dt.k ? { border: `1px solid ${C.go}`, color: C.go } : {}}>{dt.i} {dt.l}</Btn>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 12, minHeight: 400 }}>
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {displaySections.map(s => {
          const count = notes.filter(n => n.section_id === s.id).length
          return <div key={s.id} onClick={() => setSelId(s.id)} style={{
            padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
            background: selId === s.id ? C.gD : 'transparent', border: `1px solid ${selId === s.id ? C.go : 'transparent'}`
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: selId === s.id ? C.go : C.w }}>{dtIcon(s)}{s.section_number} {s.title}</div>
            {count > 0 && <span style={{ fontSize: 9, color: C.am }}>{count} note{count > 1 ? 's' : ''}</span>}
          </div>
        })}
      </div>
      <div>
        {sel ? <>
          <Card C={C} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>{dtIcon(sel)}{sel.section_number} — {sel.title}</h3>
              <Tag c={C.bl}>{sel.doc_type || 'contract'}</Tag>
            </div>
            <div style={{ fontSize: 12, color: C.g, lineHeight: 1.6 }}>{sel.body}</div>
          </Card>
          <Card C={C} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {['general', 'negotiation', 'question', 'proposed_change', 'management_note'].map(t => (
                <Btn key={t} small ghost onClick={() => setNoteType(t)} C={C}
                  style={noteType === t ? { border: `1px solid ${typeColors[t]}`, color: typeColors[t] } : {}}>
                  {t.replace(/_/g, ' ')}
                </Btn>
              ))}
            </div>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={3}
              style={{ width: '100%', padding: 8, background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <Btn small gold onClick={() => { if (newNote.trim()) { saveNote(selId, newNote, noteType); setNewNote('') } }} C={C}>Save Note</Btn>
            </div>
          </Card>
          {sectionNotes.map(n => (
            <Card key={n.id} C={C} style={{ marginBottom: 6, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Tag c={typeColors[n.note_type] || C.g}>{(n.note_type || 'general').replace(/_/g, ' ')}</Tag>
                <span style={{ fontSize: 10, color: C.g }}>{n.author} • {fm(n.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>{n.note}</div>
            </Card>
          ))}
        </> : <Card C={C} style={{ textAlign: 'center', color: C.g, padding: 40 }}>← Select a section to view or add notes</Card>}
      </div>
    </div>
  </div>)
}

function PushView({ sections, ac, gn, pushSection, pushes, acks, C }) {
  const [selSectionId, setSelSectionId] = useState('')
  const [selEmps, setSelEmps] = useState([])
  const [message, setMessage] = useState('')
  const [selectAll, setSelectAll] = useState(false)

  const toggleEmp = id => setSelEmps(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleAll = () => { if (selectAll) setSelEmps([]); else setSelEmps(ac.map(e => e.id)); setSelectAll(!selectAll) }

  const grouped = {}
  sections.forEach(s => { const dt = s.doc_type || 'contract'; if (!grouped[dt]) grouped[dt] = []; grouped[dt].push(s) })

  return (<div>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>Push Policy</h2>
    <Card C={C} style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: C.go }}>New Push</h3>
      <select value={selSectionId} onChange={e => setSelSectionId(e.target.value)}
        style={{ width: '100%', padding: 8, background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, marginBottom: 8, fontFamily: 'inherit' }}>
        <option value="">Select Section...</option>
        {Object.entries(grouped).map(([dt, secs]) => (
          <optgroup key={dt} label={DOC_TYPES.find(d => d.k === dt)?.l || dt}>
            {secs.map(s => <option key={s.id} value={s.id}>
              {dt === 'contract' ? '§' : dt === 'handbook' ? '◈' : '§'}{s.section_number} — {s.title}
            </option>)}
          </optgroup>
        ))}
      </select>
      <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message..." rows={2}
        style={{ width: '100%', padding: 8, background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.g }}>Push to ({selEmps.length} selected):</span>
          <Btn small ghost onClick={toggleAll} C={C}>{selectAll ? 'Deselect All' : 'Select All'}</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
          {ac.map(e => (
            <label key={e.id} onClick={() => toggleEmp(e.id)} style={{
              padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
              background: selEmps.includes(e.id) ? C.grD : C.nL, color: selEmps.includes(e.id) ? C.gr : C.g
            }}>{selEmps.includes(e.id) ? '✓' : '○'} {gn(e)}</label>
          ))}
        </div>
      </div>
      <Btn gold onClick={() => {
        if (selSectionId && selEmps.length > 0) { pushSection(parseInt(selSectionId), selEmps, message); setSelSectionId(''); setSelEmps([]); setMessage(''); setSelectAll(false) }
      }} C={C} disabled={!selSectionId || selEmps.length === 0}>Push Section</Btn>
    </Card>
    <h3 style={{ fontSize: 14, color: C.go }}>Push History</h3>
    {pushes.map(p => {
      const sec = sections.find(s => s.id === p.section_id)
      const pAcks = acks.filter(a => a.push_id === p.id)
      const acked = pAcks.filter(a => a.status === 'acknowledged').length
      const ico = sec ? ((sec.doc_type || 'contract') === 'contract' ? '§' : (sec.doc_type || 'contract') === 'handbook' ? '◈' : '⚡') : '§'
      return (<Card key={p.id} C={C} style={{ marginBottom: 6, padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{ico}{sec?.section_number} — {sec?.title || 'Unknown'}</div>
            <div style={{ fontSize: 11, color: C.g }}>Pushed by {p.pushed_by} • {fm(p.created_at)}</div>
            {p.message && <div style={{ fontSize: 11, color: C.g, fontStyle: 'italic', marginTop: 2 }}>{p.message}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: acked === pAcks.length && pAcks.length > 0 ? C.gr : C.am }}>{acked}/{pAcks.length}</div>
            <div style={{ fontSize: 9, color: C.g }}>acknowledged</div>
          </div>
        </div>
      </Card>)
    })}
    {pushes.length === 0 && <Card C={C} style={{ textAlign: 'center', color: C.g, padding: 20 }}>No pushes yet.</Card>}
  </div>)
}

function AcksView({ pushes, acks, sections, acknowledge, C }) {
  const pending = acks.filter(a => a.status === 'pending')
  const acknowledged = acks.filter(a => a.status === 'acknowledged')
  const getSection = pushId => { const push = pushes.find(p => p.id === pushId); return push ? sections.find(s => s.id === push.section_id) : null }
  const ico = sec => { if (!sec) return '§'; const dt = sec.doc_type || 'contract'; return dt === 'contract' ? '§' : dt === 'handbook' ? '◈' : '§' }

  return (<div>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>Acknowledgments</h2>
    {pending.length > 0 && <>
      <h3 style={{ fontSize: 14, color: C.am }}>Pending ({pending.length})</h3>
      {pending.map(a => { const sec = getSection(a.push_id); return (
        <Card key={a.id} C={C} style={{ marginBottom: 6, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{a.employee_name}</div>
              <div style={{ fontSize: 11, color: C.g }}>{ico(sec)}{sec?.section_number} — {sec?.title || 'Unknown'}</div></div>
            <Btn small gold onClick={() => acknowledge(a.id)} C={C}>Acknowledge</Btn>
          </div></Card>
      )})}
    </>}
    {acknowledged.length > 0 && <>
      <h3 style={{ fontSize: 14, color: C.gr }}>Completed ({acknowledged.length})</h3>
      {acknowledged.map(a => { const sec = getSection(a.push_id); return (
        <Card key={a.id} C={C} style={{ marginBottom: 4, padding: '8px 14px', opacity: 0.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontSize: 12 }}>{a.employee_name} — {ico(sec)}{sec?.section_number} {sec?.title || ''}</div></div>
            <span style={{ fontSize: 10, color: C.gr }}>✓ {fm(a.acknowledged_at)}</span>
          </div></Card>
      )})}
    </>}
    {acks.length === 0 && <Card C={C} style={{ textAlign: 'center', color: C.g, padding: 30 }}>No acknowledgments yet. Push a section first.</Card>}
  </div>)
}

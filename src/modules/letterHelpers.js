// ── Letter / PDF helpers (plain JS — no JSX) ──
// Kept separate so esbuild doesn't try to parse HTML template literals as JSX.

export const generateLetterPDF = (htmlContent, title) => {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this site.'); return }
  w.document.write('<!DOCTYPE html><html><head><title>' + title + '</title>'
    + '<style>'
    + 'body { font-family: Georgia, serif; font-size: 13px; line-height: 1.7; margin: 60px auto; max-width: 680px; color: #1a1a1a; }'
    + '.letterhead { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 24px; }'
    + '.company { font-size: 22px; font-weight: bold; letter-spacing: 1px; }'
    + '.meta { font-size: 11px; color: #666; margin-top: 4px; }'
    + '.body { white-space: pre-wrap; }'
    + '.signature-block { margin-top: 48px; }'
    + 'table td { padding: 4px 8px; }'
    + '@media print { body { margin: 40px; } }'
    + '</style></head><body>'
    + htmlContent
    + '<script>setTimeout(function(){window.print()},400)<\/script>'
    + '</body></html>')
  w.document.close()
}

export const buildOfferLetterHTML = (f, resolvedBody, fm) => {
  return '<div class="letterhead"><div class="company">' + f.company + '</div><div class="meta">Offer of Employment</div></div>'
    + '<p><strong>Date:</strong> ' + fm(f.offer_date) + '</p>'
    + '<p><strong>To:</strong> ' + f.emp_name + '</p><br/>'
    + '<p>Dear ' + f.emp_name + ',</p>'
    + '<div class="body">' + resolvedBody + '</div>'
    + '<div class="signature-block">'
    + '<p>Sincerely,</p><br/><br/>'
    + '<p>_______________________________<br/>Authorized Signature &middot; ' + f.company + '</p><br/><br/>'
    + '<p>_______________________________<br/>' + f.emp_name + ' &middot; Acceptance Signature</p>'
    + '<p>Date: _______________</p>'
    + '</div>'
}

export const buildSeparationLetterHTML = (f, resolvedBody, fm, sepTypeLabel, logo, sigs) => {
  sigs = sigs || {}
  const logoImg = logo ? '<img src="' + logo + '" alt="' + f.company + '" style="height:56px;width:auto;display:block;margin-bottom:6px"/>' : ''
  const sigStyle = "font-family:'Brush Script MT','Segoe Script','Snell Roundhand',cursive;font-style:italic;font-size:22px;color:#1a1a1a;min-height:32px;line-height:1.1;border-bottom:1px solid #888;padding:4px 2px 2px"
  const sigCell = (label, sig) =>
    '<td style="padding:8px 12px;vertical-align:bottom;width:50%;border:1px solid #eee">'
    + '<div style="' + sigStyle + '">' + ((sig && sig.name) ? sig.name : '&nbsp;') + '</div>'
    + '<div style="font-size:10px;color:#555;margin-top:3px;display:flex;justify-content:space-between;gap:6px">'
    +   '<span>' + label + '</span>'
    +   '<span>' + ((sig && sig.date) ? 'Signed ' + fm(sig.date) : 'Date: _______') + '</span>'
    + '</div>'
    + '</td>'

  // Inline override styles for one-page tight layout (overrides generateLetterPDF defaults)
  const pageStyle = '<style>'
    + '.letter-wrap{font-size:12px;line-height:1.5}'
    + '.letter-wrap p{margin:6px 0}'
    + '.letter-wrap .body{white-space:pre-wrap;margin:8px 0 10px}'
    + '.letter-wrap table.summary td{padding:4px 8px;font-size:11px;border:1px solid #ddd}'
    + '.letter-wrap .sig-grid{width:100%;border-collapse:collapse;margin-top:6px}'
    + '@media print{'
    +   '@page{margin:0.4in}'
    +   'body{margin:0 !important;max-width:none !important;font-size:11px !important;line-height:1.45 !important}'
    +   '.letterhead{margin-bottom:10px !important;padding-bottom:6px !important}'
    +   '.signature-block{margin-top:10px !important}'
    + '}'
    + '</style>'

  return pageStyle
    + '<div class="letter-wrap">'
    + '<div class="letterhead">' + logoImg + '<div class="company" style="font-size:18px">' + f.company + '</div><div class="meta">Employee Separation Notice</div></div>'
    + '<p><strong>Date:</strong> ' + fm(f.effective_date) + ' &nbsp;·&nbsp; <strong>To:</strong> ' + f.emp_name + ' &nbsp;·&nbsp; <strong>Re:</strong> Separation of Employment</p>'
    + '<table class="summary" style="width:100%;border-collapse:collapse;margin:6px 0 10px;border:1px solid #ddd">'
    +   '<tr>'
    +     '<td style="background:#f5f5f5;font-weight:bold;width:18%">Employee</td><td style="width:32%">' + f.emp_name + '</td>'
    +     '<td style="background:#f5f5f5;font-weight:bold;width:18%">Position</td><td style="width:32%">' + (f.role || '--') + (f.dept ? ' · ' + f.dept : '') + '</td>'
    +   '</tr>'
    +   '<tr>'
    +     '<td style="background:#f5f5f5;font-weight:bold">Hire Date</td><td>' + (f.hire_date ? fm(f.hire_date) : '--') + '</td>'
    +     '<td style="background:#f5f5f5;font-weight:bold">Effective</td><td><strong>' + fm(f.effective_date) + '</strong></td>'
    +   '</tr>'
    +   '<tr>'
    +     '<td style="background:#f5f5f5;font-weight:bold">Separation Type</td><td colspan="3">' + (sepTypeLabel || '--') + '</td>'
    +   '</tr>'
    +   (f.final_paycheck_notes ? '<tr><td style="background:#f5f5f5;font-weight:bold">Final Paycheck</td><td colspan="3">' + f.final_paycheck_notes + '</td></tr>' : '')
    +   (f.cobra_notes ? '<tr><td style="background:#f5f5f5;font-weight:bold">COBRA / Benefits</td><td colspan="3">' + f.cobra_notes + '</td></tr>' : '')
    + '</table>'
    + '<p>Dear ' + (f.preferred_name || f.emp_name) + ',</p>'
    + '<div class="body">' + resolvedBody + '</div>'
    + '<p>Sincerely,</p>'
    + (f.prepared_by ? '<p style="font-size:11px;color:#555;margin-top:-2px">Prepared by ' + f.prepared_by + '</p>' : '')
    + '<div class="signature-block">'
    +   '<table class="sig-grid">'
    +     '<tr>' + sigCell('Authorized Signature · ' + f.company, sigs.authorized) + sigCell(f.emp_name + ' · Employee Acknowledgment', sigs.employee) + '</tr>'
    +     '<tr>' + sigCell('Witness 1', sigs.witness1) + sigCell('Witness 2', sigs.witness2) + '</tr>'
    +   '</table>'
    + '</div>'
    + '</div>'
}

export const buildUnionSeparationLetterHTML = (f, resolvedBody, fm, UNION_CONTACTS, sepTypeLabel, logo) => {
  const today = new Date().toISOString().split('T')[0]
  const logoImg = logo ? '<img src="' + logo + '" alt="' + f.company + '" style="height:64px;width:auto;display:block;margin-bottom:10px"/>' : ''
  return '<div class="letterhead">' + logoImg + '<div class="company">' + f.company + '</div><div class="meta">Union Separation Notice — Cease Processing</div></div>'
    + '<p><strong>Date:</strong> ' + fm(today) + '</p>'
    + '<p><strong>To:</strong> ' + UNION_CONTACTS.ruth.name + ' (' + UNION_CONTACTS.ruth.role + ') &amp; ' + UNION_CONTACTS.marty.name + ' (' + UNION_CONTACTS.marty.role + ')</p>'
    + '<p><strong>Re:</strong> Separation of ' + f.emp_name + ' — Please Cease Membership Processing</p><br/>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;border:1px solid #ddd">'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;width:40%;border:1px solid #ddd">Employee</td><td style="padding:6px 10px;border:1px solid #ddd">' + f.emp_name + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Role</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.role || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Department</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.dept || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Union Status at Separation</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.union_status || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Original Hire Date</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.hire_date ? fm(f.hire_date) : '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Separation Type</td><td style="padding:6px 10px;border:1px solid #ddd">' + (sepTypeLabel || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Separation Effective</td><td style="padding:6px 10px;border:1px solid #ddd"><strong>' + fm(f.effective_date) + '</strong></td></tr>'
    + (f.seniority_date ? '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Seniority Date (if applicable)</td><td style="padding:6px 10px;border:1px solid #ddd">' + fm(f.seniority_date) + '</td></tr>' : '')
    + '</table>'
    + '<div class="body">' + resolvedBody + '</div>'
    + '<div class="signature-block">'
    + '<p>Sincerely,</p><br/><br/>'
    + '<p>_______________________________<br/>Authorized Signature &middot; ' + f.company + '</p>'
    + '</div>'
}

export const buildUnionLetterHTML = (f, startDate, seniority, resolvedBody, fm, UNION_CONTACTS) => {
  const today = new Date().toISOString().split('T')[0]
  return '<div class="letterhead"><div class="company">' + f.company + '</div><div class="meta">Union Membership Notification</div></div>'
    + '<p><strong>Date:</strong> ' + fm(today) + '</p>'
    + '<p><strong>To:</strong> ' + UNION_CONTACTS.ruth.name + ' (' + UNION_CONTACTS.ruth.role + ') &amp; ' + UNION_CONTACTS.marty.name + ' (' + UNION_CONTACTS.marty.role + ')</p>'
    + '<p><strong>Re:</strong> New Employee -- ' + f.emp_name + '</p><br/>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;border:1px solid #ddd">'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;width:40%;border:1px solid #ddd">Employee</td><td style="padding:6px 10px;border:1px solid #ddd">' + f.emp_name + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Role</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.role || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Department</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.dept || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Union Status</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.union_status || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Start Date</td><td style="padding:6px 10px;border:1px solid #ddd">' + fm(startDate) + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Pay Rate</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.pay_rate ? '$' + f.pay_rate + '/hr' : '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Seniority Eligible</td><td style="padding:6px 10px;border:1px solid #ddd"><strong>' + (seniority ? fm(seniority) : '--') + '</strong> (30 working days from start)</td></tr>'
    + '</table>'
    + '<div class="body">' + resolvedBody + '</div>'
    + '<div class="signature-block">'
    + '<p>Sincerely,</p><br/><br/>'
    + '<p>_______________________________<br/>Authorized Signature &middot; ' + f.company + '</p>'
    + '</div>'
}

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

export const buildSeparationLetterHTML = (f, resolvedBody, fm, sepTypeLabel, logo) => {
  const logoImg = logo ? '<img src="' + logo + '" alt="' + f.company + '" style="height:64px;width:auto;display:block;margin-bottom:10px"/>' : ''
  return '<div class="letterhead">' + logoImg + '<div class="company">' + f.company + '</div><div class="meta">Employee Separation Notice</div></div>'
    + '<p><strong>Date:</strong> ' + fm(f.effective_date) + '</p>'
    + '<p><strong>To:</strong> ' + f.emp_name + '</p>'
    + '<p><strong>Re:</strong> Separation of Employment</p><br/>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;border:1px solid #ddd">'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;width:35%;border:1px solid #ddd">Employee</td><td style="padding:6px 10px;border:1px solid #ddd">' + f.emp_name + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Position</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.role || '--') + (f.dept ? ' &middot; ' + f.dept : '') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Hire Date</td><td style="padding:6px 10px;border:1px solid #ddd">' + (f.hire_date ? fm(f.hire_date) : '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Separation Type</td><td style="padding:6px 10px;border:1px solid #ddd">' + (sepTypeLabel || '--') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Effective Date</td><td style="padding:6px 10px;border:1px solid #ddd"><strong>' + fm(f.effective_date) + '</strong></td></tr>'
    + (f.final_paycheck_notes ? '<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;border:1px solid #ddd">Final Paycheck</td><td style="padding:6px 10px;border:1px solid #ddd">' + f.final_paycheck_notes + '</td></tr>' : '')
    + '</table>'
    + '<p>Dear ' + (f.preferred_name || f.emp_name) + ',</p>'
    + '<div class="body">' + resolvedBody + '</div>'
    + '<div class="signature-block">'
    + '<p>Sincerely,</p><br/><br/>'
    + '<p>_______________________________<br/>Authorized Signature &middot; ' + f.company + '</p><br/><br/>'
    + '<p>_______________________________<br/>' + f.emp_name + ' &middot; Employee Acknowledgment</p>'
    + '<p>Date: _______________</p><br/>'
    + '<p style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-top:24px">Witnesses</p>'
    + '<p>_______________________________<br/>Witness 1 &middot; Print Name &amp; Signature</p>'
    + '<p>Date: _______________</p><br/>'
    + '<p>_______________________________<br/>Witness 2 &middot; Print Name &amp; Signature</p>'
    + '<p>Date: _______________</p>'
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

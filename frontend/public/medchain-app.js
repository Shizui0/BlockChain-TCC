const state = {
  user: null,
  records: [],
  documents: [],
  consents: [],
  professionals: [],
  audit: [],
  familyHistory: [],
  selectedPatientId: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const typeIcon = { Encounter: '♙', Observation: '◇', Immunization: '✚' };
const roleLabel = { PATIENT: 'Paciente', PROFESSIONAL: 'Profissional', ADMIN: 'Administrador' };
const relationshipLabel = {
  FATHER: 'Pai', MOTHER: 'Mãe', GRANDFATHER: 'Avô', GRANDMOTHER: 'Avó',
  GREAT_GRANDFATHER: 'Bisavô', GREAT_GRANDMOTHER: 'Bisavó'
};

function escapeHtml(value = '') {
  const element = document.createElement('div');
  element.textContent = String(value);
  return element.innerHTML;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

async function api(path, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? 'Não foi possível concluir a operação.');
    error.status = response.status;
    error.code = body?.error?.code;
    if (response.status === 401 && state.user) showLogin();
    throw error;
  }
  return body;
}

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', isError);
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3200);
}

function navigate(id) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === id));
  $$('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === id));
  $('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLogin() {
  state.user = null;
  $('#auth-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  $('#login-error').textContent = '';
}

function recordMarkup(record, includeActions = false) {
  const data = record.clinicalData;
  const value = data.value === undefined ? data.note ?? 'Sem detalhe adicional' : data.value;
  return `<article class="timeline-item">
    <span class="event-icon ${record.resourceType.toLowerCase()}">${typeIcon[record.resourceType] ?? '▤'}</span>
    <div><strong>${escapeHtml(data.code)}</strong><small>${escapeHtml(value)}</small></div>
    ${includeActions ? `<span class="record-type">${escapeHtml(record.resourceType)}</span><button class="text-button" type="button" data-integrity="${record.id}">Verificar hash</button>` : ''}
    <time>${formatDate(record.createdAt)}</time>
  </article>`;
}

function renderRecords() {
  $('#record-count').textContent = state.records.length;
  $('#timeline').innerHTML = state.records.length
    ? state.records.slice(0, 4).map((record) => recordMarkup(record)).join('')
    : '<p class="empty-message">Nenhum registro acessível.</p>';
  filterRecords();
  const vaccines = state.records.filter((record) => record.resourceType === 'Immunization');
  $('#vaccines-list').innerHTML = vaccines.length
    ? vaccines.map((record) => recordMarkup(record, true)).join('')
    : '<p class="empty-message">Nenhuma imunização sintética acessível.</p>';
}

function renderDocuments() {
  $('#document-count').textContent = state.documents.length;
  $('#document-list').innerHTML = state.documents.length ? state.documents.map((document) => `
    <article class="document-card">
      <span class="document-icon">▧</span>
      <div>
        <strong>${escapeHtml(document.fileName)}</strong>
        <small>${escapeHtml(document.description ?? 'Sem descrição')} • ${formatBytes(document.sizeBytes)} • ${formatDate(document.createdAt)}</small>
        <span class="document-hash">SHA-256: ${escapeHtml(document.contentHash)}</span>
      </div>
      <div class="document-actions">
        <button class="text-button" type="button" data-document-integrity="${document.id}">Verificar hash</button>
        <button class="secondary-button compact-button" type="button" data-document-download="${document.id}">Baixar</button>
      </div>
    </article>
  `).join('') : '<p class="empty-message">Nenhum prontuário enviado.</p>';
}

function filterRecords() {
  const query = ($('#record-search').value ?? '').toLowerCase();
  const resourceType = $('#record-filter').value;
  const filtered = state.records.filter((record) => {
    const haystack = `${record.clinicalData.code} ${record.clinicalData.value ?? ''} ${record.clinicalData.note ?? ''}`.toLowerCase();
    return (resourceType === 'all' || record.resourceType === resourceType) && haystack.includes(query);
  });
  $('#records-table').innerHTML = filtered.length
    ? filtered.map((record) => recordMarkup(record, true)).join('')
    : '<p class="empty-message">Nenhum registro encontrado.</p>';
}

function renderConsents() {
  const active = state.consents.filter((consent) => consent.active);
  $('#consent-count').textContent = active.length;
  $('#consent-list').innerHTML = state.consents.length ? state.consents.map((consent) => {
    const counterpart = state.user.role === 'PATIENT' ? consent.professionalName : consent.patientName;
    return `<article class="access-card">
      <span class="avatar">${escapeHtml(counterpart.split(/\s+/).map((part) => part[0]).slice(0, 2).join(''))}</span>
      <div><strong>${escapeHtml(counterpart)}</strong><small>${escapeHtml(consent.permission)} • expira em ${formatDate(consent.expiresAt)}</small></div>
      <span class="access-status ${consent.active ? '' : 'inactive'}">${consent.active ? 'ATIVO' : consent.revokedAt ? 'REVOGADO' : 'EXPIRADO'}</span>
      ${state.user.role === 'PATIENT' && consent.active ? `<button class="secondary-button compact-button" type="button" data-revoke="${consent.id}">Revogar</button>` : ''}
    </article>`;
  }).join('') : '<p class="empty-message">Nenhum consentimento cadastrado.</p>';
  renderProfessionalPatients();
}

function renderProfessionalPatients() {
  if (state.user?.role !== 'PROFESSIONAL') return;
  const unique = new Map(state.consents.filter((consent) => consent.active).map((consent) => [consent.patientId, consent]));
  const markup = unique.size ? [...unique.values()].map((consent) => `
    <button type="button" class="${state.selectedPatientId === consent.patientId ? 'active' : ''}" data-patient="${consent.patientId}">${escapeHtml(consent.patientName)} • ${escapeHtml(consent.permission)}</button>
  `).join('') : '<p class="empty-message">Nenhum paciente concedeu acesso ativo.</p>';
  $$('[data-patient-access-list]').forEach((container) => { container.innerHTML = markup; });
}

function renderAudit() {
  $('#audit-list').innerHTML = state.audit.length ? state.audit.map((event) => `
    <article class="audit-item"><span class="event-icon">◎</span><div><strong>${escapeHtml(event.eventType)}</strong><small>Ator: ${escapeHtml(event.actorId ?? 'sistema')} • Recurso: ${escapeHtml(event.resourceId ?? 'geral')}</small></div><time>${formatDate(event.timestamp)}</time></article>
  `).join('') : '<p class="empty-message">Nenhum evento de auditoria.</p>';
}

function renderFamilyHistory() {
  $('#family-list').innerHTML = state.familyHistory.length ? state.familyHistory.map((item) => `
    <article class="family-item"><strong>${escapeHtml(relationshipLabel[item.relationship] ?? item.relationship)} — ${escapeHtml(item.relativeLabel)}</strong><p>${item.conditions.map(escapeHtml).join(', ')}</p><small>${escapeHtml(item.notes ?? 'Sem observações')} • ${formatDate(item.createdAt)}</small></article>
  `).join('') : '<p class="empty-message">Nenhum histórico familiar sintético.</p>';
}

async function loadRecords(patientId = state.selectedPatientId) {
  state.selectedPatientId = state.user.role === 'PATIENT' ? state.user.id : patientId;
  if (!state.selectedPatientId) {
    state.records = [];
    renderRecords();
    return;
  }
  const suffix = state.user.role === 'PATIENT' ? '' : `?patientId=${encodeURIComponent(state.selectedPatientId)}`;
  state.records = (await api(`/api/records${suffix}`)).records;
  renderRecords();
  renderProfessionalPatients();
}

async function loadDocuments(patientId = state.selectedPatientId) {
  state.selectedPatientId = state.user.role === 'PATIENT' ? state.user.id : patientId;
  if (!state.selectedPatientId) {
    state.documents = [];
    renderDocuments();
    return;
  }
  const suffix = state.user.role === 'PATIENT' ? '' : `?patientId=${encodeURIComponent(state.selectedPatientId)}`;
  state.documents = (await api(`/api/documents${suffix}`)).documents;
  renderDocuments();
  renderProfessionalPatients();
}

async function selectProfessionalPatient(patientId) {
  state.selectedPatientId = patientId;
  const consent = state.consents.find((item) => item.active && item.patientId === patientId);
  if (consent && ['READ', 'READ_WRITE'].includes(consent.permission)) {
    await Promise.all([loadRecords(patientId), loadDocuments(patientId)]);
  } else {
    state.records = [];
    state.documents = [];
    renderRecords();
    renderDocuments();
    renderProfessionalPatients();
  }
}

function canWriteSelectedPatient() {
  if (state.user.role === 'PATIENT') return true;
  return state.consents.some((consent) => consent.active
    && consent.patientId === state.selectedPatientId
    && ['WRITE', 'READ_WRITE'].includes(consent.permission));
}

async function loadAudit() {
  state.audit = (await api('/api/audit')).events;
  renderAudit();
}

async function loadSessionData() {
  const [professionalResult, consentResult] = await Promise.all([
    api('/api/professionals'),
    api('/api/consents')
  ]);
  state.professionals = professionalResult.professionals;
  state.consents = consentResult.consents;
  renderConsents();
  if (state.user.role === 'PATIENT') {
    const [recordsResult, documentResult, auditResult, familyResult] = await Promise.all([
      api('/api/records'), api('/api/documents'), api('/api/audit'), api('/api/family-history')
    ]);
    state.records = recordsResult.records;
    state.documents = documentResult.documents;
    state.audit = auditResult.events;
    state.familyHistory = familyResult.familyHistory;
    renderRecords();
    renderDocuments();
    renderAudit();
    renderFamilyHistory();
  } else {
    const firstConsent = state.consents.find((consent) => consent.active);
    await selectProfessionalPatient(firstConsent?.patientId ?? null);
  }
}

async function startSession(user) {
  state.user = user;
  state.selectedPatientId = null;
  $('#auth-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  const patient = user.role === 'PATIENT';
  $$('.patient-only').forEach((element) => element.classList.toggle('hidden', !patient));
  $$('.professional-context').forEach((element) => element.classList.toggle('hidden', patient));
  $('#profile-name').textContent = user.displayName;
  $('#profile-role').textContent = roleLabel[user.role];
  $('#role-badge').textContent = roleLabel[user.role];
  $('#welcome-name').textContent = user.displayName;
  $('#profile-initials').textContent = user.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  navigate('inicio');
  try {
    await loadSessionData();
  } catch (error) {
    toast(error.message, true);
  }
}

function openRecordDialog() {
  if (!canWriteSelectedPatient()) {
    toast('Selecione um paciente com consentimento de escrita ativo.', true);
    return;
  }
  $('#dialog-content').innerHTML = `<h2 class="dialog-title">Adicionar registro sintético</h2><p class="dialog-description">O conteúdo será cifrado antes de chegar ao banco.</p><div class="field"><label for="record-resource">Recurso FHIR</label><select id="record-resource" name="resourceType"><option>Observation</option><option>Encounter</option><option>Immunization</option></select></div><div class="field"><label for="record-code">Descrição</label><input id="record-code" name="code" required maxlength="160" placeholder="Ex.: Exame demonstrativo"></div><div class="field"><label for="record-value">Resultado ou detalhe sintético</label><textarea id="record-value" name="value" maxlength="500" required></textarea></div><div class="field"><label for="record-note">Observação</label><textarea id="record-note" name="note" maxlength="1000"></textarea></div><div class="dialog-actions"><button type="button" class="secondary-button" data-dialog-cancel>Cancelar</button><button type="submit" class="primary-button">Criptografar e salvar</button></div>`;
  $('#dialog-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/records', { method: 'POST', body: JSON.stringify({
        ...(state.user.role === 'PROFESSIONAL' ? { patientId: state.selectedPatientId } : {}),
        resourceType: data.get('resourceType'),
        clinicalData: { code: data.get('code'), value: data.get('value'), note: data.get('note') || undefined, status: 'final' }
      }) });
      $('#app-dialog').close();
      await loadRecords(state.selectedPatientId);
      if (state.user.role === 'PATIENT') await loadAudit();
      toast('Registro sintético cifrado e registrado com integridade.');
    } catch (error) { toast(error.message, true); }
  };
  $('#app-dialog').showModal();
}

function openDocumentDialog() {
  if (!canWriteSelectedPatient()) {
    toast('Selecione um paciente com consentimento de escrita ativo.', true);
    return;
  }
  $('#dialog-content').innerHTML = `<h2 class="dialog-title">Enviar prontuário</h2><p class="dialog-description">O arquivo será cifrado antes de ser gravado. Limite: 10 MiB.</p><div class="field"><label for="document-file">Arquivo PDF, PNG ou JPEG</label><input id="document-file" name="document" type="file" accept="application/pdf,image/png,image/jpeg" required></div><div class="field"><label for="document-description">Descrição sintética opcional</label><input id="document-description" name="description" maxlength="300" placeholder="Ex.: Laudo demonstrativo"></div><div class="dialog-actions"><button type="button" class="secondary-button" data-dialog-cancel>Cancelar</button><button type="submit" class="primary-button">Cifrar e enviar</button></div>`;
  $('#dialog-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (state.user.role === 'PROFESSIONAL') data.set('patientId', state.selectedPatientId);
    try {
      await api('/api/documents', { method: 'POST', body: data });
      $('#app-dialog').close();
      const canRead = state.user.role === 'PATIENT' || state.consents.some((consent) => consent.active
        && consent.patientId === state.selectedPatientId
        && ['READ', 'READ_WRITE'].includes(consent.permission));
      if (canRead) await loadDocuments(state.selectedPatientId);
      if (state.user.role === 'PATIENT') await loadAudit();
      toast('Prontuário cifrado e SHA-256 registrado com sucesso.');
    } catch (error) { toast(error.message, true); }
  };
  $('#app-dialog').showModal();
}

function openConsentDialog() {
  const options = state.professionals.map((professional) => `<option value="${professional.id}">${escapeHtml(professional.displayName)} — ${escapeHtml(professional.registration)}</option>`).join('');
  $('#dialog-content').innerHTML = `<h2 class="dialog-title">Conceder consentimento</h2><p class="dialog-description">A autorização expira automaticamente e pode ser revogada.</p><div class="field"><label for="consent-professional">Profissional</label><select id="consent-professional" name="professionalId">${options}</select></div><div class="field"><label for="consent-permission">Permissão</label><select id="consent-permission" name="permission"><option value="READ">Somente leitura</option><option value="WRITE">Somente inclusão</option><option value="READ_WRITE">Leitura e inclusão</option></select></div><div class="field"><label for="consent-hours">Validade</label><select id="consent-hours" name="hours"><option value="24">24 horas</option><option value="168">7 dias</option><option value="720">30 dias</option></select></div><div class="dialog-actions"><button type="button" class="secondary-button" data-dialog-cancel>Cancelar</button><button type="submit" class="primary-button">Conceder acesso</button></div>`;
  $('#dialog-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const expiresAt = new Date(Date.now() + Number(data.get('hours')) * 60 * 60 * 1000).toISOString();
    try {
      await api('/api/consents', { method: 'POST', body: JSON.stringify({ professionalId: data.get('professionalId'), permission: data.get('permission'), expiresAt }) });
      $('#app-dialog').close();
      state.consents = (await api('/api/consents')).consents;
      renderConsents();
      await loadAudit();
      toast('Consentimento concedido e registrado no ledger local.');
    } catch (error) { toast(error.message, true); }
  };
  $('#app-dialog').showModal();
}

function openSecurityDialog() {
  $('#dialog-content').innerHTML = `<h2 class="dialog-title">Segurança do MVP</h2><p class="dialog-description">AES-256-GCM protege a confidencialidade dos dados clínicos. SHA-256 detecta alterações no conteúdo protegido. O ledger local registra hashes e eventos pseudonimizados, nunca o conteúdo médico.</p><div class="security-banner"><div class="lock-icon">✓</div><div><strong>Escopo acadêmico</strong><p>Não usar com dados reais nem interpretar como conformidade LGPD.</p></div></div><div class="dialog-actions"><button type="button" class="primary-button" data-dialog-cancel>Entendi</button></div>`;
  $('#dialog-form').onsubmit = (event) => event.preventDefault();
  $('#app-dialog').showModal();
}

async function downloadDocument(documentId) {
  const documentInfo = state.documents.find((item) => item.id === documentId);
  const response = await fetch(`/api/documents/${documentId}/content`, { credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Não foi possível baixar o prontuário.');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = documentInfo?.fileName ?? 'prontuario';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
    await startSession(result.user);
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
});

$$('[data-demo-email]').forEach((button) => button.addEventListener('click', () => {
  $('#login-email').value = button.dataset.demoEmail;
  $('#login-password').value = 'MedChainDemo123!';
}));

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-view], [data-view-link]');
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.view ?? nav.dataset.viewLink);
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new-record') openRecordDialog();
  if (action === 'upload-document') openDocumentDialog();
  if (action === 'share') openConsentDialog();
  if (action === 'security') openSecurityDialog();
  if (event.target.closest('[data-dialog-cancel], .dialog-close')) $('#app-dialog').close();

  const integrityId = event.target.closest('[data-integrity]')?.dataset.integrity;
  if (integrityId) {
    try {
      const result = await api(`/api/records/${integrityId}/integrity`);
      toast(result.valid ? `Integridade confirmada com ${result.algorithm}.` : 'Divergência de integridade detectada.', !result.valid);
      if (state.user.role === 'PATIENT') await loadAudit();
    } catch (error) { toast(error.message, true); }
  }

  const documentIntegrityId = event.target.closest('[data-document-integrity]')?.dataset.documentIntegrity;
  if (documentIntegrityId) {
    try {
      const result = await api(`/api/documents/${documentIntegrityId}/integrity`);
      toast(result.valid ? `Prontuário íntegro: ${result.algorithm}.` : 'Divergência no prontuário detectada.', !result.valid);
      if (state.user.role === 'PATIENT') await loadAudit();
    } catch (error) { toast(error.message, true); }
  }

  const documentDownloadId = event.target.closest('[data-document-download]')?.dataset.documentDownload;
  if (documentDownloadId) {
    try { await downloadDocument(documentDownloadId); } catch (error) { toast(error.message, true); }
  }

  const consentId = event.target.closest('[data-revoke]')?.dataset.revoke;
  if (consentId) {
    try {
      await api(`/api/consents/${consentId}`, { method: 'DELETE' });
      state.consents = (await api('/api/consents')).consents;
      renderConsents();
      await loadAudit();
      toast('Consentimento revogado imediatamente.');
    } catch (error) { toast(error.message, true); }
  }

  const patientId = event.target.closest('[data-patient]')?.dataset.patient;
  if (patientId) {
    try { await selectProfessionalPatient(patientId); } catch (error) { toast(error.message, true); }
  }
});

$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#record-search').addEventListener('input', filterRecords);
$('#record-filter').addEventListener('change', filterRecords);
$('#refresh-audit').addEventListener('click', () => loadAudit().catch((error) => toast(error.message, true)));
$('#logout-button').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
  showLogin();
});

$('#family-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const conditions = String(data.get('conditions')).split(',').map((value) => value.trim()).filter(Boolean);
  try {
    await api('/api/family-history', { method: 'POST', body: JSON.stringify({
      relationship: data.get('relationship'), relativeLabel: data.get('relativeLabel'), conditions
    }) });
    state.familyHistory = (await api('/api/family-history')).familyHistory;
    renderFamilyHistory();
    event.currentTarget.reset();
    toast('Histórico familiar sintético salvo de forma cifrada.');
  } catch (error) { toast(error.message, true); }
});

async function restoreSession() {
  try {
    const { user } = await api('/api/me');
    await startSession(user);
  } catch {
    showLogin();
  }
}

restoreSession();

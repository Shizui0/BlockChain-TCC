const initialRecords = [
  { id: 1, type: 'Consulta', title: 'Consulta com Dra. Ana Lima', detail: 'Clínica Geral • Hospital São Lucas', date: 'Hoje, 09:30' },
  { id: 2, type: 'Exame', title: 'Resultado de Hemograma', detail: 'Laboratório Vida • Resultado disponível', date: '08 ago. 2026' },
  { id: 3, type: 'Procedimento', title: 'Ultrassonografia abdominal', detail: 'Centro de Diagnóstico Imagem+', date: '29 jul. 2026' },
  { id: 4, type: 'Consulta', title: 'Consulta com Dr. Paulo Mendes', detail: 'Cardiologia • Clínica Coração Vivo', date: '15 jul. 2026' }
];
const accessStorageKey = 'medchain-accesses';
function loadAccesses() {
  try {
    const saved = JSON.parse(localStorage.getItem(accessStorageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(a => a && typeof a.id === 'string' && /^[a-zA-Z0-9-]+$/.test(a.id) &&
      typeof a.name === 'string' && ['read', 'write'].includes(a.permission) &&
      Number.isFinite(a.createdAt) && Number.isFinite(a.expiresAt) &&
      (a.revokedAt === null || Number.isFinite(a.revokedAt)));
  } catch { return []; }
}

const state = { records: JSON.parse(localStorage.getItem('medchain-records') || 'null') || initialRecords, accesses: loadAccesses() };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const typeIcon = { Consulta: '♙', Exame: '◇', Procedimento: '✦' };

function renderRecords() {
  const timeline = $('#timeline');
  timeline.innerHTML = state.records.slice(0, 4).map(recordTemplate).join('');
  $('#record-count').textContent = state.records.length;
  filterRecords();
}
function recordTemplate(r, table = false) {
  return `<article class="timeline-item"><span class="event-icon ${r.type.toLowerCase()}">${typeIcon[r.type] || '▤'}</span><div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.detail)}</small></div>${table ? `<span class="record-type">${r.type}</span>` : ''}<time>${escapeHtml(r.date)}</time></article>`;
}
function accessStatus(access, now = Date.now()) {
  if (access.revokedAt !== null) return 'revoked';
  return access.expiresAt <= now ? 'expired' : 'active';
}
function saveAccesses(accesses) {
  try { localStorage.setItem(accessStorageKey, JSON.stringify(accesses)); }
  catch { toast('Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente.'); return false; }
  state.accesses = accesses;
  renderAccess();
  return true;
}
function createAccess(name, duration, permission) {
  name = String(name || '').trim();
  if (!name || name.length > 120 || !['24', '168', '720'].includes(duration) || !['read', 'write'].includes(permission)) {
    toast('Preencha o nome, a validade e a permissão corretamente.'); return false;
  }
  const now = Date.now();
  return saveAccesses([{ id: crypto.randomUUID(), name, permission, createdAt: now,
    expiresAt: now + Number(duration) * 3600000, revokedAt: null }, ...loadAccesses()]);
}
function revokeAccess(id) {
  state.accesses = loadAccesses();
  const access = state.accesses.find(a => a.id === id);
  if (!access || accessStatus(access) !== 'active') { renderAccess(); return; }
  if (saveAccesses(state.accesses.map(a => a.id === id ? { ...a, revokedAt: Date.now() } : a))) toast('Autorização revogada.');
}
let renderedAccessStatuses = '';
function renderAccess() {
  const now = Date.now();
  renderedAccessStatuses = state.accesses.map(a => accessStatus(a, now)).join(',');
  const active = state.accesses.filter(a => accessStatus(a, now) === 'active');
  const labels = { active: 'ATIVO', expired: 'EXPIRADO', revoked: 'REVOGADO' };
  const date = value => new Date(value).toLocaleString('pt-BR');
  const template = (a, detailed = false) => {
    const status = accessStatus(a, now);
    const initials = a.name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
    return `<article class="access-card"><span class="avatar">${escapeHtml(initials)}</span><div class="access-info"><strong>${escapeHtml(a.name)}</strong><small>${a.permission === 'read' ? 'Somente leitura' : 'Leitura e inclusão de registros'}</small><small>Validade: ${date(a.expiresAt)}</small>${detailed ? `<small>Criado em ${date(a.createdAt)}</small>${a.revokedAt !== null ? `<small>Revogado em ${date(a.revokedAt)}</small>` : ''}` : ''}</div><span class="access-status ${status}">${labels[status]}</span>${detailed && status === 'active' ? `<button type="button" class="revoke-button" data-revoke="${a.id}" aria-label="Revogar acesso de ${escapeHtml(a.name).replaceAll('"', '&quot;')}">Revogar</button>` : ''}</article>`;
  };
  $('#access-preview').innerHTML = active.length ? active.slice(0, 3).map(a => template(a)).join('') : '<p class="access-empty">Nenhuma autorização ativa.</p>';
  $('#access-list').innerHTML = state.accesses.length ? state.accesses.map(a => template(a, true)).join('') : '<p class="access-empty">Nenhuma autorização criada. Use “Novo acesso” para começar.</p>';
  $('#access-count').textContent = active.length;
  $('#access-summary').textContent = `${active.length} autorizações ativas`;
}
function filterRecords() {
  const query = ($('#record-search')?.value || '').toLowerCase();
  const type = $('#record-filter')?.value || 'all';
  const filtered = state.records.filter(r => (type === 'all' || r.type === type) && `${r.title} ${r.detail}`.toLowerCase().includes(query));
  $('#records-table').innerHTML = filtered.length ? filtered.map(r => recordTemplate(r, true)).join('') : '<p style="color:var(--muted);padding:25px;text-align:center">Nenhum registro encontrado.</p>';
}
function navigate(id) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === id));
  $('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openDialog(kind) {
  const content = $('#dialog-content');
  if (kind === 'new-record') content.innerHTML = `<h2 class="dialog-title">Adicionar registro</h2><p class="dialog-description">Inclua uma nova informação no seu prontuário.</p><div class="field"><label>Tipo de registro</label><select name="type"><option>Consulta</option><option>Exame</option><option>Procedimento</option></select></div><div class="field"><label>Título</label><input name="title" required placeholder="Ex.: Consulta cardiológica"></div><div class="field"><label>Instituição e detalhes</label><textarea name="detail" required placeholder="Informe o local e uma breve descrição"></textarea></div><div class="dialog-actions"><button type="button" data-close-dialog class="secondary-button">Cancelar</button><button type="submit" value="default" class="primary-button">Salvar com segurança</button></div>`;
  else if (kind === 'share') content.innerHTML = `<h2 class="dialog-title">Compartilhar acesso</h2><p class="dialog-description">Crie uma autorização de demonstração. Ela fica salva neste navegador e não envia um convite.</p><div class="field"><label for="access-recipient">Nome do profissional ou instituição</label><input id="access-recipient" name="recipient" maxlength="120" required placeholder="Ex.: Hospital São Lucas"></div><div class="field"><label for="access-duration">Validade</label><select id="access-duration" name="duration"><option value="24">24 horas</option><option value="168">7 dias</option><option value="720">30 dias</option></select></div><div class="field"><label for="access-permission">Permissão</label><select id="access-permission" name="permission"><option value="read">Somente leitura</option><option value="write">Leitura e inclusão de registros</option></select></div><div class="dialog-actions"><button type="button" data-close-dialog class="secondary-button">Cancelar</button><button type="submit" class="primary-button">Gerar acesso</button></div>`;
  else content.innerHTML = `<h2 class="dialog-title">Segurança por design</h2><p class="dialog-description">Este protótipo usa armazenamento local para demonstração. A arquitetura de produção prevê criptografia ponta a ponta, trilha de auditoria imutável e consentimento granular em conformidade com a LGPD.</p><div class="security-banner"><div class="lock-icon">✓</div><div><strong>Integridade verificada</strong><p>Nenhuma alteração suspeita encontrada.</p></div></div><div class="dialog-actions"><button type="button" data-close-dialog class="primary-button">Entendi</button></div>`;
  $('#dialog-form').dataset.kind = kind;
  $('#app-dialog').showModal();
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

$$('.nav-link').forEach(link => link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.view); }));
$$('[data-view-link]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.viewLink)));
$$('[data-action]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.action === 'all-records') navigate('historico');
  else if (button.dataset.action === 'new-vaccine') return;
  else openDialog(button.dataset.action);
}));
$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#record-search').addEventListener('input', filterRecords);
$('#record-filter').addEventListener('change', filterRecords);
$('#dialog-form').addEventListener('click', e => {
  if (e.target.closest('[data-close-dialog]')) $('#app-dialog').close();
});
$('#dialog-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  if (e.currentTarget.dataset.kind === 'new-record') {
    state.records.unshift({ id: Date.now(), type: data.get('type'), title: data.get('title'), detail: data.get('detail'), date: 'Agora' });
    localStorage.setItem('medchain-records', JSON.stringify(state.records));
    renderRecords(); toast('Registro salvo no seu cofre digital.');
  } else if (e.currentTarget.dataset.kind === 'share') {
    if (!createAccess(data.get('recipient'), data.get('duration'), data.get('permission'))) return;
    toast('Autorização criada neste navegador.');
  }
  $('#app-dialog').close();
});
renderRecords(); renderAccess();
$('#access-list').addEventListener('click', e => {
  const button = e.target.closest('[data-revoke]');
  if (button) revokeAccess(button.dataset.revoke);
});
setInterval(() => {
  if (state.accesses.map(a => accessStatus(a)).join(',') !== renderedAccessStatuses) renderAccess();
}, 1000);
window.addEventListener('focus', renderAccess);
window.addEventListener('storage', e => {
  if (e.key === accessStorageKey || e.key === null) { state.accesses = loadAccesses(); renderAccess(); }
});

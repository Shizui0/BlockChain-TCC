const initialRecords = [
  { id: 1, type: 'Consulta', title: 'Consulta com Dra. Ana Lima', detail: 'Clínica Geral • Hospital São Lucas', date: 'Hoje, 09:30' },
  { id: 2, type: 'Exame', title: 'Resultado de Hemograma', detail: 'Laboratório Vida • Resultado disponível', date: '08 ago. 2026' },
  { id: 3, type: 'Procedimento', title: 'Ultrassonografia abdominal', detail: 'Centro de Diagnóstico Imagem+', date: '29 jul. 2026' },
  { id: 4, type: 'Consulta', title: 'Consulta com Dr. Paulo Mendes', detail: 'Cardiologia • Clínica Coração Vivo', date: '15 jul. 2026' }
];
const accessData = [
  { initials: 'AL', name: 'Dra. Ana Lima', role: 'Clínica geral', color: '#dcecff' },
  { initials: 'PM', name: 'Dr. Paulo Mendes', role: 'Cardiologista', color: '#e7defa' },
  { initials: 'LV', name: 'Laboratório Vida', role: 'Análises clínicas', color: '#d9f1ec' }
];

const state = { records: JSON.parse(localStorage.getItem('medchain-records') || 'null') || initialRecords };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const typeIcon = { Consulta: '♙', Exame: '◇', Procedimento: '✦' };

function renderRecords() {
  const timeline = $('#timeline');
  timeline.innerHTML = state.records.slice(0, 4).map(recordTemplate).join('');
  $('#record-count').textContent = state.records.length + 8;
  filterRecords();
}
function recordTemplate(r, table = false) {
  return `<article class="timeline-item"><span class="event-icon ${r.type.toLowerCase()}">${typeIcon[r.type] || '▤'}</span><div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.detail)}</small></div>${table ? `<span class="record-type">${r.type}</span>` : ''}<time>${escapeHtml(r.date)}</time></article>`;
}
function renderAccess() {
  const markup = accessData.map(a => `<article class="access-card"><span class="avatar" style="background:${a.color}">${a.initials}</span><div><strong>${a.name}</strong><small>${a.role}</small></div><span class="access-status">ATIVO</span></article>`).join('');
  $('#access-preview').innerHTML = markup;
  $('#access-list').innerHTML = markup;
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
  if (kind === 'new-record') content.innerHTML = `<h2 class="dialog-title">Adicionar registro</h2><p class="dialog-description">Inclua uma nova informação no seu prontuário.</p><div class="field"><label>Tipo de registro</label><select name="type"><option>Consulta</option><option>Exame</option><option>Procedimento</option></select></div><div class="field"><label>Título</label><input name="title" required placeholder="Ex.: Consulta cardiológica"></div><div class="field"><label>Instituição e detalhes</label><textarea name="detail" required placeholder="Informe o local e uma breve descrição"></textarea></div><div class="dialog-actions"><button value="cancel" class="secondary-button">Cancelar</button><button type="submit" value="default" class="primary-button">Salvar com segurança</button></div>`;
  else if (kind === 'share') content.innerHTML = `<h2 class="dialog-title">Compartilhar acesso</h2><p class="dialog-description">Gere uma autorização temporária para um profissional ou instituição.</p><div class="field"><label>Nome do profissional ou instituição</label><input name="recipient" required placeholder="Ex.: Hospital São Lucas"></div><div class="field"><label>Validade</label><select name="duration"><option>24 horas</option><option>7 dias</option><option>30 dias</option></select></div><div class="field"><label>Permissão</label><select name="permission"><option>Somente leitura</option><option>Leitura e inclusão de registros</option></select></div><div class="dialog-actions"><button value="cancel" class="secondary-button">Cancelar</button><button type="submit" class="primary-button">Gerar acesso</button></div>`;
  else content.innerHTML = `<h2 class="dialog-title">Segurança por design</h2><p class="dialog-description">Este protótipo usa armazenamento local para demonstração. A arquitetura de produção prevê criptografia ponta a ponta, trilha de auditoria imutável e consentimento granular em conformidade com a LGPD.</p><div class="security-banner"><div class="lock-icon">✓</div><div><strong>Integridade verificada</strong><p>Nenhuma alteração suspeita encontrada.</p></div></div><div class="dialog-actions"><button value="cancel" class="primary-button">Entendi</button></div>`;
  $('#dialog-form').dataset.kind = kind;
  $('#app-dialog').showModal();
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

$$('.nav-link').forEach(link => link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.view); }));
$$('[data-view-link]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.viewLink)));
$$('[data-action]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.action === 'all-records') navigate('historico');
  else if (button.dataset.action === 'new-vaccine') toast('Registro de vacina preparado para a próxima versão.');
  else openDialog(button.dataset.action);
}));
$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#record-search').addEventListener('input', filterRecords);
$('#record-filter').addEventListener('change', filterRecords);
$('#dialog-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  if (e.currentTarget.dataset.kind === 'new-record') {
    state.records.unshift({ id: Date.now(), type: data.get('type'), title: data.get('title'), detail: data.get('detail'), date: 'Agora' });
    localStorage.setItem('medchain-records', JSON.stringify(state.records));
    renderRecords(); toast('Registro salvo no seu cofre digital.');
  } else toast(`Acesso para ${data.get('recipient')} gerado com sucesso.`);
  $('#app-dialog').close();
});
renderRecords(); renderAccess();

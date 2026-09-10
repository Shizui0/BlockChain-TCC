// Local demonstration: no clinical schedule or remote verification is inferred.
(() => {
  const storageKey = 'medchain-vaccines';
  const maxFileSize = 1024 * 1024;
  const proofTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > today()) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
  }
  function validProof(proof) {
    return proof && typeof proof.name === 'string' && proof.name.length <= 255 &&
      proofTypes.includes(proof.type) && typeof proof.data === 'string' &&
      proof.data.length <= Math.ceil(maxFileSize / 3) * 4 + 50 &&
      proof.data.startsWith(`data:${proof.type};base64,`) &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(proof.data.split(',')[1]);
  }
  function readRecords() {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed) || !parsed.every(v => v && typeof v.id === 'string' && /^[a-zA-Z0-9-]+$/.test(v.id) &&
      ['name', 'dose', 'institution'].every(key => typeof v[key] === 'string' && v[key].trim() && v[key].length <= 120) &&
      typeof v.date === 'string' && validDate(v.date) && (v.proof === null || validProof(v.proof)))) {
      throw new Error('Dados inválidos');
    }
    return parsed;
  }
  let records = [];
  let storageError = false;
  function load() {
    try { records = readRecords(); storageError = false; }
    catch { records = []; storageError = true; }
    render();
  }
  function render() {
    const total = records.length;
    const withProof = records.filter(v => v.proof).length;
    const distinct = new Set(records.map(v => v.name.trim().toLocaleLowerCase('pt-BR'))).size;
    const percent = total ? Math.round(withProof * 100 / total) : 0;
    $('#vaccine-count').textContent = total;
    const distinctLabel = `${distinct} ${distinct === 1 ? 'vacina distinta' : 'vacinas distintas'}`;
    $('#vaccine-stat-summary').textContent = distinctLabel;
    $('#vaccine-proof-percent').textContent = `${percent}%`;
    $('#vaccine-ring').setAttribute('aria-label', `${withProof} de ${total} doses com comprovante anexado`);
    $('#vaccine-progress').style.strokeDashoffset = String(320 * (1 - percent / 100));
    $('#vaccine-proof-summary').textContent = `${withProof} de ${total} doses com comprovante anexado`;
    $('#vaccine-summary').textContent = `${total} ${total === 1 ? 'dose registrada' : 'doses registradas'} · ${distinctLabel} · ${withProof} ${withProof === 1 ? 'comprovante' : 'comprovantes'}`;
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const date = value => value.split('-').reverse().join('/');
    $('#vaccine-latest').textContent = sorted.length ? `${sorted[0].name} — ${date(sorted[0].date)}` : 'Nenhuma dose registrada';
    $('#vaccine-list').innerHTML = storageError ? '<p role="alert">Não foi possível ler os registros de vacinação. Os dados salvos foram preservados. Tente recarregar a página.</p>' : sorted.length ? sorted.map(v => `<article class="vaccine-record"><div><h2>${escape(v.name)}</h2><p><strong>Dose:</strong> ${escape(v.dose)} · <time datetime="${v.date}">${date(v.date)}</time></p><p><strong>Instituição:</strong> ${escape(v.institution)}</p>${v.proof ? `<button type="button" class="text-button" data-proof-id="${v.id}">Baixar comprovante: ${escape(v.proof.name)}</button>` : '<small>Sem comprovante anexado</small>'}</div></article>`).join('') : '<div class="empty-feature"><span>✚</span><h2>Sua carteira começa aqui</h2><p>Use “Registrar vacina” para cadastrar a primeira dose.</p></div>';
  }
  const dialog = $('#vaccine-dialog');
  const form = $('#vaccine-form');
  const error = $('#vaccine-error');
  let saving = false;
  let generation = 0;
  function open() {
    if (dialog.open) return;
    form.reset(); error.textContent = ''; saving = false;
    $('#vaccine-save').disabled = false;
    $('#vaccine-date').max = today();
    $('#vaccine-date').value = today();
    generation++;
    dialog.showModal();
  }
  document.querySelectorAll('[data-action="new-vaccine"]').forEach(button => button.addEventListener('click', open));
  form.addEventListener('click', event => {
    if (event.target.closest('[data-close-vaccine]')) { generation++; dialog.close(); }
  });
  dialog.addEventListener('cancel', () => { generation++; });
  function readProof(file) {
    if (!file || !file.name) return Promise.resolve(null);
    if (!file.size) return Promise.reject(new Error('O comprovante está vazio. Selecione outro arquivo.'));
    if (!proofTypes.includes(file.type)) return Promise.reject(new Error('Selecione um comprovante PDF, JPG ou PNG.'));
    if (file.size > maxFileSize) return Promise.reject(new Error('O comprovante deve ter no máximo 1 MB.'));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o comprovante. Tente selecionar o arquivo novamente.'));
      reader.onload = () => {
        const proof = { name: file.name, type: file.type, data: reader.result };
        if (!validProof(proof)) reject(new Error('O comprovante selecionado é inválido.'));
        else resolve(proof);
      };
      reader.readAsDataURL(file);
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    error.textContent = '';
    const data = new FormData(form);
    const record = { id: crypto.randomUUID(), name: String(data.get('name') || '').trim(), dose: String(data.get('dose') || '').trim(),
      date: String(data.get('date') || ''), institution: String(data.get('institution') || '').trim() };
    if (!['name', 'dose', 'institution'].every(key => record[key] && record[key].length <= 120) || !validDate(record.date)) {
      error.textContent = 'Preencha vacina, dose e instituição. Use uma data válida, de 1900 até hoje.'; return;
    }
    saving = true;
    const current = generation;
    $('#vaccine-save').disabled = true;
    try {
      record.proof = await readProof(data.get('proof'));
      if (current !== generation || !dialog.open) return;
      let existing;
      try { existing = readRecords(); }
      catch { throw new Error('Não foi possível ler os registros existentes. Nada foi sobrescrito. Recarregue a página e tente novamente.'); }
      const normalized = text => text.trim().toLocaleLowerCase('pt-BR');
      if (existing.some(v => normalized(v.name) === normalized(record.name) && normalized(v.dose) === normalized(record.dose) && v.date === record.date)) {
        throw new Error('Essa vacina, dose e data já estão cadastradas.');
      }
      const next = [record, ...existing];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { throw new Error('Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado. Tente um comprovante menor ou cadastre sem anexo.'); }
      records = next; storageError = false; render(); dialog.close();
      toast('Vacina registrada neste navegador.');
    } catch (err) {
      if (current === generation && dialog.open) error.textContent = err.message;
    } finally {
      if (current === generation) { saving = false; $('#vaccine-save').disabled = false; }
    }
  });
  $('#vaccine-list').addEventListener('click', event => {
    const button = event.target.closest('[data-proof-id]');
    if (!button) return;
    const proof = records.find(v => v.id === button.dataset.proofId)?.proof;
    if (!validProof(proof)) return;
    const bytes = Uint8Array.from(atob(proof.data.split(',')[1]), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: proof.type }));
    const link = document.createElement('a');
    link.href = url;
    const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[proof.type];
    link.download = proof.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\.[^.]*$/, '') + extension;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) load(); });
  window.addEventListener('focus', load);
  load();
})();

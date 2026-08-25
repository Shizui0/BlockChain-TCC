const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });

const products = [
  { name: "Leitor Biométrico X2", detail: "Última saída há 2h", sku: "FIA-1048", category: "Eletrônicos", stock: 184, min: 30, price: 289.9, icon: "scan-face" },
  { name: "Bobina Térmica 80mm", detail: "Entrada hoje às 09:42", sku: "SUP-2841", category: "Suprimentos", stock: 640, min: 120, price: 8.4, icon: "receipt-text" },
  { name: "Terminal Smart POS", detail: "Última saída ontem", sku: "FIA-8832", category: "Eletrônicos", stock: 7, min: 15, price: 1249, icon: "tablet-smartphone" },
  { name: "Cabo USB-C Reforçado", detail: "Entrada há 3 dias", sku: "ACE-3205", category: "Acessórios", stock: 286, min: 50, price: 34.5, icon: "cable" },
  { name: "Impressora Térmica Pro", detail: "Última saída há 4 dias", sku: "FIA-4419", category: "Eletrônicos", stock: 21, min: 20, price: 769.9, icon: "printer" },
  { name: "Etiqueta Adesiva 40x25", detail: "Entrada há 5 dias", sku: "SUP-1976", category: "Suprimentos", stock: 42, min: 60, price: 24.9, icon: "tag" }
];

const chartSets = {
  7: { labels: ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"], entry: [62, 81, 56, 92, 74, 47, 69], exit: [38, 51, 43, 63, 48, 31, 41] },
  30: { labels: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"], entry: [74, 61, 88, 72, 96, 68, 82], exit: [49, 44, 57, 51, 63, 46, 55] },
  90: { labels: ["MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET"], entry: [55, 68, 77, 64, 89, 84, 95], exit: [42, 50, 48, 56, 61, 58, 67] }
};

const dashboardState = {
  totalProducts: 1248,
  totalUnits: 8653,
  lowStock: 23,
  inventoryValue: 128746.5
};

try {
  const savedState = JSON.parse(localStorage.getItem("fia-inventory-state") || "null");
  if (Array.isArray(savedState?.products) && savedState.products.length) products.splice(0, products.length, ...savedState.products);
  if (savedState?.dashboardState) Object.assign(dashboardState, savedState.dashboardState);
} catch {
  localStorage.removeItem("fia-inventory-state");
}

function saveInventoryState() {
  localStorage.setItem("fia-inventory-state", JSON.stringify({ products, dashboardState }));
}

const formatNumber = new Intl.NumberFormat("pt-BR");
const formatCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function renderProducts(list = products) {
  const body = document.querySelector("#productTableBody");
  body.innerHTML = list.map((product) => {
    const index = products.indexOf(product);
    const status = product.stock < product.min * .6 ? ["Crítico", "critical"] : product.stock < product.min ? ["Estoque baixo", "low"] : ["Saudável", "healthy"];
    return `<tr data-product-index="${index}">
      <td><div class="product-cell"><span class="product-thumb"><i data-lucide="${product.icon}"></i></span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.detail)}</small></span></div></td>
      <td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.category)}</td>
      <td><span class="stock-cell"><strong>${product.stock} un.</strong><small>Mínimo: ${product.min}</small></span></td>
      <td>${product.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
      <td><span class="status-pill ${status[1]}">${status[0]}</span></td>
      <td><button class="icon-button row-action" type="button" aria-label="Opções de ${escapeHtml(product.name)}" data-row-action="${index}"><i data-lucide="ellipsis"></i></button></td>
    </tr>`;
  }).join("");
  document.querySelector("#tableCount").textContent = list.length === products.length
    ? `Mostrando ${list.length} de ${formatNumber.format(dashboardState.totalProducts)} produtos`
    : `${list.length} produto${list.length === 1 ? "" : "s"} encontrado${list.length === 1 ? "" : "s"}`;
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function renderChart(period = 7) {
  const chart = document.querySelector("#barChart");
  const set = chartSets[period];
  chart.innerHTML = set.labels.map((label, index) => `<div class="bar-group">
    <div class="bar-pair">
      <button class="bar entry" style="height:${set.entry[index]}%" data-kind="Entrada" data-label="${label}" data-value="${set.entry[index] * 3}" aria-label="Entrada em ${label}: ${set.entry[index] * 3} unidades"></button>
      <button class="bar exit" style="height:${set.exit[index]}%" data-kind="Saída" data-label="${label}" data-value="${set.exit[index] * 3}" aria-label="Saída em ${label}: ${set.exit[index] * 3} unidades"></button>
    </div><small>${label}</small></div>`).join("");
}

renderProducts();
renderChart();

let pointerFrame = 0;
document.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || !finePointer.matches) return;
  if (pointerFrame) cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--mouse-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--mouse-y", `${event.clientY}px`);
  });
}, { passive: true });

document.querySelectorAll("[data-spotlight]").forEach((element) => {
  let elementFrame = 0;
  element.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || !finePointer.matches) return;
    if (elementFrame) cancelAnimationFrame(elementFrame);
    elementFrame = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
      if (element.classList.contains("hero")) {
        const x = ((event.clientX - rect.left) / rect.width - .5) * 8;
        const y = ((event.clientY - rect.top) / rect.height - .5) * 6;
        element.style.setProperty("--hero-shift-x", `${x}px`);
        element.style.setProperty("--hero-shift-y", `${y}px`);
      }
    });
  }, { passive: true });
  element.addEventListener("pointerleave", () => {
    if (!element.classList.contains("hero")) return;
    element.style.setProperty("--hero-shift-x", "0px");
    element.style.setProperty("--hero-shift-y", "0px");
  });
});

document.querySelectorAll("[data-magnetic]").forEach((element) => {
  let magneticFrame = 0;
  element.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || !finePointer.matches) return;
    if (magneticFrame) cancelAnimationFrame(magneticFrame);
    magneticFrame = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const offsetX = Math.max(-4, Math.min(4, (event.clientX - rect.left - rect.width / 2) * .12));
      const offsetY = Math.max(-4, Math.min(4, (event.clientY - rect.top - rect.height / 2) * .12));
      element.style.setProperty("--mag-x", `${offsetX}px`);
      element.style.setProperty("--mag-y", `${offsetY}px`);
    });
  }, { passive: true });
  element.addEventListener("pointerleave", () => {
    element.style.setProperty("--mag-x", "0px");
    element.style.setProperty("--mag-y", "0px");
  });
});

const metricElements = [...document.querySelectorAll("[data-count]")];

function metricText(element, value) {
  return element.classList.contains("currency") ? formatCurrency.format(value) : formatNumber.format(Math.round(value));
}

function updateMetrics() {
  const values = [dashboardState.totalProducts, dashboardState.totalUnits, dashboardState.lowStock, dashboardState.inventoryValue];
  metricElements.forEach((element, index) => {
    element.dataset.count = String(values[index]);
    element.textContent = metricText(element, values[index]);
  });
}

function animateMetricsOnce() {
  if (reducedMotion.matches || sessionStorage.getItem("fia-metrics-animated")) {
    updateMetrics();
    return;
  }
  sessionStorage.setItem("fia-metrics-animated", "true");
  const duration = 720;
  const start = performance.now();
  const targets = metricElements.map((element) => Number(element.dataset.count));
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    metricElements.forEach((element, index) => {
      element.textContent = metricText(element, targets[index] * eased);
    });
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

animateMetricsOnce();

const toast = document.querySelector("#toast");
let toastTimer = 0;
function showToast(title, message, tone = "success") {
  document.querySelector("#toastTitle").textContent = title;
  document.querySelector("#toastMessage").textContent = message;
  const icon = toast.querySelector("[data-lucide]");
  icon?.setAttribute("data-lucide", tone === "error" ? "circle-alert" : "circle-check");
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector("#sidebarScrim");
function closeMobileMenu() {
  sidebar.classList.remove("open");
  sidebarScrim.classList.remove("show");
}
document.querySelector("#mobileMenu").addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarScrim.classList.toggle("show");
});
sidebarScrim.addEventListener("click", closeMobileMenu);

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((navItem) => navItem.classList.remove("active"));
    item.classList.add("active");
    const section = item.dataset.section;
    document.querySelector("#sectionTitle").textContent = section;
    closeMobileMenu();
    if (section !== "Visão geral") showToast(`${section} selecionado`, "A navegação está pronta para receber os módulos desta área.");
  });
});

document.querySelectorAll("[data-section-link]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.sectionLink;
    document.querySelector(`.nav-item[data-section="${target}"]`)?.click();
  });
});

const search = document.querySelector("#globalSearch");
search.addEventListener("input", () => {
  const term = search.value.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter((product) => [product.name, product.sku, product.category].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)));
  renderProducts(filtered);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    search.focus();
  }
  if (event.key === "Escape") closeMobileMenu();
});

const notificationsPanel = document.querySelector("#notificationsPanel");
const profilePanel = document.querySelector("#profilePanel");
function closeFloatingPanels(except) {
  [notificationsPanel, profilePanel].forEach((panel) => {
    if (panel !== except) panel.hidden = true;
  });
  if (profilePanel !== except) document.querySelector("#profileButton").setAttribute("aria-expanded", "false");
}
document.querySelector("#notificationsButton").addEventListener("click", (event) => {
  event.stopPropagation();
  const nextHidden = !notificationsPanel.hidden;
  closeFloatingPanels(notificationsPanel);
  notificationsPanel.hidden = nextHidden;
});
document.querySelector("#profileButton").addEventListener("click", (event) => {
  event.stopPropagation();
  const nextHidden = !profilePanel.hidden;
  closeFloatingPanels(profilePanel);
  profilePanel.hidden = nextHidden;
  event.currentTarget.setAttribute("aria-expanded", String(!nextHidden));
});
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", () => closeFloatingPanels()));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".floating-panel") && !event.target.closest("#notificationsButton") && !event.target.closest("#profileButton")) closeFloatingPanels();
});

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach((periodButton) => periodButton.classList.remove("active"));
    button.classList.add("active");
    renderChart(Number(button.dataset.period));
  });
});

const tooltip = document.querySelector("#chartTooltip");
const barChart = document.querySelector("#barChart");
barChart.addEventListener("pointerover", (event) => {
  const bar = event.target.closest(".bar");
  if (!bar) return;
  barChart.classList.add("is-hovering");
  bar.classList.add("is-active");
  tooltip.innerHTML = `<strong>${bar.dataset.kind}</strong>${bar.dataset.label} · ${formatNumber.format(Number(bar.dataset.value))} unidades`;
  tooltip.hidden = false;
});
barChart.addEventListener("pointermove", (event) => {
  if (tooltip.hidden) return;
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}, { passive: true });
barChart.addEventListener("pointerout", (event) => {
  const bar = event.target.closest(".bar");
  if (!bar || event.relatedTarget?.closest?.(".bar") === bar) return;
  barChart.classList.remove("is-hovering");
  bar.classList.remove("is-active");
  tooltip.hidden = true;
});

const donutSegments = [...document.querySelectorAll(".donut-segment")];
const categoryButtons = [...document.querySelectorAll("[data-category-target]")];
function activateCategory(category, pointerEvent) {
  donutSegments.forEach((segment) => {
    segment.classList.toggle("is-active", segment.dataset.category === category);
    segment.classList.toggle("is-muted", segment.dataset.category !== category);
  });
  categoryButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.categoryTarget === category));
  const segment = donutSegments.find((item) => item.dataset.category === category);
  if (pointerEvent && segment) {
    tooltip.innerHTML = `<strong>${escapeHtml(category)}</strong>${segment.dataset.value}% do estoque`;
    tooltip.style.left = `${pointerEvent.clientX}px`;
    tooltip.style.top = `${pointerEvent.clientY}px`;
    tooltip.hidden = false;
  }
}
function clearCategory() {
  donutSegments.forEach((segment) => segment.classList.remove("is-active", "is-muted"));
  categoryButtons.forEach((button) => button.classList.remove("is-active"));
  tooltip.hidden = true;
}
donutSegments.forEach((segment) => {
  segment.addEventListener("pointerenter", (event) => activateCategory(segment.dataset.category, event));
  segment.addEventListener("pointermove", (event) => { tooltip.style.left = `${event.clientX}px`; tooltip.style.top = `${event.clientY}px`; }, { passive: true });
  segment.addEventListener("pointerleave", clearCategory);
});
categoryButtons.forEach((button) => {
  button.addEventListener("pointerenter", () => activateCategory(button.dataset.categoryTarget));
  button.addEventListener("pointerleave", clearCategory);
  button.addEventListener("focus", () => activateCategory(button.dataset.categoryTarget));
  button.addEventListener("blur", clearCategory);
});

const dialog = document.querySelector("#actionDialog");
const actionForm = document.querySelector("#actionForm");
const dialogFields = document.querySelector("#dialogFields");

const actionCopy = {
  entry: ["MOVIMENTAÇÃO", "Registrar entrada", "Adicione unidades a um produto já cadastrado.", "Confirmar entrada"],
  exit: ["MOVIMENTAÇÃO", "Registrar saída", "Registre a retirada de unidades com segurança.", "Confirmar saída"],
  product: ["CATÁLOGO", "Cadastrar produto", "Inclua um novo item no controle de estoque.", "Cadastrar produto"]
};

function productOptions(selectedIndex) {
  return products.map((product, index) => `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</option>`).join("");
}

function openAction(action, selectedIndex = 0) {
  if (action === "report") {
    generateReport();
    return;
  }
  const copy = actionCopy[action];
  actionForm.dataset.action = action;
  document.querySelector("#dialogKicker").textContent = copy[0];
  document.querySelector("#dialogTitle").textContent = copy[1];
  document.querySelector("#dialogDescription").textContent = copy[2];
  document.querySelector("#dialogSubmit").textContent = copy[3];
  if (action === "product") {
    dialogFields.innerHTML = `
      <div class="field full"><label for="productName">Nome do produto</label><input id="productName" name="name" required maxlength="60" placeholder="Ex.: Pin Pad Smart"></div>
      <div class="field"><label for="productSku">SKU</label><input id="productSku" name="sku" required maxlength="18" placeholder="FIA-0000"></div>
      <div class="field"><label for="productCategory">Categoria</label><select id="productCategory" name="category"><option>Eletrônicos</option><option>Suprimentos</option><option>Acessórios</option></select></div>
      <div class="field"><label for="productStock">Estoque inicial</label><input id="productStock" name="stock" type="number" required min="0" step="1" value="0"></div>
      <div class="field"><label for="productMinimum">Estoque mínimo</label><input id="productMinimum" name="minimum" type="number" required min="1" step="1" value="10"></div>
      <div class="field full"><label for="productPrice">Valor unitário (R$)</label><input id="productPrice" name="price" type="number" required min="0" step="0.01" placeholder="0,00"></div>`;
  } else {
    dialogFields.innerHTML = `
      <div class="field full"><label for="movementProduct">Produto</label><select id="movementProduct" name="product" required>${productOptions(selectedIndex)}</select></div>
      <div class="field"><label for="movementQuantity">Quantidade</label><input id="movementQuantity" name="quantity" type="number" required min="1" step="1" value="1"></div>
      <div class="field"><label for="movementDocument">Documento</label><input id="movementDocument" name="document" maxlength="24" placeholder="NF, pedido ou OS"></div>
      <div class="field full"><label for="movementNote">Observação</label><input id="movementNote" name="note" maxlength="90" placeholder="Informação opcional sobre a movimentação"></div>`;
  }
  dialog.showModal();
  requestAnimationFrame(() => dialog.querySelector("input, select")?.focus());
}

function closeDialog() {
  dialog.close();
  actionForm.reset();
}
document.querySelector("#dialogClose").addEventListener("click", closeDialog);
document.querySelector("#dialogCancel").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });

document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => openAction(button.dataset.action)));
document.querySelector("#productTableBody").addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-row-action]");
  if (actionButton) openAction("entry", Number(actionButton.dataset.rowAction));
});

actionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(actionForm);
  const action = actionForm.dataset.action;
  if (action === "product") {
    const stock = Number(data.get("stock"));
    const minimum = Number(data.get("minimum"));
    const price = Number(data.get("price"));
    const product = {
      name: String(data.get("name")).trim(), sku: String(data.get("sku")).trim().toUpperCase(), category: String(data.get("category")),
      stock, min: minimum, price, icon: "package-check", detail: "Cadastrado agora"
    };
    products.unshift(product);
    dashboardState.totalProducts += 1;
    dashboardState.totalUnits += stock;
    dashboardState.inventoryValue += stock * price;
    if (stock < minimum) dashboardState.lowStock += 1;
    saveInventoryState();
    renderProducts();
    updateMetrics();
    closeDialog();
    showToast("Produto cadastrado", `${product.name} já está disponível no catálogo.`);
    return;
  }

  const product = products[Number(data.get("product"))];
  const quantity = Number(data.get("quantity"));
  if (action === "exit" && quantity > product.stock) {
    const quantityInput = document.querySelector("#movementQuantity");
    quantityInput.setCustomValidity(`Disponível: ${product.stock} unidades.`);
    quantityInput.reportValidity();
    quantityInput.addEventListener("input", () => quantityInput.setCustomValidity(""), { once: true });
    return;
  }
  const wasLow = product.stock < product.min;
  const multiplier = action === "entry" ? 1 : -1;
  product.stock += quantity * multiplier;
  product.detail = `${action === "entry" ? "Entrada" : "Saída"} registrada agora`;
  dashboardState.totalUnits += quantity * multiplier;
  dashboardState.inventoryValue += quantity * product.price * multiplier;
  const isLow = product.stock < product.min;
  if (wasLow !== isLow) dashboardState.lowStock += isLow ? 1 : -1;
  saveInventoryState();
  renderProducts();
  updateMetrics();
  closeDialog();
  showToast(action === "entry" ? "Entrada registrada" : "Saída registrada", `${quantity} unidade${quantity === 1 ? "" : "s"} de ${product.name} atualizada${quantity === 1 ? "" : "s"}.`);
});

function generateReport() {
  const header = ["Produto", "SKU", "Categoria", "Estoque", "Mínimo", "Valor unitário", "Status"];
  const rows = products.map((product) => [
    product.name, product.sku, product.category, product.stock, product.min, product.price.toFixed(2).replace(".", ","), product.stock < product.min ? "Estoque baixo" : "Saudável"
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Relatório gerado", "O arquivo CSV contém a posição atual do estoque.");
}

document.querySelector(".support-card").addEventListener("click", () => showToast("Central de ajuda", "O suporte da FIA Systems está disponível em horário comercial."));

reducedMotion.addEventListener?.("change", () => {
  if (reducedMotion.matches) {
    document.documentElement.style.removeProperty("--mouse-x");
    document.documentElement.style.removeProperty("--mouse-y");
    document.querySelectorAll("[data-magnetic]").forEach((element) => {
      element.style.setProperty("--mag-x", "0px");
      element.style.setProperty("--mag-y", "0px");
    });
  }
});

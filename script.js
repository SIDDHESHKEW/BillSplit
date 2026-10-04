/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * BillSplit — Client-Side Precision Partitioning Engine for Indian Rupees (₹)
 * Built with exact-unit integer scaling, dynamic micro-share resolution,
 * windowed DOM pagination for large cohorts, and resilient local persistence.
 * Competition ID: ZC-1522AFD0C589
 * Author: Siddhesh H. Kewate
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const STORAGE_KEY = 'billsplit_inr_state_v4';
  const CURRENCY_SYMBOL = '₹';
  const MIN_PEOPLE = 2;
  const MAX_PEOPLE = 5000;
  const MAX_BILL = 100000000; // 10 Crore ₹
  const PAGE_SIZE = 30; // Windowed pagination size to prevent DOM freezing

  // --- Clean Inline SVG Icons ---
  const ICONS = {
    copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  };

  // --- Application State ---
  const state = {
    occasion: '',
    billAmount: 0,
    baseBillAmount: 0,
    numberOfPeople: 0,
    precision: 2,
    tipPercent: 0,
    gstPercent: 0,
    shares: [], // Array of { id: number, name: string, amount: number, isAdjusted: boolean }
    totalSum: 0,
    baseAmount: 0,
    adjustedAmount: 0,
    remainderCount: 0,
    currentPage: 1,
    errors: {
      occasion: null,
      amount: null,
      people: null,
    },
    isCalculated: false,
  };

  // --- DOM Element References ---
  const elements = {
    // Splash elements
    splashScreen: document.getElementById('splashScreen'),
    splashProgressBar: document.getElementById('splashProgressBar'),
    skipSplashBtn: document.getElementById('skipSplashBtn'),

    // Main form elements
    form: document.getElementById('billForm'),
    occasionInput: document.getElementById('occasionInput'),
    amountInput: document.getElementById('amountInput'),
    peopleInput: document.getElementById('peopleInput'),
    resetAppBtn: document.getElementById('resetAppBtn'),
    splitBtn: document.getElementById('splitBtn'),
    presetButtons: document.querySelectorAll('.preset-btn'),

    // Addons (Tip & GST)
    toggleAddonsBtn: document.getElementById('toggleAddonsBtn'),
    addonsPanel: document.getElementById('addonsPanel'),
    tipPills: document.querySelectorAll('[data-tip]'),
    gstPills: document.querySelectorAll('[data-gst]'),
    addonSummary: document.getElementById('addonSummary'),

    // Validation groups & error alerts
    groupOccasion: document.getElementById('groupOccasion'),
    groupAmount: document.getElementById('groupAmount'),
    groupPeople: document.getElementById('groupPeople'),
    occasionError: document.getElementById('occasionError'),
    amountError: document.getElementById('amountError'),
    peopleError: document.getElementById('peopleError'),

    // States & views
    saveStatus: document.getElementById('saveStatus'),
    emptyState: document.getElementById('emptyState'),
    resultsView: document.getElementById('resultsView'),

    // Result summary fields
    resOccasion: document.getElementById('resOccasion'),
    resTotalBill: document.getElementById('resTotalBill'),
    resPeopleCount: document.getElementById('resPeopleCount'),
    resPerPerson: document.getElementById('resPerPerson'),
    roundingNotice: document.getElementById('roundingNotice'),
    personsBadge: document.getElementById('personsBadge'),
    personsGrid: document.getElementById('personsGrid'),
    resSumTotal: document.getElementById('resSumTotal'),

    // Windowed Pagination controls
    paginationControls: document.getElementById('paginationControls'),
    displayCountNotice: document.getElementById('displayCountNotice'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageIndicator: document.getElementById('pageIndicator'),

    // Result Actions
    shareWhatsAppBtn: document.getElementById('shareWhatsAppBtn'),
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    copyBtnIconWrap: document.getElementById('copyBtnIconWrap'),
    copyBtnText: document.getElementById('copyBtnText'),
    printReceiptBtn: document.getElementById('printReceiptBtn'),
  };

  // --- Utility Functions ---

  /**
   * Formats numeric value using Indian Numbering System (en-IN)
   * e.g. 100000 -> ₹1,00,000.00
   */
  function formatINR(amount, precision = state.precision) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return `${CURRENCY_SYMBOL}0.00`;
    }
    const formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return `${CURRENCY_SYMBOL}${formatted}`;
  }

  // --- Splash Screen Controller (4 Seconds) ---
  function initSplashScreen() {
    if (!elements.splashScreen) return;

    if (elements.splashProgressBar) {
      requestAnimationFrame(() => {
        elements.splashProgressBar.style.width = '100%';
      });
    }

    function dismissSplash() {
      if (!elements.splashScreen || elements.splashScreen.classList.contains('dismissed')) return;
      elements.splashScreen.classList.add('dismissed');
      setTimeout(() => {
        elements.splashScreen.style.display = 'none';
      }, 750);
    }

    const splashTimer = setTimeout(dismissSplash, 4000);

    if (elements.skipSplashBtn) {
      elements.skipSplashBtn.addEventListener('click', () => {
        clearTimeout(splashTimer);
        dismissSplash();
      });
    }
  }

  // --- Precision & Division Engine ---

  /**
   * Determines required decimal precision so that even extreme conditions
   * (e.g. ₹0.01 or ₹1 distributed among 1,000 people) give every participant
   * a non-zero, actually distributed share instead of rounding to ₹0.00.
   */
  function determinePrecision(billAmount, numberOfPeople) {
    // If standard 2-decimal (paise) division gives at least 1 paisa to everyone:
    const standardUnits = Math.floor(Math.round(billAmount * 100) / numberOfPeople);
    if (standardUnits >= 1) {
      return 2;
    }

    // Scale up decimals (from 3 to 6) until base units per person is >= 1
    for (let d = 3; d <= 6; d++) {
      const scale = Math.pow(10, d);
      const units = Math.floor(Math.round(billAmount * scale) / numberOfPeople);
      if (units >= 1) {
        return d;
      }
    }

    // Fallback maximum precision
    return 6;
  }

  /**
   * Computes individual shares with zero drift.
   * Every single paisa or micro-unit is accounted for.
   */
  function computeDistribution(billAmount, numberOfPeople, existingShares = []) {
    if (typeof numberOfPeople !== 'number' || numberOfPeople < 2 || isNaN(numberOfPeople)) {
      return null;
    }

    const precision = determinePrecision(billAmount, numberOfPeople);
    const scale = Math.pow(10, precision);

    const totalScaledUnits = Math.round(billAmount * scale);
    const baseUnits = Math.floor(totalScaledUnits / numberOfPeople);
    const remainderUnits = totalScaledUnits % numberOfPeople;

    const shares = [];
    let runningSum = 0;

    for (let i = 0; i < numberOfPeople; i++) {
      const isAdjusted = i < remainderUnits;
      const personUnits = isAdjusted ? baseUnits + 1 : baseUnits;
      runningSum += personUnits;

      // Preserve custom name if user previously customized it
      const prevName = existingShares[i] && existingShares[i].name ? existingShares[i].name : `Person ${i + 1}`;

      shares.push({
        id: i + 1,
        name: prevName,
        amount: personUnits / scale,
        isAdjusted: isAdjusted && remainderUnits > 0,
      });
    }

    const totalSum = runningSum / scale;

    return {
      precision,
      shares,
      totalSum,
      baseAmount: baseUnits / scale,
      adjustedAmount: (baseUnits + 1) / scale,
      remainderCount: remainderUnits,
    };
  }

  // --- Input Validation ---

  function validateOccasion(value) {
    const raw = String(value ?? '');
    if (!raw.trim()) {
      return 'Please enter the occasion name (e.g. Dinner with Friends).';
    }

    if (/^\s/.test(raw)) {
      return 'Occasion name cannot start with spaces.';
    }

    const trimmed = raw.trim();

    if (/^0+/.test(trimmed)) {
      return 'Occasion name cannot start with leading zeros.';
    }

    if (!/[a-zA-Z\p{L}]/u.test(trimmed)) {
      return 'Occasion name must contain letters (e.g. Dinner with Friends).';
    }

    if (trimmed.length < 2) {
      return 'Occasion name must be at least 2 characters long.';
    }

    if (trimmed.length > 80) {
      return 'Occasion name cannot exceed 80 characters.';
    }

    return null;
  }

  function validateAmount(value) {
    const raw = String(value ?? '');
    if (!raw.trim()) {
      return 'Please enter the total bill amount.';
    }

    const trimmed = raw.trim();

    if (/\s/.test(trimmed)) {
      return 'Bill amount cannot contain spaces within the number.';
    }

    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return 'Bill amount must contain only valid numbers (no letters or symbols).';
    }

    if (/^0\d+/.test(trimmed)) {
      return 'Bill amount cannot have leading zeros.';
    }

    const num = Number(trimmed);
    if (isNaN(num) || num <= 0) {
      return 'Bill amount must be greater than zero.';
    }

    if (num > MAX_BILL) {
      return `Bill amount cannot exceed ${formatINR(MAX_BILL, 0)}.`;
    }

    return null;
  }

  function validatePeople(value) {
    const raw = String(value ?? '');
    if (!raw.trim()) {
      return 'Please enter the number of people.';
    }

    const trimmed = raw.trim();

    if (/\s/.test(trimmed)) {
      return 'Participant count cannot contain spaces within the number.';
    }

    if (!/^\d+$/.test(trimmed)) {
      return 'Participant count must be a whole positive number (no decimals or letters).';
    }

    if (/^0\d+/.test(trimmed)) {
      return 'Participant count cannot have leading zeros.';
    }

    const num = Number(trimmed);

    if (num === 0) {
      return 'Number of people cannot be 0. Enter at least 2 people.';
    }

    if (num === 1) {
      return 'A bill splitter requires at least 2 people.';
    }

    if (num < MIN_PEOPLE) {
      return `Please enter at least ${MIN_PEOPLE} participants to split a bill.`;
    }

    if (num > MAX_PEOPLE) {
      return `Participant count cannot exceed ${MAX_PEOPLE.toLocaleString('en-IN')} to ensure browser stability.`;
    }

    return null;
  }

  function setFieldError(field, errorMsg) {
    state.errors[field] = errorMsg;

    let groupEl, errorEl;
    if (field === 'occasion') {
      groupEl = elements.groupOccasion;
      errorEl = elements.occasionError;
    } else if (field === 'amount') {
      groupEl = elements.groupAmount;
      errorEl = elements.amountError;
    } else if (field === 'people') {
      groupEl = elements.groupPeople;
      errorEl = elements.peopleError;
    }

    if (!groupEl || !errorEl) return;

    if (errorMsg) {
      groupEl.classList.add('has-error');
      errorEl.textContent = errorMsg;
    } else {
      groupEl.classList.remove('has-error');
      errorEl.textContent = '';
    }
  }

  function validateAll() {
    const occasionError = validateOccasion(elements.occasionInput.value);
    const amountError = validateAmount(elements.amountInput.value);
    const peopleError = validatePeople(elements.peopleInput.value);

    setFieldError('occasion', occasionError);
    setFieldError('amount', amountError);
    setFieldError('people', peopleError);

    return !occasionError && !amountError && !peopleError;
  }

  // --- Add-ons (Tip / GST) Calculation ---
  function recalculateAddons() {
    const raw = Number(elements.amountInput.value.trim());
    if (isNaN(raw) || raw <= 0) return;

    const base = state.baseBillAmount > 0 ? state.baseBillAmount : raw;
    state.baseBillAmount = base;

    const tipAmt = Math.round(base * (state.tipPercent / 100) * 100) / 100;
    const gstAmt = Math.round(base * (state.gstPercent / 100) * 100) / 100;
    const grandTotal = Math.round((base + tipAmt + gstAmt) * 100) / 100;

    if (state.tipPercent > 0 || state.gstPercent > 0) {
      elements.addonSummary.textContent = `Base: ${formatINR(base, 2)} + Tip (${state.tipPercent}%): ${formatINR(tipAmt, 2)} + GST (${state.gstPercent}%): ${formatINR(gstAmt, 2)} = Grand Total: ${formatINR(grandTotal, 2)}`;
      elements.addonSummary.classList.remove('hidden');
    } else {
      elements.addonSummary.classList.add('hidden');
    }

    elements.amountInput.value = grandTotal.toFixed(2);

    if (state.isCalculated && validateAll()) {
      handleFormSubmit();
    }
  }

  // --- Rendering Engine with Custom Inline Renaming ---

  function renderPersonCards() {
    elements.personsGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const totalShares = state.shares.length;
    const startIndex = (state.currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(totalShares, startIndex + PAGE_SIZE);
    const pageShares = state.shares.slice(startIndex, endIndex);

    pageShares.forEach((share) => {
      const card = document.createElement('div');
      card.className = `person-card${share.isAdjusted ? ' has-cent-adjust' : ''}`;
      card.setAttribute('role', 'listitem');

      // Top row: Avatar + Name
      const topDiv = document.createElement('div');
      topDiv.className = 'person-card-top';

      const avatar = document.createElement('div');
      avatar.className = 'person-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = String(share.id);

      const nameWrap = document.createElement('div');
      nameWrap.className = 'person-name-wrap';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'person-name person-name-editable';
      nameSpan.textContent = share.name;
      nameSpan.title = 'Click to rename participant';

      // Inline renaming functionality
      nameSpan.addEventListener('click', () => {
        const currentName = share.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'person-name-input';
        input.value = currentName;
        input.maxLength = 30;

        let finished = false;
        const finishEdit = () => {
          if (finished) return;
          finished = true;
          const newName = input.value.trim();
          if (newName && newName !== currentName) {
            share.name = newName;
            saveToStorage();
          }
          renderPersonCards();
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          } else if (e.key === 'Escape') {
            input.value = currentName;
            input.blur();
          }
        });

        nameWrap.replaceChild(input, nameSpan);
        input.focus();
        input.select();
      });

      const subSpan = document.createElement('span');
      subSpan.className = 'person-sub';
      subSpan.textContent = share.isAdjusted ? 'Balanced share' : 'Standard share';

      nameWrap.appendChild(nameSpan);
      nameWrap.appendChild(subSpan);

      topDiv.appendChild(avatar);
      topDiv.appendChild(nameWrap);

      // Amount row
      const amountWrap = document.createElement('div');
      amountWrap.className = 'person-amount-wrap';

      const amountLabel = document.createElement('span');
      amountLabel.className = 'person-amount-label';
      amountLabel.textContent = 'To Pay';

      const amountValue = document.createElement('span');
      amountValue.className = 'person-amount';
      amountValue.textContent = formatINR(share.amount, state.precision);

      amountWrap.appendChild(amountLabel);
      amountWrap.appendChild(amountValue);

      card.appendChild(topDiv);
      card.appendChild(amountWrap);
      fragment.appendChild(card);
    });

    elements.personsGrid.appendChild(fragment);

    // Update pagination controls
    if (totalShares > PAGE_SIZE) {
      const totalPages = Math.ceil(totalShares / PAGE_SIZE);
      elements.paginationControls.classList.remove('hidden');
      elements.displayCountNotice.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalShares.toLocaleString('en-IN')}`;
      elements.pageIndicator.textContent = `${state.currentPage} / ${totalPages}`;
      elements.prevPageBtn.disabled = state.currentPage === 1;
      elements.nextPageBtn.disabled = state.currentPage === totalPages;
    } else {
      elements.paginationControls.classList.add('hidden');
    }
  }

  function renderResults() {
    if (!state.isCalculated) {
      elements.emptyState.classList.remove('hidden');
      elements.resultsView.classList.add('hidden');
      return;
    }

    elements.emptyState.classList.add('hidden');
    elements.resultsView.classList.remove('hidden');

    elements.resOccasion.textContent = state.occasion;
    elements.resTotalBill.textContent = formatINR(state.billAmount, Math.min(state.precision, 2));
    elements.resPeopleCount.textContent = state.numberOfPeople.toLocaleString('en-IN');

    // Display share amount per person
    if (state.remainderCount > 0) {
      elements.resPerPerson.textContent = `${formatINR(state.baseAmount, state.precision)} – ${formatINR(state.adjustedAmount, state.precision)}`;

      const count = state.remainderCount;
      const unit = (1 / Math.pow(10, state.precision)).toFixed(state.precision);

      let noticeText = `<strong>Exact Balancing:</strong> ${count} member${count > 1 ? 's contribute' : ' contributes'} an extra ₹${unit} so individual shares sum exactly to ₹${state.billAmount.toFixed(2)}.`;

      if (state.precision > 2) {
        noticeText += `<br><em>Micro-share precision active (${state.precision} decimals) so all ${state.numberOfPeople.toLocaleString('en-IN')} participants receive a distributed, non-zero share.</em>`;
      }

      elements.roundingNotice.innerHTML = noticeText;
      elements.roundingNotice.classList.remove('hidden');
    } else {
      elements.resPerPerson.textContent = formatINR(state.baseAmount, state.precision);

      if (state.precision > 2) {
        elements.roundingNotice.innerHTML = `<em>Micro-share precision active: Calculated to ${state.precision} decimal places so all ${state.numberOfPeople.toLocaleString('en-IN')} participants receive a non-zero share.</em>`;
        elements.roundingNotice.classList.remove('hidden');
      } else {
        elements.roundingNotice.classList.add('hidden');
      }
    }

    // Badge
    elements.personsBadge.textContent = `${state.numberOfPeople.toLocaleString('en-IN')} Shares`;

    // Render Windowed Cards
    renderPersonCards();

    // Reconciled Total
    elements.resSumTotal.textContent = formatINR(state.totalSum, state.precision);

    // Preset button sync
    updatePresetButtons(state.numberOfPeople);
  }

  function updatePresetButtons(currentPeople) {
    elements.presetButtons.forEach((btn) => {
      const count = Number(btn.getAttribute('data-people'));
      if (count === currentPeople) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  let saveStatusTimer = null;
  function showSaveStatus() {
    elements.saveStatus.classList.remove('hidden');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
      elements.saveStatus.classList.add('hidden');
    }, 3200);
  }

  // --- LocalStorage Persistence ---

  function saveToStorage() {
    if (!state.isCalculated) return;
    try {
      const payload = {
        occasion: state.occasion,
        billAmount: state.billAmount,
        baseBillAmount: state.baseBillAmount,
        numberOfPeople: state.numberOfPeople,
        tipPercent: state.tipPercent,
        gstPercent: state.gstPercent,
        shares: state.shares.map((s) => ({ id: s.id, name: s.name, amount: s.amount, isAdjusted: s.isAdjusted })),
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      showSaveStatus();
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;

      const occasion = String(data.occasion ?? '');
      const amountStr = String(data.billAmount ?? '');
      const peopleStr = String(data.numberOfPeople ?? '');

      if (validateOccasion(occasion) !== null) return false;
      if (validateAmount(amountStr) !== null) return false;
      if (validatePeople(peopleStr) !== null) return false;

      const amount = Number(amountStr);
      const people = Number(peopleStr);

      elements.occasionInput.value = occasion;
      elements.amountInput.value = amount.toFixed(2);
      elements.peopleInput.value = String(people);

      state.occasion = occasion;
      state.billAmount = amount;
      state.baseBillAmount = Number(data.baseBillAmount) || amount;
      state.numberOfPeople = people;
      state.tipPercent = Number(data.tipPercent) || 0;
      state.gstPercent = Number(data.gstPercent) || 0;
      state.currentPage = 1;

      // Update addon pill UI
      elements.tipPills.forEach((p) => {
        if (Number(p.getAttribute('data-tip')) === state.tipPercent) p.classList.add('active');
        else p.classList.remove('active');
      });
      elements.gstPills.forEach((p) => {
        if (Number(p.getAttribute('data-gst')) === state.gstPercent) p.classList.add('active');
        else p.classList.remove('active');
      });

      const dist = computeDistribution(amount, people, data.shares || []);
      if (!dist) return false;

      state.precision = dist.precision;
      state.shares = dist.shares;
      state.totalSum = dist.totalSum;
      state.baseAmount = dist.baseAmount;
      state.adjustedAmount = dist.adjustedAmount;
      state.remainderCount = dist.remainderCount;
      state.isCalculated = true;

      renderResults();
      showSaveStatus();
      return true;
    } catch (err) {
      console.warn('Discarding invalid saved state:', err);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
      return false;
    }
  }

  function resetApp() {
    elements.form.reset();

    state.occasion = '';
    state.billAmount = 0;
    state.baseBillAmount = 0;
    state.numberOfPeople = 0;
    state.shares = [];
    state.totalSum = 0;
    state.tipPercent = 0;
    state.gstPercent = 0;
    state.isCalculated = false;
    state.currentPage = 1;

    setFieldError('occasion', null);
    setFieldError('amount', null);
    setFieldError('people', null);

    elements.addonSummary.classList.add('hidden');
    elements.addonsPanel.classList.add('hidden');
    elements.toggleAddonsBtn.setAttribute('aria-expanded', 'false');

    elements.tipPills.forEach((p) => {
      if (p.getAttribute('data-tip') === '0') p.classList.add('active');
      else p.classList.remove('active');
    });
    elements.gstPills.forEach((p) => {
      if (p.getAttribute('data-gst') === '0') p.classList.add('active');
      else p.classList.remove('active');
    });

    elements.saveStatus.classList.add('hidden');
    updatePresetButtons(null);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    renderResults();
    elements.occasionInput.focus();
  }

  // --- WhatsApp Direct Settle-Up ---
  function handleShareWhatsApp() {
    if (!state.isCalculated || state.shares.length === 0) return;

    let text = `🧾 *BillSplit Breakdown*\n`;
    text += `*Occasion:* ${state.occasion}\n`;
    text += `*Total Bill:* ${formatINR(state.billAmount, Math.min(state.precision, 2))}\n`;
    text += `*Participants:* ${state.numberOfPeople.toLocaleString('en-IN')}\n\n`;
    text += `*Individual Allocations:*\n`;

    if (state.numberOfPeople <= 40) {
      state.shares.forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
    } else {
      state.shares.slice(0, 5).forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
      text += `• ... and ${(state.numberOfPeople - 10).toLocaleString('en-IN')} others\n`;
      state.shares.slice(-5).forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
    }

    text += `\n*Reconciled Total:* ${formatINR(state.totalSum, state.precision)}\n`;
    text += `Please settle up your share soon! 🤝\n`;
    text += `_Created by Siddhesh H. Kewate • Comp ID: ZC-1522AFD0C589_`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // --- Copy Summary Action ---
  function handleCopySummary() {
    if (!state.isCalculated || state.shares.length === 0) return;

    let text = `BillSplit Breakdown (₹ INR)\n`;
    text += `==============================\n`;
    text += `Occasion: ${state.occasion}\n`;
    text += `Total Bill: ${formatINR(state.billAmount, Math.min(state.precision, 2))}\n`;
    text += `Participants: ${state.numberOfPeople.toLocaleString('en-IN')}\n`;
    text += `Share per Person: ${elements.resPerPerson.textContent}\n`;
    text += `==============================\n\n`;

    if (state.numberOfPeople <= 50) {
      text += `Individual Allocations:\n`;
      state.shares.forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
    } else {
      text += `Sample Allocations (Total: ${state.numberOfPeople.toLocaleString('en-IN')} participants):\n`;
      state.shares.slice(0, 5).forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
      text += `• ... and ${(state.numberOfPeople - 10).toLocaleString('en-IN')} more participants\n`;
      state.shares.slice(-5).forEach((share) => {
        text += `• ${share.name}: ${formatINR(share.amount, state.precision)}\n`;
      });
    }

    text += `\nReconciled Total: ${formatINR(state.totalSum, state.precision)}\n`;
    text += `created by siddhesh H. Kewate | compitition id - ZC-1522AFD0C589`;

    const onCopySuccess = () => {
      elements.copyBtnIconWrap.innerHTML = ICONS.check;
      elements.copyBtnText.textContent = 'Copied!';
      setTimeout(() => {
        elements.copyBtnIconWrap.innerHTML = ICONS.copy;
        elements.copyBtnText.textContent = 'Copy';
      }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onCopySuccess).catch(() => fallbackCopy(text, onCopySuccess));
    } else {
      fallbackCopy(text, onCopySuccess);
    }
  }

  function fallbackCopy(text, callback) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      callback();
    } catch (_) {}
    document.body.removeChild(textarea);
  }

  // --- Print Receipt Action ---
  function handlePrintReceipt() {
    if (!state.isCalculated) return;
    window.print();
  }

  // --- Form Submission & Calculations ---
  function handleFormSubmit(e) {
    if (e) e.preventDefault();

    const isValid = validateAll();
    if (!isValid) {
      state.isCalculated = false;
      renderResults();

      if (state.errors.occasion) elements.occasionInput.focus();
      else if (state.errors.amount) elements.amountInput.focus();
      else if (state.errors.people) elements.peopleInput.focus();
      return;
    }

    const occasion = elements.occasionInput.value.trim();

    const rawAmountNum = Number(elements.amountInput.value.trim());
    const amount = Math.round(rawAmountNum * 100) / 100;
    elements.amountInput.value = amount.toFixed(2);

    const people = Number(elements.peopleInput.value.trim());

    state.occasion = occasion;
    state.billAmount = amount;
    state.numberOfPeople = people;
    state.currentPage = 1;

    const dist = computeDistribution(amount, people, state.shares);
    if (!dist) return;

    state.precision = dist.precision;
    state.shares = dist.shares;
    state.totalSum = dist.totalSum;
    state.baseAmount = dist.baseAmount;
    state.adjustedAmount = dist.adjustedAmount;
    state.remainderCount = dist.remainderCount;
    state.isCalculated = true;

    renderResults();
    saveToStorage();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Occasion live validation
    elements.occasionInput.addEventListener('input', () => {
      if (state.errors.occasion) {
        setFieldError('occasion', validateOccasion(elements.occasionInput.value));
      }
    });

    // Amount live validation
    elements.amountInput.addEventListener('input', () => {
      state.baseBillAmount = 0;
      if (state.errors.amount) {
        setFieldError('amount', validateAmount(elements.amountInput.value));
      }
    });

    // People live validation
    elements.peopleInput.addEventListener('input', () => {
      const trimmed = elements.peopleInput.value.trim();
      const val = Number(trimmed);
      updatePresetButtons(val);

      if (state.errors.people) {
        setFieldError('people', validatePeople(elements.peopleInput.value));
      }
    });

    // Preset button clicks
    elements.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = btn.getAttribute('data-people');
        elements.peopleInput.value = count;
        setFieldError('people', null);
        updatePresetButtons(Number(count));

        if (state.isCalculated && validateAll()) {
          handleFormSubmit();
        }
      });
    });

    // Addons toggle
    if (elements.toggleAddonsBtn) {
      elements.toggleAddonsBtn.addEventListener('click', () => {
        const isHidden = elements.addonsPanel.classList.toggle('hidden');
        elements.toggleAddonsBtn.setAttribute('aria-expanded', String(!isHidden));
      });
    }

    // Tip pills
    elements.tipPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        elements.tipPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.tipPercent = Number(pill.getAttribute('data-tip'));
        recalculateAddons();
      });
    });

    // GST pills
    elements.gstPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        elements.gstPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.gstPercent = Number(pill.getAttribute('data-gst'));
        recalculateAddons();
      });
    });

    // Pagination buttons
    elements.prevPageBtn.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderPersonCards();
      }
    });

    elements.nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(state.shares.length / PAGE_SIZE);
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderPersonCards();
      }
    });

    // Actions
    elements.form.addEventListener('submit', handleFormSubmit);
    elements.resetAppBtn.addEventListener('click', resetApp);
    elements.copySummaryBtn.addEventListener('click', handleCopySummary);
    elements.shareWhatsAppBtn.addEventListener('click', handleShareWhatsApp);
    elements.printReceiptBtn.addEventListener('click', handlePrintReceipt);
  }

  // --- App Initialization ---
  function init() {
    initSplashScreen();
    setupEventListeners();

    const restored = loadFromStorage();
    if (!restored) {
      renderResults();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

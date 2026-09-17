// ==UserScript==
// @name         ChatGPT & Claude Personal Chat Cleaner
// @namespace    local.vanick
// @version      1.3.0
// @description  Reviews likely personal conversations on ChatGPT and Claude and deletes only selected chats.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @updateURL    https://raw.githubusercontent.com/marcoaval/ChatGpt-Chat-Cleaner/main/chatgpt_personal_chat_cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/marcoaval/ChatGpt-Chat-Cleaner/main/chatgpt_personal_chat_cleaner.user.js
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PERSONAL_KEYWORDS = [
    'health', 'medical', 'doctor', 'symptom', 'injury',
    'relationship', 'dating', 'family', 'personal',
    'pet', 'housing', 'apartment', 'address',
    'job', 'work', 'membership', 'finance',
    'travel', 'shopping', 'appointment'
  ];

  const PROTECTED_KEYWORDS = [
    'class', 'course', 'syllabus', 'assignment', 'discussion', 'lab',
    'school', 'college', 'university', 'excel', 'github',
    'python', 'powershell', 'bash', 'coding', 'programming',
    'cybersecurity', 'project', 'resume', 'study'
  ];

  const PLATFORMS = {
    chatgpt: {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      linkSelector: 'a[href*="/c/"]',
      hrefPattern: /\/c\/[^/?#]+/
    },
    claude: {
      name: 'Claude',
      hosts: ['claude.ai'],
      linkSelector: 'a[href*="/chat/"]',
      hrefPattern: /\/chat\/[^/?#]+/
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = (value) => (value || '').trim().toLowerCase();

  function platform() {
    const host = location.hostname.toLowerCase();
    return Object.values(PLATFORMS).find(entry => entry.hosts.includes(host)) || PLATFORMS.chatgpt;
  }

  function chatLinks() {
    const current = platform();
    return [...document.querySelectorAll(current.linkSelector)]
      .filter(link => current.hrefPattern.test(link.getAttribute('href') || ''));
  }

  function uniqueChats() {
    const map = new Map();

    for (const link of chatLinks()) {
      const href = link.getAttribute('href') || '';
      const title =
        link.getAttribute('aria-label') ||
        link.getAttribute('title') ||
        link.innerText ||
        link.textContent ||
        '';

      const cleanTitle = title.replace(/\s+/g, ' ').trim();
      if (!cleanTitle) continue;

      if (!map.has(href)) map.set(href, { href, title: cleanTitle });
    }

    return [...map.values()];
  }

  function classify(chat) {
    const title = normalize(chat.title);
    const matches = PERSONAL_KEYWORDS.filter(keyword => title.includes(normalize(keyword)));
    const protectedMatches = PROTECTED_KEYWORDS.filter(keyword => title.includes(normalize(keyword)));

    return {
      ...chat,
      matches,
      protectedMatches,
      likelyPersonal: matches.length > 0 && protectedMatches.length === 0
    };
  }

  function findChatLink(href) {
    return chatLinks().find(link => (link.getAttribute('href') || '') === href);
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function elementText(element) {
    return normalize(`${element?.textContent || ''} ${element?.getAttribute?.('aria-label') || ''} ${element?.getAttribute?.('title') || ''}`);
  }

  function cleanerContains(element) {
    return Boolean(document.getElementById('vanick-cleaner-overlay')?.contains(element));
  }

  function rowCandidates(link) {
    const candidates = [];
    let node = link;

    for (let depth = 0; node && depth < 9; depth++, node = node.parentElement) {
      candidates.push(node);
    }

    return candidates;
  }

  function getRow(link) {
    const candidates = rowCandidates(link);
    return candidates.find(node => node.querySelector?.('button')) ||
           link.closest('li') ||
           link.closest('[role="listitem"]') ||
           link.closest('[data-testid]') ||
           link.parentElement;
  }

  function fireHover(element) {
    for (const type of ['pointerover', 'mouseover', 'mouseenter']) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function menuButtonFromRow(row) {
    const buttons = [...row.querySelectorAll('button')].filter(visible);
    const labeled = buttons.find(button => /more|menu|option|action|conversation/i.test(elementText(button)));
    if (labeled) return labeled;

    const symbol = buttons.find(button => /⋮|⋯|\.\.\./.test(button.textContent || ''));
    if (symbol) return symbol;

    const rowRect = row.getBoundingClientRect();
    const rightSide = buttons
      .map(button => ({ button, rect: button.getBoundingClientRect() }))
      .filter(item => item.rect.left >= rowRect.left + rowRect.width * 0.55)
      .sort((a, b) => b.rect.right - a.rect.right);

    return rightSide[0]?.button || buttons.at(-1) || null;
  }

  function globalMenuButtonNearRow(row) {
    const rowRect = row.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('button')].filter(visible);

    return buttons.find(button => {
      const rect = button.getBoundingClientRect();
      const nearVertical = rect.top <= rowRect.bottom + 8 && rect.bottom >= rowRect.top - 8;
      const nearHorizontal = rect.left >= rowRect.left + rowRect.width * 0.55 && rect.right <= rowRect.right + 80;
      return nearVertical && nearHorizontal && /more|menu|option|action|conversation|⋮|⋯/i.test(elementText(button));
    }) || null;
  }

  async function waitFor(getter, timeout = 2500, interval = 80) {
    const end = Date.now() + timeout;

    while (Date.now() < end) {
      const value = getter();
      if (value) return value;
      await sleep(interval);
    }

    return null;
  }

  async function openChatMenu(chat) {
    const link = findChatLink(chat.href);
    if (!link) throw new Error('Chat is no longer visible in the sidebar.');

    const row = getRow(link);
    if (!row) throw new Error('Could not locate this chat row.');

    row.scrollIntoView({ block: 'nearest' });
    fireHover(row);
    fireHover(link);
    await sleep(450);

    const menuButton = await waitFor(() => menuButtonFromRow(row) || globalMenuButtonNearRow(row));
    if (!menuButton) throw new Error('Could not find the chat options button.');

    activate(menuButton);
    await sleep(300);
  }

  function actionableAncestor(element) {
    let node = element;

    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (cleanerContains(node)) return null;

      const role = normalize(node.getAttribute?.('role'));
      const tag = node.tagName;
      const slot = normalize(node.getAttribute?.('data-slot'));
      const hasTabIndex = node.hasAttribute?.('tabindex');

      if (
        tag === 'BUTTON' ||
        tag === 'A' ||
        role === 'menuitem' ||
        role === 'option' ||
        role === 'button' ||
        hasTabIndex ||
        slot.includes('menu') ||
        slot.includes('dropdown')
      ) {
        return node;
      }
    }

    return element.parentElement || element;
  }

  function exactTextCandidates(text, root = document.body) {
    const target = normalize(text);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let node;

    while ((node = walker.nextNode())) {
      if (normalize(node.nodeValue) !== target) continue;

      const parent = node.parentElement;
      if (!parent || !visible(parent) || cleanerContains(parent)) continue;

      const action = actionableAncestor(parent);
      if (!action || !visible(action) || cleanerContains(action)) continue;

      candidates.push(action);
    }

    return [...new Set(candidates)];
  }

  function menuDeleteAction() {
    const candidates = exactTextCandidates('delete');
    const menuCandidate = candidates.find(element =>
      element.closest('[role="menu"], [role="menuitem"], [data-radix-menu-content], [data-slot*="menu"], [data-slot*="dropdown"]')
    );

    return menuCandidate || candidates.find(element => !element.closest('[role="dialog"], [role="alertdialog"]')) || null;
  }

  function confirmationDeleteAction() {
    const candidates = exactTextCandidates('delete');
    const dialogCandidate = candidates.find(element =>
      element.closest('[role="dialog"], [role="alertdialog"]')
    );

    if (dialogCandidate) return dialogCandidate;

    return candidates.find(element => {
      if (element.closest('[role="menu"], [role="menuitem"]')) return false;
      return element.tagName === 'BUTTON' || normalize(element.getAttribute?.('role')) === 'button';
    }) || null;
  }

  function activate(element) {
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    try {
      element.dispatchEvent(new PointerEvent('pointerdown', options));
      element.dispatchEvent(new MouseEvent('mousedown', options));
      element.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
    } catch (_) {
      element.dispatchEvent(new MouseEvent('mousedown', options));
      element.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
    }

    element.click();
  }

  async function deleteChat(chat) {
    await openChatMenu(chat);

    const deleteAction = await waitFor(menuDeleteAction, 3000, 80);
    if (!deleteAction) throw new Error('Claude menu opened, but the Delete command was not found.');

    activate(deleteAction);

    const confirmButton = await waitFor(confirmationDeleteAction, 3500, 100);
    if (!confirmButton) {
      if (menuDeleteAction()) throw new Error('Delete command was found, but Claude did not open the confirmation dialog.');
      throw new Error('Delete confirmation button was not found.');
    }

    activate(confirmButton);

    const removed = await waitFor(() => !findChatLink(chat.href), 5000, 120);
    if (!removed) throw new Error('Delete was confirmed, but the chat remained visible in the sidebar.');

    await sleep(250);
  }

  function detectDarkMode() {
    const background = getComputedStyle(document.body).backgroundColor;
    const values = background.match(/[\d.]+/g);

    if (values && values.length >= 3) {
      const [r, g, b] = values.slice(0, 3).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  }

  function cleanerTheme() {
    const dark = detectDarkMode();

    return dark ? {
      panel: '#18181b',
      surface: '#222226',
      surfaceHover: '#29292e',
      border: '#34343a',
      borderStrong: '#45454d',
      text: '#f4f4f5',
      muted: '#a1a1aa',
      subtle: '#71717a',
      accent: '#93a4ff',
      accentSoft: 'rgba(147,164,255,.13)',
      accentBorder: 'rgba(147,164,255,.34)',
      danger: '#f87171',
      dangerHover: '#ef4444',
      dangerSoft: 'rgba(248,113,113,.12)',
      success: '#86efac',
      successSoft: 'rgba(134,239,172,.10)',
      shadow: '0 24px 80px rgba(0,0,0,.48)',
      overlay: 'rgba(8,8,10,.70)'
    } : {
      panel: '#ffffff',
      surface: '#f7f7f8',
      surfaceHover: '#f1f1f3',
      border: '#e4e4e7',
      borderStrong: '#d4d4d8',
      text: '#18181b',
      muted: '#71717a',
      subtle: '#a1a1aa',
      accent: '#5968d9',
      accentSoft: 'rgba(89,104,217,.08)',
      accentBorder: 'rgba(89,104,217,.24)',
      danger: '#dc2626',
      dangerHover: '#b91c1c',
      dangerSoft: 'rgba(220,38,38,.07)',
      success: '#15803d',
      successSoft: 'rgba(21,128,61,.07)',
      shadow: '0 24px 80px rgba(24,24,27,.18)',
      overlay: 'rgba(24,24,27,.48)'
    };
  }

  function makeOverlay(chats) {
    document.getElementById('vanick-cleaner-overlay')?.remove();

    const current = platform();
    const theme = cleanerTheme();
    const overlay = document.createElement('div');
    overlay.id = 'vanick-cleaner-overlay';
    overlay.style.cssText = `
      --vc-panel:${theme.panel};
      --vc-surface:${theme.surface};
      --vc-surface-hover:${theme.surfaceHover};
      --vc-border:${theme.border};
      --vc-border-strong:${theme.borderStrong};
      --vc-text:${theme.text};
      --vc-muted:${theme.muted};
      --vc-subtle:${theme.subtle};
      --vc-accent:${theme.accent};
      --vc-accent-soft:${theme.accentSoft};
      --vc-accent-border:${theme.accentBorder};
      --vc-danger:${theme.danger};
      --vc-danger-hover:${theme.dangerHover};
      --vc-danger-soft:${theme.dangerSoft};
      --vc-success:${theme.success};
      --vc-success-soft:${theme.successSoft};
      position:fixed;
      inset:0;
      z-index:2147483647;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:${theme.overlay};
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;

    const style = document.createElement('style');
    style.textContent = `
      #vanick-cleaner-overlay *{box-sizing:border-box}
      #vanick-cleaner-overlay .vc-panel{
        width:min(860px,96vw);
        max-height:min(86vh,900px);
        display:flex;
        flex-direction:column;
        overflow:hidden;
        color:var(--vc-text);
        background:var(--vc-panel);
        border:1px solid var(--vc-border);
        border-radius:20px;
        box-shadow:${theme.shadow};
      }
      #vanick-cleaner-overlay .vc-header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
        padding:22px 24px 18px;
        border-bottom:1px solid var(--vc-border);
      }
      #vanick-cleaner-overlay .vc-brand{
        display:flex;
        align-items:flex-start;
        gap:13px;
        min-width:0;
      }
      #vanick-cleaner-overlay .vc-icon{
        width:42px;
        height:42px;
        flex:0 0 auto;
        display:grid;
        place-items:center;
        border:1px solid var(--vc-accent-border);
        border-radius:12px;
        background:var(--vc-accent-soft);
        font-size:20px;
      }
      #vanick-cleaner-overlay .vc-title-row{
        display:flex;
        align-items:center;
        gap:9px;
        flex-wrap:wrap;
        margin:1px 0 4px;
      }
      #vanick-cleaner-overlay .vc-title{
        font-size:20px;
        line-height:1.25;
        font-weight:750;
        letter-spacing:-.02em;
      }
      #vanick-cleaner-overlay .vc-platform{
        display:inline-flex;
        align-items:center;
        height:22px;
        padding:0 8px;
        border:1px solid var(--vc-border);
        border-radius:999px;
        color:var(--vc-muted);
        background:var(--vc-surface);
        font-size:11px;
        font-weight:700;
        letter-spacing:.02em;
      }
      #vanick-cleaner-overlay .vc-subtitle{
        max-width:650px;
        color:var(--vc-muted);
        font-size:12.5px;
        line-height:1.55;
      }
      #vanick-cleaner-overlay .vc-icon-button{
        width:34px;
        height:34px;
        flex:0 0 auto;
        display:grid;
        place-items:center;
        border:1px solid transparent;
        border-radius:10px;
        color:var(--vc-muted);
        background:transparent;
        font-size:20px;
        line-height:1;
        cursor:pointer;
        transition:background .15s ease,border-color .15s ease,color .15s ease;
      }
      #vanick-cleaner-overlay .vc-icon-button:hover{
        color:var(--vc-text);
        background:var(--vc-surface);
        border-color:var(--vc-border);
      }
      #vanick-cleaner-overlay .vc-toolbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        padding:12px 24px;
        border-bottom:1px solid var(--vc-border);
        background:var(--vc-panel);
      }
      #vanick-cleaner-overlay .vc-summary{
        color:var(--vc-muted);
        font-size:12px;
        font-weight:650;
      }
      #vanick-cleaner-overlay .vc-toolbar-actions{
        display:flex;
        gap:7px;
        flex-wrap:wrap;
      }
      #vanick-cleaner-overlay .vc-list-wrap{
        min-height:120px;
        overflow:auto;
        padding:14px 16px 16px;
        scrollbar-color:var(--vc-border-strong) transparent;
      }
      #vanick-cleaner-overlay .vc-list{
        display:grid;
        gap:8px;
      }
      #vanick-cleaner-overlay .vc-row{
        display:grid;
        grid-template-columns:24px minmax(0,1fr);
        gap:10px;
        align-items:start;
        padding:12px 13px;
        border:1px solid var(--vc-border);
        border-radius:12px;
        background:var(--vc-surface);
        cursor:pointer;
        transition:background .14s ease,border-color .14s ease,transform .14s ease;
      }
      #vanick-cleaner-overlay .vc-row:hover{
        background:var(--vc-surface-hover);
        border-color:var(--vc-border-strong);
      }
      #vanick-cleaner-overlay .vc-row.vc-selected{
        border-color:var(--vc-accent-border);
        background:var(--vc-accent-soft);
      }
      #vanick-cleaner-overlay .vc-checkbox{
        width:17px;
        height:17px;
        margin:2px 0 0;
        accent-color:var(--vc-accent);
        cursor:pointer;
      }
      #vanick-cleaner-overlay .vc-chat-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        min-width:0;
      }
      #vanick-cleaner-overlay .vc-chat-title{
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--vc-text);
        font-size:13.5px;
        line-height:1.35;
        font-weight:680;
      }
      #vanick-cleaner-overlay .vc-pill{
        flex:0 0 auto;
        display:inline-flex;
        align-items:center;
        height:21px;
        padding:0 7px;
        border-radius:999px;
        font-size:10.5px;
        line-height:1;
        font-weight:750;
      }
      #vanick-cleaner-overlay .vc-pill-personal{
        color:var(--vc-accent);
        border:1px solid var(--vc-accent-border);
        background:var(--vc-accent-soft);
      }
      #vanick-cleaner-overlay .vc-pill-protected{
        color:var(--vc-success);
        border:1px solid color-mix(in srgb,var(--vc-success) 30%,transparent);
        background:var(--vc-success-soft);
      }
      #vanick-cleaner-overlay .vc-pill-review{
        color:var(--vc-muted);
        border:1px solid var(--vc-border);
        background:var(--vc-panel);
      }
      #vanick-cleaner-overlay .vc-detail{
        margin-top:4px;
        color:var(--vc-muted);
        font-size:11.5px;
        line-height:1.4;
      }
      #vanick-cleaner-overlay .vc-empty{
        margin:18px 8px;
        padding:28px 18px;
        text-align:center;
        color:var(--vc-muted);
        border:1px dashed var(--vc-border-strong);
        border-radius:14px;
        background:var(--vc-surface);
        font-size:13px;
      }
      #vanick-cleaner-overlay .vc-footer{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        flex-wrap:wrap;
        padding:14px 20px 16px;
        border-top:1px solid var(--vc-border);
        background:var(--vc-panel);
      }
      #vanick-cleaner-overlay .vc-status{
        flex:1 1 300px;
        min-height:18px;
        color:var(--vc-muted);
        font-size:11.5px;
        line-height:1.45;
      }
      #vanick-cleaner-overlay .vc-status[data-state="error"]{color:var(--vc-danger)}
      #vanick-cleaner-overlay .vc-status[data-state="success"]{color:var(--vc-success)}
      #vanick-cleaner-overlay .vc-footer-actions{
        display:flex;
        gap:8px;
        margin-left:auto;
      }
      #vanick-cleaner-overlay .vc-button{
        min-height:34px;
        padding:7px 11px;
        border-radius:9px;
        border:1px solid var(--vc-border);
        color:var(--vc-text);
        background:var(--vc-surface);
        font:inherit;
        font-size:11.5px;
        line-height:1;
        font-weight:700;
        cursor:pointer;
        transition:background .15s ease,border-color .15s ease,transform .1s ease,opacity .15s ease;
      }
      #vanick-cleaner-overlay .vc-button:hover:not(:disabled){
        background:var(--vc-surface-hover);
        border-color:var(--vc-border-strong);
      }
      #vanick-cleaner-overlay .vc-button:active:not(:disabled){transform:translateY(1px)}
      #vanick-cleaner-overlay .vc-button:disabled{opacity:.45;cursor:not-allowed}
      #vanick-cleaner-overlay .vc-button-danger{
        color:#fff;
        border-color:var(--vc-danger);
        background:var(--vc-danger);
      }
      #vanick-cleaner-overlay .vc-button-danger:hover:not(:disabled){
        border-color:var(--vc-danger-hover);
        background:var(--vc-danger-hover);
      }
      @media (max-width:640px){
        #vanick-cleaner-overlay{padding:10px}
        #vanick-cleaner-overlay .vc-panel{max-height:92vh;border-radius:16px}
        #vanick-cleaner-overlay .vc-header{padding:18px 16px 14px}
        #vanick-cleaner-overlay .vc-toolbar{padding:10px 16px}
        #vanick-cleaner-overlay .vc-list-wrap{padding:10px}
        #vanick-cleaner-overlay .vc-footer{padding:12px}
        #vanick-cleaner-overlay .vc-chat-head{align-items:flex-start}
        #vanick-cleaner-overlay .vc-chat-title{white-space:normal}
      }
    `;
    overlay.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'vc-panel';

    const header = document.createElement('div');
    header.className = 'vc-header';

    const brand = document.createElement('div');
    brand.className = 'vc-brand';

    const icon = document.createElement('div');
    icon.className = 'vc-icon';
    icon.textContent = '🧹';

    const headingText = document.createElement('div');
    headingText.style.minWidth = '0';
    headingText.innerHTML = `
      <div class="vc-title-row">
        <div class="vc-title">Chat Cleaner</div>
        <span class="vc-platform">${escapeHtml(current.name)}</span>
      </div>
      <div class="vc-subtitle">
        Review loaded conversations before deleting. Personal matches are preselected while protected school and coding chats stay unchecked.
      </div>
    `;

    brand.append(icon, headingText);

    const closeIcon = document.createElement('button');
    closeIcon.type = 'button';
    closeIcon.className = 'vc-icon-button';
    closeIcon.setAttribute('aria-label', 'Close');
    closeIcon.textContent = '×';
    closeIcon.onclick = () => overlay.remove();

    header.append(brand, closeIcon);
    panel.appendChild(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'vc-toolbar';

    const summary = document.createElement('div');
    summary.className = 'vc-summary';

    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'vc-toolbar-actions';

    const listWrap = document.createElement('div');
    listWrap.className = 'vc-list-wrap';

    const list = document.createElement('div');
    list.className = 'vc-list';

    const rows = [];
    let remove = null;

    function refreshSelection() {
      const selected = rows.filter(item => item.checkbox.checked).length;
      summary.textContent = `${chats.length} loaded · ${selected} selected`;

      for (const item of rows) {
        item.row.classList.toggle('vc-selected', item.checkbox.checked);
      }

      if (remove) {
        remove.textContent = selected ? `Delete selected (${selected})` : 'Delete selected';
        remove.disabled = selected === 0;
      }
    }

    for (const chat of chats) {
      const row = document.createElement('label');
      row.className = 'vc-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vc-checkbox';
      checkbox.checked = chat.likelyPersonal;
      checkbox.addEventListener('change', refreshSelection);

      const info = document.createElement('div');
      info.style.minWidth = '0';

      const detailParts = [];
      if (chat.matches.length) detailParts.push(`Matched: ${chat.matches.join(', ')}`);
      else detailParts.push('No personal keyword match');
      if (chat.protectedMatches.length) detailParts.push(`Protected: ${chat.protectedMatches.join(', ')}`);

      const statusClass = chat.protectedMatches.length
        ? 'vc-pill-protected'
        : chat.likelyPersonal
          ? 'vc-pill-personal'
          : 'vc-pill-review';

      const statusText = chat.protectedMatches.length
        ? 'Protected'
        : chat.likelyPersonal
          ? 'Likely personal'
          : 'Review';

      info.innerHTML = `
        <div class="vc-chat-head">
          <div class="vc-chat-title">${escapeHtml(chat.title)}</div>
          <span class="vc-pill ${statusClass}">${statusText}</span>
        </div>
        <div class="vc-detail">${escapeHtml(detailParts.join(' · '))}</div>
      `;

      row.append(checkbox, info);
      list.appendChild(row);
      rows.push({ chat, checkbox, row });
    }

    if (!chats.length) {
      const empty = document.createElement('div');
      empty.className = 'vc-empty';
      empty.textContent = 'No loaded chats were found. Open the sidebar and try again.';
      list.appendChild(empty);
    }

    listWrap.appendChild(list);

    const selectLikely = button('Select likely', 'secondary');
    selectLikely.onclick = () => {
      rows.forEach(item => {
        item.checkbox.checked = item.chat.likelyPersonal;
      });
      refreshSelection();
    };

    const selectAll = button('Select all', 'secondary');
    selectAll.onclick = () => {
      rows.forEach(item => {
        item.checkbox.checked = true;
      });
      refreshSelection();
    };

    const deselectAll = button('Deselect all', 'secondary');
    deselectAll.onclick = () => {
      rows.forEach(item => {
        item.checkbox.checked = false;
      });
      refreshSelection();
    };

    toolbarActions.append(selectLikely, selectAll, deselectAll);
    toolbar.append(summary, toolbarActions);
    panel.append(toolbar, listWrap);

    const footer = document.createElement('div');
    footer.className = 'vc-footer';

    const status = document.createElement('div');
    status.className = 'vc-status';
    status.textContent = 'Nothing is deleted until you confirm.';

    const footerActions = document.createElement('div');
    footerActions.className = 'vc-footer-actions';

    const close = button('Cancel', 'secondary');
    close.onclick = () => overlay.remove();

    remove = button('Delete selected', 'danger');
    remove.onclick = async () => {
      const selected = rows.filter(item => item.checkbox.checked);

      if (!selected.length) {
        status.dataset.state = 'error';
        status.textContent = 'Nothing selected.';
        return;
      }

      const confirmed = confirm(
        `Delete ${selected.length} selected ${current.name} chat(s)?\n\nThis cannot be undone.`
      );
      if (!confirmed) return;

      const controls = [remove, close, selectLikely, selectAll, deselectAll];
      for (const control of controls) control.disabled = true;

      let deleted = 0;
      let failed = 0;
      let lastError = '';

      status.dataset.state = '';
      for (const item of selected) {
        status.textContent = `Deleting ${deleted + failed + 1} of ${selected.length} · ${item.chat.title}`;

        try {
          await deleteChat(item.chat);
          deleted++;
          item.row.style.opacity = '.38';
          item.checkbox.checked = false;
        } catch (error) {
          failed++;
          lastError = error instanceof Error ? error.message : String(error);
          item.row.style.borderColor = 'var(--vc-danger)';
          console.error('[Chat Cleaner]', item.chat.title, error);
        }
      }

      if (failed) {
        status.dataset.state = 'error';
        status.textContent = `${deleted} deleted · ${failed} failed · ${lastError}`;
      } else {
        status.dataset.state = 'success';
        status.textContent = `${deleted} chat${deleted === 1 ? '' : 's'} deleted successfully.`;
      }

      for (const control of controls) control.disabled = false;
      refreshSelection();
    };

    footerActions.append(close, remove);
    footer.append(status, footerActions);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    refreshSelection();
  }

  function button(text, variant = 'secondary') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.className = `vc-button${variant === 'danger' ? ' vc-button-danger' : ''}`;
    return element;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function scan() {
    makeOverlay(uniqueChats().map(classify));
  }

  function addLauncher() {
    if (document.getElementById('vanick-cleaner-button')) return;

    const theme = cleanerTheme();
    const launcher = document.createElement('button');
    launcher.id = 'vanick-cleaner-button';
    launcher.type = 'button';
    launcher.textContent = '🧹 Chat Cleaner';
    launcher.title = `Review likely personal ${platform().name} chats`;
    launcher.style.cssText = `
      position:fixed;
      right:18px;
      bottom:18px;
      z-index:2147483646;
      display:inline-flex;
      align-items:center;
      gap:7px;
      min-height:38px;
      padding:8px 13px;
      border:1px solid ${theme.borderStrong};
      border-radius:999px;
      color:${theme.text};
      background:${theme.panel};
      box-shadow:0 8px 30px rgba(0,0,0,.18);
      font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:12px;
      font-weight:750;
      letter-spacing:-.01em;
      cursor:pointer;
      transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
    `;
    launcher.onmouseenter = () => {
      launcher.style.transform = 'translateY(-1px)';
      launcher.style.borderColor = theme.accent;
      launcher.style.boxShadow = '0 10px 34px rgba(0,0,0,.24)';
    };
    launcher.onmouseleave = () => {
      launcher.style.transform = '';
      launcher.style.borderColor = theme.borderStrong;
      launcher.style.boxShadow = '0 8px 30px rgba(0,0,0,.18)';
    };
    launcher.onclick = scan;
    document.body.appendChild(launcher);
  }

  addLauncher();
  new MutationObserver(addLauncher).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
// ==UserScript==
// @name         ChatGPT & Claude Personal Chat Cleaner
// @namespace    local.vanick
// @version      1.2.0
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

  function makeOverlay(chats) {
    document.getElementById('vanick-cleaner-overlay')?.remove();

    const current = platform();
    const overlay = document.createElement('div');
    overlay.id = 'vanick-cleaner-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.62);
      display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      width:min(820px,94vw);max-height:84vh;overflow:auto;background:#fff;color:#111;
      border-radius:16px;padding:20px;box-shadow:0 18px 70px rgba(0,0,0,.35);
    `;

    const heading = document.createElement('div');
    heading.innerHTML = `
      <div style="font-size:22px;font-weight:750;margin-bottom:6px">${current.name} Chat Cleaner</div>
      <div style="font-size:13px;color:#555;margin-bottom:14px">
        Only chats currently loaded in the sidebar are shown. Likely personal chats are preselected.
        Protected school and coding titles are left unchecked. Review selections before deleting.
      </div>
    `;
    box.appendChild(heading);

    if (!chats.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No loaded chats were found. Open the sidebar and try again.';
      box.appendChild(empty);
    }

    const list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:8px;';

    const rows = [];

    for (const chat of chats) {
      const row = document.createElement('label');
      row.style.cssText = `
        display:grid;grid-template-columns:26px 1fr;gap:9px;align-items:start;
        border:1px solid #ddd;border-radius:10px;padding:10px;cursor:pointer;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = chat.likelyPersonal;
      checkbox.style.marginTop = '3px';

      const info = document.createElement('div');
      const matchText = chat.matches.length
        ? `Matched: ${chat.matches.join(', ')}`
        : 'No personal keyword match';
      const protectedText = chat.protectedMatches.length
        ? ` • Protected: ${chat.protectedMatches.join(', ')}`
        : '';

      info.innerHTML = `
        <div style="font-weight:650">${escapeHtml(chat.title)}</div>
        <div style="font-size:12px;color:#666;margin-top:3px">
          ${escapeHtml(matchText + protectedText)}
        </div>
      `;

      row.append(checkbox, info);
      list.appendChild(row);
      rows.push({ chat, checkbox, row });
    }

    box.appendChild(list);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:13px;margin-top:12px;min-height:20px;color:#555;';
    box.appendChild(status);

    const actions = document.createElement('div');
    actions.style.cssText = `
      display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;position:sticky;bottom:-20px;
      background:#fff;padding:16px 0 2px;margin-top:10px;
    `;

    const selectLikely = button('Select likely personal', '#eee', '#111');
    selectLikely.onclick = () => rows.forEach(item => {
      item.checkbox.checked = item.chat.likelyPersonal;
    });

    const selectAll = button('Select all', '#eee', '#111');
    selectAll.onclick = () => rows.forEach(item => {
      item.checkbox.checked = true;
    });

    const deselectAll = button('Deselect all', '#eee', '#111');
    deselectAll.onclick = () => rows.forEach(item => {
      item.checkbox.checked = false;
    });

    const close = button('Cancel', '#eee', '#111');
    close.onclick = () => overlay.remove();

    const remove = button('Delete selected', '#d00', '#fff');
    remove.onclick = async () => {
      const selected = rows.filter(item => item.checkbox.checked);

      if (!selected.length) {
        status.textContent = 'Nothing selected.';
        return;
      }

      const confirmed = confirm(
        `Delete ${selected.length} selected ${current.name} chat(s)?\n\nThis cannot be undone.`
      );
      if (!confirmed) return;

      for (const control of [remove, close, selectLikely, selectAll, deselectAll]) {
        control.disabled = true;
      }

      let deleted = 0;
      let failed = 0;
      let lastError = '';

      for (const item of selected) {
        status.textContent = `Deleting ${deleted + failed + 1}/${selected.length}: ${item.chat.title}`;

        try {
          await deleteChat(item.chat);
          deleted++;
          item.row.style.opacity = '.35';
          item.checkbox.checked = false;
        } catch (error) {
          failed++;
          lastError = error instanceof Error ? error.message : String(error);
          item.row.style.borderColor = '#d00';
          console.error('[Chat Cleaner]', item.chat.title, error);
        }
      }

      status.textContent =
        `Finished: ${deleted} deleted` +
        (failed ? `, ${failed} failed. Last error: ${lastError}` : '.');

      for (const control of [remove, close, selectLikely, selectAll, deselectAll]) {
        control.disabled = false;
      }
    };

    actions.append(selectLikely, selectAll, deselectAll, close, remove);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function button(text, background, color) {
    const element = document.createElement('button');
    element.textContent = text;
    element.style.cssText = `
      border:0;border-radius:9px;padding:9px 13px;font-weight:650;
      cursor:pointer;background:${background};color:${color};
    `;
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

    const launcher = document.createElement('button');
    launcher.id = 'vanick-cleaner-button';
    launcher.textContent = '🧹 Clean Recents';
    launcher.title = `Review likely personal ${platform().name} chats`;
    launcher.style.cssText = `
      position:fixed;right:18px;bottom:18px;z-index:2147483646;
      border:1px solid rgba(0,0,0,.18);border-radius:999px;padding:10px 14px;
      background:#fff;color:#111;font-weight:700;box-shadow:0 5px 22px rgba(0,0,0,.22);
      cursor:pointer;
    `;
    launcher.onclick = scan;
    document.body.appendChild(launcher);
  }

  addLauncher();
  new MutationObserver(addLauncher).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
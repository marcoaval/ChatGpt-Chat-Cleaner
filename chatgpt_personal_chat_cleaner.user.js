// ==UserScript==
// @name         ChatGPT & Claude Personal Chat Cleaner
// @namespace    local.vanick
// @version      1.1.3
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

  async function waitFor(getter, timeout = 2200, interval = 80) {
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

    fireHover(row);
    fireHover(link);
    row.scrollIntoView({ block: 'nearest' });
    await sleep(450);

    const menuButton = await waitFor(() => menuButtonFromRow(row) || globalMenuButtonNearRow(row));
    if (!menuButton) throw new Error('Could not find the chat options button.');

    menuButton.click();
    await sleep(250);
  }

  function isDeleteElement(element) {
    const cleaner = document.getElementById('vanick-cleaner-overlay');
    if (cleaner?.contains(element)) return false;

    const values = [
      normalize(element.textContent).replace(/\s+/g, ' '),
      normalize(element.getAttribute?.('aria-label')).replace(/\s+/g, ' '),
      normalize(element.getAttribute?.('title')).replace(/\s+/g, ' ')
    ].filter(Boolean);

    return values.some(value =>
      /^(delete|delete chat|delete conversation)(?:\s+[a-z0-9])?$/.test(value)
    );
  }

  function deleteElements(root = document) {
    const selectors = [
      '[role="menuitem"]',
      '[role="option"]',
      '[data-radix-collection-item]',
      '[data-slot*="menu-item"]',
      '[data-slot*="dropdown"]',
      'button',
      'div',
      'span'
    ];

    return [...root.querySelectorAll(selectors.join(','))]
      .filter(visible)
      .filter(isDeleteElement)
      .sort((a, b) => a.children.length - b.children.length);
  }

  async function findDeleteAction() {
    return waitFor(() => deleteElements(document)[0], 2500, 80);
  }

  function findDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter(visible)
      .filter(element => !document.getElementById('vanick-cleaner-overlay')?.contains(element));

    const explicit = dialogs.find(element => /delete|conversation|chat/i.test(element.textContent || ''));
    if (explicit) return explicit;

    return [...document.querySelectorAll('[data-state="open"]')]
      .filter(visible)
      .filter(element => !document.getElementById('vanick-cleaner-overlay')?.contains(element))
      .find(element => deleteElements(element).length > 0) || null;
  }

  async function findConfirmDelete() {
    return waitFor(() => {
      const dialog = findDialog();
      if (!dialog) return null;

      return deleteElements(dialog).find(element => element.tagName === 'BUTTON') ||
             deleteElements(dialog)[0] ||
             null;
    }, 2800, 80);
  }

  async function deleteChat(chat) {
    await openChatMenu(chat);

    const deleteAction = await findDeleteAction();
    if (!deleteAction) {
      document.body.click();
      throw new Error('Could not find Delete in the chat menu.');
    }

    deleteAction.click();
    await sleep(300);

    const confirmButton = await findConfirmDelete();
    if (!confirmButton) throw new Error('Could not find the confirmation Delete button.');

    confirmButton.click();
    await sleep(platform().name === 'Claude' ? 1100 : 800);
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
      width:min(760px,92vw);max-height:82vh;overflow:auto;background:#fff;color:#111;
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
      display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:-20px;
      background:#fff;padding:16px 0 2px;margin-top:10px;
    `;

    const close = button('Cancel', '#eee', '#111');
    close.onclick = () => overlay.remove();

    const selectLikely = button('Select likely personal', '#eee', '#111');
    selectLikely.onclick = () => rows.forEach(item => {
      item.checkbox.checked = item.chat.likelyPersonal;
    });

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

      remove.disabled = true;
      close.disabled = true;
      selectLikely.disabled = true;

      let deleted = 0;
      let failed = 0;

      for (const item of selected) {
        status.textContent = `Deleting ${deleted + failed + 1}/${selected.length}: ${item.chat.title}`;

        try {
          await deleteChat(item.chat);
          deleted++;
          item.row.style.opacity = '.35';
          item.checkbox.checked = false;
        } catch (error) {
          failed++;
          item.row.style.borderColor = '#d00';
          console.error('[Chat Cleaner]', item.chat.title, error);
        }
      }

      status.textContent =
        `Finished: ${deleted} deleted` +
        (failed ? `, ${failed} failed. Failed rows are outlined in red.` : '.');

      remove.disabled = false;
      close.disabled = false;
      selectLikely.disabled = false;
    };

    actions.append(selectLikely, close, remove);
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
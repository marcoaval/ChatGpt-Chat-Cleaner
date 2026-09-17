// ==UserScript==
// @name         ChatGPT Personal Chat Cleaner (Review First)
// @namespace    local.vanick
// @version      1.0.0
// @description  Finds likely personal ChatGPT chats by title, lets you review them, then deletes only the ones you select.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // EDIT THESE WORDS to match what YOU consider "personal".
  const PERSONAL_KEYWORDS = [
    // health / body
    'health', 'doctor', 'medical', 'pain', 'hurt', 'injury', 'ankle', 'stomach',
    'diarrhea', 'blood', 'cough', 'breathing', 'wheeze', 'skin', 'nose', 'ear',
    'choking', 'sick', 'symptom', 'vet',

    // relationships / family / private life
    'relationship', 'girlfriend', 'boyfriend', 'dating', 'kiss', 'family',
    'mom', 'dad', 'birthday', 'personal',

    // pets
    'cat', 'kitten', 'carl', 'pet', 'litter', 'flea', 'food', 'feeding',

    // housing / work / personal logistics
    'apartment', 'housing', 'address', 'esa', 'job', 'walmart', 'heb',
    'membership', 'barber', 'review'
  ];

  // Chats containing these terms are NOT auto-selected, even if they also hit
  // a personal keyword. They can still be manually checked in the review list.
  const PROTECTED_KEYWORDS = [
    'isc', 'class', 'course', 'syllabus', 'assignment', 'discussion', 'lab',
    'utsa', 'utrgv', 'excel', 'github', 'python', 'powershell', 'bash',
    'cybersecurity', 'project', 'resume', 'study'
  ];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const normalize = (s) => (s || '').trim().toLowerCase();

  function uniqueChats() {
    const map = new Map();

    for (const a of document.querySelectorAll('a[href*="/c/"]')) {
      const href = a.getAttribute('href') || '';
      if (!/\/c\/[^/?#]+/.test(href)) continue;

      const title =
        a.getAttribute('aria-label') ||
        a.getAttribute('title') ||
        a.innerText ||
        a.textContent ||
        '';

      const cleanTitle = title.replace(/\s+/g, ' ').trim();
      if (!cleanTitle) continue;

      if (!map.has(href)) {
        map.set(href, { href, title: cleanTitle, link: a });
      }
    }

    return [...map.values()];
  }

  function classify(chat) {
    const t = normalize(chat.title);
    const matches = PERSONAL_KEYWORDS.filter(k => t.includes(normalize(k)));
    const protectedMatches = PROTECTED_KEYWORDS.filter(k => t.includes(normalize(k)));

    return {
      ...chat,
      matches,
      protectedMatches,
      likelyPersonal: matches.length > 0 && protectedMatches.length === 0
    };
  }

  function getRow(link) {
    return (
      link.closest('li') ||
      link.closest('[data-testid]') ||
      link.closest('div[class*="group"]') ||
      link.parentElement?.parentElement ||
      link.parentElement
    );
  }

  async function openChatMenu(chat) {
    // Re-find it because deleting earlier rows can invalidate old DOM references.
    const link = [...document.querySelectorAll('a[href*="/c/"]')]
      .find(a => (a.getAttribute('href') || '') === chat.href);

    if (!link) throw new Error('Chat is no longer visible in the sidebar.');

    const row = getRow(link);
    if (!row) throw new Error('Could not locate this chat row.');

    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(250);

    const buttons = [...row.querySelectorAll('button')];
    const menuButton =
      buttons.find(b => /option|more|menu/i.test(
        `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`
      )) ||
      buttons.at(-1);

    if (!menuButton) throw new Error('Could not find the chat options button.');

    menuButton.click();
    await sleep(350);
  }

  function findVisibleByText(selector, text) {
    return [...document.querySelectorAll(selector)].find(el => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      return visible && normalize(el.textContent) === normalize(text);
    });
  }

  async function deleteChat(chat) {
    await openChatMenu(chat);

    const deleteMenuItem =
      findVisibleByText('[role="menuitem"]', 'Delete') ||
      [...document.querySelectorAll('button, [role="menuitem"], div[role="menuitem"]')]
        .find(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 &&
                 rect.height > 0 &&
                 /\bdelete\b/i.test(el.textContent || '');
        });

    if (!deleteMenuItem) {
      document.body.click();
      throw new Error('Could not find Delete in the chat menu.');
    }

    deleteMenuItem.click();
    await sleep(450);

    const dialog =
      [...document.querySelectorAll('[role="dialog"]')]
        .find(d => {
          const rect = d.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

    if (!dialog) throw new Error('Delete confirmation dialog did not appear.');

    const confirmButton =
      [...dialog.querySelectorAll('button')]
        .find(b => normalize(b.textContent) === 'delete');

    if (!confirmButton) throw new Error('Could not find the confirmation Delete button.');

    confirmButton.click();
    await sleep(700);
  }

  function makeOverlay(chats) {
    document.getElementById('vanick-cleaner-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vanick-cleaner-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,.62); display: flex; align-items: center;
      justify-content: center; font-family: system-ui, sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      width: min(760px, 92vw); max-height: 82vh; overflow: auto;
      background: #fff; color: #111; border-radius: 16px; padding: 20px;
      box-shadow: 0 18px 70px rgba(0,0,0,.35);
    `;

    const heading = document.createElement('div');
    heading.innerHTML = `
      <div style="font-size:22px;font-weight:750;margin-bottom:6px">Personal Chat Cleaner</div>
      <div style="font-size:13px;color:#555;margin-bottom:14px">
        Only chats currently loaded in the sidebar are shown. Likely personal chats are preselected.
        Protected school/coding titles are left unchecked. Review everything before deleting.
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

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = chat.likelyPersonal;
      cb.style.marginTop = '3px';

      const info = document.createElement('div');
      const why = chat.matches.length
        ? `Matched: ${chat.matches.join(', ')}`
        : 'No personal keyword match';

      const protectedText = chat.protectedMatches.length
        ? ` • Protected: ${chat.protectedMatches.join(', ')}`
        : '';

      info.innerHTML = `
        <div style="font-weight:650">${escapeHtml(chat.title)}</div>
        <div style="font-size:12px;color:#666;margin-top:3px">
          ${escapeHtml(why + protectedText)}
        </div>
      `;

      row.append(cb, info);
      list.appendChild(row);
      rows.push({ chat, cb, row });
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
    selectLikely.onclick = () => rows.forEach(r => {
      r.cb.checked = r.chat.likelyPersonal;
    });

    const del = button('Delete selected', '#d00', '#fff');
    del.onclick = async () => {
      const selected = rows.filter(r => r.cb.checked);

      if (!selected.length) {
        status.textContent = 'Nothing selected.';
        return;
      }

      const ok = confirm(
        `Delete ${selected.length} selected ChatGPT chat(s)?\n\n` +
        `This cannot be undone.`
      );
      if (!ok) return;

      del.disabled = true;
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
          item.cb.checked = false;
        } catch (err) {
          failed++;
          item.row.style.borderColor = '#d00';
          console.error('[Personal Chat Cleaner]', item.chat.title, err);
        }
      }

      status.textContent =
        `Finished: ${deleted} deleted` +
        (failed ? `, ${failed} failed. Failed rows are outlined in red.` : '.');

      del.disabled = false;
      close.disabled = false;
      selectLikely.disabled = false;
    };

    actions.append(selectLikely, close, del);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function button(text, bg, color) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `
      border:0;border-radius:9px;padding:9px 13px;font-weight:650;
      cursor:pointer;background:${bg};color:${color};
    `;
    return b;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function scan() {
    const chats = uniqueChats().map(classify);
    makeOverlay(chats);
  }

  function addLauncher() {
    if (document.getElementById('vanick-cleaner-button')) return;

    const b = document.createElement('button');
    b.id = 'vanick-cleaner-button';
    b.textContent = '🧹 Clean Recents';
    b.title = 'Review likely personal chats';
    b.style.cssText = `
      position:fixed;right:18px;bottom:18px;z-index:2147483646;
      border:1px solid rgba(0,0,0,.18);border-radius:999px;
      padding:10px 14px;background:#fff;color:#111;font-weight:700;
      box-shadow:0 5px 22px rgba(0,0,0,.22);cursor:pointer;
    `;
    b.onclick = scan;
    document.body.appendChild(b);
  }

  addLauncher();
  new MutationObserver(addLauncher).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

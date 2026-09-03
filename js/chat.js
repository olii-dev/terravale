// Chat v2: message log with uid de-duplication, input history and Tab
// completion for commands and player names.

export class Chat {
  constructor({ logEl, inputWrap, inputEl, onSubmit, onCommandComplete }) {
    this.logEl = logEl;
    this.inputWrap = inputWrap;
    this.inputEl = inputEl;
    this.onSubmit = onSubmit;
    this.onCommandComplete = onCommandComplete;
    this.open = false;
    this.messages = [];
    this.seenUids = new Set();
    this.history = [];
    this.historyIdx = -1;
    this.players = []; // [{name}] for completion

    inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = inputEl.value.trim();
        if (text) {
          this.history.push(text);
          if (this.history.length > 50) this.history.shift();
        }
        this.historyIdx = -1;
        this.close();
        if (text) onSubmit(text);
      } else if (e.key === 'Escape') {
        this.historyIdx = -1;
        this.close();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this.history.length) return;
        this.historyIdx = this.historyIdx < 0 ? this.history.length - 1 : Math.max(0, this.historyIdx - 1);
        inputEl.value = this.history[this.historyIdx];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIdx < 0) return;
        this.historyIdx++;
        if (this.historyIdx >= this.history.length) { this.historyIdx = -1; inputEl.value = ''; }
        else inputEl.value = this.history[this.historyIdx];
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (this.onCommandComplete) {
          const completed = this.onCommandComplete(inputEl.value);
          if (completed !== null && completed !== undefined) inputEl.value = completed;
        }
      }
    });
  }

  isOpen() { return this.open; }

  openInput() {
    this.open = true;
    this.inputWrap.classList.remove('hidden');
    this.inputEl.value = '';
    this.inputEl.focus();
  }

  close() {
    this.open = false;
    this.inputWrap.classList.add('hidden');
    this.inputEl.blur();
  }

  add({ uid, name, color = '#ffd94c', text, system = false }) {
    if (uid !== undefined) {
      if (this.seenUids.has(uid)) return; // hard dedupe guard
      this.seenUids.add(uid);
      if (this.seenUids.size > 4000) this.seenUids.clear();
    }
    const div = document.createElement('div');
    div.className = 'msg' + (system ? ' system' : '');
    if (system) {
      div.textContent = text;
    } else {
      const who = document.createElement('span');
      who.className = 'who';
      who.style.color = color;
      who.textContent = name;
      div.appendChild(who);
      div.appendChild(document.createTextNode(' ' + text));
    }
    this.logEl.appendChild(div);
    this.messages.push({ el: div, t: performance.now() });
    while (this.messages.length > 80) {
      this.messages.shift().el.remove();
    }
  }

  update() {
    const now = performance.now();
    for (const m of this.messages) {
      const age = now - m.t;
      const opacity = this.open ? 1 : Math.max(0, 1 - (age - 6000) / 3000);
      m.el.style.opacity = opacity;
    }
    while (this.messages.length && !this.open && now - this.messages[0].t > 9500) {
      this.messages.shift().el.remove();
    }
  }
}

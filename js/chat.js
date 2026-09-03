// Chat UI: message log with fade-out and a single-line input.

export class Chat {
  constructor({ logEl, inputWrap, inputEl, onSubmit }) {
    this.logEl = logEl;
    this.inputWrap = inputWrap;
    this.inputEl = inputEl;
    this.onSubmit = onSubmit;
    this.open = false;
    this.messages = [];

    inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = inputEl.value.trim();
        this.close();
        if (text) onSubmit(text);
      } else if (e.key === 'Escape') {
        this.close();
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

  add({ name, color = '#f2eee6', text, system = false }) {
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
    while (this.messages.length > 60) {
      const m = this.messages.shift();
      m.el.remove();
    }
  }

  // fade old messages; recent ones stay fully visible while chat is open
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

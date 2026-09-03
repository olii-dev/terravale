// P2P multiplayer over PeerJS (WebRTC data channels, free public broker).
// Star topology: the host is authoritative for the world (seed + edit log)
// and relays positions/chat between clients.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'vhm1-';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

// net messages (all JSON):
//  client→host: hi {name,color} | pos {x,y,z,yaw,pitch,fly} | edit {x,y,z,b} | chat {text}
//  host→client: init {seed,edits,time,yourId,players} | pos {id,...} | edit {id,x,y,z,b}
//             | chat {id,name,color,text} | join {id,name,color} | leave {id} | time {time}

export class Net {
  constructor(handlers) {
    this.handlers = handlers; // {onStatus,onReady,onInit,onJoin,onLeave,onPos,onEdit,onChat,onTime,onError,onHostGone}
    this.mode = null;         // 'host' | 'client'
    this.peer = null;
    this.code = null;
    this.myId = null;
    this.players = new Map(); // id -> {name, color, conn|null}
    this.nextId = 1;
    this.worldState = null;   // host: {seed, edits, time}
  }

  // ---------- host ----------

  hostWorld(code, seed, editsArray, time, myName, myColor) {
    this.mode = 'host';
    this.code = code;
    this.myId = 0;
    this.worldState = { seed, edits: editsArray, time };
    this.players.set(0, { name: myName, color: myColor, conn: null });

    this.handlers.onStatus('Starting room ' + code + '…');
    const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
    this.peer = peer;

    peer.on('open', () => this.handlers.onReady(code));
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.handlers.onError('That room code is already in use — try again.');
      } else if (err.type === 'network' || err.type === 'server-error') {
        this.handlers.onError('Lost contact with the room broker. Check your internet.');
      } else if (err.type !== 'peer-unavailable') {
        console.warn('peer error:', err.type, err.message);
      }
    });
    peer.on('disconnected', () => { if (this.mode) peer.reconnect(); });

    peer.on('connection', (conn) => {
      conn.on('data', (raw) => this.onHostData(conn, raw));
      conn.on('close', () => this.hostDrop(conn));
      conn.on('error', () => this.hostDrop(conn));
    });
  }

  onHostData(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hi': {
        // guard against double-hi
        if (conn._id !== undefined) return;
        const id = this.nextId++;
        conn._id = id;
        this.players.set(id, { name: String(msg.name || 'Wanderer').slice(0, 16), color: msg.color || '#7ddb5a', conn });
        const roster = [...this.players.entries()]
          .filter(([pid]) => pid !== id)
          .map(([pid, p]) => ({ id: pid, name: p.name, color: p.color }));
        conn.send({
          t: 'init',
          seed: this.worldState.seed,
          edits: this.worldState.edits,
          time: this.worldState.time,
          yourId: id,
          players: roster,
        });
        this.broadcastExcept(id, { t: 'join', id, name: this.players.get(id).name, color: this.players.get(id).color });
        this.handlers.onJoin(id, this.players.get(id).name, this.players.get(id).color);
        break;
      }
      case 'pos': {
        const id = conn._id;
        if (id === undefined) return;
        this.broadcastExcept(id, { t: 'pos', id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch, fly: msg.fly });
        this.handlers.onPos(id, msg);
        break;
      }
      case 'edit': {
        const id = conn._id;
        if (id === undefined) return;
        this.handlers.onEdit(id, msg.x, msg.y, msg.z, msg.b);
        this.worldState.edits.push([msg.x, msg.y, msg.z, msg.b]);
        this.broadcastExcept(id, { t: 'edit', id, x: msg.x, y: msg.y, z: msg.z, b: msg.b });
        break;
      }
      case 'chat': {
        const id = conn._id;
        if (id === undefined) return;
        const p = this.players.get(id);
        const text = String(msg.text || '').slice(0, 120);
        this.handlers.onChat(id, p.name, p.color, text);
        this.broadcastExcept(id, { t: 'chat', id, name: p.name, color: p.color, text });
        break;
      }
    }
  }

  hostDrop(conn) {
    const id = conn._id;
    if (id === undefined || !this.players.has(id)) return;
    const p = this.players.get(id);
    this.players.delete(id);
    this.broadcast({ t: 'leave', id });
    this.handlers.onLeave(id, p.name);
  }

  broadcast(msg) {
    for (const [, p] of this.players) if (p.conn?.open) p.conn.send(msg);
  }

  broadcastExcept(exceptId, msg) {
    for (const [pid, p] of this.players) {
      if (pid === exceptId) continue;
      if (p.conn?.open) p.conn.send(msg);
    }
  }

  // host applies its own events through these
  hostEdit(x, y, z, b) {
    this.worldState.edits.push([x, y, z, b]);
    this.broadcast({ t: 'edit', id: 0, x, y, z, b });
  }

  hostChat(myName, myColor, text) {
    this.handlers.onChat(0, myName, myColor, text);
    this.broadcastExcept(0, { t: 'chat', id: 0, name: myName, color: myColor, text });
  }

  hostPos(x, y, z, yaw, pitch, fly) {
    this.broadcast({ t: 'pos', id: 0, x, y, z, yaw, pitch, fly });
  }

  hostTime(time) {
    this.broadcast({ t: 'time', time });
  }

  // ---------- client ----------

  joinWorld(code, myName, myColor) {
    this.mode = 'client';
    this.code = code;
    this.handlers.onStatus('Looking for room ' + code + '…');
    const peer = new Peer({ debug: 1 });
    this.peer = peer;

    peer.on('open', () => {
      this.handlers.onStatus('Connecting to host…');
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      this.conn = conn;
      const failTimer = setTimeout(() => {
        if (!this._gotInit) this.handlers.onError('Could not reach that room. Check the code (and that the host is online).');
      }, 12000);
      conn.on('open', () => {
        conn.send({ t: 'hi', name: myName, color: myColor });
      });
      conn.on('data', (raw) => {
        const msg = raw;
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'init') {
          clearTimeout(failTimer);
          this._gotInit = true;
          this.myId = msg.yourId;
          this.handlers.onInit(msg);
        } else if (msg.t === 'pos') this.handlers.onPos(msg.id, msg);
        else if (msg.t === 'edit') this.handlers.onEdit(msg.id, msg.x, msg.y, msg.z, msg.b);
        else if (msg.t === 'chat') this.handlers.onChat(msg.id, msg.name, msg.color, msg.text);
        else if (msg.t === 'join') {
          this.players.set(msg.id, { name: msg.name, color: msg.color, conn: null });
          this.handlers.onJoin(msg.id, msg.name, msg.color);
        } else if (msg.t === 'leave') {
          const p = this.players.get(msg.id);
          this.players.delete(msg.id);
          this.handlers.onLeave(msg.id, p?.name);
        } else if (msg.t === 'time') this.handlers.onTime(msg.time);
      });
      conn.on('close', () => {
        if (this.mode === 'client') this.handlers.onHostGone();
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.handlers.onError('No room with code ' + code + ' is online right now.');
      } else {
        console.warn('peer error:', err.type, err.message);
      }
    });
  }

  clientSend(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  // ---------- shared helpers ----------

  sendEdit(x, y, z, b) {
    if (this.mode === 'host') this.hostEdit(x, y, z, b);
    else if (this.mode === 'client') this.clientSend({ t: 'edit', x, y, z, b });
  }

  sendChat(text, myName, myColor) {
    if (this.mode === 'host') this.hostChat(myName, myColor, text);
    else if (this.mode === 'client') this.clientSend({ t: 'chat', text });
  }

  sendPos(x, y, z, yaw, pitch, fly) {
    if (this.mode === 'host') this.hostPos(x, y, z, yaw, pitch, fly);
    else if (this.mode === 'client') this.clientSend({ t: 'pos', x, y, z, yaw, pitch, fly });
  }

  roster() {
    return [...this.players.entries()].map(([id, p]) => ({ id, name: p.name, color: p.color }));
  }

  destroy() {
    this.mode = null;
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    this.players.clear();
  }
}

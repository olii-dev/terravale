// P2P multiplayer v2 over PeerJS. The host is authoritative for the world,
// mobs, drops, containers and commands; clients own their inventory and
// stats and report positions/damage.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'tva1-';

// STUN for NAT discovery + free public TURN relays (Open Relay Project) so
// players behind strict NATs (mobile hotspots, school Wi-Fi) can still connect
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
    sdpSemantics: 'unified-plan',
  },
  debug: 1,
};

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.mode = null;
    this.peer = null;
    this.code = null;
    this.myId = null;
    this.players = new Map(); // id -> {name, color, conn, pos}
    this.nextId = 1;
    this.chatUid = 1;
    this.worldState = null;   // host: {seed, edits, time, gamemode, difficulty, spawn, containers}
  }

  // ---------- host ----------

  hostWorld(code, state, myName, myColor) {
    this.mode = 'host';
    this.code = code;
    this.myId = 0;
    this.worldState = state;
    this.players.set(0, { name: myName, color: myColor, conn: null, pos: null });

    this.handlers.onStatus('Starting room ' + code + '…');
    const peer = new Peer(PEER_PREFIX + code, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => this.handlers.onReady(code));
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') this.handlers.onError('That room code is already in use — try again.');
      else if (err.type === 'network' || err.type === 'server-error') this.handlers.onError('Lost contact with the room broker. Check your internet.');
      else if (err.type !== 'peer-unavailable') console.warn('peer error:', err.type, err.message);
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
        if (conn._id !== undefined) return;
        const id = this.nextId++;
        conn._id = id;
        this.players.set(id, { name: String(msg.name || 'Wanderer').slice(0, 16), color: msg.color || '#7ddb5a', conn, pos: null });
        const roster = [...this.players.entries()]
          .filter(([pid]) => pid !== id)
          .map(([pid, p]) => ({ id: pid, name: p.name, color: p.color }));
        // snapshot live state so late joiners see everything that changed
        const live = this.handlers.onWorldSnapshot?.() ?? this.worldState;
        conn.send({
          t: 'init',
          seed: live.seed,
          edits: live.edits,
          time: live.time,
          gamemode: live.gamemode,
          difficulty: live.difficulty,
          spawn: live.spawn,
          containers: live.containers,
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
        const p = this.players.get(id);
        if (p) p.pos = { x: msg.x, y: msg.y, z: msg.z, hp: msg.hp, gm: msg.gm };
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
        const text = String(msg.text || '').slice(0, 140);
        if (text.startsWith('/')) {
          this.handlers.onCommand(id, text);
        } else {
          const uid = this.chatUid++;
          this.handlers.onChat(uid, id, p.name, p.color, text);
          this.broadcastExcept(id, { t: 'chat', uid, id, name: p.name, color: p.color, text });
        }
        break;
      }
      case 'pickupReq': {
        this.handlers.onPickupRequest?.(conn._id, msg.id);
        break;
      }
      case 'mobHit': {
        this.handlers.onMobHit?.(conn._id, msg.id, msg.dmg, msg.kx, msg.kz);
        break;
      }
      case 'drop': {
        this.handlers.onDrop?.(conn._id, msg.id, msg.count, msg.dur);
        break;
      }
      case 'cstate': {
        // client closed a container and reports the authoritative new state
        this.handlers.onContainerState?.(msg.k, msg.data);
        this.broadcastExcept(conn._id, { t: 'cstate', k: msg.k, data: msg.data });
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

  sendTo(id, msg) {
    const p = this.players.get(id);
    if (p?.conn?.open) p.conn.send(msg);
  }

  // host applies its own events through these
  hostEdit(x, y, z, b) {
    this.worldState.edits.push([x, y, z, b]);
    this.broadcast({ t: 'edit', id: 0, x, y, z, b });
  }

  hostChat(myName, myColor, text) {
    const uid = this.chatUid++;
    this.handlers.onChat(uid, 0, myName, myColor, text);
    this.broadcastExcept(0, { t: 'chat', uid, id: 0, name: myName, color: myColor, text });
  }

  hostCommand(text) {
    this.handlers.onCommand(0, text);
  }

  hostPos(x, y, z, yaw, pitch, fly, hp, gm) {
    const p = this.players.get(0);
    if (p) p.pos = { x, y, z, hp, gm };
    this.broadcast({ t: 'pos', id: 0, x, y, z, yaw, pitch, fly });
  }

  hostTime(time) { this.broadcast({ t: 'time', time }); }
  hostMobs(states) { this.broadcast({ t: 'mobs', s: states }); }
  hostDrops(states) { this.broadcast({ t: 'drops', s: states }); }
  hostDamage(id, dmg, kx, kz, cause) { this.sendTo(id, { t: 'damage', dmg, kx, kz, cause }); }
  hostGive(id, stack) { this.sendTo(id, { t: 'give', id: stack.id, count: stack.count }); }
  hostTp(id, x, y, z) { this.sendTo(id, { t: 'tp', x, y, z }); }
  hostGamemode(id, mode) { this.sendTo(id, { t: 'gamemode', mode }); }
  hostCmdout(id, text) { this.sendTo(id, { t: 'cmdout', text }); }
  hostCstate(k, data) { this.broadcast({ t: 'cstate', k, data }); }
  hostDifficulty(d) { this.broadcast({ t: 'difficulty', d }); }

  // ---------- client ----------

  joinWorld(code, myName, myColor) {
    this.mode = 'client';
    this.code = code;
    this.handlers.onStatus('Looking for room ' + code + '…');
    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      this.handlers.onStatus('Connecting to host…');
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      this.conn = conn;
      const fail = (msg) => {
        if (this._gotInit || this._failed) return;
        this._failed = true;
        clearTimeout(failTimer);
        this.handlers.onError(msg);
      };
      const failTimer = setTimeout(() => {
        fail('Could not reach that room. Check the code (and that the host is online — their tab must stay open).');
      }, 12000);

      // fast, specific feedback when the direct connection can't form
      const watchIce = () => {
        const pc = conn.peerConnection;
        if (!pc) { setTimeout(watchIce, 200); return; }
        pc.addEventListener('iceconnectionstatechange', () => {
          if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
            fail('Could not establish a direct connection (strict network). Both players: reload the site, or try a different network (e.g. disable VPN).');
          }
        });
      };
      watchIce();

      conn.on('open', () => conn.send({ t: 'hi', name: myName, color: myColor }));
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'init') {
          this._gotInit = true;
          clearTimeout(failTimer);
          this.myId = msg.yourId;
          this.handlers.onInit(msg);
        } else if (msg.t === 'pos') this.handlers.onPos(msg.id, msg);
        else if (msg.t === 'edit') this.handlers.onEdit(msg.id, msg.x, msg.y, msg.z, msg.b);
        else if (msg.t === 'chat') this.handlers.onChat(msg.uid, msg.id, msg.name, msg.color, msg.text);
        else if (msg.t === 'join') {
          this.players.set(msg.id, { name: msg.name, color: msg.color, conn: null });
          this.handlers.onJoin(msg.id, msg.name, msg.color);
        } else if (msg.t === 'leave') {
          const p = this.players.get(msg.id);
          this.players.delete(msg.id);
          this.handlers.onLeave(msg.id, p?.name);
        } else if (msg.t === 'time') this.handlers.onTime(msg.time);
        else if (msg.t === 'mobs') this.handlers.onMobs?.(msg.s);
        else if (msg.t === 'drops') this.handlers.onDrops?.(msg.s);
        else if (msg.t === 'damage') this.handlers.onDamage?.(msg.dmg, msg.kx, msg.kz, msg.cause);
        else if (msg.t === 'give') this.handlers.onGive?.(msg.id, msg.count);
        else if (msg.t === 'tp') this.handlers.onTp?.(msg.x, msg.y, msg.z);
        else if (msg.t === 'gamemode') this.handlers.onGamemode?.(msg.mode);
        else if (msg.t === 'cmdout') this.handlers.onCmdout?.(msg.text);
        else if (msg.t === 'cstate') this.handlers.onContainerState?.(msg.k, msg.data);
        else if (msg.t === 'difficulty') this.handlers.onDifficulty?.(msg.d);
      });
      conn.on('close', () => {
        if (this.mode === 'client' && this._gotInit) this.handlers.onHostGone();
      });
    });

    peer.on('error', (err) => {
      if (this._gotInit) { console.warn('peer error:', err.type, err.message); return; }
      if (err.type === 'peer-unavailable') fail('No room with code ' + code + ' is online right now. Check the code — and that the host is hosting right now.');
      else if (err.type === 'network' || err.type === 'server-error') fail('Lost contact with the room broker. Check your internet and try again.');
      else if (err.type === 'browser-incompatible') fail('This browser cannot do peer-to-peer. Use desktop Chrome, Edge or Firefox.');
      else fail('Connection problem (' + err.type + '). Try again in a moment.');
    });
  }

  clientSend(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  // ---------- shared ----------

  sendEdit(x, y, z, b) {
    if (this.mode === 'host') this.hostEdit(x, y, z, b);
    else if (this.mode === 'client') this.clientSend({ t: 'edit', x, y, z, b });
  }

  sendChat(text, myName, myColor) {
    if (this.mode === 'host') this.hostChat(myName, myColor, text);
    else if (this.mode === 'client') this.clientSend({ t: 'chat', text });
  }

  sendCommand(text) {
    if (this.mode === 'host') this.hostCommand(text);
    else if (this.mode === 'client') this.clientSend({ t: 'chat', text });
  }

  sendPos(x, y, z, yaw, pitch, fly, hp, gm) {
    if (this.mode === 'host') this.hostPos(x, y, z, yaw, pitch, fly, hp, gm);
    else if (this.mode === 'client') this.clientSend({ t: 'pos', x, y, z, yaw, pitch, fly, hp, gm });
  }

  sendPickupReq(id) { if (this.mode === 'client') this.clientSend({ t: 'pickupReq', id }); }
  sendMobHit(id, dmg, kx, kz) { if (this.mode === 'client') this.clientSend({ t: 'mobHit', id, dmg, kx, kz }); }
  sendCstate(k, data) {
    if (this.mode === 'client') this.clientSend({ t: 'cstate', k, data });
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

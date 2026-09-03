// Chat commands, executed by the host. Everyone is trusted (friends on a
// P2P world). Results are messaged back to the sender.

import { B, BLOCKS } from './blocks.js';
import { ITEMS, stack, nameOf } from './items.js';

export const COMMANDS = [
  { name: 'help', args: '', desc: 'list commands' },
  { name: 'gamemode', args: '<survival|creative|s|c>', desc: 'switch your game mode' },
  { name: 'time', args: 'set <day|noon|sunset|night|0-1>', desc: 'set the time of day' },
  { name: 'tp', args: '<x y z> | <player>', desc: 'teleport yourself' },
  { name: 'give', args: '<item> [count]', desc: 'give yourself items' },
  { name: 'clear', args: '', desc: 'empty your inventory' },
  { name: 'seed', args: '', desc: 'show the world seed' },
  { name: 'kill', args: '', desc: 'you know what this does' },
  { name: 'say', args: '<message>', desc: 'broadcast a message' },
  { name: 'spawn', args: '', desc: 'teleport to the world spawn' },
  { name: 'difficulty', args: '<peaceful|normal>', desc: 'monster behavior' },
];

const TIME_NAMES = { day: 0.28, noon: 0.5, sunset: 0.72, night: 0.8, midnight: 0.0, sunrise: 0.22 };

// ctx: { world, sky, players (map id->{pos,...}), senderId, reply(text),
//        broadcast(text), setGamemode(id, mode), give(id, stack),
//        teleport(id, x, y, z), kill(id) }
export function runCommand(text, ctx) {
  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const sender = ctx.senderId;
  const reply = (t) => ctx.reply(t);

  switch (cmd) {
    case 'help': {
      reply('§Commands:');
      for (const c of COMMANDS) reply(`/${c.name} ${c.args} — ${c.desc}`);
      return;
    }
    case 'gamemode': {
      const m = (parts[0] || '').toLowerCase();
      const mode = m === 'c' || m === 'creative' ? 'creative' : m === 's' || m === 'survival' ? 'survival' : null;
      if (!mode) return reply('Usage: /gamemode <survival|creative>');
      ctx.setGamemode(sender, mode);
      reply(`Game mode set to ${mode}`);
      return;
    }
    case 'time': {
      if ((parts[0] || '').toLowerCase() !== 'set') return reply('Usage: /time set <day|noon|sunset|night|0-1>');
      const a = (parts[1] || '').toLowerCase();
      let t = TIME_NAMES[a];
      if (t === undefined) {
        t = parseFloat(a);
        if (!isFinite(t) || t < 0 || t > 1) return reply('Usage: /time set <day|noon|sunset|night|0-1>');
      }
      ctx.setTime(t);
      reply(`Time set to ${a}`);
      return;
    }
    case 'tp': {
      if (parts.length === 1) {
        const target = ctx.findPlayer(parts[0]);
        if (!target) return reply(`No player named "${parts[0]}"`);
        ctx.teleport(sender, target.pos.x, target.pos.y, target.pos.z);
        reply(`Teleported to ${target.name}`);
        return;
      }
      const [x, y, z] = parts.map(Number);
      if (![x, y, z].every((v) => isFinite(v))) return reply('Usage: /tp <x y z> | <player>');
      ctx.teleport(sender, x, y, z);
      reply(`Teleported to ${x} ${y} ${z}`);
      return;
    }
    case 'give': {
      if (!parts.length) return reply('Usage: /give <item> [count]');
      let count = parseInt(parts[parts.length - 1]);
      if (isFinite(count) && parts.length > 1) parts.pop();
      else count = 1;
      const query = parts.join(' ').toLowerCase();
      const id = findItem(query);
      if (!id) return reply(`Unknown item "${query}"`);
      ctx.give(sender, stack(id, Math.max(1, Math.min(640, count))));
      reply(`Gave ${count}× ${nameOf(id)}`);
      return;
    }
    case 'clear':
      ctx.clearInventory(sender);
      reply('Inventory cleared');
      return;
    case 'seed':
      reply(`Seed: ${ctx.world.seed}`);
      return;
    case 'kill':
      ctx.kill(sender);
      return;
    case 'say':
      ctx.broadcast(parts.join(' '));
      return;
    case 'spawn': {
      const s = ctx.world.spawnPoint();
      ctx.teleport(sender, s.x, s.y, s.z);
      reply('Whoosh!');
      return;
    }
    case 'difficulty': {
      const d = (parts[0] || '').toLowerCase();
      if (d !== 'peaceful' && d !== 'normal') return reply('Usage: /difficulty <peaceful|normal>');
      ctx.setDifficulty(d);
      reply(`Difficulty set to ${d}`);
      return;
    }
    default:
      reply(`Unknown command "${cmd}" — try /help`);
  }
}

function findItem(query) {
  // exact-ish matches first, then substring
  let best = null;
  for (const bl of BLOCKS) {
    if (!bl || bl.id === B.AIR || bl.id === B.BEDROCK) continue;
    const n = bl.name.toLowerCase();
    if (n === query) return bl.id;
    if (!best && (n.includes(query) || n.replace(/ /g, '_').includes(query))) best = bl.id;
  }
  for (const it of Object.values(ITEMS)) {
    const n = it.name.toLowerCase();
    if (n === query) return it.id;
    if (!best && n.includes(query)) best = it.id;
  }
  return best;
}

// suggestions for Tab completion
export function commandSuggestions(prefix) {
  const p = prefix.toLowerCase();
  return COMMANDS.filter((c) => ('/' + c.name).startsWith(p)).map((c) => '/' + c.name);
}

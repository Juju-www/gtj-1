// Spielmodi sind austauschbare Klassen mit identischer Schnittstelle.
// Neue Modi: Klasse schreiben, hier registrieren, in shared/constants.js (MODES) eintragen.
class BaseMode {
  constructor(match) { this.match = match; this.def = match.modeDef; }
  assignTeam() { return -1; }
  canDamage() { return true; }
  onKill() {}
  onReset() {}
  /** Rückgabe {winner, label} wenn das Match endet, sonst null. */
  checkEnd() { return null; }
}

class TeamDeathmatch extends BaseMode {
  assignTeam() {
    const c = [0, 0];
    for (const p of this.match.players.values()) if (p.team === 0 || p.team === 1) c[p.team]++;
    return c[0] <= c[1] ? 0 : 1;
  }
  canDamage(a, b) { return a.team !== b.team; }
  onKill(killer) { if (killer && killer.team >= 0) this.match.scores[killer.team] = (this.match.scores[killer.team] || 0) + 1; }
  onReset() { this.match.scores = { 0: 0, 1: 0 }; }
  checkEnd(timeUp) {
    const s = this.match.scores;
    if ((s[0] || 0) >= this.def.scoreLimit) return { winner: 0, label: 'Team Alpha gewinnt' };
    if ((s[1] || 0) >= this.def.scoreLimit) return { winner: 1, label: 'Team Bravo gewinnt' };
    if (timeUp) {
      if (s[0] === s[1]) return { winner: -1, label: 'Unentschieden' };
      const w = s[0] > s[1] ? 0 : 1; return { winner: w, label: `Team ${w ? 'Bravo' : 'Alpha'} gewinnt` };
    }
    return null;
  }
}

class FreeForAll extends BaseMode {
  onKill(killer) { if (killer) killer.score++; }
  checkEnd(timeUp) {
    let top = null;
    for (const p of this.match.players.values()) if (!top || p.score > top.score) top = p;
    if (top && top.score >= this.def.scoreLimit) return { winner: top.id, label: `${top.name} gewinnt` };
    if (timeUp) return top && top.score > 0 ? { winner: top.id, label: `${top.name} gewinnt` } : { winner: -1, label: 'Kein Sieger' };
    return null;
  }
}

export function createMode(id, match) {
  if (id === 'ffa') return new FreeForAll(match);
  if (id === 'tdm') return new TeamDeathmatch(match);
  throw new Error('Modus nicht implementiert: ' + id);
}

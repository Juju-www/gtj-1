// Von Client UND Server verwendet (reines ES-Modul, keine Abhängigkeiten).
export const TICK_RATE = 20;            // Server-Snapshots pro Sekunde
export const MAX_PLAYERS_PER_MATCH = 12;
export const RECONNECT_GRACE_MS = 30000;

export const PLAYER = {
  radius: 0.35, height: 1.8, crouchHeight: 1.25,
  eye: 1.65, crouchEye: 1.15,
  walk: 4.2, sprint: 6.8, crouch: 2.3,
  jump: 6.4, gravity: 20, step: 0.55, maxHealth: 100,
  staminaMax: 100, staminaDrain: 22, staminaRegen: 16, staminaMinToSprint: 12,
};

export const WEAPONS = {
  m4: {
    id: 'm4', name: 'M4A1', category: 'Assault Rifle',
    damage: 27, headshotMult: 1.5, rpm: 750,
    mag: 30, reserve: 120,
    reloadTime: 2.4, reloadEmptyTime: 2.9,   // Sekunden (Animation wird darauf skaliert)
    recoilPitch: 0.55, recoilYaw: 0.22,        // Grad pro Schuss
    spreadHip: 1.6, spreadAds: 0.15, spreadMove: 1.2, spreadPerShot: 0.18, spreadMax: 3.5, // Grad
    adsTime: 0.14, adsFov: 52,
    fireModes: ['auto', 'burst', 'semi'], burstCount: 3,
    rangeFalloffStart: 30, rangeFalloffEnd: 90, minDamageMult: 0.65,
    maxRange: 250,
  },
};

export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', teams: 2, scoreLimit: 30, timeLimit: 600, respawn: 3, friendlyFire: false, implemented: true },
  ffa: { id: 'ffa', name: 'Free For All',    teams: 0, scoreLimit: 20, timeLimit: 480, respawn: 3, friendlyFire: true,  implemented: true },
  snd: { id: 'snd', name: 'Search and Destroy', teams: 2, scoreLimit: 6, timeLimit: 0, respawn: 0, friendlyFire: false, implemented: false },
};

export const TEAM_NAMES = ['Alpha', 'Bravo'];

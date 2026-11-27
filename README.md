# FRONTLINE ZERO – Browser-FPS (Three.js · Node.js · Socket.IO)

Eigenständiger First-Person-Shooter für den Browser (PC, Smartphone, Tablet) mit **deiner originalen M4-Waffe**
(`m4-fps-weapon-animations-pack-v1.zip`: Modell, Hände, 6 Animationen). Keine Engine, nur Webtechnologien.

## Starten
```bash
npm install        # lädt express, socket.io und three (three wird lokal unter /vendor/three ausgeliefert)
npm start          # http://localhost:3000
npm run check      # Selbsttests (Map, Physik, Server-Logik)
```
Handy/Tablet im selben WLAN: `http://<PC-IP>:3000` öffnen (Querformat). Ohne HTTPS funktionieren Pointer Lock/Audio nur auf localhost bzw. nach Interaktion; für Internet-Betrieb HTTPS verwenden.

## Steuerung (PC, anpassbar unter Einstellungen)
WASD · Shift Sprint (Ausdauer) · Space Sprung · C/Strg Ducken · LMB Schießen · RMB Zielen · R Nachladen · B Schussmodus (Dauerfeuer/Feuerstoß/Einzel) · 1/2 Waffe · Tab Scoreboard · Esc Pause.
Controller: Sticks, RT/LT, A (Sprung), X (Nachladen), B (Ducken), L3 (Sprint). Touch: Joystick, Wisch-Kamera, Buttons (Größe/Transparenz/Position einstellbar).

## Struktur
```
client/            index.html, styles.css, assets/weapons/m4 (FBX + Texturen)
  src/core         game.js (Schleife, Zustand), input.js
  src/player       player.js (Controller), physics.js (Kollision, Treppen)
  src/weapons      viewmodel.js (FBX/Animation), weapons.js (Logik), effects.js
  src/world        world.js (Rendering der Map)
  src/multiplayer  net.js, remotes.js (Interpolation)
  src/ui           hud.js, touch.js     src/audio  audio.js     src/settings  settings.js
server/src         index.js, matches/ (Match, MatchManager), modes/ (TDM, FFA)
shared/            constants.js, map.js (Map-Daten), math.js (Raycasts)  – von Client UND Server genutzt
scripts/           check.mjs, check-imports.mjs
```

## Dokumentation der Phasen
**Phase 1 – Grundsystem:** Projektstruktur, Three.js-Renderer, First-Person-Kamera, Bewegung (Beschleunigung, Luftkontrolle, Sprint+Ausdauer, Springen, Ducken), AABB-Kollision mit Treppen/Rampen. *Getestet (Node):* Treppen (Dach, Turm, Container), Türen, Wände.
**Phase 2 – Waffe:** Originale FBX wird geladen und an der eingebauten `FPS_Camera_j` ausgerichtet; alle 6 Clips (Idle, Fire, Reload, Reload_Empty, Draw, Holster) werden auf 0 s normalisiert und genutzt; Nachladen skaliert die Animation auf die Spielzeit und füllt Munition synchron; Mündungsfeuer, Tracer, Rauch, Einschläge. Sprint-/Geh-/ADS-Bewegung ist prozedural (die Datei enthält dafür keine Clips).
**Phase 3 – Map:** „Depot Zero“ (Lagerhalle mit Zwischenebene und Dach, 2-stöckiges Büro, Containerhof, Überführung/Unterführung, Wachturm, Parkplatz, Funkmast als Orientierungspunkt), PBR-Materialien mit prozeduralen Texturen, Sonne mit Schatten, Himmel-Reflexionen, Nebel.
**Phase 4 – UI:** HUD, Minimap, Hauptmenü, Lobby, Pause, Einstellungen (inkl. Tasten-Umbelegung), Ergebnis, Scoreboard.
**Phase 5 – Multiplayer:** Socket.IO-Server mit Lobby/Matchmaking-Grundlage, validierter Spielerbewegung (Anti-Teleport, Kollision), serverseitiger Schuss-/Treffer-/Munitions-/Feuerraten-Prüfung mit Lag-Kompensation, Respawn, Team Deathmatch, Wiederverbindung (30 s), Ping-Anzeige, Snapshot-Interpolation.
**Phase 6 (Teil):** Free For All. **Phase 7:** Touch-Steuerung + responsive UI. **Phase 8 (Teil):** Qualitätsprofile, dynamische Auflösung, FPS-Limit.

## Was funktioniert / ehrlicher Stand
Automatisch getestet (`npm run check`, ohne Browser): Map-Daten, Physik, Strahltests, Server-Treffer/Kill/Score/Wand-Okklusion/Feuerrate/Nachladen/Anti-Teleport/Lag-Kompensation, Import-Konsistenz.
**Noch nicht im Browser getestet** (in der Entwicklungsumgebung war kein Browser/Netzwerk verfügbar): Rendering, FBX-Ausrichtung, Animationen, Touch, Audio, Netzwerk-Verbindung. Bitte beim ersten Start die Browserkonsole prüfen und Fehler melden.
Feinjustage der Waffe (falls sie leicht versetzt sitzt): in der Konsole `frontline.vm.rig.position` bzw. die Konstanten `ADS_OFFSET`/`MUZZLE_HIP` in `client/src/weapons/viewmodel.js` anpassen.

## Bekannte Lücken / noch zu entwickeln
- **Search and Destroy** ist nicht implementiert (im Menü deaktiviert). Architektur (`server/src/modes`) ist vorbereitet.
- **Fortschrittssystem/Datenbank** (XP, Level, Freischaltungen) fehlt noch.
- Nur **eine Waffe** (M4); Slot 2 leer. Weitere Waffen brauchen eigene Modelle/Animationen (Waffenwerte: `shared/constants.js`). Keine Projektilwaffen/Explosionen/Granaten.
- Gegner sind einfache Low-Poly-Figuren (kein Third-Person-Modell/Animation); Gegner-Waffe ist ein Platzhalter-Quader.
- Server prüft Bewegung nur auf Plausibilität (kein vollständig serverseitig simulierter Input). Kein Ambient Occlusion, keine Texturkompression/LOD/Instancing (Map wird je Material zu einem Mesh verschmolzen).
- Audio ist komplett synthetisiert (keine Musik); Controller-Belegung fest.
- **Lizenz:** Die Waffen-Assets stammen aus einem Asset-Store-Paket – prüfen, ob die Lizenz die Auslieferung im Webspiel erlaubt.

import { defineMessages } from './locale.ts';
import { korean } from './ko/experience.ts';

export const english = {
  deathmatch: 'Deathmatch',
  bomb: 'Bomb Plant',
  hostage: 'Hostage Rescue',
  elimination: 'Elimination',
  'setup.deathmatch': 'Eliminate {target} enemies in {time} seconds. You respawn if you fall.',
  'setup.bomb': '{time} seconds per round. First to {target} wins. Defend the planted bomb.',
  'setup.hostage':
    '{time} seconds per round. First to {target} wins. Escort the hostage to the starting area.',
  'setup.elimination': '{time} seconds per round. First to {target} wins. Eliminate every enemy.',
  'site-a': 'Bomb Site A',
  'site-b': 'Bomb Site B',
  'hostage-target': 'Hostage',
  extraction: 'Extraction Zone',
  'bomb.choose': 'Plant the bomb at A or B.',
  'bomb.active': '{site} · Detonation in {seconds}s',
  'bomb.defusing': '{site} · Enemy defusing! {seconds}s left',
  'rescue.choose': 'Approach the hostage to begin the escort.',
  'rescue.escort': 'Escort the hostage to the green circle at the starting area.',
  'elimination.remaining': 'Eliminations {roundKills}/{enemyTarget} · One life per round',
  'interact.site-a': 'Plant at A',
  'interact.site-b': 'Plant at B',
  'interact.hostage': 'Escort hostage',
  'reason.detonated': 'Your bomb detonated.',
  'reason.defused': 'The enemy defused the bomb.',
  'reason.rescued': 'You reached extraction with the hostage.',
  'reason.hostage-lost': 'The hostage was lost.',
  'reason.eliminated': 'You eliminated every enemy.',
  'enemy-hit': 'Enemy fire · −{damage} health',
  'service-pistol': 'Service Pistol',
  'guard-rifle': 'Guard Rifle',
  'firearm.magazine': 'Magazine',
  'firearm.reserve': 'Reserve: {reserve} rounds',
  'firearm.reloading': 'Reloading',
  'firearm.ready': 'Ready',
  'firearm.empty': 'Out of ammo',
  'shop.balance': '{credits} credits',
  'shop.rifle': 'Guard Rifle · {price} credits',
  'shop.ammo': 'Refill reserve ammo · {refillPrice} credits',
  'shop.owned': 'Guard Rifle · Purchased',
  'shop.purchased': 'Purchase complete.',
  'shop.unavailable': 'Purchase unavailable.',
  'shop.zone': 'Use the shop at the starting area during the first 25 seconds of the round.',
  'specter-hunt': 'Specter Hunt',
  'ward-defense': 'Ward Defense',
  'ink-quarry': 'Ink Quarry',
  'gothic-arena': 'Gothic Arena',
  'level.ink-quarry': 'An open quarry with long sight lines.',
  'level.gothic-arena': 'An open FPS arena with short firefights around the central cover.',
  'setup.specter-hunt': '{time}s · Eliminate {target} enemies · Respawns enabled',
  'setup.ward-defense': '{time}s per round · First to {target} wins · One life per round',
  'west-ward': 'Western Ward',
  'east-ward': 'Eastern Ward',
  'ward.activate': 'Activate {ward}',
  'ward.activated': '{ward} activated · Hold off the approaching enemies.',
  'ward.contested': 'Enemies are contesting {ward}. Progress is paused.',
  'ward.holding': '{ward} · {seconds}s to completion',
  'ward.choose': 'Activate a ward and defend it for {seconds} seconds.',
  'score.readout': '{time} · Kills {kills}/{target}',
  'score.description': 'Reach the kill target before time runs out. You respawn if you fall.',
  'ward.readout': '{time} · Round {round} · {wins}W {losses}L',
  'round.won': 'Round Won',
  'round.lost': 'Round Lost',
  'match.won': 'Victory',
  'match.lost': 'Defeat',
  'reason.score': 'You reached the kill target.',
  'reason.sealed': 'You held off the enemy and completed the ward.',
  'reason.defeated': 'You fell before the mission was complete.',
  'reason.timeout': 'Time ran out.',
  'result.rounds': '{wins} wins · {losses} losses',
  'result.score': 'Kills {kills}/{target} · Deaths {deaths}',
  'result.next': 'Next round',
  'result.replay': 'Try again',
  respawned: 'Respawned · Health and ammo replenished',
  eliminated: 'Enemy eliminated.',
  'firearm.hud': 'Arena firearms',
} as const;

const translate = defineMessages(english, korean);

function isMessageKey(key: string): key is keyof typeof english {
  return Object.hasOwn(english, key);
}

export function experienceText(
  key: string,
  values: Readonly<Record<string, unknown>> = {},
): string {
  // Keep an unknown content ID readable when its display entry has not been authored yet.
  if (!isMessageKey(key)) return key;
  const args: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'number' || typeof value === 'string') args[name] = value;
  }
  return translate(key, args);
}

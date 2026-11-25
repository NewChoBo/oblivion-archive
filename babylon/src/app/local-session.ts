import { createChapterFeature } from '../game/chapter/chapter-feature.ts';
import type { AmmoStock, JournalCommand, JournalSession } from './journal-session.ts';
import type { CommandResult } from '../game/session/game-feature.ts';
import type { ChapterCommand, ChapterPlayer } from '../game/chapter/chapter-feature.ts';
import type { ChapterProgress, ChapterEvent } from '../game/chapter/chapter-progress.ts';
import { createExperienceFeature } from '../game/experiences/experience-feature.ts';
import type { ArenaCommand, ExperiencePlayer } from '../game/experiences/experience-feature.ts';
import type { ArenaArmory } from '../game/experiences/armory.ts';
import type { ExperienceMatch } from '../game/experiences/experience-match.ts';
import { createInventoryFeature } from '../game/inventory/inventory-feature.ts';
import type { InventoryPlayer, InventoryRules } from '../game/inventory/inventory-feature.ts';
import { progressionFeature } from '../game/progression/progression-feature.ts';
import type { ProgressionPlayer, ProgressView } from '../game/progression/progression-feature.ts';
import { GameSession } from '../game/session/game-session.ts';

interface LocalSession extends JournalSession {
  dispatch(command: JournalCommand | ArenaCommand | ChapterCommand): CommandResult<ChapterEvent>;
}

interface ExpeditionLedger extends Omit<InventoryPlayer, 'readPosition'> {
  readProgress(): ProgressView;
  ammo(kind: 'wand' | 'bow'): AmmoStock | null;
  spend(skillId: string): boolean;
}

interface LocalPlayer
  extends
    Omit<InventoryPlayer, 'readPosition'>,
    ProgressionPlayer,
    ExperiencePlayer,
    ChapterPlayer {
  readProgress: ExpeditionLedger['readProgress'];
  readAmmo: ExpeditionLedger['ammo'];
}

interface LocalSessionOptions {
  readonly chapter?: {
    readonly progress: ChapterProgress;
    readonly focusedTargetId: ChapterPlayer['focusedTargetId'];
  };
  readonly arena?: {
    readonly match: ExperienceMatch;
    readonly canReachWard: ExperiencePlayer['canReachWard'];
    readonly armory?: ArenaArmory;
    readonly canReachObjective?: ExperiencePlayer['canReachObjective'];
    readonly inBuyZone?: ExperiencePlayer['inBuyZone'];
  };
  readonly expedition: ExpeditionLedger;
  readonly readPosition: ChapterPlayer['readPosition'];
  readonly inventoryRules: InventoryRules;
}

export function createLocalSession({
  expedition,
  readPosition,
  inventoryRules,
  arena,
  chapter,
}: LocalSessionOptions): LocalSession {
  const inventory = createInventoryFeature(inventoryRules);
  const session = new GameSession<LocalPlayer, ChapterEvent>([
    inventory,
    progressionFeature,
    ...(chapter ? [createChapterFeature(chapter.progress)] : []),
    ...(arena ? [createExperienceFeature(arena.match, arena.armory)] : []),
  ]);
  // Bind identity here so UI commands can supply intent without choosing the acting player.
  const playerId = 'local-player';
  session.addPlayer(playerId, {
    get area() {
      return expedition.area;
    },
    readPosition,
    focusedTargetId: () => chapter?.focusedTargetId(),
    canReachWard: (id) => arena?.canReachWard(id) ?? false,
    canReachObjective: (id) => arena?.canReachObjective?.(id) ?? false,
    inBuyZone: () => arena?.inBuyZone?.() ?? false,
    readGear: expedition.readGear,
    writeGear: expedition.writeGear,
    readProgress: expedition.readProgress,
    readAmmo: expedition.ammo,
    spendSkill: expedition.spend,
  });
  return {
    dispatch: (command) => session.dispatch(playerId, command),
    readJournal() {
      const view = session.readPlayer(playerId, (player) => ({
        ...inventory.readView(player),
        ...player.readProgress(),
        ammo: { wand: player.readAmmo('wand'), bow: player.readAmmo('bow') },
      }));
      if (!view) throw new Error('Missing local player');
      return view;
    },
  };
}

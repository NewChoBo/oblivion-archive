import type { ExperienceMatch } from '../game/experiences/experience-match.ts';
import { requireElement } from './dom.ts';
import { experienceText } from '../content/locales/experience.ts';

type MatchView = ReturnType<ExperienceMatch['snapshot']>;

const timeLabel = (seconds: number) => {
  const whole = Math.ceil(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

export function createExperienceHud(element: HTMLElement) {
  const meter = requireElement(element, '#progress', HTMLElement);
  const title = requireElement(element, '#step-title', HTMLElement);
  const objective = requireElement(element, '#step-text', HTMLElement);
  const dots = requireElement(element, '#step-dots', HTMLElement);
  let previous: string | undefined;

  return {
    update(id: string, match: MatchView) {
      const time = timeLabel(match.bombSite ? match.fuseLeft : match.timeLeft);
      const seconds = match.ward ? Math.ceil(match.holdLeft) : match.holdSeconds;
      // Render at the precision the player sees, even though match timers advance every tick.
      const signature = [
        id,
        time,
        match.kills,
        match.round,
        match.wins,
        match.losses,
        match.ward,
        seconds,
        match.contested,
        match.bombSite,
        match.defusing,
        match.escorting,
        match.roundKills,
      ].join('|');
      if (previous === signature) return;
      previous = signature;
      element.setAttribute('aria-live', 'off');
      dots.hidden = true;
      title.textContent = experienceText(id);
      if (match.kind === 'score') {
        meter.textContent = experienceText('score.readout', {
          time,
          kills: match.kills,
          target: match.target,
        });
        objective.textContent = experienceText('score.description');
        return;
      }
      meter.textContent = experienceText('ward.readout', {
        time,
        round: match.round,
        wins: match.wins,
        losses: match.losses,
      });
      if (match.kind === 'bomb') {
        objective.textContent = experienceText(
          !match.bombSite ? 'bomb.choose' : match.defusing ? 'bomb.defusing' : 'bomb.active',
          { site: experienceText(match.bombSite ?? ''), seconds: Math.ceil(match.fuseLeft) },
        );
        return;
      }
      if (match.kind === 'rescue') {
        objective.textContent = experienceText(match.escorting ? 'rescue.escort' : 'rescue.choose');
        return;
      }
      if (match.kind === 'elimination') {
        objective.textContent = experienceText('elimination.remaining', match);
        return;
      }
      const detail = !match.ward ? 'choose' : match.contested ? 'contested' : 'holding';
      objective.textContent = experienceText(`ward.${detail}`, {
        seconds,
        ward: experienceText(match.ward ?? ''),
      });
    },
    restoreChapter() {
      if (previous === undefined) return;
      previous = undefined;
      element.setAttribute('aria-live', 'polite');
      dots.hidden = false;
    },
  };
}

export function describeExperienceResult(match: MatchView) {
  if (!match.result) throw new Error('Missing match result');
  const betweenRounds = match.phase === 'between-rounds';
  const category = betweenRounds ? 'round' : 'match';
  const winning =
    match.kind === 'ward' && !betweenRounds ? match.wins >= match.target : match.result.won;
  const stats = match.kind === 'score' ? 'score' : 'rounds';
  return {
    title: experienceText(`${category}.${winning ? 'won' : 'lost'}`),
    detail: `${experienceText(`reason.${match.result.reason}`)} ${experienceText(`result.${stats}`, match)}`,
    action: experienceText(betweenRounds ? 'result.next' : 'result.replay'),
  };
}

export type CarvingRevelationPowerUpActivationPhase = 'carve' | 'guess' | 'any';

export type CarvingRevelationPowerUpKind =
  | 'skip_turns'
  | 'view_thief'
  | 'ethereal_line'
  | 'name_reveal'
  | 'smoke_screen'
  | 'double_line'
  | 'shuffle'
  | 'insight';

export type CarvingRevelationPowerUpDefinition = {
  kind: CarvingRevelationPowerUpKind;
  name: string;
  description: string;
  activationPhase: CarvingRevelationPowerUpActivationPhase;
};

export const CARVING_REVELATION_POWER_UP_DEFINITIONS: readonly CarvingRevelationPowerUpDefinition[] = [
  { kind: 'skip_turns', name: 'Skip Turn', description: "Skip the other players' next guessing turn.", activationPhase: 'carve' },
  { kind: 'view_thief', name: 'View Thief', description: 'Your next carving phase is revealed only to you.', activationPhase: 'guess' },
  { kind: 'ethereal_line', name: 'Ethereal Line', description: 'Your next line is twice as long and private, with only its outline shown to others.', activationPhase: 'guess' },
  { kind: 'name_reveal', name: 'Name Reveal', description: 'Reveal the champion name to yourself after this phase ends.', activationPhase: 'any' },
  { kind: 'smoke_screen', name: 'Smoke Screen', description: 'Hide the currently revealed canvas for two rounds and block others from carving over it.', activationPhase: 'guess' },
  { kind: 'double_line', name: 'Double Line', description: 'Submit two lines next carve: the second is private to you.', activationPhase: 'guess' },
  { kind: 'shuffle', name: 'Shuffle', description: "Move this phase's completed carves to new random positions.", activationPhase: 'guess' },
  { kind: 'insight', name: 'Insight', description: 'Reveal a new random square of the canvas during every guessing phase.', activationPhase: 'carve' },
];

export const MAX_CARVING_REVELATION_POWER_UP_COUNT = CARVING_REVELATION_POWER_UP_DEFINITIONS.length;

export function getCarvingRevelationPowerUpDefinition(kind: unknown) {
  return CARVING_REVELATION_POWER_UP_DEFINITIONS.find((definition) => definition.kind === kind) ?? null;
}

export function canActivateCarvingRevelationPowerUp(
  kind: CarvingRevelationPowerUpKind,
  phase: 'carve' | 'guess',
) {
  const definition = getCarvingRevelationPowerUpDefinition(kind);
  return Boolean(definition && (definition.activationPhase === 'any' || definition.activationPhase === phase));
}

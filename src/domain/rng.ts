import type {
  Intervention,
  InterventionDiff,
  MatchCode,
  Placement,
  TacticalDirectives,
  WorldSeed,
} from "./types";

const DIRECTIVE_KEYS: readonly (keyof TacticalDirectives)[] = [
  "defensiveLine",
  "pressing",
  "tempo",
  "attackRoute",
  "mindset",
];

const POSITION_EPSILON = 0.5;

export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function createRng(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function deriveWorldSeed(
  scenarioId: string,
  attemptIndex: number,
  deck: readonly string[],
  engineVersion: string,
  dataVersion: string,
): WorldSeed {
  if (deck.length === 0) {
    throw new RangeError("공개 시드 덱은 비어 있을 수 없습니다.");
  }

  const deckIndex = ((attemptIndex % deck.length) + deck.length) % deck.length;
  const publishedSeed = deck[deckIndex];

  if (publishedSeed === undefined) {
    throw new RangeError("공개 시드 덱에서 시드를 찾을 수 없습니다.");
  }

  return { scenarioId, attemptIndex, publishedSeed, engineVersion, dataVersion };
}

export function worldDraw(world: WorldSeed, namespace: string, minute: number): number {
  return createRng(JSON.stringify(["world", normalizeWorld(world), namespace, minute]))();
}

export function decisionDraw(
  world: WorldSeed,
  actionFingerprint: string,
  namespace: string,
  minute: number,
): number {
  return createRng(
    JSON.stringify(["decision", normalizeWorld(world), actionFingerprint, namespace, minute]),
  )();
}

export function fingerprintIntervention(iv: Intervention): string {
  const placements = [...iv.placements]
    .sort(comparePlacements)
    .map(({ playerId, slot }) => [playerId, slot.x, slot.y]);
  const substitutions = [...iv.substitutions]
    .sort((left, right) => left.outId.localeCompare(right.outId) || left.inId.localeCompare(right.inId))
    .map(({ outId, inId }) => [outId, inId]);

  return JSON.stringify({
    directives: DIRECTIVE_KEYS.map((key) => [key, iv.directives[key]]),
    formation: iv.formation,
    placements,
    substitutions,
  });
}

export function diffIntervention(
  prev: Pick<Intervention, "directives" | "formation" | "placements">,
  next: Intervention,
): InterventionDiff {
  const changedDirectives = DIRECTIVE_KEYS.filter(
    (key) => prev.directives[key] !== next.directives[key],
  );
  const formationChanged = prev.formation !== next.formation;
  const movedPlayerIds = findMovedPlayers(prev.placements, next.placements);
  const substitutionCount = next.substitutions.length;

  return {
    changedDirectives,
    formationChanged,
    movedPlayerIds,
    substitutionCount,
    isNoOp:
      changedDirectives.length === 0 &&
      !formationChanged &&
      movedPlayerIds.length === 0 &&
      substitutionCount === 0,
  };
}

export function buildMatchCode(world: WorldSeed): MatchCode {
  return {
    scenarioId: world.scenarioId,
    attemptIndex: world.attemptIndex,
    engineVersion: world.engineVersion,
    dataVersion: world.dataVersion,
    seedChecksum: checksumWorld(world),
  };
}

export function formatMatchCode(code: MatchCode): string {
  return [
    "RM1",
    encodeCodePart(code.scenarioId),
    String(code.attemptIndex),
    encodeCodePart(code.engineVersion),
    encodeCodePart(code.dataVersion),
    code.seedChecksum.toLowerCase(),
  ].join(".");
}

export function parseMatchCode(text: string): MatchCode | null {
  const match = /^RM1\.(~[^.]*)\.(-?\d+)\.(~[^.]*)\.(~[^.]*)\.([0-9a-fA-F]{32})$/.exec(text);

  if (match === null) {
    return null;
  }

  const [, scenarioPart, attemptPart, enginePart, dataPart, checksum] = match;
  if (
    scenarioPart === undefined ||
    attemptPart === undefined ||
    enginePart === undefined ||
    dataPart === undefined ||
    checksum === undefined
  ) {
    return null;
  }

  const scenarioId = decodeCodePart(scenarioPart);
  const engineVersion = decodeCodePart(enginePart);
  const dataVersion = decodeCodePart(dataPart);
  const attemptIndex = Number(attemptPart);

  if (
    scenarioId === null ||
    engineVersion === null ||
    dataVersion === null ||
    !Number.isSafeInteger(attemptIndex)
  ) {
    return null;
  }

  return {
    scenarioId,
    attemptIndex,
    engineVersion,
    dataVersion,
    seedChecksum: checksum.toLowerCase(),
  };
}

export function canReplay(
  code: MatchCode,
  current: { engineVersion: string; dataVersion: string },
): { ok: true } | { ok: false; reason: string } {
  if (code.engineVersion !== current.engineVersion) {
    return {
      ok: false,
      reason: `엔진 버전 ${code.engineVersion}이 현재 버전 ${current.engineVersion}과 달라 재생할 수 없습니다.`,
    };
  }

  if (code.dataVersion !== current.dataVersion) {
    return {
      ok: false,
      reason: `데이터 버전 ${code.dataVersion}이 현재 버전 ${current.dataVersion}과 달라 재생할 수 없습니다.`,
    };
  }

  return { ok: true };
}

function normalizeWorld(world: WorldSeed): readonly [string, number, string, string, string] {
  return [
    world.scenarioId,
    world.attemptIndex,
    world.publishedSeed,
    world.engineVersion,
    world.dataVersion,
  ];
}

function comparePlacements(left: Placement, right: Placement): number {
  return (
    left.playerId.localeCompare(right.playerId) ||
    left.slot.x - right.slot.x ||
    left.slot.y - right.slot.y
  );
}

function findMovedPlayers(prev: readonly Placement[], next: readonly Placement[]): string[] {
  const previousById = new Map(prev.map((placement) => [placement.playerId, placement.slot]));
  const nextById = new Map(next.map((placement) => [placement.playerId, placement.slot]));
  const playerIds = new Set([...previousById.keys(), ...nextById.keys()]);

  return [...playerIds]
    .filter((playerId) => {
      const before = previousById.get(playerId);
      const after = nextById.get(playerId);
      return (
        before === undefined ||
        after === undefined ||
        Math.abs(before.x - after.x) > POSITION_EPSILON ||
        Math.abs(before.y - after.y) > POSITION_EPSILON
      );
    })
    .sort((left, right) => left.localeCompare(right));
}

function checksumWorld(world: WorldSeed): string {
  const normalized = JSON.stringify(normalizeWorld(world));
  return [0, 1, 2, 3]
    .map((salt) => hashSeed(`${salt}:${normalized}`).toString(16).padStart(8, "0"))
    .join("");
}

function encodeCodePart(value: string): string {
  return `~${encodeURIComponent(value).replace(/\./g, "%2E")}`;
}

function decodeCodePart(value: string): string | null {
  try {
    return decodeURIComponent(value.slice(1));
  } catch {
    return null;
  }
}

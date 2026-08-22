/**
 * Machine-readable provenance for every FitCoach v0.4 starter exercise asset.
 *
 * Every active asset is a local, project-owned premium illustration created
 * specifically for FitCoach. Earlier SVG placeholders remain unreferenced in
 * the repository only as rollback material.
 */

export const GENERATED_ILLUSTRATION_POLICY = Object.freeze({
  license: "FitCoach project-authored original; all rights reserved by the FitCoach project owner.",
  licenseSource: "The generated PNG source file stored at the declared local path in this repository.",
  attributionRequired: false,
  attribution: null,
  creationSource:
    "Original premium exercise illustration generated for FitCoach with OpenAI image generation from a FitCoach-owned art-direction prompt; no competitor source asset.",
  temporaryOriginal: true,
  verifiedOn: "2026-08-20",
});

function ownedGeneratedPng({ id, exerciseId, file, view, alt, bytes, sha256 }) {
  return Object.freeze({
    id,
    exerciseId,
    type: "png-two-position-guide",
    path: `/fitcoach-founder-test/v040/assets/exercises/${file}`,
    width: 1448,
    height: 1086,
    view,
    alt,
    offlineCachePolicy: "precache",
    ...GENERATED_ILLUSTRATION_POLICY,
    bytes,
    sha256,
  });
}

export const EXERCISE_MEDIA_MANIFEST = Object.freeze([
  ownedGeneratedPng({
    id: "air-squat-poster",
    exerciseId: "air-squat",
    file: "air-squat-premium-v1.png",
    view: "front three-quarter",
    alt: "Premium two-position illustration of a bodyweight squat from standing to the lowered position.",
    bytes: 1519174,
    sha256: "e976a7192649237026041eccd798abdee7ad8475c80412c2e20ec6f3f4f195ba",
  }),
  ownedGeneratedPng({
    id: "goblet-squat-poster",
    exerciseId: "goblet-squat",
    file: "goblet-squat-premium-v1.png",
    view: "front three-quarter",
    alt: "Premium two-position illustration of a goblet squat while holding one dumbbell at the chest.",
    bytes: 1289961,
    sha256: "c60d3eaafd39144543ba4678644d37f798725b64f14f856ed61bf68f239949cb",
  }),
  ownedGeneratedPng({
    id: "hip-hinge-poster",
    exerciseId: "hip-hinge",
    file: "hip-hinge-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a hip hinge from upright to hips back.",
    bytes: 1045623,
    sha256: "3094559351c134dd937520a774f4f74ceadc6dcb83e66aa9aeb549812df1c344",
  }),
  ownedGeneratedPng({
    id: "glute-bridge-poster",
    exerciseId: "glute-bridge",
    file: "glute-bridge-premium-v1.png",
    view: "side",
    alt: "Premium two-position floor illustration of a glute bridge with hips lowered and raised.",
    bytes: 1010631,
    sha256: "94f8e904037a7f75f0454a45a0c6579400d129e16c713cf4d3451cf1f6fc5a5c",
  }),
  ownedGeneratedPng({
    id: "incline-push-up-poster",
    exerciseId: "incline-push-up",
    file: "incline-push-up-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of an incline push-up against a raised surface.",
    bytes: 1074398,
    sha256: "b10315212a99164ec2bae7317160ccf6aab7c5584e09e7f9a70281b078b4d353",
  }),
  ownedGeneratedPng({
    id: "dumbbell-floor-press-poster",
    exerciseId: "dumbbell-floor-press",
    file: "dumbbell-floor-press-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a floor press from bent elbows to arms extended.",
    bytes: 1179822,
    sha256: "e166d58b1d7a17772d820bc5a873ed55e908dec1e6285548bf86192354e0c8f8",
  }),
  ownedGeneratedPng({
    id: "band-row-poster",
    exerciseId: "band-row",
    file: "band-row-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a seated band row from arms extended to band drawn in.",
    bytes: 1481534,
    sha256: "0f6aa3d2d38de1e9a905d893c12bdf7e8ad794c59d5baa0b33a08ae52d224f97",
  }),
  ownedGeneratedPng({
    id: "one-arm-dumbbell-row-poster",
    exerciseId: "one-arm-dumbbell-row",
    file: "one-arm-dumbbell-row-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a supported one-arm dumbbell row.",
    bytes: 1415196,
    sha256: "b185784c67fddd981693775863195e35fdcee9540290bc695d26e5e733384bca",
  }),
  ownedGeneratedPng({
    id: "half-kneeling-press-poster",
    exerciseId: "half-kneeling-press",
    file: "half-kneeling-press-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of a half-kneeling dumbbell press to overhead.",
    bytes: 1247567,
    sha256: "09dd3269235e75b48b711f795cc31823241e04bdd69136ce0fc8b8f5a418e535",
  }),
  ownedGeneratedPng({
    id: "band-lat-pulldown-poster",
    exerciseId: "band-lat-pulldown",
    file: "band-lat-pulldown-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of a band pulldown from overhead to upper chest height.",
    bytes: 1091679,
    sha256: "7ebe1e2827243e8a3cf6e146a3de2752b1ec5c187d0f39da5d45c128a1a7f39d",
  }),
  ownedGeneratedPng({
    id: "reverse-lunge-poster",
    exerciseId: "reverse-lunge",
    file: "reverse-lunge-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a reverse lunge from standing to a lowered split stance.",
    bytes: 1275482,
    sha256: "2acb0585a1a760be1bdcb333f0fcd45c9e907c006607db8bf8def0ba23eea211",
  }),
  ownedGeneratedPng({
    id: "dumbbell-curl-poster",
    exerciseId: "dumbbell-curl",
    file: "dumbbell-curl-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of a dumbbell curl from arms down to elbows bent.",
    bytes: 1449187,
    sha256: "e91a3c1e3bcb026896cfad89bc164092af9af5e76bf2b7cdb5961d347421cc7a",
  }),
  ownedGeneratedPng({
    id: "overhead-triceps-extension-poster",
    exerciseId: "overhead-triceps-extension",
    file: "overhead-triceps-extension-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of a dumbbell triceps extension behind the head and overhead.",
    bytes: 1155027,
    sha256: "db50910f3f8c09bcea35bffa49ace43d29fbf4b4a57e8ad3a7199c17840d1f4c",
  }),
  ownedGeneratedPng({
    id: "lateral-raise-poster",
    exerciseId: "lateral-raise",
    file: "lateral-raise-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of dumbbells moving from the sides to shoulder height.",
    bytes: 1222917,
    sha256: "b6ce34f265518f5f25e05c456f29f24709e310321499612c87427a0fbce9117b",
  }),
  ownedGeneratedPng({
    id: "dead-bug-poster",
    exerciseId: "dead-bug",
    file: "dead-bug-premium-v1.png",
    view: "side",
    alt: "Premium two-position floor illustration of opposite arm and leg extending in a dead bug.",
    bytes: 1487150,
    sha256: "80074c825b924ce4aa700fb8112e7ba7038b8ba5f553fe39acd83524d6f4ea5b",
  }),
  ownedGeneratedPng({
    id: "marching-jacks-poster",
    exerciseId: "marching-jacks",
    file: "marching-jacks-premium-v1.png",
    view: "front",
    alt: "Premium two-position illustration of a low-impact marching jack with raised arms and one knee.",
    bytes: 1099493,
    sha256: "7d6ca533e9c7db0bf2971073a7bd606f209c02b2c0f8296d648e598a0f66c765",
  }),
  ownedGeneratedPng({
    id: "barbell-bench-press-poster",
    exerciseId: "barbell-bench-press",
    file: "barbell-bench-press-premium-v1.png",
    view: "side",
    alt: "Premium two-position illustration of a barbell bench press from arms extended to the bar lowered under control.",
    bytes: 1336008,
    sha256: "3d950123e188ab681efda9c44a367ebb23352e5d2a20215c60c469ac70af4057",
  }),
]);

const groupedMedia = new Map();
for (const entry of EXERCISE_MEDIA_MANIFEST) {
  const media = groupedMedia.get(entry.exerciseId) || [];
  media.push(entry);
  groupedMedia.set(entry.exerciseId, media);
}
const MEDIA_BY_EXERCISE = new Map(
  [...groupedMedia].map(([exerciseId, entries]) => [exerciseId, Object.freeze(entries)]),
);

/** @param {string} exerciseId */
export function getExerciseMedia(exerciseId) {
  return MEDIA_BY_EXERCISE.get(exerciseId) || Object.freeze([]);
}

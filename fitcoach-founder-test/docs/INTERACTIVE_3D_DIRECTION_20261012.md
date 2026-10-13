# Interactive 3D direction for the one-month release

Owner direction: Mohammed asked on 12 October for interactive 3D that makes FitCoach feel premium, easy and useful. Every existing feature remains in scope. This document is a product/acceptance direction, not a claim that the scenes are implemented or approved.

## First two flagship interactions

### Exercise technique viewer

Place a touch-rotatable athlete in the existing exercise-detail hero and make the same guide accessible beside the active workout. Users can switch front/side/back, pause, scrub one repetition and choose half speed. A clear target-muscle control shows the trained regions. Keep current instructions, mistakes, muscle labels and reviewed media available.

Start with the existing squat/curl/incline-push-up Blender pilot direction and one consistent athlete, outfit, equipment, lighting and camera treatment. All 100 exercises keep their existing guide coverage while additional reviewed 3D movements are produced. Do not substitute an unreviewed rig for current guide assets. This is a technique demonstration; it does not assess the user's form or make measurements from a camera.

Acceptance: the complete body and equipment stay framed on phones; rotation does not steal vertical page scrolling; explicit front/side/back buttons work without drag; play/pause/speed/scrub controls correspond to actual animation time; target highlights follow curated muscle metadata. Movement/art/asset-rights review and real-phone performance precede publication.

### Shared body-focus selector

Use one anatomical asset across the existing conversational onboarding body-focus question, exercise-detail muscle view and profile focus controls. Tap a region or the current labelled chips to select it. Selected regions illuminate in Symbio blue; front/back controls make orientation obvious. Preserve the existing selection limit and full-body behavior.

Acceptance: mesh selection and labelled controls always agree, selection survives navigation, small targets have larger accessible controls, neutral/selected appearances are legible in both themes, and no effect obscures anatomical boundaries. The anatomy view communicates training emphasis, not a medical diagnosis or a personal body scan.

## Smaller touches across the retained app

| Surface | Useful interaction | Delivery priority |
| --- | --- | --- |
| Coach / Voice Room | A restrained 3D presence indicator driven by the real idle/listening/thinking/speaking/interrupted states. Tapping it uses the existing interrupt/resume controls. | After the two flagship interactions; no fabricated connected/voice state. |
| Today | A compact training-path/progress object tied to the actual current plan and completed session. Tapping a step opens or resumes that session. | Small addition if it improves navigation in beta. |
| Food | A portion-reference viewer tied to real serving units and editable amounts from a verified food record. | Validate separately; never infer exact grams/calories from an attractive plate image. |
| Progress | A small milestone object that opens the actual sessions supporting a personal record or achievement. | Preserve clear charts and history; reward real logged progress. |

Keep primary navigation, numbers and controls immediately readable. 3D surfaces should explain an action, state or movement and share a consistent art direction. Spread the visual language across the app while prioritizing the two interactions that reduce user uncertainty.

## Mobile quality and performance acceptance

- Load a clear poster immediately, then load the scene on demand. Proposed initial compressed scene budget: 3 MiB; measure actual decode/GPU memory and revise from target-phone evidence.
- Keep one active scene at a time. Pause rendering when hidden/backgrounded and release its GPU resources after leaving the view. Share cached assets between body-focus surfaces.
- Target smooth interaction at 30 fps on the oldest supported phones; reduce detail/effects before allowing controls to lag. Measure thermal/battery impact and memory recovery during beta.
- Respect reduced-motion preferences, support keyboard and labelled touch controls, and provide the existing poster/video guide if WebGL or an asset fails.
- Use consistent blue/navy materials and lighting that work in both light and dark themes. Avoid glare, heavy bloom or effects that obscure anatomy and text.
- Verify asset rights, movement accuracy, mobile framing, loading/error recovery and playback before marking a scene ready. The September curl study explicitly needs an art pass and is not production-approved.

## Release sequencing

Continue data/native/mobile reliability now. Develop a representative body-focus and exercise-viewer scene next, review it at phone size, then reuse that art/interaction system. Evaluate the smaller touches in beta against actual usability and loading cost. The 12 November target does not authorize feature removal or lower quality gates.

Implementation candidates to evaluate against these criteria: [model-viewer](https://modelviewer.dev/) for a focused animated model viewer, or [Three.js](https://threejs.org/docs/) for custom mesh selection and shared scene control. These are choices for the prototype, not installed dependencies or an architecture migration in this checkpoint.

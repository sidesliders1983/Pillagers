# Fjordside social encounters (#48)

Meshy residents reserve exclusive pairs when their approaching routes predict a personal-space conflict. They stop before contact, turn toward each other and play Talk_Passionately / Listening_Gesture for five simulation seconds. The annual pause freezes both movement and encounter time. Destinations remain unchanged. A three-second cooldown and pair separation requirement prevent immediate repeat encounters.

MovementSystem owns navigation and pair reservations. MeshyHuman owns animation playback and existing crossfades. Legacy bodies without social clips use avoidance only. Busy residents and third parties sidestep or yield. Continuous segment checks prevent stepping across another resident's configured radius. Spawn and persona replacement also respect personal space and release old encounters.

Tuning is centralized in residentMovementConfig (radius, speed, conversation distance/duration, cooldown, separation, prediction and turning speed). The default radius is 0.48 m. The world debug metrics show state, partner and cooldown; canvas data-interactions also contains the configured radius. No rigid-body physics, group conversations or pathfinding rewrite is introduced.

Validation: deterministic head-on encounter timing/facing/route restoration; busy sidestepping; third-party avoidance; paused time; persona replacement; ten residents for 120 simulation seconds with pair ownership and separation checks; existing navigation and Meshy runtime tests; browser smoke check and production build.

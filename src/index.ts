/** Programmatic API: the same building blocks the CLI uses. */
export { init, installSkills } from './init.js';
export { discover } from './discover/index.js';
export { runRecipes, locateRecipe, listRecipes } from './run.js';
export { refresh } from './refresh.js';
export { libraryStatus } from './status.js';
export { addImage } from './add.js';
export { composeBoard, layoutBoard, splitFrames } from './board.js';
export { composeAdHocBoard } from './boardcmd.js';
export { openStore, resolveStore } from './store.js';
export { writeIndex } from './indexfile.js';
export type { Recipe, Step, Locator, ShotSpec } from './recipe.js';
export type { Capture, Manifest } from './manifest.js';
export type { Plan, PlanItem } from './plan.js';
export type { Config } from './config.js';

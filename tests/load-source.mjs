import {loadTypeScript} from '../scripts/load-typescript.mjs';
export function load(path){return loadTypeScript(new URL(path,import.meta.url));}

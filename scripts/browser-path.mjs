// Browser used by the headless check scripts. Override with BROWSER_PATH (or the old EDGE_PATH);
// otherwise the first installed one of Chrome / Edge is used. Forward slashes work on Windows too.
import { existsSync } from 'node:fs'

const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]

export const browserPath = () => process.env.BROWSER_PATH || process.env.EDGE_PATH || candidates.find(existsSync) || candidates[0]

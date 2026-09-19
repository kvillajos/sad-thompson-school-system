// Runnable checks for the two logout clocks: npm run check:timeout
import assert from 'node:assert/strict'
import { createSessionTimeout, INACTIVITY_TIMEOUT_MS, BACKGROUND_TIMEOUT_MS } from '../session-timeout.js'

const MINUTE = 60 * 1000

// ponytail: hand-rolled clock + timer registry so the clocks can be driven without a
// browser; only the timer APIs createSessionTimeout touches are stubbed.
function world({ hidden = false } = {}) {
  let clock = 0
  let nextId = 1
  let timeouts = 0
  const timers = new Map()
  const store = new Map()
  const register = (repeat) => (fn, delay) => {
    const id = nextId
    nextId += 1
    timers.set(id, { fn, at: clock + delay, repeat })
    return id
  }
  const runner = {
    get clock() { return clock },
    get timeouts() { return timeouts },
    setHidden(value) { hidden = value },
    // Simulates a starved background timeout so the minute watch has to catch it.
    dropOnce() {
      const entry = [...timers.entries()].find(([, timer]) => !timer.repeat)
      if (entry) timers.delete(entry[0])
    },
    // Runs every timer that is due, oldest first, like an event loop tick.
    advance(ms) {
      const target = clock + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        const [id, timer] = due
        clock = Math.max(clock, timer.at)
        if (timer.repeat) timer.at = clock + timer.repeat
        else timers.delete(id)
        timer.fn()
      }
      clock = target
    }
  }
  const sessionTimeout = createSessionTimeout({
    onTimeout: () => { timeouts += 1 },
    isHidden: () => hidden,
    store: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    now: () => clock,
    schedule: register(false),
    cancel: (id) => timers.delete(id),
    watch: register(true),
    unwatch: (id) => timers.delete(id)
  })
  return { runner, store, sessionTimeout }
}

// 1. Visible tab, no interaction for 30 minutes: signed out.
{
  const { runner, sessionTimeout } = world()
  sessionTimeout.start()
  runner.advance(INACTIVITY_TIMEOUT_MS - 1000)
  assert.equal(runner.timeouts, 0, 'must not sign out before 30 idle minutes')
  runner.advance(1000)
  assert.equal(runner.timeouts, 1, 'must sign out after 30 idle minutes in front')
}

// 2. Hidden tab: activity does not reset anything and the 4-hour clock still fires.
{
  const { runner, sessionTimeout } = world()
  sessionTimeout.start()
  runner.setHidden(true)
  sessionTimeout.visibilityChanged()
  runner.advance(60 * MINUTE)
  sessionTimeout.resetInactivity() // clicks can still arrive from a background tab
  runner.advance(BACKGROUND_TIMEOUT_MS - 61 * MINUTE)
  assert.equal(runner.timeouts, 0, 'background activity must not shorten or extend the 4 hours')
  runner.advance(MINUTE)
  assert.equal(runner.timeouts, 1, 'hidden for 4 hours must end the session')
}

// 3. Returning to the front cancels the background clock and restarts the idle clock.
{
  const { runner, sessionTimeout } = world()
  sessionTimeout.start()
  runner.setHidden(true)
  sessionTimeout.visibilityChanged()
  runner.advance(2 * 60 * MINUTE)
  runner.setHidden(false)
  sessionTimeout.visibilityChanged()
  runner.advance(INACTIVITY_TIMEOUT_MS - 1000)
  assert.equal(runner.timeouts, 0, 'the 4-hour clock must be cancelled on return')
  runner.advance(1000)
  assert.equal(runner.timeouts, 1)
}

// 4. A page loaded after 4 hours hidden signs out immediately.
{
  const { runner, store, sessionTimeout } = world({ hidden: true })
  store.set('tcsms_background_since', String(-BACKGROUND_TIMEOUT_MS))
  sessionTimeout.start()
  assert.equal(runner.timeouts, 1, 'a stale background marker must end the session on load')
}

// 5. Same for a stale foreground marker.
{
  const { runner, store, sessionTimeout } = world()
  store.set('tcsms_last_activity', String(-INACTIVITY_TIMEOUT_MS))
  sessionTimeout.start()
  assert.equal(runner.timeouts, 1)
}

// 6. Starved background timeout: the minute watch still ends the session.
{
  const { runner, sessionTimeout } = world()
  runner.setHidden(true)
  sessionTimeout.start()
  runner.dropOnce()
  runner.advance(BACKGROUND_TIMEOUT_MS + 2 * MINUTE)
  assert.equal(runner.timeouts, 1, 'the minute watch must catch a starved timeout')
}

// 7. Signing out clears both markers, so nothing lingers for the next session.
{
  const { runner, store, sessionTimeout } = world()
  sessionTimeout.start()
  sessionTimeout.stop()
  assert.equal(store.get('tcsms_last_activity'), undefined)
  assert.equal(store.get('tcsms_background_since'), undefined)
  runner.advance(BACKGROUND_TIMEOUT_MS + INACTIVITY_TIMEOUT_MS)
  assert.equal(runner.timeouts, 0)
}

console.log('session timeout checks passed')

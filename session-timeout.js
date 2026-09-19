// The two logout clocks, kept free of app imports so scripts/check-session-timeout.mjs
// can drive them with a fake clock in Node.
//
// Why two: a backgrounded tab fires no activity events, so the 30-minute inactivity
// clock alone would either sign the user out while they are away or never fire at all.
// Foreground: 30 minutes with no interaction. Background: 4 hours hidden.
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
export const BACKGROUND_TIMEOUT_MS = 4 * 60 * 60 * 1000
const BACKGROUND_WATCH_MS = 60 * 1000

export function createSessionTimeout({
  onTimeout,
  isHidden = () => document.hidden,
  store = sessionStorage,
  now = Date.now,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  watch = (fn, ms) => setInterval(fn, ms),
  unwatch = (id) => clearInterval(id)
}) {
  let inactivityTimer
  let backgroundTimer
  let backgroundWatch

  // Markers are epoch millis, so they are read back as null (missing) or a number.
  const marker = (key) => {
    const raw = store.getItem(key)
    return raw == null ? null : Number(raw)
  }

  const stop = () => {
    cancel(inactivityTimer)
    cancel(backgroundTimer)
    unwatch(backgroundWatch)
    inactivityTimer = backgroundTimer = backgroundWatch = undefined
    store.removeItem('tcsms_last_activity')
    store.removeItem('tcsms_background_since')
  }

  const endSession = () => { stop(); onTimeout() }

  // A hidden tab never fires activity events, so activity must not touch either clock.
  const resetInactivity = () => {
    if (isHidden()) return
    store.setItem('tcsms_last_activity', String(now()))
    cancel(inactivityTimer)
    inactivityTimer = schedule(endSession, INACTIVITY_TIMEOUT_MS)
  }

  // Hidden tabs clamp timers to roughly one tick a minute, so the timeout lands the exact
  // 4-hour boundary and the minute watch is the safety net if the browser starves it.
  const startBackground = (since) => {
    cancel(backgroundTimer)
    unwatch(backgroundWatch)
    store.setItem('tcsms_background_since', String(since))
    const remaining = BACKGROUND_TIMEOUT_MS - (now() - since)
    if (remaining <= 0) return endSession()
    backgroundTimer = schedule(endSession, remaining)
    backgroundWatch = watch(() => {
      const startedAt = marker('tcsms_background_since')
      if (startedAt != null && now() - startedAt >= BACKGROUND_TIMEOUT_MS) endSession()
    }, BACKGROUND_WATCH_MS)
  }

  const stopBackground = () => {
    cancel(backgroundTimer)
    unwatch(backgroundWatch)
    backgroundTimer = backgroundWatch = undefined
    store.removeItem('tcsms_background_since')
  }

  // Called on visibilitychange: swapping between the two clocks keeps the promise that a
  // visible tab logs out after 30 idle minutes and a hidden one after 4 hours.
  const visibilityChanged = () => {
    if (isHidden()) {
      cancel(inactivityTimer)
      startBackground(now())
      return
    }
    stopBackground()
    resetInactivity()
  }

  // Used on page load: a marker older than its limit means the session is already over.
  const start = () => {
    const lastActivity = marker('tcsms_last_activity')
    if (lastActivity != null && now() - lastActivity >= INACTIVITY_TIMEOUT_MS) return endSession()
    const backgroundSince = marker('tcsms_background_since')
    if (backgroundSince != null && now() - backgroundSince >= BACKGROUND_TIMEOUT_MS) return endSession()
    if (isHidden()) startBackground(backgroundSince ?? now())
    else resetInactivity()
  }

  return { start, resetInactivity, visibilityChanged, stop }
}

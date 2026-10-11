# Keeping the campaign screen awake

The campaign toolbars on `/fjord-play`, `/play` and `/gameplay-lab` have a **Keep screen awake**
button. Tap it once after opening the page. When enabled, the button becomes **Allow screen
sleep**, and the status reads **Screen awake**. Tap again to release it. Starting or pausing
simulation time is independent of this setting. Advancing a Winter and normal UI refreshes
retain it. Reloading or navigating to another route starts with the setting off again.

The feature uses the browser's Screen Wake Lock API where available. That API requires a
secure context (HTTPS, or localhost) and a visible document. Safari added it in iOS/iPadOS
16.4. The current `http://192.168.68.104:5180` LAN address is not a secure context, so it uses
NoSleep.js 0.12.0's embedded inline media fallback instead. The fallback starts directly from
the button's touch/click gesture and has no visible video player or remote media requests.

Leaving the tab or page releases the lock or pauses the compatibility media. Returning to
an opted-in visible page requests it again, including a page restored from the browser's
back/forward cache. If the browser denies a request, ends a native lock, or prevents media
from resuming, the status says so and the button lets the user retry. Background tabs and
system restrictions are not overridden. Real media playback is not proof that a particular
physical iPad will suppress automatic lock; that still needs testing on that device.

This is a transient browser preference. It changes no Simulation Core commands, time,
resources, RNG, saves or campaign rules. The control uses the existing toolbars and a 44px
minimum touch target.

## Sources and license

- [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [WebKit: Safari 16.4 features](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [NoSleep.js source and gesture requirement](https://github.com/richtr/NoSleep.js)
- NoSleep.js is MIT licensed; its copyright and license are distributed in
  [public/licenses/nosleep.js.txt](../public/licenses/nosleep.js.txt).

## QA

[Browser report](qa/screen-awake/report.md). Run `node scripts/qa/check-screen-awake.mjs` against
the running LAN server. `QA_LAN_ORIGIN` can replace the HTTP LAN origin and `QA_ORIGIN` the
localhost origin. `PLAYWRIGHT_MODULE` can point to another installed Playwright runtime.

For physical iPad Safari verification, open the LAN campaign, tap **Keep screen awake**, and
leave the foreground page untouched beyond the device's configured auto-lock interval.
Then tap **Allow screen sleep** and confirm normal auto-lock returns. Also switch away and
back; retry if the browser displays an unavailable status. Physical verification remains
pending until this has actually been observed.

# Native visibility proof on the frozen night3 delivery

The corrected real-product proof passes at desktop 1440×900 and phone 390×844 touch emulation. It uses the unchanged frozen night3 source and actual partial night maps. It records no video and performs no raw readback during departure. Screenshots before and after the event show the actual product flow.

| Viewport | Native action | Same window | Hidden state | Saved record |
|---|---|---|---|---|
| Desktop | Activate a second browser tab | Both targets use window 1203029726 | `document.hidden: true`; trusted `visibilitychange` | `went_out / left` |
| Phone emulation | Activate a second browser tab | Both targets use window 1203029729 | `document.hidden: true`; trusted `visibilitychange` | `went_out / left` |

Both event histories show native blur, then hidden visibility, followed by focus/visible events on return. No window-minimize fallback was needed. No synthetic DOM events, visibility property overrides or product-source modifications were used. Both contexts ran on Apple M1 ANGLE Metal, with zero page/console errors, zero failed HTTP responses and unchanged source/asset fingerprints.

[Desktop before](../../../artifacts/snow-journey/after-night3-native-hidden-corrected/desktop-en/burning-settled.png) · [Desktop result](../../../artifacts/snow-journey/after-night3-native-hidden-corrected/desktop-en/result-native-hidden.png) · [Phone before](../../../artifacts/snow-journey/after-night3-native-hidden-corrected/phone-zh/burning-settled.png) · [Phone result](../../../artifacts/snow-journey/after-night3-native-hidden-corrected/phone-zh/result-native-hidden.png) · [Exact event histories, window IDs and API records](../../../artifacts/snow-journey/after-night3-native-hidden-corrected/report.json)

The earlier capture failure was caused by the automation fixture. Installed Playwright enables focus/visibility emulation through its original CDP session. Sending `Emulation.setFocusEmulationEnabled(false)` through a newly attached session changed native focus but left the original session's visibility override active. The corrected capture helper disables the override through the owning primary session. A protocol check confirms that this restores native hidden visibility both with and without video; screencast was not the cause of the failed checks in this environment.

The earlier desktop wait-for-result timeout, the earlier phone focus-only event, and the unsuccessful secondary-session no-video experiment remain preserved. They are invalid hidden-state evidence and are not product failures. The original phone's focus-loss record is still a real `went_out / left` result, while its native hidden coverage comes from this corrected proof.

The native departure naturally fires blur before visibility changes. This proves the actual user lifecycle and single settlement through the product flow; it does not claim that the visibility listener independently settled the run before the blur listener.

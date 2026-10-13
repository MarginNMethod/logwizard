# LogWizard accessibility audit (WCAG 2.1 AA)

Date: 2026-10-12
Target: https://logwizard.vercel.app (source: apps/web)
Scope: Demo mode, the whole flow from the home page to the approved page with the three build steps, plus the privacy page.

This audit is a combination of automated checks (axe-core) and scripted manual checks driven through a real Chrome browser. No screen reader was used. See "What could not be tested".

## 1. Method

Tools
- Playwright (playwright-core) driving Google Chrome, headless.
- axe-core 4.10.2, installed only in the scratch folder /private/tmp/claude-501/pw. Nothing was added to the repo and no repo files were edited.
- Rule sets run on every state: wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice.
- Viewports: 1280x800 (desktop), 375x800 (phone), 320x800 (reflow).
- Scripts are in /private/tmp/claude-501/pw/a11y/ (axe.mjs, kb.mjs, contrast.mjs, resize.mjs, misc.mjs). Raw axe output: a11y/axe-results.json.

Manual checks (scripted)
- Keyboard only: forward Tab, Enter, type-ahead in selects. The full flow was completed with no mouse: home, skip link, Try demo, pick a sample, Begin, ten questions, Create my plan, edit, approve, copy, Start over.
- Focus management after each step change and after "Create my plan".
- Page titles, headings, landmarks, language attribute, link text.
- Contrast: every visible text node in every state was measured with a custom WCAG formula (foreground and composited background, including element opacity and the large text threshold). Input borders were measured against their background for 1.4.11. axe reports "needs review" for textareas, so this covered that gap.
- Resize: 200 percent text (root font size 200 percent), 400 percent zoom simulated as a 320 CSS pixel wide viewport (and 256 wide as an extra), text spacing override (1.4.12), checked on every state for horizontal scroll or overflow.
- prefers-reduced-motion emulated.
- Validation errors: clearing a required label, entering an out-of-range number (99), clearing the number field.
- Clipboard: success path, and the failure path (navigator.clipboard.writeText forced to reject) to show the fallback textarea.

## 2. States tested

| State | 1280 | 375 | 320 |
|---|---|---|---|
| Home / | axe | axe | axe |
| Privacy /privacy | axe | axe | axe (1 violation) |
| /start with nothing chosen (Begin button disabled) | axe | axe | axe |
| /start with a sample chosen | axe | axe | axe |
| Questions 1 to 10 | axe | axe | axe |
| Review your plan (edit form, selects, number input) | axe | axe | axe |
| Review with validation error (required label cleared) | axe | axe | axe |
| Approved page with 3 build steps | axe | axe | axe |
| Approved page, clipboard fallback textarea | contrast and resize only | resize only | resize only |
| /start with an invalid key format (error message) | contrast only | - | - |

Not reachable in Demo mode, so not tested: the follow-up questions stage and the bring-your-own-key plan path (needs a real AI key).

## 3. Automated results (axe-core)

- 1280 and 375: zero violations in every state.
- 320: one violation, on /privacy only: `scrollable-region-focusable` (serious), element `div.my-3.overflow-x-auto` (the wrapper around the data table). See finding 1.
- axe "needs review" items: only `color-contrast` on textareas (#answer on question screens, #opt-... option editors on the review screen). These were checked by hand: text is slate-900 on white (about 17:1), borders are 4.76:1. Pass.

Note: axe finding zero issues does not mean conformance. Axe detects roughly a third of WCAG problems. The manual findings below are the ones axe cannot see.

## 4. Results by success criterion

| Criterion | Status | Evidence |
|---|---|---|
| 1.1.1 Non-text content | Pass | No informative images. Progress bar has a text label. |
| 1.3.1 Info and relationships | Pass with note | Every input, select and textarea has an associated label (checked: no unlabeled control). Fieldsets have legends. Headings are one h1 per screen then h2. Table headers use scope="col". Note: the question h1 contains the textarea label. Works, but is unusual. |
| 1.3.2 Meaningful sequence | Pass | DOM order matches visual order. |
| 1.3.4 Orientation | Pass | No orientation lock. Layout works at 320x256 and 375x800. |
| 1.3.5 Identify input purpose | Pass | The only personal-data-like field is an API key (password, autocomplete=off, intentional). No name or email fields collect user data. |
| 1.4.1 Use of color | Pass | Links are underlined. Errors have text, not only color. |
| 1.4.3 Contrast (minimum) | Pass | Lowest measured enabled text is 8.43:1 on home, 8.73:1 on app screens. Disabled buttons measure 4.18:1 (opacity 0.6), which is exempt for inactive controls. See finding 5. |
| 1.4.4 Resize text | Pass | At 200 percent text no loss of content, no horizontal scroll, on all states. |
| 1.4.5 Images of text | Pass | None. |
| 1.4.10 Reflow | Pass with one exception | No horizontal page scroll at 320 wide or 256 wide in any state. The privacy table scrolls inside its own box (tables are allowed to, but see finding 1 for the keyboard problem). |
| 1.4.11 Non-text contrast | Pass | Input borders 4.76:1. Focus ring #1d4ed8 3px on near-white. Progress fill blue-800. Progress track is light but the value is also given as text. |
| 1.4.12 Text spacing | Pass | With line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph spacing 2em: no clipping or overflow on any state. |
| 1.4.13 Content on hover or focus | Pass | No hover or focus popups. |
| 2.1.1 Keyboard | Fail (minor, one place) | Whole flow completable by keyboard. Exception: the privacy page table scroll box is not keyboard focusable when it overflows (320 px wide). Finding 1. |
| 2.1.2 No keyboard trap | Pass | No traps found. Tab leaves the page normally. |
| 2.4.1 Bypass blocks | Pass | Skip link is first in Tab order, visible on focus (173x42), moves the Tab starting point to main (next Tab reached "Try Demo mode"). |
| 2.4.2 Page titled | Pass with note | Titles exist and describe the page. They do not change between steps of the wizard. Finding 4 (advisory). |
| 2.4.3 Focus order | Pass | Order is logical on every screen, including review form (15 stops in visual order). |
| 2.4.4 Link purpose | Pass | "Make your copy (opens in a new tab)" tells the user about the new tab. target=_blank has rel="noopener noreferrer". |
| 2.4.5 Multiple ways | Not applicable | Tiny site and a linear process. |
| 2.4.6 Headings and labels | Pass | Descriptive. |
| 2.4.7 Focus visible | Pass | 3px solid outline on every focusable element observed. |
| 2.5.x Pointer gestures, cancellation, label in name, motion | Pass | No gestures or motion input. Visible labels match accessible names. |
| 3.1.1 Language of page | Pass | `<html lang="en">`. |
| 3.2.1 / 3.2.2 On focus, on input | Pass | Changing a select or typing does not move focus or navigate. Validation runs without moving focus. |
| 3.3.1 Error identification | Fail | Finding 2. |
| 3.3.2 Labels or instructions | Pass | Visible labels, hints, 0 to 30 range stated. |
| 3.3.3 Error suggestion | Partial | Some errors say how to fix (empty label). Others show raw technical text. Finding 2. |
| 3.3.4 Error prevention | Not applicable | Nothing legal or financial. The approve step is reversible and nothing is submitted to a server for storage. |
| 4.1.1 Parsing | Pass (obsolete in 2.2) | axe found no duplicate ids or invalid markup. |
| 4.1.2 Name, role, value | Pass | Native controls. Progress bar has role and values. |
| 4.1.3 Status messages | Partial | Step change, "Creating your plan", "Checking your changes", "passes all checks", and the error alert all use live regions. "Copied" has a flaw. Finding 3. |

## 5. Focus management and announcements (manual)

- After "Begin the interview", each "Next", "Back", "Create my plan", and "Start over", focus moves to the new screen's h1 (which has tabindex -1) and is visibly outlined. Verified on all 10 question screens.
- After "Create my plan": focus moves immediately to the "Creating your plan" h1, and a polite live region says "Creating your plan. Please wait." When the plan arrives, focus moves to the "Review your plan" h1. So the result is both focused (which screen readers announce) and reachable. Pass.
- After approval, focus moves to the "Your plan ... is approved" h1.
- Question screens also set a polite live region "Question N of 10" at the same moment focus moves, so a screen reader will probably hear the heading and the live text. That is mild duplication. This is an inference, not verified with a screen reader.
- Next.js adds its own route announcer (role=alert) that repeats the page title. Titles do not change while stepping through the wizard, so it adds little.

## 6. The "Approve and finish demo" button looked greyed: verified

It is greyed on purpose, and briefly. The code (components/PlanPreview.tsx) sets `disabled={!valid}` on both "Download plan as JSON" and "Approve and finish demo", where valid means no validation errors and no check in progress.

Measured behavior:
- On arrival at the review screen: enabled (`isDisabled` false).
- After any edit: disabled for about 1.4 seconds while the server re-checks (350 ms debounce plus the validate call), then enabled when "Your plan passes all checks." appears.
- While a validation error is showing (for example an empty label): disabled until fixed.
- Disabled look: `opacity-60` on a blue-800 button with white text, contrast 4.18:1. Below 4.5:1 but exempt under 1.4.3 because inactive controls are excluded.

So it is not permanently disabled and the earlier screenshot was most likely taken during the re-check. It is still a usability concern for keyboard and screen reader users (finding 5).

## 7. Failures ranked by severity

Severity is my judgment of impact on real users, not an official rating.

### Finding 1 (Moderate): Scrollable table on /privacy is not keyboard accessible at narrow widths
- Criterion: 2.1.1 Keyboard. Also axe rule scrollable-region-focusable (serious).
- Element: `div.my-3.overflow-x-auto` wrapping the table in app/privacy/page.tsx. At 320 px the table is 326 px wide inside a 288 px box. It has no tabindex, so a keyboard user cannot scroll it to read the clipped column.
- Reproduce: open /privacy at 320 px width, run axe or press Tab.
- Fix: add `tabIndex={0}`, `role="region"` and an `aria-label` (for example "Data we handle, scrollable table") to that wrapper, or let the table cells wrap so it never scrolls.

### Finding 2 (Moderate): Validation errors are not tied to the field and sometimes use technical wording
- Criteria: 3.3.1 Error identification, 3.3.3 Error suggestion.
- Element: `div[role="alert"]` in components/PlanPreview.tsx, and the edit inputs `input[id^="label-"]`, `#days-N`.
- Evidence: after clearing a label, the alert says "Field label must not be empty" but does not say which of the several label fields. The field has no `aria-invalid` and no `aria-describedby` (both null). Focus stays in the field. Entering 99 gives "days_before must be from 0 to 30". Clearing the number gives `"reminders[0].days_before" must be a number but got null`. These are developer messages, not plain language.
- Positive: the alert is announced (role=alert) and the summary says the last passing version is shown.
- Fix: map each server error to its field, set `aria-invalid="true"` and `aria-describedby` pointing to a per-field message, and word messages in plain language ("Enter a number from 0 to 30 for days before"). Optionally list errors as links that move focus to the field.

### Finding 3 (Low to moderate): "Copied" confirmation never clears and is not re-announced
- Criterion: 4.1.3 Status messages.
- Element: `span[role="status"]` after "Copy your plan" in components/BuildSteps.tsx.
- Evidence: after the first click the live region reads "Copied" (works). It is still "Copied" six seconds later and after clicking again, because the text does not change (observed 1 DOM mutation after the first click and still 1 after the second). A screen reader user pressing Copy a second time hears nothing. If the user changes their mind or the copy fails the second time, the old message could mislead, though the failure path swaps in the textarea.
- Fix: clear the message after about 3 seconds with a timer, or reset it to empty before setting it again so each click is announced.

### Finding 4 (Low, advisory): Document title does not change between wizard steps
- Criterion: 2.4.2 Page titled (passes as written, this is a best practice).
- Evidence: title is "Try the demo | LogWizard" on all ten questions, the review screen and the approved screen. Because the app is a single route with state, browser history and the route announcer give no progress cue.
- Fix: update `document.title` per step, for example "Question 3 of 10 | LogWizard", "Review your plan | LogWizard".

### Finding 5 (Low): Disabled Approve and Download buttons give no reason and leave the Tab order
- Criteria: no direct failure. Related to 1.4.3 (exempt), 3.3.1 spirit, 4.1.3.
- Elements: `button` "Download plan as JSON" and "Approve and finish demo".
- Evidence: disabled for about 1.4 s after every edit and indefinitely while errors exist. Disabled buttons are skipped by Tab, so a fast keyboard user can tab past them and have to go back. Look is faded (4.18:1). A screen reader user gets "Checking your changes..." in a live region, which helps.
- Fix: use `aria-disabled="true"` instead of `disabled` so the button stays focusable, and put the reason in text linked with `aria-describedby` ("Fix the problem above first"). Keep the faded style but raise the base contrast so even faded text is at least 4.5:1.

### Finding 6 (Low, content): visible placeholder text on the approved page
- Criterion: no failure. Related to plain language and 3.3.2.
- Evidence: the approved page shows "PLACEHOLDER: link to be added once the sample sheet is published" and a similar line for the walkthrough, in amber boxes. Contrast is fine. This is unfinished content that will confuse screen reader users as much as sighted users.
- Fix: publish the links, or hide the list items until they exist.

### Observations that are not failures
- Link and button targets: top navigation links are 85x17 and 47x17 px, inline "privacy notice" is 90x17. WCAG 2.1 has no minimum target size at AA. WCAG 2.2 (2.5.8) wants 24 px or enough spacing. The nav links have 16 px of space between them, which likely satisfies the spacing exception. Buttons are 42 to 44 px high.
- No prefers-reduced-motion rule exists, and none is needed: the CSS has no animations or transitions (checked all elements with and without the preference, and the compiled stylesheet has no @keyframes). Pass by absence.
- Skip link: after activating it, `document.activeElement` is still body, but the next Tab lands on the first control in main. This is standard browser behavior. Adding `tabindex="-1"` to `main` would make it more consistent across browsers and screen readers.
- The clipboard fallback textarea works: it is labeled, receives focus, and its content is selected (2871 characters selected). It does not trigger a live announcement, but focus moving to a labeled textarea is announced.

## 8. What could not be tested

- Screen readers. I did not run VoiceOver, NVDA, JAWS or TalkBack. Everything said above about what a screen reader would announce is inferred from the DOM (roles, live regions, focus placement), not heard. Any claim of full screen reader support would be unfounded. A real screen reader pass is still needed, especially for the live regions during validation and the duplicated "Question N of 10" announcement.
- Voice control, switch access, and magnifier software.
- Real browser zoom at 400 percent (simulated by a 320 px wide viewport, which is the equivalent layout) and real OS-level large text.
- Windows High Contrast / forced colors mode and dark mode. The site sets `color-scheme: light` only.
- Safari, Firefox, and mobile browsers. Only desktop Chrome was driven.
- Touch interaction on a real phone (375 px was an emulated viewport).
- The bring-your-own-key path, the follow-up questions stage, and live AI plan results (not reachable without a real key, and the app would send data to a third party).
- 2.4.5, 3.3.4, 1.2.x (time-based media): no such content exists, so not applicable.
- Cognitive accessibility beyond what WCAG tests (reading level, workload). The ten-question flow uses plain language but I did not run user testing.

## 9. Conformance statement

Based on the testing above, LogWizard at https://logwizard.vercel.app has no automated axe-core violations at 1280 px or 375 px, and one at 320 px (the keyboard-inaccessible table scroll box on /privacy). Manual testing found two failures of WCAG 2.1 Level AA success criteria (2.1.1 on the privacy table at narrow widths, and 3.3.1 for validation errors that do not identify the field) and one partial failure (4.1.3 for the "Copied" message not clearing), plus a few advisory improvements.

Therefore the site does not fully conform to WCAG 2.1 Level AA today. It substantially conforms in the areas tested: keyboard operation, focus visibility and management, contrast, reflow, text resize, text spacing, structure and labels. This statement covers desktop Chrome only, no screen reader testing was done, and it is not a certification. Fixing findings 1 to 3 would remove the known AA failures; a screen reader test should happen before claiming full conformance.

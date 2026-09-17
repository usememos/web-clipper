# AI clipping: configuration and usability

## Purpose and scope

The goal is a useful memo from the captured source: remove webpage clutter while retaining facts, numbers, qualifications, procedures, code, and tables; add a concise summary and useful retrieval tags. Generation is optional and scoped to the popup. Selected text wins over extracted article text. A title or metadata description alone is insufficient. Images and context-menu quick saves keep their existing flow.

## Configuration decisions

| Option | Why it is configurable | Default |
| --- | --- | --- |
| Automatic/manual generation | Controls when text is sent and when API usage occurs | Automatic after opt-in |
| Cleaned/original/summary content | Supports full reference notes, exact captured text, and quick reviews | Cleaned body + summary |
| Summary language | Supports multilingual sources and personal note language | Simplified Chinese |
| Summary detail | Balances quick scanning against more detailed recall | 2–3 sentences |
| Generated tag count | Controls tag density and allows disabling AI tags | At most 5 |
| Candidate tags and selection policy | Supports an existing vocabulary, optionally excluding new tags | Prefer relevant candidates; allow new |
| DeepSeek model | Lets users choose a supported model without editing code | deepseek-flash |

The output options are grouped in a collapsed section to keep the initial setup short. “Restore default options” resets output and trigger preferences while preserving the key, candidates, and enable switch. Existing settings receive defaults without losing saved credentials or tags. All configuration stays in browser local storage; the public settings response never includes the saved API Key.

The first version keeps the official endpoint, JSON contract, faithful-source instruction, and runtime limits fixed. A free-form prompt could undermine the content-preservation contract. The 40,000-character input limit fails visibly instead of cutting off part of an article. The 25-second request timeout stays below the MV3 worker's fetch-response deadline; see [Chrome's worker lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). The supported model request follows [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

## Usability findings and changes

| Problem | Behavior now | Verification |
| --- | --- | --- |
| Late AI output could replace typing or content already saved | Keep current draft; offer review and explicit replacement | Hook regression tests |
| Restore/apply could lose a manually edited draft | Undo the most recent replacement, including restoring original text | Hook regression tests and browser interaction |
| Generation could keep running after closing the popup | Cancel button, unmount cleanup, and pagehide request an abort | Background and hook tests; simulated delayed browser response |
| Reopening the same clip could repeat a completed paid request | Reuse one matching result for five minutes in session storage; Regenerate bypasses it | Cache expiry, bypass, invalidation tests and browser interaction |
| A model could ignore a candidate-only policy or tag limit | Canonicalize spelling, filter to candidates, and cap tags locally; no match is valid | Background tests |
| Original-body output could be rewritten by the model | Keep captured Markdown locally; accept only summary/tags in this mode | Formatter and background tests |
| Settings could change while generation was in progress | Abort and reject old settings revisions; popup observes changes | Background and hook tests |
| Multiple settings windows could overwrite each other | Revision checks, preserved draft, explicit reload of the saved settings | Concurrent-write and settings UI tests |
| Removing a key could clear unrelated unsaved edits | Disable AI and clear the key while preserving candidate/output drafts | Settings UI tests |
| Initial settings load failure had no recovery | Visible error with retry | Settings UI test |
| Old templates could hide AI fields or reinsert advertising metadata | Supply missing summary/tags and omit the metadata description | Formatter tests |
| Expanded controls could crowd the small popup | Scrollable content area, fixed save footer, expandable result review | Browser layout check at 380 × 480 |
| Editing after saving could leave a stale success state | Clear saved confirmation when content changes | Browser interaction |

Cache matching includes the complete input text, title, credential, preferences, and settings revision through a digest. Only the most recent generated result is cached, and the cache stores neither the raw credential nor the raw captured input. It expires logically after five minutes, is overwritten by the next successful result, and is removed when settings change. Browser restart clears session storage. No automatic retry is used. Cancellation requests cannot guarantee that a provider stops charging for already submitted work.

## Validation boundary

Automated tests cover settings, protocol trust boundaries, formatting, caching, cancellation, stale responses, undo, and saving the edited text. Browser checks use the actual React components and background AI module with a simulated capture and provider response. Production build, TypeScript, formatting, and all nine locale catalogs are checked separately.

No live DeepSeek key or real Memos account was used for this feature's new interaction checks. Model cleanup quality, real provider latency/cost, and installed-extension popup teardown still need validation with a real browser extension and representative articles. Prompt instructions request faithful cleanup but cannot prove that every generated fact or retained passage is correct; users review the editable result before saving.

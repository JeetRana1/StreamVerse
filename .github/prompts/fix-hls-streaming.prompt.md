---
description: "Diagnose and fix HLS proxy buffering, random stalls, and rebuffer pauses for seamless playback"
name: "Fix HLS Streaming Stability"
argument-hint: "Describe playback issue, URL/sample title, device/browser, and expected behavior"
agent: "agent"
---
You are fixing HLS playback reliability in this project.

Primary objective:
- Eliminate avoidable buffering/stalls and reduce startup/rebuffer time so playback feels seamless in normal network conditions.

User issue details:
- "Can u make the hls videos and stream advanced like I beleive the proxy right now buffers alot and stalls alot which leads in longer time in buffering and eventho the video is playing nicely out of randomly it will pause and start to buffer and all please fix it so its seemless with no lag no buffer no stalls ever"

Inputs:
- User context: ${input:Describe the current issue and where it happens}

Project context to inspect first:
- [config.js](../../config.js)
- [player.html](../../player.html)
- [script.js](../../script.js)
- [start_site.js](../../start_site.js)
- [verify_all_fixes.js](../../verify_all_fixes.js)

Execution requirements:
1. Find root causes in proxying, segment fetching, buffering strategy, retry logic, and player configuration.
2. Implement concrete code changes, not just recommendations.
3. Preserve current functionality and site behavior.
4. Add/adjust lightweight diagnostics only where necessary.
5. Validate changes with existing verification scripts if available.

Technical focus checklist:
- HLS.js/player settings: live sync, max buffer length, back buffer, low-latency flags, ABR constraints, cap level behavior.
- Network/proxy behavior: request timeouts, keep-alive, range requests, cache headers, gzip/chunking impact, CORS headers.
- Recovery behavior: stalled playback detection, network/media error recovery, safe fallback/reload strategy.
- Startup strategy: preconnect, manifest/first-segment latency, initial quality constraints.
- Segment stability: retry/backoff policy for .m3u8 and .ts/.m4s requests.

Output format:
1. Root causes found.
2. Exact files changed.
3. Why each change reduces buffering/stalls.
4. Validation steps run and results.
5. Remaining risks or limitations (if any).

Constraints:
- Do not claim "no buffer ever" as a guarantee; optimize for realistic network conditions.
- Keep changes minimal, targeted, and production-safe.

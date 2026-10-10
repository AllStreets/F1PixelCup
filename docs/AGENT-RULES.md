# Rules for every helper agent on F1 Pixel Cup (read fully before starting)

You are one of several agents working in parallel on F1 Pixel Cup, a browser F1 racing game (three.js, no build step). The orchestrator (main session) merges your branch. You work ONLY in your own git worktree (given in your task), on your own branch. Never touch the main checkout at `/Users/connorevans/Desktop/My Projects (Programming)/F1_Pixel_Cup` and never touch other agents' worktrees (`F1_Pixel_Cup-<letters>`), except to READ.

(This file lives in the repo at `docs/AGENT-RULES.md`. `/private/tmp/claude-501/AGENT-RULES.md` is only a link to it: macOS empties that temp folder.)

## Read first (in your worktree)
1. `docs/HANDOFF.md`: where things stand, the code map, things learnt the hard way. Its "Starting up" section uses port 8765 and the Playwright MCP; for you that is replaced by the section below.
2. `docs/superpowers/plans/2026-10-01-work-order.md`: your stage's section.
3. Any spec your task names.

## Your dev server and browser checks (NOT the Playwright MCP)
- **Never use the Playwright MCP browser tools** (`mcp__plugin_playwright_*`). The user watches that window and other agents share it. Never use the Blender MCP tools either.
- Start your own server in the background, on your port: `python3 tools/dev-server.py . <PORT>` (run from your worktree root, with `run_in_background`). Stop it when you finish.
- Run browser checks headless with the shared runner (it lives in `~/.f1pixelcup/pw`; `/private/tmp/claude-501/pw` links to it):
  - some checks: `node ~/.f1pixelcup/pw/run.js <PORT> checks rain,car [--long]`
  - your own script: `node ~/.f1pixelcup/pw/run.js <PORT> code /path/to/script.js`, where the file is `module.exports = async (page, port) => { ...; return result; }`. Use `http://localhost:${port}/...` URLs inside it. The window is a real 1600x900 window; for other sizes, resize via CDP `Browser.setWindowBounds` (never `setViewportSize`, never a fixed viewport). Screenshots: `page.screenshot({ path })`.
- Existing check files hardcode `localhost:8765`; when they run through `run-all.js` under the runner they are rewritten to your port automatically. New checks you write must also use `localhost:8765` in their URLs and be added to the list in `tools/checks/run-all.js`.
- **Machine load (user, 2026-10-05): the user plays the game on this same Mac.** Seven agents' browsers at once made the game lag for them. So:
  - every browser goes through the runner, which allows only 2 agent browsers at a time across all agents and queues the rest (any harness of your own must take a slot the same way or go through the runner);
  - never launch several browsers in parallel loops;
  - one Blender build at a time per agent.
- **Runner limits:** the runner cuts any run off after 50 minutes (exit 124) so a hung check cannot block the two slots. Run checks in small groups (2 to 4 per call), never `checks all`. `trackside-models` and `people` over all 32 circuits take over an hour: run them only for the circuits you touched (`globalThis.CIRCUITS`, comma-separated ids, where the check supports it); the orchestrator runs the full sweep on main at merge.
- Put temporary files in `/private/tmp/claude-501/<your-stage>/`, and nothing there that must outlive a few days.
- **Usage is limited (weekly limit):** be economical. No repeated full runs, short reports, commit work in progress early and often so a cut-off loses nothing.

## Blender
Headless only, as `docs/HANDOFF.md` shows (`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P <script>`). Blender is 5.2. Look shader nodes up by type, not name. Build scripts check themselves (raise on a broken result). Compress models with `tools/compress-models.mjs`.

## The standing rules (from the user; non-negotiable)
- **Spec first** in `docs/superpowers/specs/<date>-<topic>-design.md`, then a short plan, then build.
- **Tests first** (Node `node --test` in `tests/`, run all with `npm test`), seen to fail before the code that makes them pass. Browser checks must be able to fail (prove it against the old code). No tautological checks, and no checks that depend on frame timing or on which circuit a cup happens to start with (name the circuit).
- **Quality bar:** real working features only (copy never claims what the game does not do); physically honest; intense beauty judged from real screenshots you look at yourself (use the Read tool on the PNG/JPG); `Render3D.auditScenery(track)` must return 0 on every circuit (nothing over the track, ever).
- **Licences:** F1DB (CC BY), OpenStreetMap (ODbL, credited), Poly Haven (CC0), MakeHuman assets (CC0) only. No media.formula1.com images, no official logos, no sponsor marks, no trademarks or brand emblems. Public photos may be used as shape reference only.
- **No em dashes** in any reader-facing text (README, site copy, review pages, in-game text).
- **Players are P1 and P2** (never 1P or 2P).
- **Performance:** anything new that draws must be in the scene when `Render3D.prepare()` runs (shaders compile there), or the first frame stalls. Frame time must hold on all three quality tiers (`quality.js`); Low may drop decoration. Only the raced venue's models are loaded.
- **Responsive view:** the game fills any window size, no black bars; the HUD stays on screen.
- Match the surrounding code style: comment density, naming, idioms. Pure modules are UMD and tested in Node.
- **The site advertises the game (user, 2026-10-02):** when your stage adds a major feature, also update the website (index.html, landing.css/js, drivers.html, teams.html) to show it: a section or feature cards, real in-game screenshots (tools/capture-shots.js), copy that claims only what the game does, the landing check updated. Do it in the same branch before you report.
- **Fix everything:** at the end, run `npm test` and the browser checks in groups; every failure is yours to fix (a failure that also fails identically on main is reported, not ignored). Then spawn a FRESH reviewer subagent (most capable model) on your branch diff (`git diff main...HEAD`), and fix EVERY finding, minors included, each with a test that failed first where testable.
- **Commit** on your branch with clear messages, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push your branch: `git push -u origin <branch>`. **Never merge into main and never push main**; the orchestrator does that.
- Do not include any model identifier other than that co-author line in commits or files.

## Your final report (your last message)
Short and factual: what you built (files), what the tests and checks show (paste the summary numbers), the screenshots you made (paths), anything unfinished or any doubt, and the exact commit hash pushed. If a design review is part of your stage, list the review images (committed under `docs/review/<date>/`) with a one-line caption each, and the choices made, so the orchestrator can publish the review page.

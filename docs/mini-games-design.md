# Mathe Läufer — Mini Games Hub: Design & Spec Review

## 0. What This Revision Fixes

This is a sign-off design review — **no code is written**. It has been reworked against the actual `src/App.jsx` / `src/App.css` so every "reuse" claim survives contact with the code. The load-bearing corrections versus the first draft:

- **`makeFactorPool` arity.** The real signature is `makeFactorPool(settings, maxFactor)` (App.jsx line 65). Called with one argument, `maxFactor` is `undefined`, `Array.from({ length: undefined - minFactor + 1 })` is empty, and any game that builds rows/distractors from it silently produces nothing. A new helper `factorPoolFor(settings)` is mandated (§3) so the doc's "reuse" is literally true.
- **`makeQuestion(settings)`** is real (line 207) and is the primary engine. It is **not seedable** (uses `Math.random` directly, lines 217–220, 231); the Daily Challenge and Ghost Race therefore require a small refactor to inject an RNG (§3, §6) — not free reuse.
- **`makeSettingsKey(settings)`** is the reusable function (line 72). `settingsKey` is just its result for the active config (line 347), not a standalone API.
- **`ConfettiBurst`** is a **fullscreen 180-piece** finish effect (lines 36–58, 280–303, retriggered via `confettiBurstId`). It is the celebration tier only. A separate lightweight micro-reward primitive must be built for per-answer feedback (§3, §6).
- **No reusable settings component exists.** The settings UI is inlined in the `phase === 'ready'` branch (lines 831–904), tightly bound to `gameSettings` / `updateSetting`. A `<DifficultyPanel>` must be **extracted first** before the hub can share it (§2).
- **Leaderboard is hardwired to time-then-mistakes.** The Supabase `select`/`order` strings, both row mappers, `compareLeaderboardEntries`, `makeLeaderboardScoreKey`, and the in-memory merge all enumerate fixed columns (lines 86–205). Adding a `score`/`game_mode` is cross-cutting plus a Supabase migration. Mini-games therefore start **localStorage-only** (§6, §8).
- **Catalog cut from 27 to 10 committed games** + an explicit idea backlog (§4, §7), removing reading-heavy / conceptually-hard entries from the shipped set.
- **Hüpf-Pfad name clash resolved in-doc** (§4): reflex game → **„Bach-Sprung"**, number-line game → **„Zahlen-Hüpfer"**.

---

## 1. Goal

Extend **Mathe Läufer** with a **Mini Games** hub: a kid-friendly collection of short, playful games that all train the multiplication tables (*das kleine und große Einmaleins*). Every committed mini-game reuses the existing math engine (`makeQuestion`, and `makeFactorPool` via the new `factorPoolFor` helper), the active difficulty settings, the visual theme, the confetti celebration, and — where it genuinely fits — the per-settings scoreboard.

The headline mechanic the user requested is **drag-and-drop**: the child drags the correct answer onto the question. This is well represented — **4 of the 10 committed games** use it, and the shared `@dnd-kit` wrapper is specified canonically in §5.

Audience: roughly ages 6–11 (primary school). All user-facing text is **German** and kid-friendly. Reading load is kept near zero.

---

## 2. Navigation & Entry Point

### New „Mini Games" button on the home screen

The home screen renders a `.home-start` block only when `phase === 'home'` (App.jsx lines 761–770). It contains a primary **„Spiel starten"** (`primary-action home-start-button`) and a secondary **„Rangliste"** (`secondary-action home-start-button`). We add **one new button labelled „Mini Games"** directly **below „Spiel starten"** and above „Rangliste":

```
┌─────────────────────────────┐
│        ▶  Spiel starten      │   primary-action   home-start-button   (existing)
│        🎮 Mini Games         │   tertiary-action  home-start-button   (NEW)
│        🏆 Rangliste          │   secondary-action home-start-button   (existing)
└─────────────────────────────┘
```

**Three load-bearing layout facts (these were missing before):**

1. **The new button MUST carry the `home-start-button` class.** `.home-start` itself has `pointer-events` defaulting to none in the centered overlay; clickability comes from `.home-start-button { pointer-events: auto }` (App.css line 525). A button without that class is visually present but **not tappable**. It also supplies the touch sizing. Add a `tertiary-action` modifier purely for color (a third theme tone, e.g. blue `#247fc3`), not for sizing or pointer-events.

2. **Vertical overflow risk on short/landscape phones.** `.home-start-button` is `min-height: clamp(108px, 15vh, 142px)` with a 22px grid gap and `min-width: min(540px, 90vw)` (App.css lines 519–524). Three full-size buttons ≈ `3 × ~120px + 2 × 22px ≈ 404px` of centered content competing with the track SVG above. **Action item: verify the 3-button stack on a 360×640 landscape viewport.** Mitigation — make „Mini Games" a **smaller tertiary tier** (e.g. `min-height: clamp(72px, 11vh, 100px)`, slightly smaller font), OR reduce all three `min-height` values when three buttons are present. The existing `@media` rule at App.css line 1418 already shrinks `.home-start-button` to `min-height: 78px` on small screens; extend that breakpoint logic to the 3-button case.

3. **Renders only under `phase === 'home'`**, exactly like the existing two — confirmed against lines 761–770.

A game-controller / grid icon signals "many little games."

### The Mini Games hub page

There is **no router** — screens switch via the `phase` string. So the hub is a **new phase value**, and we pick **one** explicit state contract (the draft waffled between two; this resolves it):

> **State contract (chosen):** a single string `phase`. Hub = `phase === 'minigames'`. A launched game = `phase === 'minigame'` **plus** a companion string `activeMiniGame` (e.g. `'bachSprung'`). Every mini-game receives a single `onExit()` callback that sets `phase = 'minigames'`. This `(phase='minigame', activeMiniGame)` pair avoids an unbounded set of `'minigame:*'` phase strings and keeps the existing phase-driven render switch readable.

The hub contains:

- **A grid of game cards.** Each card: a large **icon/emoji**, the **German name**, a **one-line tagline**, and a small **tier badge** (Core / Bald / Backlog). Big, rounded, colorful, finger-friendly.
- **A back button** („Zurück") → `home`.
- **A compact, shared difficulty control.** See the reuse caveat below.

#### Settings reuse caveat (was overstated)

The settings UI is currently **inlined** inside the `phase === 'ready'` start card (App.jsx lines 831–904) and bound to `gameSettings` / `updateSetting`. It is **not a component**. Before the hub can "share" it:

- **Task: extract `<DifficultyPanel settings onChange />`** (and have the existing `phase === 'ready'` card consume the same component, so there is one source of truth). This is real refactor work, listed in the effort/roadmap, not free reuse.
- **Hide the route-length control on the hub by default.** `ROUTE_OPTIONS` (route length / stops) is only meaningful to the three route-shaped games (**Brücken-Bau, Bach-Sprung, Schatzkarte**). Showing „Kurz/Mittel/Lang" globally is misleading for kids playing arcade games that ignore it. The panel should take a prop like `fields={['difficulty','skipRows','answerCount']}` (route omitted) on the hub, and route-shaped games show route as a small extra chip when launched.
- On the hub header, a **read-only summary chip** („Kleines 1×1 · 6 Antworten") keeps the active config visible; tapping it opens the `<DifficultyPanel>` in a compact modal rather than inlining the full panel on the grid.

**No new dependency is needed for navigation** — it is pure phase/state. Only the drag games add a library (§5), and that library is **code-split** (§5, §6) so arcade-only players don't download it.

---

## 3. Design Principles

| Principle | What it means here |
|---|---|
| 🔤 **Minimal reading** | Rely on **numbers, color, icons, animation**. German labels only where unavoidable; no sentences for the 6-year-old floor. |
| 👆 **Big touch targets** | Large chips, baskets, mouths. Drop zones bigger than the visible art. |
| ✅ **Forgiving wrong answers** | A wrong move gives a **gentle wobble / bounce-back**, never a dead-end. Mistakes tracked, never punishing. |
| 🎉 **Two reward tiers** | **Micro-reward** (cheap CSS sparkle / star-pop, <10 nodes) on every correct answer; the heavy **`ConfettiBurst`** reserved for round/game completion only. |
| ⏱️ **Short sessions** | 60-second blitzes, one bridge, one island — a quick complete loop. |
| 🇩🇪 **German UI** | Kid-friendly German („Super!", „Nochmal!"). |
| 🖱️👆 **Mouse AND touch** | Every interaction works with mouse and finger; drag games add Pointer + Touch sensors **and** a tap-to-place fallback (§5). |
| 🌀 **Reduced-motion safe** | Confetti, screen-shake, and falling animations respect `prefers-reduced-motion`: heavy confetti degrades to a static badge, shake is disabled, fall speeds capped. |
| ♻️ **Reuse the engine** | `makeQuestion(settings)` supplies question + options + distractors; `factorPoolFor(settings)` supplies rows; difficulty settings drive every game. |

### The one engine helper every game uses

To make "reuse `makeFactorPool`" actually true and to stop every game from re-deriving `maxFactor`:

> **`factorPoolFor(settings)`** = resolve `difficulty = DIFFICULTY_OPTIONS.find(o => o.id === settings.difficulty)` (default first), then return `makeFactorPool(settings, difficulty.maxFactor)`. Every row/staircase/multiples game (Die Reihe, Zahlen-Hüpfer, Bingo fill, Welche passt nicht) calls **`factorPoolFor(settings)`**, never `makeFactorPool(settings)`.

### Reward primitives (two, not one)

- **`<MicroReward>`** — net-new, lightweight. A handful (<10) of absolutely-positioned CSS sparkles or a single scaling star, keyed by a small counter, auto-removed. Fired on **every** correct answer. Cheap enough for 1–2 hits/second on old tablets.
- **`ConfettiBurst`** — the existing fullscreen 180-node component, reused **unchanged** but only for round/game/level completion. **Do not fire it per tap** in blitz/rain modes (re-mounting 180 nodes per tap is a real perf problem on the tablets we worry about, and is visually overwhelming as a "spark").

### Puzzle-constraint layer (net-new, not reuse)

`makeQuestion`'s distractors are `correct ± drift` or random table-like products, de-duplicated only by a `Set` and the `candidate !== correct` / `> 0` guards (lines 214–225). It does **not** guarantee a unique correct cell, a minimum gap between options, or pedagogical closeness. Games that need those guarantees — **Bingo** (unique correct cell among `options + factorPoolFor`), **Welche passt nicht** (exactly one outlier) — require a thin **`buildPuzzle(settings, constraints)`** helper on top of `makeQuestion` that enforces *unique correct*, *minimum candidate gap*, and a *difficulty-appropriate cap* (in large mode, products reach 400; "399 vs 400" is unreadable for a 6–8-year-old). **This is net-new pedagogical code and is sized as such in §7**, not counted as `makeQuestion` reuse.

---

## 4. The Mini Games Catalog

**Committed set: 10 games.** Everything below the line in §4.2 is an explicit **idea backlog — not committed**. Tier badges on committed games: **🟢 Core** (build first) / **🟡 Bald** (next). Effort: **S / M / L**.

### 4.1 Committed games (10)

#### 🟧 Drag & Drop

##### Antwort-Karten *(Answer Cards)* — 🟢 Core · Effort **S**
**Tagline:** Zieh die richtige Zahl auf die Karte.
- **Was das Kind tut:** A big question card on top (`6 × 7 = ?`); below lie 4/6/8 number chips. Drag the right chip onto the empty slot. Correct → chip locks in, card glows green, MicroReward, next card; on a finished run of 10 cards → `ConfettiBurst`. Wrong → chip bounces back with a wobble.
- **Was es übt:** Direct recall of `a × b`. Question and distractors come **1:1 from `makeQuestion(settings)`**.
- **Difficulty:** `makeQuestion(settings)` gives question + options; `answerCount` sets chip count (4/6/8); difficulty + skip-row toggles set the factor range via the engine itself.
- **Reward:** Star per card → star bar; MicroReward per hit; `ConfettiBurst` after 10 cards.
- **Drag note:** the canonical single-droppable pattern (§5). The recommended **first dnd-kit build** to validate the install.

##### Der hungrige Drache *(Hungry Dragon)* — 🟢 Core · Effort **M**
**Tagline:** Füttere den Drachen mit der richtigen Zahl.
- **Was das Kind tut:** An SVG dragon holds the task and opens its mouth. Number balls float at the edges. Drag the right ball into the mouth → chew + MicroReward + new sign; a full belly → `ConfettiBurst` roar. Wrong → grimace, ball spat back.
- **Was es übt:** Product recall; the mouth is **one big forgiving droppable**.
- **Difficulty:** `makeQuestion(settings)` supplies task/options; `answerCount` = number of floating balls; large Einmaleins → harder signs; higher belly levels open the mouth a little faster (mild, optional time pressure).
- **Reward:** Belly bar fills with progress; full belly → happy roar + `ConfettiBurst`.
- **Engine reuse:** the **"maul droppable + feed" interaction** is built once here and re-skinned for the backlog's *Mein Zahlen-Drache* / *Zauberbäckerei* later. (Moving-target feeding from the cut *Honig-Hetze* is deliberately dropped — too hard for small fingers.)

##### Brücken-Bau *(Bridge Builder)* — 🟢 Core · Effort **M**
**Tagline:** Zieh den richtigen Stein in jede Lücke und bring den Läufer hinüber.
- **Was das Kind tut:** The runner faces a gorge; a bridge has planks with gaps, each gap a task. Drag the right stone from the pile into the highlighted (next) gap → plank firms, runner steps forward. Wrong → stone wobbles back. Guided order: only the next gap is active.
- **Was es übt:** Product recall, progress = a walkable bridge; ties to the main game's running DNA.
- **Difficulty:** **Route length = number of gaps** via `ROUTE_OPTIONS.stops` (5/7/10) — direct reuse; `answerCount` = stones in the pile; difficulty + toggles set factors. The pile always contains the correct answer (from `options`).
- **Reward:** Each plank = a step; finish → runner crosses, `ConfettiBurst`. Time is measured → fits the existing time-then-mistakes ordering conceptually, but **scores are stored locally first** (see §6/§8, not the Supabase board yet).
- **Drag note:** multi-droppable with active-gap highlight; use overlap-based collision (`pointerWithin`), not `closestCenter` (§5).

##### Zahlen-Memory *(Fact-Match Pairs)* — 🟢 Core · Effort **M**
**Tagline:** Zieh die Aufgabe auf ihr Ergebnis.
- **Was das Kind tut:** Left column = question tiles (`6×4`, `8×7`…); right column = shuffled result tiles. Drag a question onto its matching result → a glowing line connects, both vanish with a MicroReward. Wrong → question glides gently back. All pairs cleared → `ConfettiBurst`.
- **Was es übt:** **Highest learning value of the drag games** — compute the product AND locate it (double memory trace).
- **Difficulty:** A set of 4/6/8 `makeQuestion(settings)` tasks (`answerCount` = pair count); difficulty + toggles set factors; harder = more pairs + closer results (apply the `buildPuzzle` min-gap so two results aren't visually identical).
- **Reward:** Found-pairs bar; all pairs → `ConfettiBurst`; round time measured (stored locally).
- **Fallback:** includes the tap-to-place mode (tap question, tap result) as the youngest-child / accessibility path.

#### ⚡ Arcade / Reflex

##### Zahlen-Regen *(Number Rain)* — 🟢 Core · Effort **M**
**Tagline:** Fang oder tippe die richtige fallende Zahl.
- **Was das Kind tut:** Task on top; the `options` rain down slowly. The child slides a bucket-runner left/right to catch the right number, **or simply taps the correct drop**. Hit → MicroReward + new task; miss the right drop or catch a wrong one → lose a heart (3 hearts). End screen → `ConfettiBurst`.
- **Was es übt:** Speed recall under plausible distractors.
- **Difficulty:** `options`/`correct` from `makeQuestion(settings)`; `answerCount` = drops on screen; difficulty sets the number range; fall speed starts slow, ramps per correct answer (combo); higher base speed for large Einmaleins.
- **Reward:** MicroReward per hit; gold star from a 5-streak; hearts up top; end screen → `ConfettiBurst`.
- **Perf:** rAF loop + CSS transforms; **no dnd-kit**, no per-tap fullscreen confetti.

#### 🧩 Puzzle / Logic

##### Einmaleins-Bingo *(Times-Table Bingo)* — 🟡 Bald · Effort **M**
**Tagline:** Tippe das richtige Produkt — drei in einer Reihe.
- **Was das Kind tut:** A 3×3 / 4×4 / 5×5 grid of products. A task appears (`6×7`). **Tap** the cell with the right answer (drag a marker is optional decoration). Hit → glow + MicroReward; wrong → red wobble. A full row/column/diagonal → `ConfettiBurst` + Bingo banner.
- **Was es übt:** Recognizing a product among near-distractors.
- **Difficulty:** Grid built via **`buildPuzzle`** over `factorPoolFor(settings)` so all cells are plausible **and the correct cell is unique**; `answerCount` sets grid size (4→3×3, 6→4×4, 8→5×5); toggles restrict the pool; large mode caps spread so cells stay tellable apart and large on touch.
- **Reward:** Line → `ConfettiBurst`; stars per round; full board = gold star.

#### 🧩 Logic (commutativity)

##### Dreh-Zwillinge *(Twin Swap)* — 🟡 Bald · Effort **S**
**Tagline:** Finde die gedrehte Zwillings-Aufgabe (8×3 = 3×8).
- **Was das Kind tut:** A task card (`8 × 3`); below, find and tap the twin `3 × 8`. Hit → both fold into a heart, a short animation rotates the dot-rectangle 90° to show "same amount." Optional face-down memory mode.
- **Was es übt:** **The commutative law** — the rotating dot-rectangle is the aha proof, halving the facts to memorize.
- **Difficulty:** Cards from `makeQuestion(settings)`, each swapped once; difficulty scales factors; `answerCount` sets field size (2/3/4 pairs). **Exclude `a === b`** (no real twin) via `buildPuzzle`.
- **Reward:** MicroReward + heart per twin; full heart-row → new card skin; round clear → `ConfettiBurst`.

#### 🏆 Competitive (local boards only at MVP)

##### 60-Sekunden-Blitz *(60-Second Blitz)* — 🟢 Core · Effort **S**
**Tagline:** Wie viele Aufgaben in einer Minute?
- **Was das Kind tut:** A 60s countdown ring; a task `a × b` with 4/6/8 buttons. Right → +1, instant next, MicroReward; wrong → red wobble, ~1s lock, next. Pure **hit count in 60s**. End screen shows hits, accuracy %, fastest answer → `ConfettiBurst` on a personal record.
- **Was es übt:** Automation — fast recall under a clock.
- **Difficulty:** `makeQuestion(settings)` directly (difficulty, toggles, answer count). Harder settings = fewer hits → its **own local board per `makeSettingsKey(settings)`**. Optional 30s variant.
- **Reward:** MicroReward per hit; `ConfettiBurst` + star on a new personal best.
- **Scoreboard:** **localStorage-only** at MVP. This is where the score-key shape (hits desc, then accuracy) is designed; if a Supabase `score` mode is later approved, this game is the first to migrate (§6).

##### Renn-Duell *(Race Duel)* — 🟡 Bald · Effort **S**
**Tagline:** Antworte schneller als der Roboter-Läufer.
- **Was das Kind tut:** Split track: player on top, a computer robot below. Same task; 4–8 answer buttons. Right → your runner sprints, next task immediately; the robot answers at fixed intervals that shorten with difficulty. First to the flag wins; wrong = a stumble (time loss), no life lost. Win → `ConfettiBurst`.
- **Was es übt:** As many facts as possible, fast, against a visible opponent.
- **Difficulty:** `makeQuestion(settings)` per task (4/6/8 buttons); **robot tempo is the difficulty dial** (slow for small, fast for large). Optionally couples distance to the chosen route.
- **Reward:** `ConfettiBurst` at the flag, „Du warst X Sekunden schneller", trophy on a clear win.
- **Scoreboard:** time-based; stored **locally** at MVP. Only risk: a few bot-speed tiers to balance.

> **Why these 10:** they are the low-floor, high-fun, low-reading core. Four use the requested drag mechanic (Antwort-Karten, Hungry Dragon, Brücken-Bau, Zahlen-Memory). They exercise every reuse path once — `makeQuestion`, `factorPoolFor`, `ROUTE_OPTIONS`, the new `<DifficultyPanel>`, `<MicroReward>`, `ConfettiBurst`, and a local scoreboard — so the platform is proven before scaling.

### 4.2 Idea backlog — NOT committed

These are recorded for later. Several are reading-heavy or conceptually hard for the 6–7-year-old floor and are deliberately **out of the shipped set**; division/divisibility ones are gated behind an age/level flag and labelled **9+**.

| Game | Lens | Why deferred / flag |
|---|---|---|
| **Korb-Sortierer** *(Basket Sorter)* | drag, reverse-match | Effort **L**: pause-on-grab + multi-basket overlap detection; needs `buildPuzzle` for unique baskets. |
| **Punkte-Felder** *(Dot Arrays)* | drag, array concept | Many small droppables; cap to ~12 dots. Good but heavy for MVP. |
| **Die Reihe vervollständigen** *(Complete the Row)* | drag, skip-count | Uses `factorPoolFor`. Tall layout needs a horizontal/scroll solution on phones. |
| **Bach-Sprung** *(reflex Hop Path)* | arcade | Renamed from „Hüpf-Pfad" to resolve the clash. Cap to 4–5 stones even at answerCount 8. |
| **Meteor-Abwehr** *(Meteor Defense)* | arcade | Screen-shake must respect `prefers-reduced-motion`. |
| **Luftballon-Knall** *(Balloon Pop)* | arcade, inhibition | Needs a score board + tuned penalty. |
| **Zahlen-Hüpfer** *(number-line Skip-Count)* | number sense | Renamed from „Hüpf-Pfad". `factorPoolFor`; path scrolls in large mode. |
| **Mein Zahlen-Drache** *(My Number Dragon)* | collection | Reuses Hungry Dragon's feed engine; cost is the evolution SVGs. |
| **Schatzkarte der Inseln** *(Treasure Map)* | collection | Route-shaped; `makeQuestion` with a pinned factor `a` per island; island cleared at 6/8. |
| **Geister-Rennen** *(Ghost Race)* | competitive | **Blocked on** making `makeQuestion` seedable + storing per-checkpoint timestamps. |
| **Überlebens-Marathon** *(Streak Survival)* | competitive | Needs the score board; raises only tempo, not factor size. |
| **Zauberbäckerei** *(Magic Bakery)* | concept | **Re-scope before build:** original „4 Bleche × 6 Kekse → …?" is a German word problem — violates minimal-reading. Use an **icon-only** layout (show 4 trays of 6 cookies visually, no sentence). |
| **Zahlen-Familie** *(Fact Family)* | division | **9+ flag.** Bridges ×/÷ — conceptually hard for 6–8. |
| **Welche passt nicht?** *(Odd One Out)* | divisibility | **9+ flag.** Needs `buildPuzzle` to guarantee exactly one unambiguous outlier. |
| **Volltreffer-Schätzen** *(Closest Product)* | estimation | Weaker fun-per-effort; needs `buildPuzzle` unique-closest. Shorten the title before any build. |
| **Riesen-Duell** *(Bigger Battle)* | comparison | Weaker fun-per-effort; needs a tuned product-gap and a score board. |
| **Helden-Werkstatt** *(Hero Workshop)* | economy | Effort **L**: per-accessory SVG layers on the animated runner; optional shared coin wallet. |
| **Tagesaufgabe** *(Daily Challenge)* | habit | **Blocked on** seedable `makeQuestion`; pin a single canonical difficulty so all players share the same 15 and one board (else per-`settingsKey`+date boards are empty). |

---

## 5. Drag-and-Drop Games (@dnd-kit)

Four committed games use the dragged-answer mechanic; backlog adds more. The shared wrapper below is the **single canonical pattern** — no game deviates.

| Committed game | Tier | Draggable | Droppable | Collision |
|---|---|---|---|---|
| Antwort-Karten | 🟢 Core | number chips | one big card slot | `rectIntersection` (single target) |
| Der hungrige Drache | 🟢 Core | number balls | the mouth | `rectIntersection` (single target) |
| Brücken-Bau | 🟢 Core | stones | bridge gaps (ordered) | `pointerWithin` (must overlap the active gap) |
| Zahlen-Memory | 🟢 Core | question tiles | result tiles | `pointerWithin` (many-to-many) |

### Canonical chip / slot pattern (corrects the id and win-check ambiguity)

- **`DndContext`** wraps the play area; `onDragEnd` holds win/lose logic.
- **Chips = `useDraggable`** with **`id = `chip-${index}`` (stable, unique)** and the numeric value in draggable data: **`data: { value }`**. Never key a draggable by its raw numeric value — the same number can be the correct answer one round and a distractor the next, and `makeQuestion` already uses raw values as React keys (`key={option}`, line 797) which is fine for the static MC list but unstable for DnD over-detection / `DragOverlay`.
- **Slots = `useDroppable`** with a **hitbox larger than the visible art**.
- **Win check in `onDragEnd` (spelled out fully):** if `over` is the target slot **and** `active.data.current.value === question.correct` → lock chip, glow green, `<MicroReward>`. Else → bounce. For a single big droppable, a wrong drop still reports `over = slot`, so the **value comparison is what distinguishes correct from wrong** — not the presence of `over`.
- **Collision detection by game type:** single big target → **`rectIntersection`**. **Multi-droppable games (Brücken-Bau, and backlog Korb-Sortierer/Reihe) use `pointerWithin`/`rectIntersection`, NOT `closestCenter`.** `closestCenter` always snaps to the nearest droppable, so a stone dropped in empty space would register on the wrong gap/basket — that is a bug for multi-target games, not "forgiveness."
- **`DragOverlay`** renders an enlarged, slightly tilted copy of the lifted chip — essential on touch.
- **Sensors:**
  - `PointerSensor` with `activationConstraint: { distance: 6 }`.
  - `TouchSensor` with **`delay: 80–100, tolerance: 5`** (the draft's 120ms felt laggy to young kids; tolerance kept small so an accidental drag isn't triggered while scrolling).
  - **`touch-action: none` on the draggable** so the page doesn't scroll mid-drag — mirroring the codebase's existing `touch-action: manipulation` on buttons (App.css lines 546, 748, 968).
  - **`KeyboardSensor`** added for AT users, with dnd-kit screen-reader announcements.
- **Tap-to-place fallback (required, not optional):** dnd-kit gives mouse+touch but **not** keyboard for free; and the youngest kids struggle to drag at all. Every drag game ships a **tap chip → tap slot** mode using the same value/correct comparison. This is the non-drag path for accessibility and 6-year-olds.
- **Gentle bounce on wrong:** a `chip--bounce` CSS class (translate-back + short shake), gated by `prefers-reduced-motion` (no shake when reduced).
- Solved slots **remove their listeners** so they can't re-trigger.

### Dependency & bundle

- Add **`@dnd-kit/core`** (React 19 compatible). **`@dnd-kit/sortable` is not needed** (no list reordering).
- **Code-split the drag games with `React.lazy`** so kids who only play Zahlen-Regen / Blitz don't download `@dnd-kit`. The hub lazy-loads each game on launch anyway (good for the single-file split too — see §6).
- **First build = Antwort-Karten** (simplest single-droppable) to validate the install and this wrapper before multi-droppable games.

---

## 6. Cross-Cutting Systems

| System | Proposal |
|---|---|
| 🎉 **Rewards (two tiers)** | **`<MicroReward>`** (net-new, <10 nodes) on every correct answer; the existing **`ConfettiBurst`** (fullscreen, 180 nodes, reused unchanged) only on round/game/level completion. Never fire `ConfettiBurst` per tap. |
| ⭐ **Stars & badges** | A small shared `<RewardBar>` plus a badge set, in `localStorage`. |
| 🗺️ **Progress / collection** | `localStorage` for backlog collectibles (dragon evolution, treasure islands, daily streaks), per `makeSettingsKey(settings)` where relevant. |
| 🌀 **Reduced motion** | All confetti / shake / falling animations check `prefers-reduced-motion`; heavy effects degrade to a static badge or capped speed. |
| 🌱 **Seedable engine (prereq for deterministic modes)** | `makeQuestion` calls `Math.random` directly (lines 217–220, 231) and is **not seedable**. Daily Challenge / Ghost Race **require refactoring `makeQuestion(settings, rng = Math.random)`** to accept an injected RNG (e.g. **mulberry32** seeded from the date), then threading `rng` through the distractor loop. Until that refactor lands, those modes stay in the backlog. For the daily, **pin one canonical difficulty** so all players share the same 15 questions and one board. |
| 🔊 **Sound** | **The codebase has NO audio today** — SFX (pling/boing/chew) is **entirely net-new**: asset sourcing, a mutable audio manager, and browser autoplay-policy handling. **Cut from MVP**; if added later, audio is optional + mute-toggle by default (classroom-friendly). |
| 🏗️ **File architecture** | `App.jsx` is already ~1200 lines. Putting even 10 games in it is unmaintainable. **Split each mini-game into its own file/component** under `src/minigames/`, lazy-loaded by the hub. No router needed — the hub maps `activeMiniGame` → a lazy component. This also enables the §5 code-splitting. |
| ♿ **Accessibility** | Mouse + touch parity; tap-to-place fallback for all drag games (§5); `KeyboardSensor` + DnD announcements; never color-only feedback (pair green/red with icon + motion); reduced-motion support. |
| 🏆 **Scoreboards (start local; Supabase is cross-cutting, deferred)** | Mini-games store scores in **`localStorage` only at MVP** (per `makeSettingsKey(settings)`). Putting them on the Supabase board is **not "build once"** — it touches the hardcoded `select`/`order` strings (lines 171–175), **both** mappers (`mapSupabaseEntry` 137–153, `mapEntryToSupabase` 154–168), `compareLeaderboardEntries` (86), `makeLeaderboardScoreKey` (88), the rank-dedup, and `mergeLeaderboardEntries` (107) — **plus a Supabase migration** the reviewer may not control. If/when one mode proves popular, introduce a **`mode` descriptor** `{ column, direction, scoreKey }` so each game declares its sort, add `game_mode` + `score` columns, and migrate that one mode. Time-based games (Brücken-Bau, Renn-Duell) would reuse the existing time-then-mistakes sort; score-based (Blitz, Marathon, Balloon) need the `score`/DESC addition. **None of this is in MVP.** |

---

## 7. Recommended Build Order / Roadmap

> Build order proves the platform end-to-end, then scales. Effort **S** ≈ a day or two on top of the shared wrapper; **M** ≈ a few days; **L** = bespoke art/logic.

### Phase 0 — Platform (do first, before any game ships)
1. **Extract `<DifficultyPanel settings onChange fields />`** from the `phase === 'ready'` card; have both the start card and the hub consume it.
2. **Add the „Mini Games" button** (`home-start-button` + tertiary style) and **verify the 3-button stack on 360×640 landscape**; shrink the tertiary tier if it overflows.
3. **Hub phase + state contract** (`phase === 'minigames'`, `(phase='minigame', activeMiniGame)`, `onExit`), grid of cards, `src/minigames/` folder with lazy loading.
4. **`factorPoolFor(settings)`** helper and **`<MicroReward>`** primitive.
5. **`buildPuzzle(settings, constraints)`** scaffold (unique-correct, min-gap, cap) — needed by Bingo.

### 🟢 Core (MVP — 6 of the 10)
| # | Game | Cat. | Effort | Why first |
|---|---|---|---|---|
| 1 | Antwort-Karten | Drag | S | Simplest drag; validates `@dnd-kit` + shared wrapper + tap-to-place |
| 2 | Zahlen-Regen | Arcade | M | Flagship non-drag; validates the rAF loop + MicroReward (no dnd-kit) |
| 3 | 60-Sekunden-Blitz | Compet. | S | Cheapest; designs the local score-key shape |
| 4 | Der hungrige Drache | Drag | M | Best fun/effort; builds the reusable maul/feed engine |
| 5 | Brücken-Bau | Drag | M | Strongest reuse of game DNA + `ROUTE_OPTIONS` |
| 6 | Zahlen-Memory | Drag | M | Highest learning value of the drag games |

### 🟡 Bald (the other 4 committed)
Einmaleins-Bingo (M, first user of `buildPuzzle`) · Dreh-Zwillinge (S) · Renn-Duell (S) · *(plus revisit scoreboards)*

### 🔵 Backlog (not committed)
Everything in §4.2, gated as noted — including the **seedable-`makeQuestion` refactor** that unblocks Ghost Race / Daily, the **icon-only Zauberbäckerei** re-scope, and the **9+** division/divisibility games.

---

## 8. Open Questions for Review

1. **MVP scope.** Ship the **6 Core** games, or a smaller **3-game proof** (Antwort-Karten + Zahlen-Regen + 60-Sekunden-Blitz) to validate the hub, `@dnd-kit`, the rAF loop, and the local score-key before committing the rest?
2. **Add `@dnd-kit/core`** (React 19 compatible), code-split via `React.lazy`? `@dnd-kit/sortable` is **not** needed — confirm we skip it.
3. **Scoreboards.** Confirm mini-games are **localStorage-only at MVP** (recommended), deferring the cross-cutting Supabase `game_mode`/`score` schema change + migration until one score-based mode proves popular?
4. **Settings panel extraction.** Approve extracting **`<DifficultyPanel>`** as Phase-0 work (it is a real refactor, not free reuse) and **hiding route length** on the hub for the non-route games?
5. **3-button home overflow.** Approve making „Mini Games" a **smaller tertiary tier** if the 360×640 landscape test shows the stack overflowing?
6. **Seedable engine.** Approve refactoring `makeQuestion(settings, rng = Math.random)` later to unblock Daily Challenge / Ghost Race — and **pinning one canonical difficulty** for the daily so all players share one board?
7. **German naming.** Approve the resolved names — reflex **„Bach-Sprung"** and number-line **„Zahlen-Hüpfer"** (clash resolved), and the committed titles (Antwort-Karten, Der hungrige Drache, Brücken-Bau, Zahlen-Memory, Zahlen-Regen, 60-Sekunden-Blitz, Einmaleins-Bingo, Dreh-Zwillinge, Renn-Duell)? Any to reword for the age group?
8. **Sound.** Confirm audio is **out of MVP** (no audio exists today; it is net-new with autoplay/asset/mute work).
9. **9+ content.** Confirm division (Zahlen-Familie) and divisibility (Welche passt nicht) stay **backlog + age-gated**, not in the shipped set.

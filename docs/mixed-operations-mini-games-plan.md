# Mixed-Operations Mini Games: Planning & Review

## 1. Goal

Find new, genuinely distinct mini-game ideas for a roughly 2nd-grade child that go beyond multiplication recall. These games may be more challenging than the current mini-games, but should stay low-reading, visual, touch-friendly, and playable in short rounds.

The new game family should support operation options:

- Addition (`+`)
- Subtraction (`-`)
- Multiplication (`x`)
- Division (`/`)

Division must always produce an integer result. Do not generate remainder questions and then reject them in UI; generate division from multiplication facts so the invariant is true by construction.

Existing mini-games already cover answer matching, drag-to-target recall, falling answers, Bingo, commutativity, factor pairs, and skip-counting. The ideas below avoid just reskinning those.

## 2. Math Model Needed Before Implementation

The current engine is multiplication-first (`makeQuestion(settings)`, `factorPoolFor(settings)`). Mixed-operation games need a new helper layer, not ad hoc logic in every component.

### Operation Settings

Add an operation selection control to the mini-game settings panel:

```js
operations: {
  add: true,
  subtract: true,
  multiply: true,
  divide: false,
}
```

For younger/default play, start with `+` and `-`, then unlock `x`, then `/`. For advanced mode, allow mixed operation sets.

Score keys must include the sorted operation set, e.g.

```js
makeMixedGameScoreKey(gameId, settings, { operations, includeRoute = false })
// ...|ops=add-sub-divide
```

### Question Shape

Use one shared generator:

```js
makeOperationQuestion(settings, {
  operations,
  format,        // 'result' | 'missingOperand' | 'missingOperator' | 'equationCheck'
  maxResult,
  allowCarry,
  allowBorrow,
})
```

Return:

```js
{
  op: '+',
  left: 17,
  right: 8,
  correct: 25,
  prompt: '17 + 8 = ?',
  options: [21, 25, 26, 35],
  meta: { carry: true, borrow: false }
}
```

### Integer Division Invariant

For division, generate from a valid multiplication triple:

```js
divisor = pick([2, 3, 4, 5, 6, 8, 10])
quotient = pick(1..10)
dividend = divisor * quotient
question = `${dividend} / ${divisor} = ?`
correct = quotient
```

For missing operands:

- `24 / ? = 6` -> correct `4`
- `? / 4 = 6` -> correct `24`

Never use zero as divisor. Keep dividends inside a readable range, usually `<= 100` for default 2nd-grade mode, `<= 144` or `<= 200` for advanced mode.

### Subtraction Invariant

Default: no negative results.

```js
larger = max(a, b)
smaller = min(a, b)
question = `${larger} - ${smaller} = ?`
```

Advanced option: allow crossing tens/borrowing, but still no negatives unless an explicit later mode adds signed numbers.

## 3. Recommended Game Ideas

### 3.1 Rechen-Detektiv

**Core action:** A child sees an incomplete equation such as `18 ? 6 = 3` or `12 ? 7 = 19` and chooses the missing operation.

**Why it is unique:** It trains operation sense, not answer recall. The child must decide what kind of math is happening.

**Operations:** `+`, `-`, `x`, `/` through operation options.

**Division rule:** Only generate division cases from integer triples, e.g. `24 ? 6 = 4` where `/` is the correct operation.

**Challenge dial:** Start with two possible operators, then four. Later add decoys where two operations look plausible but only one matches exactly.

**Implementation risk:** Low. Mostly button UI plus `missingOperator` generation.

**Review verdict:** Strong first mixed-operation game.

### 3.2 Zahlen-Waage

**Core action:** A balance scale has a number expression on one side. The child builds an equal expression on the other side by choosing number and operation tiles.

Example:

```text
left:  14 + 6
right: 4 x ?       -> choose 5
right: ? - 3       -> choose 23
right: 40 / ?      -> choose 2
```

**Why it is unique:** It teaches equality and equivalence, not just "solve the prompt".

**Operations:** Configurable. Works best with operation pairs, e.g. `+` and `-`, `x` and `/`, or all four.

**Division rule:** Any division expression on either side must be generated as `dividend = divisor * quotient`.

**Challenge dial:** Single missing number -> missing operation -> build full expression from tiles.

**Implementation risk:** Medium. Needs a small expression builder and strong uniqueness checks so only one answer balances.

**Review verdict:** High learning value; build after the basic mixed-operation generator is stable.

### 3.3 Roboter-Programm

**Core action:** A robot starts on a number. The child chooses command cards to reach a target.

Example:

```text
Start 12 -> [ +8 ] -> [ /4 ] -> Ziel 5
```

**Why it is unique:** Multi-step mental math and planning. This is more challenging than the current one-question games.

**Operations:** All operation options. Each command card uses an enabled operation.

**Division rule:** A `/n` command can appear only if the current number is divisible by `n`.

**Challenge dial:** One missing command, then two missing commands, then choose order-sensitive command sequences.

**Implementation risk:** Medium. Needs deterministic path generation so every level has at least one valid solution and no impossible division step.

**Review verdict:** Excellent advanced 2nd-grade game.

### 3.4 Fehler-Fabrik

**Core action:** Machines print equations, some correct and some wrong. The child taps the wrong part and fixes it.

Examples:

```text
17 + 6 = 22    -> fix result to 23
42 / 7 = 5     -> fix result to 6
9 x 4 = 45     -> fix result to 36
31 - 8 = 27    -> fix result to 23
```

**Why it is unique:** Error analysis. The child must evaluate, not only answer.

**Operations:** All operation options.

**Division rule:** Wrong division equations still start from an integer-valid correct equation; only the displayed answer is wrong.

**Challenge dial:** Fix result first. Later fix operator (`18 / 6 = 12` should become `18 - 6 = 12`) or one operand.

**Implementation risk:** Low to medium. Needs careful UI to keep reading load low.

**Review verdict:** Strong candidate; very different from current games.

### 3.5 Schatz-Koordinaten

**Core action:** A treasure is on a small grid. Operation cards move the player along a number axis or coordinate pair.

Example:

```text
x starts at 6
target x is 18
choose: x3
```

Advanced:

```text
(x, y) starts at (12, 5)
target is (4, 13)
choose: x /3, y +8
```

**Why it is unique:** Connects arithmetic to movement and spatial planning.

**Operations:** `+`, `-`, `x`, `/` as movement transforms.

**Division rule:** A division movement is available only when the current coordinate is divisible by the divisor.

**Challenge dial:** One axis -> two axes -> two-step route.

**Implementation risk:** Medium. Needs layout work but little custom art.

**Review verdict:** Good second-wave game after Roboter-Programm.

### 3.6 Bruchfreie Teilerei

**Core action:** Visual sharing game. Objects must be split equally into boxes, plates, or teams.

Example:

```text
24 apples, 6 boxes -> tap 4 apples per box
35 stars, 5 teams -> tap 7 per team
```

**Why it is unique:** Introduces division as equal sharing with no fractions or remainder language.

**Operations:** Division-first, but can include multiplication as inverse mode.

**Division rule:** Always generate `total = groups * perGroup`. The answer is either `groups` or `perGroup`.

**Challenge dial:** Choose result -> choose missing groups -> choose missing total.

**Implementation risk:** Medium because object counts must stay visually readable. Cap visible objects; use grouped icons for large totals.

**Review verdict:** Best division-specific concept for 2nd grade.

### 3.7 Rechen-Domino

**Core action:** Domino tiles have an expression on one side and a number on the other. The child builds a chain where each expression matches the previous result.

Example:

```text
Start 15 -> [9 + 6 | 30] -> [5 x 6 | 8] -> [40 / 5 | ...]
```

**Why it is unique:** It mixes recognition, sequencing, and forward planning.

**Operations:** All enabled operations.

**Division rule:** Division expressions on dominoes are generated from integer triples.

**Challenge dial:** 4-tile chain -> 6-tile chain -> distractor tiles.

**Implementation risk:** Medium. Needs generation of one valid chain plus plausible distractors.

**Review verdict:** Good puzzle candidate; not first because generation is trickier.

### 3.8 Zahlen-Zauberstab

**Core action:** A target number is protected by shields. The child casts operation spells to transform a starting number into the target.

Example:

```text
Start 7, target 28
spells: +3, x4, -1, /2
```

**Why it is unique:** Similar mental model to "number machine", but with limited resources and visible transformation. More game-like than plain commands.

**Operations:** All enabled operation cards.

**Division rule:** `/n` spells are disabled or not generated unless the current number is divisible by `n`.

**Challenge dial:** Exact target, then target range, then limited spell count.

**Implementation risk:** Medium. Needs clear disabled-state behavior for invalid division spells.

**Review verdict:** Good if the game needs a more playful Roboter-Programm variant.

### 3.9 Kassen-Chaos

**Core action:** A small shop counter shows items and coins. The child computes total, change, or missing price.

Examples:

```text
8 + 7 + 5 = ?
20 - 13 = change
4 packs cost 24 -> one pack costs 6
```

**Why it is unique:** Applies arithmetic to money-like quantities without long word problems.

**Operations:** `+` for totals, `-` for change, `x` for repeated prices, `/` for equal pack price.

**Division rule:** Pack totals are generated as `pricePerPack * packCount`.

**Challenge dial:** Two items -> three items -> missing item price -> equal packs.

**Implementation risk:** Medium. Needs icon/item layout, but strong real-world value.

**Review verdict:** Strong applied-math candidate.

### 3.10 Zahlen-Labor

**Core action:** Sort equations into beakers by result range: `< 10`, `10-20`, `> 20`, or exact target beakers.

**Why it is unique:** Trains estimation and comparison before exact solving. This is more challenging and less rote.

**Operations:** All enabled operations.

**Division rule:** Division expressions still integer-only; ranges use the integer quotient.

**Challenge dial:** Broad ranges -> narrow ranges -> exact target buckets.

**Implementation risk:** Medium. Similar drag mechanics to existing games, but the math task is different enough.

**Review verdict:** Good, but avoid as first build because it reuses drag-to-bucket UI.

### 3.11 Rechen-Radar

**Core action:** A radar sweeps over equation blips. The child must tap only equations matching a target property.

Examples:

```text
Tap all that equal 12.
Tap all division tasks.
Tap all tasks bigger than 20.
```

**Why it is unique:** Inhibition and classification. It is not just "find the answer".

**Operations:** All enabled operations.

**Division rule:** All division blips are integer-valid.

**Challenge dial:** Exact result -> range -> operation family -> mixed target rule.

**Implementation risk:** Medium/high due to timing and accessibility; requires reduced-motion fallback.

**Review verdict:** Good later arcade game.

### 3.12 Zahlen-Baumeister

**Core action:** Build a tower where each floor must equal the previous floor after applying an operation.

Example:

```text
Floor 1: 9
Floor 2: +6 -> 15
Floor 3: x2 -> 30
Floor 4: /5 -> 6
```

**Why it is unique:** Chained arithmetic with visible state. Similar challenge to Roboter-Programm, but vertical/progression-based.

**Operations:** All enabled operations.

**Division rule:** Division floor only appears when current value is divisible by the divisor.

**Challenge dial:** Fill result -> choose operation -> choose operation and operand.

**Implementation risk:** Medium. Needs careful generation to avoid exploding numbers.

**Review verdict:** Solid alternative if Roboter-Programm feels too abstract.

## 4. Recommended Build Order

### Phase 1: Shared Platform

1. Add operation settings to mini-game settings.
2. Add `makeOperationQuestion`.
3. Add helper variants:
   - `makeMissingOperatorQuestion`
   - `makeMissingOperandQuestion`
   - `makeIntegerDivisionQuestion`
   - `makeEquationCheckQuestion`
4. Add tests for:
   - no negative subtraction by default
   - no zero divisors
   - every division has integer quotient
   - mixed operation options only emit enabled operations
   - distractors are unique and include exactly one correct answer

### Phase 2: First Games

1. **Rechen-Detektiv**: cheapest proof of mixed-operation mode.
2. **Bruchfreie Teilerei**: proves integer division visually.
3. **Fehler-Fabrik**: proves equation-check mode.
4. **Roboter-Programm**: proves multi-step generation.

### Phase 3: More Advanced

5. **Zahlen-Waage**
6. **Kassen-Chaos**
7. **Schatz-Koordinaten**
8. **Rechen-Domino**

### Later / Optional

- **Rechen-Radar** if an arcade mixed-operation game is wanted.
- **Zahlen-Zauberstab** if a playful spell/transform theme is preferred over robot commands.
- **Zahlen-Labor** if estimation/range sorting becomes a learning goal.
- **Zahlen-Baumeister** if tower progression fits the app theme better than coordinates.

## 5. Review Matrix

| Game | Primary skill | Operations | Unique vs current games | Risk | Recommendation |
|---|---|---|---|---|---|
| Rechen-Detektiv | operation sense | + - x / | high | low | build first |
| Zahlen-Waage | equality/equivalence | + - x / | high | medium | build early |
| Roboter-Programm | multi-step planning | + - x / | high | medium | build early |
| Fehler-Fabrik | error analysis | + - x / | high | low/medium | build early |
| Schatz-Koordinaten | arithmetic as movement | + - x / | high | medium | second wave |
| Bruchfreie Teilerei | integer division concept | /, x | high | medium | build early |
| Rechen-Domino | sequencing | + - x / | high | medium | second wave |
| Zahlen-Zauberstab | transforms/resources | + - x / | medium/high | medium | optional |
| Kassen-Chaos | applied totals/change | + - x / | high | medium | second wave |
| Zahlen-Labor | estimation/classification | + - x / | medium | medium | optional |
| Rechen-Radar | inhibition/classification | + - x / | high | medium/high | later |
| Zahlen-Baumeister | chained arithmetic | + - x / | medium/high | medium | optional |

## 6. Design Gates

Every game must pass these before implementation is considered complete:

- Operation toggles work: disabled operations never appear.
- Division is integer-only by construction.
- No division by zero.
- Default subtraction never goes below zero.
- No question has more than one correct answer.
- Reading load stays low: use symbols, numbers, icons, and short German labels.
- Tap targets stay at least roughly 48px.
- Mobile portrait and landscape are checked.
- Reduced-motion mode avoids heavy animation.
- Local score keys include operation set.
- Achievement `gameId` is stable before shipping.

## 7. Open Review Questions

1. Should division be visible to every child, or gated behind a parent/advanced toggle?
2. Should mixed operation games use the existing `difficulty: small/large`, or a new 2nd-grade number-range setting such as `bis 20`, `bis 100`, `bis 200`?
3. Should subtraction allow borrowing by default?
4. Should multiplication/division ranges follow the current `small/large` Einmaleins settings, or use a smaller 2nd-grade-specific table set first (`2, 5, 10`, then `3, 4`, then all up to 10)?
5. Should operation-specific achievements exist, or should these games only feed generic correct/perfect/streak achievements?

## 8. Summary Recommendation

The best next mixed-operation path is:

1. Build the shared operation generator and operation settings.
2. Implement **Rechen-Detektiv**.
3. Implement **Bruchfreie Teilerei**.
4. Implement **Fehler-Fabrik**.
5. Implement **Roboter-Programm**.

This sequence proves the four important new math modes: operation choice, integer division, error analysis, and multi-step arithmetic.

## 9. Implementation Status

Implemented in the first build pass:

- Shared operation settings in the mini-game settings panel.
- `makeMixedGameScoreKey(...)` so local scores include the enabled operation set.
- Mixed-operation question helpers:
  - `makeOperationQuestion`
  - `makeMissingOperatorQuestion`
  - `makeMissingOperandQuestion`
  - `makeIntegerDivisionQuestion`
  - `makeEquationCheckQuestion`
  - `makeSharingQuestion`
- Unit tests for operation filtering, integer-only division, no negative subtraction by default, and unique answer options.
- Playable games:
  - **Rechen-Detektiv**
  - **Bruchfreie Teilerei**
  - **Fehler-Fabrik**
  - **Roboter-Programm**

Still planning-only:

- Zahlen-Waage
- Kassen-Chaos
- Schatz-Koordinaten
- Rechen-Domino
- Rechen-Radar
- Zahlen-Zauberstab
- Zahlen-Labor
- Zahlen-Baumeister

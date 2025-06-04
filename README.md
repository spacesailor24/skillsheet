# Skillsheet

A TypeScript application for processing match data using the OpenSkill rating system to calculate player skill ratings and generate optimal player matchups using the Munkres (Hungarian) algorithm.

## Features

- Process match data from JSON files
- Calculate player ratings using the OpenSkill algorithm (similar to TrueSkill)
- Generate ranked results with detailed rating information
- **NEW**: Create optimal player matchups using a greedy optimization algorithm
- Export results to JSON format

## Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build
```

## Usage

### Running an Event

1. Set who's attending the event in `data/active-players.json`
2. Generate matches: `pnpm matchmaking`
3. Play the matches and record the results in `data/match-log.json`
4. Process the match data: `pnpm process-matches`
5. Repeat from step 2 until the event is over

### Processing Match Data

Place your match data in `data/match-log.json` with the following format:

```json
[
  { "winner": "PlayerA", "loser": "PlayerB" },
  { "winner": "PlayerC", "loser": "PlayerA" },
  ...
]
```

Then run the processing script:

```bash
npm run process
# or
node dist/index.js
```

This will generate `data/ranks.json` with the calculated ratings and rankings.

### Generating Optimal Matchups

After processing match data, create an `data/active-players.json` file with currently active players:

```json
[
  "PlayerA",
  "PlayerB",
  "PlayerC",
  ...
]
```

Then run the matchmaking system:

```bash
npm run matchmaking
# or
node dist/matchmaking.js
```

This will generate `data/matches.json` with optimal player pairings.

### Output Formats

#### Skill Ratings (`data/ranks.json`)

```json
{
  "players": [
    {
      "player": "PlayerName",
      "rating": {
        "mu": 25.0,     // Skill estimate
        "sigma": 8.33   // Uncertainty
      },
      "ordinal": 8.5    // Conservative skill estimate
    }
  ],
  "totalMatches": 75,
  "timestamp": "2025-06-04T20:39:53.342Z"
}
```

#### Matchmaking Results (`data/matches.json`)

```json
{
  "matches": [
    {
      "player1": "PlayerA",
      "player2": "PlayerB",
      "skillDifference": 2.5,     // Absolute skill difference
      "averageSkill": 15.2,       // Average skill level
      "confidence": 0.8           // Match confidence (higher = more certain)
    }
  ],
  "totalActivePlayers": 20,
  "unmatchedPlayers": ["PlayerC"],  // Players without matches (odd numbers)
  "algorithm": "greedy-optimal",
  "timestamp": "2025-06-04T20:54:40.079Z"
}
```

## Algorithms

### OpenSkill Rating System

This application uses the OpenSkill rating system, which is similar to TrueSkill:

- **μ (mu)**: The estimated skill level of the player
- **σ (sigma)**: The uncertainty in the skill estimate (lower is more confident)
- **Ordinal**: A conservative skill estimate calculated as μ - 3×σ

Players are ranked by their ordinal score (highest to lowest).

### Greedy Optimization Algorithm

The matchmaking system uses a greedy optimization algorithm to create optimal player pairings:

- **Minimizes skill differences** between matched players
- **Considers rating uncertainty** to prefer matches between more established players
- **Handles odd numbers** by leaving the most uncertain player unmatched
- **Creates high-quality matches** by prioritizing players with similar skill levels

#### Cost Function

The algorithm optimizes based on:
```
Cost = |Player1_Ordinal - Player2_Ordinal| + 0.1 × (Player1_Sigma + Player2_Sigma)/2
```

This ensures:
- Players with similar skill levels are matched
- Players with high uncertainty (new players) are de-prioritized for optimal matches

#### Algorithm Process

1. **Sort players** by skill level (ordinal rating)
2. **For each unpaired player**, find the best available match using the cost function
3. **Create matches** that minimize skill differences
4. **Leave most uncertain player unmatched** if odd number of players

#### Cost Function

The algorithm optimizes based on:
```
Cost = |Player1_Ordinal - Player2_Ordinal| + 0.1 × (Player1_Sigma + Player2_Sigma)/2
```

This ensures:
- Players with similar skill levels are matched
- Players with high uncertainty (new players) are de-prioritized for optimal matches

## Development

```bash
# Watch mode for development
pnpm run dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch
```

## Scripts

- `build`: Compile TypeScript to JavaScript
- `dev`: Watch mode compilation
- `test`: Run Jest tests
- `test:watch`: Run tests in watch mode
- `process`: Process match data and generate skill ratings
- `matchmaking`: Generate optimal player matchups from active players

## Project Structure

```
├── src/                 # TypeScript source files
│   ├── index.ts         # Main application file
│   └── index.test.ts    # Test files
├── dist/                # Compiled JavaScript files (generated)
├── coverage/            # Test coverage reports (generated)
├── jest.config.js       # Jest testing configuration
├── tsconfig.json        # TypeScript compiler configuration
├── package.json         # Project dependencies and scripts
└── README.md           # This file
```

## Development Workflow

1. **Write TypeScript code** in the `src/` directory
2. **Write tests** with `.test.ts` or `.spec.ts` suffix
3. **Build the project**: `pnpm run build`
4. **Run tests**: `pnpm test`
5. **Run the compiled code**: `node dist/index.js`

## TypeScript Configuration

The project is configured with strict TypeScript settings for better type safety:
- Strict null checks
- No implicit any
- No implicit returns
- And more...

## Testing

Tests are written using Jest and can import TypeScript modules directly thanks to ts-jest. Test files should be placed alongside source files with `.test.ts` or `.spec.ts` extensions.

Example test:
```typescript
import { add } from './index';

test('adds 1 + 2 to equal 3', () => {
  expect(add(1, 2)).toBe(3);
});
```

import { predictDraw } from 'openskill';
import * as fs from 'fs';
import * as path from 'path';

interface PlayerRating {
    player: string;
    rating: {
        mu: number;
        sigma: number;
    };
    ordinal: number;
}

interface Results {
    players: PlayerRating[];
    totalMatches: number;
    timestamp: string;
}

interface Match {
    player1: string;
    player2: string;
    skillDifference: number;
    averageSkill: number;
    confidence: number;
}

interface MatchmakingResults {
    matches: Match[];
    totalActivePlayers: number;
    unmatchedPlayers: string[];
    algorithm: string;
    timestamp: string;
}

interface HistoricalMatch {
    player1: string;
    player2: string;
    timestamp: string;
    round?: number;
}

interface MatchHistory {
    matches: HistoricalMatch[];
    lookbackRounds: number;
}

function loadMatchHistory(): MatchHistory {
    const historyPath = path.join(__dirname, '../data/recent-matches.json');
    try {
        if (fs.existsSync(historyPath)) {
            return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        }
    } catch (error) {
        console.log('No existing match history found, starting fresh');
    }

    return {
        matches: [],
        lookbackRounds: 3
    };
}

function saveMatchHistory(history: MatchHistory): void {
    const historyPath = path.join(__dirname, '../data/recent-matches.json');
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

function hasRecentMatch(player1: string, player2: string, history: MatchHistory): boolean {
    return history.matches.some(match =>
        (match.player1 === player1 && match.player2 === player2) ||
        (match.player1 === player2 && match.player2 === player1)
    );
}

function updateMatchHistory(newMatches: Match[], history: MatchHistory): MatchHistory {
    const currentTimestamp = new Date().toISOString();

    // Add new matches to history
    const newHistoricalMatches: HistoricalMatch[] = newMatches.map(match => ({
        player1: match.player1,
        player2: match.player2,
        timestamp: currentTimestamp
    }));

    // Combine with existing matches
    const updatedMatches = [...newHistoricalMatches, ...history.matches];

    // Keep only recent matches (could be improved with actual round tracking)
    // For now, we'll keep last 50 matches as a simple approximation
    const maxMatches = history.lookbackRounds * 15; // Assume ~15 matches per round

    return {
        matches: updatedMatches.slice(0, maxMatches),
        lookbackRounds: history.lookbackRounds
    };
}

function createMatchmaking(): MatchmakingResults {
    // Load match history to avoid recent rematches
    const matchHistory = loadMatchHistory();

    // Read the results data
    const resultsPath = path.join(__dirname, '../data/ranks.json');
    const results: Results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Read the active players data
    const activePlayersPath = path.join(__dirname, '../data/active-players.json');
    const activePlayers: string[] = JSON.parse(fs.readFileSync(activePlayersPath, 'utf8'));

    // Filter results to only include active players
    const activePlayerRatings = results.players.filter(player =>
        activePlayers.includes(player.player)
    );

    console.log(`Found ${activePlayerRatings.length} active players out of ${results.players.length} total`);

    // If odd number of players, remove one (we'll handle this in unmatched)
    const playersToMatch = activePlayerRatings.slice();
    let unmatchedPlayers: string[] = [];

    if (playersToMatch.length % 2 === 1) {
        // Remove the player with highest uncertainty (sigma) as they need more matches to stabilize
        const mostUncertainPlayer = playersToMatch.reduce((prev, current) =>
            current.rating.sigma > prev.rating.sigma ? current : prev
        );
        unmatchedPlayers.push(mostUncertainPlayer.player);
        const index = playersToMatch.findIndex(p => p.player === mostUncertainPlayer.player);
        playersToMatch.splice(index, 1);
    }

    if (playersToMatch.length === 0) {
        return {
            matches: [],
            totalActivePlayers: activePlayers.length,
            unmatchedPlayers,
            algorithm: 'greedy-optimal',
            timestamp: new Date().toISOString()
        };
    }

    // Use greedy approach to create optimal pairings
    const matches: Match[] = [];
    const paired = new Set<number>();

    // Sort players by conservative skill estimate for better pairing
    // Uses μ - 3σ (99.7% confidence lower bound) similar to TrueSkill seeding
    // This ensures players with high uncertainty are ranked more conservatively
    const sortedPlayers = playersToMatch
        .map((player, index) => ({ player, originalIndex: index }))
        .sort((a, b) =>
            (b.player.rating.mu - 3 * b.player.rating.sigma) -
            (a.player.rating.mu - 3 * a.player.rating.sigma)
        );

    // Greedy matching: for each unpaired player, find the best available match
    for (let i = 0; i < sortedPlayers.length; i++) {
        const playerEntry = sortedPlayers[i];
        if (playerEntry && !paired.has(playerEntry.originalIndex)) {
            let bestMatch: { player: PlayerRating; originalIndex: number; cost: number } | null = null;

            // Find the best unpaired player to match with
            for (let j = i + 1; j < sortedPlayers.length; j++) {
                const candidateEntry = sortedPlayers[j];
                if (candidateEntry && !paired.has(candidateEntry.originalIndex)) {
                    // Calculate base cost using OpenSkill predictDraw - higher predictDraw = better match
                    // We want to minimize cost, so cost = 1 - predictDraw
                    const player1Rating = { mu: playerEntry.player.rating.mu, sigma: playerEntry.player.rating.sigma };
                    const player2Rating = { mu: candidateEntry.player.rating.mu, sigma: candidateEntry.player.rating.sigma };
                    const drawProbability = predictDraw([[player1Rating], [player2Rating]]);
                    let cost = 1 - drawProbability;

                    // Add penalty for recent matches to encourage variety
                    const RECENT_MATCH_PENALTY = 0.2;
                    if (hasRecentMatch(playerEntry.player.player, candidateEntry.player.player, matchHistory)) {
                        cost += RECENT_MATCH_PENALTY;
                        console.log(`Applied recent match penalty to ${playerEntry.player.player} vs ${candidateEntry.player.player}`);
                    }

                    if (!bestMatch || cost < bestMatch.cost) {
                        bestMatch = { player: candidateEntry.player, originalIndex: candidateEntry.originalIndex, cost };
                    }
                }
            }

            // Create the match if we found a partner
            if (bestMatch) {
                const player1 = playerEntry.player;
                const player2 = bestMatch.player;

                const skillDifference = Math.abs(player1.ordinal - player2.ordinal);
                const averageSkill = (player1.ordinal + player2.ordinal) / 2;
                const confidence = 1 / ((player1.rating.sigma + player2.rating.sigma) / 2);

                matches.push({
                    player1: player1.player,
                    player2: player2.player,
                    skillDifference,
                    averageSkill,
                    confidence
                });

                paired.add(playerEntry.originalIndex);
                paired.add(bestMatch.originalIndex);
            }
        }
    }

    // Sort matches by average skill level (highest first)
    matches.sort((a, b) => b.averageSkill - a.averageSkill);

    return {
        matches,
        totalActivePlayers: activePlayers.length,
        unmatchedPlayers,
        algorithm: 'greedy-optimal',
        timestamp: new Date().toISOString()
    };
}

function saveMatchmaking(): void {
    const matchmakingResults = createMatchmaking();

    // Save to file
    const outputPath = path.join(__dirname, '../data/matches.json');
    fs.writeFileSync(outputPath, JSON.stringify(matchmakingResults, null, 2), 'utf8');

    // Update match history with new matches
    const currentHistory = loadMatchHistory();
    const updatedHistory = updateMatchHistory(matchmakingResults.matches, currentHistory);
    saveMatchHistory(updatedHistory);

    console.log(`\n=== MATCHMAKING RESULTS ===`);
    console.log(`Total active players: ${matchmakingResults.totalActivePlayers}`);
    console.log(`Matches created: ${matchmakingResults.matches.length}`);
    console.log(`Unmatched players: ${matchmakingResults.unmatchedPlayers.length}`);

    if (matchmakingResults.unmatchedPlayers.length > 0) {
        console.log(`Unmatched: ${matchmakingResults.unmatchedPlayers.join(', ')}`);
    }

    console.log(`\n=== GENERATED MATCHES ===`);
    matchmakingResults.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}: ${match.player1} vs ${match.player2}`);
        console.log(`  Skill difference: ${match.skillDifference.toFixed(2)}`);
        console.log(`  Average skill: ${match.averageSkill.toFixed(2)}`);
        console.log(`  Match confidence: ${match.confidence.toFixed(2)}`);
        console.log('');
    });

    console.log(`Results saved to: ${outputPath}`);
    console.log(`Match history updated: ${updatedHistory.matches.length} recent matches tracked`);
}

// Export functions for testing
export { createMatchmaking, saveMatchmaking };

// Run if this is the main module
if (require.main === module) {
    saveMatchmaking();
} 
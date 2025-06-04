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

function createMatchmaking(): MatchmakingResults {
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

    // Sort players by skill level for better pairing
    const sortedPlayers = playersToMatch
        .map((player, index) => ({ player, originalIndex: index }))
        .sort((a, b) => b.player.ordinal - a.player.ordinal);

    // Greedy matching: for each unpaired player, find the best available match
    for (let i = 0; i < sortedPlayers.length; i++) {
        const playerEntry = sortedPlayers[i];
        if (playerEntry && !paired.has(playerEntry.originalIndex)) {
            let bestMatch: { player: PlayerRating; originalIndex: number; cost: number } | null = null;

            // Find the best unpaired player to match with
            for (let j = i + 1; j < sortedPlayers.length; j++) {
                const candidateEntry = sortedPlayers[j];
                if (candidateEntry && !paired.has(candidateEntry.originalIndex)) {
                    // Calculate cost (skill difference + uncertainty penalty)
                    const skillDiff = Math.abs(playerEntry.player.ordinal - candidateEntry.player.ordinal);
                    const uncertaintyPenalty = (playerEntry.player.rating.sigma + candidateEntry.player.rating.sigma) / 2;
                    const cost = skillDiff + uncertaintyPenalty * 0.1;

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
}

// Export functions for testing
export { createMatchmaking, saveMatchmaking };

// Run if this is the main module
if (require.main === module) {
    saveMatchmaking();
} 
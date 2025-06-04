import { rating, rate, ordinal } from 'openskill';
import * as fs from 'fs';
import * as path from 'path';

interface Match {
    winner: string;
    loser: string;
}

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

function processMatches(): void {
    // Read the match data
    const dataPath = path.join(__dirname, '../data/match-log.json');
    const matchData: Match[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Initialize player ratings
    const playerRatings = new Map<string, ReturnType<typeof rating>>();

    // Process each match
    matchData.forEach((match) => {
        // Get or create ratings for both players
        const winnerRating = playerRatings.get(match.winner) || rating();
        const loserRating = playerRatings.get(match.loser) || rating();

        // Rate the match (winner vs loser)
        const ratedTeams = rate([
            [winnerRating], // winner team
            [loserRating]   // loser team
        ]);

        // Update the ratings - ensure we have valid results
        if (ratedTeams.length >= 2 &&
            ratedTeams[0] && ratedTeams[0].length > 0 &&
            ratedTeams[1] && ratedTeams[1].length > 0) {
            const newWinnerRating = ratedTeams[0][0];
            const newLoserRating = ratedTeams[1][0];
            if (newWinnerRating && newLoserRating) {
                playerRatings.set(match.winner, newWinnerRating);
                playerRatings.set(match.loser, newLoserRating);
            }
        }
    });

    // Convert to results format and sort by ordinal (skill level)
    const results: PlayerRating[] = Array.from(playerRatings.entries())
        .map(([player, rating]) => ({
            player,
            rating: {
                mu: rating.mu,
                sigma: rating.sigma
            },
            ordinal: ordinal(rating)
        }))
        .sort((a, b) => b.ordinal - a.ordinal); // Sort by ordinal descending (best to worst)

    // Prepare final results
    const finalResults: Results = {
        players: results,
        totalMatches: matchData.length,
        timestamp: new Date().toISOString()
    };

    // Save results to file
    const outputPath = path.join(__dirname, '../data/ranks.json');
    fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2), 'utf8');

    console.log(`Processed ${matchData.length} matches for ${results.length} players`);
    console.log(`Results saved to: ${outputPath}`);
    console.log('\nPlayer Rankings:');
    results.forEach((player, index) => {
        console.log(`${index + 1}. ${player.player} - Ordinal: ${player.ordinal.toFixed(2)} (μ: ${player.rating.mu.toFixed(2)}, σ: ${player.rating.sigma.toFixed(2)})`);
    });
}

// Export for testing
export { processMatches };

// Run if this is the main module
if (require.main === module) {
    processMatches();
}

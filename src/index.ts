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

interface SkillGroup {
    name: string;
    players: PlayerRating[];
    minOrdinal: number;
    maxOrdinal: number;
}

function createSkillGroups(players: PlayerRating[]): SkillGroup[] {
    // Sort players by ordinal rating
    const sortedPlayers = [...players].sort((a, b) => b.ordinal - a.ordinal);

    if (sortedPlayers.length === 0) return [];

    const groups: SkillGroup[] = [];
    const MAX_GROUP_RANGE = 3.0; // Maximum ordinal difference within a group
    const MAX_GROUP_SIZE = 6;    // Maximum players per group

    let currentGroup: PlayerRating[] = [];

    for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i];
        if (!player) continue;

        // If this is the first player or we need to start a new group
        if (currentGroup.length === 0) {
            currentGroup = [player];
            continue;
        }

        const groupStartOrdinal = currentGroup[0]?.ordinal ?? 0;
        const ordinalDiff = groupStartOrdinal - player.ordinal;

        // Adaptive max range - tighter for higher skill levels
        let adaptiveMaxRange = MAX_GROUP_RANGE;
        if (groupStartOrdinal > 15) {
            adaptiveMaxRange = 2.0; // Very tight for elite players
        } else if (groupStartOrdinal > 5) {
            adaptiveMaxRange = 2.5; // Tight for advanced players
        }

        // Start a new group if:
        // 1. Current group would exceed adaptive max range (regardless of size), OR
        // 2. Current group is at max size
        if (ordinalDiff > adaptiveMaxRange || currentGroup.length >= MAX_GROUP_SIZE) {
            // Finalize current group
            groups.push(createGroup(currentGroup, groups.length));

            // Start new group with current player
            currentGroup = [player];
        } else {
            currentGroup.push(player);
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push(createGroup(currentGroup, groups.length));
    }

    return groups;
}

function createGroup(players: PlayerRating[], groupIndex: number): SkillGroup {
    const maxOrdinal = Math.max(...players.map(p => p.ordinal));
    const minOrdinal = Math.min(...players.map(p => p.ordinal));

    const starCitizenRanks = [
        "Vanguard Ace",           // Elite dogfighting legend
        "Strike Captain",         // Top-tier tactical combat pilot
        "Interceptor",            // High-skill, fast-response pilot
        "Combat Aviator",         // Proven in multiple engagements
        "Battle Wingman",         // Reliable and skilled fighter
        "Deck Pilot",             // Competent line pilot in regular service
        "Flight Cadet",           // In training, developing skills
        "Naval Trainee",          // New recruit with basic certs
        "Sim Rookie",             // Beginner with mostly sim experience
        "New Wing"              // Entry-level, barely flown live missions
    ];

    // Use group index to assign unique names, fallback to numbered if we exceed the list
    let groupName: string;
    if (groupIndex < starCitizenRanks.length) {
        groupName = `${starCitizenRanks[groupIndex]} (min: ${minOrdinal.toFixed(1)}, max: ${maxOrdinal.toFixed(1)})`;
    } else {
        groupName = `Civilian Pilot ${groupIndex - starCitizenRanks.length + 1} (min: ${minOrdinal.toFixed(1)}, max: ${maxOrdinal.toFixed(1)})`;
    }

    return {
        name: groupName,
        players,
        minOrdinal,
        maxOrdinal
    };
}

function processMatches(): void {
    // Read the match data
    const dataPath = path.join(__dirname, '../data/match-log.json');
    const matchData: Match[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Initialize player ratings and win/loss records
    const playerRatings = new Map<string, ReturnType<typeof rating>>();
    const playerRecords = new Map<string, { wins: number, losses: number }>();

    // Process each match
    matchData.forEach((match) => {
        // Initialize records if they don't exist
        if (!playerRecords.has(match.winner)) {
            playerRecords.set(match.winner, { wins: 0, losses: 0 });
        }
        if (!playerRecords.has(match.loser)) {
            playerRecords.set(match.loser, { wins: 0, losses: 0 });
        }

        // Update win/loss records
        const winnerRecord = playerRecords.get(match.winner)!;
        const loserRecord = playerRecords.get(match.loser)!;
        winnerRecord.wins++;
        loserRecord.losses++;
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
    // console.log(`Results saved to: ${outputPath}`);

    // Group players by skill level for better display
    const skillGroups = createSkillGroups(results);

    // Display rank summary
    // console.log(`\n=== RANK SUMMARY ===`);
    console.log(`\nRank           | Players | Range`);
    console.log(`---------------|---------|------------------`);
    skillGroups.forEach(group => {
        const rankName = group.name.split(' (')[0] || group.name;
        console.log(`${rankName.padEnd(14, ' ')} |    ${group.players.length.toString().padStart(2, ' ')}   | ${group.minOrdinal.toFixed(1)} to ${group.maxOrdinal.toFixed(1)}`);
    });

    // Create a map of player to their skill group
    const playerToRank = new Map<string, string>();
    skillGroups.forEach(group => {
        const rankName = group.name.split(' (')[0] || group.name;
        group.players.forEach(player => {
            playerToRank.set(player.player, rankName);
        });
    });

    // console.log(`\n=== PLAYER RANKINGS ===`);
    console.log(`\n#   Player             | Rank           | Win/Loss | Rating`);
    console.log(`----|------------------|----------------|----------|-------`);
    results.forEach((player, index) => {
        const rankName = playerToRank.get(player.player) || 'Unknown';
        const record = playerRecords.get(player.player) || { wins: 0, losses: 0 };
        const winLoss = `${record.wins}/${record.losses}`;
        console.log(`${(index + 1).toString().padStart(2, ' ')}. ${player.player.padEnd(18, ' ')} | ${rankName.padEnd(14, ' ')} | ${winLoss.padEnd(8, ' ')} | ${player.ordinal.toFixed(2)}`);
    });
}

// Export for testing
export { processMatches };

// Run if this is the main module
if (require.main === module) {
    processMatches();
}

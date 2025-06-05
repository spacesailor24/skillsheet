import { predictDraw, rating } from 'openskill';
import * as fs from 'fs';
import * as path from 'path';
import { activePlayers } from './active-players';

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

interface SkillGroup {
    name: string;
    players: PlayerRating[];
    minOrdinal: number;
    maxOrdinal: number;
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

function createSkillGroups(players: PlayerRating[]): SkillGroup[] {
    // Sort players by ordinal rating
    const sortedPlayers = [...players].sort((a, b) => b.ordinal - a.ordinal);

    if (sortedPlayers.length === 0) return [];

    const groups: SkillGroup[] = [];
    const MAX_GROUP_RANGE = 3.0; // Maximum ordinal difference within a group (tightened)
    const MAX_GROUP_SIZE = 6;    // Maximum players per group (reduced for better balance)

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
        "UEE Navy Vanguard",
        "Fleet Commander",
        "Wing Commander",
        "Squadron Ace",
        "Strike Pilot",
        "Mercenary Pilot",
        "Freelancer Pilot",
        "Civilian Pilot",
        "Rookie Pilot",
        "Cadet"
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

function getPlayerGroup(playerName: string, groups: SkillGroup[]): SkillGroup | null {
    return groups.find(group =>
        group.players.some(p => p.player === playerName)
    ) || null;
}

function createMatchmaking(): MatchmakingResults {
    // Load match history to avoid recent rematches
    const matchHistory = loadMatchHistory();

    // Read previous matchmaking results to get last unmatched players
    let previouslyUnmatched: string[] = [];
    const matchesPath = path.join(__dirname, '../data/matches.json');
    try {
        if (fs.existsSync(matchesPath)) {
            const previousResults: MatchmakingResults = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
            previouslyUnmatched = previousResults.unmatchedPlayers || [];
            console.log(`Loaded previous unmatched players: ${previouslyUnmatched.join(', ') || 'none'}`);
        }
    } catch (error) {
        console.log('No previous matches.json found, starting fresh');
    }

    // Read the results data
    const resultsPath = path.join(__dirname, '../data/ranks.json');
    const results: Results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Create a map of existing player ratings for quick lookup
    const existingRatings = new Map<string, PlayerRating>();
    results.players.forEach(player => {
        existingRatings.set(player.player, player);
    });

    // Create ratings for all active players (including new ones)
    const activePlayerRatings: PlayerRating[] = activePlayers.map(playerName => {
        if (existingRatings.has(playerName)) {
            // Use existing rating
            return existingRatings.get(playerName)!;
        } else {
            // Create default rating for new player
            const defaultRating = rating();
            console.log(`Creating default rating for new player: ${playerName}`);
            return {
                player: playerName,
                rating: {
                    mu: defaultRating.mu,
                    sigma: defaultRating.sigma
                },
                ordinal: 0 // New players start at 0 ordinal
            };
        }
    });

    console.log(`Found ${activePlayerRatings.filter(p => existingRatings.has(p.player)).length} existing players and ${activePlayerRatings.filter(p => !existingRatings.has(p.player)).length} new players`);

    // Create skill groups for balanced matchmaking
    const skillGroups = createSkillGroups(activePlayerRatings);
    console.log(`\n=== SKILL GROUPS ===`);
    skillGroups.forEach((group, index) => {
        console.log(`${group.name}: ${group.players.length} players`);
        console.log(`  Players: ${group.players.map(p => p.player).join(', ')}`);
    });

    // Check if any previously unmatched players are active this round
    const activeUnmatchedFromLast = previouslyUnmatched.filter(player =>
        activePlayers.includes(player)
    );

    if (activeUnmatchedFromLast.length > 0) {
        console.log(`Previously unmatched players who are active: ${activeUnmatchedFromLast.join(', ')}`);
    }

    // If odd number of players, remove one (we'll handle this in unmatched)
    const playersToMatch = activePlayerRatings.slice();
    let unmatchedPlayers: string[] = [];

    if (playersToMatch.length % 2 === 1) {
        // Prioritize matching previously unmatched players by removing someone else
        // Only remove a previously unmatched player if they're the only option
        let playerToRemove: PlayerRating;

        const nonPreviouslyUnmatched = playersToMatch.filter(player =>
            !previouslyUnmatched.includes(player.player)
        );

        if (nonPreviouslyUnmatched.length > 0) {
            // Remove from players who weren't unmatched last time, preferring highest uncertainty
            playerToRemove = nonPreviouslyUnmatched.reduce((prev, current) =>
                current.rating.sigma > prev.rating.sigma ? current : prev
            );
            console.log(`Removing ${playerToRemove.player} (wasn't previously unmatched, high uncertainty)`);
        } else {
            // All players were unmatched last time, so remove the one with highest uncertainty
            playerToRemove = playersToMatch.reduce((prev, current) =>
                current.rating.sigma > prev.rating.sigma ? current : prev
            );
            console.log(`Removing ${playerToRemove.player} (high uncertainty, all were previously unmatched)`);
        }

        if (previouslyUnmatched.includes(playerToRemove.player)) {
            console.warn(`${playerToRemove.player} is unmatched two rounds in a row.`);
        }

        unmatchedPlayers.push(playerToRemove.player);
        const index = playersToMatch.findIndex(p => p.player === playerToRemove.player);
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

                    // Dynamic skill group penalties - scale based on group distance
                    const player1Group = getPlayerGroup(playerEntry.player.player, skillGroups);
                    const player2Group = getPlayerGroup(candidateEntry.player.player, skillGroups);

                    const RECENT_MATCH_PENALTY = 0.1;  // Reduced from 0.2 to favor skill balance

                    if (player1Group && player2Group && player1Group.name !== player2Group.name) {
                        // Calculate group distance (how many groups apart they are)
                        const player1GroupIndex = skillGroups.findIndex(g => g.name === player1Group.name);
                        const player2GroupIndex = skillGroups.findIndex(g => g.name === player2Group.name);
                        const groupGap = Math.abs(player1GroupIndex - player2GroupIndex);

                        // Dynamic penalty scaling:
                        // Adjacent groups (gap=1): 0.15 penalty (allows close crossover)
                        // 2 groups apart: 0.35 penalty  
                        // 3+ groups apart: 0.6+ penalty (heavily discouraged)
                        let crossGroupPenalty: number;
                        if (groupGap === 1) {
                            crossGroupPenalty = 0.15; // Light penalty for adjacent groups
                        } else if (groupGap === 2) {
                            crossGroupPenalty = 0.35; // Medium penalty
                        } else if (groupGap === 3) {
                            crossGroupPenalty = 0.6;  // Heavy penalty
                        } else {
                            crossGroupPenalty = 0.8 + (groupGap - 4) * 0.2; // Escalating penalty for large gaps
                        }

                        cost += crossGroupPenalty;
                        // console.log(`Applied cross-group penalty (${crossGroupPenalty.toFixed(2)}) to ${playerEntry.player.player} (${player1Group.name}) vs ${candidateEntry.player.player} (${player2Group.name}) - gap: ${groupGap}`);
                    }

                    // Add smaller penalty for recent matches (only within same skill group)
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
        // Get skill groups for display
        const resultsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ranks.json'), 'utf8'));
        const allPlayers = [...resultsData.players];
        // Add new players with default ratings for group calculation
        activePlayers.forEach(name => {
            if (!allPlayers.find(p => p.player === name)) {
                const defaultRating = rating();
                allPlayers.push({
                    player: name,
                    rating: { mu: defaultRating.mu, sigma: defaultRating.sigma },
                    ordinal: 0
                });
            }
        });
        const displayGroups = createSkillGroups(allPlayers.filter(p => activePlayers.includes(p.player)));

        const player1Group = getPlayerGroup(match.player1, displayGroups);
        const player2Group = getPlayerGroup(match.player2, displayGroups);

        // Use skill difference rather than group membership for warnings
        // A skill difference > 5 is concerning, regardless of groups
        const isGoodMatch = match.skillDifference <= 5.0;
        const crossGroup = player1Group?.name !== player2Group?.name;

        // Calculate group gap for cross-group matches
        let groupGapInfo = '';
        if (crossGroup && player1Group && player2Group) {
            const player1GroupIndex = displayGroups.findIndex(g => g.name === player1Group.name);
            const player2GroupIndex = displayGroups.findIndex(g => g.name === player2Group.name);
            const groupGap = Math.abs(player1GroupIndex - player2GroupIndex);
            if (groupGap === 1) {
                groupGapInfo = ' (adjacent groups)';
            } else {
                groupGapInfo = ` (${groupGap} groups apart)`;
            }
        }

        console.log(`Match ${index + 1}: ${match.player1} vs ${match.player2} ${isGoodMatch ? '✓' : '⚠️'}`);
        console.log(`  Skill difference: ${match.skillDifference.toFixed(2)}`);
        console.log(`  Average skill: ${match.averageSkill.toFixed(2)}`);
        console.log(`  Match confidence: ${match.confidence.toFixed(2)}`);
        if (player1Group && player2Group) {
            console.log(`  Groups: ${player1Group.name} vs ${player2Group.name}${crossGroup ? groupGapInfo : ''}`);
        }
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
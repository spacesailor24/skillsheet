import { createMatchmaking } from './matchmaking';

describe('createMatchmaking', () => {
    it('should create optimal matches using greedy algorithm', () => {
        const result = createMatchmaking();

        // Basic validations
        expect(result).toHaveProperty('matches');
        expect(result).toHaveProperty('totalActivePlayers');
        expect(result).toHaveProperty('unmatchedPlayers');
        expect(result).toHaveProperty('algorithm');
        expect(result).toHaveProperty('timestamp');

        expect(Array.isArray(result.matches)).toBe(true);
        expect(Array.isArray(result.unmatchedPlayers)).toBe(true);
        expect(result.algorithm).toBe('greedy-optimal');
        expect(typeof result.totalActivePlayers).toBe('number');

        // Ensure no player appears in multiple matches
        const playersInMatches = new Set<string>();
        result.matches.forEach(match => {
            expect(playersInMatches.has(match.player1)).toBe(false);
            expect(playersInMatches.has(match.player2)).toBe(false);
            playersInMatches.add(match.player1);
            playersInMatches.add(match.player2);

            // Ensure players are different
            expect(match.player1).not.toBe(match.player2);

            // Validate match properties
            expect(typeof match.skillDifference).toBe('number');
            expect(typeof match.averageSkill).toBe('number');
            expect(typeof match.confidence).toBe('number');
            expect(match.skillDifference).toBeGreaterThanOrEqual(0);
            expect(match.confidence).toBeGreaterThan(0);
        });

        // Total matched + unmatched should equal total active players
        const totalMatched = result.matches.length * 2;
        expect(totalMatched + result.unmatchedPlayers.length).toBe(result.totalActivePlayers);

        // Matches should be sorted by average skill (descending)
        for (let i = 0; i < result.matches.length - 1; i++) {
            const currentMatch = result.matches[i];
            const nextMatch = result.matches[i + 1];
            if (currentMatch && nextMatch) {
                expect(currentMatch.averageSkill).toBeGreaterThanOrEqual(nextMatch.averageSkill);
            }
        }
    });

    it('should handle edge cases properly', () => {
        // This test ensures the function doesn't crash with various scenarios
        const result = createMatchmaking();

        // Should handle odd number of players
        if (result.totalActivePlayers % 2 === 1) {
            expect(result.unmatchedPlayers.length).toBe(1);
        } else {
            expect(result.unmatchedPlayers.length).toBe(0);
        }
    });
}); 
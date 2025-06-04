import { processMatches } from './index';
import * as fs from 'fs';
import * as path from 'path';

describe('processMatches', () => {
    const resultsPath = path.join(__dirname, '../data/ranks.json');

    beforeEach(() => {
        // Clean up any existing results file
        if (fs.existsSync(resultsPath)) {
            fs.unlinkSync(resultsPath);
        }
    });

    it('should process matches and create results file', () => {
        processMatches();

        // Check that results file was created
        expect(fs.existsSync(resultsPath)).toBe(true);

        // Read and parse the results
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

        // Basic validations
        expect(results).toHaveProperty('players');
        expect(results).toHaveProperty('totalMatches');
        expect(results).toHaveProperty('timestamp');
        expect(Array.isArray(results.players)).toBe(true);
        expect(results.totalMatches).toBe(75);
        expect(results.players.length).toBeGreaterThan(0);

        // Check that players are sorted by ordinal (descending)
        for (let i = 0; i < results.players.length - 1; i++) {
            expect(results.players[i].ordinal).toBeGreaterThanOrEqual(results.players[i + 1].ordinal);
        }

        // Check that each player has required properties
        results.players.forEach((player: any) => {
            expect(player).toHaveProperty('player');
            expect(player).toHaveProperty('rating');
            expect(player).toHaveProperty('ordinal');
            expect(player.rating).toHaveProperty('mu');
            expect(player.rating).toHaveProperty('sigma');
            expect(typeof player.player).toBe('string');
            expect(typeof player.ordinal).toBe('number');
            expect(typeof player.rating.mu).toBe('number');
            expect(typeof player.rating.sigma).toBe('number');
        });
    });
});

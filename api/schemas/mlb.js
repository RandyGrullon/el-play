const { z } = require('zod');

// Basic Types
const TeamSchema = z.object({
    id: z.number(),
    name: z.string(),
    abbreviation: z.string().optional(),
    score: z.number().optional(),
    isWinner: z.boolean().optional()
});

const PlayerSchema = z.object({
    person: z.object({
        id: z.number(),
        fullName: z.string()
    }),
    position: z.object({
        abbreviation: z.string()
    }),
    battingOrder: z.string().optional(),
    stats: z.object({
        batting: z.record(z.any()).optional(),
        pitching: z.record(z.any()).optional()
    }).optional()
});

// Live Game Data Schema
// TODO: Fix schema validation. Currently set to z.any() because of structure mismatches with API response.
const GameDataSchema = z.object({
    gameData: z.any(),
    liveData: z.any()
});

module.exports = {
    GameDataSchema
};

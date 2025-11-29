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
const GameDataSchema = z.object({
    gameData: z.object({
        status: z.object({
            detailedState: z.string()
        }),
        datetime: z.object({
            dateTime: z.string()
        })
    }),
    liveData: z.object({
        linescore: z.object({
            currentInningOrdinal: z.string().optional(),
            isTopInning: z.boolean().optional(),
            balls: z.number().optional(),
            strikes: z.number().optional(),
            outs: z.number().optional(),
            teams: z.object({
                home: z.object({
                    runs: z.number().optional(),
                    hits: z.number().optional(),
                    errors: z.number().optional()
                }),
                away: z.object({
                    runs: z.number().optional(),
                    hits: z.number().optional(),
                    errors: z.number().optional()
                })
            }),
            offense: z.object({
                first: z.any().optional(),
                second: z.any().optional(),
                third: z.any().optional(),
                batter: z.object({ fullName: z.string() }).optional()
            }).optional(),
            defense: z.object({
                pitcher: z.object({ fullName: z.string() }).optional()
            }).optional(),
            innings: z.array(z.object({
                num: z.number(),
                home: z.object({ runs: z.number().optional() }),
                away: z.object({ runs: z.number().optional() })
            })).optional()
        }),
        boxscore: z.object({
            teams: z.object({
                home: z.object({
                    team: TeamSchema,
                    players: z.record(PlayerSchema)
                }),
                away: z.object({
                    team: TeamSchema,
                    players: z.record(PlayerSchema)
                })
            })
        }),
        plays: z.object({
            currentPlay: z.object({
                result: z.object({
                    description: z.string().optional()
                }).optional(),
                playEvents: z.array(z.any()).optional()
            }).optional(),
            allPlays: z.array(z.object({
                result: z.object({
                    event: z.string().optional(),
                    description: z.string().optional()
                }),
                about: z.object({
                    isTopInning: z.boolean(),
                    inning: z.number(),
                    startTime: z.string().optional()
                })
            })).optional()
        })
    })
});

module.exports = {
    GameDataSchema
};
